"""
Inventory / Warehouse API — ★ نسخه v1

تب‌های اصلی Inventory:
  📦 انبار       → Warehouse CRUD + Stock
  🚚 تحویل بار   → Receiving + Issue + Waste
  📊 گزارشات     → Reports

★ از الگوی پروژه پیروی می‌کند: @api_view + JsonResponse
"""

import logging
from decimal import Decimal
from django.http import JsonResponse

from rest_framework.decorators import api_view, permission_classes

from ..models import (
    RawMaterial,
    Warehouse,
    StockItem,
    StockTransfer,
    Receiving,
    ReceivingItem,
    StockAdjustment,
    PurchaseListItem,
    InventoryMovement,
    Supplier,
    PurchaseInvoice,
)
from ..permissions import (
    IsOwnerOrManagerOrWarehouseStaff,
    IsOwnerOrManager,
)
from ..tenancy import (
    get_current_restaurant,
    set_current_restaurant,
    get_restaurant_from_request,
)
from ..inventory_services import (
    receive_stock,
    transfer_stock,
    issue_stock,
    waste_stock,
    adjust_stock,
    get_stock_level,
    get_total_stock,
    get_stock_by_warehouse,
    get_purchase_list,
    add_to_purchase_list,
    update_purchase_list_status,
    get_or_create_mother_warehouse,
    get_item_movements,
    get_warehouse_movements,
    get_stock_value_report,
    get_transfer_report,
    sync_raw_material_quantity,
)
from .decorators import make_service_permission

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  Permissions
# ═══════════════════════════════════════

InventoryPerm = make_service_permission('inventory')


# ═══════════════════════════════════════
#  resolve restaurant
# ═══════════════════════════════════════

def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    return None


# ═══════════════════════════════════════
#  ★ WAREHOUSE CRUD
# ═══════════════════════════════════════


@api_view(["GET"])
@permission_classes([InventoryPerm])
def warehouse_list(request):
    """لیست انبارها"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    # اگر انبار مرکزی وجود نداشت، بساز
    get_or_create_mother_warehouse(restaurant)

    from django.db.models import Count, Sum

    warehouses = (
        Warehouse.objects.filter(restaurant=restaurant, is_active=True)
        .annotate(
            _item_count=Count("stock_items", filter=Q_stock_positive()),
            _total_value=Sum(
                "stock_items__quantity"
            ),
        )
        .order_by("-is_mother", "name")
    )

    data = []
    for w in warehouses:
        stock_count = StockItem.objects.filter(
            restaurant=restaurant,
            warehouse=w,
            quantity__gt=0,
        ).count()

        data.append({
            "id": w.pk,
            "name": w.name,
            "warehouse_type": w.warehouse_type,
            "warehouse_type_display": w.get_warehouse_type_display(),
            "is_mother": w.is_mother,
            "description": w.description or "",
            "stock_count": stock_count,
        })

    return JsonResponse({"success": True, "warehouses": data})


def Q_stock_positive():
    """فیلتر برای annotate"""
    from django.db.models import Q
    return Q(stock_items__quantity__gt=0)


@api_view(["POST"])
@permission_classes([InventoryPerm])
def warehouse_save(request):
    """ایجاد / ویرایش انبار"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    data = request.data
    pk = data.get("id")
    name = data.get("name", "").strip()
    warehouse_type = data.get("warehouse_type", "other")
    description = data.get("description", "").strip()

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
    restaurant = _resolve_restaurant(request)
    pk = request.data.get("id")

    if not pk:
        return JsonResponse({"success": False, "error": "شناسه ارسال نشد."}, status=400)

    wh = Warehouse.all_objects.filter(pk=pk, restaurant=restaurant).first()
    if not wh:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)

    if wh.is_mother:
        return JsonResponse(
            {"success": False, "error": "انبار مرکزی قابل حذف نیست."},
            status=400,
        )

    # بررسی موجودی
    stock_count = StockItem.objects.filter(
        restaurant=restaurant, warehouse=wh, quantity__gt=0
    ).count()
    if stock_count > 0:
        return JsonResponse(
            {"success": False, "error": f"این انبار {stock_count} قلم کالا دارد. ابتدا کالاها را منتقل کنید."},
            status=400,
        )

    name = wh.name
    wh.is_active = False
    wh.save(update_fields=["is_active"])

    return JsonResponse({"success": True, "msg": f"«{name}» غیرفعال شد."})


