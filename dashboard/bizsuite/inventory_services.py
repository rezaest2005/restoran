"""
Inventory Services — سرویس‌های انبار (★ نسخه v3 — cleanup)
فقط مدل‌های: RawMaterial, Warehouse, StockItem, InventoryMovement
"""

import logging
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import F, Sum
from django.utils import timezone

from .models import (
    RawMaterial,
    Warehouse,
    StockItem,
    InventoryMovement,
)

logger = logging.getLogger(__name__)

ZERO = Decimal("0")


# ═══════════════════════════════════════
#  Helper: تبدیل امن به Decimal
# ═══════════════════════════════════════

def _to_decimal(value, field_name="quantity"):
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"مقدار {field_name} نامعتبر است.")


# ═══════════════════════════════════════
#  Helper: دریافت یا ساخت StockItem
# ═══════════════════════════════════════

def _get_or_create_stock_item(business, warehouse, raw_material):
    try:
        with transaction.atomic():
            stock_item, _ = StockItem.all_objects.get_or_create(
                business=business,
                warehouse=warehouse,
                raw_material=raw_material,
                defaults={"quantity": ZERO},
            )
    except IntegrityError:
        stock_item = StockItem.all_objects.get(
            business=business,
            warehouse=warehouse,
            raw_material=raw_material,
        )
    return stock_item


# ═══════════════════════════════════════
#  Helper: ثبت InventoryMovement
# ═══════════════════════════════════════

def _create_movement(
    business,
    raw_material,
    movement_type,
    quantity,
    previous_stock,
    new_stock,
    warehouse=None,
    reference_type="",
    reference_id=None,
    notes="",
    waste_reason="",
    user=None,
):
    return InventoryMovement.all_objects.create(
        business=business,
        raw_material=raw_material,
        warehouse=warehouse,
        movement_type=movement_type,
        quantity=quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
        waste_reason=waste_reason,
        created_by=user,
    )


# ═══════════════════════════════════════
#  Helper: همگام‌سازی RawMaterial.quantity
# ═══════════════════════════════════════

def sync_raw_material_quantity(business, raw_material):
    total = (
        StockItem.all_objects.filter(
            business=business,
            raw_material=raw_material,
        ).aggregate(total=Sum("quantity"))["total"]
        or ZERO
    )
    RawMaterial.all_objects.filter(pk=raw_material.pk).update(quantity=total)
    raw_material.refresh_from_db(fields=["quantity"])
    return total


# ═══════════════════════════════════════
#  1. ورود کالا
# ═══════════════════════════════════════

@transaction.atomic
def receive_stock(
    business,
    warehouse,
    raw_material,
    quantity,
    unit_price=0,
    user=None,
    notes="",
):
    """ورود کالا به انبار"""
    quantity = _to_decimal(quantity)
    unit_price = _to_decimal(unit_price or 0, "unit_price")

    if quantity <= 0:
        raise ValueError("مقدار ورود باید بیشتر از صفر باشد.")
    if unit_price < 0:
        raise ValueError("قیمت واحد نمی‌تواند منفی باشد.")

    stock_item = _get_or_create_stock_item(business, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)
    previous_stock = stock_item.quantity

    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=F("quantity") + quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])
    new_stock = stock_item.quantity

    movement = _create_movement(
        business=business,
        raw_material=raw_material,
        movement_type="in",
        quantity=quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        warehouse=warehouse,
        reference_type="receiving",
        notes=notes,
        user=user,
    )

    sync_raw_material_quantity(business, raw_material)

    logger.info("receive_stock: %s +%s → %s", raw_material.name, quantity, new_stock)

    return {
        "success": True,
        "raw_material": raw_material.name,
        "warehouse": warehouse.name,
        "quantity_received": float(quantity),
        "previous_stock": float(previous_stock),
        "new_stock": float(new_stock),
        "movement_id": movement.pk,
    }


# ═══════════════════════════════════════
#  2. خروج کالا
# ═══════════════════════════════════════

