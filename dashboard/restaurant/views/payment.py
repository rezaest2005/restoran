"""
Payment System — کارت‌خوان + درگاه آنلاین
"""

import json
import requests as http_requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from ..models import (
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
# [COMMENTED] def payment_config_api(request):
# [COMMENTED]     """GET → لیست تنظیمات | POST → ساخت/ویرایش"""
# [COMMENTED]     tenant = _get_tenant(request)
# [COMMENTED]     if not tenant:
# [COMMENTED]         return JsonResponse({"error": "Unauthorized"}, status=401)
# [COMMENTED] 
# [COMMENTED]     if request.method == "GET":
# [COMMENTED]         gateways = list(
# [X] # [COMMENTED]             PaymentGatewayConfig.objects.filter(tenant=tenant).values(
# [COMMENTED]                 "id",
# [COMMENTED]                 "gateway_type",
# [COMMENTED]                 "title",
# [COMMENTED]                 "merchant_id",
# [COMMENTED]                 "callback_url",
# [COMMENTED]                 "is_active",
# [COMMENTED]                 "is_sandbox",
# [COMMENTED]             )
# [COMMENTED]         )
# [COMMENTED]         terminals = list(
# [X] # [COMMENTED]             CardTerminalConfig.objects.filter(tenant=tenant).values(
# [COMMENTED]                 "id",
# [COMMENTED]                 "name",
# [COMMENTED]                 "ip_address",
# [COMMENTED]                 "port",
# [COMMENTED]                 "protocol",
# [COMMENTED]                 "terminal_id",
# [COMMENTED]                 "merchant_id",
# [COMMENTED]                 "api_path",
# [COMMENTED]                 "is_active",
# [COMMENTED]             )
# [COMMENTED]         )
# [COMMENTED]         return JsonResponse({"gateways": gateways, "terminals": terminals})
# [COMMENTED] 
# [COMMENTED]     if request.method == "POST":
# [COMMENTED]         data = json.loads(request.body)
# [COMMENTED]         kind = data.get("type")
# [COMMENTED] 
# [COMMENTED]         if kind == "gateway":
# [COMMENTED]             oid = data.get("id")
# [COMMENTED]             obj = (
# [X] # [COMMENTED]                 PaymentGatewayConfig.objects.filter(id=oid, tenant=tenant).first()
# [COMMENTED]                 if oid
# [COMMENTED]                 else None
# [COMMENTED]             )
# [COMMENTED]             if not obj:
# [X] # [COMMENTED]                 obj = PaymentGatewayConfig(tenant=tenant)
# [COMMENTED]             obj.gateway_type = data.get("gateway_type", "zarinpal")
# [COMMENTED]             obj.title = data.get("title", "")
# [COMMENTED]             obj.merchant_id = data.get("merchant_id", "")
# [COMMENTED]             obj.api_key = data.get("api_key", "")
# [COMMENTED]             obj.callback_url = data.get("callback_url", "")
# [COMMENTED]             obj.is_active = data.get("is_active", True)
# [COMMENTED]             obj.is_sandbox = data.get("is_sandbox", True)
# [COMMENTED]             obj.save()
# [COMMENTED]             return JsonResponse({"ok": True, "id": obj.id})
# [COMMENTED] 
# [COMMENTED]         if kind == "terminal":
# [COMMENTED]             oid = data.get("id")
# [COMMENTED]             obj = (
# [X] # [COMMENTED]                 CardTerminalConfig.objects.filter(id=oid, tenant=tenant).first()
# [COMMENTED]                 if oid
# [COMMENTED]                 else None
# [COMMENTED]             )
# [COMMENTED]             if not obj:
# [X] # [COMMENTED]                 obj = CardTerminalConfig(tenant=tenant)
# [COMMENTED]             obj.name = data.get("name", "کارت‌خوان")
# [COMMENTED]             obj.ip_address = data.get("ip_address", "")
# [COMMENTED]             obj.port = data.get("port", 8080)
# [COMMENTED]             obj.protocol = data.get("protocol", "http")
# [COMMENTED]             obj.terminal_id = data.get("terminal_id", "")
# [COMMENTED]             obj.merchant_id = data.get("merchant_id", "")
# [COMMENTED]             obj.api_path = data.get("api_path", "/api/v1/pay")
# [COMMENTED]             obj.is_active = data.get("is_active", True)
# [COMMENTED]             obj.save()
# [COMMENTED]             return JsonResponse({"ok": True, "id": obj.id})
# [COMMENTED] 
# [COMMENTED]     return JsonResponse({"error": "Bad request"}, status=400)
# [COMMENTED] 
# [COMMENTED] 
@csrf_exempt
# [COMMENTED] def payment_config_delete(request):
# [COMMENTED]     """POST → حذف تنظیم"""
# [COMMENTED]     tenant = _get_tenant(request)
# [COMMENTED]     if not tenant:
# [COMMENTED]         return JsonResponse({"error": "Unauthorized"}, status=401)
# [COMMENTED] 
# [COMMENTED]     data = json.loads(request.body)
# [COMMENTED]     kind, oid = data.get("type"), data.get("id")
# [COMMENTED] 
# [COMMENTED]     if kind == "gateway":
# [X] # [COMMENTED]         PaymentGatewayConfig.objects.filter(id=oid, tenant=tenant).delete()
# [COMMENTED]     elif kind == "terminal":
# [X] # [COMMENTED]         CardTerminalConfig.objects.filter(id=oid, tenant=tenant).delete()
# [COMMENTED] 
# [COMMENTED]     return JsonResponse({"ok": True})
# [COMMENTED] 
# [COMMENTED] 
@csrf_exempt
# [COMMENTED] def test_payment_connection(request):
# [COMMENTED]     """POST → تست اتصال"""
# [COMMENTED]     tenant = _get_tenant(request)
# [COMMENTED]     if not tenant:
# [COMMENTED]         return JsonResponse({"error": "Unauthorized"}, status=401)
# [COMMENTED] 
# [COMMENTED]     data = json.loads(request.body)
# [COMMENTED]     kind, cid = data.get("type"), data.get("id")
# [COMMENTED] 
# [COMMENTED]     # ── تست کارت‌خوان ──
# [COMMENTED]     if kind == "terminal":
# [COMMENTED]         try:
# [X] # [COMMENTED]             t = CardTerminalConfig.objects.get(id=cid, tenant=tenant)
# [COMMENTED]             url = f"{t.base_url}/api/v1/status"
# [COMMENTED]             r = http_requests.get(url, timeout=5)
# [COMMENTED]             return JsonResponse(
# [COMMENTED]                 {"ok": True, "message": f"اتصال برقرار (کد {r.status_code})"}
# [COMMENTED]             )
# [X] # [COMMENTED]         except CardTerminalConfig.DoesNotExist:
# [COMMENTED]             return JsonResponse({"ok": False, "message": "دستگاه یافت نشد"})
# [COMMENTED]         except http_requests.ConnectionError:
# [COMMENTED]             return JsonResponse(
# [COMMENTED]                 {"ok": False, "message": "عدم اتصال — IP و پورت را بررسی کنید"}
# [COMMENTED]             )
# [COMMENTED]         except http_requests.Timeout:
# [COMMENTED]             return JsonResponse({"ok": False, "message": "زمان اتصال تمام شد"})
# [COMMENTED]         except Exception as e:
# [COMMENTED]             return JsonResponse({"ok": False, "message": str(e)})
# [COMMENTED] 
# [COMMENTED]     # ── تست درگاه آنلاین ──
# [COMMENTED]     if kind == "gateway":
# [COMMENTED]         try:
# [X] # [COMMENTED]             g = PaymentGatewayConfig.objects.get(id=cid, tenant=tenant)
# [COMMENTED] 
# [COMMENTED]             if g.gateway_type == "zarinpal":
# [COMMENTED]                 urls = _zarinpal_urls(g.is_sandbox)
# [COMMENTED]                 r = http_requests.post(
# [COMMENTED]                     urls["request"],
# [COMMENTED]                     json={
# [COMMENTED]                         "merchant_id": g.merchant_id,
# [COMMENTED]                         "amount": 1000,
# [COMMENTED]                         "callback_url": g.callback_url or "https://example.com/cb",
# [COMMENTED]                         "description": "تست اتصال",
# [COMMENTED]                     },
# [COMMENTED]                     headers={"Content-Type": "application/json"},
# [COMMENTED]                     timeout=10,
# [COMMENTED]                 )
# [COMMENTED]                 res = r.json()
# [COMMENTED]                 code = res.get("data", {}).get("code")
# [COMMENTED]                 if code == 100:
# [COMMENTED]                     return JsonResponse(
# [COMMENTED]                         {"ok": True, "message": "اتصال به زرین‌پال برقرار است"}
# [COMMENTED]                     )
# [COMMENTED]                 else:
# [COMMENTED]                     return JsonResponse(
# [COMMENTED]                         {"ok": False, "message": f"خطا: {res.get('errors')}"}
# [COMMENTED]                     )
# [COMMENTED] 
# [COMMENTED]             return JsonResponse(
# [COMMENTED]                 {"ok": False, "message": "تست این درگاه پشتیبانی نمی‌شود"}
# [COMMENTED]             )
# [COMMENTED]         except Exception as e:
# [COMMENTED]             return JsonResponse({"ok": False, "message": str(e)})
# [COMMENTED] 
# [COMMENTED]     return JsonResponse({"error": "Bad request"}, status=400)
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ═══════════════════════════════════════
# [COMMENTED] # Card Reader Payment
# [COMMENTED] # ═══════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
@csrf_exempt
# [COMMENTED] def payment_card_pay(request):
# [COMMENTED]     """POST → ارسال پرداخت به کارت‌خوان"""
# [COMMENTED]     if request.method != "POST":
# [COMMENTED]         return JsonResponse({"error": "POST required"}, status=405)
# [COMMENTED] 
# [COMMENTED]     tenant = _get_tenant(request)
# [COMMENTED]     if not tenant:
# [COMMENTED]         return JsonResponse({"error": "Unauthorized"}, status=401)
# [COMMENTED] 
# [COMMENTED]     data = json.loads(request.body)
# [COMMENTED]     terminal_id = data.get("terminal_id")
# [COMMENTED]     amount = data.get("amount", 0)
# [COMMENTED]     order_id = data.get("order_id")
# [COMMENTED] 
# [COMMENTED]     try:
# [X] # [COMMENTED]         terminal = CardTerminalConfig.objects.get(
# [COMMENTED]             id=terminal_id, tenant=tenant, is_active=True
# [COMMENTED]         )
# [X] # [COMMENTED]     except CardTerminalConfig.DoesNotExist:
# [COMMENTED]         return JsonResponse({"error": "دستگاه یافت نشد"}, status=404)
# [COMMENTED] 
# [X] # [COMMENTED]     txn = PaymentTransaction.objects.create(
# [COMMENTED]         tenant=tenant,
# [COMMENTED]         method="card_reader",
# [COMMENTED]         amount=amount,
# [COMMENTED]         status="processing",
# [COMMENTED]         terminal=terminal,
# [COMMENTED]         order_id=order_id,
# [COMMENTED]     )
# [COMMENTED] 
# [COMMENTED]     try:
# [COMMENTED]         url = f"{terminal.base_url}{terminal.api_path}"
# [COMMENTED]         r = http_requests.post(
# [COMMENTED]             url,
# [COMMENTED]             json={
# [COMMENTED]                 "amount": amount,
# [COMMENTED]                 "transaction_id": str(txn.id),
# [COMMENTED]                 "terminal_id": terminal.terminal_id,
# [COMMENTED]                 "merchant_id": terminal.merchant_id,
# [COMMENTED]             },
# [COMMENTED]             timeout=120,
# [COMMENTED]         )
# [COMMENTED]         result = r.json()
# [COMMENTED] 
# [COMMENTED]         ok = (
# [COMMENTED]             result.get("success")
# [COMMENTED]             or result.get("status") == "success"
# [COMMENTED]             or result.get("code") == 0
# [COMMENTED]         )
# [COMMENTED] 
# [COMMENTED]         if ok:
# [COMMENTED]             txn.status = "success"
# [COMMENTED]             txn.rrn = result.get("rrn", result.get("reference", ""))
# [COMMENTED]             pan = result.get("pan", result.get("card", ""))
# [COMMENTED]             txn.card_last_four = pan[-4:] if pan else result.get("card_last_four", "")
# [COMMENTED]             txn.trace_number = result.get("trace_number", result.get("trace", ""))
# [COMMENTED]             txn.completed_at = timezone.now()
# [COMMENTED]             if txn.order:
# [COMMENTED]                 txn.order.payment_method = "card"
# [COMMENTED]                 txn.order.save()
# [COMMENTED]         else:
# [COMMENTED]             txn.status = "failed"
# [COMMENTED]             txn.error_message = result.get("message", result.get("error", "ناموفق"))
# [COMMENTED] 
# [COMMENTED]         txn.save()
# [COMMENTED] 
# [COMMENTED]         return JsonResponse(
# [COMMENTED]             {
# [COMMENTED]                 "ok": txn.status == "success",
# [COMMENTED]                 "transaction_id": txn.id,
# [COMMENTED]                 "status": txn.status,
# [COMMENTED]                 "rrn": txn.rrn,
# [COMMENTED]                 "card_last_four": txn.card_last_four,
# [COMMENTED]                 "error": txn.error_message if txn.status == "failed" else None,
# [COMMENTED]             }
# [COMMENTED]         )
# [COMMENTED] 
# [COMMENTED]     except http_requests.ConnectionError:
# [COMMENTED]         txn.status = "failed"
# [COMMENTED]         txn.error_message = "عدم اتصال به دستگاه کارت‌خوان"
# [COMMENTED]         txn.save()
# [COMMENTED]         return JsonResponse(
# [COMMENTED]             {"ok": False, "error": txn.error_message, "transaction_id": txn.id}
# [COMMENTED]         )
# [COMMENTED]     except http_requests.Timeout:
# [COMMENTED]         txn.status = "failed"
# [COMMENTED]         txn.error_message = "زمان انتظار تمام شد (۱۲۰ ثانیه)"
# [COMMENTED]         txn.save()
# [COMMENTED]         return JsonResponse(
# [COMMENTED]             {"ok": False, "error": txn.error_message, "transaction_id": txn.id}
# [COMMENTED]         )
# [COMMENTED]     except Exception as e:
# [COMMENTED]         txn.status = "failed"
# [COMMENTED]         txn.error_message = str(e)
# [COMMENTED]         txn.save()
# [COMMENTED]         return JsonResponse({"ok": False, "error": str(e), "transaction_id": txn.id})
# [COMMENTED] 
# [COMMENTED] 
@csrf_exempt
# [COMMENTED] def payment_card_cancel(request):
# [COMMENTED]     """POST → لغو پرداخت کارت‌خوان"""
# [COMMENTED]     if request.method != "POST":
# [COMMENTED]         return JsonResponse({"error": "POST required"}, status=405)
# [COMMENTED] 
# [COMMENTED]     tenant = _get_tenant(request)
# [COMMENTED]     if not tenant:
# [COMMENTED]         return JsonResponse({"error": "Unauthorized"}, status=401)
# [COMMENTED] 
# [COMMENTED]     data = json.loads(request.body)
# [COMMENTED]     txn_id = data.get("transaction_id")
# [COMMENTED] 
# [COMMENTED]     try:
# [X] # [COMMENTED]         txn = PaymentTransaction.objects.get(
# [COMMENTED]             id=txn_id, tenant=tenant, status="processing"
# [COMMENTED]         )
# [COMMENTED]         if txn.terminal:
# [COMMENTED]             try:
# [COMMENTED]                 http_requests.post(
# [COMMENTED]                     f"{txn.terminal.base_url}/api/v1/cancel",
# [COMMENTED]                     json={"transaction_id": str(txn.id)},
# [COMMENTED]                     timeout=10,
# [COMMENTED]                 )
# [COMMENTED]             except Exception:
# [COMMENTED]                 pass
# [COMMENTED]         txn.status = "cancelled"
# [COMMENTED]         txn.completed_at = timezone.now()
# [COMMENTED]         txn.save()
# [COMMENTED]         return JsonResponse({"ok": True, "status": "cancelled"})
# [X] # [COMMENTED]     except PaymentTransaction.DoesNotExist:
# [COMMENTED]         return JsonResponse({"error": "یافت نشد"}, status=404)
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ═══════════════════════════════════════
# [COMMENTED] # Online Payment — ZarinPal
# [COMMENTED] # ═══════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
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
# [COMMENTED] def payment_online_create(request):
# [COMMENTED]     """POST → ساخت درخواست پرداخت آنلاین"""
# [COMMENTED]     if request.method != "POST":
# [COMMENTED]         return JsonResponse({"error": "POST required"}, status=405)
# [COMMENTED] 
# [COMMENTED]     tenant = _get_tenant(request)
# [COMMENTED]     if not tenant:
# [COMMENTED]         return JsonResponse({"error": "Unauthorized"}, status=401)
# [COMMENTED] 
# [COMMENTED]     data = json.loads(request.body)
# [COMMENTED]     gateway_id = data.get("gateway_id")
# [COMMENTED]     amount = data.get("amount", 0)
# [COMMENTED]     order_id = data.get("order_id")
# [COMMENTED]     description = data.get("description", f"پرداخت سفارش #{order_id}")
# [COMMENTED]     callback_url = data.get("callback_url", "")
# [COMMENTED] 
# [COMMENTED]     gw = None
# [COMMENTED]     if gateway_id:
# [X] # [COMMENTED]         gw = PaymentGatewayConfig.objects.filter(
# [COMMENTED]             id=gateway_id, tenant=tenant, is_active=True
# [COMMENTED]         ).first()
# [COMMENTED]     if not gw:
# [X] # [COMMENTED]         gw = PaymentGatewayConfig.objects.filter(tenant=tenant, is_active=True).first()
# [COMMENTED]     if not gw:
# [COMMENTED]         return JsonResponse({"error": "درگاه پرداخت تنظیم نشده"}, status=404)
# [COMMENTED] 
# [X] # [COMMENTED]     txn = PaymentTransaction.objects.create(
# [COMMENTED]         tenant=tenant,
# [COMMENTED]         method="online",
# [COMMENTED]         amount=amount,
# [COMMENTED]         status="pending",
# [COMMENTED]         gateway=gw,
# [COMMENTED]         order_id=order_id,
# [COMMENTED]         description=description,
# [COMMENTED]     )
# [COMMENTED] 
# [COMMENTED]     if gw.gateway_type == "zarinpal":
# [COMMENTED]         return _zarinpal_request(txn, gw, callback_url or gw.callback_url, description)
# [COMMENTED] 
# [COMMENTED]     return JsonResponse(
# [COMMENTED]         {"error": f"درگاه {gw.gateway_type} پشتیبانی نمی‌شود"}, status=501
# [COMMENTED]     )
# [COMMENTED] 
# [COMMENTED] 
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
# [COMMENTED] def zarinpal_callback(request):
# [COMMENTED]     """GET → بازگشت از زرین‌پال"""
# [COMMENTED]     authority = request.GET.get("Authority", "")
# [COMMENTED]     status = request.GET.get("Status", "")
# [COMMENTED] 
# [COMMENTED]     if not authority:
# [COMMENTED]         return JsonResponse({"error": "Authority نامعتبر"}, status=400)
# [COMMENTED] 
# [X] # [COMMENTED]     txn = PaymentTransaction.objects.filter(authority=authority).first()
# [COMMENTED]     if not txn:
# [COMMENTED]         return JsonResponse({"error": "تراکنش یافت نشد"}, status=404)
# [COMMENTED] 
# [COMMENTED]     gw = txn.gateway
# [COMMENTED]     if not gw:
# [COMMENTED]         return JsonResponse({"error": "درگاه یافت نشد"}, status=404)
# [COMMENTED] 
# [COMMENTED]     if status != "OK":
# [COMMENTED]         txn.status = "cancelled"
# [COMMENTED]         txn.error_message = "پرداخت لغو شد"
# [COMMENTED]         txn.completed_at = timezone.now()
# [COMMENTED]         txn.save()
# [COMMENTED]         return JsonResponse(
# [COMMENTED]             {
# [COMMENTED]                 "ok": False,
# [COMMENTED]                 "status": "cancelled",
# [COMMENTED]                 "transaction_id": txn.id,
# [COMMENTED]                 "message": "پرداخت لغو شد",
# [COMMENTED]             }
# [COMMENTED]         )
# [COMMENTED] 
# [COMMENTED]     urls = _zarinpal_urls(gw.is_sandbox)
# [COMMENTED] 
# [COMMENTED]     try:
# [COMMENTED]         r = http_requests.post(
# [COMMENTED]             urls["verify"],
# [COMMENTED]             json={
# [COMMENTED]                 "merchant_id": gw.merchant_id,
# [COMMENTED]                 "amount": txn.amount,
# [COMMENTED]                 "authority": authority,
# [COMMENTED]             },
# [COMMENTED]             headers={"Content-Type": "application/json"},
# [COMMENTED]             timeout=30,
# [COMMENTED]         )
# [COMMENTED]         res = r.json()
# [COMMENTED]         code = res.get("data", {}).get("code")
# [COMMENTED] 
# [COMMENTED]         if code in (100, 101):
# [COMMENTED]             txn.status = "success"
# [COMMENTED]             txn.ref_id = str(res["data"].get("ref_id", ""))
# [COMMENTED]             pan = res["data"].get("card_pan", "")
# [COMMENTED]             txn.card_last_four = pan[-4:] if pan else ""
# [COMMENTED]             txn.completed_at = timezone.now()
# [COMMENTED]             txn.save()
# [COMMENTED]             if txn.order:
# [COMMENTED]                 txn.order.payment_method = "online"
# [COMMENTED]                 txn.order.save()
# [COMMENTED]             return JsonResponse(
# [COMMENTED]                 {
# [COMMENTED]                     "ok": True,
# [COMMENTED]                     "status": "success",
# [COMMENTED]                     "ref_id": txn.ref_id,
# [COMMENTED]                     "transaction_id": txn.id,
# [COMMENTED]                 }
# [COMMENTED]             )
# [COMMENTED]         else:
# [COMMENTED]             txn.status = "failed"
# [COMMENTED]             txn.error_message = f"کد خطا: {code}"
# [COMMENTED]             txn.completed_at = timezone.now()
# [COMMENTED]             txn.save()
# [COMMENTED]             return JsonResponse(
# [COMMENTED]                 {
# [COMMENTED]                     "ok": False,
# [COMMENTED]                     "status": "failed",
# [COMMENTED]                     "error": txn.error_message,
# [COMMENTED]                     "transaction_id": txn.id,
# [COMMENTED]                 }
# [COMMENTED]             )
# [COMMENTED]     except Exception as e:
# [COMMENTED]         txn.status = "failed"
# [COMMENTED]         txn.error_message = str(e)
# [COMMENTED]         txn.completed_at = timezone.now()
# [COMMENTED]         txn.save()
# [COMMENTED]         return JsonResponse({"ok": False, "error": str(e)})
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ═══════════════════════════════════════
# [COMMENTED] # Transaction Status & List
# [COMMENTED] # ═══════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
@csrf_exempt
# [COMMENTED] def payment_transaction_status(request):
# [COMMENTED]     """GET → بررسی وضعیت تراکنش"""
# [COMMENTED]     tenant = _get_tenant(request)
# [COMMENTED]     if not tenant:
# [COMMENTED]         return JsonResponse({"error": "Unauthorized"}, status=401)
# [COMMENTED] 
# [COMMENTED]     txn_id = request.GET.get("transaction_id")
# [COMMENTED]     try:
# [X] # [COMMENTED]         t = PaymentTransaction.objects.get(id=txn_id, tenant=tenant)
# [COMMENTED]         return JsonResponse(
# [COMMENTED]             {
# [COMMENTED]                 "ok": True,
# [COMMENTED]                 "transaction_id": t.id,
# [COMMENTED]                 "status": t.status,
# [COMMENTED]                 "method": t.method,
# [COMMENTED]                 "amount": t.amount,
# [COMMENTED]                 "rrn": t.rrn,
# [COMMENTED]                 "ref_id": t.ref_id,
# [COMMENTED]                 "card_last_four": t.card_last_four,
# [COMMENTED]                 "error": t.error_message if t.status == "failed" else None,
# [COMMENTED]             }
# [COMMENTED]         )
# [X] # [COMMENTED]     except PaymentTransaction.DoesNotExist:
# [COMMENTED]         return JsonResponse({"error": "یافت نشد"}, status=404)
# [COMMENTED] 
# [COMMENTED] 
@csrf_exempt
# [COMMENTED] def payment_transactions_list(request):
# [COMMENTED]     """GET → لیست تراکنش‌ها"""
# [COMMENTED]     tenant = _get_tenant(request)
# [COMMENTED]     if not tenant:
# [COMMENTED]         return JsonResponse({"error": "Unauthorized"}, status=401)
# [COMMENTED] 
# [X] # [COMMENTED]     qs = PaymentTransaction.objects.filter(tenant=tenant)
# [COMMENTED] 
# [COMMENTED]     method = request.GET.get("method")
# [COMMENTED]     if method:
# [COMMENTED]         qs = qs.filter(method=method)
# [COMMENTED] 
# [COMMENTED]     date = request.GET.get("date")
# [COMMENTED]     if date:
# [COMMENTED]         qs = qs.filter(created_at__date=date)
# [COMMENTED] 
# [COMMENTED]     txns = list(
# [COMMENTED]         qs[:100].values(
# [COMMENTED]             "id",
# [COMMENTED]             "method",
# [COMMENTED]             "amount",
# [COMMENTED]             "status",
# [COMMENTED]             "rrn",
# [COMMENTED]             "ref_id",
# [COMMENTED]             "card_last_four",
# [COMMENTED]             "error_message",
# [COMMENTED]             "created_at",
# [COMMENTED]             "completed_at",
# [COMMENTED]         )
# [COMMENTED]     )
# [COMMENTED]     for t in txns:
# [COMMENTED]         t["created_at"] = (
# [COMMENTED]             t["created_at"].strftime("%Y-%m-%d %H:%M") if t["created_at"] else ""
# [COMMENTED]         )
# [COMMENTED]         t["completed_at"] = (
# [COMMENTED]             t["completed_at"].strftime("%Y-%m-%d %H:%M") if t["completed_at"] else ""
# [COMMENTED]         )
# [COMMENTED] 
# [COMMENTED]     return JsonResponse({"transactions": txns})
# [COMMENTED] 