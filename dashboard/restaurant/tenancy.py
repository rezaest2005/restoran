"""
Multi-tenant infrastructure — Shared database with tenant column
"""
import threading
import logging
from django.db import models

logger = logging.getLogger(__name__)

_context = threading.local()


def get_current_restaurant():
    return getattr(_context, 'restaurant', None)


def set_current_restaurant(restaurant):
    _context.restaurant = restaurant


def clear_current_restaurant():
    _context.restaurant = None


def get_restaurant_from_request(request):
    """استخراج رستوران از request"""
    if not hasattr(request, 'user') or not request.user.is_authenticated:
        return None

    user = request.user

    # ۱. FK مستقیم
    if hasattr(user, 'restaurant_id') and user.restaurant_id:
        return user.restaurant

    # ۲. M2M
    if hasattr(user, 'restaurants'):
        r = user.restaurants.first()
        if r:
            return r

    # ۳. Staff/Superuser fallback
    if user.is_staff or user.is_superuser:
        from restaurant.models import Restaurant
        r = Restaurant.objects.first()
        if r:
            return r

    return None


# ═══════════════════════════════════════
#  ★★★ Middleware — نسخه نهایی ★★★
# ═══════════════════════════════════════

class TenantMiddleware:

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if path.startswith('/static/') or path.startswith('/media/'):
            return self.get_response(request)

        # ★ ذخیره مقدار فعلی
        prev = getattr(_context, 'restaurant', None)

        # ★ تلاش برای تنظیم از request
        restaurant = get_restaurant_from_request(request)
        if restaurant:
            set_current_restaurant(restaurant)

        try:
            return self.get_response(request)
        finally:
            # ★★★ کلید اصلی: همیشه مقدار قبلی رو برگردون ★★★
            # نه clear! نه شرطی! فقط restore.
            _context.restaurant = prev


# ═══════════════════════════════════════
#  Managers
# ═══════════════════════════════════════

class TenantManager(models.Manager):
    use_for_related_fields = True

    def get_queryset(self):
        qs = super().get_queryset()
        restaurant = get_current_restaurant()
        if restaurant:
            return qs.filter(restaurant=restaurant)
        return qs


class AllObjectsManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset()


# ═══════════════════════════════════════
#  Abstract base model
# ═══════════════════════════════════════

class TenantModel(models.Model):
    restaurant = models.ForeignKey(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='+',
        verbose_name='رستوران',
        db_index=True,
    )

    objects     = TenantManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.restaurant_id:
            restaurant = get_current_restaurant()
            if restaurant:
                self.restaurant = restaurant
            else:
                raise ValueError(
                    f"🔴 {self.__class__.__name__}.save(): "
                    f"restaurant مشخص نشده. "
                    f"یا restaurant= بده یا set_current_restaurant() صدا بزن."
                )
        super().save(*args, **kwargs)