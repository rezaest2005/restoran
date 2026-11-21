"""
گزارش‌های حسابداری حرفه‌ای (فقط اسناد قطعی؛ پیش‌نویس‌ها و اختتامیه/افتتاحیه حساب نمی‌شوند):

  journal_book       دفتر روزنامه
  trial_balance_ext  تراز آزمایشی ۲/۴/۶ ستونی در سطح گروه/کل/معین/تفصیلی
  cash_flow          صورت جریان وجوه نقد (روش مستقیم، بر اساس طرف مقابل ردیف‌های صندوق/بانک)
  aging              سن بدهی/طلب اشخاص (FIFO)
  party_balances     مانده‌ی دریافتنی/پرداختنی هر شخص
  vat_report         گزارش مالیات بر ارزش افزوده
  budget_vs_actual   بودجه در برابر عملکرد
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from decimal import Decimal

from django.db.models import Sum

from .accounting_services import POSTED, ZERO, _lines_qs, q2
from .models import Account, Budget, BudgetLine, DetailAccount, JournalEntry, JournalLine

CASH_ROLES = ("cash", "bank")
RECEIVABLE_ROLES = ("receivable", "notes_receivable", "cheques_in_collection", "bounced_cheques")
PAYABLE_ROLES = ("payable", "notes_payable")
LEVELS = ("group", "ledger", "subsidiary", "detail")


def _accounts(business):
    return {a.pk: a for a in Account.all_objects.filter(business=business)}


def account_level(acc, by_id) -> str:
    """گروه = ریشه؛ حساب قابل ثبت = معین؛ حساب گروهیِ میانی = کل."""
    if acc.parent_id is None:
        return "group"
    return "subsidiary" if acc.is_postable else "ledger"


def _ancestor_at(acc, by_id, level):
    """نزدیک‌ترین حساب (خود یا والد) در سطح خواسته‌شده؛ اگر نباشد، نزدیک‌ترین بالاتر."""
    chain = []
    cur = acc
    while cur is not None:
        chain.append(cur)
        cur = by_id.get(cur.parent_id)
    if level == "group":
        return chain[-1]
    if level == "ledger":
        for a in chain:
            if account_level(a, by_id) == "ledger":
                return a
        return chain[-1] if len(chain) == 1 else chain[0]
    return acc


# ───────────────────────── دفتر روزنامه ─────────────────────────

def journal_book(business, date_from=None, date_to=None, limit=3000):
    qs = JournalEntry.all_objects.filter(business=business, status=POSTED)
    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    entries = list(qs.order_by("date", "number")[:limit])
    lines = defaultdict(list)
    for l in (JournalLine.all_objects.filter(entry__in=entries)
              .select_related("account", "detail", "cost_center").order_by("id")):
        lines[l.entry_id].append({
            "code": l.account.code, "account": l.account.name, "detail": l.detail.name if l.detail else "",
            "memo": l.memo, "debit": l.debit, "credit": l.credit,
        })
    out, t_d, t_c = [], ZERO, ZERO
    for e in entries:
        ls = lines.get(e.pk, [])
        d = sum((x["debit"] for x in ls), ZERO)
        c = sum((x["credit"] for x in ls), ZERO)
        t_d += d
        t_c += c
        out.append({"id": e.pk, "number": e.number, "date": e.date, "description": e.description,
                    "reference": e.reference, "kind": e.kind, "lines": ls, "debit": d, "credit": c})
    return {"entries": out, "total_debit": t_d, "total_credit": t_c, "truncated": qs.count() > limit}


# ───────────────────────── تراز آزمایشی ─────────────────────────

def _split(net):
    return (net, ZERO) if net >= 0 else (ZERO, -net)


def trial_balance_ext(business, date_from=None, date_to=None, level="subsidiary", exclude_closing=False,
                      hide_zero=True):
    """
    هر ردیف: مانده‌ی ابتدای دوره (بدهکار/بستانکار)، گردش دوره، مانده‌ی پایان دوره.
    ستون‌های ۲ = فقط مانده‌ی پایان؛ ۴ = گردش + مانده؛ ۶ = ابتدا + گردش + پایان (انتخاب ستون‌ها با رابط کاربری).
    """
    if level not in LEVELS:
        level = "subsidiary"
    by_id = _accounts(business)
    group_keys = ["account_id", "detail_id"] if level == "detail" else ["account_id"]

    def sums(qs):
        return {tuple(r[k] for k in group_keys): (r["d"] or ZERO, r["c"] or ZERO)
                for r in qs.values(*group_keys).annotate(d=Sum("debit"), c=Sum("credit"))}

    opening = sums(_lines_qs(business, before=date_from, exclude_closing=exclude_closing)) if date_from else {}
    period = sums(_lines_qs(business, date_from, date_to, exclude_closing=exclude_closing))
    details = {d.pk: d for d in DetailAccount.all_objects.filter(business=business)} if level == "detail" else {}

    agg = {}
    for key in set(opening) | set(period):
        acc = by_id[key[0]]
        target = acc if level == "detail" else _ancestor_at(acc, by_id, level)
        rk = (target.pk, key[1]) if level == "detail" else (target.pk,)
        row = agg.setdefault(rk, [ZERO, ZERO, ZERO, ZERO])
        od, oc = opening.get(key, (ZERO, ZERO))
        pd, pc = period.get(key, (ZERO, ZERO))
        row[0] += od
        row[1] += oc
        row[2] += pd
        row[3] += pc

    rows = []
    tot = defaultdict(lambda: ZERO)
    for rk, (od, oc, pd, pc) in agg.items():
        acc = by_id[rk[0]]
        o_d, o_c = _split(od - oc)
        c_d, c_c = _split(od - oc + pd - pc)
        if hide_zero and not (o_d or o_c or pd or pc or c_d or c_c):
            continue
        det = details.get(rk[1]) if level == "detail" and len(rk) > 1 else None
        row = {
            "account_id": acc.pk, "code": acc.code, "name": acc.name, "type": acc.type,
            "level": account_level(acc, by_id),
            "detail_id": det.pk if det else None, "detail_code": det.code if det else "",
            "detail_name": det.name if det else "",
            "opening_debit": o_d, "opening_credit": o_c, "debit": pd, "credit": pc,
            "balance_debit": c_d, "balance_credit": c_c,
        }
        rows.append(row)
        for k in ("opening_debit", "opening_credit", "debit", "credit", "balance_debit", "balance_credit"):
            tot[k] += row[k]
    rows.sort(key=lambda r: (r["code"], r["detail_code"]))
    totals = {k: tot[k] for k in ("opening_debit", "opening_credit", "debit", "credit", "balance_debit",
                                  "balance_credit")}
    return {"level": level, "rows": rows, "totals": totals,
            "balanced": totals["balance_debit"] == totals["balance_credit"] and totals["debit"] == totals["credit"]}


# ───────────────────────── جریان وجوه نقد ─────────────────────────

def cash_flow_section(acc, by_id) -> str:
    """طبقه‌بندی طرف مقابل: سرمایه‌گذاری (دارایی ثابت)، تأمین مالی (سرمایه، تسهیلات، بدهی غیرجاری)، بقیه عملیاتی."""
    if acc.type == Account.Type.EQUITY or acc.role == "loan":
        return "financing"
    if acc.role == "fixed_asset":
        return "investing"
    root = acc
    while root.parent_id and by_id.get(root.parent_id):
        parent = by_id[root.parent_id]
        if parent.role == "fixed_asset":
            return "investing"
        if parent.code == "2200":
            return "financing"
        root = parent
    return "operating"


def cash_flow(business, date_from=None, date_to=None):
    by_id = _accounts(business)
    cash_ids = {pk for pk, a in by_id.items() if a.role in CASH_ROLES and a.is_postable}
    opening = ZERO
    if date_from:
        agg = _lines_qs(business, before=date_from).filter(account_id__in=cash_ids).aggregate(
            d=Sum("debit"), c=Sum("credit"))
        opening = (agg["d"] or ZERO) - (agg["c"] or ZERO)
    base = _lines_qs(business, date_from, date_to, exclude_closing=True)
    entry_ids = base.filter(account_id__in=cash_ids).values("entry_id")
    lines = list(base.filter(entry_id__in=entry_ids).values("entry_id", "account_id", "debit", "credit"))
    by_entry = defaultdict(list)
    for l in lines:
        by_entry[l["entry_id"]].append(l)
    buckets = {"operating": defaultdict(lambda: ZERO), "investing": defaultdict(lambda: ZERO),
               "financing": defaultdict(lambda: ZERO)}
    for ls in by_entry.values():
        cash_net = sum((l["debit"] - l["credit"] for l in ls if l["account_id"] in cash_ids), ZERO)
        others = [l for l in ls if l["account_id"] not in cash_ids]
        if not cash_net or not others:
            continue  # انتقال بین صندوق و بانک: جریان خالص ندارد
        # سهم هر طرف مقابل به نسبت مبلغش (برای اسناد چندردیفی مثل فروش + بهای تمام‌شده)
        weight = {}
        for l in others:
            v = l["credit"] - l["debit"]  # طرف مقابلِ ورود وجه بستانکار است
            if (v > 0) == (cash_net > 0) and v:
                weight[l["account_id"]] = weight.get(l["account_id"], ZERO) + v
        total_w = sum(weight.values(), ZERO)
        if not total_w:
            continue
        allocated = ZERO
        items = list(weight.items())
        for i, (acc_id, w) in enumerate(items):
            share = cash_net - allocated if i == len(items) - 1 else q2(cash_net * w / total_w)
            allocated += share
            acc = by_id[acc_id]
            buckets[cash_flow_section(acc, by_id)][acc_id] += share
    sections = {}
    net = ZERO
    for sec, items in buckets.items():
        rows = sorted(({"code": by_id[k].code, "name": by_id[k].name, "amount": v} for k, v in items.items() if v),
                      key=lambda r: r["code"])
        total = sum((r["amount"] for r in rows), ZERO)
        net += total
        sections[sec] = {"rows": rows, "total": total}
    return {"opening": opening, "sections": sections, "net_change": net, "closing": opening + net}


# ───────────────────────── اشخاص: مانده و سن بدهی ─────────────────────────

def _party_lines(business, roles, as_of=None):
    qs = _lines_qs(business, None, as_of).filter(account__role__in=roles)
    return qs


def party_balances(business, side="receivable", as_of=None):
    """مانده‌ی هر حساب تفصیلی روی حساب‌های دریافتنی (یا پرداختنی). ردیف‌های بدون تفصیلی جدا جمع می‌شوند."""
    roles = RECEIVABLE_ROLES if side == "receivable" else PAYABLE_ROLES
    sign = 1 if side == "receivable" else -1
    details = {d.pk: d for d in DetailAccount.all_objects.filter(business=business)}
    rows = []
    total = ZERO
    agg = defaultdict(lambda: {"open": ZERO, "cheques": ZERO})
    for r in (_party_lines(business, roles, as_of).values("detail_id", "account__role")
              .annotate(d=Sum("debit"), c=Sum("credit"))):
        v = sign * ((r["d"] or ZERO) - (r["c"] or ZERO))
        key = "open" if r["account__role"] in ("receivable", "payable") else "cheques"
        agg[r["detail_id"]][key] += v
    for detail_id, v in agg.items():
        bal = v["open"] + v["cheques"]
        if not bal and not v["cheques"]:
            continue
        d = details.get(detail_id)
        rows.append({"detail_id": detail_id, "code": d.code if d else "", "name": d.name if d else "",
                     "kind": d.kind if d else "", "phone": d.phone if d else "",
                     "open": v["open"], "cheques": v["cheques"], "balance": bal,
                     "credit_limit": d.credit_limit if d else ZERO,
                     "over_limit": bool(d and d.credit_limit and bal > d.credit_limit)})
        total += bal
    rows.sort(key=lambda r: -r["balance"])
    return {"side": side, "rows": rows, "total": total}


def aging(business, side="receivable", as_of=None, buckets=(30, 60, 90)):
    """
    سن مطالبات/بدهی‌ها (FIFO): پرداخت‌ها ابتدا قدیمی‌ترین بدهی‌ها را تسویه می‌کنند، پس مانده‌ی باز
    مربوط به جدیدترین ردیف‌هاست. فقط حساب دریافتنی/پرداختنی اصلی (نه چک‌ها).
    """
    as_of = as_of or datetime.date.today()
    role = "receivable" if side == "receivable" else "payable"
    sign = 1 if side == "receivable" else -1
    details = {d.pk: d for d in DetailAccount.all_objects.filter(business=business)}
    per = defaultdict(list)
    for l in (_party_lines(business, (role,), as_of).values("detail_id", "entry__date", "debit", "credit")
              .order_by("entry__date", "id")):
        per[l["detail_id"]].append((l["entry__date"], sign * (l["debit"] - l["credit"])))
    labels = [f"0-{buckets[0]}"] + [f"{buckets[i] + 1}-{buckets[i + 1]}" for i in range(len(buckets) - 1)] + \
             [f"{buckets[-1]}+"]
    rows = []
    totals = [ZERO] * len(labels)
    for detail_id, items in per.items():
        balance = sum((v for _, v in items), ZERO)
        if balance <= 0:
            continue
        # از جدیدترین ردیف‌های افزایشی به عقب، تا مانده پوشش داده شود
        remaining = balance
        amounts = [ZERO] * len(labels)
        for date, v in reversed(items):
            if v <= 0 or remaining <= 0:
                continue
            part = min(v, remaining)
            remaining -= part
            age = (as_of - date).days
            idx = next((i for i, b in enumerate(buckets) if age <= b), len(buckets))
            amounts[idx] += part
        if remaining > 0:
            amounts[-1] += remaining
        d = details.get(detail_id)
        rows.append({"detail_id": detail_id, "code": d.code if d else "", "name": d.name if d else "",
                     "balance": balance, "buckets": amounts})
        totals = [a + b for a, b in zip(totals, amounts)]
    rows.sort(key=lambda r: -r["balance"])
    return {"side": side, "as_of": as_of, "labels": labels, "rows": rows, "totals": totals,
            "total": sum(totals, ZERO)}


# ───────────────────────── مالیات بر ارزش افزوده ─────────────────────────

def vat_report(business, date_from=None, date_to=None):
    """مالیات فروش (بستانکار حساب‌های vat_out) منهای مالیات خرید (بدهکار حساب‌های vat_in) = بدهی مالیاتی دوره."""
    def side(role, sign):
        rows, tax, base = [], ZERO, ZERO
        qs = (_lines_qs(business, date_from, date_to).filter(account__role=role)
              .select_related("entry", "detail").order_by("entry__date", "entry__number"))
        for l in qs:
            amount = sign * (l.credit - l.debit)
            tax += amount
            base += l.tax_base or ZERO
            rows.append({"date": l.entry.date, "number": l.entry.number, "entry_id": l.entry_id,
                         "description": l.memo or l.entry.description, "party": l.detail.name if l.detail else "",
                         "base": l.tax_base, "tax": amount})
        return {"rows": rows, "tax": tax, "base": base}

    sales = side("vat_out", 1)
    purchases = side("vat_in", -1)
    return {"sales": sales, "purchases": purchases, "payable": sales["tax"] - purchases["tax"]}


# ───────────────────────── بودجه ─────────────────────────

def budget_vs_actual(budget: Budget):
    business = budget.business
    by_id = _accounts(business)
    rows = []
    t_b = t_a = ZERO
    for bl in BudgetLine.all_objects.filter(budget=budget).select_related("account", "cost_center"):
        from .accounting_services import descendant_ids
        ids = descendant_ids(business, bl.account)
        qs = _lines_qs(business, budget.start_date, budget.end_date, exclude_closing=True).filter(account_id__in=ids)
        if bl.cost_center_id:
            qs = qs.filter(cost_center_id=bl.cost_center_id)
        agg = qs.aggregate(d=Sum("debit"), c=Sum("credit"))
        d, c = agg["d"] or ZERO, agg["c"] or ZERO
        acc = by_id[bl.account_id]
        actual = (d - c) if acc.normal_debit else (c - d)
        variance = bl.amount - actual
        pct = (actual / bl.amount * 100).quantize(Decimal("0.1")) if bl.amount else None
        rows.append({"id": bl.pk, "account_id": acc.pk, "code": acc.code, "name": acc.name, "type": acc.type,
                     "cost_center": bl.cost_center.name if bl.cost_center else "",
                     "cost_center_id": bl.cost_center_id,
                     "budget": bl.amount, "actual": actual, "variance": variance, "percent": pct})
        t_b += bl.amount
        t_a += actual
    return {"id": budget.pk, "name": budget.name, "start_date": budget.start_date, "end_date": budget.end_date,
            "rows": rows, "total_budget": t_b, "total_actual": t_a, "total_variance": t_b - t_a}
