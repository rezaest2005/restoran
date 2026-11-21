"""
فرمولاسیون — فرمول‌ها (چندسطحی)، مراحل خط تولید، محصولات جانبی، تحلیل و «کارت را توصیف کن»
"""
import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ...inventory_services import get_stock_totals
from ...models import Formula, FormulaByProduct, FormulaLine, FormulaStage, RawMaterial
from ...models.common import UNIT_CHOICES
from ...production_engine import formula_analysis, line_requirement, convert, to_json, units_compatible
from ...production_parser import MAX_CHARS, parse_process
from ...production_services import sub_formula_map, validate_no_cycle
from ...utils import api_error, api_success
from ..common import FormulaPerm, MaterialsPerm, StaffAuth, staff_business
from ...activity import audit

logger = logging.getLogger(__name__)


MAX_LINES = 100
MAX_STAGES = 40
MAX_BYPRODUCTS = 20
UNITS = {u for u, _ in UNIT_CHOICES}


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


def _opt_dec(item, key, field):
    v = item.get(key)
    if v in (None, ""):
        return Decimal("0")
    return _dec(v, field, allow_zero=True)


def _num(d):
    return float(d)


def _stage_data(s):
    return {
        "id": s.id, "sequence": s.sequence, "name": s.name, "workstation": s.workstation,
        "setup_minutes": _num(s.setup_minutes), "run_minutes": _num(s.run_minutes),
        "capacity": _num(s.capacity), "labour_rate": _num(s.labour_rate),
        "overhead_rate": _num(s.overhead_rate), "instructions": s.instructions,
        "quality_check": s.quality_check,
    }


def _formula_data(f, with_lines=True):
    data = {
        "id": f.id,
        "name": f.name,
        "code": f.code,
        "version": f.version,
        "is_active": f.is_active,
        "notes": f.notes,
        "industry": f.industry,
        "overhead_percent": _num(f.overhead_percent),
        "output_material_id": f.output_material_id,
        "output_material": f.output_material.name,
        "output_unit": f.output_material.unit,
        "output_type": f.output_material.material_type,
        "output_quantity": _num(f.output_quantity),
    }
    if with_lines:
        stages = list(f.stages.all())
        stage_index = {s.id: i for i, s in enumerate(stages)}
        lines = list(f.lines.select_related("material"))
        totals = get_stock_totals(f.business_id)
        subs = sub_formula_map(f.business_id, [l.material_id for l in lines], f.id)
        out = []
        batch_cost = Decimal("0")
        for l in lines:
            base = convert(l.quantity, l.unit, l.material.unit) if l.unit else l.quantity
            need = line_requirement(base, l.wastage_percent, l.setup_quantity, l.rounding_multiple, 1)
            stock = totals.get(l.material_id, Decimal("0"))
            batch_cost += need * l.material.price
            out.append({
                "id": l.id,
                "material_id": l.material_id,
                "material": l.material.name,
                "material_type": l.material.material_type,
                "unit": l.material.unit,
                "line_unit": l.unit or l.material.unit,
                "quantity": _num(l.quantity),
                "wastage_percent": _num(l.wastage_percent),
                "setup_quantity": _num(l.setup_quantity),
                "rounding_multiple": _num(l.rounding_multiple),
                "stage_id": l.stage_id,
                "stage_index": stage_index.get(l.stage_id),
                "notes": l.notes,
                "unit_price": _num(l.material.price),
                "stock_quantity": _num(stock),
                "required_for_batch": _num(need),
                "available_for_one_batch": stock >= need,
                "is_semi_finished_with_formula": l.material_id in subs,
                "sub_formula_id": subs.get(l.material_id),
            })
        data["lines"] = out
        data["batch_cost"] = _num(batch_cost)
        data["stages"] = [_stage_data(s) for s in stages]
        data["byproducts"] = [
            {"id": b.id, "material_id": b.material_id, "material": b.material.name,
             "unit": b.material.unit, "quantity": _num(b.quantity),
             "cost_share_percent": _num(b.cost_share_percent)}
            for b in f.byproducts.select_related("material")
        ]
    return data


def _material(business, raw_id, label="ماده‌ی ورودی"):
    try:
        mid = int(raw_id)
    except (TypeError, ValueError):
        raise ValueError(f"{label} نامعتبر است.")
    m = RawMaterial.objects.filter(pk=mid, business=business).first()
    if not m:
        raise ValueError(f"{label} پیدا نشد.")
    return m


