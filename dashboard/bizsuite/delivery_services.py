"""
حمل و تحویل — منطق کسب‌وکار.

قواعد مهم:
  - تغییر وضعیت فقط در مسیرهای مجاز انجام می‌شود (ماشین حالت).
  - وصول پول در محل فقط توسط راننده‌ی همان مأموریت و روی توقف خودش ثبت می‌شود.
  - هر ریال وصول‌شده تا تسویه در حساب «وجه نزد رانندگان» (1150) می‌ماند.
  - ثبت حسابداری idempotent است و خطای حسابداری مأموریت را خراب نمی‌کند.
"""

import logging
from datetime import timedelta
import math
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone

from .accounting_services import (
    BANK, CARRIER_PAYABLE, CASH, CASH_DIFF, DELIVERY_COST, DELIVERY_REVENUE, DRIVER_CASH,
    DRIVER_PAYABLE, SALES, post_entry, q2,
)
from .models import (
    CashSettlement, Driver, LocationPing, Business, Trip, TripStop, Vehicle,
)

logger = logging.getLogger(__name__)

AVG_SPEED_KMH = Decimal("25")      # برای تخمین ساده‌ی ETA تا زمان اتصال سرویس مسیریابی
MAX_PING_AGE_SECONDS = 60 * 60 * 6
EARTH_RADIUS_KM = 6371.0088

TRIP_FLOW = {
    Trip.Status.PLANNED: {Trip.Status.ASSIGNED, Trip.Status.IN_PROGRESS, Trip.Status.CANCELLED},
    Trip.Status.ASSIGNED: {Trip.Status.IN_PROGRESS, Trip.Status.PLANNED, Trip.Status.CANCELLED},
    Trip.Status.IN_PROGRESS: {Trip.Status.COMPLETED, Trip.Status.CANCELLED},
    Trip.Status.COMPLETED: set(),
    Trip.Status.CANCELLED: set(),
}
STOP_FLOW = {
    TripStop.Status.PENDING: {TripStop.Status.PICKED_UP, TripStop.Status.ARRIVED,
                              TripStop.Status.DELIVERED, TripStop.Status.FAILED},
    TripStop.Status.PICKED_UP: {TripStop.Status.ARRIVED, TripStop.Status.DELIVERED, TripStop.Status.FAILED},
    TripStop.Status.ARRIVED: {TripStop.Status.DELIVERED, TripStop.Status.FAILED},
    TripStop.Status.DELIVERED: set(),
    TripStop.Status.FAILED: {TripStop.Status.PENDING},   # تلاش دوباره
}


# ═══════════════════════════════════════
#  جغرافیا
# ═══════════════════════════════════════

def haversine_km(lat1, lng1, lat2, lng2) -> float:
    p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = p2 - p1
    dl = math.radians(float(lng2) - float(lng1))
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def validate_coords(lat, lng):
    try:
        lat_d, lng_d = Decimal(str(lat)), Decimal(str(lng))
    except Exception:
        raise ValueError("مختصات نامعتبر است.")
    if not (Decimal("-90") <= lat_d <= Decimal("90") and Decimal("-180") <= lng_d <= Decimal("180")):
        raise ValueError("مختصات خارج از محدوده است.")
    return lat_d.quantize(Decimal("0.000001")), lng_d.quantize(Decimal("0.000001"))


def estimate_eta(from_lat, from_lng, stop, now=None):
    """تخمین ساده: فاصله‌ی مستقیم ÷ سرعت میانگین (با ضریب مسیر ۱٫۳). None اگر مختصات نباشد."""
    if from_lat is None or from_lng is None or stop.lat is None or stop.lng is None:
        return None
    km = haversine_km(from_lat, from_lng, stop.lat, stop.lng) * 1.3
    minutes = max(1, int(round(km / float(AVG_SPEED_KMH) * 60)))
    return (now or timezone.now()) + timedelta(minutes=minutes)


# ═══════════════════════════════════════
#  مأموریت
# ═══════════════════════════════════════

def _next_trip_number(business) -> int:
    Business.objects.select_for_update().get(pk=business.pk)
    last = Trip.all_objects.filter(business=business).aggregate(m=Max("number"))["m"]
    return (last or 0) + 1


