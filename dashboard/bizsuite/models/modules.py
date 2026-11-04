"""Module catalogue, plans and per-business subscriptions."""

from __future__ import annotations

from django.db import models


class Module(models.Model):
    code = models.SlugField(max_length=30, unique=True)
    name_fa = models.CharField(max_length=100)
    name_en = models.CharField(max_length=100)
    price_monthly = models.PositiveBigIntegerField(default=0)
    is_core = models.BooleanField(default=False)
    requires = models.JSONField(default=list, blank=True)
    suggests = models.JSONField(default=list, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "code"]

    def __str__(self):
        return self.code


class Plan(models.Model):
    code = models.SlugField(max_length=30, unique=True)
    name_fa = models.CharField(max_length=100)
    name_en = models.CharField(max_length=100)
    price_monthly = models.PositiveBigIntegerField(default=0)
    modules = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["price_monthly", "code"]

    def __str__(self):
        return self.code


class BusinessModule(models.Model):
    business = models.ForeignKey(
        "Business", on_delete=models.CASCADE, related_name="module_subscriptions"
    )
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="subscriptions")
    is_enabled = models.BooleanField(default=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    price_override = models.PositiveBigIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["business", "module"], name="bizmodule_unique"),
        ]
