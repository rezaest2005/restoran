"""
Payment System — کارت‌خوان + درگاه آنلاین
"""

import json
import requests as http_requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from ..models import (
    PaymentGatewayConfig,
    CardTerminalConfig,
    PaymentTransaction,
    Tenant,
)

# ═══════════════════════════════════════
# Helper
# ═══════════════════════════════════════


def _get_tenant(request):
    tid = request.session.get("tenant_id") or request.session.get("restaurant_id")
    if tid:
        try:
            return Tenant.objects.get(id=tid)
        except Tenant.DoesNotExist:
            pass
    if hasattr(request.user, "tenant"):
        return request.user.tenant
    return None


# ═══════════════════════════════════════
# Payment Config API
# ═══════════════════════════════════════


@csrf_exempt
def payment_config_api(request):
    """GET → لیست تنظیمات | POST → ساخت/ویرایش"""
    tenant = _get_tenant(request)
    if not tenant:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    if request.method == "GET":
        gateways = list(
            PaymentGatewayConfig.objects.filter(tenant=tenant).values(
                "id",
                "gateway_type",
                "title",
                "merchant_id",
                "callback_url",
                "is_active",
                "is_sandbox",
            )
        )
        terminals = list(
            CardTerminalConfig.objects.filter(tenant=tenant).values(
                "id",
                "name",
                "ip_address",
                "port",
                "protocol",
                "terminal_id",
                "merchant_id",
                "api_path",
                "is_active",
            )
        )
        return JsonResponse({"gateways": gateways, "terminals": terminals})

    if request.method == "POST":
        data = json.loads(request.body)
        kind = data.get("type")

        if kind == "gateway":
            oid = data.get("id")
            obj = (
                PaymentGatewayConfig.objects.filter(id=oid, tenant=tenant).first()
                if oid
                else None
            )
            if not obj:
                obj = PaymentGatewayConfig(tenant=tenant)
            obj.gateway_type = data.get("gateway_type", "zarinpal")
            obj.title = data.get("title", "")
            obj.merchant_id = data.get("merchant_id", "")
            obj.api_key = data.get("api_key", "")
            obj.callback_url = data.get("callback_url", "")
            obj.is_active = data.get("is_active", True)
            obj.is_sandbox = data.get("is_sandbox", True)
            obj.save()
            return JsonResponse({"ok": True, "id": obj.id})

        if kind == "terminal":
            oid = data.get("id")
            obj = (
                CardTerminalConfig.objects.filter(id=oid, tenant=tenant).first()
                if oid
                else None
            )
            if not obj:
                obj = CardTerminalConfig(tenant=tenant)
            obj.name = data.get("name", "کارت‌خوان")
            obj.ip_address = data.get("ip_address", "")
            obj.port = data.get("port", 8080)
            obj.protocol = data.get("protocol", "http")
            obj.terminal_id = data.get("terminal_id", "")
            obj.merchant_id = data.get("merchant_id", "")
            obj.api_path = data.get("api_path", "/api/v1/pay")
            obj.is_active = data.get("is_active", True)
            obj.save()
            return JsonResponse({"ok": True, "id": obj.id})

    return JsonResponse({"error": "Bad request"}, status=400)


@csrf_exempt
def payment_config_delete(request):
    """POST → حذف تنظیم"""
    tenant = _get_tenant(request)
    if not tenant:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    data = json.loads(request.body)
    kind, oid = data.get("type"), data.get("id")

    if kind == "gateway":
        PaymentGatewayConfig.objects.filter(id=oid, tenant=tenant).delete()
    elif kind == "terminal":
        CardTerminalConfig.objects.filter(id=oid, tenant=tenant).delete()

    return JsonResponse({"ok": True})


