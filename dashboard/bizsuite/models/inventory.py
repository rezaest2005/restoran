"""Business models: inventory."""

from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from ..tenancy import TenantModel
from .common import UNIT_CHOICES, check_constraint, created_at_field, description_field, is_active_field, name_field, price_field, qty_field, unit_field, updated_at_field


# ─── 4. RAW MATERIALS & INVENTORY LOG ────


class RawMaterial(TenantModel):
    UNIT_CHOICES = UNIT_CHOICES

    MATERIAL_TYPE_CHOICES = [
        ("raw", "ماده اولیه"),
        ("packaging", "بسته‌بندی و جعبه"),
        ("semi_finished", "نیمه‌آماده"),
        ("finished", "محصول آماده"),
    ]

    name = name_field(verbose_name="نام ماده اولیه")
    label = models.CharField(max_length=200, blank=True, verbose_name="برچسب")
    price = price_field(default=0)
    unit = unit_field()
    # ★ FIXED: قبلاً decimal_places=0 بود و ۰٫۵ کیلو گرد می‌شد
    quantity = qty_field(max_digits=12, decimal_places=3, default=0)
    minimum_stock = qty_field(
        max_digits=12, decimal_places=3, default=0,
        verbose_name="حداقل موجودی",
    )
    target_stock = qty_field(
        max_digits=12, decimal_places=3, default=0,
        verbose_name="موجودی هدف",
    )
    material_type = models.CharField(
        max_length=20,
        choices=MATERIAL_TYPE_CHOICES,
        default="raw",
        verbose_name="نوع ماده",
        db_index=True,
    )
    created_at = created_at_field()
    updated_at = updated_at_field()

    @property
    def total_price(self):
        return self.price * self.quantity

    class Meta:
        ordering = ["name"]
        verbose_name = "ماده اولیه"
        verbose_name_plural = "مواد اولیه"
        constraints = [
            check_constraint(Q(quantity__gte=0), "rms_rawmaterial_qty_gte_0"),
            check_constraint(Q(price__gte=0), "rms_rawmaterial_price_gte_0"),
        ]

    def __str__(self) -> str:
        return f"{self.name} - {self.quantity} {self.get_unit_display()}"


# ─── 7. READY MATERIALS ──────────────────


class InventoryMovement(TenantModel):
    class MovementType(models.TextChoices):
        IN = "in", "ورود"
        OUT = "out", "خروج"
        WASTE = "waste", "ضایعات"
        ADJUSTMENT = "adjustment", "تعدیل"
        PRODUCTION = "production", "تولید"
        ORDER_USAGE = "order_usage", "مصرف سفارش"

    raw_material = models.ForeignKey(
        RawMaterial,
        on_delete=models.PROTECT,
        related_name="movements",
        verbose_name="ماده اولیه",
        db_index=True,
    )
    warehouse = models.ForeignKey(
        "Warehouse",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movements",
        verbose_name="انبار",
        db_index=True,
    )
    movement_type = models.CharField(
        "نوع جابجایی", max_length=20, choices=MovementType.choices
    )
    quantity = models.DecimalField("مقدار", max_digits=12, decimal_places=3)
    previous_stock = models.DecimalField("موجودی قبل", max_digits=12, decimal_places=3)
    new_stock = models.DecimalField("موجودی بعد", max_digits=12, decimal_places=3)

    reference_type = models.CharField("نوع مرجع", max_length=50, blank=True)
    reference_id = models.PositiveIntegerField("شناسه مرجع", blank=True, null=True)
    notes = description_field(verbose_name="یادداشت")
    waste_reason = models.CharField(
        max_length=20,
        choices=[
            ("spolied", "خراب شده"),
            ("expired", "تاریخ گذشته"),
            ("damaged", "آسیب دیده"),
            ("other", "سایر"),
        ],
        blank=True,
        default="",
        verbose_name="دلیل ضایعات",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="ایجاد شده توسط",
    )
    created_at = created_at_field(verbose_name="تاریخ")

    class Meta:
        verbose_name = "جابجایی انبار"
        verbose_name_plural = "جابجایی‌های انبار"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["business", "raw_material", "-created_at"]),
            models.Index(fields=["business", "movement_type", "-created_at"]),
            models.Index(fields=["business", "reference_type", "reference_id"]),
        ]

    def __str__(self):
        return f"{self.get_movement_type_display()} — {self.raw_material.name} — {self.quantity}"


