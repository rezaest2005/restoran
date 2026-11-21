"""
هسته‌ی حسابداری دوطرفه (مستقل از صنعت).

قواعد:
  - هر سند قطعی باید متوازن باشد (جمع بدهکار = جمع بستانکار) و حداقل ۲ ردیف داشته باشد.
  - سند قطعی ویرایش یا حذف نمی‌شود؛ فقط با سند برگشتی ابطال می‌شود. پیش‌نویس‌ها آزادانه ویرایش/حذف می‌شوند
    و در هیچ گزارشی حساب نمی‌شوند.
  - شماره‌ی سند هنگام قطعی‌شدن (و پشت قفل ردیف کسب‌وکار) داده می‌شود: پیوسته و بدون تکرار.
  - تاریخ سند نباید در سال مالی بسته یا دوره‌ی قفل‌شده باشد.
  - ثبت خودکار اسناد از یک منبع (فاکتور، هزینه، ...) idempotent است.
"""

import logging
from decimal import Decimal, ROUND_HALF_UP

from django.db import IntegrityError, transaction
from django.db.models import Max, Sum
from django.utils import timezone

from .accounting_charts import CORE_CHART, CORE_MARKER, seed_core_chart
from .models import Account, AccountingPeriod, Business, DetailAccount, FiscalYear, JournalEntry, JournalLine

logger = logging.getLogger(__name__)

ZERO = Decimal("0.00")
Q2 = Decimal("0.01")

POSTED = JournalEntry.Status.POSTED
DRAFT = JournalEntry.Status.DRAFT
# اختتامیه و افتتاحیه همدیگر را خنثی می‌کنند و فقط برای دفاتر قانونی‌اند؛ در محاسبه‌ی مانده‌ها حساب نمی‌شوند
PERM_KINDS = (JournalEntry.Kind.CLOSING_PERM, JournalEntry.Kind.OPENING_PERM)


def q2(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Q2, rounding=ROUND_HALF_UP)


# ═══════════════════════════════════════
#  چارت حساب پیش‌فرض
# ═══════════════════════════════════════

# سازگاری با کد قدیمی: (کد, نام, نام انگلیسی, نوع, والد, قابل ثبت)
DEFAULT_CHART = [row[:6] for row in CORE_CHART]

# کدهای ثابتی که سرویس‌های ثبت خودکار استفاده می‌کنند
CASH, BANK, RECEIVABLE, INVENTORY, DRIVER_CASH = "1110", "1120", "1130", "1140", "1150"
NOTES_RECEIVABLE, CHEQUES_IN_COLLECTION, BOUNCED_CHEQUES, VAT_IN = "1135", "1136", "1137", "1170"
PAYABLE, DRIVER_PAYABLE, CARRIER_PAYABLE = "2110", "2120", "2130"
NOTES_PAYABLE, TAX_PAYABLE, VAT_OUT = "2115", "2140", "2141"
CAPITAL, RETAINED_EARNINGS, INCOME_SUMMARY = "3110", "3120", "3140"
SALES, DELIVERY_REVENUE, SALES_RETURNS = "4110", "4120", "4130"
COGS, DELIVERY_COST, OTHER_EXPENSE, CASH_DIFF, BANK_CHARGES = "5110", "5210", "5390", "5400", "5410"

# expense category key -> account code (the customer never sees account codes)
EXPENSE_ACCOUNT = {"payroll": "5310", "rent": "5320", "utilities": "5330",
                   "fuel": "5220", "maintenance": "5230", "other": "5390"}
_CATEGORY_WORDS = [
    ("payroll", ("حقوق", "دستمزد", "کارگر", "پرسنل", "payroll", "salary", "wage")),
    ("rent", ("اجاره", "رهن", "rent")),
    ("utilities", ("قبض", "آب", "برق", "گاز", "تلفن", "اینترنت", "utilit", "electric", "water")),
    ("fuel", ("سوخت", "بنزین", "گازوئیل", "fuel")),
    ("maintenance", ("تعمیر", "نگهداری", "سرویس", "maint", "repair")),
]


def normalize_category(value) -> str:
    """Accepts a key ("rent") or older free text ("اجاره مغازه") and returns a known key."""
    v = str(value or "").strip().lower()
    if v in EXPENSE_ACCOUNT:
        return v
    for key, words in _CATEGORY_WORDS:
        if any(w in v for w in words):
            return key
    return "other"


