"""Business models: customer club (loyalty) — industry-neutral.

Works for any business: restaurant, shop, salon, B2B. Purchases can come from
POS orders, sales invoices or be recorded by hand (club-only tenants).
Points are kept as an append-only ledger (``LoyaltyTransaction``); every
positive row is a "lot" with its own ``remaining`` and ``expires_at`` so that
expiry and redemption are FIFO and auditable.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q

from ..tenancy import TenantModel

MONEY = {"max_digits": 16, "decimal_places": 0}


class LoyaltySettings(TenantModel):
    """تنظیمات باشگاه؛ برای هر کسب‌وکار یک ردیف."""

    class TierBasis(models.TextChoices):
        POINTS = "points", "امتیاز کسب‌شده"
        SPEND = "spend", "مبلغ خرید"

    is_active = models.BooleanField("باشگاه فعال", default=False)
    earn_amount = models.PositiveIntegerField("مبلغ خرید برای هر ۱ امتیاز", default=10000)
    visit_points = models.PositiveIntegerField("امتیاز هر مراجعه/خرید", default=0)
    redeem_value = models.PositiveIntegerField("ارزش هر امتیاز هنگام استفاده", default=1000)
    min_redeem_points = models.PositiveIntegerField("حداقل امتیاز برای استفاده", default=10)
    redeem_max_percent = models.PositiveSmallIntegerField(
        "حداکثر درصد مبلغ خرید قابل پرداخت با امتیاز", default=100)
    welcome_points = models.PositiveIntegerField("امتیاز عضویت", default=0)
    points_expiry_days = models.PositiveIntegerField("انقضای امتیاز (روز، ۰=بدون انقضا)", default=0)
    tier_basis = models.CharField(
        "مبنای سطح", max_length=10, choices=TierBasis.choices, default=TierBasis.POINTS)
    tier_window_days = models.PositiveIntegerField(
        "بازه‌ی محاسبه‌ی سطح (روز، ۰=کل دوره)", default=0)
    referrer_points = models.PositiveIntegerField("امتیاز معرف (پس از اولین خرید دوست)", default=0)
    referee_points = models.PositiveIntegerField("امتیاز عضو معرفی‌شده", default=0)
    wallet_enabled = models.BooleanField("کیف پول / اعتبار", default=False)
    public_lookup_enabled = models.BooleanField("صفحه‌ی عمومی مشاهده‌ی امتیاز", default=False)
    sms_enabled = models.BooleanField("ارسال پیامک", default=False)
    new_days = models.PositiveIntegerField("عضو جدید تا (روز)", default=30)
    at_risk_days = models.PositiveIntegerField("در خطر ریزش پس از (روز بی‌خرید)", default=60)
    lost_days = models.PositiveIntegerField("از دست رفته پس از (روز بی‌خرید)", default=180)
    loyal_visits = models.PositiveIntegerField("وفادار با حداقل خرید", default=5)

    class Meta:
        verbose_name = "تنظیمات باشگاه مشتریان"
        verbose_name_plural = "تنظیمات باشگاه مشتریان"
        constraints = [
            models.UniqueConstraint(fields=["business"], name="rms_loyalty_settings_one"),
            models.CheckConstraint(condition=Q(earn_amount__gt=0), name="rms_loyalty_earn_gt_0"),
            models.CheckConstraint(condition=Q(redeem_max_percent__lte=100),
                                   name="rms_loyalty_redeem_pct_lte_100"),
        ]


class LoyaltyTier(TenantModel):
    """سطح عضویت (نقره‌ای، طلایی، VIP ...) — تعداد دلخواه."""

    name = models.CharField("نام", max_length=60)
    min_value = models.PositiveBigIntegerField("آستانه (امتیاز یا مبلغ)", default=0)
    multiplier = models.DecimalField("ضریب امتیاز", max_digits=5, decimal_places=2, default=1)
    color = models.CharField("رنگ", max_length=20, blank=True, default="")
    perks = models.CharField("مزایا", max_length=300, blank=True, default="")

    class Meta:
        verbose_name = "سطح باشگاه"
        verbose_name_plural = "سطوح باشگاه"
        ordering = ["min_value", "id"]
        constraints = [
            models.UniqueConstraint(fields=["business", "name"], name="rms_loyalty_tier_name_unique"),
            models.CheckConstraint(condition=Q(multiplier__gte=0), name="rms_loyalty_tier_mult_gte_0"),
        ]

    def __str__(self):
        return self.name


class LoyaltyMember(TenantModel):
    phone = models.CharField("موبایل", max_length=20)
    name = models.CharField("نام", max_length=200, blank=True, default="")
    code = models.CharField("کد عضویت / معرفی", max_length=12, blank=True, default="", db_index=True)
    email = models.EmailField("ایمیل", blank=True, default="")
    birth_date = models.DateField("تاریخ تولد", null=True, blank=True)
    anniversary_date = models.DateField("سالگرد (ازدواج/قرارداد ...)", null=True, blank=True)
    note = models.CharField("یادداشت", max_length=500, blank=True, default="")
    tags = models.JSONField("برچسب‌ها", default=list, blank=True)
    tier = models.ForeignKey(LoyaltyTier, on_delete=models.SET_NULL, null=True, blank=True,
                             related_name="members")
    referred_by = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name="referrals")
    referral_rewarded = models.BooleanField(default=False)
    customer = models.ForeignKey("Customer", on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="loyalty_members", verbose_name="مشتری (تعاریف)")
    points_balance = models.IntegerField("امتیاز فعلی", default=0)
    lifetime_points = models.PositiveIntegerField("امتیاز کل کسب‌شده", default=0)
    wallet_balance = models.DecimalField("اعتبار کیف پول", default=0, **MONEY)
    total_spent = models.DecimalField("جمع خرید", default=0, **MONEY)
    visits = models.PositiveIntegerField("تعداد خرید", default=0)
    last_purchase_at = models.DateTimeField("آخرین خرید", null=True, blank=True)
    sms_opt_in = models.BooleanField("دریافت پیامک", default=True)
    is_active = models.BooleanField("فعال", default=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "عضو باشگاه"
        verbose_name_plural = "اعضای باشگاه"
        ordering = ["-joined_at"]
        constraints = [
            models.UniqueConstraint(fields=["business", "phone"], name="rms_loyalty_member_phone_unique"),
            models.UniqueConstraint(fields=["business", "code"], condition=~Q(code=""),
                                    name="rms_loyalty_member_code_unique"),
            models.CheckConstraint(condition=Q(points_balance__gte=0), name="rms_loyalty_balance_gte_0"),
            models.CheckConstraint(condition=Q(wallet_balance__gte=0), name="rms_loyalty_wallet_gte_0"),
        ]

    def __str__(self):
        return f"{self.name or self.phone}"


class LoyaltyPurchase(TenantModel):
    """یک خرید عضو (از صندوق، فاکتور فروش یا ثبت دستی) — مبنای امتیاز و تحلیل RFM."""

    class Channel(models.TextChoices):
        POS = "pos", "صندوق"
        MANUAL = "manual", "ثبت دستی"
        INVOICE = "invoice", "فاکتور فروش"
        ONLINE = "online", "آنلاین"

    member = models.ForeignKey(LoyaltyMember, on_delete=models.CASCADE, related_name="purchases")
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.MANUAL)
    amount = models.DecimalField("مبلغ ناخالص", **MONEY)
    points_discount = models.DecimalField("تخفیف امتیاز", default=0, **MONEY)
    coupon_discount = models.DecimalField("تخفیف کوپن", default=0, **MONEY)
    wallet_used = models.DecimalField("پرداخت از کیف پول", default=0, **MONEY)
    net_amount = models.DecimalField("مبلغ خالص", **MONEY)
    points_earned = models.IntegerField(default=0)
    points_redeemed = models.IntegerField(default=0)
    items = models.JSONField("اقلام", default=list, blank=True)
    order = models.ForeignKey("Order", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    sales_invoice = models.ForeignKey("SalesInvoice", on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name="+")
    reference = models.CharField("شماره مرجع", max_length=60, blank=True, default="")
    note = models.CharField(max_length=200, blank=True, default="")
    is_void = models.BooleanField("باطل", default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                   blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "خرید عضو"
        verbose_name_plural = "خریدهای اعضا"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["order"], condition=Q(order__isnull=False),
                                    name="rms_loyalty_purchase_one_per_order"),
            models.UniqueConstraint(fields=["sales_invoice"], condition=Q(sales_invoice__isnull=False),
                                    name="rms_loyalty_purchase_one_per_invoice"),
        ]


class LoyaltyTransaction(TenantModel):
    class Kind(models.TextChoices):
        EARN = "earn", "کسب امتیاز"
        REDEEM = "redeem", "استفاده از امتیاز"
        ADJUST = "adjust", "اصلاح دستی"
        WELCOME = "welcome", "امتیاز عضویت"
        EXPIRE = "expire", "انقضای امتیاز"
        REFERRAL = "referral", "معرفی دوست"
        CAMPAIGN = "campaign", "جایزه‌ی کمپین"
        REWARD = "reward", "دریافت جایزه"
        REVERSE = "reverse", "برگشت (ابطال خرید)"

    member = models.ForeignKey(LoyaltyMember, on_delete=models.CASCADE, related_name="transactions")
    points = models.IntegerField("امتیاز (مثبت/منفی)")
    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    order = models.ForeignKey("Order", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    purchase = models.ForeignKey(LoyaltyPurchase, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="transactions")
    remaining = models.IntegerField("مانده‌ی این دسته (برای انقضا)", default=0)
    expires_at = models.DateTimeField("انقضا", null=True, blank=True, db_index=True)
    note = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                   blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "تراکنش امتیاز"
        verbose_name_plural = "تراکنش‌های امتیاز"
        ordering = ["-created_at", "-id"]
        constraints = [
            # هر سفارش فقط یک بار امتیاز بدهد (جلوگیری از تکرار)
            models.UniqueConstraint(fields=["order", "kind"], condition=Q(kind="earn", order__isnull=False),
                                    name="rms_loyalty_one_earn_per_order"),
        ]


class LoyaltyEarnRule(TenantModel):
    """قانون امتیاز اضافه: محصول، دسته، حداقل خرید یا روزهای هفته."""

    class Kind(models.TextChoices):
        PRODUCT = "product", "محصول خاص"
        CATEGORY = "category", "دسته‌ی خاص"
        MIN_AMOUNT = "min_amount", "خرید بالای مبلغ"
        WEEKDAY = "weekday", "روزهای خاص هفته"

    name = models.CharField("نام", max_length=120)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    match = models.CharField("نام محصول/دسته (با , جدا)", max_length=500, blank=True, default="")
    multiplier = models.DecimalField("ضریب", max_digits=5, decimal_places=2, default=1)
    bonus_points = models.PositiveIntegerField("امتیاز ثابت اضافه", default=0)
    min_amount = models.DecimalField("حداقل مبلغ", default=0, **MONEY)
    weekdays = models.JSONField("روزها (۰=دوشنبه ... ۶=یکشنبه)", default=list, blank=True)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "قانون امتیاز"
        verbose_name_plural = "قوانین امتیاز"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(condition=Q(multiplier__gte=0), name="rms_loyalty_rule_mult_gte_0"),
        ]


class LoyaltyReward(TenantModel):
    """کاتالوگ جوایز: با امتیاز معاوضه می‌شود و یک کوپن یک‌بارمصرف می‌سازد."""

    class Kind(models.TextChoices):
        AMOUNT = "amount", "تخفیف مبلغی"
        PERCENT = "percent", "تخفیف درصدی"
        FREE_ITEM = "free_item", "کالا/خدمت رایگان"
        GIFT = "gift", "هدیه"

    name = models.CharField("نام", max_length=120)
    description = models.CharField("توضیح", max_length=300, blank=True, default="")
    points_cost = models.PositiveIntegerField("امتیاز لازم")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.AMOUNT)
    value = models.DecimalField("مقدار", default=0, **MONEY)
    max_discount = models.DecimalField("سقف تخفیف", null=True, blank=True, **MONEY)
    stock = models.PositiveIntegerField("موجودی (خالی=نامحدود)", null=True, blank=True)
    min_tier = models.ForeignKey(LoyaltyTier, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="+")
    valid_days = models.PositiveIntegerField("اعتبار کوپن (روز)", default=30)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "جایزه"
        verbose_name_plural = "جوایز"
        ordering = ["points_cost", "id"]
        constraints = [
            models.CheckConstraint(condition=Q(points_cost__gt=0), name="rms_loyalty_reward_cost_gt_0"),
        ]


class LoyaltyCampaign(TenantModel):
    """کمپین قانون‌محور: تولد، سالگرد، عدم مراجعه یا ارسال به یک بخش مشتریان."""

    class Kind(models.TextChoices):
        BIRTHDAY = "birthday", "تولد"
        ANNIVERSARY = "anniversary", "سالگرد"
        INACTIVITY = "inactivity", "عدم مراجعه"
        SEGMENT = "segment", "بخش مشتریان (یک‌باره)"

    name = models.CharField("نام", max_length=120)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    is_active = models.BooleanField(default=True)
    segment = models.CharField("بخش", max_length=30, blank=True, default="")
    inactivity_days = models.PositiveIntegerField("روز بدون خرید", default=60)
    bonus_points = models.PositiveIntegerField("امتیاز هدیه", default=0)
    coupon_kind = models.CharField("نوع کوپن", max_length=10, blank=True, default="")
    coupon_value = models.DecimalField("مقدار کوپن", default=0, **MONEY)
    coupon_valid_days = models.PositiveIntegerField("اعتبار کوپن (روز)", default=14)
    message = models.CharField("متن پیام", max_length=500, blank=True, default="")
    last_run_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "کمپین باشگاه"
        verbose_name_plural = "کمپین‌های باشگاه"
        ordering = ["-id"]


class LoyaltyCoupon(TenantModel):
    """کد تخفیف عمومی یا شخصی با محدودیت استفاده و بازه‌ی زمانی."""

    class Kind(models.TextChoices):
        AMOUNT = "amount", "مبلغی"
        PERCENT = "percent", "درصدی"
        FREE_ITEM = "free_item", "کالا/خدمت رایگان"

    code = models.CharField("کد", max_length=30)
    title = models.CharField("عنوان", max_length=120, blank=True, default="")
    member = models.ForeignKey(LoyaltyMember, on_delete=models.CASCADE, null=True, blank=True,
                               related_name="coupons")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.AMOUNT)
    value = models.DecimalField("مقدار", default=0, **MONEY)
    max_discount = models.DecimalField("سقف تخفیف", null=True, blank=True, **MONEY)
    min_purchase = models.DecimalField("حداقل خرید", default=0, **MONEY)
    usage_limit = models.PositiveIntegerField("سقف کل استفاده", null=True, blank=True)
    per_member_limit = models.PositiveIntegerField("سقف استفاده‌ی هر عضو", null=True, blank=True)
    members_only = models.BooleanField("فقط اعضا", default=False)
    used_count = models.PositiveIntegerField(default=0)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    reward = models.ForeignKey(LoyaltyReward, on_delete=models.SET_NULL, null=True, blank=True,
                               related_name="coupons")
    campaign = models.ForeignKey(LoyaltyCampaign, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="coupons")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "کوپن تخفیف"
        verbose_name_plural = "کوپن‌های تخفیف"
        ordering = ["-id"]
        constraints = [
            models.UniqueConstraint(fields=["business", "code"], name="rms_loyalty_coupon_code_unique"),
        ]


class LoyaltyCouponUse(TenantModel):
    coupon = models.ForeignKey(LoyaltyCoupon, on_delete=models.CASCADE, related_name="uses")
    member = models.ForeignKey(LoyaltyMember, on_delete=models.SET_NULL, null=True, blank=True,
                               related_name="+")
    purchase = models.ForeignKey(LoyaltyPurchase, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="coupon_uses")
    discount = models.DecimalField(default=0, **MONEY)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "استفاده از کوپن"
        verbose_name_plural = "استفاده‌های کوپن"
        ordering = ["-id"]


class LoyaltyWalletTransaction(TenantModel):
    class Kind(models.TextChoices):
        TOPUP = "topup", "شارژ"
        SPEND = "spend", "خرید"
        REFUND = "refund", "برگشت"
        ADJUST = "adjust", "اصلاح"

    member = models.ForeignKey(LoyaltyMember, on_delete=models.CASCADE, related_name="wallet_transactions")
    amount = models.DecimalField("مبلغ (مثبت/منفی)", **MONEY)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    balance_after = models.DecimalField(default=0, **MONEY)
    purchase = models.ForeignKey(LoyaltyPurchase, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="+")
    note = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                   blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "تراکنش کیف پول"
        verbose_name_plural = "تراکنش‌های کیف پول"
        ordering = ["-created_at", "-id"]


class LoyaltyCampaignLog(TenantModel):
    """هر عضو در هر اجرای کمپین (مثلاً تولد امسال) فقط یک بار."""

    campaign = models.ForeignKey(LoyaltyCampaign, on_delete=models.CASCADE, related_name="logs")
    member = models.ForeignKey(LoyaltyMember, on_delete=models.CASCADE, related_name="+")
    run_key = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "اجرای کمپین"
        verbose_name_plural = "اجراهای کمپین"
        constraints = [
            models.UniqueConstraint(fields=["campaign", "member", "run_key"],
                                    name="rms_loyalty_campaign_once"),
        ]


class LoyaltyMessage(TenantModel):
    """صندوق خروجی پیام‌ها (پیامک/اعلان) — ارسال واقعی از طریق رابط ارائه‌دهنده."""

    class Status(models.TextChoices):
        QUEUED = "queued", "در صف"
        SENT = "sent", "ارسال شد"
        LOGGED = "logged", "ثبت شد (بدون ارائه‌دهنده)"
        SKIPPED = "skipped", "رد شد"
        FAILED = "failed", "ناموفق"

    member = models.ForeignKey(LoyaltyMember, on_delete=models.SET_NULL, null=True, blank=True,
                               related_name="messages")
    campaign = models.ForeignKey(LoyaltyCampaign, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="messages")
    phone = models.CharField(max_length=20)
    body = models.CharField(max_length=600)
    channel = models.CharField(max_length=10, default="sms")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.QUEUED)
    provider = models.CharField(max_length=40, blank=True, default="")
    error = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "پیام باشگاه"
        verbose_name_plural = "پیام‌های باشگاه"
        ordering = ["-id"]
