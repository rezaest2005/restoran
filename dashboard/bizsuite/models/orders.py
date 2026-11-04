"""Business models: orders."""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q, Sum
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from ..tenancy import TenantModel
from .common import check_constraint, created_at_field, updated_at_field
from .menu import Food


# ─── 2. TABLES & RESERVATIONS ────────────


class Order(TenantModel):
    STATUS_CHOICES = [
        ("pending", "در انتظار"),
        ("confirmed", "تأیید شده"),
        ("preparing", "در حال آماده‌سازی"),
        ("ready", "آماده"),
        ("delivered", "تحویل داده شده"),
        ("cancelled", "لغو شده"),
    ]

    SOURCE_CHOICES = [
        ("pos", "صندوق"),
        ("online", "آنلاین"),
        ("phone", "تلفنی"),
        ("qr", "QR میز"),
    ]

    PAYMENT_STATUS_CHOICES = [
        ("pending", "در انتظار پرداخت"),
        ("paid", "پرداخت شده"),
        ("failed", "ناموفق"),
        ("refunded", "بازگشت وجه"),
    ]

    PAYMENT_METHOD_CHOICES = [
        ("cash", "نقدی"),
        ("card", "کارتخوان"),
        ("online", "آنلاین"),
    ]

    customer_name = models.CharField(max_length=200, blank=True, default="")
    customer_name_en = models.CharField(max_length=200, blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    table_number = models.CharField(
        "شماره میز / محل تحویل", max_length=20, blank=True, default=""
    )
    customer_note = models.CharField(
        "توضیح مشتری", max_length=300, blank=True, default=""
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True
    )
    total_price = models.DecimalField(max_digits=12, decimal_places=0, default=0)

    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        default="pos",
        db_index=True,
        verbose_name="منبع سفارش",
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default="pending",
        db_index=True,
        verbose_name="وضعیت پرداخت",
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default="cash",
        verbose_name="روش پرداخت",
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_orders",
        verbose_name="تأیید شده توسط",
    )
    confirmed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="زمان تأیید",
    )

    created_at = created_at_field()
    updated_at = updated_at_field()

    class Meta:
        verbose_name = "سفارش"
        verbose_name_plural = "سفارشات"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["business", "-created_at"]),
            models.Index(fields=["business", "status", "-created_at"]),
            models.Index(fields=["business", "source", "status", "-created_at"]),
            models.Index(fields=["business", "payment_status", "-created_at"]),
        ]
        constraints = [
            check_constraint(Q(total_price__gte=0), "rms_order_total_gte_0"),
        ]

    def __str__(self) -> str:
        return f"سفارش #{self.pk or '—'} — {self.customer_name or 'بدون نام'} — {self.get_status_display()}"

    def recalculate_total(self):
        """محاسبه مجدد مجموع سفارش از روی آیتم‌ها."""
        total = _recalculate_order_total(self.pk)
        self.total_price = total
        return total


def _recalculate_order_total(order_id):
    """
    از all_objects استفاده می‌کند تا در سیگنال‌ها/تسک‌ها (بدون tenant فعال)
    هم درست کار کند.
    """
    total = OrderItem.all_objects.filter(order_id=order_id).aggregate(
        t=Sum(
            F("price") * F("quantity"),
            output_field=models.DecimalField(max_digits=14, decimal_places=0),
        )
    )["t"] or Decimal("0")
    Order.all_objects.filter(pk=order_id).update(total_price=total)
    return total


class OrderItem(TenantModel):
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="items", db_index=True
    )
    food = models.ForeignKey(
        Food,
        on_delete=models.SET_NULL,
        related_name="order_items",
        null=True,
        blank=True,
    )
    item_name = models.CharField(
        max_length=200,
        blank=True,
        default="",
        verbose_name="نام آیتم",
    )
    item_name_en = models.CharField(
        max_length=200,
        blank=True,
        default="",
        verbose_name="نام انگلیسی آیتم",
    )
    quantity = models.IntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=0, default=0)

    class Meta:
        verbose_name = "آیتم سفارش"
        verbose_name_plural = "آیتم‌های سفارش"
        indexes = [
            models.Index(fields=["order", "food"]),
            models.Index(fields=["business", "food"]),
        ]
        constraints = [
            check_constraint(Q(quantity__gte=1), "rms_orderitem_qty_gte_1"),
            check_constraint(Q(price__gte=0), "rms_orderitem_price_gte_0"),
        ]

    def __str__(self) -> str:
        return f"{self.display_name} x{self.quantity}"

    @property
    def display_name(self) -> str:
        if self.food_id and self.food:
            return self.food.name
        return self.item_name or "آیتم سفارشی"

    @property
    def display_name_en(self) -> str:
        if self.food_id and self.food and self.food.name_en:
            return self.food.name_en
        return self.item_name_en or self.display_name

    @property
    def line_total(self) -> Decimal:
        p = self.price or Decimal("0")
        return p * self.quantity

    def clean(self):
        if not self.food_id and not self.item_name.strip():
            raise ValidationError(
                {"item_name": "برای آیتم‌های بدون غذا، نام آیتم الزامی است."}
            )


@receiver(pre_save, sender=OrderItem)
def set_order_item_price(sender, instance: OrderItem, raw=False, **kwargs) -> None:
    """قیمت آیتم از غذا پر شود اگر ست نشده باشد؛ هرگز NULL ذخیره نمی‌شود."""
    if raw:
        return
    if instance.price is None:
        instance.price = Decimal("0")
    if instance.food_id and not instance.price:
        instance.price = instance.food.final_price


@receiver(post_save, sender=OrderItem)
def _update_order_total_on_save(sender, instance: OrderItem, created, raw=False, **kwargs):
    if raw or not instance.order_id:
        return
    total = _recalculate_order_total(instance.order_id)
    if OrderItem._meta.get_field("order").is_cached(instance):
        instance.order.total_price = total


@receiver(post_delete, sender=OrderItem)
def _update_order_total_on_delete(sender, instance: OrderItem, **kwargs):
    if instance.order_id:
        _recalculate_order_total(instance.order_id)
