"""
Warehouse — مواد اولیه
"""
import logging

from django.http import HttpRequest, JsonResponse

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ...models import RawMaterial
from ..common import (
    InventoryPerm,
    get_business_object,
    no_business_response,
    resolve_business,
    safe_int,
)
from ..common import server_error

logger = logging.getLogger(__name__)


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
        price = safe_int(data.get("price"))
        unit = data.get("unit", "unit")
        quantity = safe_int(data.get("quantity"))
        material_type = (data.get("material_type") or "raw").strip()
        if material_type not in dict(RawMaterial.MATERIAL_TYPE_CHOICES):
            return JsonResponse(
                {"success": False, "error": "نوع ماده نامعتبر است."}, status=400,
            )

        business = resolve_business(request)
        if not business:
            return no_business_response()

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
            mat = get_business_object(RawMaterial, pk, business)
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
                business=business,
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
        return server_error(exc)


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

        business = resolve_business(request)
        mat = get_business_object(RawMaterial, pk, business)
        if not mat:
            return JsonResponse(
                {"success": False, "error": "ماده اولیه یافت نشد."}, status=404,
            )

        name = mat.name
        mat.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting raw material")
        return server_error(exc)


@api_view(["GET"])
@permission_classes([InventoryPerm])
def raw_material_suggestions(request: HttpRequest):
    """پیشنهاد مواد اولیه"""
    query = request.GET.get("q", "").strip()
    business = resolve_business(request)

    if not query:
        return JsonResponse([], safe=False)

    qs = RawMaterial.objects.filter(name__icontains=query)
    if business:
        qs = qs.filter(business=business)

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
    business = resolve_business(request)
    if not business:
        return JsonResponse([], safe=False)

    qs = RawMaterial.objects.filter(business=business).values(
        "id", "name", "unit", "price", "quantity", "minimum_stock",
    )
    return JsonResponse(list(qs), safe=False)
