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
    DRIVER_PAYABLE, RECEIVABLE, SALES, post_entry, q2,
)
from .accounting_posting import _accounting_on
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


def order_is_dispatched(order) -> bool:
    """An order counts as dispatched while it sits on a live stop (a cancelled trip or a failed stop frees it)."""
    return (TripStop.all_objects.filter(order_id=getattr(order, "pk", order))
            .exclude(trip__status=Trip.Status.CANCELLED).exclude(status=TripStop.Status.FAILED).exists())


def _act(business, action, summary, user=None, driver=None, target=None, details=None):
    from .activity import log
    return log(business, "delivery", action, summary, actor=user, driver=driver, target=target, details=details)


def _trip_label(trip):
    return f"TR-{trip.number}"


def _live_stops():
    return TripStop.all_objects.exclude(trip__status=Trip.Status.CANCELLED).exclude(status=TripStop.Status.FAILED)


def sales_invoice_is_dispatched(inv) -> bool:
    return _live_stops().filter(sales_invoice_id=getattr(inv, "pk", inv)).exists()


def purchase_is_dispatched(inv) -> bool:
    return _live_stops().filter(purchase_invoice_id=getattr(inv, "pk", inv)).exists()


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
        if order is not None:
            # two dispatchers clicking the same order at once: the row lock makes the second one wait,
            # then it sees the first one's stop and is refused
            type(order).all_objects.select_for_update().get(pk=order.pk)
            if order_is_dispatched(order):
                raise ValueError(f"سفارش #{order.pk} قبلاً در یک مأموریت قرار گرفته است.")
        sinv, pinv = s.get("sales_invoice"), s.get("purchase_invoice")
        for doc, label, check in ((sinv, "فاکتور فروش", sales_invoice_is_dispatched), (pinv, "فاکتور خرید", purchase_is_dispatched)):
            if doc is not None:
                if doc.business_id != business.pk:
                    raise ValueError(f"{label} متعلق به این کسب‌وکار نیست.")
                type(doc).all_objects.select_for_update().get(pk=doc.pk)     # two dispatchers at once: second one waits
                if check(doc):
                    raise ValueError(f"{label} قبلاً در یک مأموریت قرار گرفته است.")
        weight = s.get("weight_kg")
        if weight not in (None, ""):
            total_weight += Decimal(str(weight))
        TripStop.all_objects.create(
            business=business, trip=trip, sequence=i, order=order, sales_invoice=sinv, purchase_invoice=pinv,
            stop_type="pickup" if pinv is not None or s.get("stop_type") == "pickup" else "delivery",
            reference=str(s.get("reference") or "")[:100],
            cargo_description=str(s.get("cargo_description") or "")[:300],
            customer_name=str(s.get("customer_name") or "")[:200],
            phone=str(s.get("phone") or "")[:20], address=str(s.get("address") or "")[:500],
            lat=lat, lng=lng, amount_due=due,
            weight_kg=Decimal(str(weight)) if weight not in (None, "") else None,
        )
    if vehicle and vehicle.capacity_kg and total_weight > vehicle.capacity_kg:
        raise ValueError(
            f"وزن بار ({total_weight} kg) از ظرفیت خودرو ({vehicle.capacity_kg} kg) بیشتر است."
        )
    _stops = list(TripStop.all_objects.filter(trip=trip).order_by("sequence"))
    _act(business, "trip.created",
         f"مأموریت {_trip_label(trip)} ساخته شد — {len(_stops)} توقف" + (f" — پیک: {driver.name}" if driver else " — بدون پیک"),
         user=user, driver=driver, target=trip,
         details={"stops": [{"n": s.sequence, "type": s.stop_type, "name": s.customer_name, "address": s.address,
                             "cargo": s.cargo_description, "due": str(s.amount_due)} for s in _stops],
                  "vehicle": str(trip.vehicle) if trip.vehicle else "", "carrier": trip.carrier.name if trip.carrier else ""})
    return trip


