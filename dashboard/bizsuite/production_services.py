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
    get_total_stock,
    issue_stock,
    receive_stock,
)
from .models import Formula, ProductionOrder, ProductionOrderStep, RawMaterial
from .production_engine import BomGraph, convert, line_requirement, stage_minutes

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
        base = convert(line.quantity, line.unit, line.material.unit) if line.unit else line.quantity
        qty = line_requirement(
            base, line.wastage_percent, line.setup_quantity, line.rounding_multiple, scale
        )
        result.append({"material": line.material, "quantity": qty, "stage_id": line.stage_id})
    return result


def validate_no_cycle(business, formula_id, output_material_id, input_material_ids):
    """چرخه‌ی فرمول (مستقیم یا غیرمستقیم) را رد می‌کند؛ ValueError."""
    ids = list(input_material_ids)
    if output_material_id in ids:
        raise ValueError("محصول خروجی نمی‌تواند ماده‌ی ورودی همان فرمول باشد.")
    graph = BomGraph(business)
    path = graph.find_cycle(output_material_id, ids, own_fid=formula_id)
    if path:
        raise ValueError(graph.cycle_message(output_material_id, path))


def create_order_steps(order):
    """کارت‌های کار دستور تولید را از مراحل فرمول می‌سازد (عکس لحظه‌ای)."""
    formula = order.formula
    total = ZERO
    steps = []
    for s in formula.stages.all():
        minutes = stage_minutes(
            s.setup_minutes, s.run_minutes, s.capacity, formula.output_quantity,
            order.planned_quantity,
        )
        total += minutes
        steps.append(ProductionOrderStep(
            business=order.business, order=order, stage=s, sequence=s.sequence, name=s.name,
            workstation=s.workstation, instructions=s.instructions,
            quality_check=s.quality_check, planned_minutes=minutes,
            hourly_rate=_d(s.labour_rate) + _d(s.overhead_rate),
        ))
    ProductionOrderStep.objects.bulk_create(steps)
    if total != order.planned_minutes:
        order.planned_minutes = total
        order.save(update_fields=["planned_minutes"])
    return steps


def _locked_open_order(order_id):
    order = ProductionOrder.all_objects.select_for_update().get(pk=order_id)
    if order.status not in (ProductionOrder.Status.PLANNED, ProductionOrder.Status.IN_PROGRESS):
        raise ValueError("این دستور تولید بسته شده است.")
    return order


@transaction.atomic
def start_step(order, step_id, user=None):
    """شروع یک مرحله؛ مراحل به ترتیب انجام می‌شوند (مرحله‌ی قبلی باید تمام یا رد شده باشد)."""
    order = _locked_open_order(order.pk)
    step = ProductionOrderStep.all_objects.select_for_update().get(pk=step_id, order=order)
    if step.status != ProductionOrderStep.Status.PENDING:
        raise ValueError("این مرحله قبلاً شروع شده است.")
    blocking = ProductionOrderStep.all_objects.filter(
        order=order, sequence__lt=step.sequence,
        status__in=[ProductionOrderStep.Status.PENDING, ProductionOrderStep.Status.IN_PROGRESS],
    ).first()
    if blocking:
        raise ValueError(f"اول مرحله‌ی «{blocking.name}» را تمام کنید.")
    now = timezone.now()
    step.status = ProductionOrderStep.Status.IN_PROGRESS
    step.started_at = now
    step.save(update_fields=["status", "started_at"])
    if order.status == ProductionOrder.Status.PLANNED:
        order.status = ProductionOrder.Status.IN_PROGRESS
        order.started_at = now
        order.save(update_fields=["status", "started_at"])
    return step


