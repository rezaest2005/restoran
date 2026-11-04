"""
Warehouse — تأمین‌کنندگان
"""
import logging

from django.http import HttpRequest, JsonResponse

from rest_framework.decorators import api_view, permission_classes

from ...models import Supplier
from ..common import (
    InventoryPerm,
    get_business_object,
    no_business_response,
    resolve_business,
)
from ..common import server_error

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  Suppliers
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([InventoryPerm])
def supplier_list(request: HttpRequest):
    """لیست تأمین‌کنندگان"""
    business = resolve_business(request)
    qs = Supplier.objects.all()
    if business:
        qs = qs.filter(business=business)

    suppliers = list(qs.values("id", "name", "phone", "address", "contact_person"))
    return JsonResponse(suppliers, safe=False)


@api_view(["GET"])
@permission_classes([InventoryPerm])
def supplier_suggestions(request: HttpRequest):
    """پیشنهاد تأمین‌کنندگان"""
    query = request.GET.get("q", "").strip()
    business = resolve_business(request)

    if not query:
        return JsonResponse([], safe=False)

    qs = Supplier.objects.filter(name__icontains=query)
    if business:
        qs = qs.filter(business=business)

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

        business = resolve_business(request)
        if not business:
            return no_business_response()

        if not name:
            return JsonResponse(
                {"success": False, "error": "نام شرکت الزامی است."}, status=400,
            )

        if sup_id:
            supplier = get_business_object(Supplier, sup_id, business)
            if not supplier:
                return JsonResponse(
                    {"success": False, "error": "تأمین‌کننده یافت نشد."}, status=404,
                )
        else:
            supplier = Supplier(business=business)

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
        return server_error(exc)


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

        business = resolve_business(request)
        sup = get_business_object(Supplier, pk, business)
        if not sup:
            return JsonResponse(
                {"success": False, "error": "تأمین‌کننده یافت نشد."}, status=404,
            )

        name = sup.name
        sup.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting supplier")
        return server_error(exc)
