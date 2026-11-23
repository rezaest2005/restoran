"""Card terminal payment logic: settings, attempts, results, finalising the order.

Rules that matter:
* one OPEN attempt per order (DB partial unique constraint + order row lock) -> no double charge;
* the amount is ALWAYS taken from the order on the server, never from the client;
* "paid" is only ever set from an approved result of an open attempt (or an explicit manual confirmation by the
  cashier with a trace number); every other outcome leaves the order unpaid;
* an ambiguous outcome (sent, but no clear answer) is `unknown` and is never retried automatically;
* card data: only first6/last4 are kept, nothing is logged.
"""
from __future__ import annotations

import logging
import re
import secrets
from datetime import timedelta

from django.conf import settings as dj_settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from ..models import CardPaymentAttempt, CardTerminalSettings, Order, OrderItem
from . import net
from .adapters import PING_REFERENCE, Target, adapter_choices, get_adapter
from .protocol import (
    APPROVED, CANCELLED, DECLINED, NOT_FOUND, PENDING, REJECTED, TIMEOUT, UNKNOWN, UNREACHABLE, UNITS,
    BridgeResult, attempt_token, clean_id, clean_message, make_reference, to_device_amount, token_ok,
)

logger = logging.getLogger(__name__)

A = CardPaymentAttempt.Status
MODE_SERVER = CardTerminalSettings.Mode.SERVER
MODE_LOCAL = CardTerminalSettings.Mode.LOCAL_BRIDGE
GRACE_SECONDS = 25          # after the configured timeout the cashier's side is declared lost
CREATED_TTL = 120           # an attempt nobody ever sent is closed after this many seconds
MIN_TIMEOUT, MAX_TIMEOUT = 15, 300
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


class CardError(Exception):
    fields: dict = {}

    def __init__(self, code, message, status=400, attempt=None):
        super().__init__(message)
        self.code, self.message, self.status, self.attempt = code, message, status, attempt


# ───────────────────────── settings ─────────────────────────

def _env_defaults() -> dict:
    t = int(getattr(dj_settings, "CARD_READER_TIMEOUT", 90) or 90)
    return {
        "host": str(getattr(dj_settings, "CARD_READER_IP", "127.0.0.1") or "127.0.0.1"),
        "port": int(getattr(dj_settings, "CARD_READER_PORT", 8080) or 8080),
        "timeout_seconds": min(max(t, MIN_TIMEOUT), MAX_TIMEOUT),
    }


def get_settings(business) -> CardTerminalSettings:
    """The business' settings; an unsaved instance filled from the env defaults when it has none."""
    row = CardTerminalSettings.all_objects.filter(business=business).first()
    if row is not None:
        return row
    d = _env_defaults()
    return CardTerminalSettings(business=business, enabled=False, mode=MODE_LOCAL, host=d["host"],
                                port=d["port"], timeout_seconds=d["timeout_seconds"])


def settings_dict(cfg: CardTerminalSettings) -> dict:
    local = cfg.mode == MODE_LOCAL
    return {
        "enabled": bool(cfg.enabled), "mode": cfg.mode, "adapter": cfg.adapter,
        "host": "127.0.0.1" if local else cfg.host, "port": cfg.port,
        "timeout_seconds": cfg.timeout_seconds, "amount_unit": cfg.amount_unit,
        "adapters": [{"code": c, "label": lbl} for c, lbl in adapter_choices()],
        "configured": cfg.pk is not None,
        "loopback_allowed": net.allow_loopback(),
        # what the device receives for 1,000 Toman - shown next to the unit selector
        "example_device_amount": to_device_amount(1000, cfg.amount_unit),
    }


_HOST_RE = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9.\-:]{0,253})$")


