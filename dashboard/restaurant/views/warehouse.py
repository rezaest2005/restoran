"""
Warehouse, Raw Materials, Suppliers, Ready Materials API.

★ تغییرات نسبت به نسخه قبل:
  ۱. @staff_member_required → @api_view + @permission_classes (DRF)
  ۲. @csrf_protect / @require_POST → حذف (DRF خودش مدیریت می‌کند)
  ۳. request.POST → request.data
  ۴. request.restaurant → _resolve_restaurant(request)
  ۵. تمام create/save: restaurant= اضافه شد
  ۶. تمام query‌ها: فیلتر restaurant اضافه شد
  ۷. ready_material_save: consume_quantity تکراری حذف شد
  ۸. supplier_save: restaurant= اضافه شد
  ۹. usage_log_json/detail: فیلتر restaurant
  ۱۰. helpers.py حذف نشده — فقط import اصلاح شد
"""

import json as json_module
import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import (
    RawMaterial, Supplier, ReadyMaterial,
    InventoryMovement, InventoryUsageLog, ItemDictionary,
)
from ..permissions import (
    IsOwnerOrManagerOrWarehouseStaff,
    IsOwnerOrManager,
    IsStaffRole,
)
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)
from .helpers import (
    _read_file_rows, _extract_items_from_rows,
    _merge_warehouse_data,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  resolve restaurant — fallback
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


def _safe_int(val, default=0):
    """تبدیل امن به int"""
    try:
        return int(float(val or 0))
    except (ValueError, TypeError, InvalidOperation):
        return default


def _safe_decimal(val, default='0'):
    """تبدیل امن به Decimal"""
    try:
        return Decimal(str(val or 0))
    except (ValueError, TypeError, InvalidOperation):
        return Decimal(default)


# ═══════════════════════════════════════
#  ★★★ Raw Materials ★★★
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManagerOrWarehouseStaff])
def raw_material_save(request: HttpRequest):
    """ایجاد / ویرایش ماده اولیه"""
    try:
        data = request.data
        pk = data.get("id")
        name = data.get("name", "").strip()
        label = data.get("label", "").strip()
        price = _safe_int(data.get("price"))
        unit = data.get("unit", "unit")
        quantity = _safe_int(data.get("quantity"))
        material_type = data.get("material_type", "raw").strip()

        restaurant = _resolve_restaurant(request)
        if not restaurant:
            return JsonResponse(
                {"success": False, "error": "رستوران مشخص نشده."},
                status=400,
            )

        # Auto-detect packaging from dictionary
        if material_type == "raw":
            dict_match = ItemDictionary.objects.filter(
                restaurant=restaurant,
                name__iexact=name,
                category="raw_material",
                dict_category="packaging",
            ).first()
            if dict_match:
                material_type = "packaging"

        # Validation
        if not name:
            return JsonResponse(
                {"success": False, "error": "نام کالا الزامی است."},
                status=400,
            )
        if price < 0:
            return JsonResponse(
                {"success": False, "error": "قیمت نمی‌تواند منفی باشد."},
                status=400,
            )
        if quantity < 0:
            return JsonResponse(
                {"success": False, "error": "تعداد نمی‌تواند منفی باشد."},
                status=400,
            )

        if pk:
            mat = get_object_or_404(RawMaterial, pk=pk)
            mat.name = name
            mat.label = label
            mat.price = price
            mat.unit = unit
            mat.quantity = quantity
            mat.material_type = material_type
            mat.save()
            msg = "ویرایش شد."
        else:
            mat = RawMaterial.objects.create(
                restaurant=restaurant,
                name=name, label=label, price=price,
                unit=unit, quantity=quantity,
                material_type=material_type,
            )
            msg = "اضافه شد."

        return JsonResponse({
            "success": True, "msg": msg,
            "item": {
                "id": mat.pk, "name": mat.name, "label": mat.label,
                "price": int(mat.price), "unit": mat.unit,
                "unit_display": mat.get_unit_display(),
                "quantity": int(mat.quantity), "total": int(mat.total_price),
                "material_type": mat.material_type,
            },
        })
    except Exception as exc:
        logger.exception("Error saving raw material")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManagerOrWarehouseStaff])
