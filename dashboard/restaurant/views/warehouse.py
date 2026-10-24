"""
Warehouse, Raw Materials, Suppliers API — ★ نسخه v6 — cleanup
فقط مدل‌های: RawMaterial, Supplier
"""

import logging
from decimal import Decimal, InvalidOperation

from django.http import HttpRequest, JsonResponse

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ..models import RawMaterial, Supplier
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)
from .helpers import (
    _read_file_rows, _extract_items_from_rows,
)
from .decorators import make_service_permission

logger = logging.getLogger(__name__)

InventoryPerm = make_service_permission('inventory')


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
    try:
        return int(float(val or 0))
    except (ValueError, TypeError, InvalidOperation):
        return default


def _get_restaurant_object(model, pk, restaurant):
    qs = model.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    try:
        return qs.get(pk=pk)
    except model.DoesNotExist:
        return None


# ═══════════════════════════════════════
#  Raw Materials
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
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
                {"success": False, "error": "رستوران مشخص نشده."}, status=400,
            )

        if not name:
            return JsonResponse(
                {"success": False, "error": "نام کالا الزامی است."}, status=400,
            )
        if price < 0:
            return JsonResponse(
                {"success": False, "error": "قیمت نمی‌تواند منفی باشد."}, status=400,
            )
        if quantity < 0:
            return JsonResponse(
                {"success": False, "error": "تعداد نمی‌تواند منفی باشد."}, status=400,
            )

        if pk:
            mat = _get_restaurant_object(RawMaterial, pk, restaurant)
            if not mat:
                return JsonResponse(
                    {"success": False, "error": "ماده اولیه یافت نشد."}, status=404,
                )
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
                "quantity": int(mat.quantity),
                "material_type": mat.material_type,
            },
        })
    except Exception as exc:
        logger.exception("Error saving raw material")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


@api_view(["POST"])
@permission_classes([InventoryPerm])
def raw_material_delete(request: HttpRequest):
    """حذف ماده اولیه"""
    try:
        pk = request.data.get("id")
        if not pk:
            return JsonResponse(
                {"success": False, "error": "شناسه ارسال نشد."}, status=400,
            )

        restaurant = _resolve_restaurant(request)
        mat = _get_restaurant_object(RawMaterial, pk, restaurant)
        if not mat:
            return JsonResponse(
                {"success": False, "error": "ماده اولیه یافت نشد."}, status=404,
            )

        name = mat.name
        mat.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting raw material")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


@api_view(["GET"])
@permission_classes([InventoryPerm])
def raw_material_suggestions(request: HttpRequest):
    """پیشنهاد مواد اولیه"""
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def raw_material_list_api(request: HttpRequest):
    """لیست تمام مواد اولیه"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse([], safe=False)

    qs = RawMaterial.objects.filter(restaurant=restaurant).values(
        "id", "name", "unit", "price", "quantity", "minimum_stock",
    )
    return JsonResponse(list(qs), safe=False)


# ═══════════════════════════════════════
#  Suppliers
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([InventoryPerm])
def supplier_list(request: HttpRequest):
    """لیست تأمین‌کنندگان"""
    restaurant = _resolve_restaurant(request)
    qs = Supplier.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    suppliers = list(qs.values("id", "name", "phone", "address", "contact_person"))
    return JsonResponse(suppliers, safe=False)


@api_view(["GET"])
@permission_classes([InventoryPerm])
def supplier_suggestions(request: HttpRequest):
    """پیشنهاد تأمین‌کنندگان"""
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
@permission_classes([InventoryPerm])
def supplier_save(request: HttpRequest):
    """ایجاد / ویرایش تأمین‌کننده"""
    try:
        data = request.data
        sup_id = data.get("id")
        name = data.get("name", "").strip()

        restaurant = _resolve_restaurant(request)
        if not restaurant:
            return JsonResponse(
                {"success": False, "error": "رستوران مشخص نشده."}, status=400,
            )

        if not name:
            return JsonResponse(
                {"success": False, "error": "نام شرکت الزامی است."}, status=400,
            )

        if sup_id:
            supplier = _get_restaurant_object(Supplier, sup_id, restaurant)
            if not supplier:
                return JsonResponse(
                    {"success": False, "error": "تأمین‌کننده یافت نشد."}, status=404,
                )
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
@permission_classes([InventoryPerm])
def supplier_delete(request: HttpRequest):
    """حذف تأمین‌کننده"""
    try:
        pk = request.data.get("id")
        if not pk:
            return JsonResponse(
                {"success": False, "error": "شناسه ارسال نشد."}, status=400,
            )

        restaurant = _resolve_restaurant(request)
        sup = _get_restaurant_object(Supplier, pk, restaurant)
        if not sup:
            return JsonResponse(
                {"success": False, "error": "تأمین‌کننده یافت نشد."}, status=404,
            )

        name = sup.name
        sup.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting supplier")
        return JsonResponse({"success": False, "error": str(exc)}, status=500)


# ═══════════════════════════════════════
#  Warehouse JSON
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([InventoryPerm])
def warehouse_json(request: HttpRequest):
    """JSON مواد اولیه انبار"""
    restaurant = _resolve_restaurant(request)
    qs = RawMaterial.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    materials = list(qs.values("id", "name", "quantity", "unit", "price", "material_type"))
    for m in materials:
        m["quantity"] = float(m["quantity"])
        m["price"] = int(m["price"])
    return JsonResponse(materials, safe=False)


# ═══════════════════════════════════════
#  Parse Excel
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([InventoryPerm])
def parse_excel_file(request: HttpRequest):
    """پارس فایل اکسل"""
    uploaded_file = request.FILES.get("file")
    if not uploaded_file:
        return JsonResponse(
            {"success": False, "error": "فایلی ارسال نشد."}, status=400,
        )

    restaurant = _resolve_restaurant(request)

    try:
        rows = _read_file_rows(uploaded_file)
        items, supplier_name = _extract_items_from_rows(rows)

        if not items:
            return JsonResponse(
                {"success": False, "error": "هیچ کالایی در فایل یافت نشد."}, status=400,
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