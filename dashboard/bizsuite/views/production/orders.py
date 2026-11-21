"""
خط تولید — دستورهای تولید
"""
import logging

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ...models import Formula, ProductionOrder, ProductionOrderStep, Warehouse
from ...production_engine import BomGraph, to_json
from ...production_services import (
    cancel_production,
    complete_production,
    create_order_steps,
    finish_step,
    required_materials,
    start_production,
    start_step,
    stock_report,
    validate_formula,
)
from ...inventory_services import get_or_create_mother_warehouse
from ...utils import api_error, api_success
from ..common import ProductionPerm, StaffAuth, staff_business
from .formulas import _dec, _num
from ...activity import audit

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  دستورهای تولید
# ═══════════════════════════════════════

def _order_data(o, business=None, with_needs=False):
    data = {
        "id": o.id,
        "number": f"PO-{o.id}",
        "formula_id": o.formula_id,
        "formula": o.formula.name,
        "output_material": o.formula.output_material.name,
        "output_unit": o.formula.output_material.unit,
        "warehouse_id": o.warehouse_id,
        "planned_quantity": _num(o.planned_quantity),
        "produced_quantity": _num(o.produced_quantity),
        "status": o.status,
        "status_display": o.get_status_display(),
        "total_cost": _num(o.total_cost),
        "unit_cost": _num(o.unit_cost),
        "material_cost": _num(o.material_cost),
        "operation_cost": _num(o.operation_cost),
        "scrap_quantity": _num(o.scrap_quantity),
        "planned_minutes": _num(o.planned_minutes),
        "parent_id": o.parent_id,
        "notes": o.notes,
        "created_at": o.created_at.isoformat(),
        "started_at": o.started_at.isoformat() if o.started_at else None,
        "completed_at": o.completed_at.isoformat() if o.completed_at else None,
    }
    if with_needs:
        data["steps"] = [_step_data(s) for s in o.steps.all()]
        wh = o.warehouse or get_or_create_mother_warehouse(business)
        data["required"] = [
            {"material_id": n["material"].id, "material": n["material"].name,
             "unit": n["material"].unit, "quantity": _num(n["quantity"]),
             "stage_id": n.get("stage_id")}
            for n in required_materials(o.formula, o.planned_quantity)
        ]
        report = stock_report(business, wh, o.formula, o.planned_quantity)
        data["lines"] = [
            {**l, "required": _num(l["required"]), "available": _num(l["available"]),
             "missing": _num(l["missing"])}
            for l in report
        ]
        data["ready"] = all(l["ready"] for l in report)
        data["shortages"] = [
            {"material_id": l["material_id"], "material": l["material"],
             "required": _num(l["required"]), "available": _num(l["available"]),
             "missing": _num(l["missing"])}
            for l in report if not l["ready"]
        ]
    return data


def _step_data(s):
    return {
        "id": s.id, "sequence": s.sequence, "name": s.name, "workstation": s.workstation,
        "instructions": s.instructions, "quality_check": s.quality_check,
        "status": s.status, "stage_id": s.stage_id,
        "planned_minutes": _num(s.planned_minutes),
        "actual_minutes": _num(s.actual_minutes) if s.actual_minutes is not None else None,
        "good_quantity": _num(s.good_quantity) if s.good_quantity is not None else None,
        "scrap_quantity": _num(s.scrap_quantity),
        "quality_ok": s.quality_ok, "notes": s.notes,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "completed_at": s.completed_at.isoformat() if s.completed_at else None,
    }


def _create_order(business, formula, qty, warehouse, notes, user, parent=None):
    o = ProductionOrder.objects.create(
        business=business, formula=formula, planned_quantity=qty,
        warehouse=warehouse, notes=notes, created_by=user, parent=parent,
    )
    create_order_steps(o)
    return o


def _warehouse(business, raw):
    if not raw:
        return None
    wh = Warehouse.objects.filter(pk=raw, business=business).first()
    if not wh:
        raise ValueError("انبار پیدا نشد.")
    return wh


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
@audit("production", "order", "دستور تولید")
def production_orders(request):
    business = staff_business(request)
    if business is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")

    if request.method == "GET":
        qs = ProductionOrder.objects.filter(business=business).select_related(
            "formula", "formula__output_material"
        )
        st = request.query_params.get("status")
        if st in dict(ProductionOrder.Status.choices):
            qs = qs.filter(status=st)
        return api_success(data=[_order_data(o) for o in qs[:200]])

    d = request.data
    formula = Formula.objects.filter(
        pk=d.get("formula_id") or 0, business=business, is_active=True
    ).select_related("output_material").first()
    if not formula:
        return api_error("فرمول فعال پیدا نشد.")
    try:
        qty = _dec(d.get("planned_quantity"), "مقدار تولید")
        validate_formula(formula)
        warehouse = _warehouse(business, d.get("warehouse_id"))
    except ValueError as exc:
        return api_error(str(exc))
    with transaction.atomic():
        o = _create_order(business, formula, qty, warehouse, str(d.get("notes") or ""), request.user)
    return api_success(
        data=_order_data(o, business, with_needs=True),
        message="دستور تولید ثبت شد.", status_code=201,
    )


def _get_order(request, pk):
    business = staff_business(request)
    if business is None:
        return None, None
    o = get_object_or_404(
        ProductionOrder.objects.filter(business=business).select_related(
            "formula", "formula__output_material", "warehouse"
        ),
        pk=pk,
    )
    return business, o


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
def production_order_detail(request, pk):
    business, o = _get_order(request, pk)
    if o is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    return api_success(data=_order_data(o, business, with_needs=True))


