"""
حسابداری — API

  /api/accounting/accounts/                 GET / POST
  /api/accounting/accounts/<id>/            PUT / DELETE
  /api/accounting/cost-centers/             GET / POST
  /api/accounting/journal/                  GET (فیلتر) / POST (سند دستی)
  /api/accounting/journal/<id>/             GET
  /api/accounting/journal/<id>/reverse/     POST
  /api/accounting/reports/trial-balance|ledger|income-statement|balance-sheet/
  /api/accounting/summary/                  GET (شاخص‌های داشبورد)
"""

import datetime
from decimal import Decimal, InvalidOperation

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ..accounting_services import (
    BANK, CASH, DRIVER_CASH, INVENTORY, PAYABLE, RECEIVABLE,
    balance_sheet, ensure_chart, income_statement, ledger, post_entry,
    reverse_entry, trial_balance,
)
from ..models import Account, CostCenter, JournalEntry, JournalLine
from ..utils import api_error, api_success
from .common import StaffAuth, make_service_permission, staff_business
from ..activity import audit

AccountingPerm = make_service_permission("accounting")
PAGE = 50


def _f(d):
    return float(d)


def _date(value, name):
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        raise ValueError(f"تاریخ «{name}» نامعتبر است (قالب YYYY-MM-DD).")


def _account_data(a):
    return {
        "id": a.id, "code": a.code, "name": a.name, "name_en": a.name_en, "type": a.type,
        "type_display": a.get_type_display(), "parent_id": a.parent_id,
        "is_postable": a.is_postable, "is_system": a.is_system, "is_active": a.is_active,
    }


def _entry_data(e, with_lines=False):
    data = {
        "id": e.id, "number": e.number, "date": e.date.isoformat(),
        "description": e.description, "source_type": e.source_type, "source_id": e.source_id,
        "reversal_of": e.reversal_of_id,
    }
    reversed_by = JournalEntry.all_objects.filter(reversal_of=e).values_list("id", flat=True).first()
    data["reversed_by"] = reversed_by
    data["is_reversed"] = reversed_by is not None
    lines = list(JournalLine.all_objects.filter(entry=e).select_related("account", "cost_center"))
    data["total"] = _f(sum((l.debit for l in lines), Decimal("0")))
    if with_lines:
        data["lines"] = [
            {"id": l.id, "account_id": l.account_id, "code": l.account.code,
             "account": l.account.name, "debit": _f(l.debit), "credit": _f(l.credit),
             "memo": l.memo, "cost_center_id": l.cost_center_id,
             "cost_center": l.cost_center.name if l.cost_center else ""}
            for l in lines
        ]
    return data


def _no_business():
    return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")


# ═══════════════════════════════════════
#  حساب‌ها
# ═══════════════════════════════════════