def save_settings(business, data: dict) -> CardTerminalSettings:
    errors = {}
    cfg = get_settings(business)
    mode = data.get("mode", cfg.mode)
    if mode not in (MODE_SERVER, MODE_LOCAL):
        errors["mode"] = "invalid"
    adapter = data.get("adapter", cfg.adapter or "http_bridge")
    try:
        get_adapter(adapter)
    except KeyError:
        errors["adapter"] = "invalid"
    unit = data.get("amount_unit", cfg.amount_unit)
    if unit not in UNITS:
        errors["amount_unit"] = "invalid"
    try:
        port = int(data.get("port", cfg.port))
        if not 1 <= port <= 65535:
            raise ValueError
    except (TypeError, ValueError):
        errors["port"] = "invalid"
        port = cfg.port
    try:
        timeout = int(data.get("timeout_seconds", cfg.timeout_seconds))
        if not MIN_TIMEOUT <= timeout <= MAX_TIMEOUT:
            raise ValueError
    except (TypeError, ValueError):
        errors["timeout_seconds"] = "invalid"
        timeout = cfg.timeout_seconds
    host = str(data.get("host", cfg.host) or "").strip()
    if mode == MODE_LOCAL:
        host = "127.0.0.1"                      # the cashier's own PC; the browser calls it
    elif not _HOST_RE.match(host):
        errors["host"] = "invalid"
    else:
        try:                                    # fail early for a literal public address (re-checked on every call)
            import ipaddress
            ip = ipaddress.ip_address(host.strip("[]"))
            if not net.is_allowed_ip(ip):
                errors["host"] = "not_private"
        except ValueError:
            pass                                # a name: resolved and checked when it is used
    if errors:
        err = CardError("invalid_settings", "تنظیمات نامعتبر است.", 400)
        err.fields = errors
        raise err
    cfg.enabled = bool(data.get("enabled", cfg.enabled))
    cfg.mode, cfg.adapter, cfg.host, cfg.port = mode, adapter, host, port
    cfg.timeout_seconds, cfg.amount_unit = timeout, unit
    cfg.business = business
    cfg.save()
    return cfg


def _target(cfg) -> Target:
    return Target(host=cfg.host, port=cfg.port, timeout=cfg.timeout_seconds)


def probe_connection(cfg) -> dict:
    """Server mode only: can THE SERVER reach the bridge? -> {ok, code}."""
    if cfg.mode != MODE_SERVER:
        return {"ok": False, "code": "browser_side"}
    try:
        net.resolve_safe(cfg.host, cfg.port)
    except net.UnsafeAddress:
        return {"ok": False, "code": "not_private"}
    except net.ResolveError:
        return {"ok": False, "code": "dns"}
    ok, http_status = get_adapter(cfg.adapter).probe(_target(cfg), PING_REFERENCE)
    return {"ok": bool(ok), "code": "ok" if ok else "unreachable", "http_status": http_status}


# ───────────────────────── attempts ─────────────────────────

def _now():
    return timezone.now()


def _expiry_seconds(cfg):
    return cfg.timeout_seconds + GRACE_SECONDS


def expires_at(attempt, cfg):
    return (attempt.sent_at or attempt.created_at) + timedelta(seconds=cfg.timeout_seconds)


def refresh_expiry(attempt):
    """Lazily close/downgrade attempts nobody is serving any more. Returns the (possibly reloaded) attempt."""
    if not attempt.is_open:
        return attempt
    now = _now()
    cfg = get_settings(attempt.business)
    if attempt.status == A.CREATED and (now - attempt.created_at).total_seconds() > CREATED_TTL:
        return _close(attempt, A.CANCELLED, message="expired before sending", only_from=(A.CREATED,)) or _reload(attempt)
    if attempt.status == A.SENT and (now - (attempt.sent_at or attempt.created_at)).total_seconds() > _expiry_seconds(cfg):
        with transaction.atomic():
            a = CardPaymentAttempt.all_objects.select_for_update().get(pk=attempt.pk)
            if a.status == A.SENT:
                a.status, a.message = A.UNKNOWN, "no answer in time"
                a.save(update_fields=["status", "message"])
            return a
    return attempt


def _reload(attempt):
    return CardPaymentAttempt.all_objects.get(pk=attempt.pk)


def _close(attempt, status, *, message="", only_from=None):
    with transaction.atomic():
        a = CardPaymentAttempt.all_objects.select_for_update().get(pk=attempt.pk)
        if not a.is_open or (only_from and a.status not in only_from):
            return a
        a.status, a.finished_at = status, _now()
        if message:
            a.message = clean_message(message)
        a.save(update_fields=["status", "finished_at", "message"])
        return a