def _save_stages(business, formula, raw_stages):
    if not isinstance(raw_stages, list):
        raise ValueError("مراحل نامعتبر است.")
    if len(raw_stages) > MAX_STAGES:
        raise ValueError("تعداد مراحل زیاد است.")
    new = []
    for i, item in enumerate(raw_stages, start=1):
        if not isinstance(item, dict):
            raise ValueError("مرحله نامعتبر است.")
        name = str(item.get("name") or "").strip()[:120]
        if not name:
            raise ValueError(f"نام مرحله‌ی {i} الزامی است.")
        new.append(FormulaStage(
            business=business, formula=formula, sequence=i, name=name,
            workstation=str(item.get("workstation") or "").strip()[:120],
            setup_minutes=_opt_dec(item, "setup_minutes", "زمان آماده‌سازی"),
            run_minutes=_opt_dec(item, "run_minutes", "زمان هر نوبت"),
            capacity=_opt_dec(item, "capacity", "ظرفیت هر نوبت"),
            labour_rate=_opt_dec(item, "labour_rate", "دستمزد در ساعت"),
            overhead_rate=_opt_dec(item, "overhead_rate", "سربار در ساعت"),
            instructions=str(item.get("instructions") or "")[:4000],
            quality_check=str(item.get("quality_check") or "")[:300],
        ))
    formula.stages.all().delete()
    for s in new:
        s.save()
    return new


def _save_lines(business, formula, raw_lines):
    if not isinstance(raw_lines, list) or not raw_lines:
        raise ValueError("فرمول باید حداقل یک ماده‌ی ورودی داشته باشد.")
    if len(raw_lines) > MAX_LINES:
        raise ValueError("تعداد اقلام فرمول زیاد است.")
    stages = list(formula.stages.all())
    seen = set()
    new_lines = []
    for item in raw_lines:
        if not isinstance(item, dict):
            raise ValueError("ماده‌ی ورودی نامعتبر است.")
        material = _material(business, item.get("material_id"))
        if material.id in seen:
            raise ValueError("ماده‌ی ورودی تکراری است.")
        seen.add(material.id)
        if material.id == formula.output_material_id:
            raise ValueError("محصول خروجی نمی‌تواند ماده‌ی ورودی همان فرمول باشد.")
        qty = _dec(item.get("quantity"), "مقدار")
        waste = _dec(item.get("wastage_percent", 0) or 0, "درصد ضایعات", allow_zero=True)
        if waste >= 100:
            raise ValueError("درصد ضایعات باید کمتر از ۱۰۰ باشد.")
        unit = str(item.get("unit") or "").strip()
        if unit == material.unit:
            unit = ""
        if unit and (unit not in UNITS or not units_compatible(unit, material.unit)):
            raise ValueError(f"واحد «{unit}» برای «{material.name}» قابل تبدیل نیست.")
        stage = None
        si = item.get("stage_index")
        if si not in (None, ""):
            try:
                stage = stages[int(si)]
            except (TypeError, ValueError, IndexError):
                raise ValueError("مرحله‌ی مصرف نامعتبر است.")
        new_lines.append(FormulaLine(
            business=business, formula=formula, material=material,
            quantity=qty, wastage_percent=waste, unit=unit,
            setup_quantity=_opt_dec(item, "setup_quantity", "مقدار ثابت راه‌اندازی"),
            rounding_multiple=_opt_dec(item, "rounding_multiple", "مضرب گرد کردن"),
            stage=stage, notes=str(item.get("notes") or "")[:200],
        ))
    validate_no_cycle(business, formula.id, formula.output_material_id, list(seen))
    formula.lines.all().delete()
    FormulaLine.objects.bulk_create(new_lines)


def _save_byproducts(business, formula, raw):
    if not isinstance(raw, list):
        raise ValueError("محصولات جانبی نامعتبر است.")
    if len(raw) > MAX_BYPRODUCTS:
        raise ValueError("تعداد محصولات جانبی زیاد است.")
    new, seen, share = [], set(), Decimal("0")
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("محصول جانبی نامعتبر است.")
        m = _material(business, item.get("material_id"), "محصول جانبی")
        if m.id == formula.output_material_id or m.id in seen:
            raise ValueError("محصول جانبی تکراری یا همان خروجی است.")
        seen.add(m.id)
        pct = _opt_dec(item, "cost_share_percent", "سهم بها")
        share += pct
        new.append(FormulaByProduct(
            business=business, formula=formula, material=m,
            quantity=_dec(item.get("quantity"), "مقدار محصول جانبی"), cost_share_percent=pct,
        ))
    if share >= 100:
        raise ValueError("مجموع سهم بهای محصولات جانبی باید کمتر از ۱۰۰٪ باشد.")
    formula.byproducts.all().delete()
    FormulaByProduct.objects.bulk_create(new)


