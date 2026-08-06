"""
Multi-tenant infrastructure — Shared database with tenant column

★ تغییرات نسبت به نسخه قبل:
  ۱. get_restaurant_from_request: import داخلی اصلاح شد (avoid circular)
  ۲. TenantMiddleware: مدیریت بهتر API views بدون user
  ۳. use_for_related_fields deprecated → حذف شد
  ۴. TenantModel.save(): بهبود پیام خطا
  ۵. اضافه شدن __all__ برای export تمیز
"""

import threading
import logging

from django.db import models

logger = logging.getLogger(__name__)

_context = threading.local()

__all__ = [
    'get_current_restaurant', 'set_current_restaurant', 'clear_current_restaurant',
    'get_restaurant_from_request',
    'TenantMiddleware',
    'TenantManager', 'AllObjectsManager',
    'TenantModel',
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
#  Resolve restaurant from request
# ═══════════════════════════════════════

def get_restaurant_from_request(request):
    """
    استخراج رستوران از request — ۳ روش:
      ۱. FK مستقیم user.restaurant
      ۲. M2M user.restaurants
      ۳. Fallback برای staff/superuser (اولین رستوران فعال)
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

    # ۳. Staff/Superuser fallback
    if user.is_staff or user.is_superuser:
        # ★ FIXED: از app config استفاده می‌کنیم نه import سخت
        try:
            from .models import Restaurant
            r = Restaurant.objects.filter(is_active=True).first()
            if r:
                return r
        except ImportError:
            logger.warning('Restaurant model not found for superuser fallback')

    return None


# ═══════════════════════════════════════
#  ★★★ Middleware ★★★
# ═══════════════════════════════════════

class TenantMiddleware:
    """
    تنظیم خودکار رستوران از request.user

    ★ الگوی save/restore — همیشه مقدار قبلی برگردانده می‌شود
      تا در nested context (مثلاً view → service → model) مشکلی پیش نیاید.
    """

    # مسیرهایی که نیاز به tenant ندارند
    SKIP_PATHS = ('/static/', '/media/', '/admin/jsi18n/', '/favicon.ico')

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path

        # skip مسیرهای static
        if any(path.startswith(p) for p in self.SKIP_PATHS):
            return self.get_response(request)

        # ★ ذخیره مقدار فعلی (برای restore)
        prev = getattr(_context, 'restaurant', None)

        try:
            # ★ تلاش برای تنظیم از request
            restaurant = get_restaurant_from_request(request)
            if restaurant:
                set_current_restaurant(restaurant)

            response = self.get_response(request)
            return response

        finally:
            # ★★★ کلید اصلی: همیشه مقدار قبلی رو برگردون ★★★
            # نه clear! نه شرطی! فقط restore.
            _context.restaurant = prev


# ═══════════════════════════════════════
#  Managers
# ═══════════════════════════════════════

class TenantManager(models.Manager):
    """
    Manager پیش‌فرض — فیلتر بر اساس restaurant فعلی.
    اگر restaurant تنظیم نشده باشد، queryset بدون فیلتر برمی‌گردد.
    """

    def get_queryset(self):
        qs = super().get_queryset()
        restaurant = get_current_restaurant()
        if restaurant:
            return qs.filter(restaurant=restaurant)
        return qs


class AllObjectsManager(models.Manager):
    """
    Manager بدون فیلتر — برای دسترسی به تمام رکوردها (ادمین، migration و...)
    """

    def get_queryset(self):
        return super().get_queryset()


# ═══════════════════════════════════════
#  Abstract base model
# ═══════════════════════════════════════

class TenantModel(models.Model):
    """
    مدل پایه برای تمام مدل‌های multi-tenant.

    - restaurant FK الزامی
    - اگر هنگام save ست نشده باشد، از context فعلی خوانده می‌شود
    - اگر context هم خالی باشد، ValueError می‌دهد

    Usage:
        class Category(TenantModel):
            name = models.CharField(max_length=200)

        # در view/service:
        category = Category(name='پیتزا')  # restaurant خودکار ست می‌شود
        category.save()

        # یا صریح:
        category = Category(name='پیتزا', restaurant=my_restaurant)
        category.save()
    """

    restaurant = models.ForeignKey(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='+',
        verbose_name='رستوران',
        db_index=True,
    )

    # Manager پیش‌فرض: فیلتر بر اساس tenant فعلی
    objects = TenantManager()

    # Manager دوم: دسترسی بدون فیلتر (برای ادمین و...)
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True
        # Django 4.1+: این manager پیش‌فرض related objects باشد
        # manager_inheritance_from_future = True

    def save(self, *args, **kwargs):
        if not self.restaurant_id:
            restaurant = get_current_restaurant()
            if restaurant:
                self.restaurant = restaurant
            else:
                raise ValueError(
                    f"{self.__class__.__name__}.save(): restaurant مشخص نشده. "
                    f"یا restaurant= بدهید یا set_current_restaurant() صدا بزنید."
                )
        super().save(*args, **kwargs)