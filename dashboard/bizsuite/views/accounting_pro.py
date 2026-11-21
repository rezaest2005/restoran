"""
حسابداری حرفه‌ای — API (همه با مجوز سرویس «accounting»؛ بدون نیاز به ماژول صندوق یا انبار)

  /api/accounting/settings/                         GET / PUT          تنظیمات (قالب سرفصل، نرخ ارزش افزوده)
  /api/accounting/chart-templates/                  GET / POST {key}   فهرست قالب‌های صنفی / اعمال قالب
  /api/accounting/details/                          GET / POST         حساب‌های تفصیلی
  /api/accounting/details/<id>/                     PUT / DELETE
  /api/accounting/fiscal-years/                     GET / POST
  /api/accounting/fiscal-years/<id>/                GET (پیش‌نمایش بستن) / DELETE
  /api/accounting/fiscal-years/<id>/close/          POST
  /api/accounting/fiscal-years/<id>/reopen/         POST
  /api/accounting/periods/<id>/lock/                POST {locked}
  /api/accounting/money-accounts/                   GET / POST         بانک‌ها و صندوق‌ها
  /api/accounting/money-accounts/<id>/              PUT
  /api/accounting/money-accounts/<id>/reconcile/    GET ?statement_balance=&as_of=
  /api/accounting/money-accounts/<id>/statement/    POST {rows}        ورود صورت‌حساب بانک
  /api/accounting/money-accounts/<id>/auto-match/   POST
  /api/accounting/statement-lines/<id>/             DELETE
  /api/accounting/statement-lines/<id>/match/       POST {line_id} / DELETE (لغو تطبیق)
  /api/accounting/transfers/                        GET / POST
  /api/accounting/transfers/<id>/cancel/            POST
  /api/accounting/cheques/                          GET / POST
  /api/accounting/cheques/<id>/                     GET
  /api/accounting/cheques/<id>/status/              POST {to_status, date, money_account_id, endorsed_to_id}
  /api/accounting/cheques/<id>/undo/                POST
  /api/accounting/budgets/                          GET / POST
  /api/accounting/budgets/<id>/                     GET (با عملکرد) / PUT / DELETE
  /api/accounting/vat-documents/                    POST               فروش/خرید با ارزش افزوده (بدون فاکتور انبار)
  /api/accounting/reports/journal-book|trial-balance-ext|cash-flow|aging|party-balances|vat/
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from functools import wraps

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ..accounting_charts import CHART_TEMPLATES, apply_chart_template, template_list
from ..accounting_fiscal import (
    close_fiscal_year, create_fiscal_year, reopen_fiscal_year, set_period_lock, year_preview,
)
from ..accounting_reports import (
    aging, budget_vs_actual, cash_flow, journal_book, party_balances, trial_balance_ext, vat_report,
)
from ..accounting_services import (
    PAYABLE, RECEIVABLE, SALES, VAT_IN, VAT_OUT, create_detail, ensure_chart, get_account, post_entry, q2,
)
from ..accounting_treasury import (
    auto_match, cancel_transfer, change_cheque_status, create_money_account, import_statement, match_line,
    money_balance, reconciliation, register_cheque, transfer, unassigned_balances, undo_cheque_status,
)
from ..activity import audit
from ..models import (
    Account, AccountingPeriod, AccountingSettings, BankStatementLine, Budget, BudgetLine, Cheque, ChequeEvent,
    CostCenter, DetailAccount, FiscalYear, JournalEntry, JournalLine, MoneyAccount, MoneyTransfer,
)
from ..utils import api_error, api_success
from .accounting import AccountingPerm, _date, _jsonable
from .common import StaffAuth, staff_business

MAX_AMOUNT = Decimal("9999999999999")


def acc_api(methods, audit_action=None, label=""):
    """دکوراتور مشترک: احراز هویت، مجوز حسابداری، کسب‌وکار، و تبدیل ValueError به پیام خطا."""
    def deco(fn):
        @wraps(fn)
        def inner(request, *args, **kwargs):
            biz = staff_business(request)
            if biz is None:
                return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
            ensure_chart(biz)
            try:
                return fn(request, biz, *args, **kwargs)
            except (ValueError, InvalidOperation, TypeError) as exc:
                return api_error(str(exc) if isinstance(exc, ValueError) else "مقدار نامعتبر است.")
        view = inner
        if audit_action:
            view = audit("accounting", audit_action, label)(view)
        return api_view(methods)(authentication_classes(StaffAuth)(permission_classes([AccountingPerm])(view)))
    return deco


def _ok(data=None, message="", status=200):
    return api_success(data=_jsonable(data), message=message, status_code=status)


def _amount(v, name="مبلغ", allow_zero=False):
    try:
        x = Decimal(str(v if v not in (None, "") else "0").replace(",", "").strip())
    except InvalidOperation:
        raise ValueError(f"{name} نامعتبر است.")
    if x < 0 or x > MAX_AMOUNT or (x == 0 and not allow_zero):
        raise ValueError(f"{name} نامعتبر است.")
    return q2(x)


def _req_date(v, name="تاریخ"):
    d = _date(v, name)
    if d is None:
        raise ValueError(f"{name} الزامی است.")
    return d


def _obj(model, biz, pk, label):
    o = model.all_objects.filter(business=biz, pk=pk).first() if pk not in (None, "") else None
    if o is None:
        raise ValueError(f"{label} پیدا نشد.")
    return o


# ───────────────────────── تنظیمات و قالب سرفصل ─────────────────────────

def _settings(biz):
    st, _ = AccountingSettings.all_objects.get_or_create(business=biz)
    return st


@acc_api(["GET", "PUT"], "settings", "تنظیمات حسابداری")
def settings_view(request, biz):
    st = _settings(biz)
    if request.method == "PUT":
        d = request.data
        if "vat_rate" in d:
            rate = _amount(d["vat_rate"], "نرخ مالیات", allow_zero=True)
            if rate > 100:
                raise ValueError("نرخ مالیات نامعتبر است.")
            st.vat_rate = rate
        st.save()
    return _ok({"chart_template": st.chart_template, "vat_rate": st.vat_rate, "templates": template_list()})


@acc_api(["GET", "POST"], "chart_template", "قالب سرفصل حساب")
def chart_templates(request, biz):
    if request.method == "GET":
        return _ok({"current": _settings(biz).chart_template, "templates": template_list()})
    key = str(request.data.get("key") or "")
    if key not in CHART_TEMPLATES:
        raise ValueError("قالب سرفصل نامعتبر است.")
    n = apply_chart_template(biz, key)
    return _ok({"created": n, "current": key}, f"{n} سرفصل جدید اضافه شد.")


# ───────────────────────── حساب‌های تفصیلی ─────────────────────────

DETAIL_FIELDS = ("phone", "national_id", "economic_code", "address", "note")


def _detail_row(d):
    return {"id": d.pk, "code": d.code, "name": d.name, "kind": d.kind, "phone": d.phone,
            "national_id": d.national_id, "economic_code": d.economic_code, "address": d.address,
            "note": d.note, "credit_limit": d.credit_limit, "is_active": d.is_active,
            "customer_id": d.customer_id, "supplier_id": d.supplier_id}


@acc_api(["GET", "POST"], "detail", "حساب تفصیلی")
def details(request, biz):
    if request.method == "GET":
        qs = DetailAccount.all_objects.filter(business=biz)
        kind = request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind__in=kind.split(","))
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q) | Q(phone__icontains=q))
        if request.query_params.get("active") == "1":
            qs = qs.filter(is_active=True)
        return _ok([_detail_row(d) for d in qs.order_by("code")[:2000]])
    d = request.data
    extra = {f: str(d.get(f) or "")[:300 if f in ("address", "note") else 30] for f in DETAIL_FIELDS}
    extra["credit_limit"] = _amount(d.get("credit_limit"), "سقف اعتبار", allow_zero=True)
    det = create_detail(biz, d.get("name"), kind=d.get("kind") or "person", code=d.get("code") or "", **extra)
    return _ok(_detail_row(det), "حساب تفصیلی ساخته شد.", 201)


@acc_api(["PUT", "DELETE"], "detail", "حساب تفصیلی")
def detail_item(request, biz, pk):
    det = get_object_or_404(DetailAccount.all_objects.filter(business=biz), pk=pk)
    if request.method == "DELETE":
        if JournalLine.all_objects.filter(detail=det).exists() or Cheque.all_objects.filter(party=det).exists() \
                or MoneyAccount.all_objects.filter(detail=det).exists():
            raise ValueError("این حساب تفصیلی گردش دارد و حذف نمی‌شود؛ می‌توانید غیرفعالش کنید.")
        det.delete()
        return _ok(None, "حذف شد.")
    d = request.data
    if "name" in d:
        name = str(d["name"] or "").strip()
        if not name:
            raise ValueError("نام الزامی است.")
        det.name = name[:200]
    for f in DETAIL_FIELDS:
        if f in d:
            setattr(det, f, str(d[f] or "")[:300 if f in ("address", "note") else 30])
    if "credit_limit" in d:
        det.credit_limit = _amount(d["credit_limit"], "سقف اعتبار", allow_zero=True)
    if "is_active" in d:
        det.is_active = bool(d["is_active"])
    det.save()
    return _ok(_detail_row(det), "ذخیره شد.")


# ───────────────────────── سال و دوره‌ی مالی ─────────────────────────

def _fy_row(fy):
    periods = AccountingPeriod.all_objects.filter(fiscal_year=fy).order_by("start_date")
    return {"id": fy.pk, "name": fy.name, "start_date": fy.start_date, "end_date": fy.end_date,
            "status": fy.status, "closed_at": fy.closed_at,
            "periods": [{"id": p.pk, "name": p.name, "start_date": p.start_date, "end_date": p.end_date,
                         "is_locked": p.is_locked} for p in periods]}


@acc_api(["GET", "POST"], "fiscal_year", "سال مالی")
def fiscal_years(request, biz):
    if request.method == "GET":
        today = timezone.localdate()
        rows = [_fy_row(fy) for fy in FiscalYear.all_objects.filter(business=biz).order_by("-start_date")]
        current = next((r["id"] for r in rows if r["start_date"] <= today <= r["end_date"]), None)
        return _ok({"years": rows, "current_id": current})
    d = request.data
    periods = None
    if isinstance(d.get("periods"), list) and d["periods"]:
        periods = [{"name": str(p.get("name") or "")[:60] or f"{i + 1}", "start": _req_date(p.get("start")),
                    "end": _req_date(p.get("end"))} for i, p in enumerate(d["periods"])]
    fy = create_fiscal_year(biz, str(d.get("name") or "").strip(), _req_date(d.get("start_date"), "شروع"),
                            _req_date(d.get("end_date"), "پایان"), periods)
    return _ok(_fy_row(fy), "سال مالی ساخته شد.", 201)


@acc_api(["GET", "DELETE"], "fiscal_year", "سال مالی")
def fiscal_year_item(request, biz, pk):
    fy = get_object_or_404(FiscalYear.all_objects.filter(business=biz), pk=pk)
    if request.method == "DELETE":
        if fy.status == FiscalYear.Status.CLOSED:
            raise ValueError("سال مالی بسته حذف نمی‌شود.")
        fy.delete()  # اسناد حذف نمی‌شوند؛ فقط تعریف سال و دوره‌ها
        return _ok(None, "سال مالی حذف شد.")
    return _ok({**_fy_row(fy), "preview": year_preview(fy)})


@acc_api(["POST"], "fiscal_year_close", "بستن سال مالی")
def fiscal_year_close(request, biz, pk):
    fy = get_object_or_404(FiscalYear.all_objects.filter(business=biz), pk=pk)
    res = close_fiscal_year(fy, user=request.user, create_next=request.data.get("create_next", True) is not False)
    fy.refresh_from_db()
    return _ok({"year": _fy_row(fy), "entries": {k: (v.number if isinstance(v, JournalEntry) else None)
                                                  for k, v in res.items() if k != "next_year"},
                "next_year_id": res["next_year"].pk if res.get("next_year") else None}, "سال مالی بسته شد.")


@acc_api(["POST"], "fiscal_year_reopen", "بازکردن سال مالی")
def fiscal_year_reopen(request, biz, pk):
    fy = get_object_or_404(FiscalYear.all_objects.filter(business=biz), pk=pk)
    fy = reopen_fiscal_year(fy, user=request.user)
    return _ok(_fy_row(fy), "سال مالی باز شد.")


@acc_api(["POST"], "period_lock", "قفل دوره‌ی مالی")
def period_lock(request, biz, pk):
    p = get_object_or_404(AccountingPeriod.all_objects.filter(business=biz), pk=pk)
    set_period_lock(p, bool(request.data.get("locked", True)))
    return _ok({"id": p.pk, "is_locked": p.is_locked}, "قفل شد." if p.is_locked else "باز شد.")


# ───────────────────────── بانک و صندوق ─────────────────────────

MA_FIELDS = ("bank_name", "branch", "account_number", "iban", "card_number")


def _ma_row(ma):
    return {"id": ma.pk, "kind": ma.kind, "name": ma.name, "gl_account_id": ma.gl_account_id,
            "gl_code": ma.gl_account.code, "detail_id": ma.detail_id, "is_active": ma.is_active,
            "balance": money_balance(ma), **{f: getattr(ma, f) for f in MA_FIELDS}}


@acc_api(["GET", "POST"], "money_account", "بانک/صندوق")
def money_accounts(request, biz):
    if request.method == "GET":
        rows = [_ma_row(m) for m in MoneyAccount.all_objects.filter(business=biz).select_related("gl_account")]
        un = unassigned_balances(biz)
        return _ok({"accounts": rows, "unassigned": {"cash": un["1110"], "bank": un["1120"]}})
    d = request.data
    gl = None
    if d.get("gl_account_id"):
        gl = _obj(Account, biz, d["gl_account_id"], "حساب معین")
    ma = create_money_account(
        biz, d.get("kind") or "bank", d.get("name"), gl_account=gl,
        opening_balance=_amount(d.get("opening_balance"), "موجودی اول", allow_zero=True),
        opening_date=_date(d.get("opening_date"), "تاریخ"), user=request.user,
        **{f: d.get(f) or "" for f in MA_FIELDS},
    )
    return _ok(_ma_row(ma), "ساخته شد.", 201)


@acc_api(["PUT"], "money_account", "بانک/صندوق")
def money_account_item(request, biz, pk):
    ma = get_object_or_404(MoneyAccount.all_objects.filter(business=biz), pk=pk)
    d = request.data
    if "name" in d and str(d["name"]).strip():
        ma.name = str(d["name"]).strip()[:120]
        DetailAccount.all_objects.filter(pk=ma.detail_id).update(name=ma.name)
    for f in MA_FIELDS:
        if f in d:
            setattr(ma, f, str(d[f] or "")[:80])
    if "is_active" in d:
        ma.is_active = bool(d["is_active"])
    ma.save()
    return _ok(_ma_row(ma), "ذخیره شد.")


@acc_api(["GET"])
def reconcile_view(request, biz, pk):
    ma = get_object_or_404(MoneyAccount.all_objects.filter(business=biz), pk=pk)
    sb = request.query_params.get("statement_balance")
    data = reconciliation(ma, statement_balance=Decimal(sb.replace(",", "")) if sb not in (None, "") else None,
                          as_of=_date(request.query_params.get("as_of"), "تاریخ"))
    return _ok({**data, "account": _ma_row(ma)})


@acc_api(["POST"], "bank_statement", "ورود صورت‌حساب بانک")
def statement_import(request, biz, pk):
    ma = get_object_or_404(MoneyAccount.all_objects.filter(business=biz), pk=pk)
    raw = request.data.get("rows")
    if not isinstance(raw, list) or not raw:
        raise ValueError("ردیفی برای ورود وجود ندارد.")
    if len(raw) > 5000:
        raise ValueError("حداکثر ۵۰۰۰ ردیف در هر بار.")
    rows = []
    for i, r in enumerate(raw, 1):
        try:
            amount = Decimal(str(r.get("amount")).replace(",", "").strip())
        except (InvalidOperation, AttributeError):
            raise ValueError(f"مبلغ ردیف {i} نامعتبر است.")
        rows.append({"date": _req_date(r.get("date"), f"تاریخ ردیف {i}"), "amount": amount,
                     "description": r.get("description"), "reference": r.get("reference")})
    n = import_statement(ma, rows)
    matched = auto_match(ma) if request.data.get("auto_match", True) else 0
    return _ok({"imported": n, "matched": matched}, f"{n} ردیف وارد شد؛ {matched} ردیف تطبیق خورد.")


@acc_api(["POST"], "bank_auto_match", "تطبیق خودکار بانک")
def statement_auto_match(request, biz, pk):
    ma = get_object_or_404(MoneyAccount.all_objects.filter(business=biz), pk=pk)
    n = auto_match(ma)
    return _ok({"matched": n}, f"{n} ردیف تطبیق خورد.")


@acc_api(["DELETE"], "bank_statement", "ردیف صورت‌حساب")
def statement_line_item(request, biz, pk):
    st = get_object_or_404(BankStatementLine.all_objects.filter(business=biz), pk=pk)
    st.delete()
    return _ok(None, "حذف شد.")


@acc_api(["POST", "DELETE"], "bank_match", "تطبیق ردیف بانک")
def statement_line_match(request, biz, pk):
    st = get_object_or_404(BankStatementLine.all_objects.filter(business=biz), pk=pk)
    if request.method == "DELETE":
        st.matched_line = None
        st.save(update_fields=["matched_line"])
        return _ok(None, "تطبیق لغو شد.")
    line = _obj(JournalLine, biz, request.data.get("line_id"), "ردیف سند")
    match_line(st, line)
    return _ok(None, "تطبیق داده شد.")


def _transfer_row(t):
    return {"id": t.pk, "source": t.source.name, "target": t.target.name, "source_id": t.source_id,
            "target_id": t.target_id, "amount": t.amount, "fee": t.fee, "date": t.date, "reference": t.reference,
            "note": t.note, "entry_id": t.entry_id,
            "cancelled": JournalEntry.all_objects.filter(reversal_of_id=t.entry_id).exists() if t.entry_id else False}


@acc_api(["GET", "POST"], "transfer", "انتقال وجه")
def transfers(request, biz):
    if request.method == "GET":
        qs = MoneyTransfer.all_objects.filter(business=biz).select_related("source", "target")[:300]
        return _ok([_transfer_row(t) for t in qs])
    d = request.data
    tr = transfer(biz, _obj(MoneyAccount, biz, d.get("source_id"), "مبدأ"),
                  _obj(MoneyAccount, biz, d.get("target_id"), "مقصد"), _amount(d.get("amount")),
                  fee=_amount(d.get("fee"), "کارمزد", allow_zero=True), date=_req_date(d.get("date")),
                  reference=d.get("reference") or "", note=d.get("note") or "", user=request.user)
    return _ok(_transfer_row(tr), "انتقال ثبت شد.", 201)


@acc_api(["POST"], "transfer_cancel", "ابطال انتقال وجه")
def transfer_cancel(request, biz, pk):
    tr = get_object_or_404(MoneyTransfer.all_objects.filter(business=biz), pk=pk)
    cancel_transfer(tr, user=request.user)
    return _ok(_transfer_row(tr), "انتقال ابطال شد.")


# ───────────────────────── چک ─────────────────────────

def _cheque_row(c, events=False):
    row = {"id": c.pk, "direction": c.direction, "status": c.status, "number": c.number, "sayad_id": c.sayad_id,
           "bank_name": c.bank_name, "branch": c.branch, "amount": c.amount, "issue_date": c.issue_date,
           "due_date": c.due_date, "party_id": c.party_id, "party": c.party.name,
           "money_account_id": c.money_account_id,
           "money_account": c.money_account.name if c.money_account_id else "",
           "endorsed_to": c.endorsed_to.name if c.endorsed_to_id else "", "note": c.note}
    if events:
        row["events"] = [{"id": e.pk, "from_status": e.from_status, "to_status": e.to_status, "date": e.date,
                          "entry_id": e.entry_id, "note": e.note}
                         for e in ChequeEvent.all_objects.filter(cheque=c).order_by("id")]
    return row


@acc_api(["GET", "POST"], "cheque", "چک")
def cheques(request, biz):
    if request.method == "GET":
        qs = Cheque.all_objects.filter(business=biz).select_related("party", "money_account", "endorsed_to")
        p = request.query_params
        if p.get("direction") in Cheque.Direction.values:
            qs = qs.filter(direction=p["direction"])
        if p.get("status"):
            qs = qs.filter(status__in=p["status"].split(","))
        if p.get("due_to"):
            qs = qs.filter(due_date__lte=_date(p["due_to"], "سررسید"))
        if p.get("due_from"):
            qs = qs.filter(due_date__gte=_date(p["due_from"], "سررسید"))
        q = (p.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(number__icontains=q) | Q(party__name__icontains=q) | Q(sayad_id__icontains=q))
        rows = [_cheque_row(c) for c in qs.order_by("due_date", "id")[:1000]]
        return _ok(rows)
    d = request.data
    party = _obj(DetailAccount, biz, d.get("party_id"), "طرف حساب")
    ma = _obj(MoneyAccount, biz, d["money_account_id"], "حساب بانکی") if d.get("money_account_id") else None
    counter = _obj(Account, biz, d["counter_account_id"], "حساب طرف مقابل") if d.get("counter_account_id") else None
    ch = register_cheque(
        biz, d.get("direction"), party, d.get("number"), _amount(d.get("amount")),
        _req_date(d.get("issue_date"), "تاریخ دریافت/صدور"), _req_date(d.get("due_date"), "سررسید"),
        counter_account=counter, money_account=ma, user=request.user,
        sayad_id=d.get("sayad_id") or "", bank_name=d.get("bank_name") or "", branch=d.get("branch") or "",
        note=d.get("note") or "",
    )
    return _ok(_cheque_row(ch, True), "چک ثبت شد.", 201)


@acc_api(["GET"])
def cheque_item(request, biz, pk):
    c = get_object_or_404(Cheque.all_objects.filter(business=biz), pk=pk)
    return _ok(_cheque_row(c, True))


@acc_api(["POST"], "cheque_status", "تغییر وضعیت چک")
def cheque_status(request, biz, pk):
    c = get_object_or_404(Cheque.all_objects.filter(business=biz), pk=pk)
    d = request.data
    ma = _obj(MoneyAccount, biz, d["money_account_id"], "حساب بانکی") if d.get("money_account_id") else None
    to = _obj(DetailAccount, biz, d["endorsed_to_id"], "گیرنده‌ی چک") if d.get("endorsed_to_id") else None
    c = change_cheque_status(c, d.get("to_status"), _req_date(d.get("date")), money_account=ma, endorsed_to=to,
                             note=d.get("note") or "", user=request.user)
    return _ok(_cheque_row(c, True), "وضعیت چک تغییر کرد.")


@acc_api(["POST"], "cheque_undo", "لغو تغییر وضعیت چک")
def cheque_undo(request, biz, pk):
    c = get_object_or_404(Cheque.all_objects.filter(business=biz), pk=pk)
    c = undo_cheque_status(c, user=request.user)
    return _ok(_cheque_row(c, True), "آخرین تغییر لغو شد.")


# ───────────────────────── بودجه ─────────────────────────

def _budget_lines(biz, budget, raw):
    if not isinstance(raw, list):
        raise ValueError("ردیف‌های بودجه نامعتبر است.")
    BudgetLine.all_objects.filter(budget=budget).delete()
    objs = []
    for ln in raw:
        acc = _obj(Account, biz, ln.get("account_id"), "حساب")
        if acc.type not in (Account.Type.INCOME, Account.Type.EXPENSE):
            raise ValueError(f"بودجه فقط برای حساب‌های درآمد و هزینه است («{acc.name}»).")
        cc = _obj(CostCenter, biz, ln["cost_center_id"], "مرکز هزینه") if ln.get("cost_center_id") else None
        objs.append(BudgetLine(business=biz, budget=budget, account=acc, cost_center=cc,
                               amount=_amount(ln.get("amount"), "مبلغ بودجه", allow_zero=True)))
    BudgetLine.all_objects.bulk_create(objs)


@acc_api(["GET", "POST"], "budget", "بودجه")
def budgets(request, biz):
    if request.method == "GET":
        return _ok([{"id": b.pk, "name": b.name, "start_date": b.start_date, "end_date": b.end_date, "note": b.note}
                    for b in Budget.all_objects.filter(business=biz)])
    d = request.data
    start, end = _req_date(d.get("start_date"), "شروع"), _req_date(d.get("end_date"), "پایان")
    if end < start:
        raise ValueError("پایان بودجه قبل از شروع آن است.")
    name = str(d.get("name") or "").strip()[:120]
    if not name:
        raise ValueError("نام بودجه الزامی است.")
    with transaction.atomic():
        b = Budget.all_objects.create(business=biz, name=name, start_date=start, end_date=end,
                                      note=str(d.get("note") or "")[:300])
        _budget_lines(biz, b, d.get("lines") or [])
    return _ok(budget_vs_actual(b), "بودجه ساخته شد.", 201)


@acc_api(["GET", "PUT", "DELETE"], "budget", "بودجه")
def budget_item(request, biz, pk):
    b = get_object_or_404(Budget.all_objects.filter(business=biz), pk=pk)
    if request.method == "DELETE":
        b.delete()
        return _ok(None, "بودجه حذف شد.")
    if request.method == "PUT":
        d = request.data
        with transaction.atomic():
            if d.get("name"):
                b.name = str(d["name"]).strip()[:120]
            if d.get("start_date"):
                b.start_date = _req_date(d["start_date"])
            if d.get("end_date"):
                b.end_date = _req_date(d["end_date"])
            if b.end_date < b.start_date:
                raise ValueError("پایان بودجه قبل از شروع آن است.")
            b.save()
            if "lines" in d:
                _budget_lines(biz, b, d["lines"])
    return _ok(budget_vs_actual(b))


# ───────────────────────── سند فروش/خرید با ارزش افزوده ─────────────────────────

@acc_api(["POST"], "vat_document", "سند فروش/خرید با ارزش افزوده")
def vat_document(request, biz):
    """
    فروش: بدهکار دریافتنی/بانک/صندوق (مبلغ کل) | بستانکار فروش (خالص) + مالیات ارزش افزوده فروش
    خرید: بدهکار هزینه/موجودی (خالص) + مالیات ارزش افزوده خرید | بستانکار پرداختنی/بانک/صندوق (مبلغ کل)
    """
    d = request.data
    kind = d.get("kind")
    if kind not in ("sale", "purchase"):
        raise ValueError("نوع سند نامعتبر است.")
    net = _amount(d.get("net"), "مبلغ خالص")
    rate = _amount(d.get("vat_rate") if d.get("vat_rate") not in (None, "") else _settings(biz).vat_rate,
                   "نرخ مالیات", allow_zero=True)
    if rate > 100:
        raise ValueError("نرخ مالیات نامعتبر است.")
    vat = q2(net * rate / 100)
    total = net + vat
    party = _obj(DetailAccount, biz, d["party_id"], "طرف حساب") if d.get("party_id") else None
    method = d.get("method") or "credit"
    if method == "credit":
        if party is None:
            raise ValueError("برای فروش/خرید نسیه، طرف حساب را انتخاب کنید.")
        money = {"account": RECEIVABLE if kind == "sale" else PAYABLE, "detail": party}
    else:
        ma = _obj(MoneyAccount, biz, d.get("money_account_id"), "بانک/صندوق")
        money = {"account": ma.gl_account, "detail": ma.detail}
    if d.get("account_id"):
        main = _obj(Account, biz, d["account_id"], "حساب")
    else:
        main = get_account(biz, SALES if kind == "sale" else "1140")
    desc = str(d.get("description") or "")[:400] or ("فروش" if kind == "sale" else "خرید") + (
        f" — {party.name}" if party else "")
    if kind == "sale":
        lines = [{**money, "debit": total, "memo": desc}, {"account": main, "credit": net, "memo": desc}]
        if vat:
            lines.append({"account": VAT_OUT, "credit": vat, "tax_base": net, "detail": party,
                          "memo": f"ارزش افزوده {rate}٪"})
    else:
        lines = [{"account": main, "debit": net, "memo": desc}, {**money, "credit": total, "memo": desc}]
        if vat:
            lines.append({"account": VAT_IN, "debit": vat, "tax_base": net, "detail": party,
                          "memo": f"ارزش افزوده {rate}٪"})
    e = post_entry(biz, lines, date=_req_date(d.get("date")), description=desc,
                   reference=str(d.get("reference") or ""), source_type="vat_document", user=request.user)
    return _ok({"entry_id": e.pk, "number": e.number, "net": net, "vat": vat, "total": total}, "سند ثبت شد.", 201)


# ───────────────────────── گزارش‌ها ─────────────────────────

def _range(request):
    return _date(request.query_params.get("from"), "از"), _date(request.query_params.get("to"), "تا")


@acc_api(["GET"])
def report_journal_book(request, biz):
    f, t = _range(request)
    return _ok(journal_book(biz, f, t))


@acc_api(["GET"])
def report_trial_balance_ext(request, biz):
    f, t = _range(request)
    p = request.query_params
    return _ok(trial_balance_ext(biz, f, t, level=p.get("level") or "subsidiary",
                                 exclude_closing=p.get("exclude_closing") == "1",
                                 hide_zero=p.get("show_zero") != "1"))


@acc_api(["GET"])
def report_cash_flow(request, biz):
    f, t = _range(request)
    return _ok(cash_flow(biz, f, t))


@acc_api(["GET"])
def report_aging(request, biz):
    side = "payable" if request.query_params.get("side") == "payable" else "receivable"
    return _ok(aging(biz, side, _date(request.query_params.get("as_of"), "تاریخ")))


@acc_api(["GET"])
def report_party_balances(request, biz):
    side = "payable" if request.query_params.get("side") == "payable" else "receivable"
    return _ok(party_balances(biz, side, _date(request.query_params.get("as_of"), "تاریخ")))


@acc_api(["GET"])
def report_vat(request, biz):
    f, t = _range(request)
    return _ok(vat_report(biz, f, t))


@acc_api(["GET"])
def cheque_reminders(request, biz):
    """چک‌های سررسید‌شده یا نزدیک به سررسید (برای صفحه‌ی خانه)."""
    from ..accounting_treasury import cheques_due
    days = int(request.query_params.get("days") or 7)
    return _ok([_cheque_row(c) for c in cheques_due(biz, days=min(max(days, 0), 90),
                                                    today=timezone.localdate())])

