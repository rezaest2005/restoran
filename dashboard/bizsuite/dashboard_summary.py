"""
Main dashboard summary — one payload that only contains data for modules this business has AND this user may see.

Every block is gated twice:

* the module is live for the business (``modules.enabled_modules``) and, when the owner said in the setup wizard
  which modules he actually uses, it is one of those, and
* the signed-in user holds at least one feature (tab) of that block (``features.user_features``).

A block that fails the gate is simply absent from the payload (never an empty restaurant widget). The widget model
(key + required module + required features, filtered declaratively) follows the dashboard-widget library pattern of
InvenTree (MIT) — re-implemented here, see THIRD_PARTY_NOTICES.md.
"""

from __future__ import annotations

import datetime
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.utils import timezone

from . import industries
from .features import user_features
from .modules import CATALOG, enabled_modules

# block key -> (module, any-of features)
BLOCKS: dict[str, tuple[str | None, tuple[str, ...]]] = {
    "pos": ("pos", ("pos", "pos_report", "orders")),
    "invoices": ("inventory", ("inventory_sales",)),
    "accounting": ("accounting", ("accounting",)),
    "deliveries": ("delivery", ("delivery_dispatch", "delivery_shipments", "delivery_fleet",
                                "delivery_cash", "delivery_history")),
    "club": ("club", ("club",)),
    "inventory": ("inventory", ("inventory_warehouse", "inventory_reports", "inventory_purchase_list",
                                "inventory_receiving", "dictionary_items")),
    "production": ("production", ("kitchen", "recipes", "dictionary_recipe")),
}

SUBSCRIPTION_WARN_DAYS = 14


