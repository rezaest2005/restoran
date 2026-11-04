"""Storefront: validation, presets, snapshots, image handling.

Everything a business can put on its public page is plain data validated
here; no HTML or script is ever stored or rendered.
"""

from __future__ import annotations

import io
import json
import re
import uuid

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db import transaction
from django.utils import timezone

from .models import (
    Storefront, StorefrontAsset, StorefrontRevision, StorefrontTemplate,
)

RESERVED_SLUGS = {"mine", "templates", "admin", "api", "by-host"}
MAX_JSON_BYTES = 64 * 1024
MAX_SECTIONS = 20
MAX_REVISIONS = 30
MAX_ASSETS = 200
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000
PREVIEW_TTL = 15 * 60

FONTS = ["Vazirmatn", "Plus Jakarta Sans", "Inter", "Roboto", "Noto Sans", "Lora"]
DENSITIES = ["compact", "comfortable", "spacious"]
LANGUAGES = ["fa", "en"]
THEME_COLOR_KEYS = ["primary", "accent", "background", "surface", "text", "muted"]
THEME_KEYS = THEME_COLOR_KEYS + ["font_family", "radius", "density"]

HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
ID_RE = re.compile(r"^[a-z0-9_-]{1,32}$")
TAG_RE = re.compile(r"<\s*/?\s*[a-zA-Z!][^>]*>")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
PHONE_RE = re.compile(r"^[+\d][\d\s\-()]{3,24}$")
URL_RE = re.compile(
    r"^(https?://[^\s<>\"']+|/(?!/)[^\s<>\"']*|tel:[+\d\-\s()]+|mailto:[^\s<>\"']+|#[\w\-]*)$"
)


# --- schema helpers ----------------------------------------------------

def _t(max_len=120, req=False):
    return {"t": "text", "max": max_len, "req": req}


def _long(max_len=2000):
    return {"t": "long", "max": max_len}


def _bool():
    return {"t": "bool"}


IMG = {"t": "image"}
URL = {"t": "url"}


def default_section_fields():
    """Base field definitions for every section type."""
    return {
        "hero": {
            "badge": _t(60), "title": _t(120, True), "subtitle": _long(300),
            "image": IMG, "primary_label": _t(40), "primary_url": URL,
            "secondary_label": _t(40), "secondary_url": URL,
        },
        "about": {"title": _t(120), "body": _long(2000), "image": IMG},
        "menu": {
            "title": _t(120), "subtitle": _long(300),
            "show_categories": _bool(), "show_prices": _bool(),
            "order_enabled": _bool(),
            "max_items": {"t": "int", "min": 1, "max": 60},
        },
        "gallery": {
            "title": _t(120),
            "images": {"t": "list", "max": 12,
                       "item": {"url": {**IMG, "req": True}, "alt": _t(120)}},
        },
        "hours": {
            "title": _t(120), "note": _long(300),
            "days": {"t": "list", "max": 7, "item": {
                "day": {"t": "int", "min": 0, "max": 6, "req": True},
                "open": {"t": "time"}, "close": {"t": "time"}, "closed": _bool(),
            }},
        },
        "contact": {
            "title": _t(120), "phone": {"t": "phone"}, "address": _long(300),
            "lat": {"t": "num", "min": -90, "max": 90},
            "lng": {"t": "num", "min": -180, "max": 180},
        },
        "text": {"title": _t(120), "body": _long(4000)},
        "cta": {"title": _t(120), "body": _long(300), "button_label": _t(40),
                "button_url": URL},
        "footer": {
            "copyright": _t(160),
            "links": {"t": "list", "max": 8,
                      "item": {"label": _t(40, True), "url": {**URL, "req": True}}},
        },
    }


SECTION_TYPES = list(default_section_fields().keys())


def build_schema(allowed=None):
    fields = default_section_fields()
    allowed = [a for a in (allowed or SECTION_TYPES) if a in fields]
    return {
        "allowed": allowed,
        "max_sections": MAX_SECTIONS,
        "fields": {k: fields[k] for k in allowed},
    }


# --- colour / contrast -------------------------------------------------

def _rgb(hex_color):
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _lum(hex_color):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in _rgb(hex_color))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a, b):
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return round((hi + 0.05) / (lo + 0.05), 2)


