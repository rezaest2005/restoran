"""Platform support: a business reports a problem or asks a question; the platform owner answers."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from ..tenancy import TenantModel


class SupportTicket(TenantModel):
    CATEGORY_CHOICES = [
        ("bug", "مشکل / خطا"),
        ("question", "پرسش"),
        ("request", "درخواست"),
        ("billing", "مالی"),
    ]
    PRIORITY_CHOICES = [("normal", "عادی"), ("high", "زیاد")]
    STATUS_CHOICES = [
        ("open", "باز"),
        ("in_progress", "در حال بررسی"),
        ("answered", "پاسخ داده شده"),
        ("resolved", "حل‌شده"),
    ]

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    subject = models.CharField("موضوع", max_length=200)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="question")
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default="normal")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_activity_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-last_activity_at", "-id"]
        verbose_name = "تیکت پشتیبانی"
        verbose_name_plural = "تیکت‌های پشتیبانی"

    def __str__(self):
        return f"#{self.pk} {self.subject}"


class SupportMessage(models.Model):
    KIND_CHOICES = [("business", "کسب‌وکار"), ("platform", "پشتیبانی")]

    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name="messages")
    author_kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    body = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.author_kind}: {self.body[:30]}"