# ═══════════════════════════════════════
#  ★ STOCK — موجودی انبار
# ═══════════════════════════════════════


@api_view(["GET"])
@permission_classes([InventoryPerm])
def stock_list(request):
    """موجودی کالاها — در یک انبار مشخص یا همه"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    warehouse_id = request.GET.get("warehouse_id")
    search = request.GET.get("search", "").strip()

    qs = StockItem.objects.select_related("raw_material", "warehouse").filter(
        restaurant=restaurant
    )

    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)

    if search:
        from django.db.models import Q
        qs = qs.filter(
            Q(raw_material__name__icontains=search)
        )

    stocks = qs.order_by("raw_material__name")

    items = []
    for s in stocks:
        items.append({
            "id": s.pk,
            "raw_material_id": s.raw_material.pk,
            "material_name": s.raw_material.name,
            "material_unit": s.raw_material.unit,
            "material_unit_display": s.raw_material.get_unit_display(),
            "material_price": int(s.raw_material.price),
            "warehouse_id": s.warehouse.pk,
            "warehouse_name": s.warehouse.name,
            "quantity": float(s.quantity),
            "total_value": int(s.quantity * s.raw_material.price),
            "minimum_stock": float(s.raw_material.minimum_stock or 0),
            "target_stock": float(s.raw_material.target_stock or 0),
        })

    return JsonResponse({"success": True, "items": items, "count": len(items)})


@api_view(["POST"])
@permission_classes([InventoryPerm])
def stock_minimum_update(request):
    """ویرایش حداقل موجودی / موجودی هدف"""
    restaurant = _resolve_restaurant(request)
    data = request.data

    material_id = data.get("raw_material_id")
    minimum_stock = data.get("minimum_stock")
    target_stock = data.get("target_stock")

    if not material_id:
        return JsonResponse({"success": False, "error": "شناسه کالا ارسال نشد."}, status=400)

    mat = RawMaterial.objects.filter(pk=material_id, restaurant=restaurant).first()
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    if minimum_stock is not None:
        mat.minimum_stock = float(minimum_stock)
    if target_stock is not None:
        mat.target_stock = float(target_stock)
    mat.save(update_fields=["minimum_stock", "target_stock"])

    return JsonResponse({
        "success": True,
        "msg": "بروزرسانی شد.",
        "minimum_stock": float(mat.minimum_stock),
        "target_stock": float(mat.target_stock),
    })


# ═══════════════════════════════════════
#  ★ TRANSFER — انتقال کالا
# ═══════════════════════════════════════


@api_view(["POST"])
@permission_classes([InventoryPerm])
def transfer_create(request):
    """انتقال کالا بین انبارها"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    data = request.data
    source_id = data.get("source_warehouse_id")
    dest_id = data.get("destination_warehouse_id")
    material_id = data.get("raw_material_id")
    quantity = float(data.get("quantity", 0))
    notes = data.get("notes", "").strip()
    reference = data.get("reference", "").strip()

    if not source_id or not dest_id or not material_id:
        return JsonResponse(
            {"success": False, "error": "انبار مبدأ، مقصد و کالا الزامی است."},
            status=400,
        )

    if quantity <= 0:
        return JsonResponse(
            {"success": False, "error": "مقدار انتقال باید بیشتر از صفر باشد."},
            status=400,
        )

    source_wh = Warehouse.objects.filter(pk=source_id, restaurant=restaurant).first()
    dest_wh = Warehouse.objects.filter(pk=dest_id, restaurant=restaurant).first()
    mat = RawMaterial.objects.filter(pk=material_id, restaurant=restaurant).first()

    if not source_wh:
        return JsonResponse({"success": False, "error": "انبار مبدأ یافت نشد."}, status=404)
    if not dest_wh:
        return JsonResponse({"success": False, "error": "انبار مقصد یافت نشد."}, status=404)
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    try:
        result = transfer_stock(
            restaurant=restaurant,
            source_warehouse=source_wh,
            destination_warehouse=dest_wh,
            raw_material=mat,
            quantity=quantity,
            user=request.user if request.user.is_authenticated else None,
            notes=notes,
            reference=reference,
        )
        return JsonResponse(result)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)
    except Exception as exc:
        logger.exception("Error transferring stock")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


