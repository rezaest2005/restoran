"""Restaurant models: club."""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q

from ..tenancy import TenantModel


# ═══════════════════════════════════════════════════════════
#  باشگاه مشتریان (امتیاز وفاداری) — مستقل از صنعت
# ═══════════════════════════════════════════════════════════


class LoyaltySettings(TenantModel):
    """تنظیمات باشگاه؛ برای هر کسب‌وکار یک ردیف."""

    is_active = models.BooleanField("باشگاه فعال", default=False)
    earn_amount = models.PositiveIntegerField(
        "مبلغ خرید برای هر ۱ امتیاز", default=10000
    )
    redeem_value = models.PositiveIntegerField(
        "ارزش هر امتیاز هنگام استفاده", default=1000
    )
    min_redeem_points = models.PositiveIntegerField("حداقل امتیاز برای استفاده", default=10)
    welcome_points = models.PositiveIntegerField("امتیاز عضویت", default=0)
    silver_points = models.PositiveIntegerField("آستانه‌ی سطح نقره‌ای (امتیاز کل)", default=500)
    gold_points = models.PositiveIntegerField("آستانه‌ی سطح طلایی (امتیاز کل)", default=2000)

    class Meta:
        verbose_name = "تنظیمات باشگاه مشتریان"
        verbose_name_plural = "تنظیمات باشگاه مشتریان"
        constraints = [
            models.UniqueConstraint(fields=["restaurant"], name="rms_loyalty_settings_one"),
            models.CheckConstraint(
                condition=Q(earn_amount__gt=0), name="rms_loyalty_earn_gt_0"
            ),
        ]


class LoyaltyMember(TenantModel):
    phone = models.CharField("موبایل", max_length=20)
    name = models.CharField("نام", max_length=200, blank=True, default="")
    points_balance = models.IntegerField("امتیاز فعلی", default=0)
    lifetime_points = models.PositiveIntegerField("امتیاز کل کسب‌شده", default=0)
    is_active = models.BooleanField("فعال", default=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "عضو باشگاه"
        verbose_name_plural = "اعضای باشگاه"
        ordering = ["-joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["restaurant", "phone"], name="rms_loyalty_member_phone_unique"
            ),
            models.CheckConstraint(
                condition=Q(points_balance__gte=0), name="rms_loyalty_balance_gte_0"
            ),
        ]

    def __str__(self):
        return f"{self.name or self.phone}"


class LoyaltyTransaction(TenantModel):
    class Kind(models.TextChoices):
        EARN = "earn", "کسب امتیاز"
        REDEEM = "redeem", "استفاده از امتیاز"
        ADJUST = "adjust", "اصلاح دستی"
        WELCOME = "welcome", "امتیاز عضویت"

    member = models.ForeignKey(
        LoyaltyMember, on_delete=models.CASCADE, related_name="transactions"
    )
    points = models.IntegerField("امتیاز (مثبت/منفی)")
    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    order = models.ForeignKey(
        "Order", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    note = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "تراکنش امتیاز"
        verbose_name_plural = "تراکنش‌های امتیاز"
        ordering = ["-created_at", "-id"]
        constraints = [
            # هر سفارش فقط یک بار امتیاز بدهد (جلوگیری از تکرار)
            models.UniqueConstraint(
                fields=["order", "kind"],
                condition=Q(kind="earn", order__isnull=False),
                name="rms_loyalty_one_earn_per_order",
            ),
        ]
