"""
ثبت خودکار اسناد حسابداری از رویدادهای کسب‌وکار.

قاعده‌ی مهم: خطای حسابداری هرگز نباید فروش یا ثبت فاکتور را متوقف کند؛
خطا لاگ می‌شود و با `safe_post` خورده نمی‌شود. (گزارش «سندهای ثبت‌نشده» بعداً خطاها را نشان می‌دهد.)
"""

import logging
from decimal import Decimal

from .models import JournalEntry, PurchaseInvoiceItem, SalesInvoiceItem
from .accounting_services import (
    BANK, CASH, COGS, INVENTORY, OTHER_EXPENSE, PAYABLE, RECEIVABLE,
    SALES, SALES_RETURNS, post_entry, q2, reverse_by_source, reverse_entry,
)

logger = logging.getLogger(__name__)


def _money_account(method: str) -> str:
    """روش پرداخت → حساب: نقد = صندوق؛ بقیه (کارت، آنلاین، انتقال) = بانک."""
    return CASH if method in ("cash", "", None) else BANK


def safe_post(fn, obj, *args, **kwargs):
    """اجرای امن یک ثبت خودکار؛ هرگز استثنا بالا نمی‌دهد. در صورت خطا، کار به صف تلاش مجدد می‌رود."""
    user = args[0] if args else kwargs.get("user")
    try:
        return fn(obj, *args, **kwargs)
    except Exception:
        logger.exception("ثبت خودکار حسابداری ناموفق: %s #%s", fn.__name__, getattr(obj, "pk", "?"))
        _enqueue_retry(fn, obj, user)
        return None


def _enqueue_retry(fn, obj, user):
    try:
        from django.db import transaction
        from .jobs import enqueue
        if fn.__name__ not in POSTERS or getattr(obj, "pk", None) is None:
            return
        with transaction.atomic():
            enqueue(
                "post_accounting",
                {"poster": fn.__name__, "model": obj.__class__.__name__, "pk": obj.pk,
                 "user_id": getattr(user, "pk", None)},
                delay_seconds=30, dedupe=True,
            )
    except Exception:
        logger.exception("صف‌کردن تلاش مجدد حسابداری ناموفق بود")


def post_sales_invoice(inv, user=None):
    total = q2(inv.total)
    if total <= 0:
        return None
    paid = min(q2(inv.paid_amount), total) if inv.payment_method != "credit" else q2(0)
    lines = []
    if paid > 0:
        lines.append({"account": _money_account(inv.payment_method), "debit": paid,
                      "memo": f"فاکتور فروش {inv.invoice_number or inv.pk}"})
    if total - paid > 0:
        lines.append({"account": RECEIVABLE, "debit": total - paid,
                      "memo": inv.customer_name or "مشتری"})
    lines.append({"account": SALES, "credit": total})
    # از کوئری تازه می‌خوانیم تا prefetch قدیمی (بعد از ویرایش فاکتور) استفاده نشود
    items = SalesInvoiceItem.all_objects.filter(invoice_id=inv.pk)
    cost = q2(sum((Decimal(i.quantity) * Decimal(i.cost_price) for i in items), Decimal("0")))
    if cost > 0:
        lines.append({"account": COGS, "debit": cost, "memo": "بهای تمام‌شده"})
        lines.append({"account": INVENTORY, "credit": cost})
    return post_entry(
        inv.business, lines, date=inv.date, source_type="sales_invoice", source_id=inv.pk,
        description=f"فاکتور فروش {inv.invoice_number or inv.pk}", user=user,
    )


def post_sales_return(ret, user=None):
    amount = q2(ret.amount)
    if amount <= 0:
        return None
    inv = ret.invoice
    refund = RECEIVABLE if (inv and inv.payment_method == "credit") else _money_account(
        inv.payment_method if inv else "cash")
    return post_entry(
        ret.business,
        [{"account": SALES_RETURNS, "debit": amount, "memo": ret.item_name},
         {"account": refund, "credit": amount}],
        date=ret.date, source_type="sales_return", source_id=ret.pk,
        description=f"مرجوعی فروش — {ret.item_name}", user=user,
    )


