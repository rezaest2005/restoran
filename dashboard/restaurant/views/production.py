"""
فرمولاسیون و خط تولید — API

  /api/formulas/                     GET لیست، POST ساخت
  /api/formulas/<pk>/                GET جزئیات، PUT ویرایش، DELETE حذف
  /api/production/orders/            GET لیست، POST ساخت دستور تولید
  /api/production/orders/<pk>/       GET جزئیات + بررسی موجودی
  /api/production/orders/<pk>/start|complete|cancel/   POST

دسترسی: تب «recipes» (فرمولاسیون) و تب «kitchen» (خط تولید).
"""

import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ..middleware import TenantJWTAuthentication
from ..models import Formula, FormulaLine, ProductionOrder, RawMaterial, Warehouse
from ..production_services import (
    cancel_production,
    check_availability,
    complete_production,
    required_materials,
    start_production,
    validate_formula,
)
from ..inventory_services import get_or_create_mother_warehouse
from ..tenancy import set_current_restaurant
from ..utils import api_error, api_success
from .decorators import make_service_permission

logger = logging.getLogger(__name__)

StaffAuth = [SessionAuthentication, TenantJWTAuthentication]
FormulaPerm = make_service_permission("recipes")
ProductionPerm = make_service_permission("kitchen")
MAX_LINES = 100


def _restaurant(request):
    r = getattr(request.user, "restaurant", None)
    if r is not None:
        set_current_restaurant(r)
    return r


def _dec(value, field, minimum=None, allow_zero=False):
    try:
        d = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"«{field}» نامعتبر است.")
    if not d.is_finite():
        raise ValueError(f"«{field}» نامعتبر است.")
    if d < 0 or (d == 0 and not allow_zero):
        raise ValueError(f"«{field}» باید بزرگ‌تر از صفر باشد.")
    return d


def _num(d):
    return float(d)


def _formula_data(f, with_lines=True):
    data = {
        "id": f.id,
        "name": f.name,
        "code": f.code,
        "version": f.version,
        "is_active": f.is_active,
        "notes": f.notes,
        "output_material_id": f.output_material_id,
        "output_material": f.output_material.name,
        "output_unit": f.output_material.unit,
        "output_type": f.output_material.material_type,
        "output_quantity": _num(f.output_quantity),
    }
    if with_lines:
        data["lines"] = [
            {
                "id": l.id,
                "material_id": l.material_id,
                "material": l.material.name,
                "material_type": l.material.material_type,
                "unit": l.material.unit,
                "quantity": _num(l.quantity),
                "wastage_percent": _num(l.wastage_percent),
                "notes": l.notes,
                "unit_price": _num(l.material.price),
            }
            for l in f.lines.select_related("material")
        ]
        data["batch_cost"] = sum(
            (_num(l["quantity"]) * (1 + l["wastage_percent"] / 100) * l["unit_price"])
            for l in data["lines"]
        )
    return data


def _save_lines(restaurant, formula, raw_lines):
    if not isinstance(raw_lines, list) or not raw_lines:
        raise ValueError("فرمول باید حداقل یک ماده‌ی ورودی داشته باشد.")
    if len(raw_lines) > MAX_LINES:
        raise ValueError("تعداد اقلام فرمول زیاد است.")
    seen = set()
    new_lines = []
    for item in raw_lines:
        try:
            mid = int(item.get("material_id"))
        except (AttributeError, TypeError, ValueError):
            raise ValueError("ماده‌ی ورودی نامعتبر است.")
        if mid in seen:
            raise ValueError("ماده‌ی ورودی تکراری است.")
        seen.add(mid)
        if mid == formula.output_material_id:
            raise ValueError("محصول خروجی نمی‌تواند ماده‌ی ورودی همان فرمول باشد.")
        material = RawMaterial.objects.filter(pk=mid, restaurant=restaurant).first()
        if not material:
            raise ValueError("ماده‌ی ورودی پیدا نشد.")
        qty = _dec(item.get("quantity"), "مقدار")
        waste = _dec(item.get("wastage_percent", 0), "درصد ضایعات", allow_zero=True)
        if waste >= 100:
            raise ValueError("درصد ضایعات باید کمتر از ۱۰۰ باشد.")
        new_lines.append(FormulaLine(
            restaurant=restaurant, formula=formula, material=material,
            quantity=qty, wastage_percent=waste,
            notes=str(item.get("notes") or "")[:200],
        ))
    formula.lines.all().delete()
    FormulaLine.objects.bulk_create(new_lines)


