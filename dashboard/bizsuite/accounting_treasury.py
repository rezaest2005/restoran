"""
خزانه‌داری: بانک‌ها و صندوق‌ها، انتقال وجه، مغایرت‌گیری بانکی و چک‌های دریافتنی/پرداختنی.

هر بانک/صندوق یک حساب تفصیلی است روی حساب معین «صندوق» یا «بانک»؛ پس ثبت‌های خودکار قدیمی (بدون تفصیلی)
همچنان روی همان معین می‌نشینند و چیزی خراب نمی‌شود.

چرخه‌ی چک دریافتنی:
    نزد صندوق ──واگذاری به بانک──▶ در جریان وصول ──وصول──▶ وصول‌شده
        │  └──وصول مستقیم──▶ وصول‌شده        └──برگشت──▶ برگشتی ──عودت به صاحب──▶ عودت
        ├──خرج (واگذاری به شخص ثالث)──▶ خرج‌شده          ├──واگذاری مجدد──▶ در جریان وصول
        └──عودت──▶ عودت                                  └──وصول بعدی──▶ وصول‌شده
چرخه‌ی چک پرداختنی:
    صادرشده ──پاس──▶ پاس‌شده  |  صادرشده ──برگشت (کسری موجودی)──▶ برگشتی ──پاس/عودت  |  صادرشده ──ابطال/عودت──▶ عودت
"""

from __future__ import annotations

import datetime
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum

from .accounting_services import (
    BANK, BANK_CHARGES, BOUNCED_CHEQUES, CAPITAL, CASH, CHEQUES_IN_COLLECTION, NOTES_PAYABLE,
    NOTES_RECEIVABLE, PAYABLE, POSTED, RECEIVABLE, ZERO, create_detail, ensure_chart, get_account, post_entry, q2,
    reverse_entry,
)
from .models import (
    Account, BankStatementLine, Cheque, ChequeEvent, DetailAccount, JournalEntry, JournalLine, MoneyAccount,
    MoneyTransfer,
)

S = Cheque.Status


# ───────────────────────── بانک و صندوق ─────────────────────────

@transaction.atomic
def create_money_account(business, kind, name, gl_account=None, opening_balance=0, opening_date=None, user=None,
                         **fields) -> MoneyAccount:
    ensure_chart(business)
    if kind not in MoneyAccount.Kind.values:
        raise ValueError("نوع بانک/صندوق نامعتبر است.")
    name = str(name or "").strip()[:120]
    if not name:
        raise ValueError("نام بانک/صندوق الزامی است.")
    gl = get_account(business, gl_account) if gl_account else get_account(business, CASH if kind == "cash" else BANK)
    if not gl.is_postable or gl.type != Account.Type.ASSET:
        raise ValueError("حساب معین بانک/صندوق باید یک حساب دارایی قابل ثبت باشد.")
    detail = create_detail(business, name, kind="cash" if kind == "cash" else "bank")
    ma = MoneyAccount.all_objects.create(business=business, kind=kind, name=name, gl_account=gl, detail=detail,
                                         **{k: str(v or "")[:80] for k, v in fields.items()})
    amount = q2(opening_balance)
    if amount < 0:
        raise ValueError("موجودی اول نمی‌تواند منفی باشد.")
    if amount > 0:
        post_entry(business, [
            {"account": gl, "detail": detail, "debit": amount, "memo": "موجودی اول"},
            {"account": CAPITAL, "credit": amount, "memo": name},
        ], date=opening_date, description=f"موجودی اول — {name}", source_type="money_opening",
            source_id=ma.pk, user=user)
    return ma


def money_balance(ma: MoneyAccount, as_of=None) -> Decimal:
    qs = JournalLine.all_objects.filter(business=ma.business, account=ma.gl_account, detail=ma.detail,
                                        entry__status=POSTED).exclude(entry__kind__in=("closing_perm", "opening_perm"))
    if as_of:
        qs = qs.filter(entry__date__lte=as_of)
    agg = qs.aggregate(d=Sum("debit"), c=Sum("credit"))
    return q2((agg["d"] or ZERO) - (agg["c"] or ZERO))


