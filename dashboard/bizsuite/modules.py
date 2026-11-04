"""
Modules and subscriptions.

A business that has no ``BusinessModule`` rows at all is "unmanaged" (legacy):
every module is enabled, so existing deployments keep working. As soon as the
super admin manages a business, only enabled, started and non-expired modules
(whose hard prerequisites are also live) are available.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from .models import Business, BusinessModule, Module, Plan

CATALOG = [
    {"code": "pos", "name_fa": "صندوق فروش", "name_en": "Point of sale",
     "price": 300000, "requires": [], "suggests": ["inventory"]},
    {"code": "club", "name_fa": "باشگاه مشتریان", "name_en": "Customer club",
     "price": 150000, "requires": ["pos"], "suggests": []},
    {"code": "inventory", "name_fa": "انبار", "name_en": "Inventory",
     "price": 250000, "requires": [], "suggests": []},
    {"code": "production", "name_fa": "تولید و فرمولاسیون", "name_en": "Production",
     "price": 250000, "requires": ["inventory"], "suggests": []},
    {"code": "accounting", "name_fa": "حسابداری", "name_en": "Accounting",
     "price": 350000, "requires": [], "suggests": []},
    {"code": "delivery", "name_fa": "حمل و تحویل", "name_en": "Delivery",
     "price": 200000, "requires": [], "suggests": ["accounting"]},
    {"code": "feedback", "name_fa": "نظرسنجی", "name_en": "Feedback",
     "price": 50000, "requires": [], "suggests": []},
    {"code": "storefront", "name_fa": "وب‌سایت", "name_en": "Storefront",
     "price": 100000, "requires": [], "suggests": []},
]

PLANS = [
    {"code": "starter", "name_fa": "پایه", "name_en": "Starter",
     "price": 300000, "modules": ["pos"]},
    {"code": "retail", "name_fa": "فروشگاهی", "name_en": "Retail",
     "price": 650000, "modules": ["pos", "club", "inventory", "storefront"]},
    {"code": "full", "name_fa": "کامل", "name_en": "Full",
     "price": 1400000, "modules": [m["code"] for m in CATALOG]},
]

# dashboard tab / service code -> module code (codes not listed are always on)
SERVICE_MODULE = {
    "pos": "pos", "pos_report": "pos", "pos_settings": "pos", "orders": "pos",
    "club": "club",
    "inventory": "inventory", "raw_materials": "inventory", "semi_finished": "inventory",
    "ready_materials": "inventory", "invoices": "inventory", "usage_log": "inventory",
    "kitchen": "production", "recipes": "production",
    "accounting": "accounting",
    "delivery": "delivery",
    "feedback": "feedback",
    "storefront": "storefront",
}
# per-user tab keys used by the dashboard UI
TAB_MODULE = {
    "pos": "pos", "pos_report": "pos", "pos_settings": "pos", "orders": "pos",
    "inventory_invoice": "inventory", "inventory_sales": "inventory",
    "inventory_warehouse": "inventory", "inventory_receiving": "inventory",
    "inventory_purchase_list": "inventory", "inventory_reports": "inventory",
    "club": "club", "accounting": "accounting", "delivery": "delivery",
    "feedback": "feedback", "storefront": "storefront",
    "kitchen": "production", "recipes": "production", "dictionary_recipe": "production",
}


class ModuleDependencyError(Exception):
    """Raised when an enable/disable would break the dependency rules."""

    def __init__(self, message, details):
        super().__init__(message)
        self.details = details


def ensure_catalog():
    """Create missing catalogue/plan rows (never overwrites edited prices)."""
    for i, m in enumerate(CATALOG):
        Module.objects.get_or_create(code=m["code"], defaults={
            "name_fa": m["name_fa"], "name_en": m["name_en"],
            "price_monthly": m["price"], "requires": m["requires"],
            "suggests": m["suggests"], "sort_order": i,
        })
    for p in PLANS:
        Plan.objects.get_or_create(code=p["code"], defaults={
            "name_fa": p["name_fa"], "name_en": p["name_en"],
            "price_monthly": p["price"], "modules": p["modules"],
        })


def _live(row, now):
    return (row.is_enabled
            and (row.starts_at is None or row.starts_at <= now)
            and (row.expires_at is None or row.expires_at > now))


def enabled_modules(business, now=None):
    """Set of live module codes, or None when the business is unmanaged."""
    if business is None:
        return None
    pk = getattr(business, "pk", None)
    rows = list(BusinessModule.objects.filter(business_id=pk).select_related("module"))
    if not rows:
        return None
    now = now or timezone.now()
    live = {r.module.code for r in rows if _live(r, now)}
    requires = {r.module.code: list(r.module.requires or []) for r in rows}
    changed = True
    while changed:  # drop modules whose hard prerequisites are not live
        changed = False
        for code in list(live):
            if any(req not in live for req in requires.get(code, [])):
                live.discard(code)
                changed = True
    return live


def module_enabled(business, code):
    if code is None:
        return True
    live = enabled_modules(business)
    return True if live is None else code in live


def service_module_enabled(business, service_code):
    return module_enabled(business, SERVICE_MODULE.get(service_code))


def tab_visible(business, tab_key):
    return module_enabled(business, TAB_MODULE.get(tab_key))


# --- subscription management (super admin) -----------------------------

def _catalog():
    ensure_catalog()
    return {m.code: m for m in Module.objects.all()}


def business_state(business):
    cat = _catalog()
    rows = {r.module.code: r for r in
            BusinessModule.objects.filter(business=business).select_related("module")}
    live = enabled_modules(business)
    managed = bool(rows)
    out = []
    total = 0
    for code, m in cat.items():
        r = rows.get(code)
        is_live = True if live is None else code in live
        price = (r.price_override if r and r.price_override is not None else m.price_monthly)
        if is_live and managed:
            total += price
        out.append({
            "code": code, "is_enabled": bool(r.is_enabled) if r else (not managed),
            "is_live": is_live,
            "starts_at": r.starts_at.isoformat() if r and r.starts_at else None,
            "expires_at": r.expires_at.isoformat() if r and r.expires_at else None,
            "price_override": r.price_override if r else None,
            "price": price,
        })
    return {"managed": managed, "modules": out, "total_monthly": total}


def _validate_codes(codes, cat):
    bad = [c for c in codes if c not in cat]
    if bad:
        raise ModuleDependencyError("unknown modules", {"unknown": bad})


@transaction.atomic
def apply_modules(business, changes, auto_requires=False):
    """
    changes: {code: {is_enabled, starts_at, expires_at, price_override}}
    Enabling refuses (or auto-enables with ``auto_requires``) when hard
    prerequisites are missing; disabling refuses while dependents stay enabled.
    """
    cat = _catalog()
    _validate_codes(list(changes), cat)
    # make the business managed: create rows for every module (disabled)
    existing = {r.module.code: r for r in
                BusinessModule.objects.filter(business=business).select_related("module")}
    unmanaged = not existing
    for code, m in cat.items():
        if code not in existing:
            existing[code] = BusinessModule.objects.create(
                business=business, module=m, is_enabled=bool(unmanaged))
    desired = {code: r.is_enabled for code, r in existing.items()}
    for code, ch in changes.items():
        if "is_enabled" in ch:
            desired[code] = bool(ch["is_enabled"])

    if auto_requires:
        stack = [c for c, on in desired.items() if on and c in changes]
        while stack:
            c = stack.pop()
            for req in cat[c].requires:
                if not desired.get(req):
                    desired[req] = True
                    stack.append(req)

    missing = {c: [r for r in cat[c].requires if not desired.get(r)]
               for c, on in desired.items() if on}
    missing = {c: r for c, r in missing.items() if r}
    if missing:
        blocked = {}
        for code, reqs in missing.items():
            for req in reqs:
                if changes.get(req, {}).get("is_enabled") is False:
                    blocked.setdefault(req, []).append(code)
        if blocked:
            raise ModuleDependencyError(
                "cannot disable: other enabled modules depend on it",
                {"dependents": blocked})
        raise ModuleDependencyError("missing prerequisites", {"missing_requires": missing})

    for code, r in existing.items():
        ch = changes.get(code, {})
        r.is_enabled = desired[code]
        for f in ("starts_at", "expires_at", "price_override"):
            if f in ch:
                setattr(r, f, ch[f])
        r.save()
    return business_state(business)


def apply_plan(business, plan):
    wanted = set(plan.modules or [])
    cat = _catalog()
    changes = {c: {"is_enabled": c in wanted} for c in cat}
    return apply_modules(business, changes, auto_requires=True)


def dependents_of(code, enabled_codes):
    cat = _catalog()
    return [c for c in enabled_codes if code in (cat[c].requires or [])]
