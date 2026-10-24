"""
Shared helper functions and constants (★ نسخه v5 — cleanup)
فقط مدل‌های: RawMaterial, PurchaseInvoice, PurchaseInvoiceItem, Supplier
"""

from __future__ import annotations

import csv
import logging
from decimal import Decimal
from io import StringIO

import openpyxl
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from ..models import (
    RawMaterial,
    PurchaseInvoice, PurchaseInvoiceItem, Supplier,
    InventoryMovement,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  CONSTANTS
# ═══════════════════════════════════════════════════════════════════

_SUPPORTED_ENCODINGS = ("utf-8-sig", "utf-8", "cp1256", "latin-1")

_UNIT_MAP = {
    "کیلوگرم": "kg", "کیلو": "kg", "kg": "kg",
    "گرم": "g", "g": "g",
    "لیتر": "l", "l": "l",
    "میلی‌لیتر": "ml", "میلی لیتر": "ml", "ml": "ml",
    "عدد": "unit", "دسته": "bunch", "بسته": "pack",
}

_COL_KEYWORDS = {
    "item_name": ["نام کالا", "نام", "کالا", "ماده اولیه", "item", "name"],
    "quantity": ["مقدار", "تعداد", "quantity", "qty"],
    "unit": ["واحد", "unit"],
    "unit_price": ["قیمت واحد", "قیمت", "فی", "unit_price", "price"],
    "supplier": [
        "تأمین‌کننده", "تامین‌کننده", "تامین کننده", "تأمین کننده",
        "شرکت", "supplier", "فروشنده", "توزیع کننده", "توزیع‌کننده",
        "پخش", "نام شرکت",
    ],
}

VALID_WASTE_REASONS = [
    'expired', 'damaged', 'overcooked',
    'quality_issue', 'returned', 'other',
]


# ═══════════════════════════════════════════════════════════════════
#  WAREHOUSE HELPERS
# ═══════════════════════════════════════════════════════════════════

def _merge_warehouse_data(restaurant=None) -> dict[str, dict]:
    """ادغام اطلاعات انبار + فاکتور خرید."""
    merged: dict[str, dict] = {}

    rm_qs = RawMaterial.objects.all()
    if restaurant:
        rm_qs = rm_qs.filter(restaurant=restaurant)

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
    if restaurant:
        pi_qs = pi_qs.filter(invoice__restaurant=restaurant)

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
    name: str, qty: float, unit: str, price: int, restaurant=None,
):
    """بروزرسانی موجودی ماده اولیه از فاکتور خرید."""
    if not restaurant:
        logger.warning(
            "_update_raw_material_stock called without restaurant for '%s'", name,
        )

    with transaction.atomic():
        mat_qs = RawMaterial.objects.select_for_update().filter(
            name__iexact=name,
        )
        if restaurant:
            mat_qs = mat_qs.filter(restaurant=restaurant)
        mat = mat_qs.first()

        if mat:
            old_stock = float(mat.quantity)

            RawMaterial.objects.filter(pk=mat.pk).update(
                quantity=F('quantity') + float(qty),
                price=price,
            )
            mat.refresh_from_db()

            InventoryMovement.objects.create(
                restaurant=restaurant,
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
                restaurant=restaurant,
                name=name, label="", price=price,
                unit=unit, quantity=int(qty),
                material_type='raw',
            )

            InventoryMovement.objects.create(
                restaurant=restaurant,
                raw_material=new_mat,
                movement_type='in',
                quantity=qty,
                previous_stock=0,
                new_stock=new_mat.quantity,
                reference_type='PurchaseInvoice',
                notes='ثبت از فاکتور خرید (جدید)',
            )


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


# ═══════════════════════════════════════════════════════════════════
#  EXCEL / CSV PARSING
# ═══════════════════════════════════════════════════════════════════

