"""
Inventory — شبکهٔ انبارها و دسترسی انبار هر کاربر

  GET  /api/inventory/network/                     نمای کلی شبکه (فقط مالک/مدیر)
  GET  /api/inventory/users/<id>/warehouses/       دسترسی انبار یک کاربر
  PUT  /api/inventory/users/<id>/warehouses/       تعیین دسترسی (فقط مالک/مدیر همان کسب‌وکار)
"""
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, F, Sum
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes

from ...models import InventoryMovement, StockItem, User, UserWarehouse, Warehouse
from ...inventory_services import get_or_create_mother_warehouse
from ...warehouse_access import (
    WarehouseAccessDenied,
    assert_manager,
    denied_response,
)
from ..common import (
    InventoryPerm,
    UsersPerm,
    no_business_response,
    resolve_business_active,
)

RECENT_DAYS = 7


def _display(u):
    return u.get_full_name() or u.get_username()


@api_view(["GET"])
@permission_classes([InventoryPerm])
def inventory_network(request):
    """خلاصهٔ هر انبار شبکه: موجودی، ارزش، انبارداران و انتقال‌های ۷ روز اخیر"""
    business = resolve_business_active(request)
    if not business:
        return no_business_response()
    try:
        assert_manager(request.user)
    except WarehouseAccessDenied as exc:
        return denied_response(exc)

    get_or_create_mother_warehouse(business)
    warehouses = list(
        Warehouse.all_objects.filter(business=business, is_active=True).order_by("-is_mother", "name")
    )

    stock = {
        row["warehouse_id"]: row
        for row in StockItem.all_objects.filter(business=business, quantity__gt=0)
        .values("warehouse_id")
        .annotate(items=Count("pk"), value=Sum(F("quantity") * F("raw_material__price")))
    }

    since = timezone.now() - timedelta(days=RECENT_DAYS)
    moves = {}
    for row in (
        InventoryMovement.all_objects.filter(
            business=business, reference_type="transfer", created_at__gte=since,
            warehouse__isnull=False,
        )
        .values("warehouse_id", "movement_type")
        .annotate(n=Count("pk"))
    ):
        moves[(row["warehouse_id"], row["movement_type"])] = row["n"]

    keepers = {w.pk: [] for w in warehouses}
    seen = {w.pk: set() for w in warehouses}
    for link in UserWarehouse.all_objects.filter(
        business=business, user__is_active=True, warehouse__is_active=True
    ).select_related("user"):
        if link.user_id not in seen[link.warehouse_id]:
            seen[link.warehouse_id].add(link.user_id)
            keepers[link.warehouse_id].append(_display(link.user))
    # warehouse keepers with unrestricted access work in every warehouse
    for u in User.objects.filter(business=business, role="warehouse", is_active=True, all_warehouses=True):
        for w in warehouses:
            if u.pk not in seen[w.pk]:
                seen[w.pk].add(u.pk)
                keepers[w.pk].append(_display(u))

    data = []
    for w in warehouses:
        st = stock.get(w.pk) or {}
        data.append({
            "id": w.pk,
            "name": w.name,
            "warehouse_type": w.warehouse_type,
            "warehouse_type_display": w.get_warehouse_type_display(),
            "is_mother": w.is_mother,
            "is_sales_default": w.is_sales_default,
            "item_count": st.get("items", 0),
            "total_stock_value": int(st.get("value") or 0),
            "keepers": keepers[w.pk],
            "transfers_out_7d": moves.get((w.pk, "out"), 0),
            "transfers_in_7d": moves.get((w.pk, "in"), 0),
        })

    return JsonResponse({"success": True, "data": {"warehouses": data, "recent_days": RECENT_DAYS}})


def _target_user(request, user_id):
    business = resolve_business_active(request)
    if not business:
        return None, None
    return business, User.objects.filter(pk=user_id, business=business).first()


@api_view(["GET", "PUT"])
@permission_classes([UsersPerm])
def user_warehouse_access(request, user_id):
    """دسترسی انبار یک کاربر: {all_access, warehouse_ids}"""
    business, target = _target_user(request, user_id)
    if not business:
        return no_business_response()
    try:
        assert_manager(request.user)
    except WarehouseAccessDenied as exc:
        return denied_response(exc)
    if target is None:
        return JsonResponse({"success": False, "error": "کاربر یافت نشد."}, status=404)

    if request.method == "PUT":
        body = request.data
        all_access = body.get("all_access")
        if not isinstance(all_access, bool):
            return JsonResponse({"success": False, "error": "مقدار all_access نامعتبر است."}, status=400)
        raw_ids = body.get("warehouse_ids") or []
        if not isinstance(raw_ids, list):
            return JsonResponse({"success": False, "error": "warehouse_ids باید لیست باشد."}, status=400)
        try:
            ids = {int(i) for i in raw_ids}
        except (TypeError, ValueError):
            return JsonResponse({"success": False, "error": "شناسه انبار نامعتبر است."}, status=400)

        if not all_access:
            valid = set(
                Warehouse.all_objects.filter(business=business, is_active=True, pk__in=ids)
                .values_list("pk", flat=True)
            )
            if valid != ids:
                return JsonResponse(
                    {"success": False, "error": "انبار انتخاب‌شده متعلق به این کسب‌وکار نیست."}, status=400
                )

        with transaction.atomic():
            stale = UserWarehouse.all_objects.filter(user=target)
            if not all_access:
                stale = stale.exclude(warehouse_id__in=ids)
            stale.delete()
            if not all_access:
                for wid in ids:
                    UserWarehouse.all_objects.get_or_create(
                        business=business, user=target, warehouse_id=wid
                    )
            if target.all_warehouses != all_access:
                target.all_warehouses = all_access
                target.save(update_fields=["all_warehouses"])

    links = list(
        UserWarehouse.all_objects.filter(user=target, business=business)
        .order_by("warehouse_id").values_list("warehouse_id", flat=True)
    )
    return JsonResponse({
        "success": True,
        "data": {"all_access": bool(target.all_warehouses), "warehouse_ids": links},
    })
