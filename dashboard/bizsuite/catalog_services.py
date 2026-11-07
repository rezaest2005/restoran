"""Catalog services: barcodes, product <-> stock link, sales warehouse, images."""

from __future__ import annotations

import io
import re
import uuid
from decimal import Decimal

from django.core.files.base import ContentFile
from django.db import transaction

from .inventory_services import get_or_create_mother_warehouse
from .models import BarcodeSequence, Food, RawMaterial, StockItem, Warehouse

MAX_BARCODES_PER_REQUEST = 20000
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000
ALLOWED_FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}
INTERNAL_PREFIX = "2"
MAX_SEQUENCE = 10 ** 11 - 1

_CUSTOM_RE = re.compile(r"^[A-Za-z0-9\-_.]{4,64}$")
_DIGIT_MAP = {ord(c): str(i) for i, c in enumerate("۰۱۲۳۴۵۶۷۸۹")}
_DIGIT_MAP.update({ord(c): str(i) for i, c in enumerate("٠١٢٣٤٥٦٧٨٩")})


# ═══════════════════════════════════════
#  Barcode validation
# ═══════════════════════════════════════

def normalize_barcode(code) -> str:
    """Strip whitespace and convert Persian/Arabic digits to ASCII."""
    if code is None:
        return ""
    return str(code).translate(_DIGIT_MAP).strip()


def check_digit(body: str) -> str:
    """GS1 check digit for the digits *without* the final check digit."""
    total = 0
    for i, ch in enumerate(reversed(body)):
        total += int(ch) * (3 if i % 2 == 0 else 1)
    return str((10 - total % 10) % 10)


def _gs1_valid(code: str) -> bool:
    return code.isdigit() and check_digit(code[:-1]) == code[-1]


def is_ean13(code: str) -> bool:
    return len(code) == 13 and _gs1_valid(code)


def validate_barcode(code) -> str:
    """Return the normalized code or raise ValueError."""
    code = normalize_barcode(code)
    if not code:
        raise ValueError("بارکد خالی است.")
    if code.isdigit() and len(code) in (8, 12, 13):
        if not _gs1_valid(code):
            raise ValueError("رقم کنترل بارکد نامعتبر است.")
        return code
    if not _CUSTOM_RE.match(code):
        raise ValueError("بارکد باید ۴ تا ۶۴ کاراکتر (حروف انگلیسی، عدد، - _ .) باشد.")
    return code


def barcode_format(code: str) -> str:
    return "ean13" if is_ean13(code) else "code128"


def find_barcode_owner(business, code, exclude=None):
    """('product'|'item', obj) already using this code in the business, or None."""
    exclude = exclude or (None, None)
    food = Food.all_objects.filter(business=business, barcode=code).first()
    if food and not (exclude[0] == "product" and exclude[1] == food.pk):
        return "product", food
    item = RawMaterial.all_objects.filter(business=business, barcode=code).first()
    if item and not (exclude[0] == "item" and exclude[1] == item.pk):
        return "item", item
    return None


def prepare_barcode(business, raw, exclude=None):
    """Normalize + validate + uniqueness across products and items. '' -> None."""
    code = normalize_barcode(raw)
    if not code:
        return None
    code = validate_barcode(code)
    owner = find_barcode_owner(business, code, exclude)
    if owner:
        kind = "محصول" if owner[0] == "product" else "کالا"
        raise ValueError(f"این بارکد قبلاً برای {kind} «{owner[1].name}» ثبت شده است.")
    return code


# ═══════════════════════════════════════
#  Barcode generation
# ═══════════════════════════════════════

def _make_ean13(number: int) -> str:
    body = INTERNAL_PREFIX + str(number).zfill(11)
    return body + check_digit(body)


def _reserve_numbers(business, n):
    seq, _ = BarcodeSequence.all_objects.get_or_create(business=business)
    seq = BarcodeSequence.all_objects.select_for_update().get(pk=seq.pk)
    start = seq.next_value
    if start + n - 1 > MAX_SEQUENCE:
        raise ValueError("ظرفیت بارکد داخلی تمام شده است.")
    seq.next_value = start + n
    seq.save(update_fields=["next_value"])
    return start


def _fresh_codes(business, n):
    """n new internal EAN-13 codes, never used before in this business."""
    out = []
    while len(out) < n:
        need = n - len(out)
        start = _reserve_numbers(business, need)
        batch = [_make_ean13(start + i) for i in range(need)]
        taken = set(Food.all_objects.filter(business=business, barcode__in=batch)
                    .values_list("barcode", flat=True))
        taken |= set(RawMaterial.all_objects.filter(business=business, barcode__in=batch)
                     .values_list("barcode", flat=True))
        out.extend(c for c in batch if c not in taken)
    return out


