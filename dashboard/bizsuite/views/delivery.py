"""
حمل و تحویل — API

  /api/delivery/vehicles|carriers|drivers/ (+<id>/)   CRUD
  /api/delivery/drivers/<id>/shift/                    POST
  /api/delivery/trips/ (+<id>/, assign/, status/)
  /api/delivery/stops/<id>/status/                     POST (مدیر/صندوقدار)
  /api/delivery/driver/me|location|stops/<id>/status/  مسیرهای راننده
  /api/delivery/ping/                                  ردیاب GPS (X-Device-Key)
  /api/delivery/map/  settlements/  cash/
  /api/delivery/track/<token>/                         عمومی
"""

import datetime
import secrets
from decimal import Decimal, InvalidOperation

from django.core.cache import cache
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import (
    api_view, authentication_classes, permission_classes,
)
from rest_framework.permissions import AllowAny, BasePermission

from ..delivery_services import (
    assign_trip, change_trip_status, create_trip, public_tracking, record_ping,
    settle_driver_cash, uncollected_cash, update_stop, validate_coords,
)
from ..models import (
    Carrier, CashSettlement, CostCenter, Driver, LocationPing, Trip, TripStop, User, Vehicle,
)
from ..modules import module_enabled
from ..utils import api_error, api_success
from .common import StaffAuth, make_service_permission, server_error, staff_business

DeliveryPerm = make_service_permission("delivery")
PAGE = 30
PING_INTERVAL_SECONDS = 5
FRESH_SECONDS = 15 * 60


class DriverPerm(BasePermission):
    """کاربر واردشده‌ای که ماژول حمل‌وتحویل کسب‌وکارش فعال است (نقش راننده بدون تب)."""
    message = "شما دسترسی به این بخش را ندارید"

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        return module_enabled(getattr(u, "business", None), "delivery")


def _f(v):
    return float(v) if v is not None else None


def _no_business():
    return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")


def _dec(value, name, allow_none=True):
    if value in (None, ""):
        if allow_none:
            return None
        raise ValueError(f"{name} الزامی است.")
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


def _local_dt(v):
    return timezone.localtime(v).isoformat() if v else None


# ═══════════════════════════════════════
#  serializers
# ═══════════════════════════════════════

def _vehicle_data(v):
    return {
        "id": v.id, "name": v.name, "plate": v.plate, "kind": v.kind,
        "kind_display": v.get_kind_display(), "capacity_kg": _f(v.capacity_kg),
        "capacity_m3": _f(v.capacity_m3), "cost_center_id": v.cost_center_id,
        "has_device": bool(v.device_key), "device_key": v.device_key or "",
        "is_active": v.is_active, "last_lat": _f(v.last_lat), "last_lng": _f(v.last_lng),
        "last_seen": _local_dt(v.last_seen),
    }


def _carrier_data(c):
    return {"id": c.id, "name": c.name, "is_external": c.is_external, "phone": c.phone,
            "notes": c.notes, "is_active": c.is_active}


def _driver_data(d):
    return {
        "id": d.id, "name": d.name, "phone": d.phone, "user_id": d.user_id,
        "carrier_id": d.carrier_id, "default_vehicle_id": d.default_vehicle_id,
        "pay_per_trip": _f(d.pay_per_trip), "is_active": d.is_active, "on_shift": d.on_shift,
        "last_lat": _f(d.last_lat), "last_lng": _f(d.last_lng), "last_seen": _local_dt(d.last_seen),
    }


def _stop_data(s):
    return {
        "id": s.id, "trip_id": s.trip_id, "sequence": s.sequence, "reference": s.reference,
        "customer_name": s.customer_name, "phone": s.phone, "address": s.address,
        "lat": _f(s.lat), "lng": _f(s.lng), "weight_kg": _f(s.weight_kg),
        "cargo_description": s.cargo_description,
        "status": s.status, "status_display": s.get_status_display(),
        "amount_due": _f(s.amount_due), "collected_amount": _f(s.collected_amount),
        "collected_method": s.collected_method, "failure_reason": s.failure_reason,
        "eta": _local_dt(s.eta), "arrived_at": _local_dt(s.arrived_at),
        "delivered_at": _local_dt(s.delivered_at), "order_id": s.order_id,
        "tracking_token": s.public_token,
    }


