"""
سرفصل حساب‌ها (کدینگ) و قالب‌های صنفی.

ساختار کدینگ چهاررقمی به سبک رایج ایران:
    گروه  (X000)  ←  کل (XY00)  ←  معین (XYZZ، قابل ثبت)  ←  تفصیلی (DetailAccount، شناور)

«هسته»ی مشترک در همه‌ی قالب‌ها هست، چون ثبت خودکار (فروش، خرید، انبار، تولید، چک، بانک) با همین کدها کار می‌کند.
هر قالب صنفی فقط حساب‌های اضافه‌ی خودش را به هسته می‌افزاید؛ اعمال قالب idempotent است و چیزی را حذف یا
بازنویسی نمی‌کند، پس می‌شود بعداً هم قالب دیگری را رویش اعمال کرد.

کلیدهای قالب (برای ویزارد صنف و API): general, service, retail, restaurant, manufacturing, distribution, iran_standard
"""

from __future__ import annotations

from django.db import transaction

A, L, E, I, X = "asset", "liability", "equity", "income", "expense"

# (کد, نام فارسی, نام انگلیسی, نوع, کد والد, قابل ثبت, نقش)
CORE_CHART = [
    ("1000", "دارایی‌ها", "Assets", A, None, False, ""),
    ("1100", "دارایی‌های جاری", "Current assets", A, "1000", False, ""),
    ("1110", "صندوق", "Cash", A, "1100", True, "cash"),
    ("1120", "بانک و کارتخوان", "Bank & card terminal", A, "1100", True, "bank"),
    ("1130", "حساب‌های دریافتنی (مشتریان)", "Accounts receivable", A, "1100", True, "receivable"),
    ("1135", "اسناد دریافتنی (چک‌های نزد صندوق)", "Notes receivable (cheques in hand)", A, "1100", True,
     "notes_receivable"),
    ("1136", "اسناد در جریان وصول", "Cheques in collection", A, "1100", True, "cheques_in_collection"),
    ("1137", "چک‌های برگشتی دریافتنی", "Bounced cheques receivable", A, "1100", True, "bounced_cheques"),
    ("1140", "موجودی کالا و مواد", "Inventory", A, "1100", True, "inventory"),
    ("1150", "وجه نزد رانندگان", "Cash held by drivers", A, "1100", True, "cash_in_transit"),
    ("1160", "پیش‌پرداخت‌ها", "Prepayments", A, "1100", True, "prepayment"),
    ("1170", "مالیات بر ارزش افزوده خرید", "VAT input (recoverable)", A, "1100", True, "vat_in"),
    ("1200", "دارایی‌های ثابت", "Fixed assets", A, "1000", False, "fixed_asset"),
    ("1210", "خودرو و ناوگان", "Vehicles & fleet", A, "1200", True, "fixed_asset"),
    ("1220", "تجهیزات", "Equipment", A, "1200", True, "fixed_asset"),
    ("2000", "بدهی‌ها", "Liabilities", L, None, False, ""),
    ("2100", "بدهی‌های جاری", "Current liabilities", L, "2000", False, ""),
    ("2110", "حساب‌های پرداختنی (تأمین‌کنندگان)", "Accounts payable", L, "2100", True, "payable"),
    ("2115", "اسناد پرداختنی (چک‌های صادره)", "Notes payable (issued cheques)", L, "2100", True, "notes_payable"),
    ("2120", "بدهی به رانندگان", "Payable to drivers", L, "2100", True, "payable_other"),
    ("2130", "بدهی به حمل‌کنندگان بیرونی", "Payable to carriers", L, "2100", True, "payable_other"),
    ("2140", "مالیات و عوارض پرداختنی", "Taxes payable", L, "2100", True, "tax_payable"),
    ("2141", "مالیات بر ارزش افزوده فروش", "VAT output (payable)", L, "2100", True, "vat_out"),
    ("2150", "پیش‌دریافت از مشتریان", "Customer deposits", L, "2100", True, "customer_deposit"),
    ("3000", "حقوق صاحبان سرمایه", "Equity", E, None, False, ""),
    ("3110", "سرمایه", "Capital", E, "3000", True, "capital"),
    ("3120", "سود (زیان) انباشته", "Retained earnings", E, "3000", True, "retained_earnings"),
    ("3130", "برداشت صاحب سرمایه", "Owner drawings", E, "3000", True, "drawings"),
    ("3140", "خلاصه سود و زیان", "Income summary", E, "3000", True, "income_summary"),
    ("4000", "درآمدها", "Revenue", I, None, False, ""),
    ("4110", "فروش کالا و خدمات", "Sales", I, "4000", True, "sales"),
    ("4120", "درآمد حمل و ارسال", "Delivery revenue", I, "4000", True, "sales"),
    ("4130", "برگشت از فروش", "Sales returns", I, "4000", True, "sales"),
    ("4140", "تخفیفات فروش", "Sales discounts", I, "4000", True, "sales"),
    ("4190", "سایر درآمدها", "Other income", I, "4000", True, "other_income"),
    ("5000", "هزینه‌ها", "Expenses", X, None, False, ""),
    ("5110", "بهای تمام‌شده کالای فروش‌رفته", "Cost of goods sold", X, "5000", True, "cogs"),
    ("5120", "ضایعات و کسری موجودی", "Waste & shrinkage", X, "5000", True, "cogs"),
    ("5210", "هزینه حمل و ارسال (کارمزد رانندگان)", "Delivery & driver cost", X, "5000", True, ""),
    ("5220", "هزینه سوخت", "Fuel", X, "5000", True, ""),
    ("5230", "هزینه تعمیر و نگهداری خودرو", "Vehicle maintenance", X, "5000", True, ""),
    ("5240", "هزینه حمل‌کنندگان بیرونی", "External carrier cost", X, "5000", True, ""),
    ("5310", "حقوق و دستمزد", "Payroll", X, "5000", True, ""),
    ("5320", "اجاره", "Rent", X, "5000", True, ""),
    ("5330", "آب، برق، گاز و تلفن", "Utilities", X, "5000", True, ""),
    ("5390", "سایر هزینه‌ها", "Other expenses", X, "5000", True, ""),
    ("5400", "اختلاف تسویه نقدی", "Cash settlement difference", X, "5000", True, ""),
    ("5410", "کارمزد خدمات بانکی", "Bank charges", X, "5000", True, "bank_charges"),
]

