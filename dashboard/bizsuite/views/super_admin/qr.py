"""
Super admin: QR links per business.

  GET    /api/super/qr/?business_id=<id>   list
  POST   /api/super/qr/                    {business_id, label, kind, custom_url, table_number}
                                           or bulk {business_id, tables: N, kind, custom_url}
  PUT    /api/super/qr/<id>/               change label / target / active (printed QRs follow instantly)
  DELETE /api/super/qr/<id>/
"""
from django.db import transaction
from rest_framework.decorators import api_view, permission_classes

from ...models import Business, QrLink
from ...qr_services import MAX_BULK, clean_fields, resolve_target
from ...utils import api_error, api_success
from .auth import IsSuperAdmin


def _row(q):
    return {
        "id": q.id, "business_id": q.business_id, "code": q.code, "path": f"/q/{q.code}/",
        "label": q.label, "kind": q.kind, "kind_display": q.get_kind_display(),
        "custom_url": q.custom_url, "table_number": q.table_number, "is_active": q.is_active,
        "scans": q.scans, "last_scan_at": q.last_scan_at.isoformat() if q.last_scan_at else None,
        "target": resolve_target(q),      # null = cannot be served right now (module off / no published site)
    }


@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def super_qr_links(request):
    if request.method == "GET":
        bid = request.query_params.get("business_id")
        if not str(bid or "").isdigit():
            return api_error("business_id is required")
        qs = QrLink.all_objects.filter(business_id=int(bid)).select_related("business")
        return api_success([_row(q) for q in qs])

    d = request.data
    business = Business.objects.filter(pk=d.get("business_id")).first() if str(d.get("business_id") or "").isdigit() else None
    if business is None:
        return api_error("کسب‌وکار پیدا نشد.", 404)
    try:
        fields = clean_fields(d)
        tables = d.get("tables")
        if tables not in (None, ""):
            n = int(tables)
            if not 1 <= n <= MAX_BULK:
                raise ValueError(f"تعداد میز باید بین ۱ تا {MAX_BULK} باشد.")
            with transaction.atomic():
                made = [QrLink.all_objects.create(
                    business=business, **{**fields, "label": f"میز {i}", "table_number": str(i)})
                    for i in range(1, n + 1)]
            return api_success([_row(q) for q in made], status_code=201)
        q = QrLink.all_objects.create(business=business, **fields)
    except (ValueError, TypeError) as e:
        return api_error(str(e))
    return api_success(_row(q), status_code=201)


@api_view(["PUT", "DELETE"])
@permission_classes([IsSuperAdmin])
def super_qr_detail(request, pk):
    q = QrLink.all_objects.select_related("business").filter(pk=pk).first()
    if q is None:
        return api_error("پیدا نشد.", 404)
    if request.method == "DELETE":
        q.delete()
        return api_success({"deleted": True})
    try:
        for k, v in clean_fields(request.data, q).items():
            setattr(q, k, v)
        q.save()
    except ValueError as e:
        return api_error(str(e))
    return api_success(_row(q))
