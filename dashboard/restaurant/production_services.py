"""
خط تولید — محاسبه‌ی نیازمندی مواد، بررسی موجودی و اجرای دستور تولید.

مستقل از صنعت: ورودی‌ها و خروجی هر دو «RawMaterial» هستند و با
material_type (خام / بسته‌بندی / نیمه‌آماده / محصول آماده) تفکیک می‌شوند.
"""

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from .inventory_services import (
    get_or_create_mother_warehouse,
    get_stock_level,
    issue_stock,
    receive_stock,
)
from .models import Formula, ProductionOrder, RawMaterial, StockItem

ZERO = Decimal("0")
Q3 = Decimal("0.001")


def _d(value):
    return value if isinstance(value, Decimal) else Decimal(str(value))


def required_materials(formula, output_quantity):
    """
    مواد لازم برای تولید `output_quantity` واحد خروجی (با احتساب درصد ضایعات).
    خروجی: لیست دیکشنری {material, quantity}
    """
    output_quantity = _d(output_quantity)
    if output_quantity <= 0:
        raise ValueError("مقدار تولید باید بیشتر از صفر باشد.")

    scale = output_quantity / formula.output_quantity
    result = []
    for line in formula.lines.select_related("material"):
        waste = Decimal("1") + (line.wastage_percent / Decimal("100"))
        qty = (line.quantity * scale * waste).quantize(Q3, rounding=ROUND_HALF_UP)
        result.append({"material": line.material, "quantity": qty})
    return result


def check_availability(restaurant, warehouse, formula, output_quantity):
    """کسری موجودی را برمی‌گرداند؛ لیست خالی یعنی همه چیز موجود است."""
    shortages = []
    for need in required_materials(formula, output_quantity):
        have = _d(get_stock_level(restaurant, warehouse, need["material"])["quantity"])
        if have < need["quantity"]:
            shortages.append({
                "material_id": need["material"].id,
                "material": need["material"].name,
                "required": need["quantity"],
                "available": have,
                "missing": need["quantity"] - have,
            })
    return shortages


def validate_formula(formula):
    """قوانین کسب‌وکاری فرمول؛ در صورت خطا ValueError."""
    lines = list(formula.lines.all())
    if not lines:
        raise ValueError("فرمول باید حداقل یک ماده‌ی ورودی داشته باشد.")
    if any(l.material_id == formula.output_material_id for l in lines):
        raise ValueError("محصول خروجی نمی‌تواند ماده‌ی ورودی همان فرمول باشد.")


@transaction.atomic
def start_production(order, user=None):
    order = ProductionOrder.all_objects.select_for_update().get(pk=order.pk)
    if order.status != ProductionOrder.Status.PLANNED:
        raise ValueError("فقط دستور برنامه‌ریزی‌شده قابل شروع است.")
    order.status = ProductionOrder.Status.IN_PROGRESS
    order.started_at = timezone.now()
    order.save(update_fields=["status", "started_at"])
    return order


@transaction.atomic
def complete_production(order, produced_quantity=None, user=None):
    """
    اجرای دستور تولید: خروج مواد ورودی از انبار و ورود محصول خروجی.

    - مصرف مواد بر اساس مقدار برنامه‌ریزی‌شده محاسبه می‌شود (ضایعات خط تولید
      با کم‌بودن produced_quantity در بهای تمام‌شده دیده می‌شود).
    - اگر موجودی هر ماده کافی نباشد، کل عملیات برگشت می‌خورد (ValueError).
    """
    order = (
        ProductionOrder.all_objects.select_for_update(of=("self",))
        .select_related("formula", "formula__output_material", "warehouse")
        .get(pk=order.pk)
    )
    if order.status not in (
        ProductionOrder.Status.PLANNED,
        ProductionOrder.Status.IN_PROGRESS,
    ):
        raise ValueError("این دستور تولید قابل تکمیل نیست.")

    formula = order.formula
    validate_formula(formula)

    produced = _d(produced_quantity) if produced_quantity is not None else order.planned_quantity
    if produced <= 0:
        raise ValueError("مقدار تولیدشده باید بیشتر از صفر باشد.")

    restaurant = order.restaurant
    warehouse = order.warehouse or get_or_create_mother_warehouse(restaurant)
    note = f"دستور تولید PO-{order.pk}"

    total_cost = ZERO
    for need in required_materials(formula, order.planned_quantity):
        material = need["material"]
        qty = need["quantity"]
        issue_stock(
            restaurant, warehouse, material, qty,
            reason="production", destination=note, user=user, notes=note,
        )
        total_cost += qty * _d(material.price)

    unit_cost = (total_cost / produced).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    output = RawMaterial.all_objects.select_for_update().get(pk=formula.output_material_id)
    old_qty = _d(output.quantity)
    receive_stock(
        restaurant, warehouse, output, produced,
        unit_price=unit_cost, user=user, notes=note,
    )
    # میانگین موزون قیمت خروجی
    output.refresh_from_db(fields=["quantity"])
    new_qty = _d(output.quantity)
    if new_qty > 0:
        weighted = (old_qty * _d(output.price) + produced * unit_cost) / new_qty
        RawMaterial.all_objects.filter(pk=output.pk).update(
            price=weighted.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )

    order.produced_quantity = produced
    order.total_cost = total_cost.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    order.unit_cost = unit_cost
    order.warehouse = warehouse
    order.status = ProductionOrder.Status.COMPLETED
    order.completed_at = timezone.now()
    if not order.started_at:
        order.started_at = order.completed_at
    order.save()
    return order


@transaction.atomic
def cancel_production(order):
    order = ProductionOrder.all_objects.select_for_update().get(pk=order.pk)
    if order.status == ProductionOrder.Status.COMPLETED:
        raise ValueError("دستور تکمیل‌شده قابل لغو نیست.")
    order.status = ProductionOrder.Status.CANCELLED
    order.save(update_fields=["status"])
    return order
