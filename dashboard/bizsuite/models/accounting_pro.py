"""
حسابداری حرفه‌ای (مستقل از صنعت): تنظیمات، حساب‌های تفصیلی، سال و دوره‌ی مالی، خزانه‌داری (بانک/صندوق،
انتقال وجه، مغایرت بانکی)، چک‌های دریافتنی/پرداختنی و بودجه.

همه‌چیز با ماژول «حسابداری» به‌تنهایی کار می‌کند و به صندوق فروش یا انبار نیازی ندارد.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from ..tenancy import TenantModel

CHART_TEMPLATE_CHOICES = [
    ("general", "عمومی"),
    ("service", "خدماتی"),
    ("retail", "فروشگاهی"),
    ("restaurant", "رستوران و کافه"),
    ("manufacturing", "تولیدی"),
    ("distribution", "پخش و بازرگانی"),
    ("iran_standard", "استاندارد ایران"),
]


class AccountingSettings(TenantModel):
    """تنظیمات حسابداری هر کسب‌وکار (یک ردیف برای هر کسب‌وکار)."""

    chart_template = models.CharField("قالب سرفصل‌ها", max_length=30, default="general")
    vat_rate = models.DecimalField("نرخ مالیات بر ارزش افزوده (٪)", max_digits=5, decimal_places=2, default=10)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "تنظیمات حسابداری"
        verbose_name_plural = "تنظیمات حسابداری"
        constraints = [models.UniqueConstraint(fields=["business"], name="rms_accsettings_one")]


class DetailAccount(TenantModel):
    """حساب تفصیلی (شناور): شخص، مشتری، تأمین‌کننده، کارمند، پروژه، مرکز هزینه، بانک، صندوق …"""

    class Kind(models.TextChoices):
        PERSON = "person", "شخص"
        CUSTOMER = "customer", "مشتری"
        SUPPLIER = "supplier", "تأمین‌کننده"
        EMPLOYEE = "employee", "کارمند"
        PROJECT = "project", "پروژه"
        COST_CENTER = "cost_center", "مرکز هزینه"
        BANK = "bank", "بانک"
        CASH = "cash", "صندوق"
        OTHER = "other", "سایر"

    code = models.CharField("کد", max_length=20)
    name = models.CharField("نام", max_length=200)
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices, default=Kind.PERSON, db_index=True)
    phone = models.CharField("تلفن", max_length=30, blank=True, default="")
    national_id = models.CharField("کد/شناسه ملی", max_length=20, blank=True, default="")
    economic_code = models.CharField("کد اقتصادی", max_length=20, blank=True, default="")
    address = models.CharField("نشانی", max_length=300, blank=True, default="")
    # پیوند اختیاری با مشتری/تأمین‌کننده‌ی ماژول‌های دیگر (اگر فعال باشند)
    customer = models.ForeignKey("Customer", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    supplier = models.ForeignKey("Supplier", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    credit_limit = models.DecimalField("سقف اعتبار", max_digits=16, decimal_places=2, default=0)
    note = models.CharField("یادداشت", max_length=300, blank=True, default="")
    is_active = models.BooleanField("فعال", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "حساب تفصیلی"
        verbose_name_plural = "حساب‌های تفصیلی"
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(fields=["business", "code"], name="rms_detail_code_unique"),
            models.UniqueConstraint(fields=["business", "customer"], condition=Q(customer__isnull=False),
                                    name="rms_detail_customer_unique"),
            models.UniqueConstraint(fields=["business", "supplier"], condition=Q(supplier__isnull=False),
                                    name="rms_detail_supplier_unique"),
        ]

    def __str__(self):
        return f"{self.code} — {self.name}"


class FiscalYear(TenantModel):
    """سال مالی. پس از بستن، هیچ سندی در بازه‌ی آن ثبت نمی‌شود."""

    class Status(models.TextChoices):
        OPEN = "open", "باز"
        CLOSED = "closed", "بسته"

    name = models.CharField("عنوان", max_length=60)
    start_date = models.DateField("از تاریخ")
    end_date = models.DateField("تا تاریخ")
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.OPEN)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "سال مالی"
        verbose_name_plural = "سال‌های مالی"
        ordering = ["-start_date"]
        constraints = [
            models.CheckConstraint(condition=Q(end_date__gt=models.F("start_date")), name="rms_fy_dates"),
            models.UniqueConstraint(fields=["business", "start_date"], name="rms_fy_start_unique"),
        ]

    def __str__(self):
        return self.name


class AccountingPeriod(TenantModel):
    """دوره‌ی مالی (معمولاً ماهانه) داخل یک سال مالی؛ دوره‌ی قفل‌شده سند جدید نمی‌پذیرد."""

    fiscal_year = models.ForeignKey(FiscalYear, on_delete=models.CASCADE, related_name="periods")
    name = models.CharField("عنوان", max_length=60)
    start_date = models.DateField()
    end_date = models.DateField()
    is_locked = models.BooleanField("قفل", default=False)

    class Meta:
        verbose_name = "دوره‌ی مالی"
        verbose_name_plural = "دوره‌های مالی"
        ordering = ["start_date"]


class MoneyAccount(TenantModel):
    """بانک یا صندوق. هرکدام یک حساب تفصیلی دارد و روی حساب معین صندوق/بانک ثبت می‌شود."""

    class Kind(models.TextChoices):
        CASH = "cash", "صندوق"
        BANK = "bank", "حساب بانکی"

    kind = models.CharField("نوع", max_length=10, choices=Kind.choices, default=Kind.BANK)
    name = models.CharField("نام", max_length=120)
    bank_name = models.CharField("بانک", max_length=80, blank=True, default="")
    branch = models.CharField("شعبه", max_length=80, blank=True, default="")
    account_number = models.CharField("شماره حساب", max_length=40, blank=True, default="")
    iban = models.CharField("شبا", max_length=34, blank=True, default="")
    card_number = models.CharField("شماره کارت", max_length=19, blank=True, default="")
    gl_account = models.ForeignKey("Account", on_delete=models.PROTECT, related_name="+", verbose_name="حساب معین")
    detail = models.OneToOneField(DetailAccount, on_delete=models.PROTECT, related_name="money_account")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "بانک/صندوق"
        verbose_name_plural = "بانک‌ها و صندوق‌ها"
        ordering = ["kind", "name"]

    def __str__(self):
        return self.name


class MoneyTransfer(TenantModel):
    """انتقال وجه بین بانک/صندوق‌ها (با کارمزد اختیاری)."""

    source = models.ForeignKey(MoneyAccount, on_delete=models.PROTECT, related_name="+")
    target = models.ForeignKey(MoneyAccount, on_delete=models.PROTECT, related_name="+")
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    fee = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    date = models.DateField()
    reference = models.CharField(max_length=60, blank=True, default="")
    note = models.CharField(max_length=300, blank=True, default="")
    entry = models.ForeignKey("JournalEntry", on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="rms_transfer_amount_gt_0"),
            models.CheckConstraint(condition=Q(fee__gte=0), name="rms_transfer_fee_gte_0"),
            models.CheckConstraint(condition=~Q(source=models.F("target")), name="rms_transfer_distinct"),
        ]


class BankStatementLine(TenantModel):
    """ردیف صورت‌حساب بانک برای مغایرت‌گیری؛ مبلغ مثبت = واریز، منفی = برداشت."""

    money_account = models.ForeignKey(MoneyAccount, on_delete=models.CASCADE, related_name="statement_lines")
    date = models.DateField()
    description = models.CharField(max_length=300, blank=True, default="")
    reference = models.CharField(max_length=60, blank=True, default="")
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    matched_line = models.OneToOneField("JournalLine", on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name="statement_line")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date", "id"]
        constraints = [models.CheckConstraint(condition=~Q(amount=0), name="rms_stmt_amount_nonzero")]


class Cheque(TenantModel):
    """چک دریافتنی یا پرداختنی با چرخه‌ی وضعیت؛ هر تغییر وضعیت سند خودش را دارد."""

    class Direction(models.TextChoices):
        RECEIVED = "received", "دریافتنی"
        ISSUED = "issued", "پرداختنی"

    class Status(models.TextChoices):
        IN_HAND = "in_hand", "نزد صندوق / صادرشده"
        DEPOSITED = "deposited", "واگذار به بانک"
        CLEARED = "cleared", "وصول/پاس شده"
        BOUNCED = "bounced", "برگشتی"
        RETURNED = "returned", "عودت/ابطال"
        ENDORSED = "endorsed", "خرج شده (واگذار به غیر)"

    direction = models.CharField(max_length=10, choices=Direction.choices, db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.IN_HAND, db_index=True)
    number = models.CharField("شماره چک", max_length=30)
    sayad_id = models.CharField("شناسه صیادی", max_length=16, blank=True, default="")
    bank_name = models.CharField("بانک", max_length=80, blank=True, default="")
    branch = models.CharField("شعبه", max_length=80, blank=True, default="")
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    issue_date = models.DateField("تاریخ دریافت/صدور")
    due_date = models.DateField("تاریخ سررسید", db_index=True)
    party = models.ForeignKey(DetailAccount, on_delete=models.PROTECT, related_name="cheques",
                              verbose_name="طرف حساب")
    # چک پرداختنی از کدام حساب بانکی کشیده شده / چک دریافتنی به کدام بانک واگذار شده
    money_account = models.ForeignKey(MoneyAccount, on_delete=models.PROTECT, null=True, blank=True,
                                      related_name="cheques")
    endorsed_to = models.ForeignKey(DetailAccount, on_delete=models.PROTECT, null=True, blank=True,
                                    related_name="+")
    note = models.CharField(max_length=300, blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "چک"
        verbose_name_plural = "چک‌ها"
        ordering = ["due_date", "id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="rms_cheque_amount_gt_0")]
        indexes = [models.Index(fields=["business", "direction", "status"])]

    def __str__(self):
        return f"چک {self.number}"


class ChequeEvent(TenantModel):
    """تاریخچه‌ی وضعیت چک و سند هر مرحله."""

    cheque = models.ForeignKey(Cheque, on_delete=models.CASCADE, related_name="events")
    from_status = models.CharField(max_length=12, blank=True, default="")
    to_status = models.CharField(max_length=12)
    date = models.DateField()
    entry = models.ForeignKey("JournalEntry", on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    note = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]


class Budget(TenantModel):
    """بودجه‌ی ساده برای یک بازه (معمولاً سال مالی)."""

    name = models.CharField(max_length=120)
    start_date = models.DateField()
    end_date = models.DateField()
    note = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date", "name"]


class BudgetLine(TenantModel):
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name="lines")
    account = models.ForeignKey("Account", on_delete=models.PROTECT, related_name="+")
    cost_center = models.ForeignKey("CostCenter", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    amount = models.DecimalField(max_digits=16, decimal_places=2)

    class Meta:
        ordering = ["id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gte=0), name="rms_budgetline_amount_gte_0")]
