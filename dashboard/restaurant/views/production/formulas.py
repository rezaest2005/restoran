"""
فرمولاسیون — فرمول‌ها و مواد قابل استفاده
"""
import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ...models import Formula, FormulaLine, RawMaterial
from ...utils import api_error, api_success
from ..common import FormulaPerm, MaterialsPerm, StaffAuth, staff_restaurant

logger = logging.getLogger(__name__)


MAX_LINES = 100


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

@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([MaterialsPerm])
def production_materials(request):
    """همه‌ی مواد کسب‌وکار با id و نوع (خام / بسته‌بندی / نیمه‌آماده / آماده)."""
    restaurant = staff_restaurant(request)
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
    restaurant = staff_restaurant(request)
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
    restaurant = staff_restaurant(request)
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
