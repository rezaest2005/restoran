"""Restaurant models: menu."""

from __future__ import annotations

from django.db import models
from django.db.models import Q
from django.db.models.signals import pre_save
from django.dispatch import receiver

from ..tenancy import TenantModel
from .common import check_constraint, created_at_field, is_active_field, name_field, price_field


    
# ═══════════════════════════════════════════
#  TENANT MODELS
# ═══════════════════════════════════════════


# ─── 1. MENU ────────────────────────────


class Category(TenantModel):
    name = name_field(verbose_name="نام دسته‌بندی")
    name_en = models.CharField(
        max_length=200, blank=True, default="", verbose_name="نام انگلیسی"
    )
    image = models.ImageField(upload_to="categories/", blank=True)
    is_active = is_active_field()
    order = models.IntegerField(default=0)

    discount = models.PositiveIntegerField(
        default=0,
        verbose_name="تخفیف دسته‌بندی",
    )
    discount_type = models.CharField(
        max_length=10,
        choices=[("fixed", "مبلغ ثابت"), ("percent", "درصدی")],
        default="fixed",
        verbose_name="نوع تخفیف",
    )

    class Meta:
        ordering = ["order"]
        verbose_name = "دسته‌بندی"
        verbose_name_plural = "دسته‌بندی‌ها"
        unique_together = ["restaurant", "name"]
        constraints = [
            check_constraint(
                Q(discount_type="fixed") | Q(discount__lte=100),
                "rms_category_percent_lte_100",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class Food(TenantModel):
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="foods", db_index=True
    )
    name = name_field(verbose_name="نام غذا")
    name_en = models.CharField(
        max_length=200, blank=True, default="", verbose_name="نام انگلیسی"
    )
    image = models.ImageField(upload_to="foods/", blank=True)
    price = price_field(max_digits=10, verbose_name="قیمت", default=0)
    final_price = price_field(max_digits=10, verbose_name="قیمت نهایی", default=0)
    is_available = is_active_field(verbose_name="موجود")
    stock = models.IntegerField(default=0, verbose_name="موجودی")
    created_at = created_at_field()

    class Meta:
        verbose_name = "غذا"
        verbose_name_plural = "غذاها"
        unique_together = ["restaurant", "name"]
        constraints = [
            check_constraint(Q(price__gte=0), "rms_food_price_gte_0"),
            check_constraint(Q(final_price__gte=0), "rms_food_final_price_gte_0"),
        ]

    def __str__(self) -> str:
        return self.name

    def discounted_price(self) -> int:
        return int(self.final_price) if self.final_price else 0


@receiver(pre_save, sender=Food)
def set_food_final_price(sender, instance, raw=False, **kwargs):
    """اگر قیمت نهایی صفر باشد، از قیمت پایه استفاده شود."""
    if raw:
        return
    if not instance.final_price:
        instance.final_price = instance.price