# آخرین کدی که به هسته اضافه شده؛ اگر نباشد، هسته دوباره (idempotent) کامل می‌شود
CORE_MARKER = "5410"

SERVICE_EXTRA = [
    ("4150", "درآمد ارائه‌ی خدمات", "Service revenue", I, "4000", True, "sales"),
    ("4160", "درآمد قراردادها و پروژه‌ها", "Contract & project revenue", I, "4000", True, "sales"),
    ("1180", "کار در جریان (صورت‌حساب‌نشده)", "Unbilled work in progress", A, "1100", True, ""),
    ("5340", "هزینه پیمانکاران و مشاوران", "Contractors & consultants", X, "5000", True, ""),
    ("5350", "هزینه نرم‌افزار و اشتراک‌ها", "Software & subscriptions", X, "5000", True, ""),
    ("5360", "هزینه تبلیغات و بازاریابی", "Advertising & marketing", X, "5000", True, ""),
]

RETAIL_EXTRA = [
    ("4115", "فروش اینترنتی", "Online sales", I, "4000", True, "sales"),
    ("5360", "هزینه تبلیغات و بازاریابی", "Advertising & marketing", X, "5000", True, ""),
    ("5370", "کارمزد کارتخوان و درگاه پرداخت", "Card & payment gateway fees", X, "5000", True, "bank_charges"),
    ("5380", "هزینه بسته‌بندی", "Packaging", X, "5000", True, ""),
    ("1230", "دکوراسیون و تجهیزات فروشگاه", "Shop fit-out & fixtures", A, "1200", True, "fixed_asset"),
]

