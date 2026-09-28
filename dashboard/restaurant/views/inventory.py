"""
Inventory / Warehouse API — ★ نسخه v1.1

تب‌های اصلی Inventory:
  📦 انبار       → Warehouse CRUD + Stock
  🚚 تحویل بار   → Receiving + Issue + Waste
  📊 گزارشات     → Reports

★ از الگوی پروژه پیروی می‌کند: @api_view + JsonResponse

تغییرات v1.1:
  - حذف N+1 در warehouse_list و inventory_dashboard
  - رفع TypeError در stock_minimum_update (مقدار None)
  - رفع race condition در adjustment_create → استفاده از delta
  - receiving_create کاملاً atomic + سند Receiving مشترک
  - حذف import‌های بدون استفاده
  - تبدیل امن ورودی‌ها به Decimal
"""

import logging
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Q
from django.http import JsonResponse

from rest_framework.decorators import api_view, permission_classes

from ..models import (
    RawMaterial,
    Warehouse,
    StockItem,
    StockTransfer,
    Receiving,
    Supplier,
    PurchaseInvoice,
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
    get_total_stock,
    get_stock_by_warehouse,
    get_stock_totals,
    get_purchase_list,
    add_to_purchase_list,
    update_purchase_list_status,
    get_or_create_mother_warehouse,
    get_item_movements,
    get_warehouse_movements,
    get_stock_value_report,
    get_transfer_report,
)
from .decorators import make_service_permission

logger = logging.getLogger(__name__)

ZERO = Decimal("0")

InventoryPerm = make_service_permission("inventory")


# ═══════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════


def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r

    r = getattr(request, "restaurant", None)
    if r:
        set_current_restaurant(r)
        return r

    user = getattr(request, "user", None)
    if user and getattr(user, "is_authenticated", False):
        r = getattr(user, "restaurant", None)
        if r is not None and getattr(r, "is_active", True):
            set_current_restaurant(r)
            return r

    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r

    return None


def _no_restaurant():
    return JsonResponse(
        {"success": False, "error": "رستوران مشخص نشده."},
        status=400,
    )


def _parse_decimal(value, field_name="مقدار", allow_zero=True):
    """تبدیل امن ورودی به Decimal — برای اعتبارسنجی در view"""
    if value is None or value == "":
        raise ValueError(f"{field_name} الزامی است.")
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{field_name} نامعتبر است.")
    if not allow_zero and d <= 0:
        raise ValueError(f"{field_name} باید بیشتر از صفر باشد.")
    return d


def _parse_int(value, default=100, minimum=1, maximum=1000):
    """تبدیل امن query param به int"""
    try:
        n = int(value)
    except (ValueError, TypeError):
        return default
    return max(minimum, min(n, maximum))


def _safe_float(value):
    """تبدیل امن Decimal/None به float برای JSON"""
    return float(value) if value is not None else None


# ═══════════════════════════════════════
#  ★ WAREHOUSE CRUD
# ═══════════════════════════════════════