@transaction.atomic
def finish_step(order, step_id, data=None, skip=False, user=None):
    """پایان (یا رد کردن) یک مرحله با ثبت مقدار سالم، ضایعات، زمان واقعی و کنترل کیفیت."""
    data = data or {}
    order = _locked_open_order(order.pk)
    step = ProductionOrderStep.all_objects.select_for_update().get(pk=step_id, order=order)
    if step.status in (ProductionOrderStep.Status.DONE, ProductionOrderStep.Status.SKIPPED):
        raise ValueError("این مرحله قبلاً بسته شده است.")
    if not skip and step.status != ProductionOrderStep.Status.IN_PROGRESS:
        blocking = ProductionOrderStep.all_objects.filter(
            order=order, sequence__lt=step.sequence,
            status__in=[ProductionOrderStep.Status.PENDING, ProductionOrderStep.Status.IN_PROGRESS],
        ).first()
        if blocking:
            raise ValueError(f"اول مرحله‌ی «{blocking.name}» را تمام کنید.")
    now = timezone.now()
    if skip:
        step.status = ProductionOrderStep.Status.SKIPPED
    else:
        step.status = ProductionOrderStep.Status.DONE
        if data.get("actual_minutes") not in (None, ""):
            step.actual_minutes = _nonneg(data["actual_minutes"], "زمان واقعی")
        elif step.started_at:
            step.actual_minutes = Decimal(
                str(round((now - step.started_at).total_seconds() / 60, 2))
            )
        if data.get("good_quantity") not in (None, ""):
            step.good_quantity = _nonneg(data["good_quantity"], "مقدار سالم")
        if data.get("scrap_quantity") not in (None, ""):
            step.scrap_quantity = _nonneg(data["scrap_quantity"], "ضایعات")
        if "quality_ok" in data and data["quality_ok"] is not None:
            step.quality_ok = bool(data["quality_ok"])
    step.notes = str(data.get("notes") or step.notes or "")[:300]
    if not step.started_at:
        step.started_at = now
    step.completed_at = now
    step.save()
    if order.status == ProductionOrder.Status.PLANNED:
        order.status = ProductionOrder.Status.IN_PROGRESS
        order.started_at = now
        order.save(update_fields=["status", "started_at"])
    return step


def _nonneg(value, field):
    try:
        v = _d(value)
    except Exception:
        raise ValueError(f"«{field}» نامعتبر است.")
    if not v.is_finite() or v < 0:
        raise ValueError(f"«{field}» نامعتبر است.")
    return v


def sub_formula_map(business, material_ids, exclude_formula_id=None):
    """{material_id: formula_id} برای موادی که خروجی یک فرمول فعال‌اند (چندسطحی)."""
    qs = Formula.all_objects.filter(
        business=business, is_active=True, output_material_id__in=list(material_ids)
    ).order_by("-id")
    if exclude_formula_id:
        qs = qs.exclude(pk=exclude_formula_id)
    result = {}
    for fid, mid in qs.values_list("id", "output_material_id"):
        result.setdefault(mid, fid)
    return result


def stock_report(business, warehouse, formula, output_quantity):
    """
    وضعیت هر ماده‌ی ورودی برای تولید `output_quantity`:
    required / available / missing / ready (+ نوع ماده و فرمول زیرمجموعه).
    `warehouse=None` یعنی مجموع موجودی همه‌ی انبارها.
    """
    needs = required_materials(formula, output_quantity)
    subs = sub_formula_map(business, [n["material"].id for n in needs], formula.id)
    lines = []
    for need in needs:
        m = need["material"]
        if warehouse is None:
            have = _d(get_total_stock(business, m))
        else:
            have = _d(get_stock_level(business, warehouse, m)["quantity"])
        missing = max(need["quantity"] - have, ZERO)
        lines.append({
            "material_id": m.id, "material": m.name, "material_type": m.material_type,
            "unit": m.unit, "required": need["quantity"], "available": have,
            "missing": missing, "ready": missing == 0,
            "is_semi_finished_with_formula": m.id in subs,
            "sub_formula_id": subs.get(m.id),
        })
    return lines


def check_availability(business, warehouse, formula, output_quantity):
    """کسری موجودی را برمی‌گرداند؛ لیست خالی یعنی همه چیز موجود است."""
    return [
        {k: l[k] for k in ("material_id", "material", "required", "available", "missing")}
        for l in stock_report(business, warehouse, formula, output_quantity)
        if not l["ready"]
    ]


def shortage_message(shortages):
    parts = [
        f"{s['material']} (نیاز {s['required'].normalize():f}، موجود {s['available'].normalize():f}، کسری {s['missing'].normalize():f})"
        for s in shortages
    ]
    return "موجودی کافی نیست: " + "؛ ".join(parts)