RESTAURANT_EXTRA = [
    ("4111", "فروش غذا", "Food sales", I, "4000", True, "sales"),
    ("4112", "فروش نوشیدنی", "Beverage sales", I, "4000", True, "sales"),
    ("4121", "حق سرویس", "Service charge", I, "4000", True, "sales"),
    ("5111", "بهای مواد غذایی مصرفی", "Food cost", X, "5000", True, "cogs"),
    ("5370", "کارمزد پلتفرم‌های سفارش آنلاین", "Online ordering platform fees", X, "5000", True, ""),
    ("5380", "هزینه بسته‌بندی و یک‌بارمصرف", "Packaging & disposables", X, "5000", True, ""),
    ("1230", "تجهیزات آشپزخانه", "Kitchen equipment", A, "1200", True, "fixed_asset"),
]

MANUFACTURING_EXTRA = [
    ("1141", "مواد اولیه", "Raw materials", A, "1100", True, "inventory"),
    ("1142", "کالای در جریان ساخت", "Work in progress", A, "1100", True, "inventory"),
    ("1143", "کالای ساخته‌شده", "Finished goods", A, "1100", True, "inventory"),
    ("1144", "قطعات و لوازم یدکی", "Spare parts", A, "1100", True, "inventory"),
    ("1230", "ماشین‌آلات تولید", "Production machinery", A, "1200", True, "fixed_asset"),
    ("1240", "ساختمان و تأسیسات", "Buildings & installations", A, "1200", True, "fixed_asset"),
    ("5150", "دستمزد مستقیم تولید", "Direct labour", X, "5000", True, "cogs"),
    ("5160", "سربار تولید", "Manufacturing overhead", X, "5000", True, "cogs"),
    ("5170", "هزینه استهلاک ماشین‌آلات", "Machinery depreciation", X, "5000", True, ""),
]

DISTRIBUTION_EXTRA = [
    ("1145", "کالای در راه", "Goods in transit", A, "1100", True, "inventory"),
    ("4170", "فروش عمده", "Wholesale sales", I, "4000", True, "sales"),
    ("2160", "پورسانت پرداختنی", "Commissions payable", L, "2100", True, "payable_other"),
    ("5250", "هزینه انبارداری", "Warehousing", X, "5000", True, ""),
    ("5260", "هزینه حمل و توزیع", "Distribution & freight", X, "5000", True, ""),
    ("5270", "پورسانت بازاریابان و ویزیتورها", "Sales commissions", X, "5000", True, ""),
]

# قالب استاندارد ایران: هسته + سرفصل‌های رایج در کدینگ نمونه‌ی ایران (بیمه، مالیات حقوق، ذخیره‌ی پایان خدمت،
# استهلاک انباشته، اندوخته‌ی قانونی، درآمد/هزینه‌ی غیرعملیاتی …)
IRAN_STANDARD_EXTRA = [
    ("1180", "سپرده‌ها و ودایع", "Deposits & guarantees", A, "1100", True, ""),
    ("1190", "سرمایه‌گذاری‌های کوتاه‌مدت", "Short-term investments", A, "1100", True, ""),
    ("1230", "ساختمان", "Buildings", A, "1200", True, "fixed_asset"),
    ("1240", "اثاثه و منصوبات", "Furniture & fixtures", A, "1200", True, "fixed_asset"),
    ("1250", "استهلاک انباشته دارایی‌های ثابت", "Accumulated depreciation", A, "1200", True, "fixed_asset"),
    ("1260", "دارایی‌های نامشهود (سرقفلی، نرم‌افزار)", "Intangible assets", A, "1200", True, "fixed_asset"),
    ("2160", "حقوق و دستمزد پرداختنی", "Salaries payable", L, "2100", True, "payable_other"),
    ("2170", "حق بیمه پرداختنی (تأمین اجتماعی)", "Social security payable", L, "2100", True, "tax_payable"),
    ("2180", "مالیات حقوق پرداختنی", "Payroll tax payable", L, "2100", True, "tax_payable"),
    ("2190", "سپرده‌های دریافتی و حسن انجام کار", "Deposits received & retentions", L, "2100", True, ""),
    ("2200", "بدهی‌های غیرجاری", "Non-current liabilities", L, "2000", False, ""),
    ("2210", "تسهیلات مالی بلندمدت", "Long-term loans", L, "2200", True, "loan"),
    ("2220", "ذخیره مزایای پایان خدمت کارکنان", "Employee end-of-service provision", L, "2200", True, ""),
    ("3150", "اندوخته قانونی", "Legal reserve", E, "3000", True, ""),
    ("4210", "سود سپرده‌های بانکی", "Bank interest income", I, "4000", True, "other_income"),
    ("4220", "سود (زیان) فروش دارایی‌ها", "Gain/loss on disposal of assets", I, "4000", True, "other_income"),
    ("5420", "هزینه سود تسهیلات", "Loan interest expense", X, "5000", True, ""),
    ("5430", "هزینه استهلاک", "Depreciation expense", X, "5000", True, ""),
    ("5440", "حق بیمه سهم کارفرما", "Employer social security", X, "5000", True, ""),
    ("5450", "عیدی، پاداش و سنوات", "Bonuses & severance", X, "5000", True, ""),
    ("5460", "هزینه مالیات عملکرد", "Income tax expense", X, "5000", True, ""),
]

