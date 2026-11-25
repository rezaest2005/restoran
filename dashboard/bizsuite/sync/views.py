"""Sync API: pull (delta with tombstones), push (batch of mutations), status, per-business switch."""
import logging

from django.core.cache import cache
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..views.common import StaffAuth, staff_business
from . import changelog, config
from .models import SyncChange, SyncCounter
from .push import apply_one
from .registry import ENTITIES, ORDER, allowed_entities, base_queryset

logger = logging.getLogger(__name__)


def sync_enabled(business) -> bool:
    """Local mode is part of the product: it is on for every business (there is no switch any more)."""
    return True


def _limited(user, kind, limit):
    """Fixed-window per-user rate limit (one minute). Returns the seconds to wait, or 0."""
    now = int(timezone.now().timestamp())
    key = f"sync:rl:{kind}:{user.pk}:{now // 60}"
    try:
        n = cache.incr(key)
    except ValueError:
        cache.add(key, 1, 70)
        n = 1
    return (60 - now % 60) if n > limit else 0


def _err(status, code, message, **extra):
    return Response({"success": False, "code": code, "error": message, **extra}, status=status)


def _gate(request, kind, limit):
    business = staff_business(request)
    if business is None:
        return None, _err(400, "no_business", "کسب‌وکاری برای این کاربر تعریف نشده است.")
    if not sync_enabled(business):
        return None, _err(403, "sync_disabled", "همگام‌سازی محلی برای این کسب‌وکار فعال نیست.")
    wait = _limited(request.user, kind, limit)
    if wait:
        r = _err(429, "rate_limited", "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.", retry_after=wait)
        r["Retry-After"] = str(wait)
        return None, r
    return business, None


# cursors: ""/"0" = start; "<n>" = delta after change n; "s<snap>:<entity index>:<last id>" = initial snapshot
def _parse_cursor(raw):
    raw = (raw or "").strip()
    if raw in ("", "0"):
        return ("start", None)
    if raw.startswith("s"):
        try:
            snap, ei, last = raw[1:].split(":")
            return ("snap", (int(snap), int(ei), int(last)))
        except ValueError:
            return ("bad", None)
    try:
        return ("delta", max(0, int(raw)))
    except ValueError:
        return ("bad", None)