def unassigned_balances(business):
    """مانده‌ی صندوق/بانک بدون تفصیلی (مثلاً فروش‌های صندوق فروش) — تا کاربر بداند پولی بی‌صاحب نمانده."""
    out = {}
    for code in (CASH, BANK):
        agg = (JournalLine.all_objects.filter(business=business, account__code=code, detail__isnull=True,
                                              entry__status=POSTED)
               .exclude(entry__kind__in=("closing_perm", "opening_perm")).aggregate(d=Sum("debit"), c=Sum("credit")))
        out[code] = q2((agg["d"] or ZERO) - (agg["c"] or ZERO))
    return out


def _check_ma(business, ma):
    if ma.business_id != business.pk:
        raise ValueError("بانک/صندوق متعلق به این کسب‌وکار نیست.")
    if not ma.is_active:
        raise ValueError(f"«{ma.name}» غیرفعال است.")


@transaction.atomic
def transfer(business, source: MoneyAccount, target: MoneyAccount, amount, fee=0, date=None, reference="",
             note="", user=None) -> MoneyTransfer:
    _check_ma(business, source)
    _check_ma(business, target)
    if source.pk == target.pk:
        raise ValueError("مبدأ و مقصد انتقال یکی است.")
    amount, fee = q2(amount), q2(fee)
    if amount <= 0 or fee < 0:
        raise ValueError("مبلغ انتقال نامعتبر است.")
    tr = MoneyTransfer.all_objects.create(business=business, source=source, target=target, amount=amount, fee=fee,
                                          date=date or datetime.date.today(), reference=str(reference)[:60],
                                          note=str(note)[:300])
    lines = [
        {"account": target.gl_account, "detail": target.detail, "debit": amount, "memo": f"از {source.name}"},
        {"account": source.gl_account, "detail": source.detail, "credit": amount + fee, "memo": f"به {target.name}"},
    ]
    if fee > 0:
        lines.append({"account": BANK_CHARGES, "debit": fee, "memo": "کارمزد انتقال"})
    tr.entry = post_entry(business, lines, date=tr.date, description=f"انتقال وجه {source.name} ← {target.name}",
                          source_type="transfer", source_id=tr.pk, reference=reference, user=user)
    tr.save(update_fields=["entry"])
    return tr


@transaction.atomic
def cancel_transfer(tr: MoneyTransfer, user=None):
    if tr.entry_id is None:
        raise ValueError("این انتقال سندی ندارد.")
    if JournalEntry.all_objects.filter(reversal_of_id=tr.entry_id).exists():
        raise ValueError("این انتقال قبلاً ابطال شده است.")
    return reverse_entry(tr.entry, user=user, reason="ابطال انتقال وجه")


# ───────────────────────── مغایرت بانکی ─────────────────────────

def _book_lines(ma: MoneyAccount):
    return (JournalLine.all_objects.filter(business=ma.business, account=ma.gl_account, detail=ma.detail,
                                           entry__status=POSTED)
            .exclude(entry__kind__in=("closing_perm", "opening_perm")))


def import_statement(ma: MoneyAccount, rows) -> int:
    """rows: [{"date": date, "amount": Decimal(+واریز/−برداشت), "description", "reference"}]"""
    objs = []
    for r in rows:
        amount = q2(r.get("amount"))
        if not amount or not r.get("date"):
            continue
        objs.append(BankStatementLine(business=ma.business, money_account=ma, date=r["date"], amount=amount,
                                      description=str(r.get("description") or "")[:300],
                                      reference=str(r.get("reference") or "")[:60]))
    BankStatementLine.all_objects.bulk_create(objs)
    return len(objs)


@transaction.atomic
def auto_match(ma: MoneyAccount, window_days=5) -> int:
    """تطبیق خودکار: مبلغ برابر و نزدیک‌ترین تاریخ در بازه‌ی ±window_days روز."""
    matched_ids = set(BankStatementLine.all_objects.filter(money_account=ma, matched_line__isnull=False)
                      .values_list("matched_line_id", flat=True))
    book = [l for l in _book_lines(ma).select_related("entry") if l.pk not in matched_ids]
    n = 0
    for st in BankStatementLine.all_objects.filter(money_account=ma, matched_line__isnull=True).order_by("date", "id"):
        best, best_gap = None, None
        for l in book:
            signed = l.debit - l.credit
            if signed != st.amount:
                continue
            gap = abs((l.entry.date - st.date).days)
            if gap <= window_days and (best_gap is None or gap < best_gap):
                best, best_gap = l, gap
        if best is not None:
            st.matched_line = best
            st.save(update_fields=["matched_line"])
            book.remove(best)
            n += 1
    return n