@csrf_exempt
def test_payment_connection(request):
    """POST → تست اتصال"""
    tenant = _get_tenant(request)
    if not tenant:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    data = json.loads(request.body)
    kind, cid = data.get("type"), data.get("id")

    # ── تست کارت‌خوان ──
    if kind == "terminal":
        try:
            t = CardTerminalConfig.objects.get(id=cid, tenant=tenant)
            url = f"{t.base_url}/api/v1/status"
            r = http_requests.get(url, timeout=5)
            return JsonResponse(
                {"ok": True, "message": f"اتصال برقرار (کد {r.status_code})"}
            )
        except CardTerminalConfig.DoesNotExist:
            return JsonResponse({"ok": False, "message": "دستگاه یافت نشد"})
        except http_requests.ConnectionError:
            return JsonResponse(
                {"ok": False, "message": "عدم اتصال — IP و پورت را بررسی کنید"}
            )
        except http_requests.Timeout:
            return JsonResponse({"ok": False, "message": "زمان اتصال تمام شد"})
        except Exception as e:
            return JsonResponse({"ok": False, "message": str(e)})

    # ── تست درگاه آنلاین ──
    if kind == "gateway":
        try:
            g = PaymentGatewayConfig.objects.get(id=cid, tenant=tenant)

            if g.gateway_type == "zarinpal":
                urls = _zarinpal_urls(g.is_sandbox)
                r = http_requests.post(
                    urls["request"],
                    json={
                        "merchant_id": g.merchant_id,
                        "amount": 1000,
                        "callback_url": g.callback_url or "https://example.com/cb",
                        "description": "تست اتصال",
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=10,
                )
                res = r.json()
                code = res.get("data", {}).get("code")
                if code == 100:
                    return JsonResponse(
                        {"ok": True, "message": "اتصال به زرین‌پال برقرار است"}
                    )
                else:
                    return JsonResponse(
                        {"ok": False, "message": f"خطا: {res.get('errors')}"}
                    )

            return JsonResponse(
                {"ok": False, "message": "تست این درگاه پشتیبانی نمی‌شود"}
            )
        except Exception as e:
            return JsonResponse({"ok": False, "message": str(e)})

    return JsonResponse({"error": "Bad request"}, status=400)


# ═══════════════════════════════════════
# Card Reader Payment
# ═══════════════════════════════════════


@csrf_exempt
def payment_card_pay(request):
    """POST → ارسال پرداخت به کارت‌خوان"""
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    tenant = _get_tenant(request)
    if not tenant:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    data = json.loads(request.body)
    terminal_id = data.get("terminal_id")
    amount = data.get("amount", 0)
    order_id = data.get("order_id")

    try:
        terminal = CardTerminalConfig.objects.get(
            id=terminal_id, tenant=tenant, is_active=True
        )
    except CardTerminalConfig.DoesNotExist:
        return JsonResponse({"error": "دستگاه یافت نشد"}, status=404)

    txn = PaymentTransaction.objects.create(
        tenant=tenant,
        method="card_reader",
        amount=amount,
        status="processing",
        terminal=terminal,
        order_id=order_id,
    )

    try:
        url = f"{terminal.base_url}{terminal.api_path}"
        r = http_requests.post(
            url,
            json={
                "amount": amount,
                "transaction_id": str(txn.id),
                "terminal_id": terminal.terminal_id,
                "merchant_id": terminal.merchant_id,
            },
            timeout=120,
        )
        result = r.json()

        ok = (
            result.get("success")
            or result.get("status") == "success"
            or result.get("code") == 0
        )

        if ok:
            txn.status = "success"
            txn.rrn = result.get("rrn", result.get("reference", ""))
            pan = result.get("pan", result.get("card", ""))
            txn.card_last_four = pan[-4:] if pan else result.get("card_last_four", "")
            txn.trace_number = result.get("trace_number", result.get("trace", ""))
            txn.completed_at = timezone.now()
            if txn.order:
                txn.order.payment_method = "card"
                txn.order.save()
        else:
            txn.status = "failed"
            txn.error_message = result.get("message", result.get("error", "ناموفق"))

        txn.save()

        return JsonResponse(
            {
                "ok": txn.status == "success",
                "transaction_id": txn.id,
                "status": txn.status,
                "rrn": txn.rrn,
                "card_last_four": txn.card_last_four,
                "error": txn.error_message if txn.status == "failed" else None,
            }
        )

    except http_requests.ConnectionError:
        txn.status = "failed"
        txn.error_message = "عدم اتصال به دستگاه کارت‌خوان"
        txn.save()
        return JsonResponse(
            {"ok": False, "error": txn.error_message, "transaction_id": txn.id}
        )
    except http_requests.Timeout:
        txn.status = "failed"
        txn.error_message = "زمان انتظار تمام شد (۱۲۰ ثانیه)"
        txn.save()
        return JsonResponse(
            {"ok": False, "error": txn.error_message, "transaction_id": txn.id}
        )
    except Exception as e:
        txn.status = "failed"
        txn.error_message = str(e)
        txn.save()
        return JsonResponse({"ok": False, "error": str(e), "transaction_id": txn.id})


@csrf_exempt
def payment_card_cancel(request):
    """POST → لغو پرداخت کارت‌خوان"""
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    tenant = _get_tenant(request)
    if not tenant:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    data = json.loads(request.body)
    txn_id = data.get("transaction_id")

    try:
        txn = PaymentTransaction.objects.get(
            id=txn_id, tenant=tenant, status="processing"
        )
        if txn.terminal:
            try:
                http_requests.post(
                    f"{txn.terminal.base_url}/api/v1/cancel",
                    json={"transaction_id": str(txn.id)},
                    timeout=10,
                )
            except Exception:
                pass
        txn.status = "cancelled"
        txn.completed_at = timezone.now()
        txn.save()
        return JsonResponse({"ok": True, "status": "cancelled"})
    except PaymentTransaction.DoesNotExist:
        return JsonResponse({"error": "یافت نشد"}, status=404)


# ═══════════════════════════════════════
# Online Payment — ZarinPal
# ═══════════════════════════════════════


def _zarinpal_urls(sandbox=True):
    if sandbox:
        return {
            "request": "https://sandbox.zarinpal.com/pg/v4/payment/request.json",
            "verify": "https://sandbox.zarinpal.com/pg/v4/payment/verify.json",
            "pay": "https://sandbox.zarinpal.com/pg/StartPay/{authority}",
        }
    return {
        "request": "https://api.zarinpal.com/pg/v4/payment/request.json",
        "verify": "https://api.zarinpal.com/pg/v4/payment/verify.json",
        "pay": "https://www.zarinpal.com/pg/StartPay/{authority}",
    }


@csrf_exempt
def payment_online_create(request):
    """POST → ساخت درخواست پرداخت آنلاین"""
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    tenant = _get_tenant(request)
    if not tenant:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    data = json.loads(request.body)
    gateway_id = data.get("gateway_id")
    amount = data.get("amount", 0)
    order_id = data.get("order_id")
    description = data.get("description", f"پرداخت سفارش #{order_id}")
    callback_url = data.get("callback_url", "")

    gw = None
    if gateway_id:
        gw = PaymentGatewayConfig.objects.filter(
            id=gateway_id, tenant=tenant, is_active=True
        ).first()
    if not gw:
        gw = PaymentGatewayConfig.objects.filter(tenant=tenant, is_active=True).first()
    if not gw:
        return JsonResponse({"error": "درگاه پرداخت تنظیم نشده"}, status=404)

    txn = PaymentTransaction.objects.create(
        tenant=tenant,
        method="online",
        amount=amount,
        status="pending",
        gateway=gw,
        order_id=order_id,
        description=description,
    )

    if gw.gateway_type == "zarinpal":
        return _zarinpal_request(txn, gw, callback_url or gw.callback_url, description)

    return JsonResponse(
        {"error": f"درگاه {gw.gateway_type} پشتیبانی نمی‌شود"}, status=501
    )


def _zarinpal_request(txn, gw, callback_url, description):
    if not callback_url:
        return JsonResponse({"error": "callback_url الزامی است"}, status=400)

    urls = _zarinpal_urls(gw.is_sandbox)

    try:
        r = http_requests.post(
            urls["request"],
            json={
                "merchant_id": gw.merchant_id,
                "amount": txn.amount,
                "callback_url": callback_url,
                "description": description,
            },
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        res = r.json()

        if res.get("data", {}).get("code") == 100:
            authority = res["data"]["authority"]
            txn.authority = authority
            txn.status = "processing"
            txn.save()
            return JsonResponse(
                {
                    "ok": True,
                    "transaction_id": txn.id,
                    "payment_url": urls["pay"].format(authority=authority),
                    "authority": authority,
                }
            )
        else:
            err = res.get("errors", "خطای درگاه")
            txn.status = "failed"
            txn.error_message = str(err)
            txn.save()
            return JsonResponse(
                {"ok": False, "error": str(err), "transaction_id": txn.id}
            )
    except Exception as e:
        txn.status = "failed"
        txn.error_message = str(e)
        txn.save()
        return JsonResponse({"ok": False, "error": str(e)})


@csrf_exempt
def zarinpal_callback(request):
    """GET → بازگشت از زرین‌پال"""
    authority = request.GET.get("Authority", "")
    status = request.GET.get("Status", "")

    if not authority:
        return JsonResponse({"error": "Authority نامعتبر"}, status=400)

    txn = PaymentTransaction.objects.filter(authority=authority).first()
    if not txn:
        return JsonResponse({"error": "تراکنش یافت نشد"}, status=404)

    gw = txn.gateway
    if not gw:
        return JsonResponse({"error": "درگاه یافت نشد"}, status=404)

    if status != "OK":
        txn.status = "cancelled"
        txn.error_message = "پرداخت لغو شد"
        txn.completed_at = timezone.now()
        txn.save()
        return JsonResponse(
            {
                "ok": False,
                "status": "cancelled",
                "transaction_id": txn.id,
                "message": "پرداخت لغو شد",
            }
        )

    urls = _zarinpal_urls(gw.is_sandbox)

    try:
        r = http_requests.post(
            urls["verify"],
            json={
                "merchant_id": gw.merchant_id,
                "amount": txn.amount,
                "authority": authority,
            },
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        res = r.json()
        code = res.get("data", {}).get("code")

        if code in (100, 101):
            txn.status = "success"
            txn.ref_id = str(res["data"].get("ref_id", ""))
            pan = res["data"].get("card_pan", "")
            txn.card_last_four = pan[-4:] if pan else ""
            txn.completed_at = timezone.now()
            txn.save()
            if txn.order:
                txn.order.payment_method = "online"
                txn.order.save()
            return JsonResponse(
                {
                    "ok": True,
                    "status": "success",
                    "ref_id": txn.ref_id,
                    "transaction_id": txn.id,
                }
            )
        else:
            txn.status = "failed"
            txn.error_message = f"کد خطا: {code}"
            txn.completed_at = timezone.now()
            txn.save()
            return JsonResponse(
                {
                    "ok": False,
                    "status": "failed",
                    "error": txn.error_message,
                    "transaction_id": txn.id,
                }
            )
    except Exception as e:
        txn.status = "failed"
        txn.error_message = str(e)
        txn.completed_at = timezone.now()
        txn.save()
        return JsonResponse({"ok": False, "error": str(e)})


# ═══════════════════════════════════════
# Transaction Status & List
# ═══════════════════════════════════════


@csrf_exempt
def payment_transaction_status(request):
    """GET → بررسی وضعیت تراکنش"""
    tenant = _get_tenant(request)
    if not tenant:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    txn_id = request.GET.get("transaction_id")
    try:
        t = PaymentTransaction.objects.get(id=txn_id, tenant=tenant)
        return JsonResponse(
            {
                "ok": True,
                "transaction_id": t.id,
                "status": t.status,
                "method": t.method,
                "amount": t.amount,
                "rrn": t.rrn,
                "ref_id": t.ref_id,
                "card_last_four": t.card_last_four,
                "error": t.error_message if t.status == "failed" else None,
            }
        )
    except PaymentTransaction.DoesNotExist:
        return JsonResponse({"error": "یافت نشد"}, status=404)


@csrf_exempt
def payment_transactions_list(request):
    """GET → لیست تراکنش‌ها"""
    tenant = _get_tenant(request)
    if not tenant:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    qs = PaymentTransaction.objects.filter(tenant=tenant)

    method = request.GET.get("method")
    if method:
        qs = qs.filter(method=method)

    date = request.GET.get("date")
    if date:
        qs = qs.filter(created_at__date=date)

    txns = list(
        qs[:100].values(
            "id",
            "method",
            "amount",
            "status",
            "rrn",
            "ref_id",
            "card_last_four",
            "error_message",
            "created_at",
            "completed_at",
        )
    )
    for t in txns:
        t["created_at"] = (
            t["created_at"].strftime("%Y-%m-%d %H:%M") if t["created_at"] else ""
        )
        t["completed_at"] = (
            t["completed_at"].strftime("%Y-%m-%d %H:%M") if t["completed_at"] else ""
        )

    return JsonResponse({"transactions": txns})