@api_view(["GET"])
@permission_classes([InventoryPerm])
def warehouse_list(request):
    """لیست انبارها"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

    # اگر انبار مرکزی وجود نداشت، بساز
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
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

    data = request.data
    pk = data.get("id")
    name = (data.get("name") or "").strip()
    warehouse_type = data.get("warehouse_type", "other")
    description = (data.get("description") or "").strip()

    if not name:
        return JsonResponse(
            {"success": False, "error": "نام انبار الزامی است."},
            status=400,
        )

    try:
        if pk:
            wh = Warehouse.all_objects.filter(pk=pk, restaurant=restaurant).first()
            if not wh:
                return JsonResponse(
                    {"success": False, "error": "انبار یافت نشد."},
                    status=404,
                )
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
    if not restaurant:
        return _no_restaurant()

    pk = request.data.get("id")
    if not pk:
        return JsonResponse(
            {"success": False, "error": "شناسه ارسال نشد."},
            status=400,
        )

    wh = Warehouse.all_objects.filter(pk=pk, restaurant=restaurant).first()
    if not wh:
        return JsonResponse(
            {"success": False, "error": "انبار یافت نشد."},
            status=404,
        )

    if wh.is_mother:
        return JsonResponse(
            {"success": False, "error": "انبار مرکزی قابل حذف نیست."},
            status=400,
        )

    stock_count = StockItem.objects.filter(
        restaurant=restaurant, warehouse=wh, quantity__gt=0
    ).count()
    if stock_count > 0:
        return JsonResponse(
            {
                "success": False,
                "error": f"این انبار {stock_count} قلم کالا دارد. ابتدا کالاها را منتقل کنید.",
            },
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
        return _no_restaurant()

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
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

    data = request.data
    material_id = data.get("raw_material_id")

    if not material_id:
        return JsonResponse(
            {"success": False, "error": "شناسه کالا ارسال نشد."},
            status=400,
        )

    mat = RawMaterial.all_objects.filter(pk=material_id, restaurant=restaurant).first()
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    minimum_stock = data.get("minimum_stock")
    target_stock = data.get("target_stock")

    try:
        if minimum_stock is not None:
            mat.minimum_stock = _parse_decimal(
                minimum_stock, "حداقل موجودی"
            )
        if target_stock is not None:
            mat.target_stock = _parse_decimal(
                target_stock, "موجودی هدف"
            )
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    mat.save(update_fields=["minimum_stock", "target_stock"])

    return JsonResponse({
        "success": True,
        "msg": "بروزرسانی شد.",
        "minimum_stock": _safe_float(mat.minimum_stock),
        "target_stock": _safe_float(mat.target_stock),
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
        return _no_restaurant()

    data = request.data
    source_id = data.get("source_warehouse_id")
    dest_id = data.get("destination_warehouse_id")
    material_id = data.get("raw_material_id")
    notes = (data.get("notes") or "").strip()
    reference = (data.get("reference") or "").strip()

    if not source_id or not dest_id or not material_id:
        return JsonResponse(
            {"success": False, "error": "انبار مبدأ، مقصد و کالا الزامی است."},
            status=400,
        )

    try:
        quantity = _parse_decimal(data.get("quantity"), "مقدار انتقال", allow_zero=False)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    source_wh = Warehouse.all_objects.filter(pk=source_id, restaurant=restaurant).first()
    dest_wh = Warehouse.all_objects.filter(pk=dest_id, restaurant=restaurant).first()
    mat = RawMaterial.all_objects.filter(pk=material_id, restaurant=restaurant).first()

    if not source_wh:
        return JsonResponse(
            {"success": False, "error": "انبار مبدأ یافت نشد."}, status=404
        )
    if not dest_wh:
        return JsonResponse(
            {"success": False, "error": "انبار مقصد یافت نشد."}, status=404
        )
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
        return _no_restaurant()

    limit = _parse_int(request.GET.get("limit"), default=100)
    warehouse_id = request.GET.get("warehouse_id")
    material_id = request.GET.get("raw_material_id")

    qs = StockTransfer.objects.select_related(
        "source_warehouse", "destination_warehouse", "raw_material", "created_by"
    ).filter(restaurant=restaurant)

    if warehouse_id:
        qs = qs.filter(
            Q(source_warehouse_id=warehouse_id)
            | Q(destination_warehouse_id=warehouse_id)
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
    if not restaurant:
        return _no_restaurant()

    pk = request.GET.get("id")
    if not pk:
        return JsonResponse(
            {"success": False, "error": "شناسه ارسال نشد."}, status=400
        )

    t = StockTransfer.objects.select_related(
        "source_warehouse", "destination_warehouse", "raw_material", "created_by"
    ).filter(pk=pk, restaurant=restaurant).first()

    if not t:
        return JsonResponse(
            {"success": False, "error": "انتقال یافت نشد."}, status=404
        )

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
            "completed_at": (
                t.completed_at.strftime("%Y/%m/%d %H:%M") if t.completed_at else ""
            ),
        },
    })


# ═══════════════════════════════════════
#  ★ RECEIVING — تحویل بار / ورود کالا
# ═══════════════════════════════════════


@api_view(["POST"])
@permission_classes([InventoryPerm])
@transaction.atomic
def receiving_create(request):
    """
    ثبت ورود کالا / تحویل بار.

    ★ کل عملیات atomic است — یا همه اقلام ثبت می‌شوند یا هیچ.
    ★ یک سند Receiving مشترک برای همه اقلام ساخته می‌شود.
    """
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    items = data.get("items", [])
    purchase_invoice_id = data.get("purchase_invoice_id")
    supplier_id = data.get("supplier_id")
    notes = (data.get("notes") or "").strip()

    if not warehouse_id:
        return JsonResponse(
            {"success": False, "error": "انبار مقصد الزامی است."},
            status=400,
        )
    if not items:
        return JsonResponse(
            {"success": False, "error": "حداقل یک کالا ارسال کنید."},
            status=400,
        )

    warehouse = Warehouse.all_objects.filter(
        pk=warehouse_id, restaurant=restaurant
    ).first()
    if not warehouse:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)

    supplier = None
    if supplier_id:
        supplier = Supplier.all_objects.filter(
            pk=supplier_id, restaurant=restaurant
        ).first()

    purchase_invoice = None
    if purchase_invoice_id:
        purchase_invoice = PurchaseInvoice.all_objects.filter(
            pk=purchase_invoice_id, restaurant=restaurant
        ).first()

    # ── مرحله ۱: اعتبارسنجی همه اقلام قبل از هر تغییر ──
    validated = []
    for idx, item in enumerate(items, start=1):
        material_id = item.get("raw_material_id")

        if not material_id:
            return JsonResponse(
                {
                    "success": False,
                    "error": f"ردیف {idx}: شناسه کالا الزامی است.",
                },
                status=400,
            )

        try:
            quantity = _parse_decimal(
                item.get("quantity"), f"ردیف {idx}: مقدار", allow_zero=False
            )
            unit_price = _parse_decimal(
                item.get("unit_price", 0), f"ردیف {idx}: قیمت واحد"
            )
        except ValueError as exc:
            return JsonResponse(
                {"success": False, "error": str(exc)},
                status=400,
            )

        if unit_price < 0:
            return JsonResponse(
                {"success": False, "error": f"ردیف {idx}: قیمت واحد نمی‌تواند منفی باشد."},
                status=400,
            )

        mat = RawMaterial.all_objects.filter(
            pk=material_id, restaurant=restaurant
        ).first()
        if not mat:
            return JsonResponse(
                {"success": False, "error": f"ردیف {idx}: کالا یافت نشد."},
                status=404,
            )

        validated.append({"material": mat, "quantity": quantity, "unit_price": unit_price})

    # ── مرحله ۲: ساخت سند تحویل مشترک ──
    receiving = Receiving.all_objects.create(
        restaurant=restaurant,
        warehouse=warehouse,
        supplier=supplier,
        purchase_invoice=purchase_invoice,
        created_by=request.user if request.user.is_authenticated else None,
        notes=notes,
    )

    # ── مرحله ۳: ثبت همه اقلام ──
    results = []
    total_amount = ZERO

    for entry in validated:
        result = receive_stock(
            restaurant=restaurant,
            warehouse=warehouse,
            raw_material=entry["material"],
            quantity=entry["quantity"],
            unit_price=entry["unit_price"],
            supplier=supplier,
            purchase_invoice=purchase_invoice,
            user=request.user if request.user.is_authenticated else None,
            notes=notes,
            receiving=receiving,
        )
        results.append(result)
        total_amount += entry["quantity"] * entry["unit_price"]

    return JsonResponse({
        "success": True,
        "msg": f"{len(results)} کالا وارد انبار شد.",
        "receiving_id": receiving.pk,
        "results": results,
        "total_amount": int(total_amount),
    })


@api_view(["POST"])
@permission_classes([InventoryPerm])
def issue_create(request):
    """ثبت خروج کالا (مصرف / فروش)"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    reason = data.get("reason", "consumption")
    destination = (data.get("destination") or "").strip()
    notes = (data.get("notes") or "").strip()

    if not warehouse_id or not material_id:
        return JsonResponse(
            {"success": False, "error": "انبار و کالا الزامی است."},
            status=400,
        )

    try:
        quantity = _parse_decimal(data.get("quantity"), "مقدار", allow_zero=False)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    warehouse = Warehouse.all_objects.filter(
        pk=warehouse_id, restaurant=restaurant
    ).first()
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
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    waste_reason = data.get("waste_reason", "other")
    notes = (data.get("notes") or "").strip()

    if not warehouse_id or not material_id:
        return JsonResponse(
            {"success": False, "error": "انبار و کالا الزامی است."},
            status=400,
        )

    try:
        quantity = _parse_decimal(data.get("quantity"), "مقدار", allow_zero=False)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    warehouse = Warehouse.all_objects.filter(
        pk=warehouse_id, restaurant=restaurant
    ).first()
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
    """
    اصلاح / شمارش موجودی.

    ورودی‌ها:
      - new_quantity → مقدار مطلق شمارش‌شده
      - quantity + adjustment_type → increase / decrease / set / count

    ★ برای increase/decrease از delta استفاده می‌شود
      تا محاسبه داخل قفل انجام شود (رفع race condition).
    """
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

    data = request.data
    warehouse_id = data.get("warehouse_id")
    material_id = data.get("raw_material_id")
    adjustment_type = data.get("adjustment_type", "count")
    reason = (data.get("reason") or "").strip()
    notes = (data.get("notes") or "").strip()

    if not warehouse_id or not material_id:
        return JsonResponse(
            {"success": False, "error": "انبار و کالا الزامی است."},
            status=400,
        )

    warehouse = Warehouse.all_objects.filter(
        pk=warehouse_id, restaurant=restaurant
    ).first()
    mat = RawMaterial.all_objects.filter(pk=material_id, restaurant=restaurant).first()

    if not warehouse:
        return JsonResponse({"success": False, "error": "انبار یافت نشد."}, status=404)
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    # ── تشخیص حالت ورودی ──
    new_quantity_raw = data.get("new_quantity")
    quantity_raw = data.get("quantity")

    new_quantity = None
    delta = None

    if new_quantity_raw is not None:
        try:
            new_quantity = _parse_decimal(new_quantity_raw, "موجودی جدید")
        except ValueError as exc:
            return JsonResponse({"success": False, "error": str(exc)}, status=400)

        if new_quantity < 0:
            return JsonResponse(
                {"success": False, "error": "موجودی جدید نمی‌تواند منفی باشد."},
                status=400,
            )

    elif quantity_raw is not None:
        try:
            quantity_val = _parse_decimal(quantity_raw, "مقدار")
        except ValueError as exc:
            return JsonResponse({"success": False, "error": str(exc)}, status=400)

        if adjustment_type == "increase":
            delta = abs(quantity_val)
        elif adjustment_type == "decrease":
            delta = -abs(quantity_val)
        elif adjustment_type in ("set", "count"):
            new_quantity = quantity_val
        else:
            return JsonResponse(
                {"success": False, "error": "نوع اصلاح نامعتبر است."},
                status=400,
            )
    else:
        return JsonResponse(
            {"success": False, "error": "مقدار الزامی است."},
            status=400,
        )

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