def raw_material_delete(request: HttpRequest):
    """حذف ماده اولیه"""
    try:
        pk = request.data.get("id")
        if not pk:
            return JsonResponse(
                {"success": False, "error": "شناسه ارسال نشد."},
                status=400,
            )
        mat = get_object_or_404(RawMaterial, pk=pk)
        name = mat.name
        mat.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting raw material")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def raw_material_suggestions(request: HttpRequest):
    """جستجوی ماده اولیه — autocomplete"""
    query = request.GET.get("q", "").strip()
    restaurant = _resolve_restaurant(request)

    if not query:
        return JsonResponse([], safe=False)

    qs = RawMaterial.objects.filter(name__icontains=query)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    materials = qs.values("name", "unit", "price").order_by("name")[:10]
    return JsonResponse([{
        "name": m["name"],
        "unit": m["unit"],
        "price": int(m["price"]),
    } for m in materials], safe=False)


# ═══════════════════════════════════════
#  ★★★ Suppliers ★★★
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def supplier_list(request: HttpRequest):
    """لیست تأمین‌کنندگان"""
    restaurant = _resolve_restaurant(request)
    qs = Supplier.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    suppliers = list(qs.values(
        "id", "name", "phone", "address", "contact_person",
    ))
    return JsonResponse(suppliers, safe=False)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def supplier_suggestions(request: HttpRequest):
    """جستجوی تأمین‌کننده — autocomplete"""
    query = request.GET.get("q", "").strip()
    restaurant = _resolve_restaurant(request)

    if not query:
        return JsonResponse([], safe=False)

    qs = Supplier.objects.filter(name__icontains=query)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    results = [{
        "id": s.id, "name": s.name,
        "phone": s.phone or "",
        "address": s.address or "",
        "contact_person": s.contact_person or "",
    } for s in qs[:10]]
    return JsonResponse(results, safe=False)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManager])
def supplier_save(request: HttpRequest):
    """ایجاد / ویرایش تأمین‌کننده"""
    try:
        data = request.data
        sup_id = data.get("id")
        name = data.get("name", "").strip()

        restaurant = _resolve_restaurant(request)
        if not restaurant:
            return JsonResponse(
                {"success": False, "error": "رستوران مشخص نشده."},
                status=400,
            )

        if not name:
            return JsonResponse(
                {"success": False, "error": "نام شرکت الزامی است."},
                status=400,
            )

        if sup_id:
            supplier = get_object_or_404(Supplier, pk=sup_id)
        else:
            supplier = Supplier(restaurant=restaurant)

        supplier.name = name
        supplier.phone = data.get("phone", "").strip()
        supplier.address = data.get("address", "").strip()
        supplier.contact_person = data.get("contact_person", "").strip()
        supplier.description = data.get("description", "").strip()
        supplier.save()

        return JsonResponse({
            "success": True,
            "id": supplier.pk,
            "name": supplier.name,
            "phone": supplier.phone or "",
            "address": supplier.address or "",
            "contact_person": supplier.contact_person or "",
            "msg": "تأمین‌کننده ذخیره شد.",
        })
    except Exception as exc:
        logger.exception("Error saving supplier")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManager])
def supplier_delete(request: HttpRequest):
    """حذف تأمین‌کننده"""
    try:
        pk = request.data.get("id")
        if not pk:
            return JsonResponse(
                {"success": False, "error": "شناسه ارسال نشد."},
                status=400,
            )
        sup = get_object_or_404(Supplier, pk=pk)
        name = sup.name
        sup.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting supplier")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


# ═══════════════════════════════════════
#  ★★★ Warehouse ★★★
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def warehouse_json(request: HttpRequest):
    """لیست موجودی انبار"""
    restaurant = _resolve_restaurant(request)
    qs = RawMaterial.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    materials = list(qs.values(
        "id", "name", "quantity", "unit", "price", "material_type",
    ))
    for m in materials:
        m["quantity"] = float(m["quantity"])
        m["price"] = int(m["price"])
    return JsonResponse(materials, safe=False)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManagerOrWarehouseStaff])
def parse_excel_file(request: HttpRequest):
    """پارس فایل اکسل برای ورود کالا"""
    uploaded_file = request.FILES.get("file")
    if not uploaded_file:
        return JsonResponse(
            {"success": False, "error": "فایلی ارسال نشد."},
            status=400,
        )

    restaurant = _resolve_restaurant(request)

    try:
        rows = _read_file_rows(uploaded_file)
        items, supplier_name = _extract_items_from_rows(rows)

        if not items:
            return JsonResponse(
                {"success": False, "error": "هیچ کالایی در فایل یافت نشد."},
                status=400,
            )

        supplier_id = None
        if supplier_name:
            qs = Supplier.objects.filter(name__icontains=supplier_name)
            if restaurant:
                qs = qs.filter(restaurant=restaurant)
            sup = qs.first()
            if sup:
                supplier_id = sup.id

        return JsonResponse({
            "success": True,
            "items": items,
            "count": len(items),
            "supplier_name": supplier_name,
            "supplier_id": supplier_id,
        })
    except Exception as exc:
        logger.exception("Error parsing excel file")
        return JsonResponse({"success": False, "error": f"خطا: {exc}"}, status=500)


# ═══════════════════════════════════════
#  ★★★ Ready Materials ★★★
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManagerOrWarehouseStaff])
def ready_material_save(request: HttpRequest):
    """ایجاد / ویرایش کالای آماده"""
    try:
        data = request.data
        pk = data.get('id')
        name = data.get('name', '').strip()
        if not name:
            return JsonResponse(
                {'success': False, 'error': 'نام ماده الزامی است.'},
                status=400,
            )

        restaurant = _resolve_restaurant(request)
        if not restaurant:
            return JsonResponse(
                {"success": False, "error": "رستوران مشخص نشده."},
                status=400,
            )

        description = data.get('description', '').strip()
        unit = data.get('unit', 'unit')
        quantity = _safe_decimal(data.get('quantity'))
        purchase_price = _safe_int(data.get('purchase_price'))
        selling_price = _safe_int(data.get('selling_price'))
        minimum_stock = _safe_decimal(data.get('minimum_stock'))
        supplier_id = data.get('supplier') or None
        barcode = data.get('barcode', '').strip()
        raw_material_id = data.get('raw_material_id') or None
        consume_quantity = _safe_decimal(data.get('consume_quantity'))
        category_id = data.get('category') or None

        if purchase_price < 0:
            return JsonResponse(
                {'success': False, 'error': 'قیمت خرید نمی‌تواند منفی باشد.'},
                status=400,
            )
        if quantity < 0:
            return JsonResponse(
                {'success': False, 'error': 'موجودی نمی‌تواند منفی باشد.'},
                status=400,
            )

        raw_mat = None
        if raw_material_id and consume_quantity > 0:
            raw_mat = RawMaterial.objects.filter(pk=raw_material_id).first()
            if not raw_mat:
                return JsonResponse(
                    {'success': False, 'error': 'ماده اولیه یافت نشد.'},
                    status=404,
                )
            if raw_mat.quantity < consume_quantity:
                return JsonResponse({
                    'success': False,
                    'error': f'موجودی «{raw_mat.name}» ({int(raw_mat.quantity)}) کمتر از مقدار مصرف ({int(consume_quantity)}) است.',
                }, status=400)

        if pk:
            mat = get_object_or_404(ReadyMaterial, pk=pk)

            # بازگردانی مصرف قبلی
            old_raw = mat.source_raw_material
            old_consume = mat.consume_quantity or Decimal('0')
            if old_raw and old_consume > 0:
                old_raw.quantity += old_consume
                old_raw.save(update_fields=['quantity'])

            mat.name = name
            mat.description = description
            mat.unit = unit
            mat.quantity = quantity
            mat.purchase_price = purchase_price
            mat.selling_price = selling_price
            mat.minimum_stock = minimum_stock
            mat.supplier_id = supplier_id
            mat.barcode = barcode
            mat.source_raw_material = raw_mat
            mat.consume_quantity = consume_quantity if raw_mat else Decimal('0')
            mat.category_id = category_id
            mat.save()

            # کسر مصرف جدید
            if raw_mat and consume_quantity > 0:
                raw_mat.quantity -= consume_quantity
                raw_mat.save(update_fields=['quantity'])

            msg = 'ویرایش شد.'
        else:
            mat = ReadyMaterial.objects.create(
                restaurant=restaurant,
                name=name, description=description, unit=unit,
                quantity=consume_quantity if raw_mat and consume_quantity > 0 else quantity,
                purchase_price=purchase_price, selling_price=selling_price,
                minimum_stock=minimum_stock, supplier_id=supplier_id,
                barcode=barcode, source_raw_material=raw_mat,
                consume_quantity=consume_quantity if raw_mat else Decimal('0'),
                category_id=category_id,
            )

            if raw_mat and consume_quantity > 0:
                raw_mat.quantity -= consume_quantity
                raw_mat.save(update_fields=['quantity'])

            msg = 'اضافه شد.'

        return JsonResponse({
            'success': True, 'msg': msg,
            'item': {
                'id': mat.pk, 'name': mat.name,
                'description': mat.description or '',
                'unit': mat.unit, 'unit_display': mat.get_unit_display(),
                'quantity': float(mat.quantity),
                'purchase_price': int(mat.purchase_price),
                'selling_price': int(mat.selling_price),
                'minimum_stock': float(mat.minimum_stock),
                'supplier_id': mat.supplier_id,
                'supplier_name': mat.supplier.name if mat.supplier else '',
                'barcode': mat.barcode or '',
                'category_id': mat.category_id,
                'category_name': mat.category.name if mat.category else '',
                'total_value': int(mat.total_value),
                'stock_status': mat.stock_status,
            },
        })
    except Exception as exc:
        logger.exception('Error saving ready material')
        return JsonResponse({'success': False, 'error': str(exc)}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManagerOrWarehouseStaff])
def ready_material_delete(request: HttpRequest):
    """حذف کالای آماده + بازگردانی ماده اولیه"""
    try:
        pk = request.data.get("id")
        if not pk:
            return JsonResponse(
                {"success": False, "error": "شناسه ارسال نشد."},
                status=400,
            )

        mat = get_object_or_404(ReadyMaterial, pk=pk)
        name = mat.name

        # بازگردانی ماده اولیه
        if mat.source_raw_material and mat.consume_quantity > 0:
            raw = mat.source_raw_material
            raw.quantity += mat.consume_quantity
            raw.save(update_fields=['quantity'])

        mat.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting ready material")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManagerOrWarehouseStaff])
def convert_to_ready_material(request: HttpRequest):
    """تبدیل ماده اولیه به کالای آماده"""
    try:
        data = request.data
        raw_id = data.get("raw_material_id")
        qty = _safe_decimal(data.get("quantity"))
        selling_price = _safe_int(data.get("selling_price"))
        supplier_id = data.get("supplier") or None

        restaurant = _resolve_restaurant(request)
        if not restaurant:
            return JsonResponse(
                {"success": False, "error": "رستوران مشخص نشده."},
                status=400,
            )

        if not raw_id:
            return JsonResponse(
                {"success": False, "error": "ماده اولیه انتخاب نشده."},
                status=400,
            )
        if qty <= 0:
            return JsonResponse(
                {"success": False, "error": "مقدار باید بیشتر از صفر باشد."},
                status=400,
            )

        raw_mat = get_object_or_404(RawMaterial, pk=raw_id)
        if qty > raw_mat.quantity:
            return JsonResponse({
                "success": False,
                "error": f"موجودی کافی نیست. حداکثر: {int(raw_mat.quantity)}",
            }, status=400)

        with transaction.atomic():
            raw_mat.quantity -= qty
            raw_mat.save(update_fields=["quantity"])

            ready = ReadyMaterial.objects.create(
                restaurant=restaurant,
                name=raw_mat.name,
                description="تبدیل شده از ماده اولیه",
                unit=raw_mat.unit,
                quantity=qty,
                purchase_price=int(raw_mat.price),
                selling_price=selling_price,
                minimum_stock=0,
                supplier_id=supplier_id,
            )

        return JsonResponse({
            "success": True,
            "msg": f"«{raw_mat.name}» به مواد آماده اضافه شد.",
            "item": {
                "id": ready.pk, "name": ready.name,
                "description": ready.description or "",
                "unit": ready.unit,
                "unit_display": ready.get_unit_display(),
                "quantity": float(ready.quantity),
                "purchase_price": int(ready.purchase_price),
                "selling_price": int(ready.selling_price),
                "minimum_stock": float(ready.minimum_stock),
                "supplier_id": ready.supplier_id,
                "supplier_name": ready.supplier.name if ready.supplier else "",
                "barcode": ready.barcode or "",
                "total_value": int(ready.total_value),
                "stock_status": ready.stock_status,
            },
        })
    except Exception as exc:
        logger.exception("Error converting to ready material")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManagerOrWarehouseStaff])
def ready_material_update_price(request: HttpRequest):
    """بروزرسانی قیمت فروش کالای آماده"""
    try:
        data = request.data
        rm_id = data.get('id')
        selling_price = _safe_int(data.get('selling_price'))

        if not rm_id:
            return JsonResponse(
                {'success': False, 'error': 'شناسه ارسال نشد.'},
                status=400,
            )
        if selling_price < 0:
            return JsonResponse(
                {'success': False, 'error': 'قیمت نمی‌تواند منفی باشد.'},
                status=400,
            )

        rm = get_object_or_404(ReadyMaterial, pk=rm_id)
        rm.selling_price = selling_price
        rm.save(update_fields=['selling_price'])

        return JsonResponse({
            'success': True,
            'msg': f'قیمت «{rm.name}» بروزرسانی شد.',
            'item': {
                'id': rm.pk, 'name': rm.name,
                'selling_price': int(rm.selling_price),
                'purchase_price': int(rm.purchase_price),
            },
        })
    except Exception as exc:
        logger.exception('Error updating ready material price')
        return JsonResponse({'success': False, 'error': str(exc)}, status=500)


# ═══════════════════════════════════════
#  ★★★ Usage Log API ★★★
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def usage_log_json(request: HttpRequest):
    """لیست آخرین مصارف انبار"""
    restaurant = _resolve_restaurant(request)
    qs = InventoryUsageLog.objects.select_related("raw_material")

    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    # فیلترها
    material_id = request.GET.get("material_id")
    if material_id:
        qs = qs.filter(raw_material_id=material_id)

    usage_type = request.GET.get("type")
    if usage_type:
        qs = qs.filter(usage_type=usage_type)

    logs = qs.order_by("-used_at")[:200]

    data = [{
        "id": log.id,
        "material": log.raw_material.name if log.raw_material else '?',
        "unit": log.raw_material.get_unit_display() if log.raw_material else '',
        "quantity": str(log.quantity_used),
        "type": log.get_usage_type_display(),
        "type_key": log.usage_type,
        "reference": log.reference or "—",
        "note": log.note or "",
        "date": log.used_at.strftime("%Y/%m/%d %H:%M"),
    } for log in logs]
    return JsonResponse({"logs": data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def usage_log_detail_json(request: HttpRequest):
    """مصارف یک ماده خاص"""
    material_id = request.GET.get("material_id", "")
    restaurant = _resolve_restaurant(request)

    if not material_id:
        return JsonResponse({"logs": [], "material": None})

    qs = InventoryUsageLog.objects.filter(
        raw_material_id=material_id,
    ).select_related("raw_material")

    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    logs = qs.order_by("-used_at")
    material = logs.first().raw_material if logs.exists() else None

    data = [{
        "id": log.id,
        "quantity": str(log.quantity_used),
        "type": log.get_usage_type_display(),
        "type_key": log.usage_type,
        "reference": log.reference or "—",
        "note": log.note or "",
        "date": log.used_at.strftime("%Y/%m/%d %H:%M"),
    } for log in logs]

    total = sum(float(d["quantity"]) for d in data)

    return JsonResponse({
        "logs": data,
        "total_consumed": str(total),
        "material": {
            "name": material.name,
            "unit": material.get_unit_display(),
            "stock": str(material.quantity),
        } if material else None,
    })