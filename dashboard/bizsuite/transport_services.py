"""
Transport people — one role ("transport") and one record (``Driver``) for everyone who moves
things for the business: order couriers, cargo / unit drivers, or both.

The same functions back both entry points, so they can never drift apart:

* Definitions → Users & access → "Transport"   (``views/users/transport.py``)
* Delivery → Fleet → "Drivers & couriers"       (``views/delivery.py``)

Each transport person = an optional sign-in (User, role "transport", no dashboard tabs) +
a ``Driver`` record (number for the driver-app link, phone, vehicle, pay per trip, service).
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .models import Carrier, Driver, Vehicle
from .roles import ROLE_MANAGER, ROLE_OWNER, ROLE_TRANSPORT, normalize_role

User = get_user_model()

SERVICES = [c[0] for c in Driver.Service.choices]
# accounts that may be linked to a driver record (an owner can drive his own van)
LINKABLE_ROLES = (ROLE_TRANSPORT, ROLE_OWNER, ROLE_MANAGER)


# ─── small helpers ───────────────────────────────────────────

def _f(v):
    return float(v) if v is not None else None


def _dt(v):
    return timezone.localtime(v).isoformat() if v else None


def _dec(value, name):
    if value in (None, ""):
        return Decimal("0")
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{name} نامعتبر است.")
    if d < 0:
        raise ValueError(f"{name} نمی‌تواند منفی باشد.")
    return d


def _bool(v, default=True):
    return default if v is None else bool(v)


def _obj(model, pk, business):
    if pk in (None, ""):
        return None
    try:
        return model.all_objects.filter(business=business, pk=int(pk)).first()
    except (ValueError, TypeError):
        return None


def next_driver_number(business) -> int:
    top = Driver.all_objects.filter(business=business).aggregate(m=Max("number"))["m"] or 0
    return top + 1


def driver_link_path(d) -> str:
    slug = d.business.slug
    return f"/{slug}/bizsuite_driver/{d.number}" if d.number else f"/{slug}/bizsuite_driver"


def driver_data(d) -> dict:
    v = d.default_vehicle
    return {
        "id": d.id, "number": d.number, "name": d.name, "phone": d.phone, "user_id": d.user_id,
        "username": d.user.username if d.user_id else "",
        "link_path": driver_link_path(d),
        "service": d.service,
        "carrier_id": d.carrier_id, "default_vehicle_id": d.default_vehicle_id,
        "vehicle": {"id": v.id, "name": v.name, "plate": v.plate, "kind": v.kind} if v else None,
        "pay_per_trip": _f(d.pay_per_trip), "is_active": d.is_active, "on_shift": d.on_shift,
        "last_lat": _f(d.last_lat), "last_lng": _f(d.last_lng), "last_seen": _dt(d.last_seen),
    }


# ─── vehicle made right in the person form ───────────────────

def quick_vehicle(business, spec, person_name=""):
    """``spec`` = {kind, plate, name?} → a new Vehicle (name made unique for the business)."""
    if not isinstance(spec, dict):
        raise ValueError("مشخصات وسیله‌ی نقلیه نامعتبر است.")
    kind = spec.get("kind") or Vehicle.Kind.MOTORBIKE
    if kind not in dict(Vehicle.Kind.choices):
        raise ValueError("نوع وسیله‌ی نقلیه نامعتبر است.")
    plate = str(spec.get("plate") or "").strip()[:30]
    base = (str(spec.get("name") or "").strip() or
            " ".join(x for x in (str(Vehicle.Kind(kind).label), plate or person_name) if x)).strip()[:90]
    name, n = base, 2
    while Vehicle.all_objects.filter(business=business, name=name).exists():
        name = f"{base} ({n})"
        n += 1
    return Vehicle.all_objects.create(business=business, name=name[:100], plate=plate, kind=kind)


# ─── the driver record ───────────────────────────────────────

def driver_fields(business, d, drv=None) -> dict:
    """Validated Driver fields from request data (only keys that are present change on update)."""
    from_parts = f"{d.get('first_name') or ''} {d.get('last_name') or ''}".strip()
    if "name" in d:
        name = str(d.get("name") or "").strip() or from_parts
    else:
        name = from_parts or (drv.name if drv else "")
    if not name:
        raise ValueError("نام راننده / پیک الزامی است.")
    phone = d.get("phone", d.get("phone_number", drv.phone if drv else ""))
    out = {
        "name": name[:200], "phone": str(phone or "")[:20],
        "pay_per_trip": _dec(d.get("pay_per_trip", drv.pay_per_trip if drv else 0), "کارمزد"),
        "is_active": _bool(d.get("is_active"), drv.is_active if drv else True),
    }
    if "service" in d or drv is None:
        service = d.get("service") or Driver.Service.BOTH
        if service not in SERVICES:
            raise ValueError("نوع کار نامعتبر است.")
        out["service"] = service
    if "carrier_id" in d or drv is None:
        out["carrier"] = _obj(Carrier, d.get("carrier_id"), business)
        if d.get("carrier_id") and out["carrier"] is None:
            raise ValueError("حمل‌کننده پیدا نشد.")
    if "default_vehicle_id" in d or drv is None:
        out["default_vehicle"] = _obj(Vehicle, d.get("default_vehicle_id"), business)
        if d.get("default_vehicle_id") and out["default_vehicle"] is None:
            raise ValueError("خودرو پیدا نشد.")
    if "user_id" in d or drv is None:
        uid = d.get("user_id")
        if uid in (None, ""):
            out["user"] = None
        else:
            u = User.objects.filter(pk=uid, business=business).first() if str(uid).isdigit() else None
            if u is None or normalize_role(u.role) not in LINKABLE_ROLES:
                raise ValueError("کاربر انتخابی معتبر نیست.")
            if Driver.all_objects.filter(user=u).exclude(pk=drv.pk if drv else None).exists():
                raise ValueError("این کاربر قبلاً به راننده دیگری متصل است.")
            out["user"] = u
    return out


def apply_account(business, data, fields, name, drv=None):
    """Sign-in for the transport person: username + password create the account (role "transport",
    business prefix on the username); with an account linked already, a filled password resets it."""
    from .views.users.base import _apply_prefix

    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    user = fields["user"] if "user" in fields else (drv.user if drv is not None else None)
    if user is not None:
        changed = []
        if password:
            if len(password) < 4:
                raise ValueError("رمز باید حداقل ۴ کاراکتر باشد.")
            user.set_password(password)
            changed.append("password")
        for key in ("first_name", "last_name"):
            if key in data and normalize_role(user.role) == ROLE_TRANSPORT:
                setattr(user, key, str(data.get(key) or "").strip()[:150])
                changed.append(key)
        if "is_active" in data and normalize_role(user.role) == ROLE_TRANSPORT:
            user.is_active = bool(data.get("is_active"))
            changed.append("is_active")
        if changed:
            user.save(update_fields=changed)
        return
    if not username and not password:
        return
    if not username or len(password) < 4:
        raise ValueError("برای ساخت ورود راننده / پیک هم نام کاربری و هم رمز (حداقل ۴ کاراکتر) لازم است.")
    final = _apply_prefix(username, business)
    if User.objects.filter(username=final).exists():
        raise ValueError(f"نام کاربری «{final}» قبلاً ثبت شده است.")
    phone = str(data.get("phone_number") or "").strip() or None
    if phone and User.objects.filter(phone_number=phone).exists():
        raise ValueError(f"شماره «{phone}» قبلاً ثبت شده.")
    u = User.objects.create_user(username=final, password=password)
    u.role = ROLE_TRANSPORT
    u.business = business
    first = str(data.get("first_name") or "").strip()
    u.first_name = (first or name or "")[:150]
    u.last_name = str(data.get("last_name") or "").strip()[:150]
    u.phone_number = phone
    u.is_approved = True
    u.is_staff = False
    u.is_superuser = False
    u.tabs = {}
    u.save()
    fields["user"] = u


def save_transport_person(business, data, drv=None) -> Driver:
    """Create (``drv`` None) or update one transport person: driver record + optional vehicle + sign-in."""
    with transaction.atomic():
        type(business).objects.select_for_update().filter(pk=business.pk).first()
        fields = driver_fields(business, data, drv)
        if data.get("new_vehicle"):
            fields["default_vehicle"] = quick_vehicle(business, data["new_vehicle"], fields["name"])
        apply_account(business, data, fields, fields["name"], drv)
        if drv is None:
            drv = Driver.all_objects.create(business=business, number=next_driver_number(business), **fields)
        else:
            for k, val in fields.items():
                setattr(drv, k, val)
            drv.save()
    return drv


def ensure_driver_profile(user) -> Driver | None:
    """A transport account always has its driver record (so the driver app works right away)."""
    if user is None or user.business_id is None:
        return None
    existing = Driver.all_objects.filter(user=user).first()
    if existing is not None:
        return existing
    with transaction.atomic():
        type(user.business).objects.select_for_update().filter(pk=user.business_id).first()
        name = (user.get_full_name() or user.username)[:200]
        return Driver.all_objects.create(
            business=user.business, number=next_driver_number(user.business), name=name,
            phone=(user.phone_number or "")[:20], user=user, is_active=user.is_active,
        )
