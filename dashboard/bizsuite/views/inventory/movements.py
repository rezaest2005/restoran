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
    transfer_stock,
)
from ..common import (
    InventoryPerm,
    no_business_response,
    parse_decimal,
    resolve_business_active,
)
from ..common import server_error
from ...warehouse_access import WarehouseAccessDenied, assert_can_use, denied_response

logger = logging.getLogger(__name__)


def lookup_targets(business, warehouse_id, material_id):
    """انبار و کالای همین کسب‌وکار؛ در غیر این صورت (None, None, پاسخ خطا)."""
    try:
        warehouse = Warehouse.all_objects.filter(pk=int(warehouse_id), business=business).first()
        mat = RawMaterial.all_objects.filter(pk=int(material_id), business=business).first()
    except (TypeError, ValueError):
        return None, None, JsonResponse({"success": False, "error": "شناسه نامعتبر است."}, status=400)
    if not warehouse:
        return None, None, JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)
    if not mat:
        return None, None, JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)
    return warehouse, mat, None


def _str(value, limit=500):
    return str(value or "").strip()[:limit]


# ═══════════════════════════════════════
#  ★ RECEIVING — ورود کالا
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
def receiving_create(request):
    """ثبت ورود کالا"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    notes = _str(data.get("notes"))

    if not warehouse_id or not material_id:
        return JsonResponse({"success": False, "error": "انبار و کالا الزامی است."}, status=400)

    try:
        quantity = parse_decimal(data.get("quantity"), "مقدار", allow_zero=False)
        unit_price = parse_decimal(data.get("unit_price") or 0, "قیمت واحد")
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    warehouse, mat, err = lookup_targets(business, warehouse_id, material_id)
    if err:
        return err
    try:
        assert_can_use(request.user, warehouse, write=True)
    except WarehouseAccessDenied as exc:
        return denied_response(exc)

    try:
        result = receive_stock(
            business=business,
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
        return server_error(exc)


# ═══════════════════════════════════════
#  ★ ISSUE — خروج کالا
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
def issue_create(request):
    """ثبت خروج کالا"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    reason = _str(data.get("reason"), 30) or "consumption"
    destination = _str(data.get("destination"), 200)
    notes = _str(data.get("notes"))

    if not warehouse_id or not material_id:
        return JsonResponse({"success": False, "error": "انبار و کالا الزامی است."}, status=400)

    try:
        quantity = parse_decimal(data.get("quantity"), "مقدار", allow_zero=False)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    warehouse, mat, err = lookup_targets(business, warehouse_id, material_id)
    if err:
        return err
    try:
        assert_can_use(request.user, warehouse, write=True)
    except WarehouseAccessDenied as exc:
        return denied_response(exc)

    try:
        result = issue_stock(
            business=business,
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
        return server_error(exc)


# ═══════════════════════════════════════
#  ★ WASTE — ضایعات
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
def waste_create(request):
    """ثبت ضایعات"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    waste_reason = _str(data.get("waste_reason"), 20) or "other"
    notes = _str(data.get("notes"))

    if not warehouse_id or not material_id:
        return JsonResponse({"success": False, "error": "انبار و کالا الزامی است."}, status=400)

    try:
        quantity = parse_decimal(data.get("quantity"), "مقدار", allow_zero=False)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    warehouse, mat, err = lookup_targets(business, warehouse_id, material_id)
    if err:
        return err
    try:
        assert_can_use(request.user, warehouse, write=True)
    except WarehouseAccessDenied as exc:
        return denied_response(exc)

    try:
        result = waste_stock(
            business=business,
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
        return server_error(exc)


# ═══════════════════════════════════════
#  ★ ADJUSTMENT — اصلاح / شمارش
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
def adjustment_create(request):
    """اصلاح / شمارش موجودی"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    adjustment_type = _str(data.get("adjustment_type"), 20) or "count"
    reason = _str(data.get("reason"), 200)
    notes = _str(data.get("notes"))

    if not warehouse_id or not material_id:
        return JsonResponse({"success": False, "error": "انبار و کالا الزامی است."}, status=400)

    warehouse, mat, err = lookup_targets(business, warehouse_id, material_id)
    if err:
        return err
    try:
        assert_can_use(request.user, warehouse, write=True)
    except WarehouseAccessDenied as exc:
        return denied_response(exc)

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
            business=business,
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
        return server_error(exc)


# ═══════════════════════════════════════
#  ★ TRANSFER — انتقال بین انبارها
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
def transfer_create(request):
    """انتقال کالا بین دو انبار"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()

    data = request.data
    source_id = data.get("source_warehouse_id")
    dest_id = data.get("destination_warehouse_id")
    material_id = data.get("raw_material_id")
    notes = _str(data.get("notes"))

    if not source_id or not dest_id or not material_id:
        return JsonResponse(
            {"success": False, "error": "انبار مبدا، انبار مقصد و کالا الزامی است."}, status=400
        )

    try:
        quantity = parse_decimal(data.get("quantity"), "مقدار", allow_zero=False)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    source, mat, err = lookup_targets(business, source_id, material_id)
    if err:
        return err
    # only the SOURCE is user-restricted; any active warehouse may receive
    try:
        assert_can_use(request.user, source, write=True)
    except WarehouseAccessDenied as exc:
        return denied_response(exc)
    destination, _mat, err = lookup_targets(business, dest_id, material_id)
    if err:
        return err
    if not destination.is_active:
        return JsonResponse({"success": False, "error": "انبار مقصد غیرفعال است."}, status=400)

    try:
        result = transfer_stock(
            business=business,
            source_warehouse=source,
            destination_warehouse=destination,
            raw_material=mat,
            quantity=quantity,
            user=request.user if request.user.is_authenticated else None,
            notes=notes,
        )
        return JsonResponse(result)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)
    except Exception as exc:
        return server_error(exc)
