"""Durable background job queue processed by ``manage.py run_jobs``."""

from __future__ import annotations

from django.db import models
from django.utils import timezone


class BackgroundJob(models.Model):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    STATUS_CHOICES = [
        (PENDING, "در انتظار"),
        (RUNNING, "در حال اجرا"),
        (DONE, "انجام‌شده"),
        (FAILED, "ناموفق"),
    ]

    kind = models.CharField("نوع", max_length=64)
    payload = models.JSONField("داده", default=dict, blank=True)
    status = models.CharField("وضعیت", max_length=10, choices=STATUS_CHOICES, default=PENDING)
    attempts = models.PositiveIntegerField("تعداد تلاش", default=0)
    max_attempts = models.PositiveIntegerField("حداکثر تلاش", default=5)
    last_error = models.TextField("آخرین خطا", blank=True, default="")
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)
    run_after = models.DateTimeField("اجرا پس از", default=timezone.now)
    locked_at = models.DateTimeField("زمان قفل", null=True, blank=True)

    class Meta:
        verbose_name = "کار پس‌زمینه"
        verbose_name_plural = "کارهای پس‌زمینه"
        ordering = ["run_after", "id"]
        indexes = [models.Index(fields=["status", "run_after"])]

    def __str__(self):
        return f"{self.kind}#{self.pk} [{self.status}]"