def open_attempt_of(order):
    a = CardPaymentAttempt.all_objects.filter(order=order, status__in=CardPaymentAttempt.OPEN).first()
    return refresh_expiry(a) if a else None


def start_attempt(business, order_id, user, driver_id=None) -> CardPaymentAttempt:
    cfg = get_settings(business)
    if not cfg.enabled:
        raise CardError("disabled", "کارتخوان برای این کسب‌وکار فعال نیست.", 400)
    with transaction.atomic():
        order = Order.all_objects.select_for_update().filter(business=business, pk=order_id).first()
        if order is None:
            raise CardError("order_not_found", "سفارش پیدا نشد.", 404)
        if order.status == "cancelled" or order.payment_status == "paid":
            raise CardError("order_not_payable", "این سفارش قابل پرداخت نیست (پرداخت‌شده یا لغوشده).", 409)
        existing = open_attempt_of(order)
        if existing is not None:
            raise CardError("attempt_open", "یک پرداخت کارتخوان برای این سفارش در جریان است.", 409, existing)
        amount = int(order.total_price)
        if amount <= 0:
            raise CardError("bad_amount", "مبلغ سفارش نامعتبر است.", 400)
        device_amount = to_device_amount(amount, cfg.amount_unit)
        nonce = secrets.token_hex(16)
        try:
            with transaction.atomic():
                attempt = CardPaymentAttempt.all_objects.create(
                    business=business, order=order, created_by=user if getattr(user, "pk", None) else None,
                    mode=cfg.mode, amount=amount, device_amount=device_amount, amount_unit=cfg.amount_unit,
                    nonce=nonce, driver_id=driver_id or None)
        except IntegrityError:
            raise CardError("attempt_open", "یک پرداخت کارتخوان برای این سفارش در جریان است.", 409,
                            open_attempt_of(order))
        attempt.reference = make_reference(attempt.pk, nonce)
        attempt.save(update_fields=["reference"])
    _log(business, "card.start",
         f"ارسال مبلغ {amount} تومان سفارش #{order.pk} به کارتخوان ({'سرور' if cfg.mode == MODE_SERVER else 'پل محلی'})",
         user, order, {"attempt": attempt.pk, "amount": amount, "mode": cfg.mode})
    return attempt


def run_server_payment(attempt, user=None):
    """server mode: probe -> send the amount -> wait for the answer (blocks up to the configured timeout)."""
    cfg = get_settings(attempt.business)
    adapter = get_adapter(cfg.adapter)
    target = _target(cfg)
    reachable, _ = adapter.probe(target, attempt.reference)
    if not reachable:
        return apply_outcome(attempt, BridgeResult(UNREACHABLE), "pay", user)
    attempt = _mark_sent(attempt)
    if attempt.status != A.SENT:
        return attempt
    res = adapter.pay(target, amount=attempt.device_amount, reference=attempt.reference,
                      description=f"Order {attempt.order_id}")
    return apply_outcome(attempt, res, "pay", user)


def _mark_sent(attempt):
    with transaction.atomic():
        a = CardPaymentAttempt.all_objects.select_for_update().get(pk=attempt.pk)
        if a.status == A.CREATED:
            a.status, a.sent_at = A.SENT, _now()
            a.save(update_fields=["status", "sent_at"])
        return a


def check_status(attempt, user=None):
    """server mode: ask the bridge what happened to this reference."""
    cfg = get_settings(attempt.business)
    res = get_adapter(cfg.adapter).status(_target(cfg), attempt.reference)
    return apply_outcome(attempt, res, "status", user)


def cancel_attempt(attempt, user=None):
    attempt = refresh_expiry(attempt)
    if not attempt.is_open:
        raise CardError("attempt_closed", "این پرداخت دیگر باز نیست.", 409, attempt)
    if attempt.status == A.UNKNOWN:
        raise CardError("attempt_unknown", "نتیجه نامشخص است؛ وضعیت را بررسی کنید یا «پرداخت نشد» را بزنید.", 409, attempt)
    if attempt.status == A.CREATED:
        closed = _close(attempt, A.CANCELLED, message="cancelled by cashier", only_from=(A.CREATED,))
        _log(attempt.business, "card.cancelled", f"پرداخت کارتخوان سفارش #{attempt.order_id} لغو شد", user,
             attempt.order, {"attempt": attempt.pk})
        return closed
    CardPaymentAttempt.all_objects.filter(pk=attempt.pk).update(cancel_requested=True)
    attempt.cancel_requested = True
    if attempt.mode == MODE_SERVER:
        cfg = get_settings(attempt.business)
        get_adapter(cfg.adapter).cancel(_target(cfg), attempt.reference)     # the waiting pay() call returns the outcome
    return _reload(attempt)