@transaction.atomic
def create_trip(business, stops, driver=None, vehicle=None, carrier=None, user=None, **fields):
    """
    ساخت مأموریت با یک یا چند توقف.
    stops: [{"customer_name","phone","address","lat","lng","order","reference","amount_due","weight_kg"}]
    """
    if not stops:
        raise ValueError("مأموریت باید حداقل یک توقف داشته باشد.")
    if len(stops) > 100:
        raise ValueError("تعداد توقف‌ها زیاد است.")
    for obj, label in ((driver, "راننده"), (vehicle, "خودرو"), (carrier, "حمل‌کننده")):
        if obj is not None and obj.business_id != business.pk:
            raise ValueError(f"{label} متعلق به این کسب‌وکار نیست.")
    trip = Trip.all_objects.create(
        business=business, number=_next_trip_number(business), driver=driver,
        vehicle=vehicle or (driver.default_vehicle if driver else None), carrier=carrier,
        created_by=user, status=Trip.Status.ASSIGNED if driver else Trip.Status.PLANNED,
        assigned_at=timezone.now() if driver else None, **fields,
    )
    if driver and driver.pay_per_trip and not fields.get("driver_pay"):
        trip.driver_pay = driver.pay_per_trip
        trip.save(update_fields=["driver_pay"])
    total_weight = Decimal("0")
    for i, s in enumerate(stops, start=1):
        lat = lng = None
        if s.get("lat") not in (None, "") and s.get("lng") not in (None, ""):
            lat, lng = validate_coords(s["lat"], s["lng"])
        due = q2(s.get("amount_due", 0))
        if due < 0:
            raise ValueError("مبلغ قابل وصول نمی‌تواند منفی باشد.")
        order = s.get("order")
        if order is not None and order.business_id != business.pk:
            raise ValueError("سفارش متعلق به این کسب‌وکار نیست.")
        weight = s.get("weight_kg")
        if weight not in (None, ""):
            total_weight += Decimal(str(weight))
        TripStop.all_objects.create(
            business=business, trip=trip, sequence=i, order=order,
            reference=str(s.get("reference") or "")[:100],
            customer_name=str(s.get("customer_name") or "")[:200],
            phone=str(s.get("phone") or "")[:20], address=str(s.get("address") or "")[:500],
            lat=lat, lng=lng, amount_due=due,
            weight_kg=Decimal(str(weight)) if weight not in (None, "") else None,
        )
    if vehicle and vehicle.capacity_kg and total_weight > vehicle.capacity_kg:
        raise ValueError(
            f"وزن بار ({total_weight} kg) از ظرفیت خودرو ({vehicle.capacity_kg} kg) بیشتر است."
        )
    return trip


@transaction.atomic
def assign_trip(trip, driver, vehicle=None):
    trip = Trip.all_objects.select_for_update().get(pk=trip.pk)
    if trip.status not in (Trip.Status.PLANNED, Trip.Status.ASSIGNED):
        raise ValueError("فقط مأموریت برنامه‌ریزی‌شده یا تخصیص‌یافته قابل تخصیص مجدد است.")
    if driver.business_id != trip.business_id:
        raise ValueError("راننده متعلق به این کسب‌وکار نیست.")
    if not driver.is_active:
        raise ValueError("راننده غیرفعال است.")
    trip.driver = driver
    trip.vehicle = vehicle or trip.vehicle or driver.default_vehicle
    if not trip.driver_pay and driver.pay_per_trip:
        trip.driver_pay = driver.pay_per_trip
    trip.status = Trip.Status.ASSIGNED
    trip.assigned_at = timezone.now()
    trip.save()
    return trip


@transaction.atomic
def change_trip_status(trip, new_status, user=None):
    trip = Trip.all_objects.select_for_update().get(pk=trip.pk)
    if new_status not in TRIP_FLOW.get(trip.status, set()):
        raise ValueError("این تغییر وضعیت مجاز نیست.")
    if new_status == Trip.Status.IN_PROGRESS:
        if trip.driver_id is None:
            raise ValueError("ابتدا راننده را تخصیص دهید.")
        trip.started_at = trip.started_at or timezone.now()
    if new_status == Trip.Status.COMPLETED:
        pending = TripStop.all_objects.filter(trip=trip).exclude(status__in=[TripStop.Status.DELIVERED, TripStop.Status.FAILED]).count()
        if pending:
            raise ValueError("هنوز توقف‌های باز دارید.")
        trip.completed_at = timezone.now()
    trip.status = new_status
    trip.save()
    if new_status == Trip.Status.COMPLETED:
        post_trip_accounting(trip, user=user)
    return trip


