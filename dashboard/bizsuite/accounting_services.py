"""
هسته‌ی حسابداری دوطرفه (مستقل از صنعت).

قواعد:
  - هر سند باید متوازن باشد (جمع بدهکار = جمع بستانکار) و حداقل ۲ ردیف داشته باشد.
  - سند ثبت‌شده ویرایش یا حذف نمی‌شود؛ فقط با سند برگشتی ابطال می‌شود.
  - ثبت خودکار اسناد از یک منبع (فاکتور، هزینه، ...) idempotent است.
"""

import logging
from decimal import Decimal, ROUND_HALF_UP

from django.db import IntegrityError, transaction
from django.db.models import Max, Sum
from django.utils import timezone

from .models import Account, JournalEntry, JournalLine, Business

logger = logging.getLogger(__name__)

ZERO = Decimal("0.00")
Q2 = Decimal("0.01")


def q2(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Q2, rounding=ROUND_HALF_UP)


# ═══════════════════════════════════════
#  چارت حساب پیش‌فرض
# ═══════════════════════════════════════

A, L, E, I, X = "asset", "liability", "equity", "income", "expense"

# (کد, نام فارسی, نام انگلیسی, نوع, کد والد, قابل ثبت)
DEFAULT_CHART = [
    ("1000", "دارایی‌ها", "Assets", A, None, False),
    ("1100", "دارایی‌های جاری", "Current assets", A, "1000", False),
    ("1110", "صندوق", "Cash", A, "1100", True),
    ("1120", "بانک و کارتخوان", "Bank & card terminal", A, "1100", True),
    ("1130", "حساب‌های دریافتنی (مشتریان)", "Accounts receivable", A, "1100", True),
    ("1140", "موجودی کالا و مواد", "Inventory", A, "1100", True),
    ("1150", "وجه نزد رانندگان", "Cash held by drivers", A, "1100", True),
    ("1160", "پیش‌پرداخت‌ها", "Prepayments", A, "1100", True),
    ("1200", "دارایی‌های ثابت", "Fixed assets", A, "1000", False),
    ("1210", "خودرو و ناوگان", "Vehicles & fleet", A, "1200", True),
    ("1220", "تجهیزات", "Equipment", A, "1200", True),
    ("2000", "بدهی‌ها", "Liabilities", L, None, False),
    ("2100", "بدهی‌های جاری", "Current liabilities", L, "2000", False),
    ("2110", "حساب‌های پرداختنی (تأمین‌کنندگان)", "Accounts payable", L, "2100", True),
    ("2120", "بدهی به رانندگان", "Payable to drivers", L, "2100", True),
    ("2130", "بدهی به حمل‌کنندگان بیرونی", "Payable to carriers", L, "2100", True),
    ("2140", "مالیات و عوارض پرداختنی", "Taxes payable", L, "2100", True),
    ("2150", "پیش‌دریافت از مشتریان", "Customer deposits", L, "2100", True),
    ("3000", "حقوق صاحبان سرمایه", "Equity", E, None, False),
    ("3110", "سرمایه", "Capital", E, "3000", True),
    ("3120", "سود (زیان) انباشته", "Retained earnings", E, "3000", True),
    ("3130", "برداشت صاحب سرمایه", "Owner drawings", E, "3000", True),
    ("4000", "درآمدها", "Revenue", I, None, False),
    ("4110", "فروش کالا و خدمات", "Sales", I, "4000", True),
    ("4120", "درآمد حمل و ارسال", "Delivery revenue", I, "4000", True),
    ("4130", "برگشت از فروش", "Sales returns", I, "4000", True),
    ("4140", "تخفیفات فروش", "Sales discounts", I, "4000", True),
    ("4190", "سایر درآمدها", "Other income", I, "4000", True),
    ("5000", "هزینه‌ها", "Expenses", X, None, False),
    ("5110", "بهای تمام‌شده کالای فروش‌رفته", "Cost of goods sold", X, "5000", True),
    ("5120", "ضایعات و کسری موجودی", "Waste & shrinkage", X, "5000", True),
    ("5210", "هزینه حمل و ارسال (کارمزد رانندگان)", "Delivery & driver cost", X, "5000", True),
    ("5220", "هزینه سوخت", "Fuel", X, "5000", True),
    ("5230", "هزینه تعمیر و نگهداری خودرو", "Vehicle maintenance", X, "5000", True),
    ("5240", "هزینه حمل‌کنندگان بیرونی", "External carrier cost", X, "5000", True),
    ("5310", "حقوق و دستمزد", "Payroll", X, "5000", True),
    ("5320", "اجاره", "Rent", X, "5000", True),
    ("5330", "آب، برق، گاز و تلفن", "Utilities", X, "5000", True),
    ("5390", "سایر هزینه‌ها", "Other expenses", X, "5000", True),
    ("5400", "اختلاف تسویه نقدی", "Cash settlement difference", X, "5000", True),
]

