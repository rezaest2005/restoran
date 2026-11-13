"""Activity log: an append-only record of what happened in a business (who, what, when, to what)."""

from django.conf import settings
from django.db import models

from ..tenancy import TenantModel


class ActivityLog(TenantModel):
    class Category(models.TextChoices):
        DELIVERY = "delivery", "حمل و تحویل"
        POS = "pos", "صندوق و سفارش‌ها"
        INVENTORY = "inventory", "انبار"
        ACCOUNTING = "accounting", "حسابداری"
        DEFINITIONS = "definitions", "تعاریف"
        PRODUCTION = "production", "تولید"
        USERS = "users", "کاربران و دسترسی"
        AUTH = "auth", "ورود و خروج"
        SYSTEM = "system", "سامانه"

    category = models.CharField(max_length=20, choices=Category.choices, db_index=True)
    action = models.CharField(max_length=60, db_index=True)           # "trip.created", "stop.delivered" ...
    summary = models.CharField(max_length=500)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actor_name = models.CharField(max_length=150, blank=True, default="")     # kept even if the user is deleted later
    actor_role = models.CharField(max_length=20, blank=True, default="")
    driver = models.ForeignKey("Driver", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    target_type = models.CharField(max_length=40, blank=True, default="")
    target_id = models.BigIntegerField(null=True, blank=True)
    details = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "رویداد"
        verbose_name_plural = "تاریخچه‌ی رویدادها"
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["business", "-created_at"]),
            models.Index(fields=["business", "category", "-created_at"]),
            models.Index(fields=["business", "driver", "-created_at"]),
        ]

    def save(self, *args, **kwargs):
        if self.pk is not None and not kwargs.get("force_insert"):
            raise PermissionError("رویدادهای ثبت‌شده قابل ویرایش نیستند.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("رویدادهای ثبت‌شده قابل حذف نیستند.")

    def __str__(self):
        return f"{self.action}: {self.summary[:60]}"