# ═══════════════════════════════════════
#  توقف و وصول پول
# ═══════════════════════════════════════

@transaction.atomic
def update_stop(stop, new_status, driver=None, collected_amount=None, collected_method="",
                failure_reason="", lat=None, lng=None):
    """
    تغییر وضعیت توقف. اگر driver داده شود باید همان راننده‌ی مأموریت باشد.
    تحویل با وصول پول: collected_amount را با روش پرداخت بدهید.
    """
    stop = TripStop.all_objects.select_for_update().select_related("trip").get(pk=stop.pk)
    trip = stop.trip
    if driver is not None and trip.driver_id != driver.pk:
        raise ValueError("این توقف متعلق به مأموریت شما نیست.")
    if trip.status not in (Trip.Status.ASSIGNED, Trip.Status.IN_PROGRESS):
        raise ValueError("مأموریت فعال نیست.")
    if new_status not in STOP_FLOW.get(stop.status, set()):
        raise ValueError("این تغییر وضعیت توقف مجاز نیست.")

    # با اولین اقدام راننده، مأموریت شروع می‌شود
    if trip.status == Trip.Status.ASSIGNED:
        trip.status = Trip.Status.IN_PROGRESS
        trip.started_at = timezone.now()
        trip.save(update_fields=["status", "started_at"])

    now = timezone.now()
    if new_status == TripStop.Status.ARRIVED:
        stop.arrived_at = now
    elif new_status == TripStop.Status.DELIVERED:
        amount = q2(collected_amount if collected_amount is not None else 0)
        if amount < 0:
            raise ValueError("مبلغ وصول‌شده نمی‌تواند منفی باشد.")
        if amount > 0 and not collected_method:
            raise ValueError("روش وصول را مشخص کنید.")
        if amount > stop.amount_due * 3 and stop.amount_due > 0:
            raise ValueError("مبلغ وصول‌شده با مبلغ قابل وصول فاصله‌ی زیادی دارد.")
        stop.collected_amount = amount
        stop.collected_method = collected_method if amount > 0 else ""
        stop.delivered_at = now
        stop.arrived_at = stop.arrived_at or now
    elif new_status == TripStop.Status.FAILED:
        if not failure_reason.strip():
            raise ValueError("علت عدم تحویل را بنویسید.")
        stop.failure_reason = failure_reason.strip()[:300]
    elif new_status == TripStop.Status.PENDING:
        stop.failure_reason = ""
    stop.status = new_status
    stop.save()

    if lat is not None and lng is not None and trip.driver_id:
        record_ping(trip.driver, lat, lng, source=LocationPing.Source.PHONE)
    refresh_etas(trip)
    return stop


def refresh_etas(trip):
    """ETA توقف‌های باز را از آخرین موقعیت راننده/خودرو محاسبه می‌کند."""
    pos = last_position(trip)
    if pos is None:
        return
    for s in TripStop.all_objects.filter(trip=trip).exclude(status__in=[TripStop.Status.DELIVERED, TripStop.Status.FAILED]):
        eta = estimate_eta(pos[0], pos[1], s)
        if eta:
            TripStop.all_objects.filter(pk=s.pk).update(eta=eta)


def last_position(trip):
    """آخرین موقعیت معتبر خودرو یا راننده (از دیتابیس تازه؛ نمونه‌های حافظه ممکن است کهنه باشند)."""
    now = timezone.now()
    for model, pk in ((Vehicle, trip.vehicle_id), (Driver, trip.driver_id)):
        if not pk:
            continue
        row = model.all_objects.filter(pk=pk).values("last_lat", "last_lng", "last_seen").first()
        if row and row["last_lat"] is not None and row["last_seen"]:
            if (now - row["last_seen"]).total_seconds() <= MAX_PING_AGE_SECONDS:
                return float(row["last_lat"]), float(row["last_lng"])
    return None


# ═══════════════════════════════════════
#  موقعیت
# ═══════════════════════════════════════