def _apply_header(business, f, d, creating):
    if creating or "name" in d:
        name = str(d.get("name") or "").strip()[:200]
        if not name:
            raise ValueError("نام فرمول الزامی است.")
        f.name = name
    if "code" in d:
        f.code = str(d["code"] or "")[:50]
    if "notes" in d:
        f.notes = str(d["notes"] or "")
    if "industry" in d:
        f.industry = str(d["industry"] or "")[:30]
    if "overhead_percent" in d:
        f.overhead_percent = _opt_dec(d, "overhead_percent", "درصد سربار")
        if f.overhead_percent > 1000:
            raise ValueError("درصد سربار نامعتبر است.")
    if "is_active" in d:
        f.is_active = bool(d["is_active"])
    if creating or "output_quantity" in d:
        f.output_quantity = _dec(d.get("output_quantity", 1), "مقدار تولید هر دسته")
    if creating or "output_material_id" in d:
        out = RawMaterial.objects.filter(
            pk=d.get("output_material_id") or 0, business=business
        ).first()
        if not out:
            raise ValueError("محصول خروجی پیدا نشد.")
        f.output_material = out


def _save_structure(business, f, d):
    if "stages" in d:
        _save_stages(business, f, d.get("stages") or [])
    if "lines" in d:
        _save_lines(business, f, d.get("lines"))
    if "byproducts" in d:
        _save_byproducts(business, f, d.get("byproducts") or [])


# ═══════════════════════════════════════
#  فهرست مواد برای انتخابگر فرمول / دستور تولید
# ═══════════════════════════════════════

@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([MaterialsPerm])
def production_materials(request):
    """همه‌ی مواد کسب‌وکار با id و نوع (خام / بسته‌بندی / نیمه‌آماده / آماده)."""
    business = staff_business(request)
    if business is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    qs = RawMaterial.objects.filter(business=business).order_by("name")
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
@audit("production", "formula", "فرمول")
def formulas(request):
    business = staff_business(request)
    if business is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")

    if request.method == "GET":
        qs = Formula.objects.filter(business=business).select_related("output_material")
        return api_success(data=[_formula_data(f, with_lines=False) for f in qs[:500]])

    d = request.data
    try:
        with transaction.atomic():
            f = Formula(business=business)
            _apply_header(business, f, d, creating=True)
            f.save()
            if "lines" not in d:
                raise ValueError("فرمول باید حداقل یک ماده‌ی ورودی داشته باشد.")
            _save_structure(business, f, d)
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_formula_data(f), message="فرمول ساخته شد.", status_code=201)


@api_view(["GET", "PUT", "DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([FormulaPerm])
@audit("production", "formula", "فرمول")
def formula_detail(request, pk):
    business = staff_business(request)
    if business is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    f = get_object_or_404(
        Formula.objects.filter(business=business).select_related("output_material"), pk=pk
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
            _apply_header(business, f, d, creating=False)
            if any(k in d for k in ("lines", "stages", "byproducts")):
                f.version += 1
                f.save()
                _save_structure(business, f, d)
            if "lines" not in d:
                ids = list(f.lines.values_list("material_id", flat=True))
                validate_no_cycle(business, f.id, f.output_material_id, ids)
                f.save()
    except ValueError as exc:
        return api_error(str(exc))
    f.refresh_from_db()
    return api_success(data=_formula_data(f), message="فرمول ذخیره شد.")


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([FormulaPerm])
def formula_analysis_view(request, pk):
    """بهای تمام‌شده (مواد + دستمزد + سربار)، حاشیه‌ی سود، گلوگاه و بازده واقعی."""
    business = staff_business(request)
    if business is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    f = get_object_or_404(Formula.objects.filter(business=business), pk=pk)
    try:
        data = formula_analysis(business, f)
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=to_json(data))


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([FormulaPerm])
def formula_parse_process(request):
    """«کارت را توصیف کن»: متن ساده → پیش‌نویس مراحل و مواد (قطعی، بدون هوش مصنوعی)."""
    business = staff_business(request)
    if business is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    text = str(request.data.get("text") or "")
    if not text.strip():
        return api_error("متنی وارد نشده است.")
    if len(text) > MAX_CHARS:
        return api_error("متن خیلی طولانی است.")
    mats = RawMaterial.objects.filter(business=business).values_list("id", "name", "unit")[:3000]
    return api_success(data=to_json(parse_process(text, list(mats))))
