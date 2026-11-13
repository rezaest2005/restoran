"""
Accounting autopilot API — the simple screens (home sections, quick entries, fixed costs and salaries).

  GET    /api/accounting/autopilot/             home page data (also posts any due monthly costs)
  GET    /api/accounting/expenses/ , POST       expenses (the customer picks a category and types an amount)
  DELETE /api/accounting/expenses/<id>/
  GET    /api/accounting/payments/ , POST       money received from a customer / paid to a supplier
  DELETE /api/accounting/payments/<id>/
  GET    /api/accounting/recurring/ , POST      monthly fixed costs (rent, salaries, bills)
  PUT/DELETE /api/accounting/recurring/<id>/
"""
import datetime
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ..accounting_autopilot import next_due, opening_balances, overview, run_recurring, set_opening
from ..accounting_posting import post_expense, post_payment, safe_post, unpost
from ..accounting_services import normalize_category
from ..models import EXPENSE_CATEGORIES, Customer, Expense, Payment, RecurringExpense, Supplier
from ..utils import api_error, api_success
from .accounting import AccountingPerm, _date
from .common import StaffAuth, staff_business
from ..activity import audit

METHODS = ("cash", "bank")
MAX_AMOUNT = Decimal("999999999999")


def _jsonable(o):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, dict):
        return {k: _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    return o


def _amount(value, name="مبلغ"):
    try:
        v = Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        raise ValueError(f"{name} نامعتبر است.")
    if v <= 0 or v > MAX_AMOUNT:
        raise ValueError(f"{name} باید بیشتر از صفر باشد.")
    return v.quantize(Decimal("0.01"))


def _method(value, default="cash"):
    v = (value or default)
    if v not in METHODS:
        raise ValueError("روش پرداخت نامعتبر است.")
    return v


def _biz(request):
    r = staff_business(request)
    return r


def _user(request):
    return request.user if request.user.is_authenticated else None


def _expense_row(e):
    return {"id": e.id, "title": e.title, "amount": float(e.amount), "category": normalize_category(e.category),
            "date": e.date.isoformat(), "payment_method": e.payment_method, "note": e.note,
            "auto": e.recurring_id is not None}


def _payment_row(p):
    return {"id": p.id, "kind": p.kind, "party": p.party_name or (p.customer.name if p.customer_id else
            p.supplier.name if p.supplier_id else ""), "customer_id": p.customer_id, "supplier_id": p.supplier_id,
            "amount": float(p.amount), "method": p.method, "date": p.date.isoformat(), "note": p.note}


def _recurring_row(r):
    return {"id": r.id, "title": r.title, "category": normalize_category(r.category), "amount": float(r.amount),
            "day_of_month": r.day_of_month, "payment_method": r.payment_method, "is_active": r.is_active,
            "start_date": r.start_date.isoformat(), "note": r.note, "next_due": next_due(r).isoformat()}


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
def autopilot_overview(request):
    r = _biz(request)
    if r is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    return api_success(data=_jsonable(overview(r)))


# ───────────────────────── expenses ─────────────────────────

@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "expense", "هزینه")
def expenses(request):
    r = _biz(request)
    if r is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    if request.method == "GET":
        qs = Expense.all_objects.filter(business=r)
        if request.query_params.get("from"):
            qs = qs.filter(date__gte=request.query_params["from"][:10])
        if request.query_params.get("to"):
            qs = qs.filter(date__lte=request.query_params["to"][:10])
        return api_success(data=[_expense_row(e) for e in qs.order_by("-date", "-id")[:200]])
    d = request.data
    try:
        title = str(d.get("title") or "").strip()[:200]
        category = normalize_category(d.get("category"))
        if not title:
            title = {k: label for k, label, _ in EXPENSE_CATEGORIES}[category]
        e = Expense.all_objects.create(
            business=r, title=title, amount=_amount(d.get("amount")), category=category,
            date=_date(d.get("date"), "تاریخ") or timezone.localdate(), payment_method=_method(d.get("payment_method")),
            note=str(d.get("note") or "")[:500])
    except ValueError as exc:
        return api_error(str(exc))
    safe_post(post_expense, e, _user(request))
    return api_success(data=_expense_row(e), status_code=201)


