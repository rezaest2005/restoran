"""Tunables (environment values with safe defaults)."""
import os


def _int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def default_enabled() -> bool:
    return os.environ.get("LOCAL_FIRST_DEFAULT", "false").strip().lower() in ("1", "true", "yes", "on")


MAX_PUSH_ITEMS = _int("SYNC_MAX_PUSH_ITEMS", 100)
MAX_PUSH_BYTES = _int("SYNC_MAX_PUSH_BYTES", 512 * 1024)
MAX_ITEM_LINES = _int("SYNC_MAX_ORDER_LINES", 200)
PULL_PAGE = _int("SYNC_PULL_PAGE", 500)
PULL_PAGE_MAX = 1000
PULL_PER_MIN = _int("SYNC_PULL_PER_MIN", 120)
PUSH_PER_MIN = _int("SYNC_PUSH_PER_MIN", 60)
ORDER_WINDOW_DAYS = _int("SYNC_ORDER_WINDOW_DAYS", 14)
STALE_PENDING_SECONDS = 60
TOMBSTONE_KEEP_DAYS = _int("SYNC_TOMBSTONE_KEEP_DAYS", 90)