def contrast_warnings(theme):
    out = []
    for fg, bg in (("text", "background"), ("text", "surface"), ("muted", "background")):
        if fg in theme and bg in theme:
            ratio = contrast_ratio(theme[fg], theme[bg])
            if ratio < 4.5:
                out.append({"fg": fg, "bg": bg, "ratio": ratio, "min": 4.5})
    return out


# --- validation --------------------------------------------------------

def _check_text(value, spec, path):
    if not isinstance(value, str):
        raise ValidationError(f"{path}: must be text")
    if len(value) > spec.get("max", 200):
        raise ValidationError(f"{path}: too long (max {spec.get('max', 200)})")
    if TAG_RE.search(value):
        raise ValidationError(f"{path}: HTML is not allowed")
    if spec.get("req") and not value.strip():
        raise ValidationError(f"{path}: required")
    return value


def _check_url(value, path):
    if not isinstance(value, str) or len(value) > 500:
        raise ValidationError(f"{path}: invalid link")
    if value and not URL_RE.match(value):
        raise ValidationError(f"{path}: invalid link")
    return value


def _check_image(value, path):
    if not isinstance(value, str) or len(value) > 500:
        raise ValidationError(f"{path}: invalid image")
    if value and not (value.startswith("https://")
                      or value.startswith("/media/storefront/")):
        raise ValidationError(f"{path}: image must be uploaded or https")
    if ".." in value or "<" in value or ">" in value or " " in value:
        raise ValidationError(f"{path}: invalid image")
    return value


