"""
Users & access → «Transport» (حمل‌ونقل): one form that makes a transport person —
sign-in (role "transport") + driver record + optional vehicle. Same service as the fleet form.

  GET  /api/users/transport/             vehicles for the picker + whether the delivery module is on
  POST /api/users/transport/             create a transport person (username + password required)
  PUT  /api/users/transport/<user_id>/   edit the person behind this account
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from ...models import Driver, Vehicle
from ...modules import module_enabled
from ...roles import ROLE_MANAGER, ROLE_OWNER, ROLE_TRANSPORT, has_permission, normalize_role
from ...transport_services import driver_data, ensure_driver_profile, save_transport_person
from ...activity import audit
from ..common import UsersPerm, resolve_business, server_error
from .base import _get_business_users_qs


def _err(msg, status=400):
    return Response({"success": False, "error": msg}, status=status)


def _vehicle_row(v):
    return {"id": v.id, "name": v.name, "plate": v.plate, "kind": v.kind, "is_active": v.is_active}


@api_view(["GET", "POST"])
@permission_classes([UsersPerm])
@audit("users", "transport_person", "راننده / پیک")
def transport_people(request):
    business = resolve_business(request)
    if business is None:
        return _err("کسب‌وکاری برای این کاربر تعریف نشده است.")
    enabled = module_enabled(business, "delivery")
    if request.method == "GET":
        vehicles = Vehicle.all_objects.filter(business=business, is_active=True).order_by("name")
        return Response({"success": True, "delivery_enabled": enabled,
                         "vehicles": [_vehicle_row(v) for v in vehicles],
                         "services": [c[0] for c in Driver.Service.choices]})
    if not has_permission(request.user, "users.create"):
        return _err("دسترسی ندارید.", 403)
    if not enabled:
        return _err("ماژول «حمل و تحویل» برای این کسب‌وکار فعال نیست.")
    data = request.data
    if not str(data.get("username") or "").strip() or len(str(data.get("password") or "")) < 4:
        return _err("نام کاربری و رمز (حداقل ۴ کاراکتر) الزامی است.")
    try:
        drv = save_transport_person(business, data)
    except ValueError as e:
        return _err(str(e))
    except Exception as e:
        return server_error(e)
    return Response({"success": True, "user_id": drv.user_id, "username": drv.user.username,
                     "driver": driver_data(drv)}, status=201)


@api_view(["PUT"])
@permission_classes([UsersPerm])
@audit("users", "transport_person", "راننده / پیک")
def transport_person_detail(request, user_id):
    business = resolve_business(request)
    if business is None:
        return _err("کسب‌وکاری برای این کاربر تعریف نشده است.")
    if not has_permission(request.user, "users.edit"):
        return _err("دسترسی ندارید.", 403)
    target = _get_business_users_qs(request.user).filter(pk=user_id, business=business).first()
    if target is None:
        return _err("کاربر یافت نشد.", 404)
    if normalize_role(target.role) not in (ROLE_TRANSPORT, ROLE_OWNER, ROLE_MANAGER):
        return _err("این کاربر حمل‌ونقل نیست.")
    data = dict(request.data.items())
    data.pop("user_id", None)      # the account is fixed by the URL
    data.pop("username", None)
    try:
        drv = Driver.all_objects.filter(user=target).first() or ensure_driver_profile(target)
        drv = save_transport_person(business, data, drv)
    except ValueError as e:
        return _err(str(e))
    except Exception as e:
        return server_error(e)
    return Response({"success": True, "user_id": target.id, "driver": driver_data(drv)})
