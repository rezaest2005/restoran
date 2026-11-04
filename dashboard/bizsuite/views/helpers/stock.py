"""
Helpers — موجودی انبار و آخرین قیمت
"""
from __future__ import annotations

import logging

from django.db import transaction
from django.db.models import F

from ...models import RawMaterial, PurchaseInvoiceItem, InventoryMovement

logger = logging.getLogger(__name__)


VALID_WASTE_REASONS = [
    'expired', 'damaged', 'overcooked',
    'quality_issue', 'returned', 'other',
]


# ═══════════════════════════════════════════════════════════════════
#  WAREHOUSE HELPERS
# ═══════════════════════════════════════════════════════════════════

def _merge_warehouse_data(business=None) -> dict[str, dict]:
    """ادغام اطلاعات انبار + فاکتور خرید."""
    merged: dict[str, dict] = {}

    rm_qs = RawMaterial.objects.all()
    if business:
        rm_qs = rm_qs.filter(business=business)

    for material in rm_qs:
        key = material.name.strip().lower()
        merged[key] = {
            "name": material.name,
            "label": material.label,
            "unit": material.get_unit_display(),
            "unit_raw": material.unit,
            "quantity": int(material.quantity),
            "price": int(material.price),
            "total": int(material.total_price),
            "sources": ["انبار"],
        }

    pi_qs = PurchaseInvoiceItem.objects.select_related("invoice").all()
    if business:
        pi_qs = pi_qs.filter(invoice__business=business)

    for item in pi_qs:
        key = item.item_name.strip().lower()
        qty = int(item.quantity)
        price = int(item.unit_price)
        if key in merged:
            if "فاکتور خرید" not in merged[key]["sources"]:
                merged[key]["sources"].append("فاکتور خرید")
        else:
            merged[key] = {
                "name": item.item_name,
                "label": item.invoice.supplier_name if item.invoice else "",
                "unit": item.get_unit_display(),
                "unit_raw": item.unit,
                "quantity": qty,
                "price": price,
                "total": qty * price,
                "sources": ["فاکتور خرید"],
            }

    return merged


def _update_raw_material_stock(
    name: str, qty: float, unit: str, price: int, business=None,
):
    """بروزرسانی موجودی ماده اولیه از فاکتور خرید."""
    if not business:
        logger.warning(
            "_update_raw_material_stock called without business for '%s'", name,
        )

    with transaction.atomic():
        mat_qs = RawMaterial.objects.select_for_update().filter(
            name__iexact=name,
        )
        if business:
            mat_qs = mat_qs.filter(business=business)
        mat = mat_qs.first()

        if mat:
            old_stock = float(mat.quantity)

            RawMaterial.objects.filter(pk=mat.pk).update(
                quantity=F('quantity') + float(qty),
                price=price,
            )
            mat.refresh_from_db()

            InventoryMovement.objects.create(
                business=business,
                raw_material=mat,
                movement_type='in',
                quantity=qty,
                previous_stock=old_stock,
                new_stock=mat.quantity,
                reference_type='PurchaseInvoice',
                notes='ثبت از فاکتور خرید',
            )
        else:
            new_mat = RawMaterial.objects.create(
                business=business,
                name=name, label="", price=price,
                unit=unit, quantity=int(qty),
                material_type='raw',
            )

            InventoryMovement.objects.create(
                business=business,
                raw_material=new_mat,
                movement_type='in',
                quantity=qty,
                previous_stock=0,
                new_stock=new_mat.quantity,
                reference_type='PurchaseInvoice',
                notes='ثبت از فاکتور خرید (جدید)',
            )


# ═══════════════════════════════════════════════════════════════════
#  PRICE HELPERS
# ═══════════════════════════════════════════════════════════════════

def _get_latest_price_from_invoices(name: str, business=None) -> int:
    """یافتن آخرین قیمت خرید ماده از فاکتورها"""
    qs = PurchaseInvoiceItem.objects.filter(
        item_name__iexact=name,
    ).select_related("invoice").order_by("-invoice__date")

    if business:
        qs = qs.filter(invoice__business=business)

    item = qs.first()
    return int(item.unit_price) if item else 0
