"""
Inventory — ورود، خروج، ضایعات و تعدیل موجودی
"""
import logging

from django.http import JsonResponse

from rest_framework.decorators import api_view, permission_classes

from ...models import RawMaterial, Warehouse
from ...inventory_services import (
    receive_stock,
    issue_stock,
    waste_stock,
    adjust_stock,
)
from ..common import (
    InventoryPerm,
    no_restaurant_response,
    parse_decimal,
    resolve_restaurant_active,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  ★ RECEIVING — ورود کالا
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
def receiving_create(request):
    """ثبت ورود کالا"""
    restaurant = resolve_restaurant_active(request)
    if not restaurant:
        return no_restaurant_response()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    notes = (data.get("notes") or "").strip()

    if not warehouse_id or not material_id:
        return JsonResponse({"success": False, "error": "انبار و کالا الزامی است."}, status=400)

    try:
        quantity = parse_decimal(data.get("quantity"), "مقدار", allow_zero=False)
        unit_price = parse_decimal(data.get("unit_price", 0), "قیمت واحد")
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    warehouse = Warehouse.all_objects.filter(pk=warehouse_id, restaurant=restaurant).first()
    mat = RawMaterial.all_objects.filter(pk=material_id, restaurant=restaurant).first()

    if not warehouse:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    try:
        result = receive_stock(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=mat,
            quantity=quantity,
            unit_price=unit_price,
            user=request.user if request.user.is_authenticated else None,
            notes=notes,
        )
        return JsonResponse(result)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)
    except Exception as exc:
        logger.exception("Error receiving stock")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


# ═══════════════════════════════════════
#  ★ ISSUE — خروج کالا
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
def issue_create(request):
    """ثبت خروج کالا"""
    restaurant = resolve_restaurant_active(request)
    if not restaurant:
        return no_restaurant_response()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    reason = data.get("reason", "consumption")
    destination = (data.get("destination") or "").strip()
    notes = (data.get("notes") or "").strip()

    if not warehouse_id or not material_id:
        return JsonResponse({"success": False, "error": "انبار و کالا الزامی است."}, status=400)

    try:
        quantity = parse_decimal(data.get("quantity"), "مقدار", allow_zero=False)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    warehouse = Warehouse.all_objects.filter(pk=warehouse_id, restaurant=restaurant).first()
    mat = RawMaterial.all_objects.filter(pk=material_id, restaurant=restaurant).first()

    if not warehouse:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    try:
        result = issue_stock(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=mat,
            quantity=quantity,
            reason=reason,
            destination=destination,
            user=request.user if request.user.is_authenticated else None,
            notes=notes,
        )
        return JsonResponse(result)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)
    except Exception as exc:
        logger.exception("Error issuing stock")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


# ═══════════════════════════════════════
#  ★ WASTE — ضایعات
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
def waste_create(request):
    """ثبت ضایعات"""
    restaurant = resolve_restaurant_active(request)
    if not restaurant:
        return no_restaurant_response()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    waste_reason = data.get("waste_reason", "other")
    notes = (data.get("notes") or "").strip()

    if not warehouse_id or not material_id:
        return JsonResponse({"success": False, "error": "انبار و کالا الزامی است."}, status=400)

    try:
        quantity = parse_decimal(data.get("quantity"), "مقدار", allow_zero=False)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    warehouse = Warehouse.all_objects.filter(pk=warehouse_id, restaurant=restaurant).first()
    mat = RawMaterial.all_objects.filter(pk=material_id, restaurant=restaurant).first()

    if not warehouse:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    try:
        result = waste_stock(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=mat,
            quantity=quantity,
            waste_reason=waste_reason,
            user=request.user if request.user.is_authenticated else None,
            notes=notes,
        )
        return JsonResponse(result)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)
    except Exception as exc:
        logger.exception("Error recording waste")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


# ═══════════════════════════════════════
#  ★ ADJUSTMENT — اصلاح / شمارش
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
def adjustment_create(request):
    """اصلاح / شمارش موجودی"""
    restaurant = resolve_restaurant_active(request)
    if not restaurant:
        return no_restaurant_response()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    adjustment_type = data.get("adjustment_type", "count")
    reason = (data.get("reason") or "").strip()
    notes = (data.get("notes") or "").strip()

    if not warehouse_id or not material_id:
        return JsonResponse({"success": False, "error": "انبار و کالا الزامی است."}, status=400)

    warehouse = Warehouse.all_objects.filter(pk=warehouse_id, restaurant=restaurant).first()
    mat = RawMaterial.all_objects.filter(pk=material_id, restaurant=restaurant).first()

    if not warehouse:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    new_quantity_raw = data.get("new_quantity")
    quantity_raw = data.get("quantity")
    new_quantity = None
    delta = None

    if new_quantity_raw is not None:
        try:
            new_quantity = parse_decimal(new_quantity_raw, "موجودی جدید")
        except ValueError as exc:
            return JsonResponse({"success": False, "error": str(exc)}, status=400)
        if new_quantity < 0:
            return JsonResponse({"success": False, "error": "موجودی جدید نمی‌تواند منفی باشد."}, status=400)

    elif quantity_raw is not None:
        try:
            quantity_val = parse_decimal(quantity_raw, "مقدار")
        except ValueError as exc:
            return JsonResponse({"success": False, "error": str(exc)}, status=400)

        if adjustment_type == "increase":
            delta = abs(quantity_val)
        elif adjustment_type == "decrease":
            delta = -abs(quantity_val)
        elif adjustment_type in ("set", "count"):
            new_quantity = quantity_val
        else:
            return JsonResponse({"success": False, "error": "نوع اصلاح نامعتبر است."}, status=400)
    else:
        return JsonResponse({"success": False, "error": "مقدار الزامی است."}, status=400)

    try:
        result = adjust_stock(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=mat,
            new_quantity=new_quantity,
            delta=delta,
            adjustment_type=adjustment_type,
            reason=reason,
            user=request.user if request.user.is_authenticated else None,
            notes=notes,
        )
        return JsonResponse(result)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)
    except Exception as exc:
        logger.exception("Error adjusting stock")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)
