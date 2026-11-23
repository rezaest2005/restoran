"""
Applying pushed mutations. Every mutation goes through the EXISTING server logic (the same view the online cashier
calls), so validation, stock, accounting posting, club points, action permissions and the subscription guard are not
re-implemented here. Client totals are never trusted: the order view recomputes prices and totals itself.
"""
import json
import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from ..catalog_services import product_available_stock
from ..features import service_allowed
from ..models import Food
from . import config
from .models import SyncReceipt

logger = logging.getLogger(__name__)

OK, DUPLICATE, CONFLICT, REJECTED, ERROR = "ok", "duplicate", "conflict", "rejected", "error"
INTERNAL_ERROR_TEXT = "خطای داخلی سرور"


class Outcome:
    def __init__(self, status, code="", error="", server_id=None, result=None, details=None):
        self.status, self.code, self.error = status, code, error
        self.server_id, self.result, self.details = server_id, result or {}, details or {}

    def stored(self):
        return {"code": self.code, "error": self.error, "details": self.details, "result": self.result}


def _server_price(food):
    """The price the online path charges (final price, falling back to the base price)."""
    try:
        p = int(food.final_price)
    except (TypeError, ValueError):
        p = 0
    if p <= 0:
        try:
            p = int(food.price)
        except (TypeError, ValueError):
            p = 0
    return p


def _call_create_order(request, payload):
    from ..views.pos.orders import pos_create_order
    req = APIRequestFactory().post("/api/pos/create-order/", payload, format="json")
    force_authenticate(req, user=request.user)
    resp = pos_create_order(req)
    if hasattr(resp, "render"):
        resp.render()
    try:
        body = json.loads(resp.content or b"{}")
    except ValueError:
        body = {}
    return resp.status_code, body


def _order_create(request, business, mut):
    payload = mut.get("payload")
    if not isinstance(payload, dict):
        return Outcome(REJECTED, "invalid", "payload must be an object")
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        return Outcome(REJECTED, "invalid", "هیچ محصولی انتخاب نشده")
    if len(items) > config.MAX_ITEM_LINES:
        return Outcome(REJECTED, "too_many_lines", "تعداد ردیف‌های سفارش بیش از حد مجاز است.")
    if payload.get("defer_payment") or str(payload.get("source") or "pos") != "pos":
        return Outcome(REJECTED, "online_required",
                       "پرداخت با کارتخوان فقط آنلاین ممکن است؛ این سفارش در حالت ناهمگام پذیرفته نمی‌شود.")
    payload = {**payload, "source": "pos"}
    payload.pop("total_price", None)                  # never trusted; the server recomputes
    payload.pop("total", None)

    # structured conflicts the cashier can act on (the view re-checks everything atomically afterwards)
    ids = []
    for it in items:
        if not isinstance(it, dict):
            return Outcome(REJECTED, "invalid", "invalid line")
        try:
            fid = int(it.get("food_id") or it.get("id") or 0)
        except (TypeError, ValueError):
            fid = 0
        ids.append(fid)
    foods = {f.pk: f for f in Food.all_objects.filter(business=business, pk__in=[i for i in ids if i > 0])}
    missing, price_changes, short = [], [], []
    for it, fid in zip(items, ids):
        try:
            qty = int(it.get("quantity", 1))
        except (TypeError, ValueError):
            qty = 1
        if qty <= 0 or fid <= 0:
            continue                                   # a manual line: the view decides, exactly like online
        f = foods.get(fid)
        if f is None:
            missing.append({"food_id": fid, "name": it.get("item_name") or it.get("name") or ""})
            continue
        base = it.get("base_price")
        if base is not None:
            try:
                if int(base) != _server_price(f):
                    price_changes.append({"food_id": fid, "name": f.name, "was": int(base), "now": _server_price(f)})
            except (TypeError, ValueError):
                pass
        avail = product_available_stock(f)
        if Decimal(qty) > avail:
            short.append({"food_id": fid, "name": f.name, "requested": qty, "available": int(avail)})
    if missing:
        return Outcome(CONFLICT, "product_missing", "یک یا چند محصول دیگر وجود ندارد.", details={"lines": missing})
    if price_changes:
        return Outcome(CONFLICT, "price_changed", "قیمت یک یا چند محصول تغییر کرده است.",
                       details={"lines": price_changes})
    if short:
        return Outcome(CONFLICT, "stock", "موجودی کافی نیست.", details={"lines": short})

    status, body = _call_create_order(request, payload)
    if status == 200 and body.get("success"):
        return Outcome(OK, server_id=body.get("order_id"), result=body)
    err = str(body.get("error") or "")
    if status == 403:
        return Outcome(REJECTED, body.get("code") or "permission_denied", err,
                       details={"permission": body.get("permission")})
    if status == 401:
        return Outcome(REJECTED, "unauthorized", err)
    if "موجودی" in err:
        return Outcome(CONFLICT, "stock", err)
    if err.startswith(INTERNAL_ERROR_TEXT) or status >= 500:
        return Outcome(ERROR, "server_error", err)
    return Outcome(REJECTED, "invalid", err or "rejected")


