"""سرویس‌های مشترک سفارش: رزرو و بازگرداندن موجودی محصولات."""

from decimal import Decimal

from django.db import transaction
from django.db.models import F

from .catalog_services import get_sales_warehouse, product_available_stock
from .inventory_services import issue_stock, receive_stock
from .models import Food, InventoryMovement, OrderItem

SALE_REF = "pos_order"
RETURN_REF = "pos_order_cancel"


class StockError(ValueError):
    """Not enough stock to sell."""


def check_product_stock(food, qty):
    """Raise StockError when the effective stock cannot cover qty (advisory pre-check)."""
    available = product_available_stock(food)
    if Decimal(qty) > available:
        raise StockError(f"{food.name}: سفارش {qty} ولی موجودی {available.normalize():f}")


@transaction.atomic
def reserve_product_stock(order_items, order=None, user=None):
    """
    Deduct stock for [(food, qty), ...] inside the caller's (or its own) transaction.
    Linked products issue the item from the sales warehouse (row-locked, reason
    "sale"); unlinked products use the guarded atomic Food.stock update.
    Raises StockError; the surrounding transaction must roll back.
    """
    merged = {}
    for food, qty in order_items:
        entry = merged.setdefault(food.pk, [food, 0])
        entry[1] += int(qty)
    for _pk, (food, qty) in sorted(merged.items()):
        if qty <= 0:
            continue
        if food.item_id:
            wh = get_sales_warehouse(food.business)
            note = f"فروش {food.name}" + (f" — سفارش #{order.pk}" if order else "")
            try:
                res = issue_stock(food.business, wh, food.item, qty,
                                  reason="sale", user=user, notes=note)
            except ValueError:
                raise StockError(f"موجودی «{food.name}» کافی نیست.")
            if order is not None:
                InventoryMovement.all_objects.filter(pk=res["movement_id"]).update(
                    reference_type=SALE_REF, reference_id=order.pk)
        else:
            updated = Food.all_objects.filter(pk=food.pk, stock__gte=qty).update(
                stock=F("stock") - qty)
            if not updated:
                raise StockError(f"موجودی «{food.name}» کافی نیست.")


@transaction.atomic
def release_product_stock(order, user=None):
    """Give the stock of a cancelled/rejected order back (idempotent)."""
    already = InventoryMovement.all_objects.filter(
        business_id=order.business_id, reference_type=RETURN_REF, reference_id=order.pk
    ).exists()
    if already:
        return
    totals = {}
    lines = OrderItem.all_objects.filter(order_id=order.pk, food__isnull=False).select_related("food", "food__item")
    for oi in lines:
        entry = totals.setdefault(oi.food_id, [oi.food, 0])
        entry[1] += oi.quantity
    for _pk, (food, qty) in sorted(totals.items()):
        sale = None
        if food.item_id:
            sale = InventoryMovement.all_objects.filter(
                business_id=order.business_id, reference_type=SALE_REF,
                reference_id=order.pk, raw_material_id=food.item_id,
            ).select_related("warehouse").first()
        if sale is not None:
            wh = sale.warehouse or get_sales_warehouse(food.business)
            res = receive_stock(food.business, wh, food.item, qty, user=user, notes="order cancel")
            InventoryMovement.all_objects.filter(pk=res["movement_id"]).update(
                reference_type=RETURN_REF, reference_id=order.pk)
        else:
            Food.all_objects.filter(pk=food.pk).update(stock=F("stock") + qty)


def restore_order_stock(order, user=None):
    """بازگرداندن موجودی محصولات یک سفارش لغوشده (لغو/رد)."""
    release_product_stock(order, user=user)
