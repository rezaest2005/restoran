"""
سال مالی، دوره‌ها، قفل دوره و بستن حساب‌ها در پایان سال.

بستن سال (به روش رایج در ایران):
  ۱) سند بستن حساب‌های موقت: مانده‌ی درآمدها و هزینه‌ها به «خلاصه سود و زیان» و از آن به «سود (زیان) انباشته».
  ۲) سند اختتامیه: همه‌ی حساب‌های دائمی (دارایی، بدهی، سرمایه) با مانده‌ی پایان سال بسته می‌شوند.
  ۳) سند افتتاحیه: همان مانده‌ها در روز اول سال بعد باز می‌شوند.
  اختتامیه و افتتاحیه یکدیگر را خنثی می‌کنند؛ برای دفاتر قانونی‌اند و در محاسبه‌ی مانده‌ها شرکت نمی‌کنند.
  ۴) سال بسته و همه‌ی دوره‌هایش قفل می‌شود؛ سال بعد (اگر نباشد) ساخته می‌شود.

بازکردن سال: اسناد بستن/اختتامیه/افتتاحیه برگشت می‌خورند (هیچ سندی حذف نمی‌شود) و سال دوباره باز می‌شود.
"""

from __future__ import annotations

import calendar
import datetime
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .accounting_services import (
    INCOME_SUMMARY, PERM_KINDS, POSTED, RETAINED_EARNINGS, ZERO, ensure_chart, post_entry, reverse_entry,
)
from .models import Account, AccountingPeriod, FiscalYear, JournalEntry, JournalLine

K = JournalEntry.Kind
# اسناد سیستمی بستن سال: قفل دوره‌ها و حساب‌های غیرفعال‌شده نباید جلویشان را بگیرد
_SYS = {"check_lock": False, "check_active": False}


def _month_periods(start: datetime.date, end: datetime.date):
    out, cur = [], start
    while cur <= end:
        last = datetime.date(cur.year, cur.month, calendar.monthrange(cur.year, cur.month)[1])
        stop = min(last, end)
        out.append({"name": f"{cur.year:04d}-{cur.month:02d}", "start": cur, "end": stop})
        cur = stop + datetime.timedelta(days=1)
    return out


def _validate_periods(periods, start, end):
    """دوره‌ها باید پشت‌سرهم، بدون فاصله و هم‌پوشانی، کل سال را بپوشانند."""
    if not periods:
        raise ValueError("دوره‌ای تعریف نشده است.")
    cur = start
    for p in periods:
        if p["start"] != cur or p["end"] < p["start"]:
            raise ValueError("دوره‌ها باید پشت‌سرهم و بدون فاصله باشند.")
        cur = p["end"] + datetime.timedelta(days=1)
    if cur - datetime.timedelta(days=1) != end:
        raise ValueError("دوره‌ها باید تا پایان سال مالی ادامه داشته باشند.")


@transaction.atomic
def create_fiscal_year(business, name, start, end, periods=None) -> FiscalYear:
    """
    periods: [{"name", "start", "end"}] — برای سال شمسی، دوره‌های ماه شمسی از رابط کاربری می‌آیند؛
    اگر داده نشود، دوره‌ها ماه‌های میلادی‌اند.
    """
    if not name or not start or not end:
        raise ValueError("عنوان و بازه‌ی سال مالی الزامی است.")
    if end <= start:
        raise ValueError("پایان سال مالی باید بعد از شروع آن باشد.")
    if (end - start).days > 400:
        raise ValueError("سال مالی نمی‌تواند بیشتر از ۱۳ ماه باشد.")
    type(business).objects.select_for_update().filter(pk=business.pk).first()
    if FiscalYear.all_objects.filter(business=business, start_date__lte=end, end_date__gte=start).exists():
        raise ValueError("این بازه با سال مالی دیگری هم‌پوشانی دارد.")
    periods = periods or _month_periods(start, end)
    _validate_periods(periods, start, end)
    fy = FiscalYear.all_objects.create(business=business, name=str(name)[:60], start_date=start, end_date=end)
    AccountingPeriod.all_objects.bulk_create([
        AccountingPeriod(business=business, fiscal_year=fy, name=str(p["name"])[:60],
                         start_date=p["start"], end_date=p["end"])
        for p in periods
    ])
    return fy