def _check_field(value, spec, path):
    t = spec["t"]
    if t in ("text", "long"):
        return _check_text(value, spec, path)
    if t == "url":
        return _check_url(value, path)
    if t == "image":
        v = _check_image(value, path)
        if spec.get("req") and not v:
            raise ValidationError(f"{path}: required")
        return v
    if t == "phone":
        if not isinstance(value, str) or (value and not PHONE_RE.match(value)):
            raise ValidationError(f"{path}: invalid phone")
        return value
    if t == "time":
        if value != "" and (not isinstance(value, str) or not TIME_RE.match(value)):
            raise ValidationError(f"{path}: use HH:MM")
        return value
    if t == "bool":
        if not isinstance(value, bool):
            raise ValidationError(f"{path}: must be true/false")
        return value
    if t in ("int", "num"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValidationError(f"{path}: must be a number")
        if t == "int" and int(value) != value:
            raise ValidationError(f"{path}: must be an integer")
        if value < spec.get("min", -1e12) or value > spec.get("max", 1e12):
            raise ValidationError(f"{path}: out of range")
        return value
    if t == "list":
        if not isinstance(value, list):
            raise ValidationError(f"{path}: must be a list")
        if len(value) > spec["max"]:
            raise ValidationError(f"{path}: too many items (max {spec['max']})")
        return [_check_obj(v, spec["item"], f"{path}[{i}]") for i, v in enumerate(value)]
    raise ValidationError(f"{path}: unsupported field type")


def _check_obj(obj, fields, path):
    if not isinstance(obj, dict):
        raise ValidationError(f"{path}: must be an object")
    unknown = set(obj) - set(fields)
    if unknown:
        raise ValidationError(f"{path}: unknown fields {sorted(unknown)}")
    out = {}
    for name, spec in fields.items():
        if name in obj:
            out[name] = _check_field(obj[name], spec, f"{path}.{name}")
        elif spec.get("req"):
            raise ValidationError(f"{path}.{name}: required")
    return out


def validate_theme(theme):
    """Returns (clean_theme, warnings)."""
    if not isinstance(theme, dict):
        raise ValidationError("theme must be an object")
    unknown = set(theme) - set(THEME_KEYS)
    if unknown:
        raise ValidationError(f"theme: unknown keys {sorted(unknown)}")
    clean = {}
    for k in THEME_COLOR_KEYS:
        if k in theme:
            v = theme[k]
            if not isinstance(v, str) or not HEX_RE.match(v):
                raise ValidationError(f"theme.{k}: invalid hex colour")
            clean[k] = v.lower()
    if "font_family" in theme:
        if theme["font_family"] not in FONTS:
            raise ValidationError("theme.font_family: font not allowed")
        clean["font_family"] = theme["font_family"]
    if "radius" in theme:
        r = theme["radius"]
        if isinstance(r, bool) or not isinstance(r, int) or not 0 <= r <= 32:
            raise ValidationError("theme.radius: integer 0..32")
        clean["radius"] = r
    if "density" in theme:
        if theme["density"] not in DENSITIES:
            raise ValidationError("theme.density: invalid")
        clean["density"] = theme["density"]
    return clean, contrast_warnings(clean)


def schema_for(template):
    schema = getattr(template, "section_schema", None) or {}
    if not schema.get("fields"):
        return build_schema()
    return schema


def validate_sections(sections, schema):
    if not isinstance(sections, list):
        raise ValidationError("sections must be a list")
    limit = min(int(schema.get("max_sections", MAX_SECTIONS)), MAX_SECTIONS)
    if len(sections) > limit:
        raise ValidationError(f"too many sections (max {limit})")
    allowed = schema.get("allowed") or list(schema.get("fields", {}))
    seen, out = set(), []
    for i, sec in enumerate(sections):
        path = f"sections[{i}]"
        if not isinstance(sec, dict):
            raise ValidationError(f"{path}: must be an object")
        unknown = set(sec) - {"id", "type", "visible", "data"}
        if unknown:
            raise ValidationError(f"{path}: unknown keys {sorted(unknown)}")
        sid, stype = sec.get("id"), sec.get("type")
        if not isinstance(sid, str) or not ID_RE.match(sid):
            raise ValidationError(f"{path}.id: invalid")
        if sid in seen:
            raise ValidationError(f"{path}.id: duplicate")
        seen.add(sid)
        if stype not in allowed or stype not in schema.get("fields", {}):
            raise ValidationError(f"{path}.type: not allowed")
        visible = sec.get("visible", True)
        if not isinstance(visible, bool):
            raise ValidationError(f"{path}.visible: must be true/false")
        data = _check_obj(sec.get("data", {}), schema["fields"][stype], f"{path}.data")
        out.append({"id": sid, "type": stype, "visible": visible, "data": data})
    return out


def validate_payload(theme, sections, template):
    clean_theme, warnings = validate_theme(theme)
    clean_sections = validate_sections(sections, schema_for(template))
    size = len(json.dumps([clean_theme, clean_sections], ensure_ascii=False).encode("utf-8"))
    if size > MAX_JSON_BYTES:
        raise ValidationError("page content too large (max 64 KB)")
    return clean_theme, clean_sections, warnings


def validate_slug(slug, exclude_id=None):
    if not isinstance(slug, str) or not re.match(r"^[a-z0-9][a-z0-9-]{1,48}$", slug):
        raise ValidationError("slug: lowercase letters, digits and dashes (2-49)")
    if slug in RESERVED_SLUGS:
        raise ValidationError("slug: reserved")
    qs = Storefront.all_objects.filter(slug=slug)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    if qs.exists():
        raise ValidationError("slug: already taken")
    return slug


# --- presets -----------------------------------------------------------

def _sec(sid, stype, **data):
    return {"id": sid, "type": stype, "visible": True, "data": data}


def _classic_sections():
    """Content converted from the former sample storefront. All demo copy is
    template data, editable by the business."""
    return [
        _sec("hero", "hero", badge="بهترین کیفیت، بهترین تجربه",
             title="تجربه‌ای ماندگار از ما بخواهید",
             subtitle="با مواد اولیه ممتاز و خدمات سریع، چیزی می‌سازیم که فراموش نخواهید کرد.",
             primary_label="مشاهده کاتالوگ و سفارش", primary_url="#catalog",
             secondary_label="تماس با ما", secondary_url="#contact"),
        _sec("about", "about", title="چرا ما؟",
             body="کیفیت ممتاز، سفارش هوشمند و تحویل سریع. این متن را با اطلاعات کسب‌وکار خود جایگزین کنید."),
        _sec("catalog", "menu", title="کاتالوگ محصولات", subtitle="",
             show_categories=True, show_prices=True, order_enabled=True, max_items=24),
        _sec("cta", "cta", title="آماده سفارش هستید؟",
             body="همین حالا کاتالوگ ما را ببینید و سفارش خود را ثبت کنید.",
             button_label="شروع سفارش", button_url="#catalog"),
        _sec("hours", "hours", title="ساعات کاری", days=[
            {"day": d, "open": "09:00", "close": "21:00", "closed": d == 5}
            for d in range(7)]),
        _sec("contact", "contact", title="تماس با ما", phone="", address=""),
        _sec("footer", "footer", copyright="© تمامی حقوق محفوظ است", links=[]),
    ]


def _minimal_sections():
    return [s for s in _classic_sections()
            if s["type"] in ("hero", "about", "contact", "footer")]


def _shop_sections():
    base = _classic_sections()
    gallery = _sec("gallery", "gallery", title="گالری", images=[])
    return base[:3] + [gallery] + base[3:]


PRESETS = [
    {
        "key": "restaurant_classic", "name_fa": "کلاسیک", "name_en": "Classic",
        "sort_order": 1,
        "theme": {
            "primary": "#ff5a1a", "accent": "#ffbe3a", "background": "#080503",
            "surface": "#1a120d", "text": "#fff5ec", "muted": "#b89a80",
            "font_family": "Vazirmatn", "radius": 24, "density": "comfortable",
        },
        "sections": _classic_sections,
    },
    {
        "key": "light_clean", "name_fa": "روشن", "name_en": "Light",
        "sort_order": 2,
        "theme": {
            "primary": "#2563eb", "accent": "#f59e0b", "background": "#ffffff",
            "surface": "#f3f4f6", "text": "#111827", "muted": "#4b5563",
            "font_family": "Vazirmatn", "radius": 12, "density": "comfortable",
        },
        "sections": _classic_sections,
    },
    {
        "key": "minimal", "name_fa": "مینیمال", "name_en": "Minimal",
        "sort_order": 3,
        "theme": {
            "primary": "#111827", "accent": "#6b7280", "background": "#fafafa",
            "surface": "#ffffff", "text": "#111827", "muted": "#4b5563",
            "font_family": "Inter", "radius": 4, "density": "spacious",
        },
        "sections": _minimal_sections,
    },
    {
        "key": "shop", "name_fa": "فروشگاه", "name_en": "Shop",
        "sort_order": 4,
        "theme": {
            "primary": "#db2777", "accent": "#7c3aed", "background": "#fff7fb",
            "surface": "#ffffff", "text": "#1f2937", "muted": "#4b5563",
            "font_family": "Vazirmatn", "radius": 16, "density": "comfortable",
        },
        "sections": _shop_sections,
    },
    {
        "key": "factory", "name_fa": "صنعتی", "name_en": "Industrial",
        "sort_order": 5,
        "theme": {
            "primary": "#0f766e", "accent": "#ca8a04", "background": "#f1f5f9",
            "surface": "#ffffff", "text": "#0f172a", "muted": "#475569",
            "font_family": "Noto Sans", "radius": 6, "density": "compact",
        },
        "sections": _minimal_sections,
    },
    {
        "key": "ocean", "name_fa": "اقیانوس", "name_en": "Ocean",
        "sort_order": 6,
        "theme": {
            "primary": "#38bdf8", "accent": "#a78bfa", "background": "#0b1220",
            "surface": "#111c30", "text": "#e6eefb", "muted": "#9fb0cc",
            "font_family": "Plus Jakarta Sans", "radius": 20, "density": "comfortable",
        },
        "sections": _classic_sections,
    },
]


def ensure_presets():
    """Idempotently create the built-in templates (never overwrites edits)."""
    for p in PRESETS:
        if StorefrontTemplate.objects.filter(key=p["key"]).exists():
            continue
        sections = p["sections"]()
        allowed = list(dict.fromkeys(s["type"] for s in sections))
        for extra in SECTION_TYPES:
            if extra not in allowed:
                allowed.append(extra)
        StorefrontTemplate.objects.create(
            key=p["key"], name_fa=p["name_fa"], name_en=p["name_en"],
            default_theme=p["theme"], section_schema=build_schema(allowed),
            default_sections=sections, sort_order=p["sort_order"],
        )


# --- storefront lifecycle ---------------------------------------------

def _unique_slug(base):
    base = re.sub(r"[^a-z0-9-]", "-", (base or "site").lower()).strip("-") or "site"
    if len(base) < 2:
        base = base + "-site"
    base = base[:40]
    cand = base if base not in RESERVED_SLUGS else f"{base}-site"
    n = 1
    while Storefront.all_objects.filter(slug=cand).exists():
        n += 1
        cand = f"{base}-{n}"
    return cand


def get_or_create_storefront(business):
    sf = Storefront.all_objects.filter(business=business).first()
    if sf:
        return sf
    ensure_presets()
    tpl = StorefrontTemplate.objects.filter(is_active=True).order_by("sort_order").first()
    sf = Storefront(
        business=business, template=tpl, slug=_unique_slug(business.slug),
        theme=dict(tpl.default_theme) if tpl else {},
        sections=json.loads(json.dumps(tpl.default_sections)) if tpl else [],
    )
    sf.save()
    return sf


def apply_template(sf, template):
    sf.template = template
    sf.theme = dict(template.default_theme)
    sf.sections = json.loads(json.dumps(template.default_sections))
    sf.save()
    return sf


def save_draft(sf, theme=None, sections=None, content_language=None, slug=None):
    theme = sf.theme if theme is None else theme
    sections = sf.sections if sections is None else sections
    clean_theme, clean_sections, warnings = validate_payload(theme, sections, sf.template)
    if content_language is not None:
        if content_language not in LANGUAGES:
            raise ValidationError("content_language: invalid")
        sf.content_language = content_language
    if slug is not None and slug != sf.slug:
        sf.slug = validate_slug(slug, exclude_id=sf.pk)
    sf.theme, sf.sections = clean_theme, clean_sections
    sf.save()
    return warnings


@transaction.atomic
def publish(sf, user=None):
    clean_theme, clean_sections, _w = validate_payload(sf.theme, sf.sections, sf.template)
    sf.published_data = {
        "theme": clean_theme, "sections": clean_sections,
        "content_language": sf.content_language,
    }
    sf.is_published = True
    sf.published_at = timezone.now()
    sf.save()
    StorefrontRevision.all_objects.create(
        business=sf.business, storefront=sf, data=sf.published_data,
        created_by=user if getattr(user, "pk", None) else None,
    )
    stale = list(StorefrontRevision.all_objects.filter(storefront=sf)
                 .values_list("id", flat=True)[MAX_REVISIONS:])
    if stale:
        StorefrontRevision.all_objects.filter(id__in=stale).delete()
    return sf


def unpublish(sf):
    sf.is_published = False
    sf.save()
    return sf


@transaction.atomic
def restore_revision(sf, revision):
    """Copies a published revision back into the draft (publish separately)."""
    data = revision.data or {}
    clean_theme, clean_sections, _w = validate_payload(
        data.get("theme", {}), data.get("sections", []), sf.template)
    sf.theme, sf.sections = clean_theme, clean_sections
    if data.get("content_language") in LANGUAGES:
        sf.content_language = data["content_language"]
    sf.save()
    return sf


# --- public output -----------------------------------------------------

def public_payload(sf, data, menu_allowed=True):
    """Only theme/sections/language/display name; nothing internal."""
    sections = [s for s in data.get("sections", []) if s.get("visible", True)]
    if not menu_allowed:
        sections = [s for s in sections if s["type"] != "menu"]
    return {
        "slug": sf.slug,
        "name": sf.business.name,
        "content_language": data.get("content_language", sf.content_language),
        "theme": data.get("theme", {}),
        "sections": sections,
        "has_menu": any(s["type"] == "menu" for s in sections),
    }


_signer = TimestampSigner(salt="storefront-preview")


def make_preview_token(sf):
    return _signer.sign(str(sf.pk))


def read_preview_token(token):
    try:
        return int(_signer.unsign(token, max_age=PREVIEW_TTL))
    except (BadSignature, SignatureExpired, ValueError):
        return None


# --- image upload ------------------------------------------------------

ALLOWED_FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}