def expense_account(category) -> str:
    return EXPENSE_ACCOUNT[normalize_category(category)]


def seed_default_chart(business) -> int:
    """چارت حساب هسته را می‌سازد (idempotent)؛ تعداد حساب‌های جدید را برمی‌گرداند."""
    return seed_core_chart(business)


def ensure_chart(business) -> None:
    # normally one cheap query; the (locked) seeding runs only the first time — or once after the core grows
    if Account.all_objects.filter(business=business, code=CORE_MARKER).exists():
        return
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
#  حساب تفصیلی
# ═══════════════════════════════════════

DETAIL_PREFIX = {"person": "1", "customer": "2", "supplier": "3", "employee": "4", "project": "5",
                 "cost_center": "6", "bank": "7", "cash": "8", "other": "9"}


def next_detail_code(business, kind) -> str:
    """کد پیشنهادی تفصیلی: پیشوند نوع + شماره‌ی چهاررقمی (مثلاً ۲۰۰۰۱ برای اولین مشتری)."""
    prefix = DETAIL_PREFIX.get(kind, "9")
    codes = DetailAccount.all_objects.filter(business=business, code__startswith=prefix).values_list("code", flat=True)
    nums = [int(c[len(prefix):]) for c in codes if c[len(prefix):].isdigit()]
    return f"{prefix}{(max(nums) + 1) if nums else 1:04d}"


def create_detail(business, name, kind="person", code="", **extra) -> DetailAccount:
    name = str(name or "").strip()[:200]
    if not name:
        raise ValueError("نام حساب تفصیلی الزامی است.")
    if kind not in DetailAccount.Kind.values:
        raise ValueError("نوع حساب تفصیلی نامعتبر است.")
    code = str(code or "").strip()[:20] or next_detail_code(business, kind)
    if DetailAccount.all_objects.filter(business=business, code=code).exists():
        raise ValueError("این کد تفصیلی قبلاً استفاده شده است.")
    return DetailAccount.all_objects.create(business=business, code=code, name=name, kind=kind, **extra)


def party_detail(business, customer=None, supplier=None):
    """حساب تفصیلی مشتری/تأمین‌کننده (در صورت نبود ساخته می‌شود). برای ثبت خودکار فاکتورها."""
    if customer is None and supplier is None:
        return None
    field, obj, kind = ("customer", customer, "customer") if customer is not None else ("supplier", supplier, "supplier")
    d = DetailAccount.all_objects.filter(business=business, **{field: obj}).first()
    if d is not None:
        return d
    try:
        with transaction.atomic():
            return DetailAccount.all_objects.create(
                business=business, code=next_detail_code(business, kind), name=str(obj.name)[:200], kind=kind,
                phone=str(getattr(obj, "phone", "") or "")[:30], **{field: obj},
            )
    except IntegrityError:
        return DetailAccount.all_objects.filter(business=business, **{field: obj}).first()


# ═══════════════════════════════════════
#  سال مالی و قفل دوره
# ═══════════════════════════════════════

def check_date_open(business, date) -> None:
    """اگر تاریخ در سال مالی بسته یا دوره‌ی قفل‌شده باشد خطا می‌دهد. تاریخ بیرون از سال‌های تعریف‌شده آزاد است."""
    fy = FiscalYear.all_objects.filter(business=business, start_date__lte=date, end_date__gte=date).first()
    if fy is None:
        return
    if fy.status == FiscalYear.Status.CLOSED:
        raise ValueError(f"سال مالی «{fy.name}» بسته شده است؛ سندی در این تاریخ ثبت نمی‌شود.")
    if AccountingPeriod.all_objects.filter(fiscal_year=fy, start_date__lte=date, end_date__gte=date,
                                           is_locked=True).exists():
        raise ValueError("دوره‌ی مالی این تاریخ قفل شده است.")


# ═══════════════════════════════════════
#  ثبت سند
# ═══════════════════════════════════════

def _lock_business(business):
    # قفل ردیف کسب‌وکار تا دو سند هم‌زمان شماره‌ی تکراری نگیرند
    Business.objects.select_for_update().get(pk=business.pk)


def _next_number(business) -> int:
    _lock_business(business)
    last = JournalEntry.all_objects.filter(business=business).aggregate(m=Max("number"))["m"]
    return (last or 0) + 1