def set_period_lock(period: AccountingPeriod, locked: bool):
    if not locked and period.fiscal_year.status == FiscalYear.Status.CLOSED:
        raise ValueError("دوره‌های سال مالی بسته را نمی‌توان باز کرد؛ ابتدا سال را باز کنید.")
    period.is_locked = bool(locked)
    period.save(update_fields=["is_locked"])
    return period


def _balances(business, date_to, types, exclude_closing=False):
    """{(account_id, detail_id): net debit} برای حساب‌های از نوع types تا تاریخ."""
    qs = (JournalLine.all_objects.filter(business=business, entry__status=POSTED, entry__date__lte=date_to,
                                         account__type__in=types)
          .exclude(entry__kind__in=PERM_KINDS))
    if exclude_closing:
        qs = qs.exclude(entry__kind=K.CLOSING)
    out = {}
    for r in qs.values("account_id", "detail_id").annotate(d=Sum("debit"), c=Sum("credit")):
        net = (r["d"] or ZERO) - (r["c"] or ZERO)
        if net:
            out[(r["account_id"], r["detail_id"])] = net
    return out


def _mirror_lines(balances, accounts, memo):
    """ردیف‌هایی که هر مانده را صفر می‌کنند."""
    lines = []
    for (acc_id, detail_id), net in sorted(balances.items(), key=lambda kv: accounts[kv[0][0]].code):
        line = {"account": accounts[acc_id], "detail": detail_id, "memo": memo}
        line["credit" if net > 0 else "debit"] = abs(net)
        lines.append(line)
    return lines


def year_preview(fy: FiscalYear):
    """آنچه بستن سال انجام خواهد داد (برای تأیید کاربر)."""
    business = fy.business
    temp = _balances(business, fy.end_date, ["income", "expense"])
    temp = {k: v for k, v in temp.items()}
    # فقط گردش همین سال: مانده‌ی تجمعی حساب‌های موقت تا پایان سال (سال‌های قبل بسته شده‌اند و صفرند)
    profit = -sum(temp.values(), Decimal("0"))
    drafts = JournalEntry.all_objects.filter(business=business, status=JournalEntry.Status.DRAFT,
                                             date__gte=fy.start_date, date__lte=fy.end_date).count()
    return {"net_profit": profit, "temp_accounts": len(temp), "drafts": drafts}


