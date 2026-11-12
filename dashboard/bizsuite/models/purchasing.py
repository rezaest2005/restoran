"""Business models: purchasing."""

from __future__ import annotations

from decimal import Decimal

from django.db import models
from django.db.models import F, Q, Sum
from django.utils import timezone

from ..tenancy import TenantModel
from .common import check_constraint, created_at_field, description_field, name_field, phone_field, price_field, qty_field, unit_field


class Supplier(TenantModel):
    name = name_field(verbose_name="نام شرکت")
    phone = phone_field()
    address = models.TextField(blank=True, verbose_name="آدرس")
    contact_person = models.CharField(
        max_length=100, blank=True, verbose_name="مسئول فروش"
    )
    description = description_field()
    created_at = created_at_field()

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "تأمین‌کننده"
        verbose_name_plural = "تأمین‌کنندگان"

    def __str__(self) -> str:
        return self.name


class PurchaseInvoice(TenantModel):
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
        verbose_name="تأمین‌کننده",
    )
    supplier_name = name_field(max_length=200, verbose_name="نام تأمین‌کننده")
    invoice_number = models.CharField(
        max_length=50, blank=True, default="", verbose_name="شماره فاکتور"
    )
    date = models.DateField(default=timezone.now, verbose_name="تاریخ")
    payment_method = models.CharField(
        max_length=10, default="credit", verbose_name="روش پرداخت",
        help_text="credit = نسیه، cash = نقد، bank = بانک/کارت",
    )
    paid_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0, verbose_name="پرداخت‌شده هنگام خرید",
    )
    description = description_field()
    file = models.FileField(
        upload_to="purchase_invoices/%Y/%m/", blank=True, verbose_name="فایل فاکتور"
    )
    created_at = created_at_field()

    class Meta:
        ordering = ["-date", "-created_at"]
        verbose_name = "فاکتور خرید"
        verbose_name_plural = "فاکتورهای خرید"
        indexes = [
            models.Index(fields=["business", "-date"]),
        ]

    def __str__(self) -> str:
        return f"{self.supplier_name} — {self.date}"

    def save(self, *args, **kwargs):
        if self.supplier_id and self.supplier and not self.supplier_name:
            self.supplier_name = self.supplier.name
        super().save(*args, **kwargs)

    @property
    def total_amount(self):
        result = self.items.aggregate(total=Sum(F("quantity") * F("unit_price")))
        return result["total"] or Decimal("0")

    @property
    def item_count(self) -> int:
        return self.items.count()


class PurchaseInvoiceItem(TenantModel):
    invoice = models.ForeignKey(
        PurchaseInvoice,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="فاکتور",
        db_index=True,
    )
    item_name = models.CharField(max_length=200, verbose_name="نام کالا")
    quantity = qty_field(max_digits=12, decimal_places=3, default=0)
    unit = unit_field()
    unit_price = price_field(default=0)
    category = models.ForeignKey(
        "Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="دسته‌بندی",
    )
    raw_material = models.ForeignKey(
        "RawMaterial",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice_items",
        verbose_name="ماده اولیه انبار",
    )

    class Meta:
        verbose_name = "آیتم فاکتور"
        verbose_name_plural = "آیتم‌های فاکتور"
        constraints = [
            check_constraint(Q(quantity__gte=0), "rms_invoiceitem_qty_gte_0"),
            check_constraint(Q(unit_price__gte=0), "rms_invoiceitem_price_gte_0"),
        ]

    def __str__(self):
        return f"{self.item_name} x{self.quantity}"

    @property
    def line_total(self):
        return self.quantity * self.unit_price


class PurchaseReturn(TenantModel):
    """مرجوعی خرید"""

    invoice = models.ForeignKey(
        PurchaseInvoice,
        on_delete=models.CASCADE,
        related_name="returns",
        verbose_name="فاکتور خرید",
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
        verbose_name = "مرجوعی خرید"
        verbose_name_plural = "مرجوعی‌های خرید"

    def __str__(self):
        return f"مرجوعی خرید {self.item_name} — {self.amount}"