@api_view(["DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "expense", "هزینه")
def expense_remove(request, pk):
    r = _biz(request)
    e = Expense.all_objects.filter(business=r, pk=pk).first() if r else None
    if e is None:
        return api_error("پیدا نشد.", 404)
    unpost(r, "expense", e.pk, user=_user(request), reason="حذف هزینه")
    e.delete()
    return api_success(data={"deleted": True})


# ───────────────────────── payments in / out ─────────────────────────

@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "payment", "دریافت/پرداخت")
def payments(request):
    r = _biz(request)
    if r is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    if request.method == "GET":
        qs = Payment.all_objects.filter(business=r).select_related("customer", "supplier").order_by("-date", "-id")[:200]
        return api_success(data=[_payment_row(p) for p in qs])
    d = request.data
    try:
        kind = d.get("kind")
        if kind not in ("in", "out"):
            raise ValueError("نوع باید «دریافت از مشتری» یا «پرداخت به تأمین‌کننده» باشد.")
        customer = supplier = None
        if kind == "in":
            customer = Customer.all_objects.filter(business=r, pk=d.get("customer_id")).first() if d.get("customer_id") else None
            if customer is None:
                raise ValueError("مشتری را انتخاب کنید.")
        else:
            supplier = Supplier.all_objects.filter(business=r, pk=d.get("supplier_id")).first() if d.get("supplier_id") else None
            if supplier is None:
                raise ValueError("تأمین‌کننده را انتخاب کنید.")
        p = Payment.all_objects.create(
            business=r, kind=kind, customer=customer, supplier=supplier,
            party_name=(customer or supplier).name, amount=_amount(d.get("amount")),
            method=_method(d.get("method")), date=_date(d.get("date"), "تاریخ") or timezone.localdate(),
            note=str(d.get("note") or "")[:300], created_by=_user(request))
    except ValueError as exc:
        return api_error(str(exc))
    safe_post(post_payment, p, _user(request))
    return api_success(data=_payment_row(p), status_code=201)


@api_view(["DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "payment", "دریافت/پرداخت")
def payment_remove(request, pk):
    r = _biz(request)
    p = Payment.all_objects.filter(business=r, pk=pk).first() if r else None
    if p is None:
        return api_error("پیدا نشد.", 404)
    unpost(r, "payment", p.pk, user=_user(request), reason="حذف پرداخت/دریافت")
    p.delete()
    return api_success(data={"deleted": True})


# ───────────────────────── fixed monthly costs & salaries ─────────────────────────

def _recurring_fields(d, rec=None):
    out = {}
    if "title" in d or rec is None:
        title = str(d.get("title") or "").strip()[:200]
        if not title:
            raise ValueError("عنوان را بنویسید.")
        out["title"] = title
    if "category" in d or rec is None:
        out["category"] = normalize_category(d.get("category"))
    if "amount" in d or rec is None:
        out["amount"] = _amount(d.get("amount"), "مبلغ ماهانه")
    if "day_of_month" in d or rec is None:
        try:
            day = int(d.get("day_of_month", 1))
        except (TypeError, ValueError):
            raise ValueError("روز ماه نامعتبر است.")
        if not 1 <= day <= 28:
            raise ValueError("روز ماه باید بین ۱ تا ۲۸ باشد.")
        out["day_of_month"] = day
    if "payment_method" in d or rec is None:
        out["payment_method"] = _method(d.get("payment_method"), "bank")
    if "start_date" in d or rec is None:
        out["start_date"] = _date(d.get("start_date"), "تاریخ شروع") or timezone.localdate()
    if "is_active" in d:
        out["is_active"] = bool(d.get("is_active"))
    if "note" in d:
        out["note"] = str(d.get("note") or "")[:300]
    return out


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "recurring", "هزینه‌ی ثابت/حقوق")
def recurring(request):
    r = _biz(request)
    if r is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    if request.method == "GET":
        return api_success(data=[_recurring_row(x) for x in RecurringExpense.all_objects.filter(business=r)])
    try:
        rec = RecurringExpense.all_objects.create(business=r, **_recurring_fields(request.data))
    except ValueError as exc:
        return api_error(str(exc))
    made = run_recurring(r, user=_user(request))
    return api_success(data={**_recurring_row(rec), "posted_now": made}, status_code=201)


@api_view(["PUT", "DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "recurring", "هزینه‌ی ثابت/حقوق")
def recurring_detail(request, pk):
    r = _biz(request)
    rec = RecurringExpense.all_objects.filter(business=r, pk=pk).first() if r else None
    if rec is None:
        return api_error("پیدا نشد.", 404)
    if request.method == "DELETE":
        rec.delete()          # past months stay in the books; only future automatic posting stops
        return api_success(data={"deleted": True})
    try:
        for k, v in _recurring_fields(request.data, rec).items():
            setattr(rec, k, v)
        rec.save()
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_recurring_row(rec))


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([AccountingPerm])
@audit("accounting", "opening", "موجودی اول دوره")
def opening(request):
    """Starting cash and bank balance (so the home page does not start from a negative number)."""
    r = _biz(request)
    if r is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    if request.method == "GET":
        return api_success(data=_jsonable(opening_balances(r)))
    d = request.data
    try:
        def amt(k):
            v = d.get(k)
            return Decimal("0") if v in (None, "", 0, "0") else _amount(v, "مبلغ")
        set_opening(r, amt("cash"), amt("bank"), _date(d.get("date"), "تاریخ"), _user(request))
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_jsonable(opening_balances(r)))
