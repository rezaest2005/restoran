

import logging
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import F, Sum
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

ZERO = Decimal("0")


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Helper: ØªØ¨Ø¯ÛŒÙ„ Ø§Ù…Ù† Ø¨Ù‡ Decimal
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


def _to_decimal(value, field_name="quantity"):
    """ØªØ¨Ø¯ÛŒÙ„ ÙˆØ±ÙˆØ¯ÛŒ (int / float / str / Decimal) Ø¨Ù‡ Decimal Ø¨Ø¯ÙˆÙ† Ø®Ø·Ø§ÛŒ Ù…Ù…ÛŒØ² Ø´Ù†Ø§ÙˆØ±"""
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"Ù…Ù‚Ø¯Ø§Ø± {field_name} Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª.")


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Helper: Ø¯Ø±ÛŒØ§ÙØª ÛŒØ§ Ø³Ø§Ø®Øª StockItem
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


def _get_or_create_stock_item(restaurant, warehouse, raw_material):
    """Ø¯Ø±ÛŒØ§ÙØª ÛŒØ§ Ø³Ø§Ø®Øª Ø±Ø¯ÛŒÙ Ù…ÙˆØ¬ÙˆØ¯ÛŒ â€” Ù…Ù‚Ø§ÙˆÙ… Ø¯Ø± Ø¨Ø±Ø§Ø¨Ø± race"""
    try:
        with transaction.atomic():
            stock_item, _ = StockItem.all_objects.get_or_create(
                restaurant=restaurant,
                warehouse=warehouse,
                raw_material=raw_material,
                defaults={"quantity": ZERO},
            )
    except IntegrityError:
        # ØªØ±Ø§Ú©Ù†Ø´ Ù…ÙˆØ§Ø²ÛŒ Ù‡Ù…â€ŒØ²Ù…Ø§Ù† Ø±Ø¯ÛŒÙ Ø±Ø§ Ø³Ø§Ø®ØªÙ‡ â€” ÙÙ‚Ø· Ø¨Ø®ÙˆØ§Ù†
        stock_item = StockItem.all_objects.get(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=raw_material,
        )
    return stock_item


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Helper: Ø«Ø¨Øª InventoryMovement
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


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
    """Ø«Ø¨Øª Ø¬Ø§Ø¨Ø¬Ø§ÛŒÛŒ Ø§Ù†Ø¨Ø§Ø± (audit trail)"""
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


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Helper: Ù„Ø§ÛŒÙ‡â€ŒÙ‡Ø§ÛŒ Ù‚ÛŒÙ…Øª (StockLayer)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


def _add_layer(
    restaurant,
    warehouse,
    raw_material,
    quantity,
    unit_cost,
    supplier=None,
    reference_type="",
    reference_id=None,
):
    """Ø§ÙØ²ÙˆØ¯Ù† Ù„Ø§ÛŒÙ‡ Ù‚ÛŒÙ…Øª Ø¬Ø¯ÛŒØ¯ â€” ÙÙ‚Ø· Ø§Ú¯Ø± Ù…Ù‚Ø¯Ø§Ø± Ùˆ Ù‚ÛŒÙ…Øª Ù…Ø¹ØªØ¨Ø± Ø¨Ø§Ø´Ø¯"""
    if quantity <= 0 or unit_cost is None or unit_cost <= 0:
        return None

    return StockLayer.all_objects.create(
        restaurant=restaurant,
        raw_material=raw_material,
        warehouse=warehouse,
        quantity_original=quantity,
        quantity_remaining=quantity,
        unit_cost=unit_cost,
        supplier=supplier,
        reference_type=reference_type,
        reference_id=reference_id,
        received_at=timezone.now(),     
    )


def _consume_layers(restaurant, warehouse, raw_material, quantity):
    """
    Ú©Ø³Ø± Ù„Ø§ÛŒÙ‡â€ŒÙ‡Ø§ÛŒ Ù‚ÛŒÙ…Øª Ø¨Ù‡ Ø±ÙˆØ´ FIFO.

    âš ï¸ Ø¨Ø§ÛŒØ¯ Ø¯Ø§Ø®Ù„ ÛŒÚ© ØªØ±Ø§Ú©Ù†Ø´ Ùˆ Ø¨Ø¹Ø¯ Ø§Ø² Ù‚ÙÙ„â€ŒÚ¯ÛŒØ±ÛŒ StockItem ØµØ¯Ø§ Ø²Ø¯Ù‡ Ø´ÙˆØ¯.

    Returns:
        Decimal: Ù‡Ø²ÛŒÙ†Ù‡ Ú©Ù„ Ú©Ø§Ù„Ø§ÛŒ Ø®Ø±ÙˆØ¬ÛŒ
    """
    remaining = quantity
    total_cost = ZERO

    layers = (
        StockLayer.all_objects.select_for_update()
        .filter(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=raw_material,
            quantity_remaining__gt=0,
        )
        .order_by("received_at", "pk")
    )

    for layer in layers:
        if remaining <= 0:
            break

        take = min(layer.quantity_remaining, remaining)
        if take <= 0:
            continue

        layer.quantity_remaining -= take
        layer.save(update_fields=["quantity_remaining"])

        total_cost += take * (layer.unit_cost or ZERO)
        remaining -= take

    if remaining > 0:
        # Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ÛŒ Ù‚Ø¯ÛŒÙ…ÛŒ Ø¨Ø¯ÙˆÙ† Ù„Ø§ÛŒÙ‡ â€” ÙÙ‚Ø· Ù‡Ø´Ø¯Ø§Ø±ØŒ Ú†ÙˆÙ† Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù‚Ø¨Ù„Ø§Ù‹ Ø¯Ø±Ø³Øª Ø§Ø³Øª
        logger.warning(
            "_consume_layers: Ù„Ø§ÛŒÙ‡ Ú©Ø§ÙÛŒ Ø¨Ø±Ø§ÛŒ %s Ø¯Ø± %s Ù†Ø¨ÙˆØ¯ (Ú©Ø³Ø±ÛŒ=%s)",
            raw_material.name,
            warehouse.name,
            remaining,
        )

    return total_cost


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Helper: Ù‡Ù…Ú¯Ø§Ù…â€ŒØ³Ø§Ø²ÛŒ RawMaterial.quantity
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


