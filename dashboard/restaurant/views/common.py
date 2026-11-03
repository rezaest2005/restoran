"""
Common — کد مشترک بین همهٔ ماژول‌های views

  • تشخیص رستوران (tenant) برای درخواست
  • احراز هویت کارکنان (StaffAuth) و کلاس‌های دسترسی سرویس‌ها
  • پارسرهای امن عدد / JSON
  • پاسخ‌های خطای استاندارد
"""
import json
import logging
from decimal import Decimal, InvalidOperation

from django.http import Http404, JsonResponse
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated

from ..middleware import TenantJWTAuthentication
from ..models import Restaurant
from ..tenancy import (
    get_current_restaurant,
    get_restaurant_from_request,
    set_current_restaurant,
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
#  تشخیص رستوران
# ═══════════════════════════════════════

def resolve_restaurant(request, *, fallback_first_active=False, require_active_user=False):
    """
    رستوران درخواست را پیدا می‌کند (و در tenant جاری ثبت می‌کند).

    ترتیب: tenant جاری → request.restaurant → tenant از URL/هدر
    → هدر X-Tenant-Slug → رستوران کاربر لاگین‌شده.

    fallback_first_active: در صورت پیدا نشدن، اولین رستوران فعال سیستم
        (فقط برای داشبورد/دیکشنری که سوپرادمین هم باید کار کند).
    require_active_user: رستوران کاربر فقط اگر فعال باشد پذیرفته شود.
    """
    r = get_current_restaurant()
    if r:
        return r

    r = getattr(request, "restaurant", None)
    if r:
        set_current_restaurant(r)
        return r

    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r

    headers = getattr(request, "headers", None)
    slug = headers.get("X-Tenant-Slug", "") if headers is not None else ""
    if slug:
        r = Restaurant.objects.filter(slug=slug, is_active=True).first()
        if r:
            set_current_restaurant(r)
            return r

    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        r = getattr(user, "restaurant", None)
        if r is not None and (not require_active_user or getattr(r, "is_active", True)):
            set_current_restaurant(r)
            return r

    if fallback_first_active:
        r = Restaurant.objects.filter(is_active=True).first()
        if r:
            set_current_restaurant(r)
            return r
    return None


def resolve_restaurant_or_first(request):
    """resolve_restaurant با fallback روی اولین رستوران فعال."""
    return resolve_restaurant(request, fallback_first_active=True)


def resolve_restaurant_active(request):
    """resolve_restaurant که رستوران کاربر را فقط در حالت فعال می‌پذیرد."""
    return resolve_restaurant(request, require_active_user=True)


def staff_restaurant(request):
    """رستوران خود کاربر کارمند (اولویت) یا tenant جاری."""
    r = getattr(request.user, "restaurant", None) or get_current_restaurant()
    if r is not None:
        set_current_restaurant(r)
    return r


def get_restaurant_object(model, pk, restaurant):
    """آبجکت متعلق به رستوران یا None."""
    qs = model.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    try:
        return qs.get(pk=pk)
    except model.DoesNotExist:
        return None


def get_restaurant_object_or_404(model, pk, restaurant):
    """آبجکت متعلق به رستوران یا Http404."""
    qs = model.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    obj = qs.filter(pk=pk).first()
    if obj is None:
        raise Http404
    return obj


# ═══════════════════════════════════════
#  پاسخ‌های خطای استاندارد
# ═══════════════════════════════════════

def no_restaurant_response():
    return JsonResponse(
        {"success": False, "error": "رستوران مشخص نشده."}, status=400,
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