# ───────────────────────── results ─────────────────────────

class ResultRejected(Exception):
    """The result does not belong to this attempt (wrong amount / reference). Nothing is changed."""


def _check_echo(attempt, res: BridgeResult):
    if res.amount is not None and res.amount != attempt.device_amount:
        raise ResultRejected("amount")
    if res.rrn and res.rrn != attempt.reference:
        raise ResultRejected("reference")


_STATUS_OF = {APPROVED: A.APPROVED, DECLINED: A.DECLINED, CANCELLED: A.CANCELLED, TIMEOUT: A.TIMEOUT,
              UNREACHABLE: A.UNREACHABLE, REJECTED: A.FAILED}


def apply_outcome(attempt, res: BridgeResult, source: str, user=None, *, reported=False, strict=False):
    """Record a result on an open attempt. Idempotent: a closed attempt is returned unchanged.

    strict=True (browser reports): a mismatching amount/reference raises ResultRejected.
    strict=False (server talked to the bridge itself): a mismatch becomes `unknown` for the cashier to review.
    """
    paid_effects = None
    with transaction.atomic():
        a = CardPaymentAttempt.all_objects.select_for_update().get(pk=attempt.pk)
        if not a.is_open:
            return a
        outcome = res.outcome
        if outcome in (APPROVED, DECLINED, CANCELLED, TIMEOUT):
            try:
                _check_echo(a, res)
            except ResultRejected:
                if strict:
                    raise
                outcome, res = UNKNOWN, BridgeResult(UNKNOWN, message="result does not match the request")
        # a status query / cancel call that cannot answer must not close a waiting attempt
        if source != "pay" and outcome in (UNREACHABLE, REJECTED):
            outcome = UNKNOWN
        # "could not connect" only proves nothing was sent while the amount was never sent
        if outcome == UNREACHABLE and a.status != A.CREATED:
            outcome = UNKNOWN
        a.reported_by_browser = a.reported_by_browser or reported
        if outcome in (PENDING, NOT_FOUND, UNKNOWN):
            if outcome == UNKNOWN and source == "pay":
                a.status = A.UNKNOWN
            a.message = clean_message(res.message or outcome)
            a.save(update_fields=["status", "message", "reported_by_browser"])
        else:
            a.status = _STATUS_OF[outcome]
            a.finished_at = _now()
            a.message = clean_message(res.message)
            if outcome == APPROVED:
                a.trace_number, a.ref_number = res.trace_number, res.ref_number
                a.card_first6, a.card_last4 = res.card_first6, res.card_last4
                paid_effects = _mark_order_paid(a)
            a.save()
        snapshot = a
    _after_apply(snapshot, outcome, source, user, paid_effects)
    return snapshot


def _mark_order_paid(attempt):
    """Inside the attempt's transaction: flip the order to paid by card. Returns True when this call paid it."""
    order = Order.all_objects.select_for_update().get(pk=attempt.order_id)
    if order.payment_status == "paid":
        return False
    order.payment_status, order.payment_method = "paid", "card"
    order.save(update_fields=["payment_status", "payment_method"])
    return True


