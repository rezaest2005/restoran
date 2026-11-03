"""
Inventory — CRUD انبارها
"""
import logging

from django.db.models import Count, Q
from django.http import JsonResponse

from rest_framework.decorators import api_view, permission_classes

from ...models import Warehouse, StockItem
from ...inventory_services import get_or_create_mother_warehouse
from ..common import (
    InventoryPerm,
    no_restaurant_response,
    resolve_restaurant_active,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  ★ WAREHOUSE CRUD
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([InventoryPerm])
def warehouse_list(request):
    """لیست انبارها"""
    restaurant = resolve_restaurant_active(request)
    if not restaurant:
        return no_restaurant_response()

    get_or_create_mother_warehouse(restaurant)

    warehouses = (
        Warehouse.objects.filter(restaurant=restaurant, is_active=True)
        .annotate(
            stock_count=Count(
                "stock_items",
                filter=Q(stock_items__quantity__gt=0),
            ),
        )
        .order_by("-is_mother", "name")
    )

    data = [
        {
            "id": w.pk,
            "name": w.name,
            "warehouse_type": w.warehouse_type,
            "warehouse_type_display": w.get_warehouse_type_display(),
            "is_mother": w.is_mother,
            "description": w.description or "",
            "stock_count": w.stock_count,
        }
        for w in warehouses
    ]

    return JsonResponse({"success": True, "warehouses": data})


@api_view(["POST"])
@permission_classes([InventoryPerm])
def warehouse_save(request):
    """ایجاد / ویرایش انبار"""
    restaurant = resolve_restaurant_active(request)
    if not restaurant:
        return no_restaurant_response()

    data = request.data
    pk = data.get("id")
    name = (data.get("name") or "").strip()
    warehouse_type = data.get("warehouse_type", "other")
    description = (data.get("description") or "").strip()

    if not name:
        return JsonResponse({"success": False, "error": "نام انبار الزامی است."}, status=400)

    try:
        if pk:
            wh = Warehouse.all_objects.filter(pk=pk, restaurant=restaurant).first()
            if not wh:
                return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)
            wh.name = name
            wh.warehouse_type = warehouse_type
            wh.description = description
            wh.save()
            msg = "انبار ویرایش شد."
        else:
            wh = Warehouse.objects.create(
                restaurant=restaurant,
                name=name,
                warehouse_type=warehouse_type,
                description=description,
            )
            msg = "انبار ایجاد شد."

        return JsonResponse({
            "success": True,
            "msg": msg,
            "warehouse": {
                "id": wh.pk,
                "name": wh.name,
                "warehouse_type": wh.warehouse_type,
                "warehouse_type_display": wh.get_warehouse_type_display(),
                "is_mother": wh.is_mother,
                "description": wh.description or "",
            },
        })
    except Exception as exc:
        logger.exception("Error saving warehouse")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


@api_view(["POST"])
@permission_classes([InventoryPerm])
def warehouse_delete(request):
    """حذف انبار (فقط اگر خالی باشد)"""
    restaurant = resolve_restaurant_active(request)
    if not restaurant:
        return no_restaurant_response()

    pk = request.data.get("id")
    if not pk:
        return JsonResponse({"success": False, "error": "شناسه ارسال نشد."}, status=400)

    wh = Warehouse.all_objects.filter(pk=pk, restaurant=restaurant).first()
    if not wh:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)

    if wh.is_mother:
        return JsonResponse({"success": False, "error": "انبار مرکزی قابل حذف نیست."}, status=400)

    stock_count = StockItem.objects.filter(
        restaurant=restaurant, warehouse=wh, quantity__gt=0
    ).count()
    if stock_count > 0:
        return JsonResponse(
            {"success": False, "error": f"این انبار {stock_count} قلم کالا دارد."},
            status=400,
        )

    name = wh.name
    wh.is_active = False
    wh.save(update_fields=["is_active"])

    return JsonResponse({"success": True, "msg": f"«{name}» غیرفعال شد."})