# ═══════════════════════════════════════
#  ★ PURCHASE LIST — لیست خرید
# ═══════════════════════════════════════


@api_view(["GET"])
@permission_classes([InventoryPerm])
def purchase_list(request):
    """لیست خرید — کالاهای نیازمند خرید"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

    warehouse_id = request.GET.get("warehouse_id")
    warehouse = None
    if warehouse_id:
        warehouse = Warehouse.all_objects.filter(
            pk=warehouse_id, restaurant=restaurant
        ).first()

    items = get_purchase_list(restaurant, warehouse)

    return JsonResponse({"success": True, "items": items, "count": len(items)})


@api_view(["POST"])
@permission_classes([InventoryPerm])
def purchase_list_add(request):
    """افزودن دستی آیتم به لیست خرید"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

    data = request.data
    material_id = data.get("raw_material_id")

    if not material_id:
        return JsonResponse(
            {"success": False, "error": "شناسه کالا ارسال نشد."},
            status=400,
        )

    mat = RawMaterial.all_objects.filter(pk=material_id, restaurant=restaurant).first()
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    try:
        suggested_quantity = _parse_decimal(
            data.get("suggested_quantity", 0), "مقدار پیشنهادی"
        )
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)

    try:
        result = add_to_purchase_list(
            restaurant=restaurant,
            raw_material=mat,
            suggested_quantity=suggested_quantity,
            user=request.user if request.user.is_authenticated else None,
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
    if not restaurant:
        return _no_restaurant()

    data = request.data
    item_id = data.get("item_id")
    status = data.get("status")

    if not item_id or not status:
        return JsonResponse(
            {"success": False, "error": "شناسه و وضعیت الزامی است."},
            status=400,
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
        return _no_restaurant()

    material_id = request.GET.get("raw_material_id")
    warehouse_id = request.GET.get("warehouse_id")
    limit = _parse_int(request.GET.get("limit"), default=100)

    if not material_id:
        return JsonResponse(
            {"success": False, "error": "شناسه کالا الزامی است."},
            status=400,
        )

    mat = RawMaterial.all_objects.filter(pk=material_id, restaurant=restaurant).first()
    if not mat:
        return JsonResponse({"success": False, "error": "کالا یافت نشد."}, status=404)

    warehouse = None
    if warehouse_id:
        warehouse = Warehouse.all_objects.filter(
            pk=warehouse_id, restaurant=restaurant
        ).first()

    movements = get_item_movements(restaurant, mat, warehouse, limit)
    stock_by_wh = get_stock_by_warehouse(restaurant, mat)

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
        "total_stock": get_total_stock(restaurant, mat),
        "movements": movements,
    })


