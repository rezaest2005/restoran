"""
Multi-tenant infrastructure — Shared database with tenant column
"""
import threading
from django.db import models

# ═══════════════════════════════════════════
#  Thread-local storage for current restaurant
# ═══════════════════════════════════════════

_context = threading.local()


def get_current_restaurant():
    return getattr(_context, 'restaurant', None)


def set_current_restaurant(restaurant):
    _context.restaurant = restaurant


def clear_current_restaurant():
    _context.restaurant = None


# ═══════════════════════════════════════════
#  Managers
# ═══════════════════════════════════════════

class TenantManager(models.Manager):
    """فقط داده‌های رستوران فعلی رو برمی‌گردونه"""
    use_for_related_fields = True

    def get_queryset(self):
        qs = super().get_queryset()
        restaurant = get_current_restaurant()
        if restaurant:
            return qs.filter(restaurant=restaurant)
        return qs  # admin/management commands: بدون فیلتر


class AllObjectsManager(models.Manager):
    """بدون فیلتر — برای ادمین و دستورات مدیریتی"""
    def get_queryset(self):
        return super().get_queryset()


# ═══════════════════════════════════════════
#  Abstract base model for tenant-aware models
# ═══════════════════════════════════════════

class TenantModel(models.Model):
    restaurant = models.ForeignKey(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='+',
        verbose_name='رستوران',
        db_index=True,
    )

    objects      = TenantManager()
    all_objects  = AllObjectsManager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.restaurant_id:
            restaurant = get_current_restaurant()
            if restaurant:
                self.restaurant = restaurant
        super().save(*args, **kwargs)