"""
Writing the activity log.

* ``log(...)``      — explicit, rich events from services (trips, stops, settlements ...).
* ``@audit(...)``   — wraps a mutating API view: when it succeeds, one event is recorded with the main fields of the
                      request (passwords and tokens are never stored).

Logging must never break the action being logged: every failure is swallowed (and reported to the Python log).
"""

from __future__ import annotations

import json
import logging
from functools import wraps

logger = logging.getLogger(__name__)

SECRET_WORDS = ("pass", "token", "secret", "otp", "key", "card")
SUMMARY_FIELDS = ("name", "title", "username", "supplier_name", "customer_name", "item_name", "label", "amount",
                  "quantity", "price", "total", "role", "slug", "status", "note")
MAX_DETAIL_KEYS = 30


def _clean(value, limit=300):
    try:
        text = json.loads(json.dumps(value, default=str, ensure_ascii=False))
    except (TypeError, ValueError):
        text = str(value)
    if isinstance(text, str):
        return text[:limit]
    return text


def sanitize(data) -> dict:
    """Request fields that are safe and useful to keep (no secrets, bounded size)."""
    out = {}
    try:
        items = list(data.items())
    except AttributeError:
        return out
    for k, v in items[:MAX_DETAIL_KEYS * 2]:
        if any(w in str(k).lower() for w in SECRET_WORDS) or hasattr(v, "read"):
            continue
        out[str(k)[:60]] = _clean(v)
        if len(out) >= MAX_DETAIL_KEYS:
            break
    return out


def _ip(request):
    if request is None:
        return None
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return (fwd.split(",")[0].strip() or request.META.get("REMOTE_ADDR") or None) if request else None


def log(business, category, action, summary, actor=None, driver=None, target=None, details=None, request=None):
    """Record one event. ``target`` may be a model instance or a (type, id) pair. Returns the row or None."""
    if business is None:
        return None
    try:
        from .models import ActivityLog
        t_type = t_id = None
        if target is not None:
            if isinstance(target, tuple):
                t_type, t_id = target
            else:
                t_type, t_id = target.__class__.__name__.lower(), getattr(target, "pk", None)
        name = ""
        role = ""
        if actor is not None:
            name = (actor.get_full_name() or actor.username)[:150]
            role = getattr(actor, "role", "") or ""
        return ActivityLog.all_objects.create(
            business=business, category=category, action=action[:60], summary=str(summary)[:500], actor=actor,
            actor_name=name, actor_role=role[:20], driver=driver, target_type=(t_type or "")[:40], target_id=t_id,
            details=_clean(details or {}, 2000) if details else {}, ip=_ip(request),
        )
    except Exception:
        logger.exception("activity log failed: %s", action)
        return None


def _response_ok(resp) -> bool:
    status = getattr(resp, "status_code", 200)
    if status >= 400:
        return False
    body = getattr(resp, "data", None)
    if body is None and getattr(resp, "content", None):
        try:
            body = json.loads(resp.content[:4000])
        except (ValueError, TypeError):
            body = None
    if isinstance(body, dict) and body.get("success") is False:
        return False
    return True


def audit(category, action, label):
    """Decorator for mutating API views (place it right above ``def``, below @api_view / @permission_classes)."""
    def deco(view):
        @wraps(view)
        def inner(request, *args, **kwargs):
            resp = view(request, *args, **kwargs)
            try:
                method = (getattr(request, "method", "") or "").upper()
                if method in ("POST", "PUT", "PATCH", "DELETE") and _response_ok(resp):
                    from .views.common import staff_business
                    user = request.user if getattr(request.user, "is_authenticated", False) else None
                    biz = staff_business(request) or getattr(user, "business", None)
                    data = getattr(request, "data", None) or {}
                    parts = []
                    for f in SUMMARY_FIELDS:
                        v = data.get(f) if hasattr(data, "get") else None
                        if v not in (None, "") and not any(w in f for w in SECRET_WORDS):
                            parts.append(f"{f}={_clean(v, 60)}")
                        if len(parts) >= 4:
                            break
                    verb = {"POST": "", "PUT": " (ویرایش)", "PATCH": " (ویرایش)", "DELETE": " (حذف)"}[method]
                    summary = label + verb + (": " + "، ".join(parts) if parts else "")
                    ident = kwargs.get("pk") or kwargs.get("id")
                    log(biz, category, f"{action}.{method.lower()}", summary, actor=user,
                        target=(action.split(".")[0], ident) if ident else None, details=sanitize(data), request=request)
            except Exception:
                logger.exception("audit failed: %s", action)
            return resp
        return inner
    return deco
