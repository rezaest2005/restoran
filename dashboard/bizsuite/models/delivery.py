"""
حمل و تحویل — مستقل از صنعت (پیک کسب‌وکار، کامیون کارخانه، ناوگان فروشگاه زنجیره‌ای).

مفاهیم:
  Vehicle  — خودرو/موتور/کامیون با ظرفیت و ردیاب GPS اختیاری
  Carrier  — حمل‌کننده: داخلی (راننده‌های خودمان) یا بیرونی (شرکت حمل)
  Driver   — راننده/پیک (می‌تواند کاربر سیستم باشد تا صفحه‌ی موبایل خودش را ببیند)
  Trip     — مأموریت: یک راننده + یک خودرو + یک یا چند توقف
  TripStop — توقف (مقصد) با آدرس، مختصات، وصول پول در محل و لینک پیگیری مشتری
  LocationPing — موقعیت لحظه‌ای (از موبایل راننده یا ردیاب GPS)
  CashSettlement — تسویه‌ی پول وصول‌شده توسط راننده با صندوق
  DeliveryZone — محدوده‌ی ارسال با هزینه (چندضلعی یا دایره)
  StopEvent — خط زمانی وضعیت هر مقصد
"""

import secrets

from django.conf import settings
from django.db import models
from django.db.models import Q

from ..tenancy import TenantModel


def new_token() -> str:
    """توکن غیرقابل حدس برای لینک پیگیری عمومی / کلید دستگاه."""
    return secrets.token_urlsafe(24)


class Carrier(TenantModel):
    name = models.CharField("نام", max_length=200)
    is_external = models.BooleanField("حمل‌کننده‌ی بیرونی", default=False)
    phone = models.CharField("تلفن", max_length=20, blank=True, default="")
    notes = models.CharField("توضیحات", max_length=300, blank=True, default="")
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "حمل‌کننده"
        verbose_name_plural = "حمل‌کنندگان"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["business", "name"], name="rms_carrier_name_unique"),
        ]

    def __str__(self):
        return self.name


class Vehicle(TenantModel):
    class Kind(models.TextChoices):
        MOTORBIKE = "motorbike", "موتور"
        CAR = "car", "سواری"
        VAN = "van", "وانت"
        TRUCK = "truck", "کامیون"
        OTHER = "other", "سایر"

    name = models.CharField("نام / شناسه", max_length=100)
    plate = models.CharField("پلاک", max_length=30, blank=True, default="")
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices, default=Kind.MOTORBIKE)
    capacity_kg = models.DecimalField("ظرفیت وزنی (کیلوگرم)", max_digits=10, decimal_places=2,
                                      null=True, blank=True)
    capacity_m3 = models.DecimalField("ظرفیت حجمی (مترمکعب)", max_digits=8, decimal_places=2,
                                      null=True, blank=True)
    odometer_km = models.DecimalField("کیلومتر", max_digits=10, decimal_places=1, default=0)
    cost_center = models.ForeignKey(
        "CostCenter", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        verbose_name="مرکز هزینه",
    )
    device_key = models.CharField(
        "کلید ردیاب GPS", max_length=64, unique=True, null=True, blank=True,
        help_text="ردیاب سخت‌افزاری با این کلید موقعیت را به API می‌فرستد.",
    )
    last_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    last_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "خودرو"
        verbose_name_plural = "ناوگان"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["business", "name"], name="rms_vehicle_name_unique"),
        ]

    def __str__(self):
        return f"{self.name} {self.plate}".strip()


