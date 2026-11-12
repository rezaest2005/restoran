"""
Feature (tab-level) licensing and effective access — the single source of truth.

Three layers decide whether a signed-in user may use a screen / API:

1. **Module** — the business bought it (``BusinessModule``; see ``modules.py``).
2. **Feature** — the super admin did not switch that individual tab off for this
   business (``Business.disabled_features``). Features that belong to a module
   are only licensed while the module is live.
3. **User** — the owner ticked the tab for this user (``User.tabs``). Owners and
   superusers get every licensed feature; ``locked`` features cannot be switched
   off.

Effective access is the intersection of the three. The same function backs the
login/session payload (what the UI shows) and the API permission check (what the
server allows), so the two can never disagree.
"""

from __future__ import annotations

from dataclasses import dataclass

from .modules import enabled_modules


@dataclass(frozen=True)
class Feature:
    key: str
    module: str | None      # module code that must be live; None = core
    group: str              # UI grouping
    name_fa: str
    name_en: str
    locked: bool = False    # can't be disabled by the super admin


FEATURES: list[Feature] = [
    Feature("home", None, "core", "صفحه اصلی", "Home", locked=True),
    Feature("dictionary_users", None, "core", "تعاریف: کاربران", "Definitions: users", locked=True),
    Feature("dictionary_customers", None, "core", "تعاریف: مشتریان", "Definitions: customers"),

    Feature("pos", "pos", "pos", "صندوق فروش", "Point of sale"),
    Feature("pos_report", "pos", "pos", "گزارش صندوق", "POS report"),
    Feature("pos_settings", "pos", "pos", "تنظیمات صندوق", "POS settings"),
    Feature("orders", "pos", "pos", "سفارش‌ها", "Orders"),
    Feature("dictionary_menu", "pos", "pos", "تعاریف: محصولات فروش", "Definitions: products"),

    Feature("inventory_invoice", "inventory", "inventory", "فاکتور خرید", "Purchase invoices"),
    Feature("inventory_sales", "inventory", "inventory", "فاکتور فروش", "Sales invoices"),
    Feature("inventory_warehouse", "inventory", "inventory", "موجودی و انتقال", "Stock & transfers"),
    Feature("inventory_receiving", "inventory", "inventory", "دریافت کالا", "Receiving"),
    Feature("inventory_purchase_list", "inventory", "inventory", "لیست خرید", "Purchase list"),
    Feature("inventory_reports", "inventory", "inventory", "گزارش انبار", "Inventory reports"),
    Feature("dictionary_items", "inventory", "inventory", "تعاریف: کالاها", "Definitions: items"),
    Feature("dictionary_suppliers", "inventory", "inventory", "تعاریف: تأمین‌کنندگان", "Definitions: suppliers"),
    Feature("dictionary_warehouses", "inventory", "inventory", "تعاریف: انبارها", "Definitions: warehouses"),

    Feature("kitchen", "production", "production", "تولید", "Production"),
    Feature("recipes", "production", "production", "فرمولاسیون", "Formulation"),
    Feature("dictionary_recipe", "production", "production", "تعاریف: فرمول‌ها", "Definitions: formulas"),

    Feature("club", "club", "club", "باشگاه مشتریان", "Customer club"),
    Feature("accounting", "accounting", "accounting", "حسابداری", "Accounting"),
    Feature("feedback", "feedback", "feedback", "نظرسنجی", "Feedback"),

    Feature("delivery_dispatch", "delivery", "delivery", "ارسال و مأموریت‌ها", "Dispatch & trips"),
    Feature("delivery_shipments", "delivery", "delivery", "بارها و پیگیری", "Shipments & tracking"),
    Feature("delivery_fleet", "delivery", "delivery", "ناوگان و رانندگان", "Fleet & drivers"),
    Feature("delivery_cash", "delivery", "delivery", "صندوق پیک و تسویه", "Driver cash & settlement"),
]

