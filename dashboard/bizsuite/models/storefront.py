"""Storefront (no-code public website) models."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from ..tenancy import TenantModel


class StorefrontTemplate(models.Model):
    """Global starting point created by the super admin (not tenant scoped)."""

    key = models.SlugField("key", max_length=50, unique=True)
    name_fa = models.CharField(max_length=100)
    name_en = models.CharField(max_length=100)
    thumbnail = models.CharField(max_length=300, blank=True, default="")
    default_theme = models.JSONField(default=dict)
    section_schema = models.JSONField(default=dict)
    default_sections = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "key"]

    def __str__(self):
        return self.key


class Storefront(TenantModel):
    """One row per business. Draft lives in theme/sections; the published
    snapshot lives in published_data and is what the public API serves."""

    template = models.ForeignKey(
        StorefrontTemplate, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="storefronts",
    )
    slug = models.SlugField(max_length=50, unique=True)
    custom_domain = models.CharField(max_length=253, unique=True, null=True, blank=True)
    content_language = models.CharField(max_length=5, default="fa")
    is_published = models.BooleanField(default=False)
    theme = models.JSONField(default=dict)
    sections = models.JSONField(default=list)
    published_data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["business"], name="storefront_one_per_business"),
        ]

    def __str__(self):
        return self.slug


class StorefrontRevision(TenantModel):
    storefront = models.ForeignKey(
        Storefront, on_delete=models.CASCADE, related_name="revisions"
    )
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )

    class Meta:
        ordering = ["-created_at", "-id"]


class StorefrontAsset(TenantModel):
    file = models.ImageField(upload_to="storefront/")
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