CHART_TEMPLATES = {
    "general": {"fa": "عمومی", "en": "General", "extra": []},
    "service": {"fa": "خدماتی", "en": "Service business", "extra": SERVICE_EXTRA},
    "retail": {"fa": "فروشگاهی", "en": "Retail shop", "extra": RETAIL_EXTRA},
    "restaurant": {"fa": "رستوران و کافه", "en": "Restaurant & café", "extra": RESTAURANT_EXTRA},
    "manufacturing": {"fa": "تولیدی", "en": "Manufacturing", "extra": MANUFACTURING_EXTRA},
    "distribution": {"fa": "پخش و بازرگانی", "en": "Distribution & trading", "extra": DISTRIBUTION_EXTRA},
    "iran_standard": {"fa": "استاندارد ایران", "en": "Iranian standard", "extra": IRAN_STANDARD_EXTRA},
}
CHART_TEMPLATE_KEYS = list(CHART_TEMPLATES)


def template_list():
    return [{"key": k, "fa": v["fa"], "en": v["en"], "extra_count": len(v["extra"])} for k, v in CHART_TEMPLATES.items()]


def _seed_rows(business, rows, lock=True) -> int:
    from .models import Account

    if lock:
        # چند درخواست هم‌زمان برای یک کسب‌وکار تازه: قفل ردیف کسب‌وکار باعث می‌شود نوبتی بسازند
        type(business).objects.select_for_update().filter(pk=business.pk).first()
    by_code = {a.code: a for a in Account.all_objects.filter(business=business)}
    created = 0
    for code, name, name_en, typ, parent_code, postable, role in rows:
        acc = by_code.get(code)
        if acc is not None:
            # سرفصل‌های قدیمی بدون نقش: نقش را تکمیل کن (چیز دیگری را تغییر نده)
            if role and not acc.role:
                acc.role = role
                acc.save(update_fields=["role"])
            continue
        parent = by_code.get(parent_code) if parent_code else None
        if parent is not None and parent.is_postable:
            # والدی که خودش قابل ثبت است فقط وقتی گروه می‌شود که سند نداشته باشد
            if parent.lines.exists():
                parent = parent.parent
            else:
                parent.is_postable = False
                parent.save(update_fields=["is_postable"])
        acc = Account.all_objects.create(
            business=business, code=code, name=name, name_en=name_en, type=typ, parent=parent,
            is_postable=postable, is_system=True, role=role,
        )
        by_code[code] = acc
        created += 1
    return created


@transaction.atomic
def seed_core_chart(business) -> int:
    return _seed_rows(business, CORE_CHART)


@transaction.atomic
def apply_chart_template(business, key: str) -> int:
    """هسته + حساب‌های قالب صنفی را می‌سازد (idempotent) و قالب را در تنظیمات ذخیره می‌کند."""
    from .models import AccountingSettings

    if key not in CHART_TEMPLATES:
        raise ValueError("قالب سرفصل نامعتبر است.")
    created = _seed_rows(business, CORE_CHART)
    created += _seed_rows(business, CHART_TEMPLATES[key]["extra"], lock=False)
    st, _ = AccountingSettings.all_objects.get_or_create(business=business)
    if st.chart_template != key:
        st.chart_template = key
        st.save(update_fields=["chart_template", "updated_at"])
    return created
