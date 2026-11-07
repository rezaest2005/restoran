"""
Common — کد مشترک بین همهٔ ماژول‌های views

  • تشخیص کسب‌وکار (tenant) برای درخواست
  • احراز هویت کارکنان (StaffAuth) و کلاس‌های دسترسی سرویس‌ها
  • پارسرهای امن عدد / JSON
  • پاسخ‌های خطای استاندارد
"""
import json
import logging
from decimal import Decimal, InvalidOperation

from functools import wraps

from django.http import Http404, JsonResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated

from ..middleware import TenantJWTAuthentication
from ..models import Business
from ..tenancy import (
    get_current_business,
    get_business_from_request,
    set_current_business,
)
from .decorators import make_service_permission

logger = logging.getLogger(__name__)

ZERO = Decimal("0")


# ═══════════════════════════════════════
#  احراز هویت و دسترسی
# ═══════════════════════════════════════

StaffAuth = [SessionAuthentication, TenantJWTAuthentication]

PosPerm = make_service_permission("pos")
InventoryPerm = make_service_permission("inventory")
UsersPerm = make_service_permission("users")
FeedbackPerm = make_service_permission("feedback")
ClubPerm = make_service_permission("club")
CashierPerm = make_service_permission("club", "pos")
FormulaPerm = make_service_permission("recipes")
ProductionPerm = make_service_permission("kitchen")
MaterialsPerm = make_service_permission("kitchen", "recipes")
DictionaryPerm = IsAuthenticated


# ═══════════════════════════════════════
#  تشخیص کسب‌وکار
# ═══════════════════════════════════════

def resolve_business(request, *, fallback_first_active=False, require_active_user=False):
    """
    کسب‌وکار درخواست را پیدا می‌کند (و در tenant جاری ثبت می‌کند).

    ترتیب: tenant جاری → request.business → tenant از URL/هدر
    → هدر X-Tenant-Slug → کسب‌وکار کاربر لاگین‌شده.

    fallback_first_active: در صورت پیدا نشدن، اولین کسب‌وکار فعال سیستم
        (فقط برای داشبورد/دیکشنری که سوپرادمین هم باید کار کند).
    require_active_user: کسب‌وکار کاربر فقط اگر فعال باشد پذیرفته شود.
    """
    r = get_current_business()
    if r:
        return r

    r = getattr(request, "business", None)
    if r:
        set_current_business(r)
        return r

    r = get_business_from_request(request)
    if r:
        set_current_business(r)
        return r

    headers = getattr(request, "headers", None)
    slug = headers.get("X-Tenant-Slug", "") if headers is not None else ""
    if slug:
        r = Business.objects.filter(slug=slug, is_active=True).first()
        if r:
            set_current_business(r)
            return r

    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        r = getattr(user, "business", None)
        if r is not None and (not require_active_user or getattr(r, "is_active", True)):
            set_current_business(r)
            return r

    if fallback_first_active:
        r = Business.objects.filter(is_active=True).first()
        if r:
            set_current_business(r)
            return r
    return None


def resolve_business_or_first(request):
    """resolve_business با fallback روی اولین کسب‌وکار فعال."""
    return resolve_business(request, fallback_first_active=True)


def resolve_business_active(request):
    """resolve_business که کسب‌وکار کاربر را فقط در حالت فعال می‌پذیرد."""
    return resolve_business(request, require_active_user=True)


def staff_business(request):
    """کسب‌وکار خود کاربر کارمند (اولویت) یا tenant جاری."""
    r = getattr(request.user, "business", None) or get_current_business()
    if r is not None:
        set_current_business(r)
    return r


def get_business_object(model, pk, business):
    """آبجکت متعلق به کسب‌وکار یا None."""
    qs = model.objects.all()
    if business:
        qs = qs.filter(business=business)
    try:
        return qs.get(pk=pk)
    except model.DoesNotExist:
        return None


def get_business_object_or_404(model, pk, business):
    """آبجکت متعلق به کسب‌وکار یا Http404."""
    qs = model.objects.all()
    if business:
        qs = qs.filter(business=business)
    obj = qs.filter(pk=pk).first()
    if obj is None:
        raise Http404
    return obj


# ═══════════════════════════════════════
#  پاسخ‌های خطای استاندارد
# ═══════════════════════════════════════

def no_business_response():
    return JsonResponse(
        {"success": False, "error": "کسب‌وکار مشخص نشده."}, status=400,
    )


# ═══════════════════════════════════════
#  پارسرها
# ═══════════════════════════════════════

def json_body(request):
    """بدنهٔ JSON؛ در صورت خطا {} برمی‌گرداند."""
    try:
        return json.loads(request.body.decode("utf-8"))
    except Exception:
        return {}


def safe_int(val, default=0):
    try:
        return int(float(val or 0))
    except (ValueError, TypeError, InvalidOperation):
        return default


def safe_decimal(val, default=ZERO):
    try:
        return Decimal(str(val))
    except (InvalidOperation, ValueError, TypeError):
        return default


def safe_float(value):
    return float(value) if value is not None else None


def parse_decimal(value, field_name="مقدار", allow_zero=True):
    """Decimal معتبر یا ValueError با پیام فارسی."""
    if value is None or value == "":
        raise ValueError(f"{field_name} الزامی است.")
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{field_name} نامعتبر است.")
    if not allow_zero and d <= 0:
        raise ValueError(f"{field_name} باید بیشتر از صفر باشد.")
    return d


def parse_int(value, default=100, minimum=1, maximum=1000):
    try:
        n = int(value)
    except (ValueError, TypeError):
        return default
    return max(minimum, min(n, maximum))


def client_ip(request):
    return request.META.get("REMOTE_ADDR", "unknown")


def server_error(exc, status=500):
    """
    پاسخ خطای سرور بدون نشت جزئیات داخلی (نام جدول، مسیر فایل، SQL ...).
    جزئیات کامل فقط در لاگ سرور ثبت می‌شود.
    """
    logger.exception("خطای داخلی در ویو: %s", exc)
    return JsonResponse(
        {"success": False, "error": "خطای داخلی سرور. دوباره تلاش کنید."},
        status=status,
    )


def staff_endpoint(methods, *service_codes):
    """
    تبدیل یک view ساده‌ی Django به endpoint امن کارمند:
    احراز هویت (نشست یا JWT)، بررسی دسترسی/ماژول و تعیین کسب‌وکار از روی کاربر.
    بدون ورود → ۴۰۱/۴۰۳؛ بدون کسب‌وکار → ۴۰۰.
    """
    perm = make_service_permission(*service_codes)

    def decorator(fn):
        @wraps(fn)
        def inner(request, *args, **kwargs):
            if staff_business(request) is None:
                return no_business_response()
            return fn(request, *args, **kwargs)

        inner = permission_classes([perm])(inner)
        inner = authentication_classes(StaffAuth)(inner)
        return api_view(methods)(inner)

    return decorator
