"""
خط تولید — دستورهای تولید
"""
import logging

from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ...models import Formula, ProductionOrder, Warehouse
from ...production_services import (
    cancel_production,
    check_availability,
    complete_production,
    required_materials,
    start_production,
    validate_formula,
)
from ...inventory_services import get_or_create_mother_warehouse
from ...utils import api_error, api_success
from ..common import ProductionPerm, StaffAuth, staff_restaurant
from .formulas import _dec, _num

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  دستورهای تولید
# ═══════════════════════════════════════

def _order_data(o, restaurant=None, with_needs=False):
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
        "notes": o.notes,
        "created_at": o.created_at.isoformat(),
        "started_at": o.started_at.isoformat() if o.started_at else None,
        "completed_at": o.completed_at.isoformat() if o.completed_at else None,
    }
    if with_needs:
        wh = o.warehouse or get_or_create_mother_warehouse(restaurant)
        data["required"] = [
            {"material_id": n["material"].id, "material": n["material"].name,
             "unit": n["material"].unit, "quantity": _num(n["quantity"])}
            for n in required_materials(o.formula, o.planned_quantity)
        ]
        data["shortages"] = [
            {**s, "required": _num(s["required"]), "available": _num(s["available"]),
             "missing": _num(s["missing"])}
            for s in check_availability(restaurant, wh, o.formula, o.planned_quantity)
        ]
    return data


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
def production_orders(request):
    restaurant = staff_restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")

    if request.method == "GET":
        qs = ProductionOrder.objects.filter(restaurant=restaurant).select_related(
            "formula", "formula__output_material"
        )
        st = request.query_params.get("status")
        if st in dict(ProductionOrder.Status.choices):
            qs = qs.filter(status=st)
        return api_success(data=[_order_data(o) for o in qs[:200]])

    d = request.data
    formula = Formula.objects.filter(
        pk=d.get("formula_id") or 0, restaurant=restaurant, is_active=True
    ).select_related("output_material").first()
    if not formula:
        return api_error("فرمول فعال پیدا نشد.")
    try:
        qty = _dec(d.get("planned_quantity"), "مقدار تولید")
        validate_formula(formula)
        warehouse = None
        if d.get("warehouse_id"):
            warehouse = Warehouse.objects.filter(
                pk=d["warehouse_id"], restaurant=restaurant
            ).first()
            if not warehouse:
                raise ValueError("انبار پیدا نشد.")
    except ValueError as exc:
        return api_error(str(exc))
    o = ProductionOrder.objects.create(
        restaurant=restaurant, formula=formula, planned_quantity=qty,
        warehouse=warehouse, notes=str(d.get("notes") or ""),
        created_by=request.user,
    )
    return api_success(
        data=_order_data(o, restaurant, with_needs=True),
        message="دستور تولید ثبت شد.", status_code=201,
    )


def _get_order(request, pk):
    restaurant = staff_restaurant(request)
    if restaurant is None:
        return None, None
    o = get_object_or_404(
        ProductionOrder.objects.filter(restaurant=restaurant).select_related(
            "formula", "formula__output_material", "warehouse"
        ),
        pk=pk,
    )
    return restaurant, o


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
def production_order_detail(request, pk):
    restaurant, o = _get_order(request, pk)
    if o is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    return api_success(data=_order_data(o, restaurant, with_needs=True))


def _transition(request, pk, action):
    restaurant, o = _get_order(request, pk)
    if o is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    try:
        if action == "start":
            o = start_production(o, user=request.user)
        elif action == "complete":
            produced = request.data.get("produced_quantity")
            if produced is not None:
                produced = _dec(produced, "مقدار تولیدشده")
            o = complete_production(o, produced_quantity=produced, user=request.user)
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
def production_order_start(request, pk):
    return _transition(request, pk, "start")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
def production_order_complete(request, pk):
    return _transition(request, pk, "complete")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductionPerm])
def production_order_cancel(request, pk):
    return _transition(request, pk, "cancel")