def store_image(business, upload):
    """Validate by content, strip metadata by re-encoding, random filename."""
    from PIL import Image, UnidentifiedImageError

    if StorefrontAsset.all_objects.filter(business=business).count() >= MAX_ASSETS:
        raise ValidationError("asset limit reached")
    if upload.size > MAX_UPLOAD_BYTES:
        raise ValidationError("file too large (max 5 MB)")
    raw = upload.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValidationError("file too large (max 5 MB)")
    try:
        probe = Image.open(io.BytesIO(raw))
        fmt = probe.format
        probe.verify()
        img = Image.open(io.BytesIO(raw))
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError,
            Image.DecompressionBombError):
        raise ValidationError("invalid image")
    if fmt not in ALLOWED_FORMATS:
        raise ValidationError("only png, jpg, webp are allowed")
    w, h = img.size
    if w * h > MAX_PIXELS or w < 1 or h < 1:
        raise ValidationError("image dimensions too large")
    img.load()
    ext = ALLOWED_FORMATS[fmt]
    # rebuild from pixels only: drops EXIF / ICC / text chunks entirely
    mode = "RGBA" if (img.mode in ("RGBA", "LA", "P") and fmt != "JPEG") else "RGB"
    clean = Image.new(mode, img.size)
    clean.paste(img.convert(mode))
    buf = io.BytesIO()
    if fmt == "JPEG":
        clean.save(buf, "JPEG", quality=88, optimize=True)
    elif fmt == "WEBP":
        clean.save(buf, "WEBP", quality=88)
    else:
        clean.save(buf, "PNG", optimize=True)
    data = buf.getvalue()
    asset = StorefrontAsset(business=business, width=w, height=h, size=len(data))
    asset.file.save(f"{uuid.uuid4().hex}.{ext}", ContentFile(data), save=False)
    asset.save()
    return asset