@transaction.atomic
def record_ping(driver=None, lat=None, lng=None, vehicle=None, source=LocationPing.Source.PHONE,
                speed_kmh=None, heading=None, accuracy_m=None, recorded_at=None):
    if driver is None and vehicle is None:
        raise ValueError("راننده یا خودرو لازم است.")
    lat, lng = validate_coords(lat, lng)
    business = (driver or vehicle).business
    when = recorded_at or timezone.now()
    now = timezone.now()
    if when > now + timedelta(minutes=5):
        raise ValueError("زمان موقعیت در آینده است.")
    if when < now - timedelta(hours=24):
        raise ValueError("موقعیت قدیمی است.")
    LocationPing.all_objects.create(
        business=business, driver=driver, vehicle=vehicle, lat=lat, lng=lng,
        speed_kmh=speed_kmh, heading=heading, accuracy_m=accuracy_m, source=source, recorded_at=when,
    )
    for obj in (driver, vehicle):
        if obj is not None:
            type(obj).all_objects.filter(pk=obj.pk).update(last_lat=lat, last_lng=lng, last_seen=when)
    return lat, lng


# ═══════════════════════════════════════
#  شیفت و تسویه‌ی نقدی
# ═══════════════════════════════════════

def uncollected_cash(driver):
    """مجموع پول وصول‌شده‌ی تسویه‌نشده‌ی راننده (فقط روش نقد)."""
    agg = TripStop.all_objects.filter(
        trip__driver=driver, status=TripStop.Status.DELIVERED, settlement__isnull=True,
        collected_method="cash",
    ).aggregate(t=Sum("collected_amount"))
    return agg["t"] or Decimal("0.00")


@transaction.atomic
def settle_driver_cash(driver, received_amount, user=None, deposit_account=CASH, note=""):
    """
    تسویه‌ی نقدی: راننده پول وصول‌شده را به صندوق/بانک تحویل می‌دهد.
    اختلاف (کسری/اضافی) در حساب «اختلاف تسویه» ثبت می‌شود.
    """
    driver = Driver.all_objects.select_for_update().get(pk=driver.pk)
    stops = list(TripStop.all_objects.select_for_update().filter(
        trip__driver=driver, status=TripStop.Status.DELIVERED, settlement__isnull=True,
        collected_method="cash"))
    expected = q2(sum((s.collected_amount for s in stops), Decimal("0")))
    received = q2(received_amount)
    if received < 0:
        raise ValueError("مبلغ تحویلی نمی‌تواند منفی باشد.")
    if expected == 0 and received == 0:
        raise ValueError("مبلغی برای تسویه وجود ندارد.")
    if deposit_account not in (CASH, BANK):
        raise ValueError("حساب مقصد باید صندوق یا بانک باشد.")
    diff = received - expected
    st = CashSettlement.all_objects.create(
        business=driver.business, driver=driver, expected_amount=expected,
        received_amount=received, difference=diff, deposit_account=deposit_account,
        note=note[:300], settled_by=user,
    )
    TripStop.all_objects.filter(pk__in=[s.pk for s in stops]).update(settlement=st)

    lines = []
    if received > 0:
        lines.append({"account": deposit_account, "debit": received, "memo": f"تسویه {driver.name}"})
    if diff < 0:       # کسری
        lines.append({"account": CASH_DIFF, "debit": -diff, "memo": "کسری تسویه"})
    if expected > 0:
        lines.append({"account": DRIVER_CASH, "credit": expected, "memo": driver.name})
    if diff > 0:       # اضافی
        lines.append({"account": CASH_DIFF, "credit": diff, "memo": "اضافی تسویه"})
    if len(lines) >= 2:
        post_entry(driver.business, lines, source_type="driver_settlement", source_id=st.pk,
                   description=f"تسویه‌ی نقدی راننده {driver.name}", user=user)
    return st


# ═══════════════════════════════════════
#  حسابداری مأموریت
# ═══════════════════════════════════════

