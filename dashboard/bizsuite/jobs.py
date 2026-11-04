"""
Minimal database-backed job queue.

* ``register(kind)`` registers a handler ``fn(payload: dict) -> None``.
* ``enqueue(kind, payload)`` adds a job.
* ``run_next()`` claims one due job (``SELECT ... FOR UPDATE SKIP LOCKED``),
  runs it, and records success / retry / permanent failure.

Handlers run outside the claiming transaction, so a crashing handler never
holds row locks. A job left ``running`` by a dead worker is reclaimed after
``LOCK_TIMEOUT``.
"""

from __future__ import annotations

import logging
import traceback
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import BackgroundJob

logger = logging.getLogger(__name__)

LOCK_TIMEOUT = timedelta(minutes=10)
MAX_BACKOFF_SECONDS = 3600

_REGISTRY: dict = {}


def register(kind):
    def deco(fn):
        _REGISTRY[kind] = fn
        return fn
    return deco


def enqueue(kind, payload=None, *, delay_seconds=0, max_attempts=5, dedupe=False):
    """Add a job. With dedupe=True an identical pending job is reused."""
    payload = payload or {}
    if dedupe:
        existing = BackgroundJob.objects.filter(
            kind=kind, payload=payload, status=BackgroundJob.PENDING
        ).first()
        if existing:
            return existing
    return BackgroundJob.objects.create(
        kind=kind, payload=payload, max_attempts=max_attempts,
        run_after=timezone.now() + timedelta(seconds=delay_seconds),
    )


def _claim():
    now = timezone.now()
    with transaction.atomic():
        job = (
            BackgroundJob.objects.select_for_update(skip_locked=True)
            .filter(
                Q(status=BackgroundJob.PENDING, run_after__lte=now)
                | Q(status=BackgroundJob.RUNNING, locked_at__lt=now - LOCK_TIMEOUT)
            )
            .order_by("run_after", "id")
            .first()
        )
        if job is None:
            return None
        job.status = BackgroundJob.RUNNING
        job.attempts += 1
        job.locked_at = now
        job.save(update_fields=["status", "attempts", "locked_at"])
        return job


def _backoff(attempts):
    return timedelta(seconds=min(30 * 2 ** (attempts - 1), MAX_BACKOFF_SECONDS))


def run_next():
    """Process at most one due job. Returns the job, or None if none was due."""
    job = _claim()
    if job is None:
        return None
    handler = _REGISTRY.get(job.kind)
    try:
        if handler is None:
            raise LookupError(f"no handler registered for job kind '{job.kind}'")
        handler(job.payload)
    except Exception:
        job.last_error = traceback.format_exc()[-4000:]
        if handler is None or job.attempts >= job.max_attempts:
            job.status = BackgroundJob.FAILED
            logger.error("job %s failed permanently", job)
        else:
            job.status = BackgroundJob.PENDING
            job.run_after = timezone.now() + _backoff(job.attempts)
            logger.warning("job %s failed, will retry at %s", job, job.run_after)
        job.locked_at = None
        job.save(update_fields=["status", "last_error", "run_after", "locked_at"])
    else:
        job.status = BackgroundJob.DONE
        job.last_error = ""
        job.locked_at = None
        job.save(update_fields=["status", "last_error", "locked_at"])
    return job


# ───────────────────────── handlers ─────────────────────────

@register("post_accounting")
def post_accounting(payload):
    """Retry an automatic accounting posting that failed inside a request."""
    from . import accounting_posting as ap
    from . import models as m

    poster = ap.POSTERS.get(payload.get("poster"))
    model = getattr(m, payload.get("model", ""), None)
    if poster is None or model is None:
        raise ValueError(f"invalid post_accounting payload: {payload}")
    obj = model.all_objects.get(pk=payload["pk"])
    user = None
    if payload.get("user_id"):
        user = m.User.objects.filter(pk=payload["user_id"]).first()
    poster(obj, user=user)  # idempotent per (source_type, source_id)
