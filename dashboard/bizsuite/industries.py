"""
Business type (industry) presets — the single source of truth.

A preset never grants anything: licensing stays in ``modules.py`` / ``features.py``. A preset only *suggests* and
*words* things for one kind of business:

* ``modules``        modules this kind of business usually needs (the setup wizard pre-ticks them)
* ``terms``          the words the UI uses ("table/order" vs "customer/invoice", "dish" vs "product", ...)
* ``units``          default stock units (codes from ``models.common.UNIT_CHOICES``)
* ``coa_template``   starter chart-of-accounts template key (resolved with a graceful fallback, see
                     ``chart_template_for``)
* ``widgets``        the order of the main-dashboard widgets (widgets of modules the business does not have
                     are dropped later, never shown empty)

Idea credits (no code copied): ERPNext's setup-wizard "domains" (GPL-3.0, idea only) and Odoo's industry
packages / onboarding banners (ideas only). Existing businesses were migrated to ``restaurant`` so they keep their
current behaviour; a new business has an empty ``industry`` until the owner finishes the setup wizard.
"""

from __future__ import annotations

from dataclasses import dataclass, field

DEFAULT_INDUSTRY = "other"
LEGACY_INDUSTRY = "restaurant"

# words every preset can override; values are {"fa": ..., "en": ...}
GENERIC_TERMS: dict[str, dict[str, str]] = {
    "product": {"fa": "محصول", "en": "Product"},
    "products": {"fa": "محصولات", "en": "Products"},
    "order": {"fa": "فاکتور", "en": "Invoice"},
    "orders": {"fa": "فاکتورها", "en": "Invoices"},
    "customer": {"fa": "مشتری", "en": "Customer"},
    "customers": {"fa": "مشتریان", "en": "Customers"},
    "category": {"fa": "دسته‌بندی", "en": "Category"},
    "production": {"fa": "تولید", "en": "Production"},
    "production_place": {"fa": "خط تولید", "en": "Production line"},
    "formula": {"fa": "فرمول", "en": "Formula"},
    "spot": {"fa": "محل تحویل", "en": "Pickup point"},
    "item": {"fa": "کالا", "en": "Item"},
    "items": {"fa": "کالاها", "en": "Items"},
    "sale": {"fa": "فروش", "en": "Sale"},
}

ALL_WIDGETS = ["sales", "pos", "receivables", "cash", "deliveries", "club", "inventory", "production"]


@dataclass(frozen=True)
class Industry:
    key: str
    name_fa: str
    name_en: str
    description_fa: str
    description_en: str
    icon: str
    modules: tuple[str, ...]
    coa_template: str
    units: tuple[str, ...]
    widgets: tuple[str, ...]
    terms: dict[str, dict[str, str]] = field(default_factory=dict)

    def all_terms(self) -> dict[str, dict[str, str]]:
        out = {k: dict(v) for k, v in GENERIC_TERMS.items()}
        for k, v in self.terms.items():
            out[k] = {**out.get(k, {}), **v}
        return out


def _t(fa, en):
    return {"fa": fa, "en": en}