@transaction.atomic
def post_trip_accounting(trip, user=None):
    """
    ثبت حسابداری مأموریت تکمیل‌شده (یک بار):
      - پول وصول‌شده (نقد) → بدهکار «وجه نزد رانندگان»، غیرنقد → بانک
      - فروش/درآمد حمل: فقط برای سفارش‌هایی که قبلاً درآمدشان ثبت نشده است
      - کارمزد راننده → هزینه‌ی حمل / بدهی به راننده
      - هزینه‌ی حمل‌کننده‌ی بیرونی → هزینه / بدهی به حمل‌کننده
    """
    trip = Trip.all_objects.select_for_update().get(pk=trip.pk)
    if trip.accounted:
        return None
    lines = []
    collected_cash = collected_other = Decimal("0")
    for s in TripStop.all_objects.filter(trip=trip, status=TripStop.Status.DELIVERED):
        if s.collected_amount > 0:
            if s.collected_method == "cash":
                collected_cash += s.collected_amount
            else:
                collected_other += s.collected_amount
    fee = q2(trip.delivery_fee)
    revenue_items = collected_cash + collected_other
    if revenue_items > 0:
        # وصول در محل: فروش (مبلغ منهای هزینه‌ی حمل) و درآمد حمل
        sale_part = revenue_items - min(fee, revenue_items)
        fee_part = min(fee, revenue_items)
        if collected_cash > 0:
            lines.append({"account": DRIVER_CASH, "debit": q2(collected_cash), "memo": f"مأموریت {trip.number}"})
        if collected_other > 0:
            lines.append({"account": BANK, "debit": q2(collected_other), "memo": f"مأموریت {trip.number}"})
        if sale_part > 0:
            lines.append({"account": SALES, "credit": q2(sale_part)})
        if fee_part > 0:
            lines.append({"account": DELIVERY_REVENUE, "credit": q2(fee_part)})
    driver_pay = q2(trip.driver_pay)
    if driver_pay > 0:
        lines.append({"account": DELIVERY_COST, "debit": driver_pay, "memo": f"کارمزد مأموریت {trip.number}"})
        lines.append({"account": DRIVER_PAYABLE, "credit": driver_pay})
    carrier_cost = q2(trip.carrier_cost)
    if carrier_cost > 0:
        lines.append({"account": "5240", "debit": carrier_cost, "memo": f"حمل‌کننده — مأموریت {trip.number}"})
        lines.append({"account": CARRIER_PAYABLE, "credit": carrier_cost})
    if len(lines) < 2:
        Trip.all_objects.filter(pk=trip.pk).update(accounted=True)
        return None
    try:
        entry = post_entry(trip.business, lines, source_type="trip", source_id=trip.pk,
                           description=f"مأموریت {trip.number}", user=user)
    except Exception:
        logger.exception("ثبت حسابداری مأموریت %s ناموفق", trip.pk)
        return None
    Trip.all_objects.filter(pk=trip.pk).update(accounted=True)
    return entry


# ═══════════════════════════════════════
#  نمای عمومی پیگیری (مشتری)
# ═══════════════════════════════════════

def public_tracking(token):
    """داده‌ی امن برای صفحه‌ی پیگیری مشتری؛ فقط اطلاعات لازم، بدون اطلاعات داخلی."""
    stop = TripStop.all_objects.select_related(
        "trip", "trip__driver", "trip__vehicle", "business"
    ).filter(public_token=token).first()
    if stop is None:
        return None
    trip = stop.trip
    pos = None
    if stop.status not in (TripStop.Status.DELIVERED, TripStop.Status.FAILED) and trip.status == Trip.Status.IN_PROGRESS:
        p = last_position(trip)
        if p:
            pos = {"lat": p[0], "lng": p[1]}
    driver = trip.driver
    return {
        "business": stop.business.name,
        "status": stop.status,
        "status_display": stop.get_status_display(),
        "trip_status": trip.status,
        "eta": stop.eta.isoformat() if stop.eta else None,
        "driver": {"name": driver.name.split(" ")[0] if driver else "", "phone": driver.phone if driver else ""},
        "vehicle": str(trip.vehicle) if trip.vehicle else "",
        "position": pos,
        "destination": {"lat": float(stop.lat), "lng": float(stop.lng)} if stop.lat is not None else None,
        "delivered_at": stop.delivered_at.isoformat() if stop.delivered_at else None,
        "failure_reason": stop.failure_reason if stop.status == TripStop.Status.FAILED else "",
        "amount_due": float(stop.amount_due),
    }