@api_view(["GET"])
@permission_classes([InventoryPerm])
def transfer_list(request):
    """لیست انتقال‌ها"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    limit = int(request.GET.get("limit", 100))
    warehouse_id = request.GET.get("warehouse_id")
    material_id = request.GET.get("raw_material_id")

    from django.db.models import Q

    qs = StockTransfer.objects.select_related(
        "source_warehouse", "destination_warehouse", "raw_material", "created_by"
    ).filter(restaurant=restaurant)

    if warehouse_id:
        qs = qs.filter(
            Q(source_warehouse_id=warehouse_id) | Q(destination_warehouse_id=warehouse_id)
        )
    if material_id:
        qs = qs.filter(raw_material_id=material_id)

    transfers = qs.order_by("-created_at")[:limit]

    data = [
        {
            "id": t.pk,
            "source_warehouse": t.source_warehouse.name,
            "destination_warehouse": t.destination_warehouse.name,
            "material_name": t.raw_material.name,
            "quantity": float(t.quantity),
            "unit": t.unit,
            "status": t.status,
            "status_display": t.get_status_display(),
            "notes": t.notes or "",
            "user": t.created_by.get_full_name() if t.created_by else "",
            "created_at": t.created_at.strftime("%Y/%m/%d %H:%M"),
        }
        for t in transfers
    ]

    return JsonResponse({"success": True, "transfers": data, "count": len(data)})


@api_view(["GET"])
@permission_classes([InventoryPerm])
def transfer_detail(request):
    """جزئیات یک انتقال"""
    restaurant = _resolve_restaurant(request)
    pk = request.GET.get("id")

    if not pk:
        return JsonResponse({"success": False, "error": "شناسه ارسال نشد."}, status=400)

    t = StockTransfer.objects.select_related(
        "source_warehouse", "destination_warehouse", "raw_material", "created_by"
    ).filter(pk=pk, restaurant=restaurant).first()

    if not t:
        return JsonResponse({"success": False, "error": "انتقال یافت نشد."}, status=404)

    return JsonResponse({
        "success": True,
        "transfer": {
            "id": t.pk,
            "source_warehouse": t.source_warehouse.name,
            "destination_warehouse": t.destination_warehouse.name,
            "material_name": t.raw_material.name,
            "quantity": float(t.quantity),
            "unit": t.unit,
            "status": t.status,
            "status_display": t.get_status_display(),
            "reference": t.reference or "",
            "notes": t.notes or "",
            "user": t.created_by.get_full_name() if t.created_by else "",
            "created_at": t.created_at.strftime("%Y/%m/%d %H:%M"),
            "completed_at": t.completed_at.strftime("%Y/%m/%d %H:%M") if t.completed_at else "",
        },
    })


# ═══════════════════════════════════════
#  ★ RECEIVING — تحویل بار / ورود کالا
# ═══════════════════════════════════════


@api_view(["POST"])
@permission_classes([InventoryPerm])
def receiving_create(request):
    """ثبت ورود کالا / تحویل بار"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    data = request.data
    warehouse_id = data.get("warehouse_id")
    items = data.get("items", [])
    purchase_invoice_id = data.get("purchase_invoice_id")
    supplier_id = data.get("supplier_id")
    notes = data.get("notes", "").strip()

    if not warehouse_id:
        return JsonResponse({"success": False, "error": "انبار مقصد الزامی است."}, status=400)
    if not items:
        return JsonResponse({"success": False, "error": "حداقل یک کالا ارسال کنید."}, status=400)

    warehouse = Warehouse.objects.filter(pk=warehouse_id, restaurant=restaurant).first()
    if not warehouse:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)

    supplier = None
    if supplier_id:
        supplier = Supplier.objects.filter(pk=supplier_id, restaurant=restaurant).first()

    purchase_invoice = None
    if purchase_invoice_id:
        purchase_invoice = PurchaseInvoice.objects.filter(
            pk=purchase_invoice_id, restaurant=restaurant
        ).first()

    results = []
    total_amount = 0

    for item in items:
        material_id = item.get("raw_material_id")
        quantity = float(item.get("quantity", 0))
        unit_price = float(item.get("unit_price", 0))

        if not material_id or quantity <= 0:
            continue

        mat = RawMaterial.objects.filter(pk=material_id, restaurant=restaurant).first()
        if not mat:
            results.append({
                "material_id": material_id,
                "success": False,
                "error": "کالا یافت نشد.",
            })
            continue

        try:
            result = receive_stock(
                restaurant=restaurant,
                warehouse=warehouse,
                raw_material=mat,
                quantity=quantity,
                unit_price=unit_price,
                supplier=supplier,
                purchase_invoice=purchase_invoice,
                user=request.user if request.user.is_authenticated else None,
                notes=notes,
            )
            results.append(result)
            total_amount += quantity * unit_price
        except ValueError as exc:
            results.append({
                "material_id": material_id,
                "success": False,
                "error": str(exc),
            })

    return JsonResponse({
        "success": True,
        "msg": f"{len([r for r in results if r.get('success')])} کالا وارد انبار شد.",
        "results": results,
        "total_amount": int(total_amount),
    })