INDUSTRIES: list[Industry] = [
    Industry(
        "restaurant", "رستوران و کافه", "Restaurant & cafe",
        "سفارش میز و بیرون‌بر، آشپزخانه، باشگاه مشتریان", "Table & takeaway orders, kitchen, loyalty club",
        "restaurant", ("pos", "inventory", "production", "club", "feedback", "accounting"),
        "restaurant", ("kg", "g", "l", "ml", "unit", "pack"),
        ("pos", "sales", "inventory", "production", "club", "cash", "deliveries", "receivables"),
        {
            "product": _t("آیتم منو", "Menu item"), "products": _t("منو", "Menu"),
            "order": _t("سفارش", "Order"), "orders": _t("سفارش‌ها", "Orders"),
            "customer": _t("مهمان", "Guest"), "customers": _t("مهمانان", "Guests"),
            "production_place": _t("آشپزخانه", "Kitchen"), "production": _t("آشپزخانه", "Kitchen"),
            "formula": _t("دستور پخت", "Recipe"), "spot": _t("میز", "Table"),
            "item": _t("ماده اولیه", "Ingredient"), "items": _t("مواد اولیه", "Ingredients"),
        },
    ),
    Industry(
        "retail", "فروشگاه خرده‌فروشی", "Retail shop",
        "صندوق فروش با بارکد، انبار، باشگاه مشتریان", "Barcode point of sale, stock, loyalty club",
        "store", ("pos", "inventory", "club", "accounting", "storefront"),
        "retail", ("unit", "pack", "box", "kg", "dozen"),
        ("sales", "pos", "inventory", "club", "cash", "receivables", "deliveries", "production"),
        {"order": _t("فاکتور فروش", "Sale receipt"), "orders": _t("فاکتورهای فروش", "Sale receipts"),
         "spot": _t("صندوق", "Counter")},
    ),
    Industry(
        "manufacturing", "تولیدی (شوینده، شیمیایی، غذایی و ...)", "Manufacturing (detergents, chemicals, food, ...)",
        "فرمولاسیون، دستور تولید، انبار مواد و محصول، پخش", "Formulation, production orders, material & product stock, distribution",
        "factory", ("inventory", "production", "accounting", "delivery"),
        "manufacturing", ("kg", "ton", "l", "m3", "pack", "pallet", "unit"),
        ("production", "inventory", "sales", "receivables", "cash", "deliveries", "pos", "club"),
        {"product": _t("محصول", "Product"), "item": _t("ماده / کالا", "Material"),
         "items": _t("مواد و کالاها", "Materials"), "production_place": _t("خط تولید", "Production line"),
         "spot": _t("انبار", "Warehouse")},
    ),
    Industry(
        "distribution", "پخش و عمده‌فروشی", "Distribution & wholesale",
        "فاکتور فروش نسیه، مطالبات، ناوگان و ارسال", "Credit sales, receivables, fleet & dispatch",
        "truck", ("inventory", "accounting", "delivery"),
        "distribution", ("box", "pack", "pallet", "unit", "kg", "ton"),
        ("sales", "receivables", "deliveries", "inventory", "cash", "club", "pos", "production"),
        {"customer": _t("مشتری / فروشگاه", "Customer / outlet"), "customers": _t("مشتریان", "Customers"),
         "spot": _t("مقصد", "Destination")},
    ),
    Industry(
        "services", "خدماتی", "Services",
        "فاکتور خدمات، دریافت و پرداخت، باشگاه مشتریان", "Service invoices, receipts & payments, loyalty club",
        "service", ("accounting", "feedback"),
        "service", ("unit", "set"),
        ("sales", "receivables", "cash", "club", "deliveries", "pos", "inventory", "production"),
        {"product": _t("خدمت", "Service"), "products": _t("خدمات", "Services"),
         "customer": _t("مشتری", "Client"), "customers": _t("مشتریان", "Clients")},
    ),
    Industry(
        "pharmacy", "داروخانه", "Pharmacy",
        "صندوق فروش، انبار با تاریخ انقضا، مطالبات بیمه", "Point of sale, stock with expiry dates, receivables",
        "pharmacy", ("pos", "inventory", "accounting", "club"),
        "retail", ("unit", "box", "pack", "ml", "g"),
        ("sales", "pos", "inventory", "receivables", "cash", "club", "deliveries", "production"),
        {"product": _t("دارو / کالا", "Medicine / item"), "products": _t("داروها و کالاها", "Medicines & items"),
         "customer": _t("بیمار / مشتری", "Patient / customer"), "customers": _t("مشتریان", "Customers"),
         "spot": _t("پیشخوان", "Counter")},
    ),
    Industry(
        "other", "سایر کسب‌وکارها", "Other business",
        "همه‌چیز عمومی؛ خودتان ماژول‌ها را انتخاب کنید", "Neutral wording; pick the modules yourself",
        "business", ("accounting",),
        "iran_standard", ("unit", "kg", "l", "pack"),
        tuple(ALL_WIDGETS),
    ),
]

INDUSTRY_BY_KEY = {i.key: i for i in INDUSTRIES}
INDUSTRY_KEYS = [i.key for i in INDUSTRIES]
# small aliases so callers/old data can use common names
ALIASES = {"cafe": "restaurant", "shop": "retail", "store": "retail", "wholesale": "distribution",
           "factory": "manufacturing", "service": "services", "": DEFAULT_INDUSTRY}


def normalize(key) -> str:
    key = (key or "").strip().lower()
    key = ALIASES.get(key, key)
    return key if key in INDUSTRY_BY_KEY else DEFAULT_INDUSTRY


def get_industry(business_or_key) -> Industry:
    key = business_or_key if isinstance(business_or_key, str) or business_or_key is None \
        else getattr(business_or_key, "industry", "")
    return INDUSTRY_BY_KEY[normalize(key)]


