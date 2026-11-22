"""
Price list of the dashboard sections (Toman), owned by the product owner and shared by every customer.

Per section (not per tab) there is one price for each period: monthly, 3 months, 6 months, yearly. A customer's price
for a period is the sum of the prices of every section that has at least one tab ticked in his Access list. The
"general" section is free. Prices are plain non-negative integers.
"""
from __future__ import annotations

from .features import LOCKED_KEYS

PERIODS = ("monthly", "quarterly", "semiannual", "yearly")

# Section -> its tabs. Mirrors PERM_GROUPS in web/src/features/super_admin/common/superConfig.js (general is free).
SECTIONS = {
    "pos": ["pos", "pos_report", "pos_settings", "orders"],
    "inventory": ["inventory_invoice", "inventory_sales", "inventory_warehouse", "inventory_receiving",
                  "inventory_purchase_list", "inventory_reports"],
    "production": ["kitchen", "recipes", "dictionary_recipe"],
    "definitions": ["dictionary_menu", "dictionary_items", "dictionary_suppliers", "dictionary_warehouses",
                    "dictionary_customers", "dictionary_users"],
    "transport": ["delivery_dispatch", "delivery_shipments", "delivery_fleet", "delivery_cash", "delivery_history"],
    "more": ["club", "accounting", "feedback"],
}
MAX_PRICE = 10 ** 12


def empty_prices() -> dict:
    return {s: {p: 0 for p in PERIODS} for s in SECTIONS}


def load_prices() -> dict:
    from .models import SectionPriceList
    stored = (SectionPriceList.objects.filter(pk=1).values_list("prices", flat=True).first()) or {}
    out = empty_prices()
    for s in out:
        for p in PERIODS:
            v = (stored.get(s) or {}).get(p, 0)
            out[s][p] = v if isinstance(v, int) and v >= 0 else 0
    return out


def clean_prices(value):
    """(prices, None) or (None, error). Every section/period must be a non-negative integer (strings of digits allowed)."""
    if not isinstance(value, dict):
        return None, "prices must be an object"
    out = empty_prices()
    for s, per in value.items():
        if s not in SECTIONS:
            return None, f"unknown section: {s}"
        if not isinstance(per, dict):
            return None, f"prices of {s} must be an object"
        for p, v in per.items():
            if p not in PERIODS:
                return None, f"unknown period: {p}"
            if isinstance(v, str) and v.strip().isdigit():
                v = int(v.strip())
            if isinstance(v, bool) or not isinstance(v, int) or v < 0 or v > MAX_PRICE:
                return None, f"{s}.{p} must be a whole number of Toman, 0 or more"
            out[s][p] = v
    return out, None


def sections_of(access) -> list[str]:
    """Sections that have at least one ticked (non-locked) tab."""
    keys = set(access) - LOCKED_KEYS
    return [s for s, codes in SECTIONS.items() if keys & set(codes)]


def quote(access, prices=None) -> dict:
    """Price per period for these tabs, with the per-section breakdown."""
    prices = prices or load_prices()
    secs = sections_of(access)
    return {
        "sections": secs,
        "totals": {p: sum(prices[s][p] for s in secs) for p in PERIODS},
        "breakdown": {s: dict(prices[s]) for s in secs},
    }


def total_for(access, plan, prices=None):
    """Total for one period, or None when the plan is not one of the four periods."""
    return quote(access, prices)["totals"].get(plan)