# کدهای ثابتی که سرویس‌های ثبت خودکار استفاده می‌کنند
CASH, BANK, RECEIVABLE, INVENTORY, DRIVER_CASH = "1110", "1120", "1130", "1140", "1150"
PAYABLE, DRIVER_PAYABLE, CARRIER_PAYABLE = "2110", "2120", "2130"
SALES, DELIVERY_REVENUE, SALES_RETURNS = "4110", "4120", "4130"
COGS, DELIVERY_COST, OTHER_EXPENSE, CASH_DIFF = "5110", "5210", "5390", "5400"


@transaction.atomic
def seed_default_chart(business) -> int:
    """چارت حساب پیش‌فرض را می‌سازد (idempotent)؛ تعداد حساب‌های جدید را برمی‌گرداند."""
    created = 0
    by_code = {a.code: a for a in Account.all_objects.filter(business=business)}
    for code, name, name_en, typ, parent_code, postable in DEFAULT_CHART:
        if code in by_code:
            continue
        acc = Account.all_objects.create(
            business=business, code=code, name=name, name_en=name_en, type=typ,
            parent=by_code.get(parent_code) if parent_code else None,
            is_postable=postable, is_system=True,
        )
        by_code[code] = acc
        created += 1
    return created


def ensure_chart(business) -> None:
    if not Account.all_objects.filter(business=business).exists():
        seed_default_chart(business)


def get_account(business, ref) -> Account:
    """ref می‌تواند کد حساب (str) یا خود Account باشد."""
    if isinstance(ref, Account):
        if ref.business_id != business.pk:
            raise ValueError("حساب متعلق به این کسب‌وکار نیست.")
        return ref
    acc = Account.all_objects.filter(business=business, code=str(ref)).first()
    if acc is None:
        raise ValueError(f"حساب {ref} تعریف نشده است.")
    return acc


# ═══════════════════════════════════════
#  ثبت سند
# ═══════════════════════════════════════

def _next_number(business) -> int:
    # قفل ردیف کسب‌وکار تا دو سند هم‌زمان شماره‌ی تکراری نگیرند
    Business.objects.select_for_update().get(pk=business.pk)
    last = JournalEntry.all_objects.filter(business=business).aggregate(m=Max("number"))["m"]
    return (last or 0) + 1


def _normalize_lines(business, lines):
    if not lines or len(lines) < 2:
        raise ValueError("سند باید حداقل دو ردیف داشته باشد.")
    out = []
    total_debit = total_credit = ZERO
    for ln in lines:
        acc = get_account(business, ln.get("account"))
        if not acc.is_postable:
            raise ValueError(f"حساب «{acc.name}» گروه است و سند نمی‌پذیرد.")
        if not acc.is_active:
            raise ValueError(f"حساب «{acc.name}» غیرفعال است.")
        debit = q2(ln.get("debit", 0))
        credit = q2(ln.get("credit", 0))
        if debit < 0 or credit < 0:
            raise ValueError("مبلغ ردیف نمی‌تواند منفی باشد.")
        if (debit > 0) == (credit > 0):
            raise ValueError("هر ردیف باید فقط بدهکار یا فقط بستانکار باشد.")
        total_debit += debit
        total_credit += credit
        out.append({
            "account": acc, "debit": debit, "credit": credit,
            "memo": str(ln.get("memo") or "")[:300], "cost_center": ln.get("cost_center"),
        })
    if total_debit != total_credit:
        raise ValueError(
            f"سند متوازن نیست: بدهکار {total_debit} ≠ بستانکار {total_credit}."
        )
    if total_debit <= 0:
        raise ValueError("جمع سند باید بیشتر از صفر باشد.")
    return out


