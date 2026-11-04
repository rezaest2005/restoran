"""
Warehouse — خروجی JSON انبار و پارس فایل اکسل
"""
import logging

from django.http import HttpRequest, JsonResponse

from rest_framework.decorators import api_view, permission_classes

from ...models import RawMaterial, Supplier
from ..helpers import (
    _read_file_rows, _extract_items_from_rows,
)
from ..common import InventoryPerm, resolve_business
from ..common import server_error

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  Warehouse JSON
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([InventoryPerm])
def warehouse_json(request: HttpRequest):
    """JSON مواد اولیه انبار"""
    business = resolve_business(request)
    qs = RawMaterial.objects.all()
    if business:
        qs = qs.filter(business=business)

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

    business = resolve_business(request)

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
            if business:
                qs = qs.filter(business=business)
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
        return server_error(exc)
