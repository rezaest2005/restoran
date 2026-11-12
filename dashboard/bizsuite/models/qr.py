"""QR links: a short, permanent address printed on the QR; where it leads is changed from the super admin."""

from __future__ import annotations

import secrets

from django.db import models

from ..tenancy import TenantModel

_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"   # no look-alikes (i l o 0 1)


def new_qr_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(8))


class QrLink(TenantModel):
    class Kind(models.TextChoices):
        MENU = "menu", "منوی QR داخلی"
        STOREFRONT = "storefront", "وب‌سایت منتشرشده"
        CUSTOM = "custom", "آدرس دلخواه"

    code = models.CharField(max_length=16, unique=True, default=new_qr_code, db_index=True)
    label = models.CharField("برچسب", max_length=120, blank=True, default="")
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.MENU)
    custom_url = models.CharField("آدرس مقصد", max_length=500, blank=True, default="")
    table_number = models.CharField("شماره میز", max_length=20, blank=True, default="")
    is_active = models.BooleanField(default=True)
    scans = models.PositiveIntegerField(default=0)
    last_scan_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "لینک QR"
        verbose_name_plural = "لینک‌های QR"
        ordering = ["business_id", "id"]

    def __str__(self):
        return f"{self.code} → {self.kind}"