@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "account", "سرفصل حساب")
def accounts(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    ensure_chart(r)
    if request.method == "GET":
        qs = Account.objects.filter(business=r).order_by("code")
        return api_success(data=[_account_data(a) for a in qs])

    d = request.data
    code = str(d.get("code") or "").strip()
    name = str(d.get("name") or "").strip()
    typ = d.get("type")
    if not code or not name or typ not in dict(Account.Type.choices):
        return api_error("کد، نام و نوع حساب الزامی است.")
    if Account.objects.filter(business=r, code=code).exists():
        return api_error("این کد حساب قبلاً استفاده شده است.")
    parent = None
    if d.get("parent_id"):
        parent = Account.objects.filter(business=r, pk=d["parent_id"]).first()
        if not parent:
            return api_error("حساب والد پیدا نشد.")
        if parent.lines.exists():
            return api_error("روی حساب والد سند ثبت شده؛ نمی‌تواند گروه شود.")
        typ = parent.type
        if parent.is_postable:
            parent.is_postable = False
            parent.save(update_fields=["is_postable"])
    a = Account.objects.create(
        business=r, code=code[:20], name=name[:200], name_en=str(d.get("name_en") or "")[:200],
        type=typ, parent=parent, is_postable=bool(d.get("is_postable", True)),
    )
    return api_success(data=_account_data(a), message="حساب ساخته شد.", status_code=201)


@api_view(["PUT", "DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "account", "سرفصل حساب")
def account_detail(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    a = get_object_or_404(Account.objects.filter(business=r), pk=pk)

    if request.method == "DELETE":
        if a.is_system:
            return api_error("حساب سیستمی قابل حذف نیست؛ می‌توانید غیرفعالش کنید.")
        if a.lines.exists() or a.children.exists():
            return api_error("این حساب سند یا زیرمجموعه دارد و قابل حذف نیست.")
        a.delete()
        return api_success(message="حساب حذف شد.")

    d = request.data
    if "name" in d:
        name = str(d["name"]).strip()
        if not name:
            return api_error("نام حساب الزامی است.")
        a.name = name[:200]
    if "name_en" in d:
        a.name_en = str(d["name_en"] or "")[:200]
    if "is_active" in d:
        a.is_active = bool(d["is_active"])
    a.save()
    return api_success(data=_account_data(a), message="ذخیره شد.")


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
def cost_centers(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    if request.method == "GET":
        return api_success(data=[
            {"id": c.id, "code": c.code, "name": c.name, "kind": c.kind, "is_active": c.is_active}
            for c in CostCenter.objects.filter(business=r)
        ])
    d = request.data
    code, name = str(d.get("code") or "").strip(), str(d.get("name") or "").strip()
    if not code or not name:
        return api_error("کد و نام مرکز هزینه الزامی است.")
    if CostCenter.objects.filter(business=r, code=code).exists():
        return api_error("این کد قبلاً استفاده شده است.")
    kind = d.get("kind") if d.get("kind") in dict(CostCenter.Kind.choices) else "other"
    c = CostCenter.objects.create(business=r, code=code[:20], name=name[:200], kind=kind)
    return api_success(data={"id": c.id, "code": c.code, "name": c.name, "kind": c.kind},
                       message="مرکز هزینه ساخته شد.", status_code=201)


# ═══════════════════════════════════════
#  اسناد
# ═══════════════════════════════════════

@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "journal", "سند حسابداری")
def journal(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    ensure_chart(r)

    if request.method == "GET":
        try:
            d_from = _date(request.query_params.get("from"), "از")
            d_to = _date(request.query_params.get("to"), "تا")
        except ValueError as exc:
            return api_error(str(exc))
        qs = JournalEntry.objects.filter(business=r)
        if d_from:
            qs = qs.filter(date__gte=d_from)
        if d_to:
            qs = qs.filter(date__lte=d_to)
        st = request.query_params.get("source_type")
        if st:
            qs = qs.filter(source_type=st)
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(description__icontains=q) | Q(lines__memo__icontains=q)).distinct()
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1
        total = qs.count()
        items = qs.order_by("-date", "-number")[(page - 1) * PAGE: page * PAGE]
        return api_success(data={"total": total, "page": page, "page_size": PAGE,
                                 "results": [_entry_data(e) for e in items]})

    d = request.data
    try:
        date = _date(d.get("date"), "تاریخ") or timezone.localdate()
        raw = d.get("lines")
        if not isinstance(raw, list):
            raise ValueError("ردیف‌های سند الزامی است.")
        lines = []
        for ln in raw:
            acc = Account.objects.filter(business=r, pk=ln.get("account_id")).first()
            if acc is None:
                raise ValueError("حساب یکی از ردیف‌ها پیدا نشد.")
            cc = None
            if ln.get("cost_center_id"):
                cc = CostCenter.objects.filter(business=r, pk=ln["cost_center_id"]).first()
                if cc is None:
                    raise ValueError("مرکز هزینه پیدا نشد.")
            lines.append({"account": acc, "debit": ln.get("debit") or 0,
                          "credit": ln.get("credit") or 0, "memo": ln.get("memo", ""),
                          "cost_center": cc})
        entry = post_entry(r, lines, date=date, description=str(d.get("description") or ""),
                           source_type="manual", source_id=None, user=request.user)
    except (ValueError, InvalidOperation, TypeError) as exc:
        return api_error(str(exc) if isinstance(exc, ValueError) else "مبلغ ردیف نامعتبر است.")
    return api_success(data=_entry_data(entry, with_lines=True), message="سند ثبت شد.",
                       status_code=201)


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
def journal_detail(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    e = get_object_or_404(JournalEntry.objects.filter(business=r), pk=pk)
    return api_success(data=_entry_data(e, with_lines=True))


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "journal_reverse", "برگشت سند")
def journal_reverse(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    e = get_object_or_404(JournalEntry.objects.filter(business=r), pk=pk)
    try:
        rev = reverse_entry(e, user=request.user, reason=str(request.data.get("reason") or "")[:200])
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_entry_data(rev, with_lines=True), message="سند برگشت خورد.",
                       status_code=201)


# ═══════════════════════════════════════
#  گزارش‌ها
# ═══════════════════════════════════════

def _range(request):
    return (_date(request.query_params.get("from"), "از"),
            _date(request.query_params.get("to"), "تا"))


def _jsonable(obj):
    if isinstance(obj, Decimal):
        return _f(obj)
    if isinstance(obj, datetime.date):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    return obj


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
def report_trial_balance(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    try:
        d_from, d_to = _range(request)
    except ValueError as exc:
        return api_error(str(exc))
    ensure_chart(r)
    return api_success(data=_jsonable(trial_balance(r, d_from, d_to)))


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
def report_ledger(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    try:
        d_from, d_to = _range(request)
        acc = Account.objects.filter(business=r, pk=request.query_params.get("account") or 0).first()
        if acc is None:
            raise ValueError("حساب انتخاب نشده یا پیدا نشد.")
        data = ledger(r, acc, d_from, d_to)
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_jsonable(data))


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
def report_income_statement(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    try:
        d_from, d_to = _range(request)
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_jsonable(income_statement(r, d_from, d_to)))


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
def report_balance_sheet(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    try:
        as_of = _date(request.query_params.get("as_of") or request.query_params.get("to"), "تاریخ")
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_jsonable(balance_sheet(r, as_of)))


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
def accounting_summary(request):
    """شاخص‌های اصلی داشبورد حسابداری."""
    r = staff_business(request)
    if r is None:
        return _no_business()
    ensure_chart(r)
    today = timezone.localdate()
    month_start = today.replace(day=1)
    bs = balance_sheet(r, today)
    by_code = {row["code"]: row["amount"] for row in bs["assets"] + bs["liabilities"]}
    month = income_statement(r, month_start, today)
    return api_success(data=_jsonable({
        "cash": by_code.get(CASH, Decimal("0")),
        "bank": by_code.get(BANK, Decimal("0")),
        "receivable": by_code.get(RECEIVABLE, Decimal("0")),
        "payable": by_code.get(PAYABLE, Decimal("0")),
        "inventory": by_code.get(INVENTORY, Decimal("0")),
        "driver_cash": by_code.get(DRIVER_CASH, Decimal("0")),
        "month_income": month["total_income"],
        "month_expense": month["total_expense"],
        "month_profit": month["net_profit"],
        "balanced": bs["balanced"],
    }))
