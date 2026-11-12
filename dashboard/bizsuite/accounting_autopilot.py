"""
Accounting autopilot — the customer enters numbers, the system keeps the books.

* ``run_recurring``      — rent, salaries, bills … are posted every month by themselves.
* ``customer_debts`` / ``supplier_balances`` — who owes whom, after payments.
* ``overview``           — everything the accounting home page shows, grouped into plain sections.

Nothing here asks the user for an account code; the double-entry side lives in accounting_posting.py.
"""

from __future__ import annotations

import calendar
import datetime
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .accounting_posting import safe_post, post_expense
from .accounting_services import (
    BANK, CASH, INVENTORY, PAYABLE, RECEIVABLE, balance_sheet, ensure_chart, income_statement, normalize_category, q2,
)
from .models import (
    EXPENSE_CATEGORIES, Business, Customer, Expense, Payment, PurchaseInvoice, PurchaseInvoiceItem,
    RecurringExpense, Supplier,
)
from .modules import module_enabled

MAX_CATCH_UP_MONTHS = 12
ZERO = Decimal("0")
CATEGORY_LABELS = {k: label for k, label, _ in EXPENSE_CATEGORIES}


# ───────────────────────── recurring expenses ─────────────────────────

def _periods_due(rec: RecurringExpense, today: datetime.date):
    """(period "YYYY-MM", date) of every month that has reached its day, from start_date up to today."""
    out = []
    y, m = rec.start_date.year, rec.start_date.month
    while (y, m) <= (today.year, today.month):
        day = min(rec.day_of_month, calendar.monthrange(y, m)[1])
        when = datetime.date(y, m, day)
        if when >= rec.start_date and when <= today:
            out.append((f"{y:04d}-{m:02d}", when))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out[-MAX_CATCH_UP_MONTHS:]


def run_recurring(business, today: datetime.date | None = None, user=None) -> int:
    """Create the expense rows (and their journal entries) that are due. Safe to call any number of times."""
    today = today or timezone.localdate()
    made = 0
    for rec in RecurringExpense.all_objects.filter(business=business, is_active=True):
        for period, when in _periods_due(rec, today):
            with transaction.atomic():
                exp, created = Expense.all_objects.get_or_create(
                    business=business, recurring=rec, period=period,
                    defaults=dict(title=rec.title, amount=rec.amount, category=rec.category, date=when,
                                  payment_method=rec.payment_method, note=rec.note or "هزینه‌ی ثابت — خودکار"),
                )
            if created:
                made += 1
                safe_post(post_expense, exp, user)
    return made


def run_recurring_all(today: datetime.date | None = None) -> int:
    """For the worker: every business that has the accounting module."""
    total = 0
    for biz in Business.objects.filter(is_active=True):
        if module_enabled(biz, "accounting"):
            total += run_recurring(biz, today)
    return total


def next_due(rec: RecurringExpense, today: datetime.date | None = None) -> datetime.date:
    today = today or timezone.localdate()
    y, m = today.year, today.month
    for _ in range(2):
        when = datetime.date(y, m, min(rec.day_of_month, calendar.monthrange(y, m)[1]))
        if when > today:
            return max(when, rec.start_date)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return when


# ───────────────────────── who owes whom ─────────────────────────

def customer_debts(business, limit=20):
    rows = []
    for c in Customer.all_objects.filter(business=business, is_active=True):
        debt = q2(c.total_debt)
        if debt > 0:
            rows.append({"id": c.id, "name": c.name, "phone": c.phone, "amount": debt})
    rows.sort(key=lambda r: -r["amount"])
    return rows[:limit]


def supplier_balance(supplier: Supplier) -> Decimal:
    """What we still owe: credit part of purchase invoices minus payments out."""
    total = ZERO
    for inv in PurchaseInvoice.all_objects.filter(business=supplier.business, supplier=supplier):
        items = PurchaseInvoiceItem.all_objects.filter(invoice_id=inv.pk)
        amount = sum((Decimal(i.quantity) * Decimal(i.unit_price) for i in items), ZERO)
        paid = min(Decimal(inv.paid_amount or 0), amount) if inv.payment_method != "credit" else ZERO
        total += amount - paid
    out = Payment.all_objects.filter(supplier=supplier, kind="out").aggregate(t=Sum("amount"))["t"] or ZERO
    return q2(total - out)


def supplier_balances(business, limit=20):
    rows = []
    for s in Supplier.all_objects.filter(business=business):
        bal = supplier_balance(s)
        if bal > 0:
            rows.append({"id": s.id, "name": s.name, "phone": s.phone, "amount": bal})
    rows.sort(key=lambda r: -r["amount"])
    return rows[:limit]


# ───────────────────────── the home page ─────────────────────────

def overview(business, today: datetime.date | None = None):
    today = today or timezone.localdate()
    ensure_chart(business)
    run_recurring(business, today)

    bs = balance_sheet(business, today)
    by_code = {row["code"]: row["amount"] for row in bs["assets"] + bs["liabilities"]}
    month_start = today.replace(day=1)
    month = income_statement(business, month_start, today)

    # this month's expenses grouped the way the customer thinks about them
    spent = {k: ZERO for k in CATEGORY_LABELS}
    for e in Expense.all_objects.filter(business=business, date__gte=month_start, date__lte=today):
        spent[normalize_category(e.category)] += Decimal(e.amount)
    expenses_by_category = [{"key": k, "label": CATEGORY_LABELS[k], "amount": q2(v)} for k, v in spent.items() if v > 0]

    recurring = [{
        "id": r.id, "title": r.title, "category": normalize_category(r.category), "amount": q2(r.amount),
        "day_of_month": r.day_of_month, "payment_method": r.payment_method, "is_active": r.is_active,
        "next_due": next_due(r, today).isoformat(), "start_date": r.start_date.isoformat(),
    } for r in RecurringExpense.all_objects.filter(business=business)]

    return {
        "money": {
            "cash": q2(by_code.get(CASH, ZERO)), "bank": q2(by_code.get(BANK, ZERO)),
            "inventory": q2(by_code.get(INVENTORY, ZERO)),
        },
        "receivable": {"total": q2(by_code.get(RECEIVABLE, ZERO)), "customers": customer_debts(business)},
        "payable": {"total": q2(by_code.get(PAYABLE, ZERO)), "suppliers": supplier_balances(business)},
        "month": {
            "income": q2(month["total_income"]), "expense": q2(month["total_expense"]), "profit": q2(month["net_profit"]),
            "expenses_by_category": expenses_by_category,
        },
        "recurring": recurring,
        "recurring_monthly_total": q2(sum((Decimal(r.amount) for r in RecurringExpense.all_objects.filter(
            business=business, is_active=True)), ZERO)),
        "balanced": bs["balanced"],
        "categories": [{"key": k, "label": label} for k, label, _ in EXPENSE_CATEGORIES],
    }