@transaction.atomic
def issue_stock(
    business,
    warehouse,
    raw_material,
    quantity,
    reason="consumption",
    destination="",
    user=None,
    notes="",
):
    """خروج کالا از انبار (مصرف / فروش / سایر)"""
    quantity = _to_decimal(quantity)

    if quantity <= 0:
        raise ValueError("مقدار خروج باید بیشتر از صفر باشد.")

    stock_item = _get_or_create_stock_item(business, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)
    previous_stock = stock_item.quantity

    if previous_stock < quantity:
        raise ValueError(
            f"موجودی کافی نیست. موجودی فعلی: {previous_stock}، مقدار درخواستی: {quantity}"
        )

    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=F("quantity") - quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])
    new_stock = stock_item.quantity

    movement_type = "waste" if reason == "waste" else "out"
    movement = _create_movement(
        business=business,
        raw_material=raw_material,
        movement_type=movement_type,
        quantity=quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        warehouse=warehouse,
        reference_type="issue",
        notes=f"خروج ({reason}) — مقصد: {destination}" if destination else f"خروج ({reason})",
        user=user,
    )

    sync_raw_material_quantity(business, raw_material)
    logger.info("issue_stock: %s -%s (%s)", raw_material.name, quantity, reason)

    return {
        "success": True,
        "raw_material": raw_material.name,
        "warehouse": warehouse.name,
        "quantity_issued": float(quantity),
        "previous_stock": float(previous_stock),
        "new_stock": float(new_stock),
        "reason": reason,
        "movement_id": movement.pk,
    }


# ═══════════════════════════════════════
#  3. ضایعات
# ═══════════════════════════════════════

@transaction.atomic
def waste_stock(
    business,
    warehouse,
    raw_material,
    quantity,
    waste_reason="other",
    user=None,
    notes="",
):
    """ثبت ضایعات — کاهش موجودی + ثبت دلیل"""
    quantity = _to_decimal(quantity)

    if quantity <= 0:
        raise ValueError("مقدار ضایعات باید بیشتر از صفر باشد.")

    stock_item = _get_or_create_stock_item(business, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)
    previous_stock = stock_item.quantity

    if previous_stock < quantity:
        raise ValueError(
            f"موجودی کافی نیست. موجودی فعلی: {previous_stock}، مقدار ضایعات: {quantity}"
        )

    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=F("quantity") - quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])
    new_stock = stock_item.quantity

    movement = _create_movement(
        business=business,
        raw_material=raw_material,
        movement_type="waste",
        quantity=quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        warehouse=warehouse,
        reference_type="waste",
        notes=notes,
        waste_reason=waste_reason,
        user=user,
    )

    sync_raw_material_quantity(business, raw_material)
    logger.info("waste_stock: %s -%s (%s)", raw_material.name, quantity, waste_reason)

    return {
        "success": True,
        "raw_material": raw_material.name,
        "warehouse": warehouse.name,
        "quantity_wasted": float(quantity),
        "previous_stock": float(previous_stock),
        "new_stock": float(new_stock),
        "waste_reason": waste_reason,
        "movement_id": movement.pk,
    }


# ═══════════════════════════════════════
#  4. اصلاح / شمارش
# ═══════════════════════════════════════

@transaction.atomic
def adjust_stock(
    business,
    warehouse,
    raw_material,
    new_quantity=None,
    adjustment_type="count",
    reason="",
    user=None,
    notes="",
    delta=None,
):
    """اصلاح / شمارش موجودی"""
    if (new_quantity is None) == (delta is None):
        raise ValueError("دقیقاً یکی از new_quantity یا delta باید ارسال شود.")

    stock_item = _get_or_create_stock_item(business, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)
    previous_quantity = stock_item.quantity

    if delta is not None:
        delta = _to_decimal(delta, "delta")
        new_quantity = previous_quantity + delta
    else:
        new_quantity = _to_decimal(new_quantity, "new_quantity")

    if new_quantity < 0:
        raise ValueError("موجودی جدید نمی‌تواند منفی باشد.")

    difference = new_quantity - previous_quantity

    if difference == 0:
        return {
            "success": True,
            "message": "موجودی تغییری نکرده است.",
            "previous_stock": float(previous_quantity),
            "new_stock": float(new_quantity),
            "difference": 0,
        }

    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=new_quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])

    movement = _create_movement(
        business=business,
        raw_material=raw_material,
        movement_type="adjustment",
        quantity=abs(difference),
        previous_stock=previous_quantity,
        new_stock=new_quantity,
        warehouse=warehouse,
        reference_type="adjustment",
        notes=f"{'افزایش' if difference > 0 else 'کاهش'} — {reason}",
        user=user,
    )

    sync_raw_material_quantity(business, raw_material)
    logger.info("adjust_stock: %s %s → %s (diff=%s)", raw_material.name, previous_quantity, new_quantity, difference)

    return {
        "success": True,
        "raw_material": raw_material.name,
        "warehouse": warehouse.name,
        "previous_stock": float(previous_quantity),
        "new_stock": float(new_quantity),
        "difference": float(difference),
        "movement_id": movement.pk,
    }


# ═══════════════════════════════════════
#  4b. انتقال بین انبارها
# ═══════════════════════════════════════