@api_view(["GET"])
@permission_classes([InventoryPerm])
def transfer_report(request):
    """گزارش گردش انتقال"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

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
        return _no_restaurant()

    warehouse_id = request.GET.get("warehouse_id")
    warehouse = None
    if warehouse_id:
        warehouse = Warehouse.all_objects.filter(
            pk=warehouse_id, restaurant=restaurant
        ).first()

    report = get_stock_value_report(restaurant, warehouse)

    return JsonResponse({"success": True, **report})


@api_view(["GET"])
@permission_classes([InventoryPerm])
def warehouse_movements(request):
    """گردش کالاهای یک انبار"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return _no_restaurant()

    warehouse_id = request.GET.get("warehouse_id")
    limit = _parse_int(request.GET.get("limit"), default=100)

    if not warehouse_id:
        return JsonResponse(
            {"success": False, "error": "شناسه انبار الزامی است."},
            status=400,
        )

    warehouse = Warehouse.all_objects.filter(
        pk=warehouse_id, restaurant=restaurant
    ).first()
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
        return _no_restaurant()

    # تعداد کالاها
    total_materials = RawMaterial.objects.filter(restaurant=restaurant).count()

    # ارزش کل موجودی — یک کوئری
    total_value = ZERO
    for s in StockItem.objects.select_related("raw_material").filter(
        restaurant=restaurant
    ):
        total_value += s.quantity * (s.raw_material.price or ZERO)

    # کالاهای کمبود — با یک کوئری batch (رفع N+1)
    stock_totals = get_stock_totals(restaurant)
    low_stock = 0
    for mat in RawMaterial.all_objects.filter(
        restaurant=restaurant, minimum_stock__gt=0
    ):
        total = stock_totals.get(mat.pk, ZERO)
        if total < (mat.minimum_stock or ZERO):
            low_stock += 1

    # تعداد انبارها
    warehouse_count = Warehouse.objects.filter(
        restaurant=restaurant, is_active=True
    ).count()

    return JsonResponse({
        "success": True,
        "dashboard": {
            "total_materials": total_materials,
            "total_stock_value": int(total_value),
            "low_stock_count": low_stock,
            "warehouse_count": warehouse_count,
        },
    })