def _resolve_detail(business, ref):
    if ref is None or ref == "":
        return None
    if isinstance(ref, DetailAccount):
        if ref.business_id != business.pk:
            raise ValueError("حساب تفصیلی متعلق به این کسب‌وکار نیست.")
        return ref
    d = DetailAccount.all_objects.filter(business=business, pk=ref).first()
    if d is None:
        raise ValueError("حساب تفصیلی پیدا نشد.")
    return d


def _normalize_lines(business, lines, require_balance=True, check_active=True):
    if not lines or len(lines) < 2:
        raise ValueError("سند باید حداقل دو ردیف داشته باشد.")
    out = []
    total_debit = total_credit = ZERO
    for ln in lines:
        acc = get_account(business, ln.get("account"))
        if not acc.is_postable:
            raise ValueError(f"حساب «{acc.name}» گروه است و سند نمی‌پذیرد.")
        if check_active and not acc.is_active:
            raise ValueError(f"حساب «{acc.name}» غیرفعال است.")
        debit = q2(ln.get("debit", 0))
        credit = q2(ln.get("credit", 0))
        if debit < 0 or credit < 0:
            raise ValueError("مبلغ ردیف نمی‌تواند منفی باشد.")
        if (debit > 0) == (credit > 0):
            raise ValueError("هر ردیف باید فقط بدهکار یا فقط بستانکار باشد.")
        cc = ln.get("cost_center")
        if cc is not None and cc.business_id != business.pk:
            raise ValueError("مرکز هزینه متعلق به این کسب‌وکار نیست.")
        detail = _resolve_detail(business, ln.get("detail"))
        if check_active and detail is not None and not detail.is_active:
            raise ValueError(f"حساب تفصیلی «{detail.name}» غیرفعال است.")
        tax_base = ln.get("tax_base")
        total_debit += debit
        total_credit += credit
        out.append({
            "account": acc, "debit": debit, "credit": credit,
            "memo": str(ln.get("memo") or "")[:300], "cost_center": cc, "detail": detail,
            "tax_base": q2(tax_base) if tax_base not in (None, "") else None,
        })
    if require_balance:
        if total_debit != total_credit:
            raise ValueError(
                f"سند متوازن نیست: بدهکار {total_debit} ≠ بستانکار {total_credit}."
            )
        if total_debit <= 0:
            raise ValueError("جمع سند باید بیشتر از صفر باشد.")
    return out


def _write_lines(business, entry, clean):
    JournalLine.all_objects.bulk_create([
        JournalLine(
            business=business, entry=entry, account=ln["account"], debit=ln["debit"],
            credit=ln["credit"], memo=ln["memo"], cost_center=ln["cost_center"], detail=ln["detail"],
            tax_base=ln["tax_base"],
        )
        for ln in clean
    ])


@transaction.atomic
def post_entry(business, lines, date=None, description="", source_type="",
               source_id=None, user=None, reversal_of=None, kind=JournalEntry.Kind.NORMAL, reference="",
               check_lock=True, check_active=None):
    """
    یک سند متوازن و قطعی ثبت می‌کند.
    lines: [{"account": کد|Account, "debit": x | "credit": y, "memo": "", "cost_center": CostCenter|None,
             "detail": DetailAccount|id|None, "tax_base": مبلغ|None}]
    اگر source_type/source_id داده شود و سندی از قبل برای آن منبع باشد، همان برگردانده می‌شود.
    """
    ensure_chart(business)
    if source_type and source_id is not None:
        existing = JournalEntry.all_objects.filter(
            business=business, source_type=source_type, source_id=source_id
        ).first()
        if existing:
            return existing

    date = date or timezone.localdate()
    if check_active is None:
        check_active = reversal_of is None
    clean = _normalize_lines(business, lines, check_active=check_active)
    if check_lock:
        check_date_open(business, date)
    number = _next_number(business)
    try:
        with transaction.atomic():
            entry = JournalEntry.all_objects.create(
                business=business, number=number, date=date,
                description=str(description or "")[:500], source_type=source_type,
                source_id=source_id, created_by=user, reversal_of=reversal_of,
                status=POSTED, kind=kind, reference=str(reference or "")[:60], posted_at=timezone.now(),
            )
    except IntegrityError:
        # رقابت هم‌زمان روی همین منبع: سند موجود را برگردان
        existing = JournalEntry.all_objects.filter(
            business=business, source_type=source_type, source_id=source_id
        ).first()
        if existing:
            return existing
        raise
    _write_lines(business, entry, clean)
    return entry