# --- addresses and custom domain ----------------------------------------

HOST_RE = re.compile(
    r"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"
)
IP_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")


def normalize_host(raw):
    """Lower-case host without port; '' if empty."""
    host = (raw or "").split(",")[0].strip().lower()
    if host.startswith("["):  # IPv6 literal: never a custom domain
        return host
    return host.split(":")[0].rstrip(".")


def own_hosts():
    """Hosts that belong to the platform itself (never claimable)."""
    from urllib.parse import urlparse

    from django.conf import settings

    hosts = {"localhost", "127.0.0.1", "testserver"}
    for h in settings.ALLOWED_HOSTS:
        h = (h or "").strip().lower().lstrip(".")
        if h and h != "*":
            hosts.add(h)
    base = urlparse(getattr(settings, "PLATFORM_PUBLIC_URL", "") or "").hostname
    if base:
        hosts.add(base.lower())
    return hosts


def primary_host():
    """A host Django accepts (rewritten Host for custom-domain requests)."""
    from django.conf import settings

    for h in settings.ALLOWED_HOSTS:
        h = (h or "").strip().lower()
        if h and not h.startswith((".", "*")):
            return h
    return "localhost"


def validate_domain(value, exclude_id=None):
    """Returns the cleaned hostname or None (clears it)."""
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise ValidationError("custom_domain: invalid")
    host = value.strip().lower()
    if "*" in host:
        raise ValidationError("custom_domain: wildcards are not allowed")
    if "://" in host or "/" in host:
        raise ValidationError("custom_domain: enter the hostname only, without scheme or path")
    if ":" in host:
        raise ValidationError("custom_domain: ports are not allowed")
    if IP_RE.match(host) or not HOST_RE.match(host):
        raise ValidationError("custom_domain: invalid hostname")
    for own in own_hosts():
        if host == own or host.endswith("." + own):
            raise ValidationError("custom_domain: this host belongs to the platform")
    qs = Storefront.all_objects.filter(custom_domain=host)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    if qs.exists():
        raise ValidationError("custom_domain: already in use")
    return host


def platform_url():
    from django.conf import settings
    return (getattr(settings, "PLATFORM_PUBLIC_URL", "") or "").rstrip("/")


def storefront_addresses(sf):
    base = platform_url()
    return {
        "public_url": f"{base}/s/{sf.slug}",
        "dashboard_url": dashboard_url(sf.business),
        "qr_order_url": f"{base}/m/{sf.business.slug}",
        "custom_domain": sf.custom_domain or "",
        "custom_domain_url": f"https://{sf.custom_domain}/" if sf.custom_domain else "",
    }


def dashboard_url(business):
    return f"{platform_url()}/{business.slug}/dashboard/"
