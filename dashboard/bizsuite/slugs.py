"""Business slug rules (the first segment of a business's addresses, e.g. https://domain/<slug>/dashboard/login)."""

import re

from .models import Business

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,48}$")

# first path segments the platform (or another application on the same domain) already uses
RESERVED_SLUGS = frozenset({
    "admin", "api", "assets", "static", "media", "super", "dashboard", "driver", "login", "logout", "accounts",
    "m", "s", "f", "t", "q", "biz", "django-admin", "health", "favicon", "manifest", "sw", "icon", "ember",
    "trade_dashboard", "trade_admin", "www", "app", "root", "null", "undefined",
})


def validate_slug(slug, exclude_business_id=None):
    """(True, clean_slug) or (False, persian error)."""
    slug = (slug or "").strip().lower()
    if not slug:
        return False, "شناسه‌ی آدرس (slug) الزامی است."
    if not SLUG_RE.match(slug):
        return False, "slug باید ۲ تا ۴۹ نویسه باشد: حروف کوچک انگلیسی، عدد، خط تیره و زیرخط (با حرف یا عدد شروع شود)."
    if slug in RESERVED_SLUGS or slug.startswith("trade_"):
        return False, f"«{slug}» برای سامانه رزرو شده است؛ نام دیگری انتخاب کنید."
    qs = Business.objects.filter(slug=slug)
    if exclude_business_id:
        qs = qs.exclude(pk=exclude_business_id)
    if qs.exists():
        return False, f"شناسه‌ی «{slug}» قبلاً استفاده شده است."
    return True, slug