def sync_raw_material_quantity(restaurant, raw_material):
    total = (
        StockItem.all_objects.filter(
            restaurant=restaurant,
            raw_material=raw_material,
        ).aggregate(total=Sum("quantity"))["total"]
        or ZERO
    )

    RawMaterial.all_objects.filter(pk=raw_material.pk).update(quantity=total)
    raw_material.refresh_from_db(fields=["quantity"])
    return total


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  1. ÙˆØ±ÙˆØ¯ Ú©Ø§Ù„Ø§ (Receiving)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


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
    receiving=None,
):
    """
    ÙˆØ±ÙˆØ¯ Ú©Ø§Ù„Ø§ Ø¨Ù‡ Ø§Ù†Ø¨Ø§Ø±.

    Args:
        receiving: Ø§Ø®ØªÛŒØ§Ø±ÛŒ â€” Ø³Ù†Ø¯ Receiving Ù…Ø´ØªØ±Ú© Ø¨Ø±Ø§ÛŒ Ú†Ù†Ø¯ Ú©Ø§Ù„Ø§.
                   Ø§Ú¯Ø± None Ø¨Ø§Ø´Ø¯ØŒ Ø¯Ø±ÛŒØ§ÙØª ÛŒØ§ Ø³Ø§Ø®Øª Ù…ÛŒâ€ŒØ´ÙˆØ¯.
    """
    quantity = _to_decimal(quantity)
    unit_price = _to_decimal(unit_price or 0, "unit_price")

    if quantity <= 0:
        raise ValueError("Ù…Ù‚Ø¯Ø§Ø± ÙˆØ±ÙˆØ¯ Ø¨Ø§ÛŒØ¯ Ø¨ÛŒØ´ØªØ± Ø§Ø² ØµÙØ± Ø¨Ø§Ø´Ø¯.")
    if unit_price < 0:
        raise ValueError("Ù‚ÛŒÙ…Øª ÙˆØ§Ø­Ø¯ Ù†Ù…ÛŒâ€ŒØªÙˆØ§Ù†Ø¯ Ù…Ù†ÙÛŒ Ø¨Ø§Ø´Ø¯.")

    # Ù‚ÙÙ„ Ø±Ø¯ÛŒÙ Ù…ÙˆØ¬ÙˆØ¯ÛŒ (Ø¬Ù„ÙˆÚ¯ÛŒØ±ÛŒ Ø§Ø² race condition)
    stock_item = _get_or_create_stock_item(restaurant, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)

    previous_stock = stock_item.quantity

    # Ø§ÙØ²Ø§ÛŒØ´ Ù…ÙˆØ¬ÙˆØ¯ÛŒ
    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=F("quantity") + quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])
    new_stock = stock_item.quantity

    if receiving is None:
        receiving, _ = Receiving.all_objects.get_or_create(
            restaurant=restaurant,
            warehouse=warehouse,
            supplier=supplier,
            purchase_invoice=purchase_invoice,
            defaults={
                "received_by": user,
                "received_at": timezone.now(),
                "notes": notes,
            },
        )

    receiving_item = ReceivingItem.all_objects.create(
        receiving=receiving,
        raw_material=raw_material,
        quantity_ordered=quantity,
        quantity_received=quantity,
        unit=raw_material.unit,
        unit_price=unit_price,
    )

    # Ø«Ø¨Øª Ù„Ø§ÛŒÙ‡ Ù‚ÛŒÙ…Øª (Ø¨Ø±Ø§ÛŒ FIFO / COGS)
    _add_layer(
        restaurant=restaurant,
        warehouse=warehouse,
        raw_material=raw_material,
        quantity=quantity,
        unit_cost=unit_price,
        supplier=supplier,
        reference_type="receiving",
        reference_id=receiving.pk,
    )

    # Ø«Ø¨Øª Ø¬Ø§Ø¨Ø¬Ø§ÛŒÛŒ
    movement = _create_movement(
        restaurant=restaurant,
        raw_material=raw_material,
        movement_type="in",
        quantity=quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        warehouse=warehouse,
        reference_type="receiving",
        reference_id=receiving.pk,
        notes=notes,
        user=user,
    )

    # Ù‡Ù…Ú¯Ø§Ù…â€ŒØ³Ø§Ø²ÛŒ
    sync_raw_material_quantity(restaurant, raw_material)

    logger.info(
        "receive_stock: %s +%s â†’ %s (warehouse=%s, user=%s)",
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
        "receiving_id": receiving.pk,
        "receiving_item_id": receiving_item.pk,
        "movement_id": movement.pk,
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  2. Ø§Ù†ØªÙ‚Ø§Ù„ Ú©Ø§Ù„Ø§ (Transfer)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


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
    Ø§Ù†ØªÙ‚Ø§Ù„ Ú©Ø§Ù„Ø§ Ø¨ÛŒÙ† Ø¯Ùˆ Ø§Ù†Ø¨Ø§Ø±.

    âš ï¸ Ù‚ÙÙ„â€ŒÙ‡Ø§ Ø¨Ø§ ØªØ±ØªÛŒØ¨ Ø«Ø§Ø¨Øª (warehouse_id ØµØ¹ÙˆØ¯ÛŒ) Ú¯Ø±ÙØªÙ‡ Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯
       ØªØ§ Ø¯Ùˆ Ø§Ù†ØªÙ‚Ø§Ù„ Ù‡Ù…Ø²Ù…Ø§Ù† Aâ†’B Ùˆ Bâ†’A Ø¨Ø§Ø¹Ø« deadlock Ù†Ø´ÙˆÙ†Ø¯.
    """
    quantity = _to_decimal(quantity)

    if quantity <= 0:
        raise ValueError("Ù…Ù‚Ø¯Ø§Ø± Ø§Ù†ØªÙ‚Ø§Ù„ Ø¨Ø§ÛŒØ¯ Ø¨ÛŒØ´ØªØ± Ø§Ø² ØµÙØ± Ø¨Ø§Ø´Ø¯.")

    if source_warehouse.pk == destination_warehouse.pk:
        raise ValueError("Ø§Ù†Ø¨Ø§Ø± Ù…Ø¨Ø¯Ø£ Ùˆ Ù…Ù‚ØµØ¯ Ù†Ù…ÛŒâ€ŒØªÙˆØ§Ù†Ù†Ø¯ ÛŒÚ©Ø³Ø§Ù† Ø¨Ø§Ø´Ù†Ø¯.")

    # Ø§Ø·Ù…ÛŒÙ†Ø§Ù† Ø§Ø² ÙˆØ¬ÙˆØ¯ Ù‡Ø± Ø¯Ùˆ Ø±Ø¯ÛŒÙ
    _get_or_create_stock_item(restaurant, source_warehouse, raw_material)
    _get_or_create_stock_item(restaurant, destination_warehouse, raw_material)

    # Ù‚ÙÙ„ Ù‡Ø± Ø¯Ùˆ Ø±Ø¯ÛŒÙ Ø¨Ø§ ØªØ±ØªÛŒØ¨ Ø«Ø§Ø¨Øª
    ordered_ids = sorted([source_warehouse.pk, destination_warehouse.pk])
    locked = list(
        StockItem.all_objects.select_for_update()
        .filter(
            restaurant=restaurant,
            raw_material=raw_material,
            warehouse_id__in=ordered_ids,
        )
        .order_by("warehouse_id")
    )
    by_warehouse = {s.warehouse_id: s for s in locked}

    source_stock = by_warehouse.get(source_warehouse.pk)
    dest_stock = by_warehouse.get(destination_warehouse.pk)

    if source_stock is None or dest_stock is None:
        raise ValueError("Ø±Ø¯ÛŒÙ Ù…ÙˆØ¬ÙˆØ¯ÛŒ ÛŒØ§ÙØª Ù†Ø´Ø¯.")

    previous_source = source_stock.quantity
    previous_dest = dest_stock.quantity

    # Ø¨Ø±Ø±Ø³ÛŒ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©Ø§ÙÛŒ
    if previous_source < quantity:
        raise ValueError(
            f"Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©Ø§ÙÛŒ Ù†ÛŒØ³Øª. "
            f"Ù…ÙˆØ¬ÙˆØ¯ÛŒ ÙØ¹Ù„ÛŒ: {previous_source}ØŒ "
            f"Ù…Ù‚Ø¯Ø§Ø± Ø§Ù†ØªÙ‚Ø§Ù„: {quantity}"
        )

    # Ú©Ø§Ù‡Ø´ Ù…Ø¨Ø¯Ø£
    StockItem.all_objects.filter(pk=source_stock.pk).update(
        quantity=F("quantity") - quantity,
        updated_at=timezone.now(),
    )
    source_stock.refresh_from_db(fields=["quantity", "updated_at"])
    new_source = source_stock.quantity

    # Ø§ÙØ²Ø§ÛŒØ´ Ù…Ù‚ØµØ¯
    StockItem.all_objects.filter(pk=dest_stock.pk).update(
        quantity=F("quantity") + quantity,
        updated_at=timezone.now(),
    )
    dest_stock.refresh_from_db(fields=["quantity", "updated_at"])
    new_dest = dest_stock.quantity

    # Ø«Ø¨Øª Ø§Ù†ØªÙ‚Ø§Ù„
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

    # Ù…ØµØ±Ù Ù„Ø§ÛŒÙ‡â€ŒÙ‡Ø§ÛŒ Ù‚ÛŒÙ…Øª Ù…Ø¨Ø¯Ø£ + Ø§Ù†ØªÙ‚Ø§Ù„ Ù‡Ø²ÛŒÙ†Ù‡ Ø¨Ù‡ Ù…Ù‚ØµØ¯
    consumed_cost = _consume_layers(
        restaurant, source_warehouse, raw_material, quantity
    )
    avg_cost = (consumed_cost / quantity) if quantity > 0 else ZERO
    if avg_cost <= 0:
        avg_cost = getattr(raw_material, "price", ZERO) or ZERO

    _add_layer(
        restaurant=restaurant,
        warehouse=destination_warehouse,
        raw_material=raw_material,
        quantity=quantity,
        unit_cost=avg_cost,
        reference_type="transfer",
        reference_id=transfer.pk,
    )

    # Ø«Ø¨Øª Ø¬Ø§Ø¨Ø¬Ø§ÛŒÛŒ Ø®Ø±ÙˆØ¬
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
        notes=f"Ø§Ù†ØªÙ‚Ø§Ù„ Ø¨Ù‡ {destination_warehouse.name}",
        user=user,
    )

    # Ø«Ø¨Øª Ø¬Ø§Ø¨Ø¬Ø§ÛŒÛŒ ÙˆØ±ÙˆØ¯
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
        notes=f"Ø§Ù†ØªÙ‚Ø§Ù„ Ø§Ø² {source_warehouse.name}",
        user=user,
    )

    # Ù‡Ù…Ú¯Ø§Ù…â€ŒØ³Ø§Ø²ÛŒ (Ù…Ø¬Ù…ÙˆØ¹ Ú©Ù„ ØªØºÛŒÛŒØ± Ù†Ù…ÛŒâ€ŒÚ©Ù†Ø¯ ÙˆÙ„ÛŒ Ø¨Ø±Ø§ÛŒ Ø§Ø·Ù…ÛŒÙ†Ø§Ù†)
    sync_raw_material_quantity(restaurant, raw_material)

    logger.info(
        "transfer_stock: %s %s: %s â†’ %s",
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


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  3. Ø®Ø±ÙˆØ¬ Ú©Ø§Ù„Ø§ (Issue)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


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
    Ø®Ø±ÙˆØ¬ Ú©Ø§Ù„Ø§ Ø§Ø² Ø§Ù†Ø¨Ø§Ø± (Ù…ØµØ±Ù / ÙØ±ÙˆØ´ / Ø³Ø§ÛŒØ±).

    âš ï¸ Ø§ÛŒÙ† Ø¨Ø§ Transfer ÙØ±Ù‚ Ø¯Ø§Ø±Ø¯:
       Ø®Ø±ÙˆØ¬ = Ú©Ø§Ù„Ø§ Ø§Ø² Ø§Ù†Ø¨Ø§Ø± Ø®Ø§Ø±Ø¬ Ù…ÛŒâ€ŒØ´ÙˆØ¯ ÙˆÙ„ÛŒ Ø¯Ø± Ø§Ù†Ø¨Ø§Ø± Ø¯ÛŒÚ¯Ø±ÛŒ Ø§Ø¶Ø§ÙÙ‡ Ù†Ù…ÛŒâ€ŒØ´ÙˆØ¯.
    """
    quantity = _to_decimal(quantity)

    if quantity <= 0:
        raise ValueError("Ù…Ù‚Ø¯Ø§Ø± Ø®Ø±ÙˆØ¬ Ø¨Ø§ÛŒØ¯ Ø¨ÛŒØ´ØªØ± Ø§Ø² ØµÙØ± Ø¨Ø§Ø´Ø¯.")

    # Ù‚ÙÙ„ Ø±Ø¯ÛŒÙ Ù…ÙˆØ¬ÙˆØ¯ÛŒ
    stock_item = _get_or_create_stock_item(restaurant, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)

    previous_stock = stock_item.quantity

    # Ø¨Ø±Ø±Ø³ÛŒ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©Ø§ÙÛŒ
    if previous_stock < quantity:
        raise ValueError(
            f"Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©Ø§ÙÛŒ Ù†ÛŒØ³Øª. "
            f"Ù…ÙˆØ¬ÙˆØ¯ÛŒ ÙØ¹Ù„ÛŒ: {previous_stock}ØŒ "
            f"Ù…Ù‚Ø¯Ø§Ø± Ø¯Ø±Ø®ÙˆØ§Ø³ØªÛŒ: {quantity}"
        )

    # Ú©Ø§Ù‡Ø´ Ù…ÙˆØ¬ÙˆØ¯ÛŒ
    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=F("quantity") - quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])
    new_stock = stock_item.quantity

    # Ù…ØµØ±Ù Ù„Ø§ÛŒÙ‡â€ŒÙ‡Ø§ÛŒ Ù‚ÛŒÙ…Øª (FIFO)
    consumed_cost = _consume_layers(restaurant, warehouse, raw_material, quantity)

    # Ø«Ø¨Øª Ø¬Ø§Ø¨Ø¬Ø§ÛŒÛŒ
    movement_type = "waste" if reason == "waste" else "out"

    movement = _create_movement(
        restaurant=restaurant,
        raw_material=raw_material,
        movement_type=movement_type,
        quantity=quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        warehouse=warehouse,
        reference_type="issue",
        notes=f"Ø®Ø±ÙˆØ¬ ({reason}) â€” Ù…Ù‚ØµØ¯: {destination}" if destination else f"Ø®Ø±ÙˆØ¬ ({reason})",
        user=user,
    )

    # Ù‡Ù…Ú¯Ø§Ù…â€ŒØ³Ø§Ø²ÛŒ
    sync_raw_material_quantity(restaurant, raw_material)

    logger.info(
        "issue_stock: %s -%s (%s) â†’ %s",
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
        "cost": float(consumed_cost),
        "movement_id": movement.pk,
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  4. Ø¶Ø§ÛŒØ¹Ø§Øª (Waste)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


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
    Ø«Ø¨Øª Ø¶Ø§ÛŒØ¹Ø§Øª â€” Ú©Ø§Ù‡Ø´ Ù…ÙˆØ¬ÙˆØ¯ÛŒ + Ø«Ø¨Øª Ø¯Ù„ÛŒÙ„.

    âš ï¸ Ø¶Ø§ÛŒØ¹Ø§Øª ÙÙ‚Ø· Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù‡Ù…Ø§Ù† Ø§Ù†Ø¨Ø§Ø± Ø±Ø§ Ú©Ù… Ù…ÛŒâ€ŒÚ©Ù†Ø¯.

    Args:
        waste_reason:  Ø¯Ù„ÛŒÙ„ (spoiled / expired / damaged / other)
    """
    quantity = _to_decimal(quantity)

    if quantity <= 0:
        raise ValueError("Ù…Ù‚Ø¯Ø§Ø± Ø¶Ø§ÛŒØ¹Ø§Øª Ø¨Ø§ÛŒØ¯ Ø¨ÛŒØ´ØªØ± Ø§Ø² ØµÙØ± Ø¨Ø§Ø´Ø¯.")

    # Ù‚ÙÙ„ Ø±Ø¯ÛŒÙ Ù…ÙˆØ¬ÙˆØ¯ÛŒ
    stock_item = _get_or_create_stock_item(restaurant, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)

    previous_stock = stock_item.quantity

    # Ø¨Ø±Ø±Ø³ÛŒ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©Ø§ÙÛŒ
    if previous_stock < quantity:
        raise ValueError(
            f"Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©Ø§ÙÛŒ Ù†ÛŒØ³Øª. "
            f"Ù…ÙˆØ¬ÙˆØ¯ÛŒ ÙØ¹Ù„ÛŒ: {previous_stock}ØŒ "
            f"Ù…Ù‚Ø¯Ø§Ø± Ø¶Ø§ÛŒØ¹Ø§Øª: {quantity}"
        )

    # Ú©Ø§Ù‡Ø´ Ù…ÙˆØ¬ÙˆØ¯ÛŒ
    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=F("quantity") - quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])
    new_stock = stock_item.quantity

    # Ù…ØµØ±Ù Ù„Ø§ÛŒÙ‡â€ŒÙ‡Ø§ÛŒ Ù‚ÛŒÙ…Øª (FIFO) â€” Ø¨Ø±Ø§ÛŒ Ù…Ø­Ø§Ø³Ø¨Ù‡ Ø§Ø±Ø²Ø´ Ø¶Ø§ÛŒØ¹Ø§Øª
    wasted_cost = _consume_layers(restaurant, warehouse, raw_material, quantity)

    # Ø«Ø¨Øª Ø¬Ø§Ø¨Ø¬Ø§ÛŒÛŒ
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

    # Ù‡Ù…Ú¯Ø§Ù…â€ŒØ³Ø§Ø²ÛŒ
    sync_raw_material_quantity(restaurant, raw_material)

    logger.info(
        "waste_stock: %s -%s (%s) â†’ %s",
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
        "cost": float(wasted_cost),
        "movement_id": movement.pk,
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  5. Ø§ØµÙ„Ø§Ø­ / Ø´Ù…Ø§Ø±Ø´ (Adjustment)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


@transaction.atomic
def adjust_stock(
    restaurant,
    warehouse,
    raw_material,
    new_quantity=None,
    adjustment_type="count",
    reason="",
    user=None,
    notes="",
    delta=None,
):
    """
    Ø§ØµÙ„Ø§Ø­ / Ø´Ù…Ø§Ø±Ø´ Ù…ÙˆØ¬ÙˆØ¯ÛŒ.

    âš ï¸ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù…Ø³ØªÙ‚ÛŒÙ…Ø§Ù‹ overwrite Ù†Ù…ÛŒâ€ŒØ´ÙˆØ¯ â€” ÛŒÚ© StockAdjustment Ø«Ø¨Øª Ù…ÛŒâ€ŒØ´ÙˆØ¯
       Ùˆ Ù…Ù‚Ø¯Ø§Ø± Ù‚Ø¨Ù„ÛŒ Ùˆ Ø¬Ø¯ÛŒØ¯ Ù‡Ø± Ø¯Ùˆ Ø­ÙØ¸ Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯.

    âš ï¸ Ø¯Ù‚ÛŒÙ‚Ø§Ù‹ ÛŒÚ©ÛŒ Ø§Ø² Ø¯Ùˆ Ø­Ø§Ù„Øª Ø¨Ø§ÛŒØ¯ Ø§Ø±Ø³Ø§Ù„ Ø´ÙˆØ¯:
         new_quantity = Ù…Ù‚Ø¯Ø§Ø± Ù…Ø·Ù„Ù‚ Ø´Ù…Ø§Ø±Ø´â€ŒØ´Ø¯Ù‡
         delta        = Ù…Ù‚Ø¯Ø§Ø± Ù†Ø³Ø¨ÛŒ (+Ûµ / -Û³) â† Ù…Ø­Ø§Ø³Ø¨Ù‡ Ø¯Ø§Ø®Ù„ Ù‚ÙÙ„ Ø§Ù†Ø¬Ø§Ù… Ù…ÛŒâ€ŒØ´ÙˆØ¯
                       (Ø¨Ø±Ø§ÛŒ Ø¬Ù„ÙˆÚ¯ÛŒØ±ÛŒ Ø§Ø² race condition Ø¯Ø± Ø§ÙØ²Ø§ÛŒØ´/Ú©Ø§Ù‡Ø´ Ù†Ø³Ø¨ÛŒ)

    Args:
        adjustment_type: Ù†ÙˆØ¹ (count / correction / damage / other) â€” ÙÙ‚Ø· Ø¨Ø±Ø§ÛŒ Ø¨Ø±Ú†Ø³Ø¨
    """
    if (new_quantity is None) == (delta is None):
        raise ValueError("Ø¯Ù‚ÛŒÙ‚Ø§Ù‹ ÛŒÚ©ÛŒ Ø§Ø² new_quantity ÛŒØ§ delta Ø¨Ø§ÛŒØ¯ Ø§Ø±Ø³Ø§Ù„ Ø´ÙˆØ¯.")

    # Ù‚ÙÙ„ Ø±Ø¯ÛŒÙ Ù…ÙˆØ¬ÙˆØ¯ÛŒ
    stock_item = _get_or_create_stock_item(restaurant, warehouse, raw_material)
    stock_item = StockItem.all_objects.select_for_update().get(pk=stock_item.pk)

    previous_quantity = stock_item.quantity

    # Ù…Ø­Ø§Ø³Ø¨Ù‡ Ù…Ù‚Ø¯Ø§Ø± Ø¬Ø¯ÛŒØ¯ â€” Ø¯Ø§Ø®Ù„ Ù‚ÙÙ„
    if delta is not None:
        delta = _to_decimal(delta, "delta")
        new_quantity = previous_quantity + delta
    else:
        new_quantity = _to_decimal(new_quantity, "new_quantity")

    if new_quantity < 0:
        raise ValueError("Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ø¬Ø¯ÛŒØ¯ Ù†Ù…ÛŒâ€ŒØªÙˆØ§Ù†Ø¯ Ù…Ù†ÙÛŒ Ø¨Ø§Ø´Ø¯.")

    difference = new_quantity - previous_quantity

    # Ø§Ú¯Ø± ØªØºÛŒÛŒØ±ÛŒ Ù†ÛŒØ³Øª
    if difference == 0:
        return {
            "success": True,
            "message": "Ù…ÙˆØ¬ÙˆØ¯ÛŒ ØªØºÛŒÛŒØ±ÛŒ Ù†Ú©Ø±Ø¯Ù‡ Ø§Ø³Øª.",
            "previous_stock": float(previous_quantity),
            "new_stock": float(new_quantity),
            "difference": 0,
        }

    # Ø¨Ø±ÙˆØ²Ø±Ø³Ø§Ù†ÛŒ Ù…ÙˆØ¬ÙˆØ¯ÛŒ
    StockItem.all_objects.filter(pk=stock_item.pk).update(
        quantity=new_quantity,
        updated_at=timezone.now(),
    )
    stock_item.refresh_from_db(fields=["quantity", "updated_at"])

    # Ø«Ø¨Øª Ø§ØµÙ„Ø§Ø­
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

    # Ù‡Ù…Ú¯Ø§Ù…â€ŒØ³Ø§Ø²ÛŒ Ù„Ø§ÛŒÙ‡â€ŒÙ‡Ø§ÛŒ Ù‚ÛŒÙ…Øª Ø¨Ø§ ØªØºÛŒÛŒØ±
    if difference < 0:
        _consume_layers(restaurant, warehouse, raw_material, abs(difference))
    else:
        # Ø§ÙØ²Ø§ÛŒØ´ Ø¨Ø¯ÙˆÙ† Ø³Ù†Ø¯ Ø®Ø±ÛŒØ¯ â€” Ø¨Ø§ Ø¢Ø®Ø±ÛŒÙ† Ù‚ÛŒÙ…Øª Ù…Ø§Ø¯Ù‡ Ù„Ø§ÛŒÙ‡ Ù…ÛŒâ€ŒØ³Ø§Ø²ÛŒÙ…
        _add_layer(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=raw_material,
            quantity=difference,
            unit_cost=getattr(raw_material, "price", ZERO) or ZERO,
            reference_type="adjustment",
            reference_id=adjustment.pk,
        )

    # Ø«Ø¨Øª Ø¬Ø§Ø¨Ø¬Ø§ÛŒÛŒ
    movement = _create_movement(
        restaurant=restaurant,
        raw_material=raw_material,
        movement_type="adjustment",
        quantity=abs(difference),
        previous_stock=previous_quantity,
        new_stock=new_quantity,
        warehouse=warehouse,
        reference_type="adjustment",
        reference_id=adjustment.pk,
        notes=f"{'Ø§ÙØ²Ø§ÛŒØ´' if difference > 0 else 'Ú©Ø§Ù‡Ø´'} â€” {reason}",
        user=user,
    )

    # Ù‡Ù…Ú¯Ø§Ù…â€ŒØ³Ø§Ø²ÛŒ
    sync_raw_material_quantity(restaurant, raw_material)

    logger.info(
        "adjust_stock: %s %s â†’ %s (diff=%s, %s)",
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


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  6. Ø¯Ø±ÛŒØ§ÙØª Ù…ÙˆØ¬ÙˆØ¯ÛŒ ÙØ¹Ù„ÛŒ
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


def get_stock_level(restaurant, warehouse, raw_material):
    """Ù…ÙˆØ¬ÙˆØ¯ÛŒ ÙØ¹Ù„ÛŒ ÛŒÚ© Ú©Ø§Ù„Ø§ Ø¯Ø± ÛŒÚ© Ø§Ù†Ø¨Ø§Ø±"""
    stock = (
        StockItem.all_objects.filter(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=raw_material,
        )
        .only("quantity")
        .first()
    )

    return {
        "found": stock is not None,
        "quantity": float(stock.quantity) if stock else 0.0,
        "warehouse": warehouse.name,
        "material": raw_material.name,
        "unit": raw_material.unit,
    }


def get_total_stock(restaurant, raw_material):
    """Ù…Ø¬Ù…ÙˆØ¹ Ù…ÙˆØ¬ÙˆØ¯ÛŒ ÛŒÚ© Ú©Ø§Ù„Ø§ Ø¯Ø± Ù‡Ù…Ù‡ Ø§Ù†Ø¨Ø§Ø±Ù‡Ø§"""
    total = (
        StockItem.all_objects.filter(
            restaurant=restaurant,
            raw_material=raw_material,
        ).aggregate(total=Sum("quantity"))["total"]
        or ZERO
    )
    return float(total)


def get_stock_totals(restaurant, warehouse=None):
    """
    Ù…Ø¬Ù…ÙˆØ¹ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù‡Ù…Ù‡ Ú©Ø§Ù„Ø§Ù‡Ø§ Ø¯Ø± ÛŒÚ© Ú©ÙˆØ¦Ø±ÛŒ (Ø±ÙØ¹ N+1).

    Returns:
        dict: {raw_material_id: Decimal}
    """
    qs = StockItem.all_objects.filter(restaurant=restaurant)
    if warehouse:
        qs = qs.filter(warehouse=warehouse)

    return {
        row["raw_material_id"]: (row["total"] or ZERO)
        for row in qs.values("raw_material_id").annotate(total=Sum("quantity"))
    }


def get_stock_by_warehouse(restaurant, raw_material):
    """Ù…ÙˆØ¬ÙˆØ¯ÛŒ ÛŒÚ© Ú©Ø§Ù„Ø§ Ø¯Ø± Ù‡Ø± Ø§Ù†Ø¨Ø§Ø± (ØªÙÚ©ÛŒÚ©ÛŒ)"""
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


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  7. Ù„ÛŒØ³Øª Ø®Ø±ÛŒØ¯
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


def get_purchase_list(restaurant, warehouse=None):
    """
    Ù„ÛŒØ³Øª Ú©Ø§Ù„Ø§Ù‡Ø§ÛŒÛŒ Ú©Ù‡ Ø¨Ø§ÛŒØ¯ Ø®Ø±ÛŒØ¯Ø§Ø±ÛŒ Ø´ÙˆÙ†Ø¯.

    Ù…Ù†Ø·Ù‚:
      Ø§Ú¯Ø± total_stock < minimum_stock â†’ Ù†ÛŒØ§Ø² Ø¨Ù‡ Ø®Ø±ÛŒØ¯
      suggested_quantity = target_stock - total_stock (ÛŒØ§ minimum_stock Ø§Ú¯Ø± target ØµÙØ± Ø¨Ø§Ø´Ø¯)

    Args:
        restaurant: Ø±Ø³ØªÙˆØ±Ø§Ù†
        warehouse:  Ø§Ù†Ø¨Ø§Ø± Ù…Ø´Ø®Øµ (Ø§Ø®ØªÛŒØ§Ø±ÛŒ â€” Ù¾ÛŒØ´â€ŒÙØ±Ø¶: Ù…Ø¬Ù…ÙˆØ¹ Ù‡Ù…Ù‡ Ø§Ù†Ø¨Ø§Ø±Ù‡Ø§)

    Returns:
        list: Ø¢ÛŒØªÙ…â€ŒÙ‡Ø§ÛŒ Ù†ÛŒØ§Ø²Ù…Ù†Ø¯ Ø®Ø±ÛŒØ¯
    """
    materials = list(
        RawMaterial.all_objects.filter(
            restaurant=restaurant,
            minimum_stock__gt=0,
        ).order_by("name")
    )

    if not materials:
        return []

    # ÛŒÚ© Ú©ÙˆØ¦Ø±ÛŒ Ø¨Ø±Ø§ÛŒ Ù‡Ù…Ù‡ Ù…ÙˆØ¬ÙˆØ¯ÛŒâ€ŒÙ‡Ø§ (Ø±ÙØ¹ N+1)
    totals = get_stock_totals(restaurant, warehouse)

    # ÛŒÚ© Ú©ÙˆØ¦Ø±ÛŒ Ø¨Ø±Ø§ÛŒ Ø¢ÛŒØªÙ…â€ŒÙ‡Ø§ÛŒ Ù…ÙˆØ¬ÙˆØ¯ Ø¯Ø± Ù„ÛŒØ³Øª Ø®Ø±ÛŒØ¯ (Ø±ÙØ¹ N+1)
    existing_map = {
        i.raw_material_id: i
        for i in PurchaseListItem.all_objects.filter(
            restaurant=restaurant,
            raw_material_id__in=[m.pk for m in materials],
            status__in=["need", "purchasing"],
        )
    }

    items = []

    for material in materials:
        total = totals.get(material.pk, ZERO)

        min_stock = material.minimum_stock or ZERO
        target_stock = material.target_stock or ZERO

        # Ø§Ú¯Ø± Ú©Ù…Ø¨ÙˆØ¯ Ø¯Ø§Ø±Ø¯
        if total < min_stock:
            # Ù…Ù‚Ø¯Ø§Ø± Ù¾ÛŒØ´Ù†Ù‡Ø§Ø¯ÛŒ
            if target_stock > total:
                suggested = target_stock - total
            else:
                suggested = min_stock - total

            existing = existing_map.get(material.pk)

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
    """Ø§ÙØ²ÙˆØ¯Ù† Ø¢ÛŒØªÙ… Ø¨Ù‡ Ù„ÛŒØ³Øª Ø®Ø±ÛŒØ¯ â€” Ø¨Ø¯ÙˆÙ† duplicate"""
    suggested_quantity = _to_decimal(suggested_quantity or 0, "suggested_quantity")

    existing = PurchaseListItem.all_objects.filter(
        restaurant=restaurant,
        raw_material=raw_material,
        status__in=["need", "purchasing"],
    ).first()

    if existing:
        # Ø§Ú¯Ø± Ù…Ù‚Ø¯Ø§Ø± Ø¬Ø¯ÛŒØ¯ Ø¨ÛŒØ´ØªØ± Ø¨Ø§Ø´Ø¯ØŒ Ø¨Ø±ÙˆØ²Ø±Ø³Ø§Ù†ÛŒ
        if suggested_quantity > existing.suggested_quantity:
            existing.suggested_quantity = suggested_quantity
            existing.save(update_fields=["suggested_quantity", "updated_at"])
        return {
            "success": True,
            "message": "Ø§ÛŒÙ† Ú©Ø§Ù„Ø§ Ù‚Ø¨Ù„Ø§Ù‹ Ø¯Ø± Ù„ÛŒØ³Øª Ø®Ø±ÛŒØ¯ Ù‡Ø³Øª.",
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
        "message": "Ø¨Ù‡ Ù„ÛŒØ³Øª Ø®Ø±ÛŒØ¯ Ø§Ø¶Ø§ÙÙ‡ Ø´Ø¯.",
        "item_id": item.pk,
        "already_exists": False,
    }


@transaction.atomic
def update_purchase_list_status(restaurant, item_id, status):
    """Ø¨Ø±ÙˆØ²Ø±Ø³Ø§Ù†ÛŒ ÙˆØ¶Ø¹ÛŒØª Ø¢ÛŒØªÙ… Ù„ÛŒØ³Øª Ø®Ø±ÛŒØ¯"""
    valid_statuses = ["need", "purchasing", "purchased", "received"]
    if status not in valid_statuses:
        raise ValueError(f"ÙˆØ¶Ø¹ÛŒØª Ù†Ø§Ù…Ø¹ØªØ¨Ø±. Ù…Ù‚Ø§Ø¯ÛŒØ± Ù…Ø¬Ø§Ø²: {', '.join(valid_statuses)}")

    item = PurchaseListItem.all_objects.filter(
        pk=item_id,
        restaurant=restaurant,
    ).first()

    if not item:
        raise ValueError("Ø¢ÛŒØªÙ… Ù„ÛŒØ³Øª Ø®Ø±ÛŒØ¯ ÛŒØ§ÙØª Ù†Ø´Ø¯.")

    item.status = status
    item.save(update_fields=["status", "updated_at"])

    # Ø§Ú¯Ø± ÙˆØ§Ø±Ø¯ Ø§Ù†Ø¨Ø§Ø± Ø´Ø¯ØŒ Ø­Ø°Ù Ø§Ø² Ù„ÛŒØ³Øª
    if status == "received":
        item.delete()
        return {
            "success": True,
            "message": "Ø¢ÛŒØªÙ… ÙˆØ§Ø±Ø¯ Ø§Ù†Ø¨Ø§Ø± Ø´Ø¯ Ùˆ Ø§Ø² Ù„ÛŒØ³Øª Ø­Ø°Ù Ú¯Ø±Ø¯ÛŒØ¯.",
            "deleted": True,
        }

    return {
        "success": True,
        "message": "ÙˆØ¶Ø¹ÛŒØª Ø¨Ø±ÙˆØ²Ø±Ø³Ø§Ù†ÛŒ Ø´Ø¯.",
        "item_id": item.pk,
        "status": status,
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  8. Ø³Ø§Ø®Øª / Ø¯Ø±ÛŒØ§ÙØª Ø§Ù†Ø¨Ø§Ø± Ù…Ø±Ú©Ø²ÛŒ
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


def get_or_create_mother_warehouse(restaurant):
    """
    Ø¯Ø±ÛŒØ§ÙØª ÛŒØ§ Ø³Ø§Ø®Øª Ø§Ù†Ø¨Ø§Ø± Ù…Ø±Ú©Ø²ÛŒ â€” Ù‡Ø± Ø±Ø³ØªÙˆØ±Ø§Ù† Ø¨Ø§ÛŒØ¯ ÛŒÚ©ÛŒ Ø¯Ø§Ø´ØªÙ‡ Ø¨Ø§Ø´Ø¯.
    Ø§ÛŒÙ† ØªØ§Ø¨Ø¹ Ø¯Ø± Ù‡Ù†Ú¯Ø§Ù… Ø«Ø¨Øªâ€ŒÙ†Ø§Ù… ÛŒØ§ Ø§ÙˆÙ„ÛŒÙ† Ø¯Ø³ØªØ±Ø³ÛŒ Ø¨Ù‡ Ø§Ù†Ø¨Ø§Ø± ØµØ¯Ø§ Ø²Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯.
    """
    mother = Warehouse.all_objects.filter(
        restaurant=restaurant,
        is_mother=True,
    ).first()

    if mother:
        return mother

    try:
        with transaction.atomic():
            mother, _ = Warehouse.all_objects.get_or_create(
                restaurant=restaurant,
                is_mother=True,
                defaults={
                    "name": "Ø§Ù†Ø¨Ø§Ø± Ù…Ø±Ú©Ø²ÛŒ",
                    "warehouse_type": "mother",
                    "description": "Ø§Ù†Ø¨Ø§Ø± Ù…Ø±Ú©Ø²ÛŒ â€” Ù…Ø­Ù„ Ø§ØµÙ„ÛŒ Ø¯Ø±ÛŒØ§ÙØª Ø®Ø±ÛŒØ¯Ù‡Ø§",
                },
            )
    except IntegrityError:
        mother = Warehouse.all_objects.get(
            restaurant=restaurant,
            is_mother=True,
        )

    logger.info("Mother warehouse created for restaurant %s", restaurant.pk)
    return mother


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  9. Ú¯Ø±Ø¯Ø´ Ú©Ø§Ù„Ø§ (Item Movement / Traceability)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


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


def get_item_movements(restaurant, raw_material, warehouse=None, limit=100):
    """
    Ú¯Ø±Ø¯Ø´ Ú©Ø§Ù…Ù„ ÛŒÚ© Ú©Ø§Ù„Ø§ â€” Ø¨Ø±Ø§ÛŒ Traceability.

    Args:
        restaurant:    Ø±Ø³ØªÙˆØ±Ø§Ù†
        raw_material:  Ù…Ø§Ø¯Ù‡ Ø§ÙˆÙ„ÛŒÙ‡
        warehouse:     Ø§Ù†Ø¨Ø§Ø± Ù…Ø´Ø®Øµ (Ø§Ø®ØªÛŒØ§Ø±ÛŒ)
        limit:         Ø­Ø¯Ø§Ú©Ø«Ø± ØªØ¹Ø¯Ø§Ø¯ Ø±Ú©ÙˆØ±Ø¯

    Returns:
        list: Ù„ÛŒØ³Øª Ø¬Ø§Ø¨Ø¬Ø§ÛŒÛŒâ€ŒÙ‡Ø§
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

    return [_serialize_movement(m) for m in qs[:limit]]


def get_warehouse_movements(restaurant, warehouse, limit=100):
    """Ú¯Ø±Ø¯Ø´ Ú©Ø§Ù„Ø§Ù‡Ø§ÛŒ ÛŒÚ© Ø§Ù†Ø¨Ø§Ø±"""
    qs = (
        InventoryMovement.all_objects.filter(
            restaurant=restaurant,
            warehouse=warehouse,
        )
        .select_related("raw_material", "created_by")
        .order_by("-created_at")
    )

    return [
        _serialize_movement(m, include_material=True)
        for m in qs[:limit]
    ]


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  10. Ú¯Ø²Ø§Ø±Ø´â€ŒÙ‡Ø§ÛŒ Ù¾Ø§ÛŒÙ‡
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


def get_stock_value_report(restaurant, warehouse=None):
    """
    Ø§Ø±Ø²Ø´ ÙØ¹Ù„ÛŒ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ø§Ù†Ø¨Ø§Ø±.

    Returns:
        dict: Ù„ÛŒØ³Øª Ú©Ø§Ù„Ø§Ù‡Ø§ Ø¨Ø§ Ø§Ø±Ø²Ø´ + Ø¬Ù…Ø¹ Ú©Ù„
    """
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


def get_transfer_report(restaurant, start_date=None, end_date=None, limit=200):
    """Ú¯Ø²Ø§Ø±Ø´ Ú¯Ø±Ø¯Ø´ Ø§Ù†ØªÙ‚Ø§Ù„"""
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
        for t in qs[:limit]
    ]