@transaction.atomic
def save_draft(business, lines, date=None, description="", reference="", user=None, entry=None):
    """سند پیش‌نویس می‌سازد یا ویرایش می‌کند. پیش‌نویس می‌تواند هنوز تراز نباشد (ولی هر ردیف باید معتبر باشد)."""
    ensure_chart(business)
    clean = _normalize_lines(business, lines, require_balance=False)
    if entry is None:
        entry = JournalEntry.all_objects.create(
            business=business, number=None, status=DRAFT, date=date or timezone.localdate(),
            description=str(description or "")[:500], reference=str(reference or "")[:60],
            source_type="manual", created_by=user,
        )
    else:
        entry = JournalEntry.all_objects.select_for_update().get(pk=entry.pk)
        if entry.status != DRAFT:
            raise ValueError("سند قطعی قابل ویرایش نیست؛ برای اصلاح، آن را برگشت بزنید.")
        entry.date = date or entry.date
        entry.description = str(description or "")[:500]
        entry.reference = str(reference or "")[:60]
        entry.save(update_fields=["date", "description", "reference"])
        JournalLine.all_objects.filter(entry=entry).delete()
    _write_lines(business, entry, clean)
    return entry


@transaction.atomic
def post_draft(entry, user=None):
    """پیش‌نویس را پس از کنترل تراز و قفل دوره قطعی می‌کند و شماره‌ی سند می‌دهد."""
    entry = JournalEntry.all_objects.select_for_update().get(pk=entry.pk)
    if entry.status != DRAFT:
        raise ValueError("این سند قبلاً قطعی شده است.")
    business = entry.business
    lines = [
        {"account": l.account, "debit": l.debit, "credit": l.credit, "memo": l.memo,
         "cost_center": l.cost_center, "detail": l.detail, "tax_base": l.tax_base}
        for l in JournalLine.all_objects.filter(entry=entry).select_related("account", "cost_center", "detail")
    ]
    _normalize_lines(business, lines)  # تراز، حساب‌های فعال و قابل ثبت
    check_date_open(business, entry.date)
    entry.number = _next_number(business)
    entry.status = POSTED
    entry.posted_at = timezone.now()
    entry.save(update_fields=["number", "status", "posted_at"])
    return entry


@transaction.atomic
def delete_draft(entry):
    entry = JournalEntry.all_objects.select_for_update().get(pk=entry.pk)
    if entry.status != DRAFT:
        raise ValueError("سند قطعی حذف نمی‌شود؛ از برگشت سند استفاده کنید.")
    entry.delete()