def _snapshot_page(business, user, wanted, cur, kind, limit):
    snap, ei, last = (changelog.current_seq(business.pk), 0, 0) if kind == "start" else cur
    changes = []
    while ei < len(wanted) and len(changes) < limit:
        name = wanted[ei]
        room = limit - len(changes)
        rows = list(base_queryset(name, business, user).filter(pk__gt=last).order_by("pk")[:room])
        if rows:
            data = ENTITIES[name].serialize(business, user, rows)
            changes += [{"seq": None, "entity": name, "id": r.pk, "deleted": False, "data": data[r.pk]} for r in rows]
            last = rows[-1].pk
        if len(rows) < room:                 # this entity is exhausted
            ei, last = ei + 1, 0
    done = ei >= len(wanted)
    return changes, not done, (str(snap) if done else f"s{snap}:{ei}:{last}")


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([IsAuthenticated])
def pull(request):
    business, err = _gate(request, "pull", config.PULL_PER_MIN)
    if err:
        return err
    user = request.user
    allowed = allowed_entities(user)
    asked = [e for e in (request.query_params.get("entities") or "").split(",") if e in ENTITIES]
    wanted = [e for e in ORDER if e in allowed and (not asked or e in asked)]
    denied = [e for e in asked if e not in allowed]
    try:
        limit = max(1, min(int(request.query_params.get("limit") or config.PULL_PAGE), config.PULL_PAGE_MAX))
    except ValueError:
        limit = config.PULL_PAGE
    kind, cur = _parse_cursor(request.query_params.get("cursor"))
    if kind == "bad":
        return _err(400, "bad_cursor", "cursor is invalid")
    base = {"success": True, "entities": allowed, "denied": denied, "server_time": timezone.now().isoformat()}

    if kind in ("start", "snap"):
        changes, more, cursor = _snapshot_page(business, user, wanted, cur, kind, limit)
        return Response({**base, "changes": changes, "snapshot": True, "has_more": more, "reset": False,
                         "cursor": cursor})

    counter = SyncCounter.objects.filter(business=business).first()
    if cur < (counter.floor_seq if counter else 0):
        return Response({**base, "changes": [], "has_more": False, "reset": True, "cursor": "0"})
    rows = list(SyncChange.objects.filter(business=business, seq__gt=cur, entity__in=wanted)
                .order_by("seq")[: limit + 1])
    more = len(rows) > limit
    rows = rows[:limit]
    by_entity = {}
    for r in rows:
        if not r.deleted:
            by_entity.setdefault(r.entity, []).append(r.object_id)
    data = {}
    for name, ids in by_entity.items():
        objs = list(base_queryset(name, business, user).filter(pk__in=ids))
        data[name] = ENTITIES[name].serialize(business, user, objs)
    changes = []
    for r in rows:
        if r.deleted:
            changes.append({"seq": r.seq, "entity": r.entity, "id": r.object_id, "deleted": True, "data": None})
            continue
        d = data.get(r.entity, {}).get(r.object_id)
        if d is not None:
            changes.append({"seq": r.seq, "entity": r.entity, "id": r.object_id, "deleted": False, "data": d})
        elif not ENTITIES[r.entity].model.all_objects.filter(business=business, pk=r.object_id).exists():
            changes.append({"seq": r.seq, "entity": r.entity, "id": r.object_id, "deleted": True, "data": None})
        # else: it exists but is outside this user's window: not sent
    new_cursor = rows[-1].seq if rows else cur
    return Response({**base, "changes": changes, "has_more": more, "reset": False, "cursor": str(new_cursor)})


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([IsAuthenticated])
def push(request):
    business, err = _gate(request, "push", config.PUSH_PER_MIN)
    if err:
        return err
    if len(request.body or b"") > config.MAX_PUSH_BYTES:
        return _err(413, "too_large", "حجم درخواست بیش از حد مجاز است.", max_bytes=config.MAX_PUSH_BYTES)
    muts = request.data.get("mutations") if hasattr(request.data, "get") else None
    if not isinstance(muts, list) or not muts:
        return _err(400, "invalid", "mutations must be a non-empty list")
    if len(muts) > config.MAX_PUSH_ITEMS:
        return _err(413, "too_many", "تعداد تغییرات در یک درخواست بیش از حد مجاز است.",
                    max_items=config.MAX_PUSH_ITEMS)
    results = []
    for m in muts:
        if not isinstance(m, dict):
            results.append({"id": "", "status": "rejected", "code": "invalid", "error": "invalid mutation"})
            continue
        results.append(apply_one(request, business, m))
    return Response({"success": True, "results": results, "last_seq": changelog.current_seq(business.pk),
                     "server_time": timezone.now().isoformat()})


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([IsAuthenticated])
def status(request):
    from ..subscription import payload as sub_payload
    business = staff_business(request)
    if business is None:
        return _err(400, "no_business", "کسب‌وکاری برای این کاربر تعریف نشده است.")
    counter = SyncCounter.objects.filter(business=business).first()
    return Response({
        "success": True, "enabled": sync_enabled(business), "business_id": business.pk,
        "last_seq": counter.last_seq if counter else 0, "floor_seq": counter.floor_seq if counter else 0,
        "entities": allowed_entities(request.user), "server_time": timezone.now().isoformat(),
        "subscription": sub_payload(business),
        "limits": {"max_push_items": config.MAX_PUSH_ITEMS, "max_push_bytes": config.MAX_PUSH_BYTES,
                   "pull_page": config.PULL_PAGE, "order_window_days": config.ORDER_WINDOW_DAYS},
    })


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([IsAuthenticated])
def settings_view(request):
    """Read-only: local mode is always on (kept so older clients that read it keep working)."""
    business = staff_business(request)
    if business is None:
        return _err(400, "no_business", "کسب‌وکاری برای این کاربر تعریف نشده است.")
    return Response({"success": True, "enabled": True})