class Warehouse(TenantModel):
    """انبار — هر کسب‌وکار یک انبار مرکزی (Mother) دارد."""

    TYPE_CHOICES = [
        ("mother", "انبار مرکزی"),
        ("kitchen", "خط تولید"),
        ("cold_storage", "سردخانه"),
        ("freezer", "فریزر"),
        ("vegetables", "انبار سبزیجات"),
        ("branch", "شعبه"),
        ("other", "سایر"),
    ]

    name = name_field(verbose_name="نام انبار")
    warehouse_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default="other",
        verbose_name="نوع انبار",
        db_index=True,
    )
    is_mother = models.BooleanField(
        default=False,
        verbose_name="انبار مرکزی",
        help_text="هر کسب‌وکار فقط یک انبار مرکزی می‌تواند داشته باشد",
    )
    description = description_field()
    is_active = is_active_field()
    created_at = created_at_field()
    updated_at = updated_at_field()

    class Meta:
        ordering = ["-is_mother", "name"]
        verbose_name = "انبار"
        verbose_name_plural = "انبارها"
        unique_together = ["business", "name"]

    def __str__(self):
        prefix = "🏭 " if self.is_mother else ""
        return f"{prefix}{self.name}"

    def clean(self):
        super().clean()
        if self.is_mother:
            existing = Warehouse.all_objects.filter(
                business_id=self.business_id,
                is_mother=True,
            ).exclude(pk=self.pk)
            if existing.exists():
                raise ValidationError({
                    "is_mother": "هر کسب‌وکار فقط یک انبار مرکزی می‌تواند داشته باشد."
                })

    @property
    def stock_count(self):
        return self.stock_items.filter(quantity__gt=0).count()


class StockItem(TenantModel):
    """موجودی هر کالا در هر انبار — منبع اصلی موجودی"""

    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name="stock_items",
        verbose_name="انبار",
        db_index=True,
    )
    raw_material = models.ForeignKey(
        RawMaterial,
        on_delete=models.CASCADE,
        related_name="stock_items",
        verbose_name="ماده اولیه",
        db_index=True,
    )
    quantity = qty_field(
        max_digits=12, decimal_places=3, default=0, verbose_name="موجودی"
    )
    updated_at = updated_at_field()

    class Meta:
        verbose_name = "موجودی انبار"
        verbose_name_plural = "موجودی‌های انبار"
        unique_together = ["business", "warehouse", "raw_material"]
        indexes = [
            models.Index(fields=["business", "warehouse", "raw_material"]),
            models.Index(fields=["business", "raw_material"]),
        ]
        constraints = [
            check_constraint(Q(quantity__gte=0), "rms_stockitem_qty_gte_0"),
        ]

    def __str__(self):
        return f"{self.raw_material.name} @ {self.warehouse.name}: {self.quantity}"

    @property
    def total_value(self):
        return self.quantity * self.raw_material.price

    @property
    def is_low(self):
        min_stock = getattr(self.raw_material, "minimum_stock", 0)
        return min_stock > 0 and self.quantity <= min_stock

    def increase(self, amount):
        """افزایش اتمیک"""
        if amount <= 0:
            raise ValidationError("مقدار افزایش باید مثبت باشد.")
        StockItem.all_objects.filter(pk=self.pk).update(
            quantity=F("quantity") + amount,
            updated_at=timezone.now(),
        )
        self.refresh_from_db(fields=["quantity", "updated_at"])

    def decrease(self, amount):
        """کاهش اتمیک — فقط اگر موجودی کافی باشد"""
        if amount <= 0:
            raise ValidationError("مقدار کاهش باید مثبت باشد.")
        with transaction.atomic():
            updated = StockItem.all_objects.filter(
                pk=self.pk, quantity__gte=amount
            ).update(
                quantity=F("quantity") - amount,
                updated_at=timezone.now(),
            )
        self.refresh_from_db(fields=["quantity", "updated_at"])
        if not updated:
            raise ValidationError(
                f"موجودی کافی نیست. موجودی فعلی: {self.quantity}، درخواست: {amount}"
            )
