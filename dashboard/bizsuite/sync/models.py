"""Sync models: per-business cursor counter, change log (one row per object), push receipts, per-business switch."""
from django.conf import settings
from django.db import models


class SyncCounter(models.Model):
    """Last allocated change number of a business (row-locked while numbers are handed out)."""

    business = models.OneToOneField("bizsuite.Business", on_delete=models.CASCADE, related_name="+")
    last_seq = models.BigIntegerField(default=0)
    floor_seq = models.BigIntegerField(default=0, help_text="tombstones up to this number were pruned")

    class Meta:
        app_label = "bizsuite"


class SyncChange(models.Model):
    """The latest change of one object: (business, entity, object_id) is unique, ``seq`` moves forward on every change."""

    business = models.ForeignKey("bizsuite.Business", on_delete=models.CASCADE, related_name="+")
    entity = models.CharField(max_length=20)
    object_id = models.BigIntegerField()
    seq = models.BigIntegerField()
    deleted = models.BooleanField(default=False)

    class Meta:
        app_label = "bizsuite"
        constraints = [models.UniqueConstraint(fields=["business", "entity", "object_id"], name="uniq_sync_change_obj")]
        indexes = [models.Index(fields=["business", "seq"], name="sync_change_biz_seq")]


class SyncReceipt(models.Model):
    """Idempotency record of a pushed mutation (same key twice = the stored result, never a second order)."""

    PENDING, OK, CONFLICT, REJECTED = "pending", "ok", "conflict", "rejected"

    business = models.ForeignKey("bizsuite.Business", on_delete=models.CASCADE, related_name="+")
    key = models.CharField(max_length=100)
    kind = models.CharField(max_length=30)
    entity_id = models.CharField(max_length=64, blank=True, default="")     # the client UUID of the thing created
    status = models.CharField(max_length=10, default=PENDING)
    code = models.CharField(max_length=40, blank=True, default="")
    server_id = models.BigIntegerField(null=True, blank=True)
    result = models.JSONField(default=dict, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "bizsuite"
        constraints = [models.UniqueConstraint(fields=["business", "key"], name="uniq_sync_receipt_key")]
        indexes = [models.Index(fields=["business", "kind", "entity_id"], name="sync_receipt_entity")]


class SyncSettings(models.Model):
    """Unused since local mode became always-on (kept so no migration is needed)."""

    business = models.OneToOneField("bizsuite.Business", on_delete=models.CASCADE, related_name="+")
    enabled = models.BooleanField(null=True, blank=True)

    class Meta:
        app_label = "bizsuite"
