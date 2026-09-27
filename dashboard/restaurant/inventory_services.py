"""
Inventory Services — منطق تجاری سیستم انبار (★ v1)

این فایل تمام عملیات مربوط به انبار را انجام می‌دهد:
  - receive_stock    → ورود کالا
  - transfer_stock   → انتقال بین انبارها
  - issue_stock      → خروج کالا
  - waste_stock      → ضایعات
  - adjust_stock     → اصلاح / شمارش
  - get_stock_level  → موجودی فعلی
  - get_purchase_list→ لیست خرید
  - sync_raw_material_quantity → همگام‌سازی

★ هر عملیات atomic است — یا کامل انجام می‌شود یا rollback.
★ موجودی هرگز منفی نمی‌شود.
★ هر تغییر در InventoryMovement ثبت می‌شود (audit).
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import (
    RawMaterial,
    Warehouse,
    StockItem,
    StockTransfer,
    Receiving,
    ReceivingItem,
    StockLayer,
    StockAdjustment,
    PurchaseListItem,
    InventoryMovement,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  Helper: دریافت یا ساخت StockItem
# ═══════════════════════════════════════


def _get_or_create_stock_item(restaurant, warehouse, raw_material):
    """دریافت یا ساخت ردیف موجودی — thread-safe"""
    stock_item, _ = StockItem.all_objects.get_or_create(
        restaurant=restaurant,
        warehouse=warehouse,
        raw_material=raw_material,
        defaults={"quantity": Decimal("0")},
    )
    return stock_item


# ═══════════════════════════════════════
#  Helper: ثبت InventoryMovement
# ═══════════════════════════════════════


def _create_movement(
    restaurant,
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
    """ثبت جابجایی انبار (audit trail)"""
    return InventoryMovement.all_objects.create(
        restaurant=restaurant,
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


def sync_raw_material_quantity(restaurant, raw_material):
    """
    مجموع موجودی در همه انبارها → RawMaterial.quantity
    (فیلد quantity در RawMaterial یک cache است — منبع حقیقت StockItem است)
    """
    total = (
        StockItem.all_objects.filter(
            restaurant=restaurant,
            raw_material=raw_material,
        ).aggregate(total=F("quantity"))
    )

    # جمع کل
    from django.db.models import Sum

    total = (
        StockItem.all_objects.filter(
            restaurant=restaurant,
            raw_material=raw_material,
        ).aggregate(total=Sum("quantity"))["total"]
        or Decimal("0")
    )

    RawMaterial.all_objects.filter(pk=raw_material.pk).update(quantity=total)
    raw_material.refresh_from_db(fields=["quantity"])
    return total


# ═══════════════════════════════════════
#  1. ورود کالا (Receiving)
# ═══════════════════════════════════════


@transaction.atomic
def receive_stock(
    restaurant,
    warehouse,
    raw_material,
    quantity,
    unit_price=0,
    supplier=None,
    purchase_invoice=None,
    user=None,
    notes="",
):
    """
    ورود کالا به انبار.

    Args:
        restaurant:    رستوران
        warehouse:     انبار مقصد
        raw_material:  ماده اولیه
        quantity:      مقدار ورود
        unit_price:    قیمت واحد (برای StockLayer)
        supplier:      تأمین‌کننده (اختیاری)
        purchase_invoice: فاکتور خرید (اختیاری)
        user:          کاربر
        notes:         توضیحات

    Returns:
        dict: جزئیات عملیات
    """
    if quantity <= 0:
        raise ValueError("مقدار ورود باید بیشتر از صفر باشد.")

    # قفل ردیف موجودی (جلوگیری از race condition)
    stock_item = _get_or_create_stock_item(restaurant, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)

    previous_stock = stock_item.quantity

    # افزایش موجودی
    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=F("quantity") + quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])
    new_stock = stock_item.quantity

    # ثبت لایه قیمت
    if unit_price > 0:
        StockLayer.all_objects.create(
            restaurant=restaurant,
            raw_material=raw_material,
            warehouse=warehouse,
            quantity_original=quantity,
            quantity_remaining=quantity,
            unit_cost=unit_price,
            supplier=supplier,
            reference_type="receiving",
            reference_id=None,
        )

    # ثبت جابجایی
    movement = _create_movement(
        restaurant=restaurant,
        raw_material=raw_material,
        movement_type="in",
        quantity=quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        warehouse=warehouse,
        reference_type="receiving",
        reference_id=purchase_invoice.pk if purchase_invoice else None,
        notes=notes,
        user=user,
    )

    # همگام‌سازی
    sync_raw_material_quantity(restaurant, raw_material)

    logger.info(
        "receive_stock: %s +%s → %s (warehouse=%s, user=%s)",
        raw_material.name,
        quantity,
        new_stock,
        warehouse.name,
        user,
    )

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
#  2. انتقال کالا (Transfer)
# ═══════════════════════════════════════


@transaction.atomic
def transfer_stock(
    restaurant,
    source_warehouse,
    destination_warehouse,
    raw_material,
    quantity,
    user=None,
    notes="",
    reference="",
):
    """
    انتقال کالا بین دو انبار.

    Args:
        restaurant:           رستوران
        source_warehouse:     انبار مبدأ
        destination_warehouse: انبار مقصد
        raw_material:         ماده اولیه
        quantity:             مقدار انتقال
        user:                 کاربر
        notes:                توضیحات
        reference:            مرجع

    Returns:
        dict: جزئیات عملیات
    """
    if quantity <= 0:
        raise ValueError("مقدار انتقال باید بیشتر از صفر باشد.")

    if source_warehouse.pk == destination_warehouse.pk:
        raise ValueError("انبار مبدأ و مقصد نمی‌توانند یکسان باشند.")

    # قفل ردیف موجودی مبدأ
    source_stock = _get_or_create_stock_item(restaurant, source_warehouse, raw_material)
    source_stock = StockItem.all_objects.select_for_update().get(pk=source_stock.pk)

    previous_source = source_stock.quantity

    # بررسی موجودی کافی
    if previous_source < quantity:
        raise ValueError(
            f"موجودی کافی نیست. "
            f"موجودی فعلی: {previous_source}، "
            f"مقدار انتقال: {quantity}"
        )

    # کاهش مبدأ
    StockItem.all_objects.filter(pk=source_stock.pk).update(
        quantity=F("quantity") - quantity,
        updated_at=timezone.now(),
    )
    source_stock.refresh_from_db(fields=["quantity", "updated_at"])
    new_source = source_stock.quantity

    # افزایش مقصد
    dest_stock = _get_or_create_stock_item(restaurant, destination_warehouse, raw_material)
    dest_stock = StockItem.all_objects.select_for_update().get(pk=dest_stock.pk)

    previous_dest = dest_stock.quantity

    StockItem.all_objects.filter(pk=dest_stock.pk).update(
        quantity=F("quantity") + quantity,
        updated_at=timezone.now(),
    )
    dest_stock.refresh_from_db(fields=["quantity", "updated_at"])
    new_dest = dest_stock.quantity

    # ثبت انتقال
    transfer = StockTransfer.all_objects.create(
        restaurant=restaurant,
        source_warehouse=source_warehouse,
        destination_warehouse=destination_warehouse,
        raw_material=raw_material,
        quantity=quantity,
        unit=raw_material.unit,
        status="completed",
        reference=reference,
        notes=notes,
        created_by=user,
        completed_at=timezone.now(),
    )

    # ثبت جابجایی خروج
    _create_movement(
        restaurant=restaurant,
        raw_material=raw_material,
        movement_type="out",
        quantity=quantity,
        previous_stock=previous_source,
        new_stock=new_source,
        warehouse=source_warehouse,
        reference_type="transfer",
        reference_id=transfer.pk,
        notes=f"انتقال به {destination_warehouse.name}",
        user=user,
    )

    # ثبت جابجایی ورود
    _create_movement(
        restaurant=restaurant,
        raw_material=raw_material,
        movement_type="in",
        quantity=quantity,
        previous_stock=previous_dest,
        new_stock=new_dest,
        warehouse=destination_warehouse,
        reference_type="transfer",
        reference_id=transfer.pk,
        notes=f"انتقال از {source_warehouse.name}",
        user=user,
    )

    # همگام‌سازی (مجموع کل تغییر نمی‌کند ولی برای اطمینان)
    sync_raw_material_quantity(restaurant, raw_material)

    logger.info(
        "transfer_stock: %s %s: %s → %s",
        raw_material.name,
        quantity,
        source_warehouse.name,
        destination_warehouse.name,
    )

    return {
        "success": True,
        "transfer_id": transfer.pk,
        "raw_material": raw_material.name,
        "quantity": float(quantity),
        "source": {
            "warehouse": source_warehouse.name,
            "previous": float(previous_source),
            "new": float(new_source),
        },
        "destination": {
            "warehouse": destination_warehouse.name,
            "previous": float(previous_dest),
            "new": float(new_dest),
        },
    }


# ═══════════════════════════════════════
#  3. خروج کالا (Issue)
# ═══════════════════════════════════════


@transaction.atomic
def issue_stock(
    restaurant,
    warehouse,
    raw_material,
    quantity,
    reason="consumption",
    destination="",
    user=None,
    notes="",
):
    """
    خروج کالا از انبار (مصرف / فروش / سایر).

    ⚠️ این با Transfer فرق دارد:
       خروج = کالا از انبار خارج می‌شود ولی در انبار دیگری اضافه نمی‌شود.

    Args:
        restaurant:    رستوران
        warehouse:     انبار
        raw_material:  ماده اولیه
        quantity:      مقدار خروج
        reason:        دلیل (consumption / sale / other)
        destination:   مقصد (مثلاً آشپزخانه — فقط برای ثبت)
        user:          کاربر
        notes:         توضیحات

    Returns:
        dict: جزئیات عملیات
    """
    if quantity <= 0:
        raise ValueError("مقدار خروج باید بیشتر از صفر باشد.")

    # قفل ردیف موجودی
    stock_item = _get_or_create_stock_item(restaurant, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)

    previous_stock = stock_item.quantity

    # بررسی موجودی کافی
    if previous_stock < quantity:
        raise ValueError(
            f"موجودی کافی نیست. "
            f"موجودی فعلی: {previous_stock}، "
            f"مقدار درخواستی: {quantity}"
        )

    # کاهش موجودی
    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=F("quantity") - quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])
    new_stock = stock_item.quantity

    # ثبت جابجایی
    movement_type = "out"
    if reason == "waste":
        movement_type = "waste"

    movement = _create_movement(
        restaurant=restaurant,
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

    # همگام‌سازی
    sync_raw_material_quantity(restaurant, raw_material)

    logger.info(
        "issue_stock: %s -%s (%s) → %s",
        raw_material.name,
        quantity,
        reason,
        warehouse.name,
    )

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
#  4. ضایعات (Waste)
# ═══════════════════════════════════════


@transaction.atomic
def waste_stock(
    restaurant,
    warehouse,
    raw_material,
    quantity,
    waste_reason="other",
    user=None,
    notes="",
):
    """
    ثبت ضایعات — کاهش موجودی + ثبت دلیل.

    ⚠️ ضایعات فقط موجودی همان انبار را کم می‌کند.

    Args:
        restaurant:    رستوران
        warehouse:     انبار
        raw_material:  ماده اولیه
        quantity:      مقدار ضایعات
        waste_reason:  دلیل (spolied / expired / damaged / other)
        user:          کاربر
        notes:         توضیحات

    Returns:
        dict: جزئیات عملیات
    """
    if quantity <= 0:
        raise ValueError("مقدار ضایعات باید بیشتر از صفر باشد.")

    # قفل ردیف موجودی
    stock_item = _get_or_create_stock_item(restaurant, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)

    previous_stock = stock_item.quantity

    # بررسی موجودی کافی
    if previous_stock < quantity:
        raise ValueError(
            f"موجودی کافی نیست. "
            f"موجودی فعلی: {previous_stock}، "
            f"مقدار ضایعات: {quantity}"
        )

    # کاهش موجودی
    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=F("quantity") - quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])
    new_stock = stock_item.quantity

    # ثبت جابجایی
    movement = _create_movement(
        restaurant=restaurant,
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

    # همگام‌سازی
    sync_raw_material_quantity(restaurant, raw_material)

    logger.info(
        "waste_stock: %s -%s (%s) → %s",
        raw_material.name,
        quantity,
        waste_reason,
        warehouse.name,
    )

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
#  5. اصلاح / شمارش (Adjustment)
# ═══════════════════════════════════════


@transaction.atomic
def adjust_stock(
    restaurant,
    warehouse,
    raw_material,
    new_quantity,
    adjustment_type="count",
    reason="",
    user=None,
    notes="",
):
    """
    اصلاح / شمارش موجودی.

    ⚠️ موجودی مستقیماً overwrite نمی‌شود — یک StockAdjustment ثبت می‌شود
       و مقدار قبلی و جدید هر دو حفظ می‌شوند.

    Args:
        restaurant:      رستوران
        warehouse:       انبار
        raw_material:    ماده اولیه
        new_quantity:    موجودی واقعی شمارش‌شده
        adjustment_type: نوع (count / correction / damage / other)
        reason:          دلیل
        user:            کاربر
        notes:           توضیحات

    Returns:
        dict: جزئیات عملیات
    """
    if new_quantity < 0:
        raise ValueError("موجودی جدید نمی‌تواند منفی باشد.")

    # قفل ردیف موجودی
    stock_item = _get_or_create_stock_item(restaurant, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)

    previous_quantity = stock_item.quantity
    difference = new_quantity - previous_quantity

    # اگر تغییری نیست
    if difference == 0:
        return {
            "success": True,
            "message": "موجودی تغییری نکرده است.",
            "previous_stock": float(previous_quantity),
            "new_stock": float(new_quantity),
            "difference": 0,
        }

    # بروزرسانی موجودی
    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=new_quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])

    # ثبت اصلاح
    adjustment = StockAdjustment.all_objects.create(
        restaurant=restaurant,
        warehouse=warehouse,
        raw_material=raw_material,
        previous_quantity=previous_quantity,
        new_quantity=new_quantity,
        difference=difference,
        adjustment_type=adjustment_type,
        reason=reason,
        notes=notes,
        adjusted_by=user,
    )

    # ثبت جابجایی
    movement_type = "adjustment"
    movement = _create_movement(
        restaurant=restaurant,
        raw_material=raw_material,
        movement_type=movement_type,
        quantity=abs(difference),
        previous_stock=previous_quantity,
        new_stock=new_quantity,
        warehouse=warehouse,
        reference_type="adjustment",
        reference_id=adjustment.pk,
        notes=f"{'افزایش' if difference > 0 else 'کاهش'} — {reason}",
        user=user,
    )

    # همگام‌سازی
    sync_raw_material_quantity(restaurant, raw_material)

    logger.info(
        "adjust_stock: %s %s → %s (diff=%s, %s)",
        raw_material.name,
        previous_quantity,
        new_quantity,
        difference,
        adjustment_type,
    )

    return {
        "success": True,
        "adjustment_id": adjustment.pk,
        "raw_material": raw_material.name,
        "warehouse": warehouse.name,
        "previous_stock": float(previous_quantity),
        "new_stock": float(new_quantity),
        "difference": float(difference),
        "movement_id": movement.pk,
    }


# ═══════════════════════════════════════
#  6. دریافت موجودی فعلی
# ═══════════════════════════════════════


def get_stock_level(restaurant, warehouse, raw_material):
    """موجودی فعلی یک کالا در یک انبار"""
    try:
        stock = StockItem.all_objects.get(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=raw_material,
        )
        return {
            "found": True,
            "quantity": float(stock.quantity),
            "warehouse": warehouse.name,
            "material": raw_material.name,
            "unit": raw_material.unit,
        }
    except StockItem.DoesNotExist:
        return {
            "found": False,
            "quantity": 0.0,
            "warehouse": warehouse.name,
            "material": raw_material.name,
            "unit": raw_material.unit,
        }


def get_total_stock(restaurant, raw_material):
    """مجموع موجودی یک کالا در همه انبارها"""
    from django.db.models import Sum

    total = (
        StockItem.all_objects.filter(
            restaurant=restaurant,
            raw_material=raw_material,
        ).aggregate(total=Sum("quantity"))["total"]
        or Decimal("0")
    )
    return float(total)


def get_stock_by_warehouse(restaurant, raw_material):
    """موجودی یک کالا در هر انبار (تفکیکی)"""
    stocks = (
        StockItem.all_objects.filter(
            restaurant=restaurant,
            raw_material=raw_material,
        )
        .select_related("warehouse")
        .order_by("warehouse__name")
    )
    return [
        {
            "warehouse_id": s.warehouse.pk,
            "warehouse_name": s.warehouse.name,
            "quantity": float(s.quantity),
        }
        for s in stocks
    ]


# ═══════════════════════════════════════
#  7. لیست خرید
# ═══════════════════════════════════════


def get_purchase_list(restaurant, warehouse=None):
    """
    لیست کالاهایی که باید خریداری شوند.

    منطق:
      اگر total_stock < minimum_stock → نیاز به خرید
      suggested_quantity = target_stock - total_stock (یا minimum_stock اگر target صفر باشد)

    Args:
        restaurant: رستوران
        warehouse:  انبار مشخص (اختیاری — پیش‌فرض: مجموع همه انبارها)

    Returns:
        list: آیتم‌های نیازمند خرید
    """
    from django.db.models import Sum

    # همه مواد اولیه با حداقل موجودی > 0
    materials = (
        RawMaterial.all_objects.filter(
            restaurant=restaurant,
            minimum_stock__gt=0,
        )
        .order_by("name")
    )

    items = []

    for material in materials:
        # محاسبه موجودی فعلی
        if warehouse:
            total = (
                StockItem.all_objects.filter(
                    restaurant=restaurant,
                    warehouse=warehouse,
                    raw_material=material,
                ).aggregate(t=Sum("quantity"))["t"]
                or Decimal("0")
            )
        else:
            total = (
                StockItem.all_objects.filter(
                    restaurant=restaurant,
                    raw_material=material,
                ).aggregate(t=Sum("quantity"))["t"]
                or Decimal("0")
            )

        min_stock = material.minimum_stock or Decimal("0")
        target_stock = material.target_stock or Decimal("0")

        # اگر کمبود دارد
        if total < min_stock:
            # مقدار پیشنهادی
            if target_stock > 0:
                suggested = target_stock - total
            else:
                suggested = min_stock - total

            if suggested <= 0:
                suggested = min_stock

            # بررسی آیا قبلاً در لیست هست
            existing = PurchaseListItem.all_objects.filter(
                restaurant=restaurant,
                raw_material=material,
                status__in=["need", "purchasing"],
            ).first()

            items.append({
                "raw_material_id": material.pk,
                "material_name": material.name,
                "unit": material.unit,
                "unit_display": material.get_unit_display(),
                "current_stock": float(total),
                "minimum_stock": float(min_stock),
                "target_stock": float(target_stock),
                "suggested_quantity": float(suggested),
                "status": existing.status if existing else "need",
                "already_in_list": bool(existing),
            })

    return items


@transaction.atomic
def add_to_purchase_list(restaurant, raw_material, suggested_quantity=0, user=None):
    """افزودن آیتم به لیست خرید — بدون duplicate"""
    existing = PurchaseListItem.all_objects.filter(
        restaurant=restaurant,
        raw_material=raw_material,
        status__in=["need", "purchasing"],
    ).first()

    if existing:
        # اگر مقدار جدید بیشتر باشد، بروزرسانی
        if suggested_quantity > existing.suggested_quantity:
            existing.suggested_quantity = suggested_quantity
            existing.save(update_fields=["suggested_quantity", "updated_at"])
        return {
            "success": True,
            "message": "این کالا قبلاً در لیست خرید هست.",
            "item_id": existing.pk,
            "already_exists": True,
        }

    item = PurchaseListItem.all_objects.create(
        restaurant=restaurant,
        raw_material=raw_material,
        suggested_quantity=suggested_quantity,
        status="need",
    )

    return {
        "success": True,
        "message": "به لیست خرید اضافه شد.",
        "item_id": item.pk,
        "already_exists": False,
    }


@transaction.atomic
def update_purchase_list_status(restaurant, item_id, status):
    """بروزرسانی وضعیت آیتم لیست خرید"""
    valid_statuses = ["need", "purchasing", "purchased", "received"]
    if status not in valid_statuses:
        raise ValueError(f"وضعیت نامعتبر. مقادیر مجاز: {', '.join(valid_statuses)}")

    item = PurchaseListItem.all_objects.filter(
        pk=item_id,
        restaurant=restaurant,
    ).first()

    if not item:
        raise ValueError("آیتم لیست خرید یافت نشد.")

    item.status = status
    item.save(update_fields=["status", "updated_at"])

    # اگر وارد انبار شد، حذف از لیست
    if status == "received":
        item.delete()
        return {
            "success": True,
            "message": "آیتم وارد انبار شد و از لیست حذف گردید.",
            "deleted": True,
        }

    return {
        "success": True,
        "message": "وضعیت بروزرسانی شد.",
        "item_id": item.pk,
        "status": status,
    }


# ═══════════════════════════════════════
#  8. ساخت / دریافت انبار مرکزی
# ═══════════════════════════════════════


def get_or_create_mother_warehouse(restaurant):
    """
    دریافت یا ساخت انبار مرکزی — هر رستوران باید یکی داشته باشد.
    این تابع در هنگام ثبت‌نام یا اولین دسترسی به انبار صدا زده می‌شود.
    """
    mother = Warehouse.all_objects.filter(
        restaurant=restaurant,
        is_mother=True,
    ).first()

    if mother:
        return mother

    # ساخت انبار مرکزی
    mother = Warehouse.all_objects.create(
        restaurant=restaurant,
        name="انبار مرکزی",
        warehouse_type="mother",
        is_mother=True,
        description="انبار مرکزی — محل اصلی دریافت خریدها",
    )

    logger.info("Mother warehouse created for restaurant %s", restaurant.pk)
    return mother


# ═══════════════════════════════════════
#  9. گردش کالا (Item Movement / Traceability)
# ═══════════════════════════════════════


def get_item_movements(restaurant, raw_material, warehouse=None, limit=100):
    """
    گردش کامل یک کالا — برای Traceability.

    Args:
        restaurant:    رستوران
        raw_material:  ماده اولیه
        warehouse:     انبار مشخص (اختیاری)
        limit:         حداکثر تعداد رکورد

    Returns:
        list: لیست جابجایی‌ها
    """
    qs = (
        InventoryMovement.all_objects.filter(
            restaurant=restaurant,
            raw_material=raw_material,
        )
        .select_related("warehouse", "created_by")
        .order_by("-created_at")
    )

    if warehouse:
        qs = qs.filter(warehouse=warehouse)

    movements = qs[:limit]

    return [
        {
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
        for m in movements
    ]


def get_warehouse_movements(restaurant, warehouse, limit=100):
    """گردش کالاهای یک انبار"""
    qs = (
        InventoryMovement.all_objects.filter(
            restaurant=restaurant,
            warehouse=warehouse,
        )
        .select_related("raw_material", "created_by")
        .order_by("-created_at")
    )

    movements = qs[:limit]

    return [
        {
            "id": m.pk,
            "material_name": m.raw_material.name,
            "movement_type": m.movement_type,
            "movement_type_display": m.get_movement_type_display(),
            "quantity": float(m.quantity),
            "previous_stock": float(m.previous_stock),
            "new_stock": float(m.new_stock),
            "waste_reason": m.waste_reason,
            "notes": m.notes or "",
            "user": m.created_by.get_full_name() if m.created_by else "",
            "created_at": m.created_at.strftime("%Y/%m/%d %H:%M"),
        }
        for m in movements
    ]


# ═══════════════════════════════════════
#  10. گزارش‌های پایه
# ═══════════════════════════════════════


def get_stock_value_report(restaurant, warehouse=None):
    """
    ارزش فعلی موجودی انبار.

    Returns:
        list: لیست کالاها با ارزش
    """
    from django.db.models import Sum

    qs = (
        StockItem.all_objects.filter(
            restaurant=restaurant,
        )
        .select_related("raw_material", "warehouse")
        .order_by("raw_material__name")
    )

    if warehouse:
        qs = qs.filter(warehouse=warehouse)

    items = []
    total_value = Decimal("0")

    for s in qs:
        value = s.quantity * s.raw_material.price
        total_value += value
        items.append({
            "material_name": s.raw_material.name,
            "unit": s.raw_material.unit,
            "warehouse": s.warehouse.name,
            "quantity": float(s.quantity),
            "unit_price": int(s.raw_material.price),
            "total_value": int(value),
        })

    return {
        "items": items,
        "total_value": int(total_value),
        "item_count": len(items),
    }


def get_transfer_report(restaurant, start_date=None, end_date=None, limit=200):
    """گزارش گردش انتقال"""
    qs = (
        StockTransfer.all_objects.filter(restaurant=restaurant)
        .select_related(
            "source_warehouse",
            "destination_warehouse",
            "raw_material",
            "created_by",
        )
        .order_by("-created_at")
    )

    if start_date:
        qs = qs.filter(created_at__gte=start_date)
    if end_date:
        qs = qs.filter(created_at__lte=end_date)

    transfers = qs[:limit]

    return [
        {
            "id": t.pk,
            "material_name": t.raw_material.name,
            "source_warehouse": t.source_warehouse.name,
            "destination_warehouse": t.destination_warehouse.name,
            "quantity": float(t.quantity),
            "unit": t.unit,
            "status": t.status,
            "status_display": t.get_status_display(),
            "user": t.created_by.get_full_name() if t.created_by else "",
            "created_at": t.created_at.strftime("%Y/%m/%d %H:%M"),
        }
        for t in transfers
    ]