def match_line(st: BankStatementLine, line: JournalLine):
    ma = st.money_account
    if line.business_id != ma.business_id or line.account_id != ma.gl_account_id or line.detail_id != ma.detail_id:
        raise ValueError("این ردیف سند مربوط به این حساب بانکی نیست.")
    if line.entry.status != POSTED:
        raise ValueError("فقط ردیف اسناد قطعی تطبیق داده می‌شود.")
    if line.debit - line.credit != st.amount:
        raise ValueError("مبلغ ردیف سند با ردیف صورت‌حساب برابر نیست.")
    if BankStatementLine.all_objects.filter(matched_line=line).exclude(pk=st.pk).exists():
        raise ValueError("این ردیف سند قبلاً تطبیق داده شده است.")
    st.matched_line = line
    st.save(update_fields=["matched_line"])
    return st


def reconciliation(ma: MoneyAccount, statement_balance=None, as_of=None):
    """خلاصه‌ی مغایرت: مانده‌ی دفاتر، ردیف‌های تطبیق‌نشده‌ی دو طرف و اختلاف."""
    stmt = list(BankStatementLine.all_objects.filter(money_account=ma).select_related("matched_line__entry"))
    matched_ids = {s.matched_line_id for s in stmt if s.matched_line_id}
    book_qs = _book_lines(ma).select_related("entry")
    if as_of:
        book_qs = book_qs.filter(entry__date__lte=as_of)
    unmatched_book = [{
        "id": l.pk, "date": l.entry.date, "number": l.entry.number, "entry_id": l.entry_id,
        "description": l.memo or l.entry.description, "amount": l.debit - l.credit,
    } for l in book_qs.order_by("entry__date", "id") if l.pk not in matched_ids]
    book_balance = money_balance(ma, as_of)
    stmt_rows = [{
        "id": s.pk, "date": s.date, "description": s.description, "reference": s.reference, "amount": s.amount,
        "matched_line_id": s.matched_line_id,
        "matched_number": s.matched_line.entry.number if s.matched_line_id else None,
    } for s in stmt]
    out = {
        "book_balance": book_balance,
        "statement_rows": stmt_rows,
        "unmatched_book": unmatched_book,
        "unmatched_statement_total": q2(sum((s.amount for s in stmt if not s.matched_line_id), ZERO)),
        "unmatched_book_total": q2(sum((r["amount"] for r in unmatched_book), ZERO)),
    }
    if statement_balance is not None:
        sb = q2(statement_balance)
        # مانده‌ی بانک + اقلام دفاتر که هنوز به بانک نرسیده − اقلام بانک که هنوز در دفاتر ثبت نشده = مانده‌ی دفاتر
        adjusted = sb + out["unmatched_book_total"] - out["unmatched_statement_total"]
        out.update({"statement_balance": sb, "adjusted_statement": adjusted, "difference": book_balance - adjusted})
    return out


# ───────────────────────── چک ─────────────────────────

def _party_line(account, party, side, amount, memo):
    return {"account": account, "detail": party, side: amount, "memo": memo}


