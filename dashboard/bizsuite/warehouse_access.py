"""
Per-user warehouse access (networked multi-warehouse).

Rules
  * Superusers, owners and managers always see and use every warehouse.
  * Everyone else has full access while ``User.all_warehouses`` is True;
    when it is False they only reach the warehouses assigned to them through
    ``UserWarehouse``.  No assignment means no warehouse at all.
  * Transfers: the SOURCE must be allowed, the DESTINATION may be any active
    warehouse of the business (a keeper sends stock to another warehouse and
    the receiving keeper sees the incoming movement in their own list).

POS sales and production consume stock from the business sales / production
warehouse through system services (``inventory_services`` called directly,
without a request user), so they are intentionally NOT restricted by the
acting user's warehouse assignment.
"""
from django.http import JsonResponse

from .models import UserWarehouse

DENIED_MESSAGE = "شما به این انبار دسترسی ندارید."
MANAGE_DENIED_MESSAGE = "فقط مالک یا مدیر می‌تواند انبارها را مدیریت کند."


class WarehouseAccessDenied(Exception):
    def __init__(self, message=DENIED_MESSAGE):
        super().__init__(message)
        self.message = message


def denied_response(exc=None):
    msg = getattr(exc, "message", None) or DENIED_MESSAGE
    return JsonResponse({"success": False, "error": msg}, status=403)


def is_manager_level(user):
    """Owner, manager or superuser (can manage warehouses and see all)."""
    if not getattr(user, "is_authenticated", False):
        return False
    return bool(user.is_superuser or user.role in ("owner", "manager"))


def is_unrestricted(user):
    if not getattr(user, "is_authenticated", False):
        return False
    return is_manager_level(user) or bool(user.all_warehouses)


def allowed_warehouse_ids(user, business=None):
    """None means every warehouse; otherwise a set of warehouse ids."""
    if user is None or is_unrestricted(user):
        return None
    business = business or getattr(user, "business", None)
    qs = UserWarehouse.all_objects.filter(user=user, warehouse__is_active=True)
    if business is not None:
        qs = qs.filter(business=business)
    return set(qs.values_list("warehouse_id", flat=True))


def filter_warehouses(qs, user, business=None):
    """Restrict a Warehouse queryset to what the user may see."""
    ids = allowed_warehouse_ids(user, business)
    return qs if ids is None else qs.filter(pk__in=ids)


def filter_by_warehouse(qs, user, business=None, field="warehouse_id"):
    """Restrict a queryset that has a warehouse FK (stock, movements...)."""
    ids = allowed_warehouse_ids(user, business)
    return qs if ids is None else qs.filter(**{f"{field}__in": ids})


def assert_can_use(user, warehouse, write=False):
    """Raise WarehouseAccessDenied unless the user may use this warehouse."""
    business = getattr(user, "business", None)
    ids = allowed_warehouse_ids(user, business)
    if ids is not None and warehouse.pk not in ids:
        raise WarehouseAccessDenied(
            "شما اجازهٔ ثبت تراکنش روی این انبار را ندارید." if write else DENIED_MESSAGE
        )


def assert_manager(user):
    if not is_manager_level(user):
        raise WarehouseAccessDenied(MANAGE_DENIED_MESSAGE)


def access_payload(user):
    """{all_access, warehouse_ids} for the frontend (effective access)."""
    ids = allowed_warehouse_ids(user)
    if ids is None:
        return {"all_access": True, "warehouse_ids": []}
    return {"all_access": False, "warehouse_ids": sorted(ids)}
