"""Resolve and validate QR link targets (the only place a redirect target is built)."""

from __future__ import annotations

from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

from .models import QrLink, Storefront
from .modules import module_enabled

MAX_BULK = 200


def validate_custom_url(value: str) -> str:
    """Only absolute http(s) URLs; no spaces, no javascript:/data: etc."""
    url = (value or "").strip()
    if not url or len(url) > 500 or any(c.isspace() for c in url):
        raise ValueError("آدرس مقصد نامعتبر است.")
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.netloc:
        raise ValueError("آدرس باید با http:// یا https:// شروع شود.")
    return url


def _with_table(url: str, table: str) -> str:
    if not table:
        return url
    p = urlparse(url)
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if k != "table"]
    q.append(("table", table))
    return urlunparse(p._replace(query=urlencode(q)))


def resolve_target(link: QrLink) -> str | None:
    """Where a scan should go, or None when the link can't be served right now."""
    biz = link.business
    if link.kind == QrLink.Kind.MENU:
        if not module_enabled(biz, "pos"):
            return None
        return _with_table(f"/m/{quote(biz.slug)}", link.table_number)
    if link.kind == QrLink.Kind.STOREFRONT:
        sf = Storefront.all_objects.filter(business=biz).first()
        if sf is None or not getattr(sf, "published_data", None):
            return None
        return _with_table(f"/s/{quote(sf.slug)}", link.table_number)
    if link.kind == QrLink.Kind.CUSTOM:
        try:
            return _with_table(validate_custom_url(link.custom_url), link.table_number)
        except ValueError:
            return None
    return None


def clean_fields(data: dict, link: QrLink | None = None) -> dict:
    """Validated model fields from request data (partial for updates)."""
    out = {}
    if "label" in data:
        out["label"] = str(data.get("label") or "").strip()[:120]
    if "table_number" in data:
        out["table_number"] = str(data.get("table_number") or "").strip()[:20]
    if "is_active" in data:
        out["is_active"] = bool(data.get("is_active"))
    kind = data.get("kind", link.kind if link else QrLink.Kind.MENU)
    if kind not in QrLink.Kind.values:
        raise ValueError("نوع مقصد نامعتبر است.")
    if "kind" in data or link is None:
        out["kind"] = kind
    url = data.get("custom_url", link.custom_url if link else "")
    if kind == QrLink.Kind.CUSTOM:
        out["custom_url"] = validate_custom_url(url)
    elif "custom_url" in data or "kind" in data:
        out["custom_url"] = ""
    return out
