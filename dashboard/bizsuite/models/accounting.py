"""حسابداری دوطرفه — مستقل از صنعت: سرفصل حساب، مرکز هزینه، سند و ردیف سند."""

from django.conf import settings
from django.db import models
from django.db.models import Q

from ..tenancy import TenantModel


class Account(TenantModel):
    """سرفصل حساب (درخت حساب‌ها)."""

    class Type(models.TextChoices):
        ASSET = "asset", "دارایی"
        LIABILITY = "liability", "بدهی"
        EQUITY = "equity", "حقوق صاحبان سرمایه"
        INCOME = "income", "درآمد"
        EXPENSE = "expense", "هزینه"

    code = models.CharField("کد", max_length=20)
    name = models.CharField("نام حساب", max_length=200)
    name_en = models.CharField("نام انگلیسی", max_length=200, blank=True, default="")
    type = models.CharField("نوع", max_length=20, choices=Type.choices, db_index=True)
    parent = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="children",
        verbose_name="حساب والد",
    )
    is_postable = models.BooleanField(
        "قابل ثبت سند", default=True,
        help_text="حساب‌های گروه (دارای زیرمجموعه) سند نمی‌پذیرند.",
    )
    is_system = models.BooleanField("حساب سیستمی", default=False)
    is_active = models.BooleanField("فعال", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "سرفصل حساب"
        verbose_name_plural = "سرفصل‌های حساب"
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(fields=["business", "code"], name="rms_account_code_unique"),
        ]

    def __str__(self):
        return f"{self.code} — {self.name}"

    @property
    def normal_debit(self) -> bool:
        """حساب‌های دارایی و هزینه ماهیت بدهکار دارند."""
        return self.type in (self.Type.ASSET, self.Type.EXPENSE)


class CostCenter(TenantModel):
    """مرکز هزینه/سود: شعبه، خودرو، بخش ..."""

    class Kind(models.TextChoices):
        BRANCH = "branch", "شعبه"
        VEHICLE = "vehicle", "خودرو"
        DEPARTMENT = "department", "بخش"
        OTHER = "other", "سایر"

    code = models.CharField("کد", max_length=20)
    name = models.CharField("نام", max_length=200)
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices, default=Kind.OTHER)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "مرکز هزینه"
        verbose_name_plural = "مراکز هزینه"
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(fields=["business", "code"], name="rms_costcenter_code_unique"),
        ]

    def __str__(self):
        return f"{self.code} — {self.name}"


class JournalEntry(TenantModel):
    """سند حسابداری. پس از ثبت قابل ویرایش نیست؛ فقط برگشت (ابطال) می‌شود."""

    number = models.PositiveIntegerField("شماره سند")
    date = models.DateField("تاریخ", db_index=True)
    description = models.CharField("شرح", max_length=500, blank=True, default="")
    source_type = models.CharField("نوع منبع", max_length=30, blank=True, default="", db_index=True)
    source_id = models.PositiveBigIntegerField("شناسه منبع", null=True, blank=True)
    reversal_of = models.OneToOneField(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="reversed_by",
        verbose_name="برگشت از سند",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "سند حسابداری"
        verbose_name_plural = "اسناد حسابداری"
        ordering = ["-date", "-number"]
        constraints = [
            models.UniqueConstraint(fields=["business", "number"], name="rms_journal_number_unique"),
            models.UniqueConstraint(
                fields=["business", "source_type", "source_id"],
                condition=Q(source_id__isnull=False) & ~Q(source_type=""),
                name="rms_journal_source_unique",
            ),
        ]
        indexes = [models.Index(fields=["business", "date"])]

    def __str__(self):
        return f"سند {self.number}"


class JournalLine(TenantModel):
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="lines")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="lines")
    debit = models.DecimalField("بدهکار", max_digits=16, decimal_places=2, default=0)
    credit = models.DecimalField("بستانکار", max_digits=16, decimal_places=2, default=0)
    memo = models.CharField("توضیح", max_length=300, blank=True, default="")
    cost_center = models.ForeignKey(
        CostCenter, on_delete=models.SET_NULL, null=True, blank=True, related_name="lines",
    )

    class Meta:
        verbose_name = "ردیف سند"
        verbose_name_plural = "ردیف‌های سند"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(debit__gt=0, credit=0) | Q(credit__gt=0, debit=0)),
                name="rms_journalline_one_side",
            ),
        ]
        indexes = [models.Index(fields=["business", "account"])]


# ───────────────────────── autopilot (هزینه‌های ثابت و پرداخت‌ها) ─────────────────────────

EXPENSE_CATEGORIES = [
    # key, label (fa), account code
    ("payroll", "حقوق و دستمزد", "5310"),
    ("rent", "اجاره", "5320"),
    ("utilities", "آب، برق، گاز و تلفن", "5330"),
    ("fuel", "سوخت", "5220"),
    ("maintenance", "تعمیر و نگهداری", "5230"),
    ("other", "سایر هزینه‌ها", "5390"),
]
EXPENSE_CATEGORY_KEYS = [c[0] for c in EXPENSE_CATEGORIES]


class RecurringExpense(TenantModel):
    """هزینه‌ی ثابت ماهانه (اجاره، حقوق یک کارمند، قبض …): سامانه خودش هر ماه ثبتش می‌کند."""

    class Method(models.TextChoices):
        CASH = "cash", "نقد (صندوق)"
        BANK = "bank", "بانک / کارت"

    title = models.CharField("عنوان", max_length=200)
    category = models.CharField("دسته", max_length=20, default="other")
    amount = models.DecimalField("مبلغ ماهانه", max_digits=14, decimal_places=2)
    day_of_month = models.PositiveSmallIntegerField("روز ثبت در ماه", default=1)
    payment_method = models.CharField(max_length=10, choices=Method.choices, default=Method.BANK)
    start_date = models.DateField("از تاریخ")
    is_active = models.BooleanField(default=True)
    note = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "هزینه‌ی ثابت"
        verbose_name_plural = "هزینه‌های ثابت"
        ordering = ["category", "title"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="rms_recurring_amount_gt_0"),
            models.CheckConstraint(condition=Q(day_of_month__gte=1, day_of_month__lte=28),
                                   name="rms_recurring_day_1_28"),
        ]

    def __str__(self):
        return f"{self.title} ({self.amount})"


class Payment(TenantModel):
    """دریافت از مشتری یا پرداخت به تأمین‌کننده (تسویه‌ی بدهی/طلب)."""

    class Kind(models.TextChoices):
        RECEIPT = "in", "دریافت از مشتری"
        PAYOUT = "out", "پرداخت به تأمین‌کننده"

    class Method(models.TextChoices):
        CASH = "cash", "نقد (صندوق)"
        BANK = "bank", "بانک / کارت"

    kind = models.CharField(max_length=3, choices=Kind.choices, db_index=True)
    customer = models.ForeignKey("Customer", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    supplier = models.ForeignKey("Supplier", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    party_name = models.CharField(max_length=200, blank=True, default="")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    method = models.CharField(max_length=10, choices=Method.choices, default=Method.CASH)
    date = models.DateField()
    note = models.CharField(max_length=300, blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "پرداخت/دریافت"
        verbose_name_plural = "پرداخت‌ها و دریافت‌ها"
        ordering = ["-date", "-id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="rms_payment_amount_gt_0")]
        indexes = [models.Index(fields=["business", "kind", "-date"])]
