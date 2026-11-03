"""Restaurant models: production."""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q

from ..tenancy import TenantModel
from .inventory import RawMaterial


# ═══════════════════════════════════════════════════════════
#  فرمولاسیون و خط تولید — مستقل از صنعت
#  ورودی‌ها: مواد اولیه / نیمه‌آماده / آماده (همگی RawMaterial با material_type)
#  خروجی: یک ماده (معمولاً نیمه‌آماده یا محصول آماده)
# ═══════════════════════════════════════════════════════════


class Formula(TenantModel):
    """فرمولاسیون (BOM): برای تولید «output_quantity» واحد از خروجی چه چیزهایی لازم است."""

    name = models.CharField("نام فرمول", max_length=200)
    code = models.CharField("کد", max_length=50, blank=True, default="")
    output_material = models.ForeignKey(
        RawMaterial,
        on_delete=models.PROTECT,
        related_name="formulas",
        verbose_name="محصول خروجی",
    )
    output_quantity = models.DecimalField(
        "مقدار تولید هر دسته", max_digits=12, decimal_places=3, default=1
    )
    version = models.PositiveIntegerField("نسخه", default=1)
    is_active = models.BooleanField("فعال", default=True)
    notes = models.TextField("توضیحات", blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "فرمولاسیون"
        verbose_name_plural = "فرمولاسیون‌ها"
        ordering = ["name", "-version"]
        constraints = [
            models.CheckConstraint(
                condition=Q(output_quantity__gt=0), name="rms_formula_outqty_gt_0"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} v{self.version}"


class FormulaLine(TenantModel):
    formula = models.ForeignKey(
        Formula, on_delete=models.CASCADE, related_name="lines", verbose_name="فرمول"
    )
    material = models.ForeignKey(
        RawMaterial,
        on_delete=models.PROTECT,
        related_name="formula_usages",
        verbose_name="ماده ورودی",
    )
    quantity = models.DecimalField(
        "مقدار برای یک دسته", max_digits=12, decimal_places=3
    )
    wastage_percent = models.DecimalField(
        "درصد ضایعات", max_digits=5, decimal_places=2, default=0
    )
    notes = models.CharField("یادداشت", max_length=200, blank=True, default="")

    class Meta:
        verbose_name = "قلم فرمول"
        verbose_name_plural = "اقلام فرمول"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="rms_formulaline_qty_gt_0"
            ),
            models.CheckConstraint(
                condition=Q(wastage_percent__gte=0, wastage_percent__lt=100),
                name="rms_formulaline_waste_0_100",
            ),
            models.UniqueConstraint(
                fields=["formula", "material"], name="rms_formulaline_unique_material"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.formula_id}: {self.material_id} × {self.quantity}"


class ProductionOrder(TenantModel):
    """دستور تولید در خط تولید."""

    class Status(models.TextChoices):
        PLANNED = "planned", "برنامه‌ریزی‌شده"
        IN_PROGRESS = "in_progress", "در حال تولید"
        COMPLETED = "completed", "تکمیل‌شده"
        CANCELLED = "cancelled", "لغو شده"

    formula = models.ForeignKey(
        Formula, on_delete=models.PROTECT, related_name="orders", verbose_name="فرمول"
    )
    warehouse = models.ForeignKey(
        "Warehouse",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="production_orders",
        verbose_name="انبار",
        help_text="خالی = انبار مرکزی",
    )
    planned_quantity = models.DecimalField(
        "مقدار برنامه‌ریزی‌شده", max_digits=12, decimal_places=3
    )
    produced_quantity = models.DecimalField(
        "مقدار تولیدشده", max_digits=12, decimal_places=3, default=0
    )
    status = models.CharField(
        "وضعیت", max_length=20, choices=Status.choices, default=Status.PLANNED,
        db_index=True,
    )
    total_cost = models.DecimalField(
        "هزینه‌ی مواد", max_digits=16, decimal_places=2, default=0
    )
    unit_cost = models.DecimalField(
        "بهای تمام‌شده‌ی هر واحد", max_digits=16, decimal_places=4, default=0
    )
    notes = models.TextField("توضیحات", blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "دستور تولید"
        verbose_name_plural = "دستورهای تولید"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["restaurant", "status", "-created_at"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(planned_quantity__gt=0), name="rms_prodorder_planned_gt_0"
            ),
            models.CheckConstraint(
                condition=Q(produced_quantity__gte=0), name="rms_prodorder_produced_gte_0"
            ),
        ]

    def __str__(self) -> str:
        return f"PO-{self.pk} {self.formula}"