@transaction.atomic
def transfer_stock(
    business,
    source_warehouse,
    destination_warehouse,
    raw_material,
    quantity,
    user=None,
    notes="",
):
    """انتقال اتمیک کالا بین دو انبار یک کسب‌وکار (دو حرکت out/in با مرجع مشترک)"""
    quantity = _to_decimal(quantity)
    if quantity <= 0:
        raise ValueError("مقدار انتقال باید بیشتر از صفر باشد.")

    if source_warehouse.pk == destination_warehouse.pk:
        raise ValueError("انبار مبدا و مقصد نمی‌تواند یکسان باشد.")
    if (
        source_warehouse.business_id != business.pk
        or destination_warehouse.business_id != business.pk
    ):
        raise ValueError("انبار انتخاب‌شده معتبر نیست.")
    if raw_material.business_id != business.pk:
        raise ValueError("کالای انتخاب‌شده معتبر نیست.")

    src = _get_or_create_stock_item(business, source_warehouse, raw_material)
    dst = _get_or_create_stock_item(business, destination_warehouse, raw_material)

    # قفل ردیف‌ها با ترتیب ثابت (pk) برای جلوگیری از deadlock
    locked = {
        row.pk: row
        for row in StockItem.all_objects.select_for_update()
        .filter(pk__in=[src.pk, dst.pk])
        .order_by("pk")
    }
    src, dst = locked[src.pk], locked[dst.pk]

    if src.quantity < quantity:
        raise ValueError(
            f"موجودی کافی نیست. موجودی فعلی: {src.quantity}، مقدار درخواستی: {quantity}"
        )

    src_prev, dst_prev = src.quantity, dst.quantity
    src_new, dst_new = src_prev - quantity, dst_prev + quantity
    now = timezone.now()
    StockItem.all_objects.filter(pk=src.pk).update(quantity=src_new, updated_at=now)
    StockItem.all_objects.filter(pk=dst.pk).update(quantity=dst_new, updated_at=now)

    out_mv = _create_movement(
        business=business, raw_material=raw_material, movement_type="out",
        quantity=quantity, previous_stock=src_prev, new_stock=src_new,
        warehouse=source_warehouse, reference_type="transfer",
        notes=notes or f"انتقال به {destination_warehouse.name}", user=user,
    )
    in_mv = _create_movement(
        business=business, raw_material=raw_material, movement_type="in",
        quantity=quantity, previous_stock=dst_prev, new_stock=dst_new,
        warehouse=destination_warehouse, reference_type="transfer",
        reference_id=out_mv.pk,
        notes=notes or f"انتقال از {source_warehouse.name}", user=user,
    )
    InventoryMovement.all_objects.filter(pk=out_mv.pk).update(reference_id=out_mv.pk)

    sync_raw_material_quantity(business, raw_material)
    logger.info("transfer_stock: %s %s %s→%s", raw_material.name, quantity,
                source_warehouse.name, destination_warehouse.name)

    return {
        "success": True,
        "raw_material": raw_material.name,
        "source_warehouse": source_warehouse.name,
        "destination_warehouse": destination_warehouse.name,
        "quantity_transferred": float(quantity),
        "source_new_stock": float(src_new),
        "destination_new_stock": float(dst_new),
        "reference_id": out_mv.pk,
        "movement_ids": [out_mv.pk, in_mv.pk],
    }


# ═══════════════════════════════════════
#  5. دریافت موجودی
# ═══════════════════════════════════════

def get_stock_level(business, warehouse, raw_material):
    """موجودی فعلی یک کالا در یک انبار"""
    stock = (
        StockItem.all_objects.filter(
            business=business,
            warehouse=warehouse,
            raw_material=raw_material,
        ).only("quantity").first()
    )
    return {
        "found": stock is not None,
        "quantity": float(stock.quantity) if stock else 0.0,
        "warehouse": warehouse.name,
        "material": raw_material.name,
        "unit": raw_material.unit,
    }


def get_total_stock(business, raw_material, warehouse_ids=None):
    """مجموع موجودی یک کالا در همه انبارها (یا فقط warehouse_ids در صورت محدودیت)"""
    qs = StockItem.all_objects.filter(business=business, raw_material=raw_material)
    if warehouse_ids is not None:
        qs = qs.filter(warehouse_id__in=warehouse_ids)
    return float(qs.aggregate(total=Sum("quantity"))["total"] or ZERO)