def _int(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def dashboard_modules(business) -> set[str]:
    """Live modules, narrowed to the ones the owner said he uses (setup wizard), when he said so."""
    live = enabled_modules(business)
    if live is None:
        live = {m["code"] for m in CATALOG}
    used = (getattr(business, "industry_options", None) or {}).get("used_modules")
    if isinstance(used, list) and used:
        narrowed = live & set(used)
        if narrowed:
            return narrowed
    return set(live)


def allowed_blocks(business, user) -> set[str]:
    mods = dashboard_modules(business)
    feats = user_features(user)
    return {k for k, (mod, need) in BLOCKS.items()
            if (mod is None or mod in mods) and any(f in feats for f in need)}


# ─── blocks ───────────────────────────────────────────

def _pos(business, today, month_start):
    from .models import Order
    qs = Order.all_objects.filter(business=business).exclude(status="cancelled")
    t = qs.filter(created_at__date=today).aggregate(s=Sum("total_price"), n=Count("id"))
    m = qs.filter(created_at__date__gte=month_start).aggregate(s=Sum("total_price"))
    open_n = qs.filter(status__in=["pending", "confirmed", "preparing", "ready"]).count()
    n = _int(t["n"])
    return {"today_sales": _int(t["s"]), "today_count": n, "avg_ticket": _int(t["s"]) // n if n else 0,
            "month_sales": _int(m["s"]), "open_orders": open_n}


def _remaining_expr():
    return ExpressionWrapper(F("total") - F("discount") - F("paid_amount"),
                             output_field=DecimalField(max_digits=16, decimal_places=2))


def _invoices(business, today, month_start):
    from .models import SalesInvoice
    qs = SalesInvoice.all_objects.filter(business=business)
    net = ExpressionWrapper(F("total") - F("discount"), output_field=DecimalField(max_digits=16, decimal_places=2))
    t = qs.filter(date=today).aggregate(s=Sum(net), n=Count("id"))
    m = qs.filter(date__gte=month_start).aggregate(s=Sum(net))
    unpaid = qs.annotate(rem=_remaining_expr()).filter(rem__gt=0)
    u = unpaid.aggregate(s=Sum("rem"), n=Count("id"))
    overdue = unpaid.filter(date__lt=today - datetime.timedelta(days=30)).count()
    return {"today_sales": _int(t["s"]), "today_count": _int(t["n"]), "month_sales": _int(m["s"]),
            "unpaid_count": _int(u["n"]), "unpaid_total": _int(u["s"]), "overdue_30_count": overdue}


def _balance(business, codes) -> int:
    from .models import JournalLine
    agg = JournalLine.all_objects.filter(business=business, account__code__in=codes).aggregate(
        d=Sum("debit"), c=Sum("credit"))
    return _int((agg["d"] or Decimal(0)) - (agg["c"] or Decimal(0)))


def _accounting(business, today, month_start):
    from .models import Payment
    try:
        from .accounting_services import BANK, CASH, RECEIVABLE
    except Exception:  # pragma: no cover - codes moved: fall back to the standard ones
        CASH, BANK, RECEIVABLE = "1110", "1120", "1130"
    pay = Payment.all_objects.filter(business=business, date=today).values("kind").annotate(s=Sum("amount"))
    by_kind = {r["kind"]: _int(r["s"]) for r in pay}
    return {"cash": _balance(business, [CASH]), "bank": _balance(business, [BANK]),
            "receivables": _balance(business, [RECEIVABLE]),
            "received_today": by_kind.get("in", 0), "paid_today": by_kind.get("out", 0)}


def _deliveries(business, today, now):
    from .models import Trip, TripStop
    stops = TripStop.all_objects.filter(business=business)
    delivered_today = stops.filter(status="delivered", delivered_at__date=today)
    with_eta = delivered_today.filter(eta__isnull=False)
    on_time = with_eta.filter(delivered_at__lte=F("eta")).count()
    eta_n = with_eta.count()
    trips = Trip.all_objects.filter(business=business)
    cod = stops.filter(status="delivered", settlement__isnull=True).aggregate(s=Sum("collected_amount"))
    return {
        "trips_active": trips.filter(status__in=["planned", "assigned", "in_progress"]).count(),
        "trips_today": trips.filter(created_at__date=today).count(),
        "delivered_today": delivered_today.count(),
        "failed_today": stops.filter(status="failed", trip__created_at__date=today).count(),
        "pending_stops": stops.filter(status__in=["pending", "picked_up", "arrived"])
                              .exclude(trip__status="cancelled").count(),
        "late_stops": stops.filter(status__in=["pending", "picked_up", "arrived"], eta__lt=now)
                           .exclude(trip__status="cancelled").count(),
        "on_time_rate": round(on_time * 100 / eta_n) if eta_n else None,
        "cash_unsettled": _int(cod["s"]),
    }


def _club(business, today, month_start):
    from .models import LoyaltyMember, LoyaltyTransaction
    members = LoyaltyMember.all_objects.filter(business=business, is_active=True)
    agg = members.aggregate(n=Count("id"), pts=Sum("points_balance"))
    tx = LoyaltyTransaction.all_objects.filter(business=business, created_at__date__gte=month_start)
    return {"members": _int(agg["n"]), "points_outstanding": _int(agg["pts"]),
            "new_this_month": members.filter(joined_at__date__gte=month_start).count(),
            "points_earned_month": _int(tx.filter(points__gt=0).aggregate(s=Sum("points"))["s"]),
            "points_redeemed_month": -_int(tx.filter(kind="redeem").aggregate(s=Sum("points"))["s"])}


def _inventory(business):
    from .models import RawMaterial, StockItem
    stock = StockItem.all_objects.filter(business=business)
    value = stock.aggregate(v=Sum(F("quantity") * F("raw_material__price")))["v"]
    low = (RawMaterial.all_objects.filter(business=business, minimum_stock__gt=0, quantity__lte=F("minimum_stock"))
           .order_by("quantity")[:50])
    low = list(low)
    return {"stock_value": _int(value),
            "items": RawMaterial.all_objects.filter(business=business).count(),
            "low_stock_count": len(low),
            "low_stock": [{"id": m.id, "name": m.name, "quantity": float(m.quantity or 0),
                           "minimum": float(m.minimum_stock or 0), "unit": m.unit} for m in low[:5]]}


def _production(business, today, month_start):
    from .models import ProductionOrder
    qs = ProductionOrder.all_objects.filter(business=business)
    return {"in_progress": qs.filter(status="in_progress").count(),
            "planned": qs.filter(status="planned").count(),
            "completed_today": qs.filter(status="completed", completed_at__date=today).count(),
            "completed_month": qs.filter(status="completed", completed_at__date__gte=month_start).count(),
            "cost_month": _int(qs.filter(status="completed", completed_at__date__gte=month_start)
                               .aggregate(s=Sum("total_cost"))["s"])}


# ─── alerts & checklist ───────────────────────────────

def _alerts(business, data, now):
    out = []
    from .subscription import payload as sub_payload
    sub = sub_payload(business, now=now)
    if not sub["unlimited"] and sub["seconds_left"] is not None and sub["seconds_left"] <= SUBSCRIPTION_WARN_DAYS * 86400:
        out.append({"key": "subscription", "level": "error" if sub["seconds_left"] <= 3 * 86400 else "warning",
                    "days_left": sub["seconds_left"] // 86400, "ends_at": sub["ends_at"]})
    inv = data.get("inventory")
    if inv and inv["low_stock_count"]:
        out.append({"key": "low_stock", "level": "warning", "count": inv["low_stock_count"],
                    "items": [i["name"] for i in inv["low_stock"][:3]]})
    invs = data.get("invoices")
    if invs and invs["unpaid_count"]:
        out.append({"key": "unpaid_invoices", "level": "warning" if invs["overdue_30_count"] else "info",
                    "count": invs["unpaid_count"], "total": invs["unpaid_total"],
                    "overdue": invs["overdue_30_count"]})
    dl = data.get("deliveries")
    if dl and dl["late_stops"]:
        out.append({"key": "late_deliveries", "level": "warning", "count": dl["late_stops"]})
    if dl and dl["failed_today"]:
        out.append({"key": "failed_deliveries", "level": "warning", "count": dl["failed_today"]})
    acc = data.get("accounting")
    if acc and acc["cash"] < 0:
        out.append({"key": "negative_cash", "level": "error", "total": acc["cash"]})
    return out


def checklist(business, user=None) -> list[dict]:
    """Onboarding steps (idea from Odoo's onboarding banners / ERPNext's setup checklist) for the live modules."""
    from .models import (Account, Customer, Driver, Food, Formula, LoyaltySettings, RawMaterial, User,
                         Vehicle, Warehouse)
    mods = dashboard_modules(business)
    b = business
    steps = [
        ("business_type", None, bool(b.industry) and b.setup_completed_at is not None),
        ("profile", None, bool(b.phone and b.address)),
        ("logo", None, bool(b.logo)),
        ("staff", None, User.objects.filter(business=b, is_active=True).exclude(role__in=["customer", "driver"]).count() > 1),
        ("products", "pos", Food.all_objects.filter(business=b).exists()),
        ("items", "inventory", RawMaterial.all_objects.filter(business=b).exists()),
        ("warehouse", "inventory", Warehouse.all_objects.filter(business=b).exists()),
        ("customers", "accounting", Customer.all_objects.filter(business=b).exists()),
        ("chart", "accounting", Account.all_objects.filter(business=b).exists()),
        ("formula", "production", Formula.all_objects.filter(business=b).exists()),
        ("fleet", "delivery", Driver.all_objects.filter(business=b).exists() or Vehicle.all_objects.filter(business=b).exists()),
        ("club", "club", LoyaltySettings.all_objects.filter(business=b).exists()),
    ]
    feats = user_features(user) if user is not None else None
    need = {"staff": "dictionary_users", "products": "dictionary_menu", "items": "dictionary_items",
            "warehouse": "dictionary_warehouses", "customers": "dictionary_customers", "chart": "accounting",
            "formula": "recipes", "fleet": "delivery_fleet", "club": "club"}
    out = []
    for key, mod, done in steps:
        if mod and mod not in mods:
            continue
        if feats is not None and key in need and need[key] not in feats:
            continue
        out.append({"key": key, "module": mod, "done": bool(done)})
    return out


# ─── entry point ──────────────────────────────────────

def build_summary(business, user, now=None) -> dict:
    now = now or timezone.now()
    today = timezone.localdate(now)
    month_start = today.replace(day=1)
    blocks = allowed_blocks(business, user)
    data: dict = {}
    if "pos" in blocks:
        data["pos"] = _pos(business, today, month_start)
    if "invoices" in blocks:
        data["invoices"] = _invoices(business, today, month_start)
    if "accounting" in blocks:
        data["accounting"] = _accounting(business, today, month_start)
    if "deliveries" in blocks:
        data["deliveries"] = _deliveries(business, today, now)
    if "club" in blocks:
        data["club"] = _club(business, today, month_start)
    if "inventory" in blocks:
        data["inventory"] = _inventory(business)
    if "production" in blocks:
        data["production"] = _production(business, today, month_start)

    # combined sales (POS orders + sales invoices) — only from blocks the user may see
    if "pos" in data or "invoices" in data:
        parts = [data.get("pos") or {}, data.get("invoices") or {}]
        data["sales"] = {"today": sum(p.get("today_sales", 0) for p in parts),
                         "today_count": sum(p.get("today_count", 0) for p in parts),
                         "month": sum(p.get("month_sales", 0) for p in parts)}
    if "accounting" in data or "invoices" in data:
        data["receivables"] = {
            "total": data["accounting"]["receivables"] if "accounting" in data else data["invoices"]["unpaid_total"],
            "unpaid_count": (data.get("invoices") or {}).get("unpaid_count"),
            "source": "ledger" if "accounting" in data else "invoices"}

    ind = industries.get_industry(business)
    show_checklist = not (business.industry_options or {}).get("checklist_dismissed")
    steps = checklist(business, user) if show_checklist else []
    widgets = [w for w in industries.widget_order(business) if w in data or
               (w == "cash" and "accounting" in data)]
    return {
        "industry": {"key": ind.key, "name_fa": ind.name_fa, "name_en": ind.name_en, "icon": ind.icon,
                     "set": bool(business.industry)},
        "setup_required": industries.is_setup_required(business),
        "terms": industries.terms_for(business),
        "modules": sorted(dashboard_modules(business)),
        "widgets": widgets,
        "data": data,
        "alerts": _alerts(business, data, now),
        "checklist": steps,
        "checklist_dismissed": not show_checklist,
        "server_now": now.isoformat(),
    }
