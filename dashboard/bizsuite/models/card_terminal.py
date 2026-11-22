"""Business models: card terminal (کارتخوان) settings and payment attempts."""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q

from ..tenancy import TenantModel


class CardTerminalSettings(TenantModel):
    """Per-business card terminal setup; one row per business (absent row = not configured)."""

    class Mode(models.TextChoices):
        SERVER = "server", "از سرور (سرور به پل/دستگاه وصل است)"
        LOCAL_BRIDGE = "local_bridge", "پل محلی روی کامپیوتر صندوق"

    class Unit(models.TextChoices):
        TOMAN = "toman", "تومان"
        RIAL = "rial", "ریال (تومان × ۱۰)"

    enabled = models.BooleanField("کارتخوان فعال", default=False)
    mode = models.CharField("حالت اتصال", max_length=16, choices=Mode.choices, default=Mode.LOCAL_BRIDGE)
    adapter = models.CharField("نوع پل", max_length=30, default="http_bridge")
    host = models.CharField("آدرس دستگاه/پل", max_length=255, default="127.0.0.1")
    port = models.PositiveIntegerField("پورت", default=8080)
    timeout_seconds = models.PositiveSmallIntegerField("مهلت انتظار برای کشیدن کارت (ثانیه)", default=90)
    amount_unit = models.CharField("واحد مبلغ ارسالی به دستگاه", max_length=8, choices=Unit.choices,
                                   default=Unit.RIAL)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "تنظیمات کارتخوان"
        constraints = [models.UniqueConstraint(fields=["business"], name="uniq_card_terminal_settings_business")]

    def __str__(self):
        return f"کارتخوان {self.business_id}"


class CardPaymentAttempt(TenantModel):
    """One try to charge an order on the terminal. Only ONE may be open per order (DB-enforced)."""

    class Status(models.TextChoices):
        CREATED = "created", "ایجاد شد"
        SENT = "sent", "مبلغ ارسال شد"
        UNKNOWN = "unknown", "نتیجه نامشخص"
        APPROVED = "approved", "تأیید شد"
        DECLINED = "declined", "رد شد"
        CANCELLED = "cancelled", "لغو شد"
        TIMEOUT = "timeout", "پایان مهلت دستگاه"
        UNREACHABLE = "unreachable", "دستگاه در دسترس نیست"
        FAILED = "failed", "پل درخواست را نپذیرفت"

    OPEN = (Status.CREATED, Status.SENT, Status.UNKNOWN)

    order = models.ForeignKey("Order", on_delete=models.CASCADE, related_name="card_attempts")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="+")
    mode = models.CharField(max_length=16, default="server")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.CREATED, db_index=True)
    amount = models.DecimalField("مبلغ (تومان)", max_digits=14, decimal_places=0)
    device_amount = models.BigIntegerField("مبلغ ارسالی به دستگاه")
    amount_unit = models.CharField(max_length=8, default="rial")
    nonce = models.CharField(max_length=32)
    reference = models.CharField("شناسه ارسالی به دستگاه (rrn)", max_length=40, blank=True, default="", db_index=True)
    cancel_requested = models.BooleanField(default=False)
    resolved_manually = models.BooleanField("ثبت دستی توسط صندوقدار", default=False)
    reported_by_browser = models.BooleanField(default=False)
    driver_id = models.PositiveIntegerField(null=True, blank=True)   # courier chosen at checkout (dispatch after payment)
    # only what the bridge result is allowed to leave behind - never a full card number
    trace_number = models.CharField(max_length=32, blank=True, default="")
    ref_number = models.CharField(max_length=32, blank=True, default="")
    card_first6 = models.CharField(max_length=6, blank=True, default="")
    card_last4 = models.CharField(max_length=4, blank=True, default="")
    message = models.CharField(max_length=120, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "تلاش پرداخت با کارتخوان"
        ordering = ["-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["order"], condition=Q(status__in=["created", "sent", "unknown"]),
                name="uniq_open_card_attempt_per_order"),
        ]

    @property
    def is_open(self) -> bool:
        return self.status in self.OPEN