def get_stock_totals(business, warehouse=None, warehouse_ids=None):
    """مجموع موجودی همه کالاها در یک کوئری (warehouse_ids: محدودیت دسترسی کاربر)"""
    qs = StockItem.all_objects.filter(business=business)
    if warehouse_ids is not None:
        qs = qs.filter(warehouse_id__in=warehouse_ids)
    if warehouse:
        qs = qs.filter(warehouse=warehouse)
    return {
        row["raw_material_id"]: (row["total"] or ZERO)
        for row in qs.values("raw_material_id").annotate(total=Sum("quantity"))
    }


def get_stock_by_warehouse(business, raw_material, warehouse_ids=None):
    """موجودی یک کالا در هر انبار (تفکیکی)"""
    stocks = (
        StockItem.all_objects.filter(
            business=business,
            raw_material=raw_material,
        ).select_related("warehouse").order_by("warehouse__name")
    )
    if warehouse_ids is not None:
        stocks = stocks.filter(warehouse_id__in=warehouse_ids)
    return [
        {
            "warehouse_id": s.warehouse.pk,
            "warehouse_name": s.warehouse.name,
            "quantity": float(s.quantity),
        }
        for s in stocks
    ]


# ═══════════════════════════════════════
#  6. انبار مرکزی
# ═══════════════════════════════════════

def get_or_create_mother_warehouse(business):
    """دریافت یا ساخت انبار مرکزی"""
    mother = Warehouse.all_objects.filter(
        business=business,
        is_mother=True,
    ).first()

    if mother:
        return mother

    try:
        with transaction.atomic():
            mother, _ = Warehouse.all_objects.get_or_create(
                business=business,
                is_mother=True,
                defaults={
                    "name": "انبار مرکزی",
                    "warehouse_type": "mother",
                    "description": "انبار مرکزی — محل اصلی دریافت خریدها",
                },
            )
    except IntegrityError:
        mother = Warehouse.all_objects.get(
            business=business,
            is_mother=True,
        )

    logger.info("Mother warehouse created for business %s", business.pk)
    return mother


# ═══════════════════════════════════════
#  7. گردش کالا (Traceability)
# ═══════════════════════════════════════

def _serialize_movement(m, include_material=False):
    data = {
        "id": m.pk,
        "movement_type": m.movement_type,
        "movement_type_display": m.get_movement_type_display(),
        "quantity": float(m.quantity),
        "previous_stock": float(m.previous_stock),
        "new_stock": float(m.new_stock),
        "warehouse": m.warehouse.name if m.warehouse else "",
        "reference_type": m.reference_type,
        "reference_id": m.reference_id,
        "waste_reason": m.waste_reason,
        "notes": m.notes or "",
        "user": m.created_by.get_full_name() if m.created_by else "",
        "created_at": m.created_at.strftime("%Y/%m/%d %H:%M"),
    }
    if include_material:
        data["material_name"] = m.raw_material.name
    return data


def get_item_movements(business, raw_material, warehouse=None, limit=100, warehouse_ids=None):
    """گردش کامل یک کالا"""
    qs = (
        InventoryMovement.all_objects.filter(
            business=business,
            raw_material=raw_material,
        ).select_related("warehouse", "created_by").order_by("-created_at")
    )
    if warehouse:
        qs = qs.filter(warehouse=warehouse)
    if warehouse_ids is not None:
        qs = qs.filter(warehouse_id__in=warehouse_ids)
    return [_serialize_movement(m) for m in qs[:limit]]


def get_warehouse_movements(business, warehouse, limit=100):
    """گردش کالاهای یک انبار"""
    qs = (
        InventoryMovement.all_objects.filter(
            business=business,
            warehouse=warehouse,
        ).select_related("raw_material", "created_by").order_by("-created_at")
    )
    return [_serialize_movement(m, include_material=True) for m in qs[:limit]]


# ═══════════════════════════════════════
#  8. گزارش‌ها
# ═══════════════════════════════════════

def get_stock_value_report(business, warehouse=None, warehouse_ids=None):
    """ارزش فعلی موجودی انبار"""
    qs = (
        StockItem.all_objects.filter(business=business)
        .select_related("raw_material", "warehouse")
        .order_by("raw_material__name")
    )
    if warehouse:
        qs = qs.filter(warehouse=warehouse)
    if warehouse_ids is not None:
        qs = qs.filter(warehouse_id__in=warehouse_ids)

    items = []
    total_value = ZERO

    for s in qs:
        price = s.raw_material.price or ZERO
        value = s.quantity * price
        total_value += value
        items.append({
            "material_name": s.raw_material.name,
            "unit": s.raw_material.unit,
            "warehouse": s.warehouse.name,
            "quantity": float(s.quantity),
            "unit_price": int(price),
            "total_value": int(value),
        })

    return {
        "items": items,
        "total_value": int(total_value),
        "item_count": len(items),
    }