def _trip_data(t, with_stops=False, stops=None):
    if stops is None:
        stops = list(t.stops.all())
    due = sum((s.amount_due for s in stops), Decimal("0"))
    collected = sum((s.collected_amount for s in stops), Decimal("0"))
    data = {
        "id": t.id, "number": t.number, "waybill": t.waybill, "status": t.status,
        "status_display": t.get_status_display(), "notes": t.notes,
        "shipper_name": t.shipper_name, "shipper_phone": t.shipper_phone,
        "cargo_description": t.cargo_description, "cargo_weight_kg": _f(t.cargo_weight_kg),
        "origin_name": t.origin_name, "destination_name": t.destination_name,
        "expected_arrival": _local_dt(t.expected_arrival), "tracking_token": t.public_token,
        "driver_id": t.driver_id, "driver_name": t.driver.name if t.driver_id else "",
        "vehicle_id": t.vehicle_id, "vehicle_name": str(t.vehicle) if t.vehicle_id else "",
        "carrier_id": t.carrier_id, "carrier_name": t.carrier.name if t.carrier_id else "",
        "created_at": _local_dt(t.created_at), "started_at": _local_dt(t.started_at),
        "completed_at": _local_dt(t.completed_at),
        "stops_count": len(stops),
        "stops_done": sum(1 for s in stops if s.status in ("delivered", "failed")),
        "totals": {
            "amount_due": _f(due), "collected": _f(collected), "delivery_fee": _f(t.delivery_fee),
            "driver_pay": _f(t.driver_pay), "carrier_cost": _f(t.carrier_cost),
        },
    }
    if with_stops:
        data["stops"] = [_stop_data(s) for s in stops]
    return data


# ═══════════════════════════════════════
#  CRUD ساده
# ═══════════════════════════════════════

