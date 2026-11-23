"""
Module registry — the ONE machine-readable place that defines the module boundaries.

Pure data, standard library only (no Django import), so it can be read by
``tests/test_module_boundaries.py``, ``scripts/test_module.py`` and
``scripts/gen_module_docs.py`` without booting Django.

Vocabulary
----------
tier
    ``core``      platform kernel. Every module may use it freely; it may never use a business module.
    ``business``  a business area. May use ``core`` freely and another business module only when that edge is
                  declared in ``DEPENDS_ON`` AND only through the target's public interface (``public_api``).
    ``compose``   read-only aggregators (dashboard). Same rules as business, with many declared edges.
    ``root``      composition root (urls, serializers, admin): exempt from the check, listed as backlog.
files
    ownership rules relative to ``bizsuite/`` (``x.py`` = a file, ``dir/`` = a package). The longest matching
    rule wins (see ``module_of``).
public_api
    the files other modules may import from (relative to ``bizsuite/``). Everything else is internal.
"""
from __future__ import annotations

CORE = "core"
BUSINESS = "business"
COMPOSE = "compose"
ROOT = "root"

MODULES: dict[str, dict] = {
    # ───────────── core ─────────────
    "core": {
        "tier": CORE, "title_fa": "هستهٔ مشترک (tenant، میان‌افزار، ابزارها)",
        "title_en": "Shared kernel (tenancy, middleware, utils, events, jobs)",
        "files": ["tenancy.py", "middleware.py", "utils.py", "slugs.py", "industries.py", "pricing.py",
                  "context_processors.py", "jobs.py", "events.py", "module_registry.py", "module_boundaries.py",
                  "module_violations_baseline.py",
                  "models/business.py", "models/common.py", "models/jobs.py", "models/menu.py",
                  "views/dashboard/constants.py",
                  "views/common.py", "views/decorators.py", "views/system.py", "views/business_settings.py",
                  "views/helpers/files.py", "templatetags/", "templates/", "static/"],
        "frontend": ["shared"],
        "tests": ["test_tenant_delete", "test_system_jobs", "test_pages", "test_neutrality", "test_single_owner"],
        "public_api": [],
    },
    "users": {
        "tier": CORE, "title_fa": "کاربران، نقش‌ها و دسترسی", "title_en": "Users, roles and permissions",
        "files": ["roles.py", "permissions.py", "warehouse_access.py", "auth_services.py", "password_vault.py", "models/user.py",
                  "views/auth/", "views/users/"],
        "frontend": ["features/business/auth", "features/business/config"],
        "tests": ["test_access_save", "test_browser_auth", "test_courier_account", "test_login_messages",
                  "test_password_vault", "test_transport_people"],
        "public_api": [],
    },
    "licensing": {
        "tier": CORE, "title_fa": "اشتراک، ماژول‌ها و قابلیت‌ها", "title_en": "Subscription, modules and features",
        "files": ["features.py", "modules.py", "subscription.py", "models/modules.py"],
        "frontend": [],
        "tests": ["test_features", "test_modules", "test_module_independence", "test_subscription",
                  "test_console_fixes"],
        "public_api": [],
    },
    "activity": {
        "tier": CORE, "title_fa": "گزارش فعالیت و ممیزی", "title_en": "Activity log / audit",
        "files": ["activity.py", "models/activity.py", "views/activity.py"],
        "frontend": ["features/business/activity"], "tests": ["test_activity"], "public_api": [],
    },
    "superadmin": {
        "tier": CORE, "title_fa": "پنل مدیر کل", "title_en": "Super-admin console",
        "files": ["views/super_admin/"],
        "frontend": ["features/super_admin"], "tests": ["test_super_customers"], "public_api": [],
    },
    # ───────────── business ─────────────
    "catalog": {
        "tier": BUSINESS, "title_fa": "کاتالوگ محصولات و قیمت‌گذاری", "title_en": "Product catalogue and pricing",
        "files": ["catalog_services.py", "views/catalog.py"],
        "frontend": [], "tests": ["test_catalog", "test_barcodes", "test_product_stock_link"],
        "public_api": ["catalog_services.py"],
    },
    "pos": {
        "tier": BUSINESS, "title_fa": "صندوق فروش و سفارش‌ها", "title_en": "Point of sale and orders",
        "files": ["order_services.py", "models/orders.py", "views/orders.py", "views/pos/", "views/viewsets.py",
                  "views/business_page_views/pages.py",
                  "views/dashboard/pos_section.py"],
        "frontend": ["features/business/pos"], "tests": ["test_pos_day_summary", "test_pos_actions"],
        "public_api": ["order_services.py", "views/dashboard/pos_section.py"],
    },
    "inventory": {
        "tier": BUSINESS, "title_fa": "انبار، خرید و فاکتورها", "title_en": "Inventory, purchasing and invoicing",
        "files": ["inventory_services.py", "models/inventory.py", "models/purchasing.py",
                  "models/sales.py", "views/inventory/", "views/warehouse/", "views/invoicing/", "views/helpers/",
                  "views/business_page_views/purchase_pages.py", "views/dashboard/inventory_section.py"],
        "frontend": ["features/business/inventory"],
        "tests": ["test_inventory_flow", "test_warehouse_access", "test_warehouse_dispatch", "test_warehouse_list_flag",
                  "test_invoicing_auth", "test_addresses"],
        "public_api": ["inventory_services.py", "views/dashboard/inventory_section.py"],
    },
    "production": {
        "tier": BUSINESS, "title_fa": "تولید و فرمولاسیون", "title_en": "Production and formulas",
        "files": ["production_engine.py", "production_parser.py", "production_services.py", "models/production.py",
                  "views/production/"],
        "frontend": ["features/business/production", "features/business/dictionary"],
        "tests": ["test_production", "test_production_routing", "test_production_stock"],
        "public_api": ["production_services.py"],
    },
    "accounting": {
        "tier": BUSINESS, "title_fa": "حسابداری", "title_en": "Accounting",
        "files": ["accounting_autopilot.py", "accounting_charts.py", "accounting_fiscal.py", "accounting_posting.py",
                  "accounting_reports.py", "accounting_services.py", "accounting_treasury.py",
                  "models/accounting.py", "models/accounting_pro.py",
                  "views/accounting.py", "views/accounting_auto.py", "views/accounting_pro.py"],
        "frontend": ["features/business/accounting"], "tests": ["test_accounting", "test_accounting_pro", "test_autopilot"],
        "public_api": ["accounting_services.py"],
    },
    "delivery": {
        "tier": BUSINESS, "title_fa": "حمل و تحویل", "title_en": "Delivery and transport",
        "files": ["delivery_routing.py", "delivery_services.py", "transport_services.py", "models/delivery.py",
                  "views/delivery.py"],
        "frontend": ["features/business/delivery"],
        "tests": ["test_delivery", "test_delivery_api", "test_delivery_generic", "test_delivery_pos"],
        "public_api": ["delivery_services.py"],
    },
    "club": {
        "tier": BUSINESS, "title_fa": "باشگاه مشتریان", "title_en": "Customer club / loyalty",
        "files": ["club_analytics.py", "club_campaigns.py", "club_services.py", "models/club.py",
                  "views/club.py", "views/club_public.py"],
        "frontend": ["features/business/club", "features/public/club"],
        "tests": ["test_club", "test_club_suite"], "public_api": ["club_services.py"],
    },
    "feedback": {
        "tier": BUSINESS, "title_fa": "نظرسنجی", "title_en": "Feedback / surveys",
        "files": ["models/feedback.py", "views/feedback.py"],
        "frontend": ["features/business/feedback", "features/public/feedback"], "tests": ["test_feedback"],
        "public_api": [],
    },
    "qr": {
        "tier": BUSINESS, "title_fa": "کد QR و سفارش با QR", "title_en": "QR links and QR ordering",
        "files": ["qr_services.py", "models/qr.py", "views/qr_order.py", "views/qr_redirect.py", "views/super_admin/qr.py"],
        "frontend": ["features/public", "features/super_admin/qr"],
        "tests": ["test_qr_flow", "test_qr_links", "test_qr_order"], "public_api": [],
    },
    "card_terminal": {
        "tier": BUSINESS, "title_fa": "کارتخوان", "title_en": "Card terminal",
        "files": ["card_terminal/", "models/card_terminal.py", "views/card_reader.py"],
        "frontend": [], "tests": ["test_card_terminal"], "public_api": ["card_terminal/services.py"],
    },
    "support": {
        "tier": BUSINESS, "title_fa": "پشتیبانی", "title_en": "Support tickets",
        "files": ["models/support.py", "views/support.py", "views/super_admin/support.py"],
        "frontend": ["features/business/support", "features/super_admin/support"], "tests": ["test_support"],
        "public_api": [],
    },
    "dashboard": {
        "tier": COMPOSE, "title_fa": "داشبورد (تجمیع خواندنی)", "title_en": "Dashboard (read-only aggregation)",
        "files": ["dashboard_summary.py", "views/dashboard/"],
        "frontend": ["features/business/dashboard"], "tests": ["test_industry_dashboard"], "public_api": [],
    },
    # ───────────── composition root (exempt) ─────────────
    "root": {
        "tier": ROOT, "title_fa": "ریشهٔ ترکیب (url، serializer، admin)",
        "title_en": "Composition root (urls, serializers, admin)",
        "files": ["urls.py", "serializers.py", "admin.py", "apps.py", "seeders.py", "management/", "__init__.py", "models/__init__.py",
                  "views/__init__.py", "views/business_page_views/__init__.py"],
        "frontend": [], "tests": [], "public_api": [],
    },
}