@transaction.atomic
def reverse_entry(entry, user=None, date=None, reason="", check_lock=True):
    """سند برگشتی (آینه‌ی سند اصلی) می‌سازد."""
    entry = JournalEntry.all_objects.select_for_update().get(pk=entry.pk)
    if entry.status != POSTED:
        raise ValueError("پیش‌نویس برگشت نمی‌خورد؛ می‌توانید حذفش کنید.")
    if entry.reversal_of_id:
        raise ValueError("سند برگشتی را نمی‌توان دوباره برگشت زد.")
    if JournalEntry.all_objects.filter(reversal_of=entry).exists():
        raise ValueError("این سند قبلاً برگشت خورده است.")
    lines = [
        {"account": l.account, "debit": l.credit, "credit": l.debit,
         "memo": l.memo, "cost_center": l.cost_center, "detail": l.detail,
         "tax_base": -l.tax_base if l.tax_base is not None else None}
        # all_objects: مدیر رابطه از TenantManager می‌گذرد و بیرون از درخواست خالی برمی‌گرداند
        for l in JournalLine.all_objects.filter(entry=entry).select_related("account", "cost_center", "detail")
    ]
    kind = entry.kind  # برگشت سند بستن/اختتامیه هم از همان نوع است تا در گزارش‌ها هم‌دیگر را خنثی کنند
    # حساب یا تفصیلیِ غیرفعال‌شده نباید جلوی ابطال را بگیرد (check_active با reversal_of خاموش می‌شود)
    return post_entry(
        entry.business, lines, date=date or timezone.localdate(),
        description=f"برگشت سند {entry.number}" + (f" — {reason}" if reason else ""),
        source_type="reversal", source_id=entry.pk, user=user, reversal_of=entry, kind=kind,
        check_lock=check_lock,
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

def _lines_qs(business, date_from=None, date_to=None, before=None, exclude_closing=False):
    """ردیف‌های اسناد قطعی (بدون اختتامیه/افتتاحیه). exclude_closing: سند بستن حساب‌های موقت هم کنار برود."""
    qs = JournalLine.all_objects.filter(business=business, entry__status=POSTED).exclude(entry__kind__in=PERM_KINDS)
    if exclude_closing:
        qs = qs.exclude(entry__kind=JournalEntry.Kind.CLOSING)
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
    """تراز آزمایشی (سطح معین): گردش دوره + مانده‌ی تجمعی تا پایان دوره."""
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


def descendant_ids(business, account):
    """شناسه‌ی خود حساب و همه‌ی زیرحساب‌هایش."""
    children = {}
    for pk, parent_id in Account.all_objects.filter(business=business).values_list("pk", "parent_id"):
        children.setdefault(parent_id, []).append(pk)
    out, stack = [], [account.pk]
    while stack:
        pk = stack.pop()
        out.append(pk)
        stack.extend(children.get(pk, []))
    return out


def ledger(business, account, date_from=None, date_to=None, detail=None):
    """
    کارت حساب (دفتر کل/معین) با مانده‌ی جاری. برای حساب گروه/کل، ردیف‌های همه‌ی زیرحساب‌ها می‌آید.
    detail: فقط ردیف‌های یک حساب تفصیلی (دفتر تفصیلی).
    """
    account = get_account(business, account)
    ids = descendant_ids(business, account)
    detail = _resolve_detail(business, detail)

    def scoped(qs):
        qs = qs.filter(account_id__in=ids)
        return qs.filter(detail=detail) if detail is not None else qs

    opening = ZERO
    if date_from:
        agg = scoped(_lines_qs(business, before=date_from)).aggregate(d=Sum("debit"), c=Sum("credit"))
        opening = _signed(account, agg["d"] or ZERO, agg["c"] or ZERO)
    qs = (
        scoped(_lines_qs(business, date_from, date_to))
        .select_related("entry", "cost_center", "account", "detail").order_by("entry__date", "entry__number", "id")
    )
    balance = opening
    rows = []
    t_d = t_c = ZERO
    for l in qs:
        balance += _signed(account, l.debit, l.credit)
        t_d += l.debit
        t_c += l.credit
        rows.append({
            "date": l.entry.date, "entry_id": l.entry_id, "number": l.entry.number,
            "description": l.entry.description, "memo": l.memo,
            "account_code": l.account.code, "account_name": l.account.name,
            "detail": l.detail.name if l.detail else "",
            "cost_center": l.cost_center.name if l.cost_center else "",
            "debit": l.debit, "credit": l.credit, "balance": balance,
        })
    return {"account": {"id": account.pk, "code": account.code, "name": account.name,
                        "type": account.type, "is_postable": account.is_postable},
            "detail": {"id": detail.pk, "code": detail.code, "name": detail.name} if detail else None,
            "opening": opening, "rows": rows, "closing": balance, "total_debit": t_d, "total_credit": t_c}


def income_statement(business, date_from=None, date_to=None):
    """سود و زیان دوره (سند بستن حساب‌های موقت حساب نمی‌شود، وگرنه سود سال بسته‌شده صفر می‌شد)."""
    accounts = {a.pk: a for a in Account.all_objects.filter(business=business)}
    sums = _sums(_lines_qs(business, date_from, date_to, exclude_closing=True))
    income, expense = [], []
    t_inc = t_exp = cogs = ZERO
    for pk, (d, c) in sums.items():
        a = accounts[pk]
        if a.type == Account.Type.INCOME:
            v = c - d
            income.append({"code": a.code, "name": a.name, "amount": v})
            t_inc += v
        elif a.type == Account.Type.EXPENSE:
            v = d - c
            expense.append({"code": a.code, "name": a.name, "amount": v, "is_cogs": a.role == "cogs"})
            t_exp += v
            if a.role == "cogs":
                cogs += v
    income.sort(key=lambda r: r["code"])
    expense.sort(key=lambda r: r["code"])
    return {"income": income, "expense": expense, "total_income": t_inc,
            "total_expense": t_exp, "cost_of_sales": cogs, "gross_profit": t_inc - cogs,
            "net_profit": t_inc - t_exp}


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
            parent = accounts.get(a.parent_id)
            groups[a.type].append({"code": a.code, "name": a.name, "amount": v,
                                   "parent_code": parent.code if parent else "",
                                   "parent_name": parent.name if parent else ""})
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