class Driver(TenantModel):
    number = models.PositiveIntegerField("شماره‌ی پیک", null=True, blank=True,
                                         help_text="1, 2, 3 ... در هر کسب‌وکار؛ بخشی از آدرس /<slug>/driver/<number>")
    name = models.CharField("نام", max_length=200)
    phone = models.CharField("موبایل", max_length=20, blank=True, default="")
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="driver_profile", verbose_name="حساب کاربری",
    )
    carrier = models.ForeignKey(
        Carrier, on_delete=models.SET_NULL, null=True, blank=True, related_name="drivers",
    )
    default_vehicle = models.ForeignKey(
        Vehicle, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    pay_per_trip = models.DecimalField("کارمزد هر مأموریت", max_digits=14, decimal_places=2, default=0)
    is_active = models.BooleanField("فعال", default=True)
    on_shift = models.BooleanField("در شیفت", default=False)
    shift_started_at = models.DateTimeField(null=True, blank=True)
    last_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    last_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "راننده"
        verbose_name_plural = "رانندگان"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["business", "number"], condition=Q(number__isnull=False),
                                    name="rms_driver_number_unique"),
        ]

    def __str__(self):
        return self.name


class DeliveryZone(TenantModel):
    """
    محدوده‌ی ارسال با هزینه — برای هر صنعتی (پیک رستوران، مرسوله‌ی فروشگاه، بار کارخانه).
    شکل: چندضلعی (polygon = [[lat, lng], ...]) یا دایره (مرکز + شعاع کیلومتر).
    ایده‌ی «رایگان از مبلغ X به بالا» از قواعد قیمت‌گذاری حمل در Odoo گرفته شده (فقط ایده).
    """

    name = models.CharField("نام محدوده", max_length=100)
    color = models.CharField("رنگ", max_length=9, blank=True, default="")
    fee = models.DecimalField("هزینه‌ی ارسال", max_digits=14, decimal_places=2, default=0)
    free_over = models.DecimalField("ارسال رایگان از مبلغ", max_digits=14, decimal_places=2,
                                    null=True, blank=True)
    eta_minutes = models.PositiveIntegerField("زمان وعده‌داده‌شده (دقیقه)", null=True, blank=True)
    polygon = models.JSONField("چندضلعی", default=list, blank=True)
    center_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    center_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    radius_km = models.DecimalField("شعاع (کیلومتر)", max_digits=7, decimal_places=2, null=True, blank=True)
    sort_order = models.PositiveIntegerField("اولویت بررسی", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "محدوده‌ی ارسال"
        verbose_name_plural = "محدوده‌های ارسال"
        ordering = ["sort_order", "name"]
        constraints = [
            models.UniqueConstraint(fields=["business", "name"], name="rms_zone_name_unique"),
            models.CheckConstraint(condition=Q(fee__gte=0), name="rms_zone_fee_gte_0"),
        ]

    def __str__(self):
        return self.name


class Trip(TenantModel):
    class Status(models.TextChoices):
        PLANNED = "planned", "برنامه‌ریزی‌شده"
        ASSIGNED = "assigned", "تخصیص‌یافته"
        IN_PROGRESS = "in_progress", "در مسیر"
        COMPLETED = "completed", "تکمیل‌شده"
        CANCELLED = "cancelled", "لغو شده"

    number = models.PositiveIntegerField("شماره مأموریت")
    waybill = models.CharField("شماره بارنامه", max_length=50, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNED, db_index=True)
    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, null=True, blank=True, related_name="trips")
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, null=True, blank=True, related_name="trips")
    carrier = models.ForeignKey(Carrier, on_delete=models.PROTECT, null=True, blank=True, related_name="trips")
    external_tracking_code = models.CharField("کد رهگیری حمل‌کننده", max_length=100, blank=True, default="")
    # بار و صاحب بار (حمل‌ونقل مستقل: کامیون‌دار بار می‌گیرد، صاحب بار پیگیری می‌کند)
    shipper_name = models.CharField("صاحب بار / فرستنده", max_length=200, blank=True, default="")
    shipper_phone = models.CharField("تلفن صاحب بار", max_length=20, blank=True, default="")
    cargo_description = models.CharField("شرح بار", max_length=500, blank=True, default="")
    cargo_weight_kg = models.DecimalField("وزن کل بار (کیلو)", max_digits=12, decimal_places=2, null=True, blank=True)
    destination_name = models.CharField("مقصد نهایی", max_length=200, blank=True, default="")
    expected_arrival = models.DateTimeField("زمان پیش‌بینی‌شده‌ی رسیدن", null=True, blank=True)
    public_token = models.CharField(max_length=64, unique=True, default=new_token, editable=False)
    origin_name = models.CharField("مبدأ", max_length=200, blank=True, default="")
    origin_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    origin_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    delivery_fee = models.DecimalField("هزینه‌ی حمل از مشتری", max_digits=14, decimal_places=2, default=0)
    driver_pay = models.DecimalField("کارمزد راننده", max_digits=14, decimal_places=2, default=0)
    carrier_cost = models.DecimalField("هزینه‌ی حمل‌کننده‌ی بیرونی", max_digits=14, decimal_places=2, default=0)
    notes = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    assigned_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    accounted = models.BooleanField("در حسابداری ثبت شد", default=False)

    class Meta:
        verbose_name = "مأموریت"
        verbose_name_plural = "مأموریت‌ها"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["business", "number"], name="rms_trip_number_unique"),
            models.CheckConstraint(condition=Q(delivery_fee__gte=0, driver_pay__gte=0, carrier_cost__gte=0),
                                   name="rms_trip_money_gte_0"),
        ]
        indexes = [models.Index(fields=["business", "status", "-created_at"])]

    def __str__(self):
        return f"TR-{self.number}"