# Declared business->business edges: who may call whom, through the target's public_api only.
# Hard prerequisites (modules.py ``requires``, e.g. production -> inventory) MUST appear here (checked by the
# test). The other edges are optional integrations that degrade silently when the target is off.
DEPENDS_ON: dict[str, list[str]] = {
    "pos": ["catalog", "inventory", "delivery", "card_terminal"],
    "inventory": [],
    "production": ["inventory", "catalog"],
    "accounting": ["inventory", "pos"],
    "delivery": ["accounting", "pos"],
    "club": ["inventory", "pos"],
    "feedback": [],
    "catalog": ["inventory", "production"],
    "qr": ["pos", "catalog"],
    "card_terminal": ["pos", "delivery"],
    "support": [],
    "dashboard": ["pos", "inventory", "accounting", "delivery", "club", "production"],
}

# Domain events (bizsuite/events.py): name -> publishers / subscribers (module names) and payload.
# Event edges also couple tests: a subscriber change must re-run the publishers' tests (see dependents()).
EVENTS: dict[str, dict] = {
    "pos_order.paid": {"publishers": ["pos", "card_terminal"], "subscribers": ["club", "accounting"],
                       "payload": "order, user"},
    "pos_order.delivered": {"publishers": ["pos"], "subscribers": ["club"], "payload": "order"},
    "pos_order.cancelled": {"publishers": ["pos"], "subscribers": ["accounting"], "payload": "order, user"},
    "pos_order.dispatch_requested": {"publishers": ["pos", "card_terminal"], "subscribers": ["delivery"],
                                     "payload": "order, driver_id, cod, user[, skip_if_dispatched]; returns dispatch dict"},
    "sales_invoice.created": {"publishers": ["inventory"], "subscribers": ["accounting"], "payload": "obj, user"},
    "sales_invoice.updated": {"publishers": ["inventory"], "subscribers": ["accounting"], "payload": "obj, user"},
    "sales_invoice.deleted": {"publishers": ["inventory"], "subscribers": ["accounting"], "payload": "obj, user"},
    "sales_invoice.finalized": {"publishers": ["inventory"], "subscribers": ["club"], "payload": "obj"},
    "sales_return.created": {"publishers": ["inventory"], "subscribers": ["accounting"], "payload": "obj, user"},
    "sales_return.deleted": {"publishers": ["inventory"], "subscribers": ["accounting"], "payload": "obj, user"},
    "purchase_return.created": {"publishers": ["inventory"], "subscribers": ["accounting"], "payload": "obj, user"},
    "purchase_return.deleted": {"publishers": ["inventory"], "subscribers": ["accounting"], "payload": "obj, user"},
    "expense.created": {"publishers": ["inventory"], "subscribers": ["accounting"], "payload": "obj, user"},
    "expense.deleted": {"publishers": ["inventory"], "subscribers": ["accounting"], "payload": "obj, user"},
    "stock_waste.recorded": {"publishers": ["inventory"], "subscribers": ["accounting"], "payload": "movement, user"},
}

