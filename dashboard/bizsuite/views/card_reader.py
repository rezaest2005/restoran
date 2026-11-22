"""
Card terminal (کارتخوان) API - /api/card-reader/...

* settings   GET (any POS user) / PUT (owner, manager - needs the pos_settings tab)
* test       POST - can the SERVER reach the bridge (server mode)
* pay        POST {order_id, driver_id?} - open ONE attempt for the order; server mode sends the amount to the
             bridge and waits for the answer, local_bridge mode returns the request + HMAC token for the browser
* attempts/?order_id=       GET    newest attempt of an order
* attempts/<id>/            GET    state of one attempt
* attempts/<id>/check/      POST   ask the bridge for the status (server mode)
* attempts/<id>/cancel/     POST
* attempts/<id>/report/     POST   local_bridge: the browser reports what the bridge answered
* attempts/<id>/resolve/    POST   unknown outcome: cashier says paid (with trace number) / not paid

Every query is business-scoped; the amount always comes from the order, never from the request.
See docs/CARD_READER.md.
"""
import logging

from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes

from ..activity import log as activity_log
from ..card_terminal import services as svc
from ..card_terminal.services import CardError
from ..models import CardPaymentAttempt
from .common import PosPerm, no_business_response, resolve_business

logger = logging.getLogger(__name__)

MANAGER_ROLES = {"owner", "manager"}


def _err(exc: CardError):
    body = {"success": False, "code": exc.code, "error": exc.message}
    if exc.fields:
        body["fields"] = exc.fields
    if exc.attempt is not None:
        body["attempt"] = svc.attempt_dict(exc.attempt, with_bridge=False)
    return JsonResponse(body, status=exc.status)


def _can_configure(user) -> bool:
    return bool(user.is_authenticated and (user.is_superuser or getattr(user, "role", "") in MANAGER_ROLES))


def _attempt_or_404(business, pk):
    a = CardPaymentAttempt.all_objects.filter(business=business, pk=pk).select_related("order").first()
    if a is None:
        raise CardError("not_found", "پرداخت پیدا نشد.", 404)
    return a


def _ok(attempt, **kw):
    return JsonResponse({"success": True, "attempt": svc.attempt_dict(attempt, with_receipt=True, **kw)})


@api_view(["GET", "PUT"])
@permission_classes([PosPerm])
def card_settings(request):
    business = resolve_business(request)
    if not business:
        return no_business_response()
    if request.method == "PUT":
        if not _can_configure(request.user):
            return JsonResponse({"success": False, "code": "forbidden",
                                 "error": "فقط مالک یا مدیر می‌تواند تنظیمات کارتخوان را تغییر دهد."}, status=403)
        data = request.data if isinstance(request.data, dict) else {}
        try:
            cfg = svc.save_settings(business, data)
        except CardError as exc:
            return _err(exc)
        activity_log(business, "pos", "card.settings",
                     f"تنظیمات کارتخوان تغییر کرد ({'فعال' if cfg.enabled else 'غیرفعال'}، "
                     f"{'سرور' if cfg.mode == 'server' else 'پل محلی'})",
                     actor=request.user, request=request,
                     details={"enabled": cfg.enabled, "mode": cfg.mode, "port": cfg.port,
                              "timeout": cfg.timeout_seconds, "unit": cfg.amount_unit})
    else:
        cfg = svc.get_settings(business)
    out = svc.settings_dict(cfg)
    out["can_edit"] = _can_configure(request.user)
    return JsonResponse({"success": True, "settings": out})


@api_view(["POST"])
@permission_classes([PosPerm])
def card_test(request):
    business = resolve_business(request)
    if not business:
        return no_business_response()
    if not _can_configure(request.user):
        return JsonResponse({"success": False, "code": "forbidden", "error": "دسترسی ندارید."}, status=403)
    return JsonResponse({"success": True, "result": svc.probe_connection(svc.get_settings(business))})