def validate_formula(formula):
    """قوانین کسب‌وکاری فرمول؛ در صورت خطا ValueError."""
    lines = list(formula.lines.all())
    if not lines:
        raise ValueError("فرمول باید حداقل یک ماده‌ی ورودی داشته باشد.")
    if any(l.material_id == formula.output_material_id for l in lines):
        raise ValueError("محصول خروجی نمی‌تواند ماده‌ی ورودی همان فرمول باشد.")
    validate_no_cycle(
        formula.business, formula.id, formula.output_material_id, [l.material_id for l in lines]
    )


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
def complete_production(order, produced_quantity=None, user=None, scrap_quantity=None,
                        consumed=None):
    """
    اجرای دستور تولید: خروج مواد ورودی از انبار و ورود محصول خروجی.

    - مصرف مواد بر اساس مقدار برنامه‌ریزی‌شده محاسبه می‌شود (ضایعات خط تولید
      با کم‌بودن produced_quantity در بهای تمام‌شده دیده می‌شود).
    - اگر موجودی هر ماده کافی نباشد، کل عملیات برگشت می‌خورد (ValueError).
    - consumed: {material_id: مقدار واقعی مصرف} برای ثبت مصرف واقعی به‌جای مقدار فرمول.
    - بهای کل = مواد + (دقیقه‌ی هر مرحله × نرخ ساعتی) + سربار ٪ فرمول؛ سهم محصولات جانبی
      از بهای کل کم و به خودشان داده می‌شود.
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

    business = order.business
    warehouse = order.warehouse or get_or_create_mother_warehouse(business)
    note = f"دستور تولید PO-{order.pk}"

    scrap = _nonneg(scrap_quantity, "ضایعات") if scrap_quantity not in (None, "") else ZERO
    consumed = {int(k): _nonneg(v, "مقدار مصرف") for k, v in (consumed or {}).items()}

    needs = required_materials(formula, order.planned_quantity)
    if consumed:
        for need in needs:
            if need["material"].id in consumed:
                need["quantity"] = consumed[need["material"].id].quantize(Q3)
    else:
        shortages = check_availability(business, warehouse, formula, order.planned_quantity)
        if shortages:
            raise ValueError(shortage_message(shortages))

    material_cost = ZERO
    short = []
    for need in needs:
        material = need["material"]
        qty = need["quantity"]
        if qty <= 0:
            continue
        have = _d(get_stock_level(business, warehouse, material)["quantity"])
        if have < qty:
            short.append({"material_id": material.id, "material": material.name,
                          "required": qty, "available": have, "missing": qty - have})
            continue
        issue_stock(
            business, warehouse, material, qty,
            reason="production", destination=note, user=user, notes=note,
        )
        material_cost += qty * _d(material.price)
    if short:
        raise ValueError(shortage_message(short))

    # مراحل باز با پایان دستور بسته می‌شوند (زمان برنامه‌ریزی‌شده ملاک بها)
    now = timezone.now()
    operation_cost = ZERO
    for step in ProductionOrderStep.all_objects.filter(order=order):
        if step.status in (ProductionOrderStep.Status.PENDING, ProductionOrderStep.Status.IN_PROGRESS):
            step.status = ProductionOrderStep.Status.DONE
            step.started_at = step.started_at or now
            step.completed_at = now
            step.save(update_fields=["status", "started_at", "completed_at"])
        if step.status == ProductionOrderStep.Status.SKIPPED:
            continue
        minutes = step.actual_minutes if step.actual_minutes is not None else step.planned_minutes
        operation_cost += _d(minutes) / Decimal("60") * _d(step.hourly_rate)

    overhead = material_cost * _d(formula.overhead_percent) / Decimal("100")
    total_cost = material_cost + operation_cost + overhead
    byproducts = list(formula.byproducts.select_related("material"))
    share = sum((_d(b.cost_share_percent) for b in byproducts), ZERO)
    if share >= 100:
        share = ZERO
    main_cost = total_cost * (Decimal("100") - share) / Decimal("100")
    unit_cost = (main_cost / produced).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    output = RawMaterial.all_objects.select_for_update().get(pk=formula.output_material_id)
    old_qty = _d(output.quantity)
    receive_stock(
        business, warehouse, output, produced,
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

    # محصولات جانبی (به نسبت مقدار برنامه‌ریزی‌شده)
    scale = order.planned_quantity / formula.output_quantity
    for b in byproducts:
        bq = (_d(b.quantity) * scale).quantize(Q3, rounding=ROUND_HALF_UP)
        if bq <= 0:
            continue
        b_cost = total_cost * _d(b.cost_share_percent) / Decimal("100")
        receive_stock(
            business, warehouse, b.material, bq,
            unit_price=(b_cost / bq).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
            user=user, notes=note + " (محصول جانبی)",
        )

    order.produced_quantity = produced
    order.scrap_quantity = scrap
    order.material_cost = material_cost.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    order.operation_cost = (operation_cost + overhead).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
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