@api_view(["POST"])
@permission_classes([InventoryPerm])
def issue_create(request):
    """ثبت خروج کالا (مصرف / فروش)"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    quantity = float(data.get("quantity", 0))
    reason = data.get("reason", "consumption")
    destination = data.get("destination", "").strip()
    notes = data.get("notes", "").strip()

    if not warehouse_id or not material_id:
        return JsonResponse(
            {"success": False, "error": "انبار و کالا الزامی است."}, status=400
        )
    if quantity <= 0:
        return JsonResponse(
            {"success": False, "error": "مقدار باید بیشتر از صفر باشد."}, status=400
        )

    warehouse = Warehouse.objects.filter(pk=warehouse_id, restaurant=restaurant).first()
    mat = RawMaterial.objects.filter(pk=material_id, restaurant=restaurant).first()

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
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    quantity = float(data.get("quantity", 0))
    waste_reason = data.get("waste_reason", "other")
    notes = data.get("notes", "").strip()

    if not warehouse_id or not material_id:
        return JsonResponse(
            {"success": False, "error": "انبار و کالا الزامی است."}, status=400
        )
    if quantity <= 0:
        return JsonResponse(
            {"success": False, "error": "مقدار باید بیشتر از صفر باشد."}, status=400
        )

    warehouse = Warehouse.objects.filter(pk=warehouse_id, restaurant=restaurant).first()
    mat = RawMaterial.objects.filter(pk=material_id, restaurant=restaurant).first()

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
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    new_quantity = float(data.get("new_quantity", -1))
    adjustment_type = data.get("adjustment_type", "count")
    reason = data.get("reason", "").strip()
    notes = data.get("notes", "").strip()

    if not warehouse_id or not material_id:
        return JsonResponse(
            {"success": False, "error": "انبار و کالا الزامی است."}, status=400
        )
    if new_quantity < 0:
        return JsonResponse(
            {"success": False, "error": "موجودی جدید نمی‌تواند منفی باشد."}, status=400
        )

    warehouse = Warehouse.objects.filter(pk=warehouse_id, restaurant=restaurant).first()
    mat = RawMaterial.objects.filter(pk=material_id, restaurant=restaurant).first()

    if not warehouse:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    try:
        result = adjust_stock(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=mat,
            new_quantity=new_quantity,
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


# ═══════════════════════════════════════
#  ★ PURCHASE LIST — لیست خرید
# ═══════════════════════════════════════


@api_view(["GET"])
@permission_classes([InventoryPerm])
def purchase_list(request):
    """لیست خرید — کالاهای نیازمند خرید"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    warehouse_id = request.GET.get("warehouse_id")
    warehouse = None
    if warehouse_id:
        warehouse = Warehouse.objects.filter(pk=warehouse_id, restaurant=restaurant).first()

    items = get_purchase_list(restaurant, warehouse)

    return JsonResponse({"success": True, "items": items, "count": len(items)})


@api_view(["POST"])
@permission_classes([InventoryPerm])
def purchase_list_add(request):
    """افزودن دستی آیتم به لیست خرید"""
    restaurant = _resolve_restaurant(request)
    data = request.data

    material_id = data.get("raw_material_id")
    suggested_quantity = float(data.get("suggested_quantity", 0))

    if not material_id:
        return JsonResponse({"success": False, "error": "شناسه کالا ارسال نشد."}, status=400)

    mat = RawMaterial.objects.filter(pk=material_id, restaurant=restaurant).first()
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    try:
        result = add_to_purchase_list(
            restaurant=restaurant,
            raw_material=mat,
            suggested_quantity=suggested_quantity,
        )
        return JsonResponse(result)
    except Exception as exc:
        logger.exception("Error adding to purchase list")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