class TripStop(TenantModel):
    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار"
        PICKED_UP = "picked_up", "برداشته شد"
        ARRIVED = "arrived", "رسید"
        DELIVERED = "delivered", "تحویل داده شد"
        FAILED = "failed", "تحویل نشد"

    class Priority(models.IntegerChoices):
        NORMAL = 0, "عادی"
        HIGH = 1, "مهم"
        URGENT = 2, "فوری"

    FAILURE_CODES = ("absent", "refused", "address", "closed", "damaged", "no_payment", "other")

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="stops")
    sequence = models.PositiveIntegerField("ترتیب", default=1)
    order = models.ForeignKey("Order", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    # warehouse links: a sales invoice going out to a customer, or a purchase invoice the business's own truck fetches
    sales_invoice = models.ForeignKey("SalesInvoice", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    purchase_invoice = models.ForeignKey("PurchaseInvoice", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    stop_type = models.CharField("نوع توقف", max_length=10, default="delivery", help_text="delivery = تحویل به مشتری، pickup = دریافت بار از تأمین‌کننده")
    reference = models.CharField("مرجع (فاکتور/بار)", max_length=100, blank=True, default="")
    cargo_description = models.CharField("شرح بار این توقف", max_length=300, blank=True, default="")
    customer_name = models.CharField(max_length=200, blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    address = models.CharField(max_length=500, blank=True, default="")
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    amount_due = models.DecimalField("مبلغ قابل وصول در محل", max_digits=14, decimal_places=2, default=0)
    collected_amount = models.DecimalField("مبلغ وصول‌شده", max_digits=14, decimal_places=2, default=0)
    collected_method = models.CharField("روش وصول", max_length=20, blank=True, default="")
    failure_reason = models.CharField(max_length=300, blank=True, default="")
    public_token = models.CharField(max_length=64, unique=True, default=new_token, editable=False)
    eta = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    settlement = models.ForeignKey("CashSettlement", on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="stops")
    # ── مرسوله‌ی عمومی (هر صنعتی) ──
    zone = models.ForeignKey(DeliveryZone, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    fee = models.DecimalField("هزینه‌ی ارسال این مقصد", max_digits=14, decimal_places=2, default=0)
    packages = models.PositiveSmallIntegerField("تعداد بسته", default=1)
    volume_m3 = models.DecimalField("حجم (مترمکعب)", max_digits=8, decimal_places=3, null=True, blank=True)
    priority = models.PositiveSmallIntegerField("اولویت", choices=Priority.choices, default=Priority.NORMAL)
    window_start = models.DateTimeField("بازه‌ی تحویل از", null=True, blank=True)
    window_end = models.DateTimeField("بازه‌ی تحویل تا", null=True, blank=True)
    instructions = models.CharField("توضیحات تحویل", max_length=500, blank=True, default="")
    # ── رسید تحویل (POD) ──
    require_otp = models.BooleanField("کد تحویل لازم است", default=False)
    require_photo = models.BooleanField("عکس تحویل لازم است", default=False)
    require_signature = models.BooleanField("امضای گیرنده لازم است", default=False)
    otp_code = models.CharField("کد تحویل", max_length=8, blank=True, default="")
    pod_photo = models.ImageField("عکس تحویل", upload_to="delivery/pod/%Y/%m/", blank=True)
    pod_signature = models.ImageField("امضای گیرنده", upload_to="delivery/sign/%Y/%m/", blank=True)
    recipient_name = models.CharField("نام تحویل‌گیرنده", max_length=120, blank=True, default="")
    failure_code = models.CharField("علت عدم تحویل (کد)", max_length=20, blank=True, default="")
    attempts = models.PositiveSmallIntegerField("تلاش‌های ناموفق", default=0)

    class Meta:
        verbose_name = "توقف"
        verbose_name_plural = "توقف‌ها"
        ordering = ["trip_id", "sequence", "id"]
        constraints = [
            models.CheckConstraint(condition=Q(amount_due__gte=0, collected_amount__gte=0),
                                   name="rms_tripstop_money_gte_0"),
        ]

    def __str__(self):
        return f"{self.trip_id}#{self.sequence}"


class StopEvent(TenantModel):
    """خط زمانی هر مقصد: هر تغییر وضعیت با زمان، علت، مختصات و انجام‌دهنده."""

    stop = models.ForeignKey(TripStop, on_delete=models.CASCADE, related_name="events")
    status = models.CharField(max_length=20)
    note = models.CharField(max_length=300, blank=True, default="")
    actor = models.CharField(max_length=120, blank=True, default="")
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    at = models.DateTimeField(db_index=True)

    class Meta:
        verbose_name = "رویداد مقصد"
        verbose_name_plural = "رویدادهای مقصد"
        ordering = ["at", "id"]


class LocationPing(TenantModel):
    class Source(models.TextChoices):
        PHONE = "phone", "موبایل راننده"
        DEVICE = "device", "ردیاب GPS"

    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, null=True, blank=True, related_name="pings")
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, null=True, blank=True, related_name="pings")
    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)
    speed_kmh = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    heading = models.PositiveSmallIntegerField(null=True, blank=True)
    accuracy_m = models.DecimalField(max_digits=7, decimal_places=1, null=True, blank=True)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.PHONE)
    recorded_at = models.DateTimeField(db_index=True)

    class Meta:
        verbose_name = "موقعیت"
        verbose_name_plural = "موقعیت‌ها"
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["business", "driver", "-recorded_at"]),
            models.Index(fields=["business", "vehicle", "-recorded_at"]),
        ]


class CashSettlement(TenantModel):
    """تسویه‌ی وجه نقد وصول‌شده توسط راننده با صندوق (معمولاً آخر شیفت)."""

    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name="settlements")
    expected_amount = models.DecimalField("مبلغ مورد انتظار", max_digits=14, decimal_places=2)
    received_amount = models.DecimalField("مبلغ تحویل‌شده", max_digits=14, decimal_places=2)
    difference = models.DecimalField("اختلاف", max_digits=14, decimal_places=2, default=0)
    deposit_account = models.CharField("حساب مقصد (کد)", max_length=20, default="1110")
    note = models.CharField(max_length=300, blank=True, default="")
    settled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="+")
    settled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "تسویه‌ی راننده"
        verbose_name_plural = "تسویه‌های رانندگان"
        ordering = ["-settled_at"]
        constraints = [
            models.CheckConstraint(condition=Q(expected_amount__gte=0, received_amount__gte=0),
                                   name="rms_settlement_money_gte_0"),
        ]