@transaction.atomic
def assign_trip(trip, driver, vehicle=None, user=None):
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
    _act(trip.business, "trip.assigned", f"مأموریت {_trip_label(trip)} به {driver.name} داده شد"
         + (f" با {trip.vehicle}" if trip.vehicle else ""), user=user, driver=driver, target=trip)
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
    _done = TripStop.all_objects.filter(trip=trip, status=TripStop.Status.DELIVERED).count()
    _cash = sum((s.collected_amount for s in TripStop.all_objects.filter(trip=trip, status=TripStop.Status.DELIVERED)), Decimal("0"))
    _act(trip.business, f"trip.{new_status}",
         {"in_progress": f"مأموریت {_trip_label(trip)} شروع شد", "completed": f"مأموریت {_trip_label(trip)} تکمیل شد — {_done} تحویل، وصولی {q2(_cash)}",
          "cancelled": f"مأموریت {_trip_label(trip)} لغو شد"}.get(new_status, f"وضعیت {_trip_label(trip)}: {new_status}"),
         user=user, driver=trip.driver, target=trip, details={"delivered": _done, "collected": str(q2(_cash))})
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
    _label = {"picked_up": "برداشت", "arrived": "رسید به", "delivered": "تحویل داد به", "failed": "تحویل نشد به", "pending": "برگشت به انتظار"}
    _who = stop.customer_name or stop.address or f"توقف {stop.sequence}"
    _what = f" — {stop.cargo_description}" if stop.cargo_description else ""
    _money = f" — وصول {q2(stop.collected_amount)} ({stop.collected_method})" if new_status == "delivered" and stop.collected_amount > 0 else ""
    _why = f" — علت: {stop.failure_reason}" if new_status == "failed" and stop.failure_reason else ""
    _act(trip.business, f"stop.{new_status}",
         f"{trip.driver.name if trip.driver else 'پیک'} {_label.get(new_status, new_status)} {_who}{_what}{_money}{_why} ({_trip_label(trip)})",
         user=(driver.user if driver is not None else None), driver=trip.driver, target=stop,
         details={"trip": trip.number, "stop": stop.sequence, "type": stop.stop_type, "address": stop.address, "cargo": stop.cargo_description,
                  "collected": str(q2(stop.collected_amount)), "method": stop.collected_method, "reason": stop.failure_reason,
                  "lat": float(lat) if lat is not None else None, "lng": float(lng) if lng is not None else None})
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
    if len(lines) >= 2 and _accounting_on(business=driver.business):
        post_entry(driver.business, lines, source_type="driver_settlement", source_id=st.pk,
                   description=f"تسویه‌ی نقدی راننده {driver.name}", user=user)
    _act(driver.business, "cash.settled", f"تسویه‌ی نقدی با {driver.name}: انتظار {expected}، دریافت {received}"
         + (f"، اختلاف {diff}" if diff else ""), user=user, driver=driver, target=st,
         details={"expected": str(expected), "received": str(received), "difference": str(diff), "note": note})
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
    if not _accounting_on(business=trip.business):
        return None  # accounting module off: delivery works without posting
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
    # money collected for a warehouse sales invoice: the invoice already booked the sale (as a receivable),
    # so the collection clears that receivable; everything else is a sale made at the door
    invoice_part = sum((s.collected_amount for s in TripStop.all_objects.filter(
        trip=trip, status=TripStop.Status.DELIVERED, sales_invoice__isnull=False) if s.collected_amount > 0), Decimal("0"))
    fee = q2(trip.delivery_fee)
    revenue_items = collected_cash + collected_other
    if revenue_items > 0:
        # وصول در محل: فروش (مبلغ منهای هزینه‌ی حمل) و درآمد حمل
        door_sales = revenue_items - min(invoice_part, revenue_items)
        fee_part = min(fee, door_sales)
        sale_part = door_sales - fee_part
        if collected_cash > 0:
            lines.append({"account": DRIVER_CASH, "debit": q2(collected_cash), "memo": f"مأموریت {trip.number}"})
        if collected_other > 0:
            lines.append({"account": BANK, "debit": q2(collected_other), "memo": f"مأموریت {trip.number}"})
        if invoice_part > 0:
            lines.append({"account": RECEIVABLE, "credit": q2(min(invoice_part, revenue_items)), "memo": f"وصول فاکتور — مأموریت {trip.number}"})
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
        "kind": "stop",
        "business": stop.business.name,
        "cargo_description": stop.cargo_description or trip.cargo_description,
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


def public_shipment_tracking(token):
    """پیگیری کل بار برای صاحب بار (لینک سطح مأموریت): بار، مسیر، خودرو، موقعیت و وضعیت هر مقصد."""
    trip = Trip.all_objects.select_related("driver", "vehicle", "business").filter(public_token=token).first()
    if trip is None:
        return None
    stops = list(TripStop.all_objects.filter(trip_id=trip.pk).order_by("sequence", "id"))
    pos = None
    if trip.status in (Trip.Status.IN_PROGRESS, Trip.Status.ASSIGNED):
        p = last_position(trip)
        if p:
            pos = {"lat": p[0], "lng": p[1]}
    driver = trip.driver
    return {
        "kind": "shipment",
        "business": trip.business.name,
        "number": trip.number,
        "waybill": trip.waybill,
        "status": trip.status,
        "status_display": trip.get_status_display(),
        "shipper_name": trip.shipper_name,
        "cargo_description": trip.cargo_description,
        "cargo_weight_kg": float(trip.cargo_weight_kg) if trip.cargo_weight_kg is not None else None,
        "origin_name": trip.origin_name,
        "destination_name": trip.destination_name,
        "expected_arrival": trip.expected_arrival.isoformat() if trip.expected_arrival else None,
        "started_at": trip.started_at.isoformat() if trip.started_at else None,
        "completed_at": trip.completed_at.isoformat() if trip.completed_at else None,
        "driver": {"name": driver.name.split(" ")[0] if driver else "", "phone": driver.phone if driver else ""},
        "vehicle": str(trip.vehicle) if trip.vehicle else "",
        "position": pos,
        "stops": [{
            "sequence": s.sequence, "name": s.customer_name, "address": s.address,
            "cargo_description": s.cargo_description, "status": s.status,
            "status_display": s.get_status_display(),
            "eta": s.eta.isoformat() if s.eta else None,
            "delivered_at": s.delivered_at.isoformat() if s.delivered_at else None,
            "lat": float(s.lat) if s.lat is not None else None,
            "lng": float(s.lng) if s.lng is not None else None,
            "failure_reason": s.failure_reason if s.status == TripStop.Status.FAILED else "",
        } for s in stops],
    }