@transaction.atomic
def register_cheque(business, direction, party: DetailAccount, number, amount, issue_date, due_date,
                    counter_account=None, money_account: MoneyAccount | None = None, user=None, **fields) -> Cheque:
    """
    ثبت چک دریافتی: بدهکار اسناد دریافتنی / بستانکار حساب طرف (پیش‌فرض دریافتنی مشتریان).
    ثبت چک صادره:   بدهکار حساب طرف (پیش‌فرض پرداختنی) / بستانکار اسناد پرداختنی — حساب بانکی الزامی است.
    """
    ensure_chart(business)
    if direction not in Cheque.Direction.values:
        raise ValueError("نوع چک نامعتبر است.")
    if party is None or party.business_id != business.pk:
        raise ValueError("طرف حساب چک را انتخاب کنید.")
    number = str(number or "").strip()[:30]
    if not number:
        raise ValueError("شماره چک الزامی است.")
    amount = q2(amount)
    if amount <= 0:
        raise ValueError("مبلغ چک باید بیشتر از صفر باشد.")
    if not issue_date or not due_date:
        raise ValueError("تاریخ دریافت/صدور و سررسید الزامی است.")
    sayad = str(fields.pop("sayad_id", "") or "").strip()
    if sayad and (not sayad.isdigit() or len(sayad) != 16):
        raise ValueError("شناسه‌ی صیادی باید ۱۶ رقم باشد.")
    if direction == "issued":
        if money_account is None:
            raise ValueError("حساب بانکی چک صادره را انتخاب کنید.")
        _check_ma(business, money_account)
    elif money_account is not None:
        _check_ma(business, money_account)
    dup = Cheque.all_objects.filter(business=business, direction=direction, number=number,
                                    bank_name=str(fields.get("bank_name") or "")[:80])
    if dup.exclude(status=S.RETURNED).exists():
        raise ValueError("چکی با همین شماره و بانک قبلاً ثبت شده است.")
    ch = Cheque.all_objects.create(
        business=business, direction=direction, party=party, number=number, amount=amount, issue_date=issue_date,
        due_date=due_date, money_account=money_account, sayad_id=sayad, created_by=user,
        **{k: str(v or "")[:300 if k == "note" else 80] for k, v in fields.items()},
    )
    if direction == "received":
        counter = get_account(business, counter_account or RECEIVABLE)
        lines = [_party_line(NOTES_RECEIVABLE, party, "debit", amount, f"چک {number}"),
                 _party_line(counter, party, "credit", amount, f"چک {number}")]
        desc = f"دریافت چک {number} — {party.name}"
    else:
        counter = get_account(business, counter_account or PAYABLE)
        lines = [_party_line(counter, party, "debit", amount, f"چک {number}"),
                 _party_line(NOTES_PAYABLE, party, "credit", amount, f"چک {number}")]
        desc = f"صدور چک {number} — {party.name}"
    entry = post_entry(business, lines, date=issue_date, description=desc, source_type="cheque",
                       source_id=ch.pk, reference=number, user=user)
    ChequeEvent.all_objects.create(business=business, cheque=ch, from_status="", to_status=S.IN_HAND,
                                   date=issue_date, entry=entry)
    return ch


# (جهت, از وضعیت, به وضعیت) → سازنده‌ی ردیف‌ها
def _transition_lines(ch: Cheque, to_status, money_account, endorsed_to):
    p, amt, num = ch.party, ch.amount, f"چک {ch.number}"
    bank = (lambda side: {"account": money_account.gl_account, "detail": money_account.detail, side: amt, "memo": num})
    frm = ch.status
    if ch.direction == "received":
        holding = {S.IN_HAND: NOTES_RECEIVABLE, S.DEPOSITED: CHEQUES_IN_COLLECTION, S.BOUNCED: BOUNCED_CHEQUES}
        rules = {
            (S.IN_HAND, S.DEPOSITED), (S.IN_HAND, S.CLEARED), (S.IN_HAND, S.BOUNCED), (S.IN_HAND, S.ENDORSED),
            (S.IN_HAND, S.RETURNED), (S.DEPOSITED, S.CLEARED), (S.DEPOSITED, S.BOUNCED),
            (S.BOUNCED, S.DEPOSITED), (S.BOUNCED, S.CLEARED), (S.BOUNCED, S.RETURNED),
        }
        if (frm, to_status) not in rules:
            raise ValueError("این تغییر وضعیت برای چک دریافتنی مجاز نیست.")
        credit = _party_line(holding[frm], p, "credit", amt, num)
        if to_status == S.DEPOSITED:
            return [_party_line(CHEQUES_IN_COLLECTION, p, "debit", amt, num), credit]
        if to_status == S.CLEARED:
            return [bank("debit"), credit]
        if to_status == S.BOUNCED:
            return [_party_line(BOUNCED_CHEQUES, p, "debit", amt, num), credit]
        if to_status == S.ENDORSED:
            return [_party_line(PAYABLE, endorsed_to, "debit", amt, f"{num} — از {p.name}"), credit]
        if to_status == S.RETURNED:
            return [_party_line(RECEIVABLE, p, "debit", amt, f"عودت {num}"), credit]
    else:
        rules = {(S.IN_HAND, S.CLEARED), (S.IN_HAND, S.BOUNCED), (S.IN_HAND, S.RETURNED),
                 (S.BOUNCED, S.CLEARED), (S.BOUNCED, S.RETURNED)}
        if (frm, to_status) not in rules:
            raise ValueError("این تغییر وضعیت برای چک پرداختنی مجاز نیست.")
        debit = _party_line(NOTES_PAYABLE, p, "debit", amt, num)
        if to_status == S.CLEARED:
            return [debit, bank("credit")]
        if to_status == S.BOUNCED:
            return None  # چک ما برگشت خورد: بدهی همچنان در اسناد پرداختنی می‌ماند
        if to_status == S.RETURNED:
            return [debit, _party_line(PAYABLE, p, "credit", amt, f"عودت {num}")]
    raise ValueError("تغییر وضعیت نامعتبر است.")