# test files that belong to no module list but intentionally to the platform
PLATFORM_TESTS = ["test_module_boundaries", "test_module_workflow"]

IGNORED = ("migrations/",)


def _rules() -> list[tuple[str, str]]:
    rules = [(f, name) for name, m in MODULES.items() for f in m["files"]]
    rules.sort(key=lambda r: -len(r[0]))  # most specific first
    return rules


_RULES = _rules()


def module_of(relpath: str) -> str | None:
    """Module owning ``relpath`` (relative to bizsuite/, forward slashes), or None."""
    for prefix, name in _RULES:
        if prefix.endswith("/"):
            if relpath.startswith(prefix):
                return name
        elif relpath == prefix:
            return name
    return None


def tier(name: str) -> str:
    return MODULES[name]["tier"]


def edge_allowed(src: str, dst: str) -> bool:
    """May ``src`` use ``dst``'s public interface?"""
    if src == dst:
        return True
    ts, td = tier(src), tier(dst)
    if ROOT in (ts, td) or td == CORE:
        return True
    if ts == CORE:
        return False
    return dst in DEPENDS_ON.get(src, [])


def owner_of_test(filename: str) -> str | None:
    """Module owning a test file (``test_x.py`` or ``test_x``)."""
    stem = filename.replace("\\", "/").rsplit("/", 1)[-1]
    if stem.endswith(".py"):
        stem = stem[:-3]
    for name, m in MODULES.items():
        if stem in m["tests"]:
            return name
    if stem in PLATFORM_TESTS:
        return "core"
    return None


def event_edges() -> dict[str, set[str]]:
    """module -> modules it is coupled to through events (publisher <-> subscriber, both directions)."""
    out: dict[str, set[str]] = {}
    for ev in EVENTS.values():
        for p in ev["publishers"]:
            for sub in ev["subscribers"]:
                if p != sub:
                    out.setdefault(p, set()).add(sub)
                    out.setdefault(sub, set()).add(p)
    return out


def dependents(name: str) -> set[str]:
    """Modules whose behaviour can change when ``name`` changes, so their tests must re-run:
    modules that depend on it (transitively) and its direct event partners.
    A change in a core module affects every non-root module."""
    if tier(name) == CORE:
        return {m for m in MODULES if m != name and tier(m) != ROOT}
    out, todo = set(), [name]
    while todo:  # who depends on it, transitively
        cur = todo.pop()
        for src, dsts in DEPENDS_ON.items():
            if cur in dsts and src != name and src not in out:
                out.add(src)
                todo.append(src)
    out |= event_edges().get(name, set()) - {name}  # direct event partners (publishers/subscribers)
    return out