FEATURE_BY_KEY = {f.key: f for f in FEATURES}
ALL_FEATURE_KEYS = [f.key for f in FEATURES]
LOCKED_KEYS = {f.key for f in FEATURES if f.locked}
DELIVERY_KEYS = [f.key for f in FEATURES if f.module == "delivery"]

# Old stored values → current feature keys (so existing users keep their access).
LEGACY_EXPANSION = {
    "delivery": DELIVERY_KEYS,
    "dictionary": [k for k in ALL_FEATURE_KEYS if k.startswith("dictionary_")],
    "users": ["dictionary_users"],
    "foods": ["dictionary_menu"],
    "inventory": ["inventory_invoice", "inventory_sales", "inventory_warehouse",
                  "inventory_receiving", "inventory_purchase_list", "inventory_reports"],
    "invoices": ["inventory_invoice"],
    "raw_materials": ["dictionary_items"],
    "semi_finished": ["dictionary_items"],
    "ready_materials": ["dictionary_items"],
    "usage_log": ["inventory_reports"],
    "storefront": [],
}

# Backend "service codes" (used by view decorators) → features that unlock them (any-of).
SERVICE_FEATURES: dict[str, list[str]] = {
    "pos": ["pos"],
    "pos_report": ["pos_report"],
    "pos_settings": ["pos_settings"],
    "orders": ["orders", "pos"],
    "club": ["club"],
    "accounting": ["accounting"],
    "feedback": ["feedback"],
    "kitchen": ["kitchen"],
    "recipes": ["recipes", "dictionary_recipe"],
    "delivery": DELIVERY_KEYS,
    "users": ["dictionary_users"],
    "foods": ["dictionary_menu"],
    "inventory": ["inventory_invoice", "inventory_sales", "inventory_warehouse", "inventory_receiving",
                  "inventory_purchase_list", "inventory_reports", "dictionary_items",
                  "dictionary_suppliers", "dictionary_warehouses"],
    "invoices": ["inventory_invoice", "inventory_sales"],
    "raw_materials": ["dictionary_items", "inventory_warehouse"],
    "semi_finished": ["dictionary_items", "inventory_warehouse"],
    "ready_materials": ["dictionary_items", "inventory_warehouse"],
    "usage_log": ["inventory_reports", "inventory_warehouse"],
    "storefront": [],
}

# Extra, finer requirement checked by URL prefix on top of the service check.
# A request needs ANY feature listed for the longest matching prefix.
# (prefix, any-of features for reading, any-of features for writing; None = same as reading)
_TRIP_TABS = ["delivery_dispatch", "delivery_shipments"]
PATH_FEATURES: list[tuple[str, list[str], list[str] | None]] = [
    # dispatchers need to *read* drivers/vehicles to assign them; only the fleet tab may change them
    ("/api/delivery/vehicles", _TRIP_TABS + ["delivery_fleet"], ["delivery_fleet"]),
    ("/api/delivery/drivers", _TRIP_TABS + ["delivery_fleet"], ["delivery_fleet"]),
    ("/api/delivery/carriers", _TRIP_TABS + ["delivery_fleet"], ["delivery_fleet"]),
    ("/api/delivery/cash", ["delivery_cash"], None),
    ("/api/delivery/settlements", ["delivery_cash"], None),
    ("/api/delivery/trips", _TRIP_TABS, None),
    ("/api/delivery/stops", _TRIP_TABS, None),
    ("/api/delivery/map", _TRIP_TABS + ["delivery_fleet"], None),
    ("/api/delivery/pending-orders", ["delivery_dispatch"], None),
    ("/api/pos/update-food-price", ["pos_settings"], None),
    ("/api/inventory/reports", ["inventory_reports"], None),
    ("/api/inventory/purchase-suggestions", ["inventory_purchase_list"], None),
]

