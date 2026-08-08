"""
Multi-tenant infrastructure — Shared database with tenant column

★ نسخه v7 — اصلاح شده

★ v7 تغییرات:
  ۱. AllObjectsManager برگردانده شد (در models.py استفاده میشه)
  ۲. TenantManager حذف شده باقی میموند
"""

import threading
import logging

from django.db import models

logger = logging.getLogger(__name__)

_context = threading.local()

__all__ = [
    'get_current_restaurant', 'set_current_restaurant',
    'clear_current_restaurant',
    'get_restaurant_from_request',
    'TenantMiddleware',
    'TenantModel',
    'AllObjectsManager',
]


# ═══════════════════════════════════════
#  Context helpers
# ═══════════════════════════════════════

def get_current_restaurant():
    """دریافت رستوران فعلی از context محلی thread"""
    return getattr(_context, 'restaurant', None)


def set_current_restaurant(restaurant):
    """تنظیم رستوران فعلی در context محلی thread"""
    _context.restaurant = restaurant


def clear_current_restaurant():
    """پاک کردن رستوران فعلی از context"""
    _context.restaurant = None


# ═══════════════════════════════════════
#  AllObjectsManager — دسترسی بدون فیلتر tenant
# ═══════════════════════════════════════

class AllObjectsManager(models.Manager):
    """
    Manager ساده که فیلتر tenant اعمال نمیکنه.
    برای مواردی مثل signal‌ها که باید بدون فیلتر دسترسی داشته باشن.
    """
    def get_queryset(self):
        return super().get_queryset()


# ═══════════════════════════════════════
#  Resolve restaurant from request
# ═══════════════════════════════════════

def get_restaurant_from_request(request):
    """
    استخراج رستوران از request — ۲ روش:
      ۱. FK مستقیم user.restaurant
      ۲. M2M user.restaurants (اولین فعال)

    ★ FIXED: fallback staff/superuser حذف شد — خطرناک بود
    """
    if not hasattr(request, 'user') or not request.user.is_authenticated:
        return None

    user = request.user

    # ۱. FK مستقیم
    if getattr(user, 'restaurant_id', None):
        return user.restaurant

    # ۲. M2M
    if hasattr(user, 'restaurants'):
        r = user.restaurants.filter(is_active=True).first()
        if r:
            return r

    return None


# ═══════════════════════════════════════
#  Middleware
# ═══════════════════════════════════════

class TenantMiddleware:
    """
    تنظیم خودکار رستوران از request.user.
    ★ الگوی save/restore — همیشه مقدار قبلی برگردانده می‌شود.
    """

    SKIP_PATHS = (
        '/static/', '/media/', '/admin/jsi18n/', '/favicon.ico',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path

        if any(path.startswith(p) for p in self.SKIP_PATHS):
            return self.get_response(request)

        prev = getattr(_context, 'restaurant', None)

        try:
            restaurant = get_restaurant_from_request(request)
            if restaurant:
                set_current_restaurant(restaurant)
            else:
                clear_current_restaurant()

            response = self.get_response(request)
            return response

        finally:
            _context.restaurant = prev


# ═══════════════════════════════════════
#  Abstract base model
# ═══════════════════════════════════════

class TenantModel(models.Model):
    """
    مدل پایه برای تمام مدل‌های multi-tenant.

    ★ فقط save() بررسی میکنه که restaurant ست شده باشه

    Usage:
        class Category(TenantModel):
            name = models.CharField(max_length=200)

        # در view:
        restaurant = _resolve_restaurant(request)
        categories = Category.objects.filter(restaurant=restaurant)
    """

    restaurant = models.ForeignKey(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='+',
        verbose_name='رستوران',
        db_index=True,
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.restaurant_id:
            restaurant = get_current_restaurant()
            if restaurant:
                self.restaurant = restaurant
            else:
                raise ValueError(
                    f"{self.__class__.__name__}.save(): "
                    f"restaurant مشخص نشده. "
                    f"یا restaurant= بدهید "
                    f"یا set_current_restaurant() صدا بزنید."
                )
        super().save(*args, **kwargs)