@api_view(["POST"])
@permission_classes([InventoryPerm])
def purchase_list_status(request):
    """بروزرسانی وضعیت آیتم لیست خرید"""
    restaurant = _resolve_restaurant(request)
    data = request.data

    item_id = data.get("item_id")
    status = data.get("status")

    if not item_id or not status:
        return JsonResponse(
            {"success": False, "error": "شناسه و وضعیت الزامی است."}, status=400
        )

    try:
        result = update_purchase_list_status(restaurant, item_id, status)
        return JsonResponse(result)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)
    except Exception as exc:
        logger.exception("Error updating purchase list status")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


# ═══════════════════════════════════════
#  ★ REPORTS — گزارشات
# ═══════════════════════════════════════


@api_view(["GET"])
@permission_classes([InventoryPerm])
def item_movement_report(request):
    """گردش کالا — Traceability"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    material_id = request.GET.get("raw_material_id")
    warehouse_id = request.GET.get("warehouse_id")
    limit = int(request.GET.get("limit", 100))

    if not material_id:
        return JsonResponse(
            {"success": False, "error": "شناسه کالا الزامی است."}, status=400
        )

    mat = RawMaterial.objects.filter(pk=material_id, restaurant=restaurant).first()
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    warehouse = None
    if warehouse_id:
        warehouse = Warehouse.objects.filter(pk=warehouse_id, restaurant=restaurant).first()

    movements = get_item_movements(restaurant, mat, warehouse, limit)
    stock_by_wh = get_stock_by_warehouse(restaurant, mat)

    return JsonResponse({
        "success": True,
        "material": {
            "id": mat.pk,
            "name": mat.name,
            "unit": mat.unit,
            "unit_display": mat.get_unit_display(),
            "price": int(mat.price),
        },
        "stock_by_warehouse": stock_by_wh,
        "total_stock": get_total_stock(restaurant, mat),
        "movements": movements,
    })


@api_view(["GET"])
@permission_classes([InventoryPerm])
def transfer_report(request):
    """گزارش گردش انتقال"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    start_date = request.GET.get("start_date")
    end_date = request.GET.get("end_date")

    transfers = get_transfer_report(restaurant, start_date, end_date)

    return JsonResponse({
        "success": True,
        "transfers": transfers,
        "count": len(transfers),
    })


@api_view(["GET"])
@permission_classes([InventoryPerm])
def stock_value_report(request):
    """ارزش موجودی انبار"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    warehouse_id = request.GET.get("warehouse_id")
    warehouse = None
    if warehouse_id:
        warehouse = Warehouse.objects.filter(pk=warehouse_id, restaurant=restaurant).first()

    report = get_stock_value_report(restaurant, warehouse)

    return JsonResponse({"success": True, **report})


@api_view(["GET"])
@permission_classes([InventoryPerm])
def warehouse_movements(request):
    """گردش کالاهای یک انبار"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    warehouse_id = request.GET.get("warehouse_id")
    limit = int(request.GET.get("limit", 100))

    if not warehouse_id:
        return JsonResponse(
            {"success": False, "error": "شناسه انبار الزامی است."}, status=400
        )

    warehouse = Warehouse.objects.filter(pk=warehouse_id, restaurant=restaurant).first()
    if not warehouse:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)

    movements = get_warehouse_movements(restaurant, warehouse, limit)

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
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"success": False, "error": "رستوران مشخص نشده."}, status=400)

    from django.db.models import Sum, Count, Q
    from datetime import date

    today = date.today()

    # تعداد کالاها
    total_materials = RawMaterial.objects.filter(restaurant=restaurant).count()

    # موجودی کل (ارزش)
    total_value = Decimal("0")
    for s in StockItem.objects.select_related("raw_material").filter(restaurant=restaurant):
        total_value += s.quantity * s.raw_material.price

    # کالاهای کمبود
    low_stock = 0
    for mat in RawMaterial.objects.filter(restaurant=restaurant, minimum_stock__gt=0):
        total = get_total_stock(restaurant, mat)
        if total < float(mat.minimum_stock):
            low_stock += 1

    # تعداد انبارها
    warehouse_count = Warehouse.objects.filter(restaurant=restaurant, is_active=True).count()

    return JsonResponse({
        "success": True,
        "dashboard": {
            "total_materials": total_materials,
            "total_stock_value": int(total_value),
            "low_stock_count": low_stock,
            "warehouse_count": warehouse_count,
        },
    })