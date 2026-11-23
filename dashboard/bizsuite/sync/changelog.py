"""
Per-business change log.

Hooks (signals) call ``touch`` / ``tombstone``; the entries are collected per database transaction and written AFTER
the surrounding transaction commits (so a rolled-back change is never announced, and the counter row lock is held
only for a moment, which also avoids lock-order deadlocks with the stock/price row locks of the host code).
Numbers are handed out under a row lock on the business counter, so ``seq`` is strictly increasing in commit order.
"""
import logging

from django.db import connection, transaction

from .models import SyncChange, SyncCounter

logger = logging.getLogger(__name__)

_PENDING_ATTR = "_sync_pending"


def _record(business_id, entity, object_id, deleted):
    """Collect the entry in the dict that belongs to the CURRENT transaction (a rolled-back transaction drops its
    on-commit callback, so its dict is never written and is detected as stale here)."""
    if not business_id or object_id is None:
        return
    try:
        cur = getattr(connection, _PENDING_ATTR, None)
        live = cur is not None and not cur[2].get('done') and any(fn is cur[1] for _sids, fn, *_ in connection.run_on_commit)
        if live:
            cur[0][(business_id, entity, int(object_id))] = bool(deleted)
            return
        entries = {(business_id, entity, int(object_id)): bool(deleted)}

        state = {}

        def _flush():
            state["done"] = True
            try:
                write(entries)
            except Exception:
                logger.exception("sync: could not write the change log")

        setattr(connection, _PENDING_ATTR, (entries, _flush, state))
        transaction.on_commit(_flush)
    except Exception:                                    # the log must never break the operation that is being logged
        logger.exception("sync: could not record %s %s", entity, object_id)


def touch(business_id, entity, object_id):
    _record(business_id, entity, object_id, False)


def tombstone(business_id, entity, object_id):
    _record(business_id, entity, object_id, True)


def touch_products_of_items(business_id, item_ids):
    """Stock of linked products lives in the inventory ledger: a movement of an item changes those products."""
    if not item_ids:
        return
    from ..models import Food
    for fid in Food.all_objects.filter(business_id=business_id, item_id__in=list(item_ids)).values_list("pk", flat=True):
        touch(business_id, "product", fid)


def write(entries):
    """entries: {(business_id, entity, object_id): deleted}. One short transaction per business."""
    by_biz = {}
    for (biz, entity, oid), deleted in entries.items():
        by_biz.setdefault(biz, []).append((entity, oid, deleted))
    for biz, rows in by_biz.items():
        with transaction.atomic():
            SyncCounter.objects.get_or_create(business_id=biz)
            counter = SyncCounter.objects.select_for_update().get(business_id=biz)
            seq = counter.last_seq
            existing = {(c.entity, c.object_id): c for c in SyncChange.objects.filter(
                business_id=biz, entity__in={r[0] for r in rows}, object_id__in={r[1] for r in rows})}
            new, upd = [], []
            for entity, oid, deleted in rows:
                seq += 1
                cur = existing.get((entity, oid))
                if cur is None:
                    new.append(SyncChange(business_id=biz, entity=entity, object_id=oid, seq=seq, deleted=deleted))
                else:
                    cur.seq, cur.deleted = seq, deleted
                    upd.append(cur)
            if new:
                SyncChange.objects.bulk_create(new)
            if upd:
                SyncChange.objects.bulk_update(upd, ["seq", "deleted"])
            counter.last_seq = seq
            counter.save(update_fields=["last_seq"])


def current_seq(business_id) -> int:
    return SyncCounter.objects.filter(business_id=business_id).values_list("last_seq", flat=True).first() or 0


def prune_tombstones_below(business_id, seq) -> int:
    """Delete tombstones with number <= seq and raise the floor, so clients behind it re-sync fully."""
    with transaction.atomic():
        n, _ = SyncChange.objects.filter(business_id=business_id, deleted=True, seq__lte=seq).delete()
        if n:
            counter = SyncCounter.objects.select_for_update().filter(business_id=business_id).first()
            if counter and counter.floor_seq < seq:
                counter.floor_seq = seq
                counter.save(update_fields=["floor_seq"])
    return n