def post_purchase_invoice(inv, user=None):
    total = q2(sum(
        (Decimal(i.quantity) * Decimal(i.unit_price)
         for i in PurchaseInvoiceItem.all_objects.filter(invoice_id=inv.pk)),
        Decimal("0"),
    ))
    if total <= 0:
        return None
    return post_entry(
        inv.business,
        [{"account": INVENTORY, "debit": total, "memo": inv.supplier_name},
         {"account": PAYABLE, "credit": total, "memo": inv.supplier_name}],
        date=inv.date, source_type="purchase_invoice", source_id=inv.pk,
        description=f"فاکتور خرید {inv.invoice_number or inv.pk}", user=user,
    )


def post_purchase_return(ret, user=None):
    amount = q2(ret.amount)
    if amount <= 0:
        return None
    return post_entry(
        ret.business,
        [{"account": PAYABLE, "debit": amount, "memo": ret.item_name},
         {"account": INVENTORY, "credit": amount}],
        date=ret.date, source_type="purchase_return", source_id=ret.pk,
        description=f"مرجوعی خرید — {ret.item_name}", user=user,
    )


def post_expense(exp, user=None):
    amount = q2(exp.amount)
    if amount <= 0:
        return None
    return post_entry(
        exp.business,
        [{"account": OTHER_EXPENSE, "debit": amount, "memo": f"{exp.category}: {exp.title}"},
         {"account": CASH, "credit": amount}],
        date=exp.date, source_type="expense", source_id=exp.pk,
        description=f"هزینه — {exp.title}", user=user,
    )


def post_pos_order(order, user=None):
    """فروش صندوق که هنگام ثبت پرداخت شده است."""
    total = q2(order.total_price)
    if total <= 0 or order.payment_status != "paid":
        return None
    return post_entry(
        order.business,
        [{"account": _money_account(order.payment_method), "debit": total,
          "memo": f"سفارش #{order.pk}"},
         {"account": SALES, "credit": total}],
        date=order.created_at.date() if order.created_at else None,
        source_type="pos_order", source_id=order.pk,
        description=f"فروش صندوق — سفارش #{order.pk}", user=user,
    )


def repost(obj, source_type, post_fn, user=None):
    """
    ویرایش منبع: سند قبلی را برگشت می‌زند، کلید منبعش را به نسخه‌ی قدیمی منتقل می‌کند
    و سند جدید را ثبت می‌کند. اگر منبع سند نداشته باشد فقط سند جدید ثبت می‌شود.
    """
    try:
        old = JournalEntry.all_objects.filter(
            business=obj.business, source_type=source_type, source_id=obj.pk
        ).first()
        if old and not JournalEntry.all_objects.filter(reversal_of=old).exists():
            reverse_entry(old, user=user, reason="ویرایش منبع")
            n = JournalEntry.all_objects.filter(
                business=obj.business, source_id=obj.pk,
                source_type__startswith=f"{source_type}_v",
            ).count() + 1
            JournalEntry.all_objects.filter(pk=old.pk).update(source_type=f"{source_type}_v{n}")
    except Exception:
        logger.exception("برگشت سند قدیمی ناموفق: %s #%s", source_type, obj.pk)
        return None
    return safe_post(post_fn, obj, user=user)


def unpost(business, source_type, source_id, user=None, reason=""):
    """ابطال سند یک منبع (هنگام حذف/لغو منبع)."""
    try:
        return reverse_by_source(business, source_type, source_id, user=user, reason=reason)
    except Exception:
        logger.exception("ابطال سند ناموفق: %s #%s", source_type, source_id)
        return None


POSTERS = {
    fn.__name__: fn for fn in (
        post_sales_invoice, post_sales_return, post_purchase_invoice,
        post_purchase_return, post_expense, post_pos_order,
    )
}