HANDLERS = {"order.create": _order_create}


def _cleanup_pending(rcpt):
    SyncReceipt.objects.filter(pk=rcpt.pk, status=SyncReceipt.PENDING).delete()


def _stored_result(rcpt, base):
    r = rcpt.result or {}
    return {**base, "status": DUPLICATE, "code": rcpt.code, "server_id": rcpt.server_id,
            "result": r.get("result", {}), "details": r.get("details", {}), "error": r.get("error", ""),
            "original_status": rcpt.status}


def apply_one(request, business, mut):
    """Result dict of one mutation: {id, status, code, error, server_id, result, details}."""
    mid = str(mut.get("id") or "")[:64]
    key = str(mut.get("key") or mid)[:100]
    kind = str(mut.get("type") or "")
    ent = str(mut.get("entity_id") or mid)[:64]
    base = {"id": mid, "key": key}
    if not mid or not key:
        return {**base, "status": REJECTED, "code": "invalid", "error": "id is required"}
    handler = HANDLERS.get(kind)
    if handler is None:
        return {**base, "status": REJECTED, "code": "unknown_type", "error": f"unknown mutation type: {kind}"}
    if kind == "order.create" and not service_allowed(request.user, ["pos"]):
        return {**base, "status": REJECTED, "code": "permission_denied", "error": "no access to the POS"}

    rcpt, created = SyncReceipt.objects.get_or_create(
        business=business, key=key, defaults={"kind": kind, "entity_id": ent, "user": request.user})
    if not created:
        if rcpt.status != SyncReceipt.PENDING:
            return _stored_result(rcpt, base)
        if (timezone.now() - rcpt.updated_at).total_seconds() < config.STALE_PENDING_SECONDS:
            return {**base, "status": ERROR, "code": "busy", "error": "same key is being processed"}
        rcpt.save()                                    # stale: take it over
    # the same client UUID under another key (a retry that lost its key) must not create a second order
    twin = SyncReceipt.objects.filter(business=business, kind=kind, entity_id=ent,
                                      status=SyncReceipt.OK).exclude(pk=rcpt.pk).first()
    if twin is not None:
        _cleanup_pending(rcpt)
        return _stored_result(twin, base)
    try:
        with transaction.atomic():
            out = handler(request, business, mut)
            if out.status in (OK, CONFLICT, REJECTED):
                SyncReceipt.objects.filter(pk=rcpt.pk).update(
                    status=out.status, code=out.code, server_id=out.server_id, result=out.stored(),
                    updated_at=timezone.now())
    except Exception:
        logger.exception("sync push: mutation %s failed", mid)
        _cleanup_pending(rcpt)
        return {**base, "status": ERROR, "code": "server_error", "error": "internal error"}
    if out.status == ERROR:
        _cleanup_pending(rcpt)
    return {**base, "status": out.status, "code": out.code, "error": out.error, "server_id": out.server_id,
            "result": out.result, "details": out.details}
