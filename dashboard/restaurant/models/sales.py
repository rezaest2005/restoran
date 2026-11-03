"""Restaurant models: sales."""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q, Sum
from django.utils import timezone

from ..tenancy import TenantModel
from .common import check_constraint, created_at_field, description_field, is_active_field, name_field, phone_field, price_field, qty_field, unit_field


# ═══════════════════════════════════════════════════════════════
#  ★ 11. INVOICING — فاکتور فروش، مرجوعی، مشتری، هزینه
# ═══════════════════════════════════════════════════════════════


class Customer(TenantModel):
    """مشتری — برای نسیه و تاریخچه خرید"""

    name = name_field(verbose_name="نام مشتری")
    phone = phone_field()
    address = models.TextField("آدرس", blank=True, default="")
    opening_balance = price_field(default=0, verbose_name="بدهی اول دوره")
    note = description_field(verbose_name="یادداشت")
    is_active = is_active_field()
    created_at = created_at_field()

    class Meta:
        ordering = ["name"]
        verbose_name = "مشتری"
        verbose_name_plural = "مشتریان"
        unique_together = ["restaurant", "name"]

    def __str__(self):
        return self.name

    @property
    def total_debt(self):
        """بدهی فعلی = بدهی اول دوره + فروش نسیه − پرداختی‌ها − مرجوعی‌ها"""
        credit_total = self.invoices.filter(
            payment_method="credit"
        ).aggregate(t=Sum("total"))["t"] or Decimal("0")
        paid = self.invoices.aggregate(
            t=Sum("paid_amount")
        )["t"] or Decimal("0")
        returns = self.returns.aggregate(
            t=Sum("amount")
        )["t"] or Decimal("0")
        return self.opening_balance + credit_total - paid - returns


class SalesInvoice(TenantModel):
    """فاکتور فروش — عمومی (مستقل از منوی رستوران)"""

    PAYMENT_METHOD_CHOICES = [
        ("cash", "نقدی"),
        ("card", "کارت"),
        ("credit", "نسیه"),
    ]

    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
        verbose_name="مشتری",
    )
    customer_name = name_field(
        max_length=200, blank=True, default="", verbose_name="نام مشتری",
    )
    invoice_number = models.CharField(
        max_length=50, blank=True, default="", verbose_name="شماره فاکتور",
    )
    date = models.DateField(default=timezone.now, verbose_name="تاریخ")
    payment_method = models.CharField(
        max_length=10,
        choices=PAYMENT_METHOD_CHOICES,
        default="cash",
        db_index=True,
        verbose_name="نوع پرداخت",
    )
    total = price_field(max_digits=14, default=0, verbose_name="جمع کل")
    discount = price_field(default=0, verbose_name="تخفیف")
    paid_amount = price_field(max_digits=14, default=0, verbose_name="پرداخت‌شده")
    description = description_field()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="ایجاد شده توسط",
    )
    created_at = created_at_field()

    class Meta:
        ordering = ["-date", "-created_at"]
        verbose_name = "فاکتور فروش"
        verbose_name_plural = "فاکتورهای فروش"
        indexes = [
            models.Index(fields=["restaurant", "-date"]),
            models.Index(fields=["restaurant", "payment_method", "-date"]),
        ]
        constraints = [
            check_constraint(Q(total__gte=0), "rms_salesinv_total_gte_0"),
            check_constraint(Q(discount__gte=0), "rms_salesinv_disc_gte_0"),
        ]

    def __str__(self):
        return f"{self.invoice_number} — {self.customer_name or 'نقدی'}"

    @property
    def net_total(self):
        return (self.total or 0) - (self.discount or 0)

    @property
    def remaining(self):
        return self.net_total - (self.paid_amount or 0)

    @property
    def total_profit(self):
        return sum(i.profit for i in self.items.all())

    @property
    def total_returns(self):
        return sum(r.amount for r in self.returns.all())


class SalesInvoiceItem(TenantModel):
    """اقلام فاکتور فروش — با قیمت خرید برای محاسبه سود"""

    invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="فاکتور",
        db_index=True,
    )
    item_name = name_field(max_length=200, verbose_name="نام کالا")
    quantity = qty_field(max_digits=12, decimal_places=3, default=0)
    unit = unit_field()
    unit_price = price_field(default=0, verbose_name="قیمت فروش")
    cost_price = price_field(default=0, verbose_name="قیمت خرید")
    discount = price_field(default=0, verbose_name="تخفیف")

    class Meta:
        verbose_name = "قلم فروش"
        verbose_name_plural = "اقلام فروش"
        constraints = [
            check_constraint(Q(quantity__gte=0), "rms_salesitem_qty_gte_0"),
            check_constraint(Q(unit_price__gte=0), "rms_salesitem_price_gte_0"),
            check_constraint(Q(cost_price__gte=0), "rms_salesitem_cost_gte_0"),
        ]

    def __str__(self):
        return f"{self.item_name} x{self.quantity}"

    @property
    def line_total(self):
        return (self.quantity * self.unit_price) - (self.discount or 0)

    @property
    def profit(self):
        return (
            ((self.unit_price or 0) - (self.cost_price or 0)) * self.quantity
            - (self.discount or 0)
        )


class SalesReturn(TenantModel):
    """مرجوعی فروش"""

    invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.CASCADE,
        related_name="returns",
        verbose_name="فاکتور فروش",
        db_index=True,
    )
    item_name = name_field(max_length=200, verbose_name="نام کالا")
    quantity = qty_field(max_digits=12, decimal_places=3, default=0)
    unit = unit_field()
    amount = price_field(default=0, verbose_name="مبلغ برگشتی")
    reason = models.CharField(max_length=200, blank=True, default="", verbose_name="دلیل")
    date = models.DateField(default=timezone.now, verbose_name="تاریخ")
    created_at = created_at_field()

    class Meta:
        ordering = ["-date"]
        verbose_name = "مرجوعی فروش"
        verbose_name_plural = "مرجوعی‌های فروش"

    def __str__(self):
        return f"مرجوعی {self.item_name} — {self.amount}"


class Expense(TenantModel):
    """هزینه‌های جاری — برای محاسبه سود خالص"""

    title = name_field(max_length=200, verbose_name="عنوان هزینه")
    amount = price_field(max_digits=14, default=0, verbose_name="مبلغ")
    category = models.CharField(
        max_length=50, blank=True, default="سایر", verbose_name="دسته",
    )
    date = models.DateField(default=timezone.now, verbose_name="تاریخ")
    note = description_field()
    created_at = created_at_field()

    class Meta:
        ordering = ["-date"]
        verbose_name = "هزینه"
        verbose_name_plural = "هزینه‌ها"

    def __str__(self):
        return f"{self.title} — {self.amount}"