def _read_file_rows(f) -> list[list[str]]:
    """خواندن فایل CSV یا اکسل"""
    filename = f.name.lower()
    if filename.endswith(".csv"):
        return _read_csv_rows(f)
    if filename.endswith((".xlsx", ".xls")):
        return _read_xlsx_rows(f)
    raise ValueError("فرمت فایل پشتیبانی نمی‌شود. فرمت‌های مجاز: CSV, XLSX")


def _read_csv_rows(f) -> list[list[str]]:
    """خواندن فایل CSV با تشخیص خودکار encoding"""
    raw = f.read()
    text = None
    for encoding in _SUPPORTED_ENCODINGS:
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("encoding فایل قابل خواندن نیست.")
    dialect = csv.Sniffer().sniff(text[:1024], delimiters=",;\t")
    reader = csv.reader(StringIO(text), dialect)
    return [row for row in reader if any(cell.strip() for cell in row)]


def _read_xlsx_rows(f) -> list[list[str]]:
    """خواندن فایل اکسل"""
    wb = openpyxl.load_workbook(f, data_only=True)
    ws = wb.active
    if not ws or ws.max_row < 2:
        raise ValueError("فایل اکسل خالی است.")
    return [
        [str(cell) if cell is not None else "" for cell in row]
        for row in ws.iter_rows(values_only=True)
    ]


def _detect_column_map(headers: list[str]) -> dict[str, int]:
    """تشخیص خودکار ستون‌ها از هدر"""
    col_map: dict[str, int] = {}
    for i, header in enumerate(headers):
        for field, keywords in _COL_KEYWORDS.items():
            if field not in col_map and any(kw in header for kw in keywords):
                col_map[field] = i
    if "item_name" not in col_map:
        col_map = {"item_name": 0, "quantity": 1, "unit": 2, "unit_price": 3}
    return col_map


def _extract_items_from_rows(rows: list[list[str]]) -> tuple[list[dict], str]:
    """استخراج آیتم‌ها از ردیف‌های فایل"""
    if len(rows) < 2:
        raise ValueError("فایل خالی است.")

    headers = [str(h).strip().lower() for h in rows[0]]
    col_map = _detect_column_map(headers)
    items = []
    supplier_name = ""

    for row in rows[1:]:
        if not row or all(str(cell).strip() == "" for cell in row):
            continue

        name = _get_cell_str(row, col_map.get("item_name"))
        if not name or name in ("جمع کل", "جمع"):
            continue

        if not supplier_name and "supplier" in col_map:
            sup = _get_cell_str(row, col_map.get("supplier"))
            if sup and "جمع" not in sup:
                supplier_name = sup

        items.append({
            "item_name": name,
            "quantity": _get_cell_float(row, col_map.get("quantity")),
            "unit": _UNIT_MAP.get(
                _get_cell_str(row, col_map.get("unit")), "unit",
            ),
            "unit_price": _get_cell_int(row, col_map.get("unit_price")),
        })

    return items, supplier_name


def _get_cell_str(row: list, idx: int | None) -> str:
    if idx is None or idx >= len(row):
        return ""
    return str(row[idx]).strip()


def _get_cell_float(row: list, idx: int | None) -> float:
    try:
        return float(_get_cell_str(row, idx))
    except (ValueError, TypeError):
        return 0.0


def _get_cell_int(row: list, idx: int | None) -> int:
    try:
        return int(float(_get_cell_str(row, idx)))
    except (ValueError, TypeError):
        return 0


# ═══════════════════════════════════════════════════════════════════
#  PRICE HELPERS
# ═══════════════════════════════════════════════════════════════════

def _get_latest_price_from_invoices(name: str, restaurant=None) -> int:
    """یافتن آخرین قیمت خرید ماده از فاکتورها"""
    qs = PurchaseInvoiceItem.objects.filter(
        item_name__iexact=name,
    ).select_related("invoice").order_by("-invoice__date")

    if restaurant:
        qs = qs.filter(invoice__restaurant=restaurant)

    item = qs.first()
    return int(item.unit_price) if item else 0