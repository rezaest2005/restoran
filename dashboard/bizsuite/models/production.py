"""Business models: production."""

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
    # قالب صنعت (restaurant / bakery / detergent / cosmetics / assembly ...) — فقط برچسب
    industry = models.CharField("صنعت", max_length=30, blank=True, default="")
    # سربار عمومی روی بهای مواد (برق، اجاره، ...) به درصد
    overhead_percent = models.DecimalField(
        "درصد سربار روی مواد", max_digits=6, decimal_places=2, default=0
    )
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
    # واحد واردشده در فرمول (خالی = واحد خود کالا)؛ مثلاً «گرم» برای کالای «کیلوگرم»
    unit = models.CharField("واحد", max_length=10, blank=True, default="")
    # مقدار ثابت اضافه برای هر دستور تولید (راه‌اندازی خط، شست‌وشوی مخزن)
    setup_quantity = models.DecimalField(
        "مقدار ثابت راه‌اندازی", max_digits=12, decimal_places=3, default=0
    )
    # گرد کردن رو به بالا به مضرب (مثلاً کیسه‌های ۲۵ کیلویی)؛ ۰ = بدون گرد کردن
    rounding_multiple = models.DecimalField(
        "مضرب گرد کردن", max_digits=12, decimal_places=3, default=0
    )
    stage = models.ForeignKey(
        "FormulaStage", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="lines", verbose_name="مرحله‌ی مصرف",
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
        "بهای کل (مواد + دستمزد و سربار)", max_digits=16, decimal_places=2, default=0
    )
    unit_cost = models.DecimalField(
        "بهای تمام‌شده‌ی هر واحد", max_digits=16, decimal_places=4, default=0
    )
    scrap_quantity = models.DecimalField(
        "ضایعات خروجی", max_digits=12, decimal_places=3, default=0
    )
    material_cost = models.DecimalField(
        "بهای مواد", max_digits=16, decimal_places=2, default=0
    )
    operation_cost = models.DecimalField(
        "دستمزد و سربار", max_digits=16, decimal_places=2, default=0
    )
    planned_minutes = models.DecimalField(
        "زمان برنامه‌ریزی‌شده (دقیقه)", max_digits=12, decimal_places=2, default=0
    )
    # دستور مادر (وقتی نیمه‌آماده‌ها برای یک دستور جداگانه تولید می‌شوند)
    parent = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="children", verbose_name="دستور مادر",
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
        indexes = [models.Index(fields=["business", "status", "-created_at"])]
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


class FormulaStage(TenantModel):
    """مرحله‌ی خط تولید (Routing / Operation): آماده‌سازی → پخت → سرو یا توزین → اختلاط → پرکنی → بسته‌بندی."""

    formula = models.ForeignKey(
        Formula, on_delete=models.CASCADE, related_name="stages", verbose_name="فرمول"
    )
    sequence = models.PositiveIntegerField("ترتیب", default=1)
    name = models.CharField("نام مرحله", max_length=120)
    workstation = models.CharField("ایستگاه / دستگاه", max_length=120, blank=True, default="")
    setup_minutes = models.DecimalField(
        "زمان آماده‌سازی (دقیقه)", max_digits=9, decimal_places=2, default=0
    )
    run_minutes = models.DecimalField(
        "زمان هر نوبت (دقیقه)", max_digits=9, decimal_places=2, default=0
    )
    # چند واحد خروجی در یک نوبت انجام می‌شود؛ ۰ = یک دسته‌ی فرمول (output_quantity)
    capacity = models.DecimalField(
        "ظرفیت هر نوبت", max_digits=12, decimal_places=3, default=0
    )
    labour_rate = models.DecimalField(
        "دستمزد در ساعت", max_digits=14, decimal_places=2, default=0
    )
    overhead_rate = models.DecimalField(
        "سربار در ساعت", max_digits=14, decimal_places=2, default=0
    )
    instructions = models.TextField("دستورالعمل", blank=True, default="")
    quality_check = models.CharField("کنترل کیفیت", max_length=300, blank=True, default="")

    class Meta:
        verbose_name = "مرحله‌ی تولید"
        verbose_name_plural = "مراحل تولید"
        ordering = ["sequence", "id"]

    def __str__(self) -> str:
        return f"{self.formula_id}#{self.sequence} {self.name}"


class FormulaByProduct(TenantModel):
    """محصول جانبی (سبوس، آب پنیر، ...) با سهمی از بهای تمام‌شده."""

    formula = models.ForeignKey(
        Formula, on_delete=models.CASCADE, related_name="byproducts", verbose_name="فرمول"
    )
    material = models.ForeignKey(
        RawMaterial, on_delete=models.PROTECT, related_name="byproduct_of",
        verbose_name="محصول جانبی",
    )
    quantity = models.DecimalField("مقدار در هر دسته", max_digits=12, decimal_places=3)
    cost_share_percent = models.DecimalField(
        "سهم از بهای تمام‌شده (٪)", max_digits=5, decimal_places=2, default=0
    )

    class Meta:
        verbose_name = "محصول جانبی"
        verbose_name_plural = "محصولات جانبی"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="rms_formulabyp_qty_gt_0"
            ),
            models.CheckConstraint(
                condition=Q(cost_share_percent__gte=0, cost_share_percent__lt=100),
                name="rms_formulabyp_share_0_100",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.formula_id}: +{self.material_id} × {self.quantity}"


class ProductionOrderStep(TenantModel):
    """کارت کار (Job Card): یک مرحله از خط تولید برای یک دستور تولید."""

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار"
        IN_PROGRESS = "in_progress", "در حال انجام"
        DONE = "done", "انجام شد"
        SKIPPED = "skipped", "رد شد"

    order = models.ForeignKey(
        "ProductionOrder", on_delete=models.CASCADE, related_name="steps",
        verbose_name="دستور تولید",
    )
    stage = models.ForeignKey(
        FormulaStage, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    sequence = models.PositiveIntegerField("ترتیب", default=1)
    name = models.CharField("نام مرحله", max_length=120)
    workstation = models.CharField("ایستگاه", max_length=120, blank=True, default="")
    instructions = models.TextField("دستورالعمل", blank=True, default="")
    quality_check = models.CharField("کنترل کیفیت", max_length=300, blank=True, default="")
    status = models.CharField(
        "وضعیت", max_length=20, choices=Status.choices, default=Status.PENDING
    )
    planned_minutes = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # نرخ دستمزد + سربار در ساعت (عکس لحظه‌ی ثبت دستور)
    hourly_rate = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    actual_minutes = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    good_quantity = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    scrap_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    quality_ok = models.BooleanField(null=True, blank=True)
    notes = models.CharField("یادداشت", max_length=300, blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "مرحله‌ی دستور تولید"
        verbose_name_plural = "مراحل دستور تولید"
        ordering = ["sequence", "id"]

    def __str__(self) -> str:
        return f"PO-{self.order_id} #{self.sequence} {self.name}"