@transaction.atomic
def close_fiscal_year(fy: FiscalYear, user=None, create_next=True):
    business = fy.business
    ensure_chart(business)
    fy = FiscalYear.all_objects.select_for_update().get(pk=fy.pk)
    if fy.status == FiscalYear.Status.CLOSED:
        raise ValueError("این سال مالی قبلاً بسته شده است.")
    earlier_open = FiscalYear.all_objects.filter(business=business, end_date__lt=fy.start_date,
                                                 status=FiscalYear.Status.OPEN).exists()
    if earlier_open:
        raise ValueError("ابتدا سال‌های مالی قبلی را ببندید.")
    if JournalEntry.all_objects.filter(business=business, status=JournalEntry.Status.DRAFT,
                                       date__gte=fy.start_date, date__lte=fy.end_date).exists():
        raise ValueError("در این سال سند پیش‌نویس وجود دارد؛ ابتدا آن‌ها را قطعی یا حذف کنید.")

    accounts = {a.pk: a for a in Account.all_objects.filter(business=business)}
    summary = Account.all_objects.get(business=business, code=INCOME_SUMMARY)
    retained = Account.all_objects.get(business=business, code=RETAINED_EARNINGS)
    end = fy.end_date
    result = {"closing": None, "summary": None, "closing_perm": None, "opening_perm": None, "next_year": None}

    # ۱) حساب‌های موقت → خلاصه سود و زیان
    temp = _balances(business, end, ["income", "expense"])
    if temp:
        lines = _mirror_lines(temp, accounts, "بستن حساب‌های موقت")
        net = sum(temp.values(), Decimal("0"))  # بدهکار خالص موقت = زیان
        line = {"account": summary, "memo": "خلاصه سود و زیان"}
        line["debit" if net > 0 else "credit"] = abs(net)
        if net:
            lines.append(line)
        result["closing"] = post_entry(business, lines, date=end, kind=K.CLOSING, user=user,
                                       description=f"بستن حساب‌های موقت — {fy.name}",
                                       source_type="fy_close", source_id=fy.pk, **_SYS)
    # ۲) خلاصه سود و زیان → سود (زیان) انباشته
    agg = JournalLine.all_objects.filter(business=business, account=summary, entry__status=POSTED,
                                         entry__date__lte=end).exclude(entry__kind__in=PERM_KINDS) \
        .aggregate(d=Sum("debit"), c=Sum("credit"))
    s_net = (agg["d"] or ZERO) - (agg["c"] or ZERO)
    if s_net:
        a = {"account": summary, "memo": "انتقال به سود انباشته"}
        b = {"account": retained, "memo": "سود (زیان) سال"}
        if s_net > 0:  # زیان
            a["credit"], b["debit"] = s_net, s_net
        else:
            a["debit"], b["credit"] = -s_net, -s_net
        result["summary"] = post_entry(business, [a, b], date=end, kind=K.CLOSING, user=user,
                                       description=f"انتقال سود (زیان) سال — {fy.name}",
                                       source_type="fy_summary", source_id=fy.pk, **_SYS)
    # ۳) اختتامیه و ۴) افتتاحیه
    perm = _balances(business, end, ["asset", "liability", "equity"])
    next_start = end + datetime.timedelta(days=1)
    if perm:
        close_lines = _mirror_lines(perm, accounts, "اختتامیه")
        result["closing_perm"] = post_entry(business, close_lines, date=end, kind=K.CLOSING_PERM, user=user,
                                            description=f"سند اختتامیه — {fy.name}",
                                            source_type="fy_closing_perm", source_id=fy.pk, **_SYS)
        open_lines = [{**ln, "debit": ln.get("credit", 0), "credit": ln.get("debit", 0), "memo": "افتتاحیه"}
                      for ln in close_lines]
        result["opening_perm"] = post_entry(business, open_lines, date=next_start, kind=K.OPENING_PERM, user=user,
                                            description=f"سند افتتاحیه — پس از {fy.name}",
                                            source_type="fy_opening_perm", source_id=fy.pk, **_SYS)
    # ۵) سال بعد
    if create_next and not FiscalYear.all_objects.filter(business=business, start_date=next_start).exists():
        length = fy.end_date - fy.start_date
        nxt_end = next_start + length
        if not FiscalYear.all_objects.filter(business=business, start_date__lte=nxt_end,
                                             end_date__gte=next_start).exists():
            result["next_year"] = create_fiscal_year(business, f"{fy.name} +1", next_start, nxt_end)

    fy.status = FiscalYear.Status.CLOSED
    fy.closed_at = timezone.now()
    fy.save(update_fields=["status", "closed_at"])
    AccountingPeriod.all_objects.filter(fiscal_year=fy).update(is_locked=True)
    return result


@transaction.atomic
def reopen_fiscal_year(fy: FiscalYear, user=None):
    business = fy.business
    fy = FiscalYear.all_objects.select_for_update().get(pk=fy.pk)
    if fy.status != FiscalYear.Status.CLOSED:
        raise ValueError("این سال مالی باز است.")
    if FiscalYear.all_objects.filter(business=business, start_date__gt=fy.end_date,
                                     status=FiscalYear.Status.CLOSED).exists():
        raise ValueError("سال مالی بعدی بسته است؛ ابتدا آن را باز کنید.")
    fy.status = FiscalYear.Status.OPEN
    fy.closed_at = None
    fy.save(update_fields=["status", "closed_at"])
    AccountingPeriod.all_objects.filter(fiscal_year=fy).update(is_locked=False)
    for st in ("fy_opening_perm", "fy_closing_perm", "fy_summary", "fy_close"):
        e = JournalEntry.all_objects.filter(business=business, source_type=st, source_id=fy.pk).first()
        if e is None:
            continue
        if JournalEntry.all_objects.filter(reversal_of=e).exists():
            continue
        # برگشت در همان تاریخ سند اصلی تا مانده‌های پایان سال دقیقاً به حالت پیش از بستن برگردد
        reverse_entry(e, user=user, date=e.date, reason="بازکردن سال مالی", check_lock=False)
        # کلید منبع آزاد می‌شود تا بستن دوباره ممکن باشد
        n = JournalEntry.all_objects.filter(business=business, source_id=fy.pk,
                                            source_type__startswith=f"{st}_v").count() + 1
        JournalEntry.all_objects.filter(pk=e.pk).update(source_type=f"{st}_v{n}")
    return fy