def _validate_vehicle(r, d, v=None):
    name = str(d.get("name", v.name if v else "") or "").strip()
    if not name:
        raise ValueError("نام خودرو الزامی است.")
    kind = d.get("kind", v.kind if v else "motorbike")
    if kind not in dict(Vehicle.Kind.choices):
        raise ValueError("نوع خودرو نامعتبر است.")
    cc = None
    if d.get("cost_center_id"):
        cc = CostCenter.all_objects.filter(business=r, pk=d["cost_center_id"]).first()
        if cc is None:
            raise ValueError("مرکز هزینه پیدا نشد.")
    return {
        "name": name[:100], "plate": str(d.get("plate", v.plate if v else "") or "")[:30],
        "kind": kind,
        "capacity_kg": _dec(d.get("capacity_kg", v.capacity_kg if v else None), "ظرفیت وزنی"),
        "capacity_m3": _dec(d.get("capacity_m3", v.capacity_m3 if v else None), "ظرفیت حجمی"),
        "cost_center": cc if "cost_center_id" in d else (v.cost_center if v else None),
        "is_active": _bool(d.get("is_active"), v.is_active if v else True),
    }


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def vehicles(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    if request.method == "GET":
        qs = Vehicle.all_objects.filter(business=r).order_by("name")
        return api_success(data=[_vehicle_data(v) for v in qs])
    try:
        fields = _validate_vehicle(r, request.data)
        v = Vehicle.all_objects.create(business=r, **fields)
        if request.data.get("generate_device_key"):
            v.device_key = secrets.token_urlsafe(24)
            v.save(update_fields=["device_key"])
    except ValueError as e:
        return api_error(str(e))
    except IntegrityError:
        return api_error("خودرویی با این نام قبلاً ثبت شده است.")
    except Exception as e:
        return server_error(e)
    return api_success(data=_vehicle_data(v), status_code=201)


@api_view(["PUT", "DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def vehicle_detail(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    v = _obj(Vehicle, pk, r)
    if v is None:
        return api_error("خودرو پیدا نشد.", status_code=404)
    if request.method == "DELETE":
        if Trip.all_objects.filter(business=r, vehicle=v).exists():
            return api_error("این خودرو در مأموریت‌ها استفاده شده است؛ غیرفعالش کنید.")
        v.delete()
        return api_success(data={"id": pk})
    try:
        for k, val in _validate_vehicle(r, request.data, v).items():
            setattr(v, k, val)
        if request.data.get("generate_device_key"):
            v.device_key = secrets.token_urlsafe(24)
        elif request.data.get("clear_device_key"):
            v.device_key = None
        v.save()
    except ValueError as e:
        return api_error(str(e))
    except IntegrityError:
        return api_error("خودرویی با این نام قبلاً ثبت شده است.")
    except Exception as e:
        return server_error(e)
    return api_success(data=_vehicle_data(v))


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def carriers(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    if request.method == "GET":
        return api_success(data=[_carrier_data(c) for c in
                                 Carrier.all_objects.filter(business=r).order_by("name")])
    d = request.data
    name = str(d.get("name") or "").strip()
    if not name:
        return api_error("نام حمل‌کننده الزامی است.")
    try:
        c = Carrier.all_objects.create(
            business=r, name=name[:200], is_external=_bool(d.get("is_external"), False),
            phone=str(d.get("phone") or "")[:20], notes=str(d.get("notes") or "")[:300],
            is_active=_bool(d.get("is_active")))
    except IntegrityError:
        return api_error("حمل‌کننده‌ای با این نام قبلاً ثبت شده است.")
    except Exception as e:
        return server_error(e)
    return api_success(data=_carrier_data(c), status_code=201)


@api_view(["PUT", "DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def carrier_detail(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    c = _obj(Carrier, pk, r)
    if c is None:
        return api_error("حمل‌کننده پیدا نشد.", status_code=404)
    if request.method == "DELETE":
        if Trip.all_objects.filter(business=r, carrier=c).exists():
            return api_error("این حمل‌کننده در مأموریت‌ها استفاده شده است؛ غیرفعالش کنید.")
        c.delete()
        return api_success(data={"id": pk})
    d = request.data
    name = str(d.get("name", c.name) or "").strip()
    if not name:
        return api_error("نام حمل‌کننده الزامی است.")
    try:
        c.name = name[:200]
        c.is_external = _bool(d.get("is_external"), c.is_external)
        c.phone = str(d.get("phone", c.phone) or "")[:20]
        c.notes = str(d.get("notes", c.notes) or "")[:300]
        c.is_active = _bool(d.get("is_active"), c.is_active)
        c.save()
    except IntegrityError:
        return api_error("حمل‌کننده‌ای با این نام قبلاً ثبت شده است.")
    except Exception as e:
        return server_error(e)
    return api_success(data=_carrier_data(c))


def _driver_fields(r, d, drv=None):
    name = str(d.get("name", drv.name if drv else "") or "").strip()
    if not name:
        raise ValueError("نام راننده الزامی است.")
    out = {
        "name": name[:200], "phone": str(d.get("phone", drv.phone if drv else "") or "")[:20],
        "pay_per_trip": _dec(d.get("pay_per_trip", drv.pay_per_trip if drv else 0), "کارمزد") or Decimal("0"),
        "is_active": _bool(d.get("is_active"), drv.is_active if drv else True),
    }
    if "carrier_id" in d or drv is None:
        out["carrier"] = _obj(Carrier, d.get("carrier_id"), r)
        if d.get("carrier_id") and out["carrier"] is None:
            raise ValueError("حمل‌کننده پیدا نشد.")
    if "default_vehicle_id" in d or drv is None:
        out["default_vehicle"] = _obj(Vehicle, d.get("default_vehicle_id"), r)
        if d.get("default_vehicle_id") and out["default_vehicle"] is None:
            raise ValueError("خودرو پیدا نشد.")
    if "user_id" in d or drv is None:
        uid = d.get("user_id")
        if uid in (None, ""):
            out["user"] = None
        else:
            u = User.objects.filter(pk=uid, business=r).first() if str(uid).isdigit() else None
            if u is None or u.role not in ("driver", "owner", "manager"):
                raise ValueError("کاربر انتخابی معتبر نیست.")
            if Driver.all_objects.filter(user=u).exclude(pk=drv.pk if drv else None).exists():
                raise ValueError("این کاربر قبلاً به راننده دیگری متصل است.")
            out["user"] = u
    return out


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def drivers(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    if request.method == "GET":
        qs = Driver.all_objects.filter(business=r).order_by("name")
        return api_success(data=[_driver_data(d) for d in qs])
    try:
        drv = Driver.all_objects.create(business=r, **_driver_fields(r, request.data))
    except ValueError as e:
        return api_error(str(e))
    except Exception as e:
        return server_error(e)
    return api_success(data=_driver_data(drv), status_code=201)


@api_view(["PUT", "DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def driver_detail(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    drv = _obj(Driver, pk, r)
    if drv is None:
        return api_error("راننده پیدا نشد.", status_code=404)
    if request.method == "DELETE":
        if Trip.all_objects.filter(business=r, driver=drv).exists():
            return api_error("این راننده در مأموریت‌ها استفاده شده است؛ غیرفعالش کنید.")
        drv.delete()
        return api_success(data={"id": pk})
    try:
        for k, val in _driver_fields(r, request.data, drv).items():
            setattr(drv, k, val)
        drv.save()
    except ValueError as e:
        return api_error(str(e))
    except Exception as e:
        return server_error(e)
    return api_success(data=_driver_data(drv))


def _set_shift(drv, on):
    on = bool(on)
    Driver.all_objects.filter(pk=drv.pk).update(
        on_shift=on, shift_started_at=timezone.now() if on else drv.shift_started_at)
    drv.refresh_from_db()
    return drv


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def driver_shift(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    drv = _obj(Driver, pk, r)
    if drv is None:
        return api_error("راننده پیدا نشد.", status_code=404)
    if "on" not in request.data:
        return api_error("مقدار on الزامی است.")
    return api_success(data=_driver_data(_set_shift(drv, request.data.get("on"))))


# ═══════════════════════════════════════
#  مأموریت‌ها
# ═══════════════════════════════════════

def _parse_dt(v):
    if v in (None, ""):
        return None
    try:
        dt = datetime.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("زمان نامعتبر است.")
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


def _trip_qs(r):
    return (Trip.all_objects.filter(business=r)
            .select_related("driver", "vehicle", "carrier").prefetch_related("stops"))


def _parse_stops(r, raw):
    if not isinstance(raw, list) or not raw:
        raise ValueError("مأموریت باید حداقل یک توقف داشته باشد.")
    out = []
    for s in raw:
        if not isinstance(s, dict):
            raise ValueError("توقف نامعتبر است.")
        item = {k: s.get(k) for k in ("customer_name", "phone", "address", "lat", "lng",
                                      "reference", "amount_due", "weight_kg", "cargo_description")}
        item["amount_due"] = _dec(s.get("amount_due"), "مبلغ قابل وصول") or Decimal("0")
        if s.get("order_id"):
            from ..models import Order
            order = Order.all_objects.filter(business=r, pk=s["order_id"]).first()
            if order is None:
                raise ValueError("سفارش پیدا نشد.")
            if TripStop.all_objects.filter(business=r, order=order).exists():
                raise ValueError(f"سفارش #{order.pk} قبلاً در یک مأموریت قرار گرفته است.")
            item["order"] = order
            # پرداخت در محل: مبلغ سفارش پرداخت‌نشده خودکار قابل وصول می‌شود
            if order.payment_status != "paid" and not item.get("amount_due"):
                item["amount_due"] = order.total_price
            item["customer_name"] = item.get("customer_name") or order.customer_name
            item["phone"] = item.get("phone") or order.phone
            item["address"] = item.get("address") or order.delivery_address
        out.append(item)
    return out


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def trips(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    if request.method == "GET":
        qs = _trip_qs(r)
        st = request.query_params.get("status")
        if st:
            qs = qs.filter(status=st)
        did = request.query_params.get("driver_id")
        if did and str(did).isdigit():
            qs = qs.filter(driver_id=int(did))
        date = request.query_params.get("date")
        if date:
            try:
                day = datetime.date.fromisoformat(date[:10])
            except ValueError:
                return api_error("تاریخ نامعتبر است.")
            qs = qs.filter(created_at__date=day)
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1
        total = qs.count()
        items = qs.order_by("-created_at")[(page - 1) * PAGE: page * PAGE]
        return api_success(data={"total": total, "page": page, "page_size": PAGE,
                                 "results": [_trip_data(t) for t in items]})
    d = request.data
    try:
        stops = _parse_stops(r, d.get("stops"))
        driver = _obj(Driver, d.get("driver_id"), r)
        vehicle = _obj(Vehicle, d.get("vehicle_id"), r)
        carrier = _obj(Carrier, d.get("carrier_id"), r)
        for given, obj, label in ((d.get("driver_id"), driver, "راننده"),
                                  (d.get("vehicle_id"), vehicle, "خودرو"),
                                  (d.get("carrier_id"), carrier, "حمل‌کننده")):
            if given and obj is None:
                raise ValueError(f"{label} پیدا نشد.")
        fields = {
            "delivery_fee": _dec(d.get("delivery_fee"), "هزینه‌ی حمل") or Decimal("0"),
            "carrier_cost": _dec(d.get("carrier_cost"), "هزینه‌ی حمل‌کننده") or Decimal("0"),
            "waybill": str(d.get("waybill") or "")[:50],
            "notes": str(d.get("notes") or "")[:500],
            "shipper_name": str(d.get("shipper_name") or "")[:200],
            "shipper_phone": str(d.get("shipper_phone") or "")[:20],
            "cargo_description": str(d.get("cargo_description") or "")[:500],
            "cargo_weight_kg": _dec(d.get("cargo_weight_kg"), "وزن بار"),
            "origin_name": str(d.get("origin_name") or "")[:200],
            "destination_name": str(d.get("destination_name") or "")[:200],
            "expected_arrival": _parse_dt(d.get("expected_arrival")),
        }
        trip = create_trip(r, stops, driver=driver, vehicle=vehicle, carrier=carrier,
                           user=request.user, **fields)
    except ValueError as e:
        return api_error(str(e))
    except Exception as e:
        return server_error(e)
    return api_success(data=_trip_data(_trip_qs(r).get(pk=trip.pk), with_stops=True), status_code=201)


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def pending_orders(request):
    """سفارش‌های پیک صندوق که هنوز در هیچ مأموریتی نیستند (صف ارسال)."""
    from ..models import Order
    r = staff_business(request)
    if r is None:
        return _no_business()
    since = timezone.now() - datetime.timedelta(days=3)
    dispatched = TripStop.all_objects.filter(business=r, order__isnull=False).values("order_id")
    qs = (Order.all_objects.filter(business=r, order_type="delivery", created_at__gte=since)
          .exclude(status__in=["cancelled", "rejected", "delivered"])
          .exclude(pk__in=dispatched).order_by("created_at")[:100])
    return api_success(data=[{
        "id": o.id, "customer_name": o.customer_name, "phone": o.phone,
        "address": o.delivery_address, "total": _f(o.total_price),
        "cod": o.payment_status != "paid", "created_at": _local_dt(o.created_at),
        "note": o.customer_note,
    } for o in qs])


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def trip_detail(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    t = _trip_qs(r).filter(pk=pk).first()
    if t is None:
        return api_error("مأموریت پیدا نشد.", status_code=404)
    return api_success(data=_trip_data(t, with_stops=True))


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def trip_assign(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    t = _trip_qs(r).filter(pk=pk).first()
    if t is None:
        return api_error("مأموریت پیدا نشد.", status_code=404)
    driver = _obj(Driver, request.data.get("driver_id"), r)
    if driver is None:
        return api_error("راننده پیدا نشد.")
    vehicle = _obj(Vehicle, request.data.get("vehicle_id"), r)
    if request.data.get("vehicle_id") and vehicle is None:
        return api_error("خودرو پیدا نشد.")
    try:
        assign_trip(t, driver, vehicle)
    except ValueError as e:
        return api_error(str(e))
    except Exception as e:
        return server_error(e)
    return api_success(data=_trip_data(_trip_qs(r).get(pk=pk), with_stops=True))


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def trip_status(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    t = _trip_qs(r).filter(pk=pk).first()
    if t is None:
        return api_error("مأموریت پیدا نشد.", status_code=404)
    new = request.data.get("status")
    if new not in dict(Trip.Status.choices):
        return api_error("وضعیت نامعتبر است.")
    try:
        change_trip_status(t, new, user=request.user)
    except ValueError as e:
        return api_error(str(e))
    except Exception as e:
        return server_error(e)
    return api_success(data=_trip_data(_trip_qs(r).get(pk=pk), with_stops=True))


# ═══════════════════════════════════════
#  توقف‌ها
# ═══════════════════════════════════════

def _apply_stop_update(stop, d, driver=None):
    new = d.get("status")
    if new not in dict(TripStop.Status.choices):
        raise ValueError("وضعیت نامعتبر است.")
    lat, lng = d.get("lat"), d.get("lng")
    if lat in (None, "") or lng in (None, ""):
        lat = lng = None
    else:
        lat, lng = validate_coords(lat, lng)
    amount = d.get("collected_amount")
    if amount in (None, ""):
        amount = None
    else:
        amount = _dec(amount, "مبلغ وصول‌شده")
    return update_stop(
        stop, new, driver=driver, collected_amount=amount,
        collected_method=str(d.get("collected_method") or "")[:20],
        failure_reason=str(d.get("failure_reason") or ""), lat=lat, lng=lng)


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def stop_status(request, pk):
    r = staff_business(request)
    if r is None:
        return _no_business()
    s = TripStop.all_objects.filter(business=r, pk=pk).first()
    if s is None:
        return api_error("توقف پیدا نشد.", status_code=404)
    try:
        s = _apply_stop_update(s, request.data)
    except ValueError as e:
        return api_error(str(e))
    except Exception as e:
        return server_error(e)
    return api_success(data=_stop_data(s))


# ═══════════════════════════════════════
#  راننده
# ═══════════════════════════════════════

def _my_driver(request):
    u = request.user
    return Driver.all_objects.filter(user=u, business=getattr(u, "business", None), is_active=True).first()


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([DriverPerm])
def driver_me(request):
    drv = _my_driver(request)
    if drv is None:
        return api_error("برای این کاربر پروفایل راننده تعریف نشده است.", status_code=404)
    today = timezone.localdate()
    qs = (Trip.all_objects.filter(driver=drv)
          .filter(Q(status__in=["assigned", "in_progress"]) | Q(created_at__date=today))
          .select_related("driver", "vehicle", "carrier").prefetch_related("stops")
          .order_by("-created_at"))
    return api_success(data={
        "driver": _driver_data(drv),
        "business": drv.business.name,
        "on_shift": drv.on_shift,
        "trips": [_trip_data(t, with_stops=True) for t in qs],
        "uncollected_cash": _f(uncollected_cash(drv)),
    })


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([DriverPerm])
def driver_shift_me(request):
    drv = _my_driver(request)
    if drv is None:
        return api_error("برای این کاربر پروفایل راننده تعریف نشده است.", status_code=404)
    if "on" not in request.data:
        return api_error("مقدار on الزامی است.")
    return api_success(data=_driver_data(_set_shift(drv, request.data.get("on"))))


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([DriverPerm])
def driver_stop_status(request, pk):
    drv = _my_driver(request)
    if drv is None:
        return api_error("برای این کاربر پروفایل راننده تعریف نشده است.", status_code=404)
    s = TripStop.all_objects.select_related("trip").filter(pk=pk, business=drv.business).first()
    if s is None or s.trip.driver_id != drv.pk:
        return api_error("توقف پیدا نشد.", status_code=404)
    try:
        s = _apply_stop_update(s, request.data, driver=drv)
    except ValueError as e:
        return api_error(str(e))
    except Exception as e:
        return server_error(e)
    return api_success(data=_stop_data(s))


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([DriverPerm])
def driver_location(request):
    drv = _my_driver(request)
    if drv is None:
        return api_error("برای این کاربر پروفایل راننده تعریف نشده است.", status_code=404)
    key = f"deliv-ping-{drv.pk}"
    if not cache.add(key, 1, PING_INTERVAL_SECONDS):
        return api_error("تعداد ارسال موقعیت بیش از حد مجاز است.", status_code=429)
    d = request.data
    try:
        record_ping(
            driver=drv, lat=d.get("lat"), lng=d.get("lng"), speed_kmh=_dec(d.get("speed_kmh"), "سرعت"),
            heading=_heading(d.get("heading")), accuracy_m=_dec(d.get("accuracy_m"), "دقت"))
    except ValueError as e:
        return api_error(str(e))
    except Exception as e:
        return server_error(e)
    return api_success(data={"ok": True})


def _heading(v):
    if v in (None, ""):
        return None
    try:
        return int(float(v)) % 360
    except (ValueError, TypeError):
        raise ValueError("جهت نامعتبر است.")


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def device_ping(request):
    key = request.headers.get("X-Device-Key", "")
    veh = Vehicle.all_objects.select_related("business").filter(device_key=key, is_active=True).first() if key else None
    if veh is None:
        return api_error("کلید دستگاه نامعتبر است.", status_code=403)
    if not module_enabled(veh.business, "delivery"):
        return api_error("ماژول حمل و تحویل فعال نیست.", status_code=403)
    if not cache.add(f"deliv-dev-{veh.pk}", 1, 2):
        return api_error("تعداد ارسال بیش از حد مجاز است.", status_code=429)
    d = request.data
    when = None
    if d.get("recorded_at"):
        when = parse_datetime(str(d["recorded_at"]))
        if when is None:
            return api_error("زمان نامعتبر است.")
        if timezone.is_naive(when):
            when = timezone.make_aware(when)
    try:
        record_ping(vehicle=veh, lat=d.get("lat"), lng=d.get("lng"), source=LocationPing.Source.DEVICE,
                    speed_kmh=_dec(d.get("speed_kmh"), "سرعت"), heading=_heading(d.get("heading")),
                    recorded_at=when)
    except ValueError as e:
        return api_error(str(e))
    except Exception as e:
        return server_error(e)
    return api_success(data={"ok": True})


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def live_map(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    cutoff = timezone.now() - datetime.timedelta(seconds=FRESH_SECONDS)
    active = Trip.all_objects.filter(business=r, status__in=["assigned", "in_progress"])
    trip_by_driver, trip_by_vehicle = {}, {}
    for t in active.select_related("driver", "vehicle").order_by("created_at"):
        left = TripStop.all_objects.filter(trip=t).exclude(status__in=["delivered", "failed"]).count()
        info = {"trip_id": t.id, "trip_number": t.number, "stops_remaining": left}
        if t.driver_id:
            trip_by_driver[t.driver_id] = info
        if t.vehicle_id:
            trip_by_vehicle[t.vehicle_id] = info
    points = []
    for d in Driver.all_objects.filter(business=r, is_active=True, last_lat__isnull=False,
                                       last_seen__gte=cutoff):
        info = trip_by_driver.get(d.pk, {})
        points.append({"type": "driver", "id": d.id, "name": d.name, "lat": _f(d.last_lat),
                       "lng": _f(d.last_lng), "last_seen": _local_dt(d.last_seen),
                       "driver_name": d.name, "on_shift": d.on_shift,
                       "trip_number": info.get("trip_number"), "stops_remaining": info.get("stops_remaining")})
    for v in Vehicle.all_objects.filter(business=r, is_active=True, last_lat__isnull=False,
                                        last_seen__gte=cutoff):
        info = trip_by_vehicle.get(v.pk, {})
        points.append({"type": "vehicle", "id": v.id, "name": str(v), "lat": _f(v.last_lat),
                       "lng": _f(v.last_lng), "last_seen": _local_dt(v.last_seen),
                       "driver_name": "", "on_shift": None,
                       "trip_number": info.get("trip_number"), "stops_remaining": info.get("stops_remaining")})
    return api_success(data={"points": points})


# ═══════════════════════════════════════
#  تسویه‌ی نقدی
# ═══════════════════════════════════════

def _settlement_data(s):
    return {
        "id": s.id, "driver_id": s.driver_id, "driver_name": s.driver.name,
        "expected_amount": _f(s.expected_amount), "received_amount": _f(s.received_amount),
        "difference": _f(s.difference), "deposit_account": s.deposit_account, "note": s.note,
        "settled_at": _local_dt(s.settled_at),
    }


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def settlements(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    if request.method == "GET":
        qs = CashSettlement.all_objects.filter(business=r).select_related("driver")
        did = request.query_params.get("driver_id")
        if did and str(did).isdigit():
            qs = qs.filter(driver_id=int(did))
        return api_success(data=[_settlement_data(s) for s in qs.order_by("-settled_at")[:200]])
    d = request.data
    drv = _obj(Driver, d.get("driver_id"), r)
    if drv is None:
        return api_error("راننده پیدا نشد.")
    try:
        received = _dec(d.get("received_amount"), "مبلغ تحویلی", allow_none=False)
        st = settle_driver_cash(drv, received, user=request.user,
                                deposit_account=str(d.get("deposit_account") or "1110"),
                                note=str(d.get("note") or ""))
    except ValueError as e:
        return api_error(str(e))
    except Exception as e:
        return server_error(e)
    st = CashSettlement.all_objects.select_related("driver").get(pk=st.pk)
    return api_success(data=_settlement_data(st), status_code=201)


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([DeliveryPerm])
def cash_overview(request):
    r = staff_business(request)
    if r is None:
        return _no_business()
    rows = []
    for d in Driver.all_objects.filter(business=r).order_by("name"):
        amount = uncollected_cash(d)
        if amount > 0 or d.is_active:
            rows.append({"driver_id": d.id, "driver_name": d.name, "uncollected": _f(amount)})
    return api_success(data=rows)


# ═══════════════════════════════════════
#  عمومی
# ═══════════════════════════════════════

@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_track(request, token):
    """لینک عمومی: توکن توقف (مشتری مقصد) یا توکن مأموریت (صاحب بار)."""
    from ..delivery_services import public_shipment_tracking
    stop = TripStop.all_objects.select_related("business").filter(public_token=token).first()
    if stop is not None:
        biz = stop.business
        fn = public_tracking
    else:
        trip = Trip.all_objects.select_related("business").filter(public_token=token).first()
        if trip is None:
            return api_error("لینک پیگیری معتبر نیست.", status_code=404)
        biz = trip.business
        fn = public_shipment_tracking
    if not module_enabled(biz, "delivery"):
        return api_error("لینک پیگیری معتبر نیست.", status_code=404)
    data = fn(token)
    if data is None:
        return api_error("لینک پیگیری معتبر نیست.", status_code=404)
    return api_success(data=data)