def _transition(request, pk, action):
    business, o = _get_order(request, pk)
    if o is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    try:
        if action == "start":
            o = start_production(o, user=request.user)
        elif action == "complete":
            produced = request.data.get("produced_quantity")
            if produced is not None:
                produced = _dec(produced, "مقدار تولیدشده")
            consumed = {}
            raw = request.data.get("consumed") or []
            if not isinstance(raw, list):
                raise ValueError("مصرف واقعی نامعتبر است.")
            for row in raw[:200]:
                try:
                    consumed[int(row.get("material_id"))] = _dec(
                        row.get("quantity"), "مقدار مصرف", allow_zero=True)
                except (AttributeError, TypeError) as exc:
                    raise ValueError("مصرف واقعی نامعتبر است.") from exc
            o = complete_production(
                o, produced_quantity=produced, user=request.user,
                scrap_quantity=request.data.get("scrap_quantity"), consumed=consumed or None,
            )
        else:
            o = cancel_production(o)
    except ValueError as exc:
        return api_error(str(exc))
    except Exception:
        logger.exception("production %s failed", action)
        return api_error("عملیات ناموفق بود.", status_code=500)
    o = ProductionOrder.objects.select_related(
        "formula", "formula__output_material"
    ).get(pk=o.pk)
    return api_success(data=_order_data(o), message="انجام شد.")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
@audit("production", "order_start", "شروع تولید")
def production_order_start(request, pk):
    return _transition(request, pk, "start")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
@audit("production", "order_complete", "تکمیل تولید")
def production_order_complete(request, pk):
    return _transition(request, pk, "complete")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
@audit("production", "order_cancel", "لغو تولید")
def production_order_cancel(request, pk):
    return _transition(request, pk, "cancel")


# ═══════════════════════════════════════
#  مراحل دستور تولید (کارت کار)
# ═══════════════════════════════════════

def _step_action(request, pk, step_id, action):
    business, o = _get_order(request, pk)
    if o is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    if not ProductionOrderStep.objects.filter(pk=step_id, order=o).exists():
        return api_error("مرحله پیدا نشد.", status_code=404)
    try:
        if action == "start":
            start_step(o, step_id, user=request.user)
        else:
            finish_step(o, step_id, data=request.data, skip=(action == "skip"), user=request.user)
    except ValueError as exc:
        return api_error(str(exc))
    o = ProductionOrder.objects.select_related(
        "formula", "formula__output_material", "warehouse").get(pk=o.pk)
    return api_success(data=_order_data(o, business, with_needs=True), message="انجام شد.")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
@audit("production", "step_start", "شروع مرحله‌ی تولید")
def production_step_start(request, pk, step_id):
    return _step_action(request, pk, step_id, "start")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
@audit("production", "step_complete", "پایان مرحله‌ی تولید")
def production_step_complete(request, pk, step_id):
    return _step_action(request, pk, step_id, "complete")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
@audit("production", "step_skip", "رد کردن مرحله‌ی تولید")
def production_step_skip(request, pk, step_id):
    return _step_action(request, pk, step_id, "skip")


# ═══════════════════════════════════════
#  برنامه‌ریز «چند تا می‌خواهم؟»
# ═══════════════════════════════════════

MAX_PLAN_ITEMS = 30


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
@audit("production", "plan", "برنامه‌ریزی تولید")
def production_plan(request):
    """
    items: [{formula_id, quantity}] → نیاز مواد (چندسطحی) در برابر موجودی، کسری و لیست خرید،
    نیمه‌آماده‌هایی که اول باید ساخته شوند، زمان مراحل، بهای تمام‌شده و حداکثر قابل تولید.
    create_orders=true: برای هر مرحله‌ی ساخت یک دستور تولید ثبت می‌شود (نیمه‌آماده‌ها زیرِ دستور اصلی).
    """
    business = staff_business(request)
    if business is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    d = request.data
    items = d.get("items")
    if not isinstance(items, list) or not items:
        return api_error("حداقل یک محصول و مقدار لازم است.")
    if len(items) > MAX_PLAN_ITEMS:
        return api_error("تعداد اقلام برنامه زیاد است.")
    try:
        warehouse = _warehouse(business, d.get("warehouse_id"))
        graph = BomGraph(business, warehouse=warehouse)
        targets = []
        for it in items:
            if not isinstance(it, dict):
                raise ValueError("قلم برنامه نامعتبر است.")
            try:
                fid = int(it.get("formula_id"))
            except (TypeError, ValueError):
                raise ValueError("فرمول نامعتبر است.")
            if fid not in graph.formulas:
                raise ValueError("فرمول فعال پیدا نشد.")
            targets.append((fid, _dec(it.get("quantity"), "مقدار")))
        use_stock = d.get("use_stock", True) is not False
        result = graph.plan(targets, use_stock=use_stock)
        for row in result["targets"]:
            row["max_producible"] = graph.max_producible(row["formula_id"])
    except ValueError as exc:
        return api_error(str(exc))

    created = []
    if d.get("create_orders"):
        with transaction.atomic():
            parents = {}
            for t in result["targets"]:
                f = Formula.objects.get(pk=t["formula_id"], business=business)
                o = _create_order(business, f, t["quantity"], warehouse,
                                  str(d.get("notes") or ""), request.user)
                parents.setdefault(t["formula_id"], o)
                created.append(o)
            first_parent = created[0] if created else None
            for step in result["make_steps"]:
                if step["is_target"]:
                    continue
                f = Formula.objects.get(pk=step["formula_id"], business=business)
                o = _create_order(business, f, step["quantity"], warehouse,
                                  str(d.get("notes") or ""), request.user, parent=first_parent)
                created.append(o)
    result["created_orders"] = [
        {"id": o.id, "number": f"PO-{o.id}", "formula": o.formula.name,
         "planned_quantity": o.planned_quantity, "parent_id": o.parent_id}
        for o in created
    ]
    return api_success(data=to_json(result))