# ═══════════════════════════════════════
#  فهرست مواد برای انتخابگر فرمول / دستور تولید
# ═══════════════════════════════════════

MaterialsPerm = make_service_permission("kitchen", "recipes")


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([MaterialsPerm])
def production_materials(request):
    """همه‌ی مواد کسب‌وکار با id و نوع (خام / بسته‌بندی / نیمه‌آماده / آماده)."""
    restaurant = _restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    qs = RawMaterial.objects.filter(restaurant=restaurant).order_by("name")
    kind = request.query_params.get("type")
    if kind in dict(RawMaterial.MATERIAL_TYPE_CHOICES):
        qs = qs.filter(material_type=kind)
    data = [
        {
            "id": m.id, "name": m.name, "unit": m.unit, "price": _num(m.price),
            "quantity": _num(m.quantity), "material_type": m.material_type,
        }
        for m in qs[:2000]
    ]
    return api_success(data=data)


# ═══════════════════════════════════════
#  فرمول‌ها
# ═══════════════════════════════════════

@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([FormulaPerm])
def formulas(request):
    restaurant = _restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")

    if request.method == "GET":
        qs = Formula.objects.filter(restaurant=restaurant).select_related("output_material")
        return api_success(data=[_formula_data(f, with_lines=False) for f in qs[:500]])

    d = request.data
    name = str(d.get("name") or "").strip()[:200]
    if not name:
        return api_error("نام فرمول الزامی است.")
    output = RawMaterial.objects.filter(
        pk=d.get("output_material_id") or 0, restaurant=restaurant
    ).first()
    if not output:
        return api_error("محصول خروجی پیدا نشد.")
    try:
        out_qty = _dec(d.get("output_quantity", 1), "مقدار تولید هر دسته")
        with transaction.atomic():
            f = Formula.objects.create(
                restaurant=restaurant, name=name,
                code=str(d.get("code") or "")[:50], output_material=output,
                output_quantity=out_qty, notes=str(d.get("notes") or ""),
            )
            _save_lines(restaurant, f, d.get("lines"))
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_formula_data(f), message="فرمول ساخته شد.", status_code=201)


@api_view(["GET", "PUT", "DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([FormulaPerm])
def formula_detail(request, pk):
    restaurant = _restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    f = get_object_or_404(
        Formula.objects.filter(restaurant=restaurant).select_related("output_material"), pk=pk
    )

    if request.method == "GET":
        return api_success(data=_formula_data(f))

    if request.method == "DELETE":
        try:
            f.delete()
        except ProtectedError:
            return api_error("این فرمول در دستور تولید استفاده شده؛ به‌جای حذف، غیرفعالش کنید.")
        return api_success(message="فرمول حذف شد.")

    d = request.data
    try:
        with transaction.atomic():
            if "name" in d:
                name = str(d["name"]).strip()[:200]
                if not name:
                    raise ValueError("نام فرمول الزامی است.")
                f.name = name
            if "code" in d:
                f.code = str(d["code"] or "")[:50]
            if "notes" in d:
                f.notes = str(d["notes"] or "")
            if "is_active" in d:
                f.is_active = bool(d["is_active"])
            if "output_quantity" in d:
                f.output_quantity = _dec(d["output_quantity"], "مقدار تولید هر دسته")
            if "output_material_id" in d:
                out = RawMaterial.objects.filter(
                    pk=d["output_material_id"] or 0, restaurant=restaurant
                ).first()
                if not out:
                    raise ValueError("محصول خروجی پیدا نشد.")
                f.output_material = out
            if "lines" in d:
                f.version += 1
                f.save()
                _save_lines(restaurant, f, d["lines"])
            else:
                validate_formula_inputs = f.lines.filter(material=f.output_material).exists()
                if validate_formula_inputs:
                    raise ValueError("محصول خروجی نمی‌تواند ماده‌ی ورودی همان فرمول باشد.")
                f.save()
    except ValueError as exc:
        return api_error(str(exc))
    f.refresh_from_db()
    return api_success(data=_formula_data(f), message="فرمول ذخیره شد.")


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
    restaurant = _restaurant(request)
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
    restaurant = _restaurant(request)
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