def _after_apply(a, outcome, source, user, newly_paid):
    order = Order.all_objects.filter(pk=a.order_id).first()
    if outcome == APPROVED:
        if newly_paid:
            finalize_paid_order(order, user, a.driver_id)
            _log(a.business, "card.approved",
                 f"پرداخت کارتخوان سفارش #{a.order_id} تأیید شد — پیگیری {a.trace_number or '-'}", user, order,
                 {"attempt": a.pk, "trace": a.trace_number, "ref": a.ref_number, "amount": int(a.amount),
                  "source": source, "manual": a.resolved_manually})
        else:
            logger.warning("card attempt %s approved but order %s was already paid", a.pk, a.order_id)
            _log(a.business, "card.approved_duplicate",
                 f"تأیید کارتخوان برای سفارش #{a.order_id} که قبلاً پرداخت‌شده بود — بررسی دستی لازم است", user, order,
                 {"attempt": a.pk, "trace": a.trace_number})
    elif outcome in (DECLINED, CANCELLED, TIMEOUT, UNREACHABLE, REJECTED):
        _log(a.business, f"card.{a.status}", f"پرداخت کارتخوان سفارش #{a.order_id}: {a.get_status_display()}", user,
             order, {"attempt": a.pk, "source": source})
    elif outcome == UNKNOWN and source == "pay":
        _log(a.business, "card.unknown", f"نتیجه‌ی پرداخت کارتخوان سفارش #{a.order_id} نامشخص است", user, order,
             {"attempt": a.pk, "source": source})


def report_result(attempt, token, source, response=None, error=None, user=None):
    """local_bridge: the cashier's browser reports what the bridge said (or that it could not talk to it)."""
    if attempt.mode != MODE_LOCAL:
        raise CardError("wrong_mode", "این پرداخت از طریق سرور انجام می‌شود.", 400, attempt)
    expected = attempt_token(attempt.business_id, attempt.pk, attempt.order_id, attempt.device_amount, attempt.nonce)
    if not token_ok(expected, token):
        raise CardError("bad_token", "توکن پرداخت نامعتبر است.", 403)
    attempt = refresh_expiry(attempt)
    if not attempt.is_open:
        raise CardError("attempt_closed", "نتیجه‌ی این پرداخت قبلاً ثبت شده است.", 409, attempt)
    if source == "sent":
        a = _mark_sent(attempt)
        if a.status == A.CREATED:
            raise CardError("attempt_closed", "این پرداخت دیگر باز نیست.", 409, a)
        return a
    if source not in ("pay", "status", "cancel"):
        raise CardError("bad_source", "نوع گزارش نامعتبر است.", 400, attempt)
    if error:
        kind = str(error)[:20]
        if kind == "unreachable" and source == "pay":
            res = BridgeResult(UNREACHABLE)
        else:
            res = BridgeResult(UNKNOWN, message=f"browser: {kind}")
    else:
        from .protocol import normalize_response
        res = normalize_response(response, query=source != "pay")
    try:
        return apply_outcome(attempt, res, source, user, reported=True, strict=True)
    except ResultRejected as exc:
        raise CardError("result_mismatch", "نتیجه با مبلغ/شناسه‌ی این پرداخت نمی‌خواند و رد شد.", 400, attempt) from exc


def resolve_manually(attempt, outcome, trace_number="", ref_number="", user=None):
    """The cashier settles an `unknown` attempt by hand after looking at the device."""
    attempt = refresh_expiry(attempt)
    if attempt.status != A.UNKNOWN:
        raise CardError("not_unknown", "فقط پرداخت با نتیجه‌ی نامشخص را می‌شود دستی مشخص کرد.", 409, attempt)
    if outcome == "paid":
        trace = clean_id(trace_number, 32)
        if len(trace) < 3:
            raise CardError("trace_required", "شماره پیگیری روی رسید دستگاه را وارد کنید.", 400, attempt)
        with transaction.atomic():
            CardPaymentAttempt.all_objects.filter(pk=attempt.pk).update(resolved_manually=True)
        res = BridgeResult(APPROVED, trace_number=trace, ref_number=clean_id(ref_number, 32))
        return apply_outcome(_reload(attempt), res, "manual", user)
    if outcome == "not_paid":
        with transaction.atomic():
            CardPaymentAttempt.all_objects.filter(pk=attempt.pk).update(resolved_manually=True)
        a = _close(attempt, A.CANCELLED, message="cashier: not paid")
        _log(a.business, "card.not_paid", f"صندوقدار پرداخت کارتخوان سفارش #{a.order_id} را «پرداخت نشد» ثبت کرد",
             user, a.order, {"attempt": a.pk})
        return a
    raise CardError("bad_outcome", "گزینه نامعتبر است.", 400, attempt)