def generate_barcodes(business, target, ids=None, only_missing=True, count=None):
    """
    Assign internal EAN-13 codes to products/items, or (no ids + count) reserve
    ``count`` unassigned codes. Returns {"assigned": [{id,name,barcode}], "codes": [..]}.
    """
    if target not in ("product", "item"):
        raise ValueError("target باید product یا item باشد.")
    model = Food if target == "product" else RawMaterial

    with transaction.atomic():
        if not ids and count not in (None, ""):
            try:
                count = int(count)
            except (TypeError, ValueError):
                raise ValueError("تعداد نامعتبر است.")
            if count < 1 or count > MAX_BARCODES_PER_REQUEST:
                raise ValueError(f"تعداد باید بین ۱ و {MAX_BARCODES_PER_REQUEST} باشد.")
            return {"assigned": [], "codes": _fresh_codes(business, count)}

        qs = model.all_objects.filter(business=business)
        if ids:
            qs = qs.filter(pk__in=list(ids))
        if only_missing:
            from django.db.models import Q
            qs = qs.filter(Q(barcode__isnull=True) | Q(barcode=""))
        rows = list(qs.order_by("pk"))
        if len(rows) > MAX_BARCODES_PER_REQUEST:
            raise ValueError(f"حداکثر {MAX_BARCODES_PER_REQUEST} بارکد در هر درخواست مجاز است.")
        if not rows:
            return {"assigned": [], "codes": []}
        codes = _fresh_codes(business, len(rows))
        for row, code in zip(rows, codes):
            row.barcode = code
        model.all_objects.bulk_update(rows, ["barcode"], batch_size=1000)
        return {
            "assigned": [{"id": r.pk, "name": r.name, "barcode": r.barcode} for r in rows],
            "codes": codes,
        }


# ═══════════════════════════════════════
#  Sales warehouse and product stock
# ═══════════════════════════════════════

def get_sales_warehouse(business):
    flagged = Warehouse.all_objects.filter(
        business=business, is_sales_default=True, is_active=True).first()
    return flagged or get_or_create_mother_warehouse(business)


def sales_stock_map(business, item_ids, warehouse=None):
    """{item_id: Decimal quantity in the sales warehouse}."""
    warehouse = warehouse or get_sales_warehouse(business)
    rows = StockItem.all_objects.filter(
        business=business, warehouse=warehouse, raw_material_id__in=list(item_ids)
    ).values_list("raw_material_id", "quantity")
    return {i: q for i, q in rows}


def product_available_stock(food, warehouse=None):
    """Effective stock: linked item in the sales warehouse, else Food.stock."""
    if not food.item_id:
        return Decimal(food.stock or 0)
    return sales_stock_map(food.business, [food.item_id], warehouse).get(food.item_id, Decimal("0"))


def set_product_item(food, item_id):
    """Link/unlink a product to an item of the same business."""
    if item_id in (None, "", "null"):
        food.item = None
        return
    try:
        item = RawMaterial.all_objects.filter(pk=int(item_id), business_id=food.business_id).first()
    except (TypeError, ValueError):
        item = None
    if not item:
        raise ValueError("کالای انتخاب‌شده پیدا نشد.")
    food.item = item


# ═══════════════════════════════════════
#  Image upload
# ═══════════════════════════════════════

def store_product_image(food, upload):
    """Validate by content (png/jpg/webp, <=5MB), re-encode, random filename."""
    from PIL import Image, UnidentifiedImageError

    if upload.size > MAX_UPLOAD_BYTES:
        raise ValueError("حجم تصویر نباید بیش از ۵ مگابایت باشد.")
    raw = upload.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError("حجم تصویر نباید بیش از ۵ مگابایت باشد.")
    try:
        probe = Image.open(io.BytesIO(raw))
        fmt = probe.format
        probe.verify()
        img = Image.open(io.BytesIO(raw))
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise ValueError("تصویر نامعتبر است.")
    if fmt not in ALLOWED_FORMATS:
        raise ValueError("فقط png، jpg و webp مجاز است.")
    w, h = img.size
    if w * h > MAX_PIXELS or w < 1 or h < 1:
        raise ValueError("ابعاد تصویر بیش از حد بزرگ است.")
    img.load()
    mode = "RGBA" if (img.mode in ("RGBA", "LA", "P") and fmt != "JPEG") else "RGB"
    clean = Image.new(mode, img.size)
    clean.paste(img.convert(mode))
    buf = io.BytesIO()
    if fmt == "JPEG":
        clean.save(buf, "JPEG", quality=88, optimize=True)
    elif fmt == "WEBP":
        clean.save(buf, "WEBP", quality=88)
    else:
        clean.save(buf, "PNG", optimize=True)
    food.image.save(f"{uuid.uuid4().hex}.{ALLOWED_FORMATS[fmt]}", ContentFile(buf.getvalue()), save=False)