@transaction.atomic
def post_entry(business, lines, date=None, description="", source_type="",
               source_id=None, user=None, reversal_of=None):
    """
    یک سند متوازن ثبت می‌کند.
    lines: [{"account": کد|Account, "debit": x | "credit": y, "memo": "", "cost_center": CostCenter|None}]
    اگر source_type/source_id داده شود و سندی از قبل برای آن منبع باشد، همان برگردانده می‌شود.
    """
    ensure_chart(business)
    if source_type and source_id is not None:
        existing = JournalEntry.all_objects.filter(
            business=business, source_type=source_type, source_id=source_id
        ).first()
        if existing:
            return existing

    clean = _normalize_lines(business, lines)
    number = _next_number(business)
    try:
        with transaction.atomic():
            entry = JournalEntry.all_objects.create(
                business=business, number=number, date=date or timezone.localdate(),
                description=str(description or "")[:500], source_type=source_type,
                source_id=source_id, created_by=user, reversal_of=reversal_of,
            )
    except IntegrityError:
        # رقابت هم‌زمان روی همین منبع: سند موجود را برگردان
        existing = JournalEntry.all_objects.filter(
            business=business, source_type=source_type, source_id=source_id
        ).first()
        if existing:
            return existing
        raise
    JournalLine.all_objects.bulk_create([
        JournalLine(
            business=business, entry=entry, account=ln["account"], debit=ln["debit"],
            credit=ln["credit"], memo=ln["memo"], cost_center=ln["cost_center"],
        )
        for ln in clean
    ])
    return entry


@transaction.atomic
def reverse_entry(entry, user=None, date=None, reason=""):
    """سند برگشتی (آینه‌ی سند اصلی) می‌سازد."""
    entry = JournalEntry.all_objects.select_for_update().get(pk=entry.pk)
    if entry.reversal_of_id:
        raise ValueError("سند برگشتی را نمی‌توان دوباره برگشت زد.")
    if JournalEntry.all_objects.filter(reversal_of=entry).exists():
        raise ValueError("این سند قبلاً برگشت خورده است.")
    lines = [
        {"account": l.account, "debit": l.credit, "credit": l.debit,
         "memo": l.memo, "cost_center": l.cost_center}
        # all_objects: مدیر رابطه از TenantManager می‌گذرد و بیرون از درخواست خالی برمی‌گرداند
        for l in JournalLine.all_objects.filter(entry=entry).select_related("account", "cost_center")
    ]
    return post_entry(
        entry.business, lines, date=date or timezone.localdate(),
        description=f"برگشت سند {entry.number}" + (f" — {reason}" if reason else ""),
        source_type="reversal", source_id=entry.pk, user=user, reversal_of=entry,
    )


def reverse_by_source(business, source_type, source_id, user=None, reason=""):
    """سند ثبت‌شده برای یک منبع را (اگر باشد و برگشت نخورده باشد) ابطال می‌کند."""
    entry = JournalEntry.all_objects.filter(
        business=business, source_type=source_type, source_id=source_id
    ).first()
    if entry is None or JournalEntry.all_objects.filter(reversal_of=entry).exists():
        return None
    return reverse_entry(entry, user=user, reason=reason)


# ═══════════════════════════════════════
#  گزارش‌ها
# ═══════════════════════════════════════

def _lines_qs(business, date_from=None, date_to=None, before=None):
    qs = JournalLine.all_objects.filter(business=business)
    if date_from:
        qs = qs.filter(entry__date__gte=date_from)
    if date_to:
        qs = qs.filter(entry__date__lte=date_to)
    if before:
        qs = qs.filter(entry__date__lt=before)
    return qs


def _sums(qs):
    """{account_id: (debit, credit)}"""
    rows = qs.values("account_id").annotate(d=Sum("debit"), c=Sum("credit"))
    return {r["account_id"]: (r["d"] or ZERO, r["c"] or ZERO) for r in rows}


def _signed(account, debit, credit):
    """مانده با ماهیت حساب: بدهکارماهیت = بدهکار − بستانکار، وگرنه برعکس."""
    return (debit - credit) if account.normal_debit else (credit - debit)