@transaction.atomic
def change_cheque_status(ch: Cheque, to_status, date, money_account: MoneyAccount | None = None,
                         endorsed_to: DetailAccount | None = None, note="", user=None) -> Cheque:
    ch = Cheque.all_objects.select_for_update().get(pk=ch.pk)
    business = ch.business
    if to_status not in S.values:
        raise ValueError("وضعیت نامعتبر است.")
    if not date:
        raise ValueError("تاریخ الزامی است.")
    needs_bank = to_status in (S.DEPOSITED, S.CLEARED)
    if needs_bank:
        money_account = money_account or ch.money_account
        if money_account is None:
            raise ValueError("حساب بانکی را انتخاب کنید.")
        _check_ma(business, money_account)
    if to_status == S.ENDORSED:
        if endorsed_to is None or endorsed_to.business_id != business.pk:
            raise ValueError("شخصی را که چک به او واگذار می‌شود انتخاب کنید.")
    lines = _transition_lines(ch, to_status, money_account, endorsed_to)
    entry = None
    if lines:
        labels = dict(S.choices)
        entry = post_entry(business, lines, date=date, user=user, reference=ch.number,
                           description=f"چک {ch.number} — {labels[to_status]} — {ch.party.name}")
    ChequeEvent.all_objects.create(business=business, cheque=ch, from_status=ch.status, to_status=to_status,
                                   date=date, entry=entry, note=str(note or "")[:300])
    ch.status = to_status
    if needs_bank:
        ch.money_account = money_account
    if to_status == S.ENDORSED:
        ch.endorsed_to = endorsed_to
    ch.save(update_fields=["status", "money_account", "endorsed_to"])
    return ch


@transaction.atomic
def undo_cheque_status(ch: Cheque, user=None) -> Cheque:
    """آخرین تغییر وضعیت را با سند برگشتی خنثی می‌کند (ثبت اولیه را نه؛ برای آن «عودت» را بزنید)."""
    ch = Cheque.all_objects.select_for_update().get(pk=ch.pk)
    last = ChequeEvent.all_objects.filter(cheque=ch).order_by("-id").first()
    if last is None or not last.from_status:
        raise ValueError("تغییری برای برگرداندن وجود ندارد.")
    if last.entry_id:
        reverse_entry(last.entry, user=user, reason=f"لغو تغییر وضعیت چک {ch.number}")
    ChequeEvent.all_objects.create(business=ch.business, cheque=ch, from_status=ch.status,
                                   to_status=last.from_status, date=datetime.date.today(), note="لغو آخرین تغییر")
    ch.status = last.from_status
    if last.to_status == S.ENDORSED:
        ch.endorsed_to = None
    ch.save(update_fields=["status", "endorsed_to"])
    # رویداد لغو و رویداد لغوشده دیگر «آخرین تغییر» حساب نمی‌شوند
    ChequeEvent.all_objects.filter(pk=last.pk).update(note=(last.note + " [لغو شد]").strip())
    return ch


def cheques_due(business, days=7, today=None):
    """چک‌هایی که تا n روز آینده سررسید دارند و هنوز تعیین تکلیف نشده‌اند."""
    today = today or datetime.date.today()
    return Cheque.all_objects.filter(
        business=business, due_date__lte=today + datetime.timedelta(days=days),
        status__in=[S.IN_HAND, S.DEPOSITED],
    ).filter(Q(direction="received") | Q(direction="issued")).select_related("party").order_by("due_date")
