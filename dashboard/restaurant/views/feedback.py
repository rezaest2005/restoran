"""
Feedback — ثبت نظرات / گزارش مشکل مشتریان

- submit: عمومی (بدون لاگین) با honeypot و rate-limit
- list / update: برای کارکنان (تب "feedback")
- feedback_page: صفحه مدیریت  |  feedback_form: فرم عمومی مشتری
"""
import logging

from django.core.cache import cache
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from rest_framework import permissions
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import (
    api_view, authentication_classes, permission_classes,
)

from ..middleware import TenantJWTAuthentication
from ..models import Feedback, Restaurant
from ..tenancy import get_current_restaurant, set_current_restaurant
from ..utils import api_error, api_success
from .decorators import make_service_permission, require_service

logger = logging.getLogger(__name__)

FeedbackPerm = make_service_permission("feedback")
StaffAuth = [SessionAuthentication, TenantJWTAuthentication]

MAX_MESSAGE = 2000
RATE_LIMIT = 5
RATE_WINDOW = 600  # ۱۰ دقیقه
LIST_LIMIT = 200


def _client_ip(request):
    return request.META.get("REMOTE_ADDR", "unknown")


# ═══════════════════════════════════════════
#  API عمومی — ثبت نظر
# ═══════════════════════════════════════════

@api_view(["POST"])
@authentication_classes([])          # بدون سشن/JWT → بدون CSRF
@permission_classes([permissions.AllowAny])
def feedback_submit(request):
    data = request.data

    # honeypot: ربات‌ها پر می‌کنند؛ بی‌صدا موفق برمی‌گردانیم
    if str(data.get("website", "")).strip():
        return api_success(message="نظر شما ثبت شد. سپاس از شما.")

    ip = _client_ip(request)
    cache_key = f"feedback_submit:{ip}"
    attempts = cache.get(cache_key, 0)
    if attempts >= RATE_LIMIT:
        return api_error("تعداد ارسال زیاد است. چند دقیقه بعد دوباره تلاش کنید.", status_code=429)

    slug = str(data.get("restaurant_slug", "")).strip()
    restaurant = (
        Restaurant.objects.filter(slug=slug, is_active=True).first() if slug else None
    )
    if restaurant is None:
        return api_error("رستوران یافت نشد.", status_code=404)

    message = str(data.get("message", "")).strip()
    if not message:
        return api_error("متن پیام را وارد کنید.")
    if len(message) > MAX_MESSAGE:
        return api_error(f"متن پیام نباید بیشتر از {MAX_MESSAGE} کاراکتر باشد.")

    category = str(data.get("category", "") or "complaint")
    if category not in dict(Feedback.CATEGORY_CHOICES):
        return api_error("دسته‌بندی نامعتبر است.")

    name = str(data.get("name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    if len(name) > 100:
        return api_error("نام بیش از حد طولانی است.")
    if len(phone) > 20:
        return api_error("شماره تلفن نامعتبر است.")

    cache.set(cache_key, attempts + 1, RATE_WINDOW)

    # رستوران صریحاً ست می‌شود (بدون تکیه بر tenant context)
    Feedback.all_objects.create(
        restaurant=restaurant, category=category, name=name,
        phone=phone, message=message,
    )
    return api_success(message="نظر شما ثبت شد. سپاس از شما.")


# ═══════════════════════════════════════════
#  API کارکنان
# ═══════════════════════════════════════════

def _staff_restaurant(request):
    r = getattr(request.user, "restaurant", None) or get_current_restaurant()
    if r is not None:
        set_current_restaurant(r)
    return r


def _serialize(f):
    return {
        "id": f.id,
        "category": f.category,
        "category_display": f.get_category_display(),
        "name": f.name,
        "phone": f.phone,
        "message": f.message,
        "status": f.status,
        "status_display": f.get_status_display(),
        "admin_note": f.admin_note,
        "created_at": f.created_at.isoformat(),
        "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
    }


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([FeedbackPerm])
def feedback_list(request):
    restaurant = _staff_restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.", status_code=400)

    qs = Feedback.objects.filter(restaurant=restaurant)
    st = request.query_params.get("status")
    if st in dict(Feedback.STATUS_CHOICES):
        qs = qs.filter(status=st)
    cat = request.query_params.get("category")
    if cat in dict(Feedback.CATEGORY_CHOICES):
        qs = qs.filter(category=cat)

    items = [_serialize(f) for f in qs.order_by("-created_at")[:LIST_LIMIT]]
    return api_success(data=items)


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([FeedbackPerm])
def feedback_update(request, pk):
    restaurant = _staff_restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.", status_code=400)

    fb = get_object_or_404(Feedback.objects.filter(restaurant=restaurant), pk=pk)

    new_status = request.data.get("status")
    if new_status is not None:
        if new_status not in dict(Feedback.STATUS_CHOICES):
            return api_error("وضعیت نامعتبر است.")
        fb.status = new_status
        fb.resolved_at = timezone.now() if new_status == "resolved" else None

    note = request.data.get("admin_note")
    if note is not None:
        fb.admin_note = str(note)[:MAX_MESSAGE]

    fb.save()
    return api_success(data=_serialize(fb), message="ذخیره شد.")


# ═══════════════════════════════════════════
#  صفحات HTML
# ═══════════════════════════════════════════

@require_service("feedback")
def feedback_page(request):
    return render(request, "restaurant/feedback.html")


def feedback_form(request, slug):
    """فرم عمومی مشتری — بدون لاگین"""
    restaurant = Restaurant.objects.filter(slug=slug, is_active=True).first()
    if restaurant is None:
        return render(request, "restaurant/feedback_form.html", {"restaurant": None}, status=404)
    return render(request, "restaurant/feedback_form.html", {
        "restaurant": restaurant,
        "categories": Feedback.CATEGORY_CHOICES,
    })