@api_view(["POST"])
@permission_classes([PosPerm])
def card_pay(request):
    business = resolve_business(request)
    if not business:
        return no_business_response()
    try:
        order_id = int(request.data.get("order_id"))
    except (TypeError, ValueError):
        return JsonResponse({"success": False, "code": "bad_order", "error": "شناسه‌ی سفارش نامعتبر است."}, status=400)
    try:
        driver_id = int(request.data.get("driver_id") or 0) or None
    except (TypeError, ValueError):
        driver_id = None
    try:
        attempt = svc.start_attempt(business, order_id, request.user, driver_id)
        if attempt.mode == svc.MODE_SERVER:
            attempt = svc.run_server_payment(attempt, request.user)
        return _ok(attempt, with_bridge=True)
    except CardError as exc:
        return _err(exc)
    except Exception:
        logger.exception("card payment failed unexpectedly")      # never log the request/response bodies
        return JsonResponse({"success": False, "code": "server_error",
                             "error": "خطای داخلی؛ وضعیت پرداخت را بررسی کنید."}, status=500)


@api_view(["GET"])
@permission_classes([PosPerm])
def card_attempt_latest(request):
    """The newest attempt of an order (the checkout screen uses it to follow a payment it lost the answer of)."""
    business = resolve_business(request)
    if not business:
        return no_business_response()
    try:
        order_id = int(request.GET.get("order_id"))
    except (TypeError, ValueError):
        return JsonResponse({"success": False, "code": "bad_order", "error": "شناسه‌ی سفارش نامعتبر است."}, status=400)
    a = CardPaymentAttempt.all_objects.filter(business=business, order_id=order_id).order_by("-id").first()
    if a is None:
        return JsonResponse({"success": True, "attempt": None})
    return _ok(a, with_bridge=True)


@api_view(["GET"])
@permission_classes([PosPerm])
def card_attempt(request, attempt_id):
    business = resolve_business(request)
    if not business:
        return no_business_response()
    try:
        return _ok(_attempt_or_404(business, attempt_id), with_bridge=True)
    except CardError as exc:
        return _err(exc)


@api_view(["POST"])
@permission_classes([PosPerm])
def card_check(request, attempt_id):
    business = resolve_business(request)
    if not business:
        return no_business_response()
    try:
        a = svc.refresh_expiry(_attempt_or_404(business, attempt_id))
        if a.mode != svc.MODE_SERVER:
            raise CardError("wrong_mode", "وضعیت این پرداخت را مرورگر صندوق از پل محلی می‌پرسد.", 400, a)
        if not a.is_open:
            return _ok(a)
        return _ok(svc.check_status(a, request.user))
    except CardError as exc:
        return _err(exc)


@api_view(["POST"])
@permission_classes([PosPerm])
def card_cancel(request, attempt_id):
    business = resolve_business(request)
    if not business:
        return no_business_response()
    try:
        return _ok(svc.cancel_attempt(_attempt_or_404(business, attempt_id), request.user))
    except CardError as exc:
        return _err(exc)


@api_view(["POST"])
@permission_classes([PosPerm])
def card_report(request, attempt_id):
    business = resolve_business(request)
    if not business:
        return no_business_response()
    d = request.data if isinstance(request.data, dict) else {}
    try:
        a = _attempt_or_404(business, attempt_id)
        out = svc.report_result(a, d.get("token"), str(d.get("source") or "pay"),
                                response=d.get("response"), error=d.get("error"), user=request.user)
        return _ok(out)
    except CardError as exc:
        return _err(exc)


@api_view(["POST"])
@permission_classes([PosPerm])
def card_resolve(request, attempt_id):
    business = resolve_business(request)
    if not business:
        return no_business_response()
    d = request.data if isinstance(request.data, dict) else {}
    try:
        a = _attempt_or_404(business, attempt_id)
        out = svc.resolve_manually(a, str(d.get("outcome") or ""), str(d.get("trace_number") or ""),
                                   str(d.get("ref_number") or ""), request.user)
        return _ok(out)
    except CardError as exc:
        return _err(exc)