def terms_for(business) -> dict[str, dict[str, str]]:
    """Preset words plus the owner's own overrides (``industry_options["terms"]``)."""
    out = get_industry(business).all_terms()
    custom = (getattr(business, "industry_options", None) or {}).get("terms") or {}
    if isinstance(custom, dict):
        for k, v in custom.items():
            if k in out and isinstance(v, dict):
                out[k] = {**out[k], **{lng: str(s)[:60] for lng, s in v.items() if lng in ("fa", "en") and s}}
    return out


def chart_template_for(business_or_key) -> str:
    """
    Starter chart-of-accounts template key. Uses the accounting module's template registry when it exists
    (``accounting_services.CHART_TEMPLATES``) and falls back to ``iran_standard`` then the plain default chart.
    """
    opts = {} if isinstance(business_or_key, str) else (getattr(business_or_key, "industry_options", None) or {})
    key = opts.get("coa_template") or get_industry(business_or_key).coa_template
    try:
        from . import accounting_services
        registry = getattr(accounting_services, "CHART_TEMPLATES", None)
    except Exception:  # pragma: no cover - accounting is optional
        registry = None
    if not registry:
        return key            # registry not there (yet): keep the key, the accounting module decides later
    if key in registry:
        return key
    if "iran_standard" in registry:
        return "iran_standard"
    return next(iter(registry))


def widget_order(business) -> list[str]:
    order = list(get_industry(business).widgets)
    return order + [w for w in ALL_WIDGETS if w not in order]


# sample data for "show me an example" (seeders.seed_sample_data); neutral where possible
SAMPLES: dict[str, dict] = {
    "restaurant": {
        "categories": [("پیتزاها", "Pizzas"), ("برگرها", "Burgers"), ("نوشیدنی‌ها", "Drinks")],
        "products": [("پیتزا پپرونی", "Pepperoni Pizza", 0, 150000), ("پیتزا قارچ", "Mushroom Pizza", 0, 160000),
                     ("برگر کلاسیک", "Classic Burger", 1, 120000), ("نوشابه", "Soda", 2, 20000)],
        "materials": [("خمیر پیتزا", "kg", 20000, 10, 2), ("پنیر موزارلا", "kg", 80000, 0.5, 2),
                      ("گوشت چرخ‌کرده", "kg", 65000, 8, 3), ("سس مخصوص", "l", 30000, 1.5, 2)],
    },
    "retail": {
        "categories": [("لبنیات", "Dairy"), ("خشکبار", "Dry goods"), ("نوشیدنی", "Beverages")],
        "products": [("شیر یک لیتری", "Milk 1L", 0, 45000), ("پسته ۲۰۰ گرمی", "Pistachio 200g", 1, 380000),
                     ("آب معدنی", "Mineral water", 2, 15000)],
        "materials": [("شیر یک لیتری", "unit", 38000, 40, 10), ("آب معدنی", "unit", 9000, 5, 24)],
    },
    "manufacturing": {
        "categories": [("مایع ظرفشویی", "Dish liquid"), ("شوینده سطوح", "Surface cleaner")],
        "products": [("مایع ظرفشویی ۴ لیتری", "Dish liquid 4L", 0, 210000),
                     ("سفیدکننده ۱ لیتری", "Bleach 1L", 1, 65000)],
        "materials": [("سولفونیک اسید", "kg", 95000, 300, 100), ("سود سوزآور", "kg", 70000, 40, 50),
                      ("بطری ۴ لیتری", "unit", 9000, 1200, 500)],
    },
    "services": {
        "categories": [("خدمات", "Services")],
        "products": [("مشاوره یک‌ساعته", "One-hour consultation", 0, 1500000),
                     ("نصب و راه‌اندازی", "Installation", 0, 2500000)],
        "materials": [],
    },
}
SAMPLES["distribution"] = SAMPLES["retail"]
SAMPLES["pharmacy"] = {
    "categories": [("داروهای بدون نسخه", "OTC medicines"), ("بهداشتی", "Personal care")],
    "products": [("استامینوفن ۵۰۰", "Acetaminophen 500", 0, 35000), ("خمیر دندان", "Toothpaste", 1, 90000)],
    "materials": [("استامینوفن ۵۰۰", "box", 25000, 30, 10), ("خمیر دندان", "unit", 60000, 3, 6)],
}
SAMPLES["other"] = SAMPLES["services"]
