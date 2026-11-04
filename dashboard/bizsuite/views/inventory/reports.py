"""
Inventory — گزارش‌ها و داشبورد انبار
"""
import logging

from django.http import JsonResponse

from rest_framework.decorators import api_view, permission_classes

from ...models import (
    RawMaterial,
    Warehouse,
    StockItem,
)
from ...inventory_services import (
    get_total_stock,
    get_stock_by_warehouse,
    get_stock_totals,
    get_item_movements,
    get_warehouse_movements,
    get_stock_value_report,
)
from ..common import (
    InventoryPerm,
    ZERO,
    no_business_response,
    parse_int,
    resolve_business_active,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  ★ REPORTS — گزارشات
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([InventoryPerm])
def item_movement_report(request):
    """گردش کالا — Traceability"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    material_id = request.GET.get("raw_material_id")
    warehouse_id = request.GET.get("warehouse_id")
    limit = parse_int(request.GET.get("limit"), default=100)

    if not material_id:
        return JsonResponse({"success": False, "error": "شناسه کالا الزامی است."}, status=400)

    mat = RawMaterial.all_objects.filter(pk=material_id, business=business).first()
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    warehouse = None
    if warehouse_id:
        warehouse = Warehouse.all_objects.filter(pk=warehouse_id, business=business).first()

    movements = get_item_movements(business, mat, warehouse, limit)
    stock_by_wh = get_stock_by_warehouse(business, mat)

    return JsonResponse({
        "success": True,
        "material": {
            "id": mat.pk,
            "name": mat.name,
            "unit": mat.unit,
            "unit_display": mat.get_unit_display(),
            "price": int(mat.price or 0),
        },
        "stock_by_warehouse": stock_by_wh,
        "total_stock": get_total_stock(business, mat),
        "movements": movements,
    })


@api_view(["GET"])
@permission_classes([InventoryPerm])
def stock_value_report(request):
    """ارزش موجودی انبار"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    warehouse_id = request.GET.get("warehouse_id")
    warehouse = None
    if warehouse_id:
        warehouse = Warehouse.all_objects.filter(pk=warehouse_id, business=business).first()

    report = get_stock_value_report(business, warehouse)
    return JsonResponse({"success": True, **report})


@api_view(["GET"])
@permission_classes([InventoryPerm])
def warehouse_movements(request):
    """گردش کالاهای یک انبار"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    warehouse_id = request.GET.get("warehouse_id")
    limit = parse_int(request.GET.get("limit"), default=100)

    if not warehouse_id:
        return JsonResponse({"success": False, "error": "شناسه انبار الزامی است."}, status=400)

    warehouse = Warehouse.all_objects.filter(pk=warehouse_id, business=business).first()
    if not warehouse:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)

    movements = get_warehouse_movements(business, warehouse, limit)

    return JsonResponse({
        "success": True,
        "warehouse": warehouse.name,
        "movements": movements,
    })


# ═══════════════════════════════════════
#  ★ INVENTORY DASHBOARD — خلاصه
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([InventoryPerm])
def inventory_dashboard(request):
    """خلاصه وضعیت انبار"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    total_materials = RawMaterial.objects.filter(business=business).count()

    total_value = ZERO
    for s in StockItem.objects.select_related("raw_material").filter(business=business):
        total_value += s.quantity * (s.raw_material.price or ZERO)

    stock_totals = get_stock_totals(business)
    low_stock = 0
    for mat in RawMaterial.all_objects.filter(business=business, minimum_stock__gt=0):
        total = stock_totals.get(mat.pk, ZERO)
        if total < (mat.minimum_stock or ZERO):
            low_stock += 1

    warehouse_count = Warehouse.objects.filter(business=business, is_active=True).count()

    return JsonResponse({
        "success": True,
        "dashboard": {
            "total_materials": total_materials,
            "total_stock_value": int(total_value),
            "low_stock_count": low_stock,
            "warehouse_count": warehouse_count,
        },
    })
