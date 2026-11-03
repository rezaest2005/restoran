"""
Helpers — خواندن فایل CSV/XLSX و استخراج اقلام
"""
from __future__ import annotations

import csv
import logging
from io import StringIO

import openpyxl


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
