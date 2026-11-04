"""
Inventory — لیست حرکات انبار و پیشنهاد خرید
"""
from django.core.paginator import EmptyPage, Paginator
from django.db.models import Q
from django.http import JsonResponse
from django.utils.dateparse import parse_date

from rest_framework.decorators import api_view, permission_classes

from ...inventory_services import get_stock_totals
from ...models import InventoryMovement, RawMaterial
from ..common import (
    InventoryPerm,
    ZERO,
    no_business_response,
    parse_int,
    resolve_business_active,
)

PAGE_SIZE = 50

# نوع نمایشی UI برای هر حرکت
_KIND = {"in": "receive", "out": "issue"}


def _kind(m):
    if m.reference_type == "transfer":
        return "transfer"
    return _KIND.get(m.movement_type, m.movement_type)


def _bad(msg):
    return JsonResponse({"success": False, "error": msg}, status=400)


@api_view(["GET"])
@permission_classes([InventoryPerm])
def movement_list(request):
    """لیست صفحه‌بندی‌شدهٔ حرکات انبار (جدیدترین اول)"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    qs = (
        InventoryMovement.all_objects.filter(business=business)
        .select_related("raw_material", "warehouse", "created_by")
        .order_by("-created_at", "-pk")
    )

    mtype = (request.GET.get("type") or "").strip()
    if mtype in ("in", "out"):
        qs = qs.filter(movement_type=mtype).exclude(reference_type="transfer")
    elif mtype in ("waste", "adjustment"):
        qs = qs.filter(movement_type=mtype)
    elif mtype == "transfer":
        qs = qs.filter(reference_type="transfer")
    elif mtype:
        return _bad("نوع حرکت نامعتبر است.")

    for param, field in (("warehouse_id", "warehouse_id"), ("material_id", "raw_material_id")):
        raw = request.GET.get(param)
        if raw:
            try:
                qs = qs.filter(**{field: int(raw)})
            except ValueError:
                return _bad("شناسه نامعتبر است.")

    date_from, date_to = request.GET.get("from"), request.GET.get("to")
    try:
        if date_from:
            d = parse_date(date_from)
            if not d:
                return _bad("تاریخ شروع نامعتبر است.")
            qs = qs.filter(created_at__date__gte=d)
        if date_to:
            d = parse_date(date_to)
            if not d:
                return _bad("تاریخ پایان نامعتبر است.")
            qs = qs.filter(created_at__date__lte=d)
    except ValueError:
        return _bad("تاریخ نامعتبر است.")

    search = (request.GET.get("search") or "").strip()
    if search:
        qs = qs.filter(Q(raw_material__name__icontains=search) | Q(notes__icontains=search))

    page_size = parse_int(request.GET.get("page_size"), default=PAGE_SIZE, maximum=200)
    paginator = Paginator(qs, page_size)
    page_no = parse_int(request.GET.get("page"), default=1, maximum=10**6)
    try:
        page = paginator.page(page_no)
    except EmptyPage:
        page = paginator.page(paginator.num_pages)

    results = []
    for m in page.object_list:
        mat = m.raw_material
        price = mat.price or ZERO
        results.append({
            "id": m.pk,
            "movement_type": m.movement_type,
            "movement_type_display": m.get_movement_type_display(),
            "kind": _kind(m),
            "reference_type": m.reference_type,
            "reference_id": m.reference_id,
            "raw_material_id": mat.pk,
            "material_name": mat.name,
            "material_unit": mat.unit,
            "material_unit_display": mat.get_unit_display(),
            "warehouse_id": m.warehouse_id,
            "warehouse_name": m.warehouse.name if m.warehouse else "",
            "quantity": float(m.quantity),
            "previous_stock": float(m.previous_stock),
            "new_stock": float(m.new_stock),
            "unit_price": int(price),
            "total_value": int(m.quantity * price),
            "waste_reason": m.waste_reason,
            "notes": m.notes or "",
            "user": (m.created_by.get_full_name() or m.created_by.get_username()) if m.created_by else "",
            "created_at": m.created_at.isoformat(),
        })

    return JsonResponse({
        "success": True,
        "results": results,
        "count": paginator.count,
        "page": page.number,
        "pages": paginator.num_pages,
        "page_size": page_size,
    })


@api_view(["GET"])
@permission_classes([InventoryPerm])
def purchase_suggestions(request):
    """پیشنهاد خرید: کالاهایی که موجودی کل آن‌ها از حداقل کمتر یا مساوی است"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    totals = get_stock_totals(business)
    results = []
    grand_total = ZERO
    for mat in RawMaterial.all_objects.filter(business=business, minimum_stock__gt=0).order_by("name"):
        qty = totals.get(mat.pk, ZERO)
        minimum = mat.minimum_stock or ZERO
        if qty > minimum:
            continue
        suggested = max((mat.target_stock or ZERO) - qty, minimum - qty)
        if suggested <= 0:
            continue
        price = mat.price or ZERO
        cost = suggested * price
        grand_total += cost
        results.append({
            "id": mat.pk,
            "raw_material_id": mat.pk,
            "material_name": mat.name,
            "unit": mat.unit,
            "unit_display": mat.get_unit_display(),
            "quantity": float(qty),
            "minimum_stock": float(minimum),
            "target_stock": float(mat.target_stock or 0),
            "suggested_quantity": float(suggested),
            "price": int(price),
            "estimated_cost": int(cost),
        })

    return JsonResponse({
        "success": True,
        "results": results,
        "count": len(results),
        "total_estimated_cost": int(grand_total),
    })