# ───────────────────────── order side ─────────────────────────

def finalize_paid_order(order, user=None, driver_id=None):
    """Everything that follows a payment: club points, accounting entry, courier dispatch. Returns the dispatch dict."""
    from .. import events
    user = user if getattr(user, "pk", None) else None
    events.publish("pos_order.paid", order=order, user=user)
    if order.order_type == "delivery" and order.delivery_address:
        return events.first(events.publish(
            "pos_order.dispatch_requested", order=order, driver_id=driver_id, cod=False, user=user,
            skip_if_dispatched=True))
    return None


def dispatch_info(order):
    """Courier hand-over state of a delivery order, in the shape the checkout screen already knows."""
    if order.order_type != "delivery" or not order.delivery_address or order.payment_status != "paid":
        return None
    from ..delivery_services import order_dispatch_state
    return order_dispatch_state(order)


def receipt_payload(order, attempt=None, dispatch=None) -> dict:
    if dispatch is None:
        dispatch = dispatch_info(order)
    items = []
    for oi in OrderItem.all_objects.filter(order_id=order.pk).order_by("id"):
        items.append({"name": oi.item_name, "name_en": oi.item_name_en or "", "quantity": oi.quantity,
                      "price": int(oi.price), "line_total": int(oi.price) * oi.quantity})
    local = timezone.localtime(order.created_at)
    data = {
        "success": True, "order_id": order.pk, "customer_name": order.customer_name,
        "customer_name_en": order.customer_name_en, "total_price": int(order.total_price), "items": items,
        "created_at": local.strftime("%Y-%m-%d %H:%M"), "created_at_iso": local.isoformat(),
        "business_name": order.business.name, "phone": order.phone, "payment_method": order.payment_method,
        "payment_status": order.payment_status, "order_type": order.order_type,
        "delivery_address": order.delivery_address, "dispatch": dispatch,
    }
    if attempt is not None and attempt.status == A.APPROVED:
        data["terminal"] = terminal_receipt(attempt)
    return data


def terminal_receipt(attempt) -> dict:
    """What the customer's receipt shows about the card payment - masked card only."""
    return {"trace_number": attempt.trace_number, "ref_number": attempt.ref_number,
            "card_masked": f"****{attempt.card_last4}" if attempt.card_last4 else "",
            "card_last4": attempt.card_last4, "manual": attempt.resolved_manually}


def attempt_dict(attempt, *, with_bridge=False, with_receipt=False) -> dict:
    attempt = refresh_expiry(attempt)
    cfg = get_settings(attempt.business)
    d = {
        "id": attempt.pk, "order_id": attempt.order_id, "status": attempt.status, "open": attempt.is_open,
        "mode": attempt.mode, "amount": int(attempt.amount), "device_amount": attempt.device_amount,
        "amount_unit": attempt.amount_unit, "cancel_requested": attempt.cancel_requested,
        "message": attempt.message, "trace_number": attempt.trace_number, "ref_number": attempt.ref_number,
        "card_masked": f"****{attempt.card_last4}" if attempt.card_last4 else "",
        "timeout_seconds": cfg.timeout_seconds,
        "expires_at": expires_at(attempt, cfg).isoformat(),
        "server_time": _now().isoformat(),
        "resolved_manually": attempt.resolved_manually,
    }
    if with_bridge and attempt.mode == MODE_LOCAL:
        d["bridge"] = {
            "base_url": f"http://127.0.0.1:{cfg.port}",
            "request": {"amount": attempt.device_amount, "rrn": attempt.reference,
                        "description": f"Order {attempt.order_id}"},
            "token": attempt_token(attempt.business_id, attempt.pk, attempt.order_id, attempt.device_amount,
                                   attempt.nonce),
            "timeout_seconds": cfg.timeout_seconds,
        }
    if with_receipt and attempt.status == A.APPROVED:
        order = Order.all_objects.select_related("business").get(pk=attempt.order_id)
        d["order"] = receipt_payload(order, attempt)
    return d


def _log(business, action, summary, user, order, details):
    from ..activity import log
    log(business, "pos", action, summary, actor=user if getattr(user, "pk", None) else None, target=order,
        details=details)
