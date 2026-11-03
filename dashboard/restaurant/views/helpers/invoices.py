"""
Helpers — ساخت فاکتور از POST
"""
from __future__ import annotations

import logging

from django.db import transaction

from ...models import PurchaseInvoice, PurchaseInvoiceItem
from .stock import _update_raw_material_stock

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  INVOICE HELPERS
# ═══════════════════════════════════════════════════════════════════

def _build_invoice_from_post(request, restaurant=None):
    """ساخت فاکتور خرید از request."""
    data = getattr(request, 'data', None) or request.POST
    files = getattr(request, 'FILES', request.FILES)

    supplier_name = (data.get("supplier_name") or "").strip()
    date = data.get("date")
    if not supplier_name:
        raise ValueError("نام تأمین‌کننده الزامی است.")
    if not date:
        raise ValueError("تاریخ فاکتور الزامی است.")

    invoice = PurchaseInvoice.objects.create(
        restaurant=restaurant,
        supplier_name=supplier_name,
        invoice_number=(data.get("invoice_number") or "").strip(),
        date=date,
        description=(data.get("description") or "").strip(),
    )

    uploaded_file = files.get("invoice_file")
    if uploaded_file:
        invoice.file = uploaded_file
        invoice.save()

    return invoice


def _attach_invoice_items(invoice, post_data=None, request=None, restaurant=None) -> int:
    """اتصال آیتم‌ها به فاکتور خرید."""
    if request is not None:
        data = getattr(request, 'data', None) or request.POST
    elif post_data is not None:
        data = post_data
    else:
        raise ValueError("یکی از request یا post_data الزامی است.")

    if isinstance(data, dict) and 'items' in data:
        items_list = data['items']
    elif isinstance(data, list):
        items_list = data
    else:
        return _attach_invoice_items_django(invoice, data, restaurant)

    with transaction.atomic():
        created = 0
        for item_data in items_list:
            name = (item_data.get("item_name") or item_data.get("name") or "").strip()
            if not name or name in ("جمع کل", "جمع"):
                continue

            qty = float(item_data.get("quantity", 0) or 0)
            unit = item_data.get("unit", "unit")
            price = int(float(item_data.get("unit_price", 0) or 0))

            if qty > 0 and price > 0:
                PurchaseInvoiceItem.objects.create(
                    invoice=invoice,
                    item_name=name,
                    quantity=qty,
                    unit=unit,
                    unit_price=price,
                )
                _update_raw_material_stock(
                    name, qty, unit, price, restaurant=restaurant,
                )
                created += 1

    return created


def _attach_invoice_items_django(invoice, post_data, restaurant=None) -> int:
    """نسخه Django POST (فرمت قدیمی)"""
    item_names = post_data.getlist("item_name")
    quantities = post_data.getlist("quantity")
    units = post_data.getlist("unit")
    unit_prices = post_data.getlist("unit_price")

    with transaction.atomic():
        created = 0
        for i, name_raw in enumerate(item_names):
            name = name_raw.strip()
            if not name or name in ("جمع کل", "جمع"):
                continue

            qty = float(quantities[i]) if i < len(quantities) and quantities[i] else 0
            unit = units[i] if i < len(units) else "unit"
            price = (
                int(float(unit_prices[i]))
                if i < len(unit_prices) and unit_prices[i]
                else 0
            )

            if qty > 0 and price > 0:
                PurchaseInvoiceItem.objects.create(
                    invoice=invoice,
                    item_name=name,
                    quantity=qty,
                    unit=unit,
                    unit_price=price,
                )
                _update_raw_material_stock(
                    name, qty, unit, price, restaurant=restaurant,
                )
                created += 1

    return created
