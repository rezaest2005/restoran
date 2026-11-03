"""
Inventory — لیست موجودی و حداقل موجودی
"""
import logging

from django.db.models import Q
from django.http import JsonResponse

from rest_framework.decorators import api_view, permission_classes

from ...models import RawMaterial, StockItem
from ..common import (
    InventoryPerm,
    ZERO,
    no_restaurant_response,
    parse_decimal,
    resolve_restaurant_active,
    safe_float,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  ★ STOCK — موجودی انبار
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([InventoryPerm])
def stock_list(request):
    """موجودی کالاها"""
    restaurant = resolve_restaurant_active(request)
    if not restaurant:
        return no_restaurant_response()

    warehouse_id = request.GET.get("warehouse_id")
    search = (request.GET.get("search") or "").strip()

    qs = StockItem.objects.select_related("raw_material", "warehouse").filter(
        restaurant=restaurant
    )
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    if search:
        qs = qs.filter(Q(raw_material__name__icontains=search))

    items = []
    for s in qs.order_by("raw_material__name"):
        price = s.raw_material.price or ZERO
        items.append({
            "id": s.pk,
            "raw_material_id": s.raw_material.pk,
            "material_name": s.raw_material.name,
            "material_unit": s.raw_material.unit,
            "material_unit_display": s.raw_material.get_unit_display(),
            "material_price": int(price),
            "warehouse_id": s.warehouse.pk,
            "warehouse_name": s.warehouse.name,
            "quantity": float(s.quantity),
            "total_value": int(s.quantity * price),
            "minimum_stock": float(s.raw_material.minimum_stock or 0),
            "target_stock": float(s.raw_material.target_stock or 0),
        })

    return JsonResponse({"success": True, "items": items, "count": len(items)})


@api_view(["POST"])
@permission_classes([InventoryPerm])
def stock_minimum_update(request):
    """ویرایش حداقل موجودی / موجودی هدف"""
    restaurant = resolve_restaurant_active(request)
    if not restaurant:
        return no_restaurant_response()

    data = request.data
    material_id = data.get("raw_material_id")

    if not material_id:
        return JsonResponse({"success": False, "error": "شناسه کالا ارسال نشد."}, status=400)

    mat = RawMaterial.all_objects.filter(pk=material_id, restaurant=restaurant).first()
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    minimum_stock = data.get("minimum_stock")
    target_stock = data.get("target_stock")

    try:
        if minimum_stock is not None:
            mat.minimum_stock = parse_decimal(minimum_stock, "حداقل موجودی")
        if target_stock is not None:
            mat.target_stock = parse_decimal(target_stock, "موجودی هدف")
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    mat.save(update_fields=["minimum_stock", "target_stock"])

    return JsonResponse({
        "success": True,
        "msg": "بروزرسانی شد.",
        "minimum_stock": safe_float(mat.minimum_stock),
        "target_stock": safe_float(mat.target_stock),
    })