# Default tabs when an account has none ticked yet (by role).
ROLE_FEATURES: dict[str, list[str]] = {
    "cashier": ["home", "pos", "pos_report", "orders", "dictionary_menu", "dictionary_customers",
                "delivery_dispatch"],
    "kitchen": ["home", "kitchen", "recipes", "orders", "dictionary_recipe"],
    "warehouse": ["home", "inventory_invoice", "inventory_sales", "inventory_warehouse",
                  "inventory_receiving", "inventory_purchase_list", "inventory_reports",
                  "dictionary_items", "dictionary_suppliers", "dictionary_warehouses"],
    "driver": [],
    "customer": [],
}


def expand(values) -> set[str]:
    """Normalise stored tab keys / legacy service codes into feature keys."""
    out: set[str] = set()
    for v in values or []:
        if v in FEATURE_BY_KEY:
            out.add(v)
        else:
            out.update(LEGACY_EXPANSION.get(v, []))
    return out


def licensed_features(business) -> set[str]:
    """Features the business is allowed to use (modules live AND not switched off)."""
    if business is None:
        return set()
    live = enabled_modules(business)   # None = unmanaged -> every module is live
    disabled = set(getattr(business, "disabled_features", None) or []) - LOCKED_KEYS
    out = set()
    for f in FEATURES:
        if f.key in disabled:
            continue
        if f.module is not None and live is not None and f.module not in live:
            continue
        out.add(f.key)
    return out


def user_ticked(user) -> set[str]:
    """Tabs granted to this user by the owner (before the licence is applied)."""
    role = getattr(user, "role", "")
    tabs = getattr(user, "tabs", None)
    if isinstance(tabs, dict) and tabs:
        return {k for k, v in tabs.items() if v is True and k in FEATURE_BY_KEY} | \
               expand([k for k, v in tabs.items() if v is True and k not in FEATURE_BY_KEY])
    perms = getattr(user, "dashboard_permissions", None)
    if perms:
        return expand(perms) | {"home"}
    if role in ("owner", "manager"):
        return set(ALL_FEATURE_KEYS)
    return set(ROLE_FEATURES.get(role, []))


def user_features(user) -> set[str]:
    """Effective features for this user: licence ∩ grant (owner/superuser: whole licence)."""
    if not getattr(user, "is_authenticated", False):
        return set()
    business = getattr(user, "business", None)
    if getattr(user, "is_superuser", False):
        return set(ALL_FEATURE_KEYS) if business is None else licensed_features(business)
    if business is None:
        return set()
    lic = licensed_features(business)
    if getattr(user, "role", "") == "owner":
        return lic
    out = user_ticked(user) & lic
    out.add("home") if "home" in lic else None
    return out


def service_allowed(user, service_codes, path: str | None = None, method: str = "GET") -> bool:
    """True when ``user`` may use any of ``service_codes`` (and the path-level feature, if any)."""
    if not getattr(user, "is_authenticated", False):
        return False
    feats = user_features(user)
    if not feats:
        return False
    ok = False
    for code in service_codes:
        needed = SERVICE_FEATURES.get(code)
        if needed is None:
            # unknown legacy code: grant only if literally ticked and a known feature
            needed = [code] if code in FEATURE_BY_KEY else []
        if any(f in feats for f in needed):
            ok = True
            break
    if not ok:
        return False
    if path:
        best = None
        for rule in PATH_FEATURES:
            if path.startswith(rule[0]) and (best is None or len(rule[0]) > len(best[0])):
                best = rule
        if best:
            writing = method.upper() not in ("GET", "HEAD", "OPTIONS")
            req = best[2] if (writing and best[2]) else best[1]
            if not any(f in feats for f in req):
                return False
    return True


def catalog_for_super_admin():
    """Static catalogue for the licence editor: modules → features."""
    return [{
        "key": f.key, "module": f.module, "group": f.group, "locked": f.locked,
        "name_fa": f.name_fa, "name_en": f.name_en,
    } for f in FEATURES]
