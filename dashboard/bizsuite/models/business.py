"""Business models: business."""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone

from ..tenancy import invalidate_business_cache
from .common import created_at_field, is_active_field, name_field, phone_field


# ═══════════════════════════════════════════
#  SHARED MODELS
# ═══════════════════════════════════════════


class Business(models.Model):
    tenant = models.ForeignKey(
        "Tenant",
        on_delete=models.CASCADE,
        related_name="businesses",
        verbose_name="مستأجر",
        null=True,
        blank=True,
    )
    name = name_field(max_length=200, verbose_name="نام کسب‌وکار")
    slug = models.SlugField(
        "شناسه URL",
        max_length=50,
        unique=True,
        help_text="آدرس کسب‌وکار — مثلاً: 1، 200، demo-co، hamid",
    )
    phone = phone_field(verbose_name="تلفن")
    address = models.TextField("آدرس", blank=True)
    logo = models.ImageField(
        "لوگو", upload_to="businesses/logos/", blank=True, null=True
    )
    username_prefix = models.CharField(
        "پیشوند نام کاربری",
        max_length=5,
        default="",
        blank=True,
        help_text="حرف اول نام کاربری مالک — برای ساخت نام کاربری کارمندان (مثلاً: z)",
    )

    # تب‌هایی که سوپرادمین برای این کسب‌وکار خاموش کرده است (به‌علاوه‌ی ماژول‌های خریداری‌نشده).
    # خالی = همه‌ی تب‌های ماژول‌های فعال. منطق در features.py
    disabled_features = models.JSONField(
        "تب‌های غیرفعال‌شده",
        default=list,
        blank=True,
        help_text="کلید تب‌هایی که برای این حساب فروخته نشده‌اند",
    )

    # اشتراک کل داشبورد: لحظه‌ی دقیق پایان (تا ثانیه). خالی = بدون تاریخ. منطق در subscription.py
    subscription_plan = models.CharField(
        "نوع اشتراک", max_length=12, default="unlimited",
        choices=[("unlimited", "بدون تاریخ"), ("monthly", "یک‌ماهه"), ("quarterly", "سه‌ماهه"),
                 ("semiannual", "شش‌ماهه"), ("yearly", "سالانه"), ("custom", "تاریخ دلخواه")],
    )
    subscription_started_at = models.DateTimeField("شروع اشتراک", null=True, blank=True)
    subscription_ends_at = models.DateTimeField("پایان اشتراک", null=True, blank=True, db_index=True)

    is_active = is_active_field(verbose_name="فعال")
    created_at = created_at_field(verbose_name="تاریخ ایجاد")

    class Meta:
        verbose_name = "کسب‌وکار"
        verbose_name_plural = "کسب‌وکارها"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.slug})"


@receiver(post_save, sender=Business)
@receiver(post_delete, sender=Business)
def _invalidate_business_cache(sender, instance, **kwargs):
    invalidate_business_cache(instance.slug)


# ─── 10. KITCHEN MANAGEMENT ──────────────


class Tenant(models.Model):
    name = models.CharField(max_length=200, verbose_name="نام کسب‌وکار")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,  # ★ FIXED: حذف کاربر دیگر کل مستأجر را پاک نمی‌کند
        related_name="owned_tenants",
        verbose_name="مالک",
    )
    phone = models.CharField(max_length=20, blank=True, default="")
    address = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    def _live_services(self):
        """سرویس‌های فعال و منقضی‌نشده."""
        now = timezone.now()
        today = timezone.localdate()
        return (
            self.services.filter(is_enabled=True)
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .filter(Q(end_date__isnull=True) | Q(end_date__gte=today))
        )

    @property
    def active_services_count(self):
        return self._live_services().count()

    @property
    def monthly_revenue(self):
        return sum(ts.price for ts in self._live_services())
