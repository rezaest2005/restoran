"""Restaurant models: feedback."""

from __future__ import annotations

from django.db import models

from ..tenancy import TenantModel


# ═══════════════════════════════════════════
#  ثبت نظرات / گزارش مشکل مشتریان
# ═══════════════════════════════════════════


class Feedback(TenantModel):
    CATEGORY_CHOICES = [
        ("bug", "مشکل / خطا"),
        ("suggestion", "پیشنهاد"),
        ("complaint", "شکایت"),
        ("other", "سایر"),
    ]
    STATUS_CHOICES = [
        ("open", "باز"),
        ("in_progress", "در حال بررسی"),
        ("resolved", "حل‌شده"),
    ]

    category = models.CharField(
        "دسته‌بندی", max_length=20, choices=CATEGORY_CHOICES, default="complaint"
    )
    name = models.CharField("نام", max_length=100, blank=True, default="")
    phone = models.CharField("تلفن", max_length=20, blank=True, default="")
    message = models.TextField("متن پیام", max_length=2000)
    status = models.CharField(
        "وضعیت", max_length=20, choices=STATUS_CHOICES, default="open"
    )
    admin_note = models.TextField("یادداشت مدیر", blank=True, default="")
    created_at = models.DateTimeField("تاریخ ثبت", auto_now_add=True)
    updated_at = models.DateTimeField("تاریخ بروزرسانی", auto_now=True)
    resolved_at = models.DateTimeField("تاریخ حل", null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "نظر / گزارش مشکل"
        verbose_name_plural = "نظرات و گزارش‌ها"

    def __str__(self):
        return f"{self.get_category_display()} — {self.message[:30]}"