def trial_balance(business, date_from=None, date_to=None):
    """تراز آزمایشی: گردش دوره + مانده‌ی تجمعی تا پایان دوره."""
    accounts = list(Account.all_objects.filter(business=business).order_by("code"))
    period = _sums(_lines_qs(business, date_from, date_to))
    cumulative = _sums(_lines_qs(business, None, date_to))
    rows = []
    tot = {"debit": ZERO, "credit": ZERO, "balance_debit": ZERO, "balance_credit": ZERO}
    for a in accounts:
        pd, pc = period.get(a.pk, (ZERO, ZERO))
        cd, cc = cumulative.get(a.pk, (ZERO, ZERO))
        if not (pd or pc or cd or cc):
            continue
        net = cd - cc
        bd, bc = (net, ZERO) if net >= 0 else (ZERO, -net)
        rows.append({
            "account_id": a.pk, "code": a.code, "name": a.name, "type": a.type,
            "debit": pd, "credit": pc, "balance_debit": bd, "balance_credit": bc,
        })
        tot["debit"] += pd
        tot["credit"] += pc
        tot["balance_debit"] += bd
        tot["balance_credit"] += bc
    return {"rows": rows, "totals": tot, "balanced": tot["balance_debit"] == tot["balance_credit"]}


def ledger(business, account, date_from=None, date_to=None):
    """کارت حساب با مانده‌ی جاری."""
    account = get_account(business, account)
    opening = ZERO
    if date_from:
        d, c = _sums(_lines_qs(business, before=date_from).filter(account=account)).get(
            account.pk, (ZERO, ZERO)
        )
        opening = _signed(account, d, c)
    qs = (
        _lines_qs(business, date_from, date_to).filter(account=account)
        .select_related("entry", "cost_center").order_by("entry__date", "entry__number", "id")
    )
    balance = opening
    rows = []
    for l in qs:
        balance += _signed(account, l.debit, l.credit)
        rows.append({
            "date": l.entry.date, "entry_id": l.entry_id, "number": l.entry.number,
            "description": l.entry.description, "memo": l.memo,
            "cost_center": l.cost_center.name if l.cost_center else "",
            "debit": l.debit, "credit": l.credit, "balance": balance,
        })
    return {"account": {"id": account.pk, "code": account.code, "name": account.name,
                        "type": account.type},
            "opening": opening, "rows": rows, "closing": balance}


def income_statement(business, date_from=None, date_to=None):
    accounts = {a.pk: a for a in Account.all_objects.filter(business=business)}
    sums = _sums(_lines_qs(business, date_from, date_to))
    income, expense = [], []
    t_inc = t_exp = ZERO
    for pk, (d, c) in sums.items():
        a = accounts[pk]
        if a.type == Account.Type.INCOME:
            v = c - d
            income.append({"code": a.code, "name": a.name, "amount": v})
            t_inc += v
        elif a.type == Account.Type.EXPENSE:
            v = d - c
            expense.append({"code": a.code, "name": a.name, "amount": v})
            t_exp += v
    income.sort(key=lambda r: r["code"])
    expense.sort(key=lambda r: r["code"])
    return {"income": income, "expense": expense, "total_income": t_inc,
            "total_expense": t_exp, "net_profit": t_inc - t_exp}


def balance_sheet(business, as_of=None):
    accounts = {a.pk: a for a in Account.all_objects.filter(business=business)}
    sums = _sums(_lines_qs(business, None, as_of))
    groups = {"asset": [], "liability": [], "equity": []}
    totals = {"asset": ZERO, "liability": ZERO, "equity": ZERO}
    earnings = ZERO
    for pk, (d, c) in sums.items():
        a = accounts[pk]
        if a.type == Account.Type.INCOME:
            earnings += c - d
        elif a.type == Account.Type.EXPENSE:
            earnings -= d - c
        else:
            v = _signed(a, d, c)
            groups[a.type].append({"code": a.code, "name": a.name, "amount": v})
            totals[a.type] += v
    for g in groups.values():
        g.sort(key=lambda r: r["code"])
    equity_total = totals["equity"] + earnings
    return {
        "assets": groups["asset"], "liabilities": groups["liability"],
        "equity": groups["equity"], "current_earnings": earnings,
        "total_assets": totals["asset"], "total_liabilities": totals["liability"],
        "total_equity": equity_total,
        "balanced": totals["asset"] == totals["liability"] + equity_total,
    }
