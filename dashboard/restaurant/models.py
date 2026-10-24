"""
Restaurant Management System — Models (Multi-tenant)  ·  v2
"""

from __future__ import annotations

import json
import logging
from decimal import Decimal

import django
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F, Q, Sum
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from .tenancy import TenantModel, invalidate_restaurant_cache

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════
#  ثابت‌ها و ابزارهای مشترک
# ═══════════════════════════════════════════

UNIT_CHOICES = [
    ("kg", "کیلوگرم"),
    ("g", "گرم"),
    ("l", "لیتر"),
    ("ml", "میلی‌لیتر"),
    ("unit", "عدد"),
    ("bunch", "دسته"),
    ("pack", "بسته"),
]

UNIT_MAX_LENGTH = 10


def check_constraint(condition, name):
    """CheckConstraint سازگار با Django قبل و بعد از 5.1 (check → condition)."""
    if django.VERSION >= (5, 1):
        return models.CheckConstraint(condition=condition, name=name)
    return models.CheckConstraint(check=condition, name=name)


class DecimalSafeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        if isinstance(obj, models.Model):
            return obj.pk
        return super().default(obj)


# ═══════════════════════════════════════════
#  فیلدهای مشترک
# ═══════════════════════════════════════════


def unit_field(**kwargs):
    defaults = {
        "max_length": UNIT_MAX_LENGTH,
        "choices": UNIT_CHOICES,
        "verbose_name": "واحد",
    }
    defaults.update(kwargs)
    return models.CharField(**defaults)


def name_field(max_length=200, verbose_name="نام", **kwargs):
    defaults = {
        "max_length": max_length,
        "verbose_name": verbose_name,
        "db_index": True,
    }
    defaults.update(kwargs)
    return models.CharField(**defaults)


def price_field(max_digits=12, decimal_places=0, verbose_name="قیمت (تومان)", **kwargs):
    defaults = {
        "max_digits": max_digits,
        "decimal_places": decimal_places,
        "verbose_name": verbose_name,
    }
    defaults.update(kwargs)
    return models.DecimalField(**defaults)


def qty_field(max_digits=10, decimal_places=0, verbose_name="مقدار", **kwargs):
    defaults = {
        "max_digits": max_digits,
        "decimal_places": decimal_places,
        "verbose_name": verbose_name,
    }
    defaults.update(kwargs)
    return models.DecimalField(**defaults)


def phone_field(max_length=20, verbose_name="تلفن", **kwargs):
    defaults = {"max_length": max_length, "verbose_name": verbose_name, "blank": True}
    defaults.update(kwargs)
    return models.CharField(**defaults)


def description_field(verbose_name="توضیحات", **kwargs):
    defaults = {"verbose_name": verbose_name, "blank": True}
    defaults.update(kwargs)
    return models.TextField(**defaults)


def is_active_field(**kwargs):
    defaults = {"default": True, "verbose_name": "فعال"}
    defaults.update(kwargs)
    return models.BooleanField(**defaults)


def created_at_field(**kwargs):
    defaults = {"auto_now_add": True, "verbose_name": "تاریخ ایجاد"}
    defaults.update(kwargs)
    return models.DateTimeField(**defaults)


def updated_at_field(**kwargs):
    defaults = {"auto_now": True, "verbose_name": "تاریخ بروزرسانی"}
    defaults.update(kwargs)
    return models.DateTimeField(**defaults)


# ═══════════════════════════════════════════
#  دسترسی‌های داشبورد
# ═══════════════════════════════════════════

DASHBOARD_SECTIONS = [
    ("pos", "صندوق فروش"),
    ("pos_report", "گزارش روز"),
    ("pos_settings", "تنظیمات صندوق"),
    ("orders", "سفارشات"),
    ("kitchen", "آشپزخانه"),
    ("recipes", "رسپی‌ها"),
    ("invoices", "فاکتور خرید"),
    ("raw_materials", "مواد اولیه"),
    ("semi_finished", "نیمه‌آماده"),
    ("ready_materials", "مواد آماده"),
    ("usage_log", "لاگ مصرف"),
    ("dictionary", "دیکشنری"),
    ("users", "مدیریت کاربران"),
]
_ALL_SECTIONS = [s[0] for s in DASHBOARD_SECTIONS]


def validate_dashboard_permissions(value):
    if not isinstance(value, list):
        raise ValidationError("دسترسی‌ها باید یک لیست باشد.")
    invalid = [v for v in value if v not in _ALL_SECTIONS]
    if invalid:
        raise ValidationError(
            "بخش‌های نامعتبر: " + ", ".join(str(v) for v in invalid)
        )


# ═══════════════════════════════════════════
#  SHARED MODELS
# ═══════════════════════════════════════════


class Restaurant(models.Model):
    tenant = models.ForeignKey(
        "Tenant",
        on_delete=models.CASCADE,
        related_name="restaurants",
        verbose_name="مستأجر",
        null=True,
        blank=True,
    )
    name = name_field(max_length=200, verbose_name="نام رستوران")
    slug = models.SlugField(
        "شناسه URL",
        max_length=50,
        unique=True,
        help_text="آدرس رستوران — مثلاً: 1، 200، zfc-ali، hamid",
    )
    phone = phone_field(verbose_name="تلفن")
    address = models.TextField("آدرس", blank=True)
    logo = models.ImageField(
        "لوگو", upload_to="restaurants/logos/", blank=True, null=True
    )
    username_prefix = models.CharField(
        "پیشوند نام کاربری",
        max_length=5,
        default="",
        blank=True,
        help_text="حرف اول نام کاربری مالک — برای ساخت نام کاربری کارمندان (مثلاً: z)",
    )
    is_active = is_active_field(verbose_name="فعال")
    created_at = created_at_field(verbose_name="تاریخ ایجاد")

    class Meta:
        verbose_name = "رستوران"
        verbose_name_plural = "رستوران‌ها"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.slug})"


@receiver(post_save, sender=Restaurant)
@receiver(post_delete, sender=Restaurant)
def _invalidate_restaurant_cache(sender, instance, **kwargs):
    invalidate_restaurant_cache(instance.slug)

class User(AbstractUser):
    class Role(models.TextChoices):
        OWNER = "owner", "مالک"
        MANAGER = "manager", "مدیر"
        CASHIER = "cashier", "صندوقدار"
        KITCHEN = "kitchen", "آشپزخانه"
        WAREHOUSE = "warehouse", "انباردار"
        CUSTOMER = "customer", "مشتری"

    phone_number = models.CharField(
        "شماره موبایل", max_length=11, unique=True, blank=True, null=True
    )
    role = models.CharField(
        "نقش", max_length=20, choices=Role.choices, default=Role.CUSTOMER, db_index=True
    )
    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="users",
        verbose_name="رستوران",
        blank=True,
        null=True,
    )
    profile_image = models.ImageField(
        "عکس پروفایل", upload_to="profiles/", blank=True, null=True
    )
    is_verified = models.BooleanField("تأیید شده", default=False)
    is_approved = models.BooleanField("تأیید مدیر", default=False)
    dashboard_permissions = models.JSONField(
        "دسترسی‌های داشبورد",
        default=list,
        blank=True,
        validators=[validate_dashboard_permissions],
        help_text="لیست بخش‌های قابل دسترسی. خالی = پیش‌فرض نقش",
    )
    
    # ★★★ فیلد جدید برای مدیریت نمایش دمو در بار اول لاگین ★★★
        # ★★★ شمارنده لاگین‌های دمو
    demo_logins_remaining = models.PositiveIntegerField(
        "لاگین‌های باقی‌مانده دمو", 
        default=2, 
        help_text="بار اول و دوم دمو نشان داده می‌شود، بار سوم پاک می‌شود."
    )

    created_at = created_at_field(verbose_name="تاریخ ایجاد")
    updated_at = updated_at_field(verbose_name="تاریخ بروزرسانی")

    class Meta:
        verbose_name = "کاربر"
        verbose_name_plural = "کاربران"
        ordering = ["-created_at"]

    def __str__(self):
        name = self.get_full_name() or self.username
        return f"{name} ({self.get_role_display()})"

    def save(self, *args, **kwargs):
        # رشته‌ی خالی با unique=True تداخل می‌سازد؛ به NULL تبدیل می‌شود
        if not self.phone_number:
            self.phone_number = None
        super().save(*args, **kwargs)

    @property
    def is_owner(self):
        return self.role == self.Role.OWNER

    @property
    def is_manager(self):
        return self.role == self.Role.MANAGER

    @property
    def is_cashier(self):
        return self.role == self.Role.CASHIER

    @property
    def is_kitchen(self):
        return self.role == self.Role.KITCHEN

    @property
    def is_warehouse(self):
        return self.role == self.Role.WAREHOUSE

    @property
    def is_customer(self):
        return self.role == self.Role.CUSTOMER

    @property
    def is_staff_role(self):
        return self.role in (
            self.Role.OWNER,
            self.Role.MANAGER,
            self.Role.CASHIER,
            self.Role.KITCHEN,
            self.Role.WAREHOUSE,
        )

    DASHBOARD_SECTIONS = DASHBOARD_SECTIONS

    ROLE_DEFAULT_PERMISSIONS = {
        "owner": list(_ALL_SECTIONS),
        "manager": list(_ALL_SECTIONS),
        "cashier": ["pos", "pos_report", "orders", "dictionary"],
        "kitchen": ["kitchen", "orders", "recipes"],
        "warehouse": [
            "raw_materials",
            "semi_finished",
            "ready_materials",
            "invoices",
            "usage_log",
            "recipes",
        ],
        "customer": [],
    }

    def get_permissions(self):
        """لیست دسترسی‌های واقعی کاربر"""
        if self.is_superuser:
            return list(_ALL_SECTIONS)
        if self.dashboard_permissions:
            return list(self.dashboard_permissions)
        return list(self.ROLE_DEFAULT_PERMISSIONS.get(self.role, []))

    def has_section(self, section):
        """آیا کاربر به این بخش دسترسی دارد؟"""
        return section in self.get_permissions()

    def get_restaurant_prefix(self):
        """پیشوند رستوران — حرف اول نام کاربری مالک"""
        if self.restaurant and self.restaurant.username_prefix:
            return self.restaurant.username_prefix
        return ""
# ═══════════════════════════════════════════
#  TENANT MODELS
# ═══════════════════════════════════════════


# ─── 1. MENU ────────────────────────────


class Category(TenantModel):
    name = name_field(verbose_name="نام دسته‌بندی")
    name_en = models.CharField(
        max_length=200, blank=True, default="", verbose_name="نام انگلیسی"
    )
    image = models.ImageField(upload_to="categories/", blank=True)
    is_active = is_active_field()
    order = models.IntegerField(default=0)

    discount = models.PositiveIntegerField(
        default=0,
        verbose_name="تخفیف دسته‌بندی",
    )
    discount_type = models.CharField(
        max_length=10,
        choices=[("fixed", "مبلغ ثابت"), ("percent", "درصدی")],
        default="fixed",
        verbose_name="نوع تخفیف",
    )

    class Meta:
        ordering = ["order"]
        verbose_name = "دسته‌بندی"
        verbose_name_plural = "دسته‌بندی‌ها"
        unique_together = ["restaurant", "name"]
        constraints = [
            check_constraint(
                Q(discount_type="fixed") | Q(discount__lte=100),
                "rms_category_percent_lte_100",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class Food(TenantModel):
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="foods", db_index=True
    )
    name = name_field(verbose_name="نام غذا")
    name_en = models.CharField(
        max_length=200, blank=True, default="", verbose_name="نام انگلیسی"
    )
    image = models.ImageField(upload_to="foods/", blank=True)
    price = price_field(max_digits=10, verbose_name="قیمت", default=0)
    final_price = price_field(max_digits=10, verbose_name="قیمت نهایی", default=0)
    is_available = is_active_field(verbose_name="موجود")
    stock = models.IntegerField(default=0, verbose_name="موجودی")
    created_at = created_at_field()

    class Meta:
        verbose_name = "غذا"
        verbose_name_plural = "غذاها"
        unique_together = ["restaurant", "name"]
        constraints = [
            check_constraint(Q(price__gte=0), "rms_food_price_gte_0"),
            check_constraint(Q(final_price__gte=0), "rms_food_final_price_gte_0"),
        ]

    def __str__(self) -> str:
        return self.name

    def discounted_price(self) -> int:
        return int(self.final_price) if self.final_price else 0


@receiver(pre_save, sender=Food)
def set_food_final_price(sender, instance, raw=False, **kwargs):
    """اگر قیمت نهایی صفر باشد، از قیمت پایه استفاده شود."""
    if raw:
        return
    if not instance.final_price:
        instance.final_price = instance.price


# ─── 2. TABLES & RESERVATIONS ────────────


class Order(TenantModel):
    STATUS_CHOICES = [
        ("pending", "در انتظار"),
        ("confirmed", "تأیید شده"),
        ("preparing", "در حال آماده‌سازی"),
        ("ready", "آماده"),
        ("delivered", "تحویل داده شده"),
        ("cancelled", "لغو شده"),
    ]

    SOURCE_CHOICES = [
        ("pos", "صندوق"),
        ("online", "آنلاین"),
        ("phone", "تلفنی"),
    ]

    PAYMENT_STATUS_CHOICES = [
        ("pending", "در انتظار پرداخت"),
        ("paid", "پرداخت شده"),
        ("failed", "ناموفق"),
        ("refunded", "بازگشت وجه"),
    ]

    PAYMENT_METHOD_CHOICES = [
        ("cash", "نقدی"),
        ("card", "کارتخوان"),
        ("online", "آنلاین"),
    ]

    customer_name = models.CharField(max_length=200, blank=True, default="")
    customer_name_en = models.CharField(max_length=200, blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True
    )
    total_price = models.DecimalField(max_digits=12, decimal_places=0, default=0)

    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        default="pos",
        db_index=True,
        verbose_name="منبع سفارش",
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default="pending",
        db_index=True,
        verbose_name="وضعیت پرداخت",
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default="cash",
        verbose_name="روش پرداخت",
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_orders",
        verbose_name="تأیید شده توسط",
    )
    confirmed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="زمان تأیید",
    )

    created_at = created_at_field()
    updated_at = updated_at_field()

    class Meta:
        verbose_name = "سفارش"
        verbose_name_plural = "سفارشات"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["restaurant", "-created_at"]),
            models.Index(fields=["restaurant", "status", "-created_at"]),
            models.Index(fields=["restaurant", "source", "status", "-created_at"]),
            models.Index(fields=["restaurant", "payment_status", "-created_at"]),
        ]
        constraints = [
            check_constraint(Q(total_price__gte=0), "rms_order_total_gte_0"),
        ]

    def __str__(self) -> str:
        return f"سفارش #{self.pk or '—'} — {self.customer_name or 'بدون نام'} — {self.get_status_display()}"

    def recalculate_total(self):
        """محاسبه مجدد مجموع سفارش از روی آیتم‌ها."""
        total = _recalculate_order_total(self.pk)
        self.total_price = total
        return total


def _recalculate_order_total(order_id):
    """
    از all_objects استفاده می‌کند تا در سیگنال‌ها/تسک‌ها (بدون tenant فعال)
    هم درست کار کند.
    """
    total = OrderItem.all_objects.filter(order_id=order_id).aggregate(
        t=Sum(
            F("price") * F("quantity"),
            output_field=models.DecimalField(max_digits=14, decimal_places=0),
        )
    )["t"] or Decimal("0")
    Order.all_objects.filter(pk=order_id).update(total_price=total)
    return total


class OrderItem(TenantModel):
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="items", db_index=True
    )
    food = models.ForeignKey(
        Food,
        on_delete=models.SET_NULL,
        related_name="order_items",
        null=True,
        blank=True,
    )
    item_name = models.CharField(
        max_length=200,
        blank=True,
        default="",
        verbose_name="نام آیتم",
    )
    item_name_en = models.CharField(
        max_length=200,
        blank=True,
        default="",
        verbose_name="نام انگلیسی آیتم",
    )
    quantity = models.IntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=0, default=0)

    class Meta:
        verbose_name = "آیتم سفارش"
        verbose_name_plural = "آیتم‌های سفارش"
        indexes = [
            models.Index(fields=["order", "food"]),
            models.Index(fields=["restaurant", "food"]),
        ]
        constraints = [
            check_constraint(Q(quantity__gte=1), "rms_orderitem_qty_gte_1"),
            check_constraint(Q(price__gte=0), "rms_orderitem_price_gte_0"),
        ]

    def __str__(self) -> str:
        return f"{self.display_name} x{self.quantity}"

    @property
    def display_name(self) -> str:
        if self.food_id and self.food:
            return self.food.name
        return self.item_name or "آیتم سفارشی"

    @property
    def display_name_en(self) -> str:
        if self.food_id and self.food and self.food.name_en:
            return self.food.name_en
        return self.item_name_en or self.display_name

    @property
    def line_total(self) -> Decimal:
        p = self.price or Decimal("0")
        return p * self.quantity

    def clean(self):
        if not self.food_id and not self.item_name.strip():
            raise ValidationError(
                {"item_name": "برای آیتم‌های بدون غذا، نام آیتم الزامی است."}
            )


@receiver(pre_save, sender=OrderItem)
def set_order_item_price(sender, instance: OrderItem, raw=False, **kwargs) -> None:
    """قیمت آیتم از غذا پر شود اگر ست نشده باشد؛ هرگز NULL ذخیره نمی‌شود."""
    if raw:
        return
    if instance.price is None:
        instance.price = Decimal("0")
    if instance.food_id and not instance.price:
        instance.price = instance.food.final_price


@receiver(post_save, sender=OrderItem)
def _update_order_total_on_save(sender, instance: OrderItem, created, raw=False, **kwargs):
    if raw or not instance.order_id:
        return
    total = _recalculate_order_total(instance.order_id)
    if OrderItem._meta.get_field("order").is_cached(instance):
        instance.order.total_price = total


@receiver(post_delete, sender=OrderItem)
def _update_order_total_on_delete(sender, instance: OrderItem, **kwargs):
    if instance.order_id:
        _recalculate_order_total(instance.order_id)


# ─── 4. RAW MATERIALS & INVENTORY LOG ────


class RawMaterial(TenantModel):
    UNIT_CHOICES = UNIT_CHOICES

    MATERIAL_TYPE_CHOICES = [
        ("raw", "ماده اولیه"),
        ("packaging", "بسته‌بندی و جعبه"),
    ]

    name = name_field(verbose_name="نام ماده اولیه")
    label = models.CharField(max_length=200, blank=True, verbose_name="برچسب")
    price = price_field(default=0)
    unit = unit_field()
    # ★ FIXED: قبلاً decimal_places=0 بود و ۰٫۵ کیلو گرد می‌شد
    quantity = qty_field(max_digits=12, decimal_places=3, default=0)
    minimum_stock = qty_field(
        max_digits=12, decimal_places=3, default=0,
        verbose_name="حداقل موجودی",
    )
    target_stock = qty_field(
        max_digits=12, decimal_places=3, default=0,
        verbose_name="موجودی هدف",
    )
    material_type = models.CharField(
        max_length=20,
        choices=MATERIAL_TYPE_CHOICES,
        default="raw",
        verbose_name="نوع ماده",
        db_index=True,
    )
    created_at = created_at_field()
    updated_at = updated_at_field()

    @property
    def total_price(self):
        return self.price * self.quantity

    class Meta:
        ordering = ["name"]
        verbose_name = "ماده اولیه"
        verbose_name_plural = "مواد اولیه"
        constraints = [
            check_constraint(Q(quantity__gte=0), "rms_rawmaterial_qty_gte_0"),
            check_constraint(Q(price__gte=0), "rms_rawmaterial_price_gte_0"),
        ]

    def __str__(self) -> str:
        return f"{self.name} - {self.quantity} {self.get_unit_display()}"


class Supplier(TenantModel):
    name = name_field(verbose_name="نام شرکت")
    phone = phone_field()
    address = models.TextField(blank=True, verbose_name="آدرس")
    contact_person = models.CharField(
        max_length=100, blank=True, verbose_name="مسئول فروش"
    )
    description = description_field()
    created_at = created_at_field()

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "تأمین‌کننده"
        verbose_name_plural = "تأمین‌کنندگان"

    def __str__(self) -> str:
        return self.name


class PurchaseInvoice(TenantModel):
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
        verbose_name="تأمین‌کننده",
    )
    supplier_name = name_field(max_length=200, verbose_name="نام تأمین‌کننده")
    invoice_number = models.CharField(
        max_length=50, blank=True, default="", verbose_name="شماره فاکتور"
    )
    date = models.DateField(default=timezone.now, verbose_name="تاریخ")
    description = description_field()
    file = models.FileField(
        upload_to="purchase_invoices/%Y/%m/", blank=True, verbose_name="فایل فاکتور"
    )
    created_at = created_at_field()

    class Meta:
        ordering = ["-date", "-created_at"]
        verbose_name = "فاکتور خرید"
        verbose_name_plural = "فاکتورهای خرید"
        indexes = [
            models.Index(fields=["restaurant", "-date"]),
        ]

    def __str__(self) -> str:
        return f"{self.supplier_name} — {self.date}"

    def save(self, *args, **kwargs):
        if self.supplier_id and self.supplier and not self.supplier_name:
            self.supplier_name = self.supplier.name
        super().save(*args, **kwargs)

    @property
    def total_amount(self):
        result = self.items.aggregate(total=Sum(F("quantity") * F("unit_price")))
        return result["total"] or Decimal("0")

    @property
    def item_count(self) -> int:
        return self.items.count()


class PurchaseInvoiceItem(TenantModel):
    invoice = models.ForeignKey(
        PurchaseInvoice,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="فاکتور",
        db_index=True,
    )
    item_name = models.CharField(max_length=200, verbose_name="نام کالا")
    quantity = qty_field(max_digits=12, decimal_places=3, default=0)
    unit = unit_field()
    unit_price = price_field(default=0)
    category = models.ForeignKey(
        "Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="دسته‌بندی",
    )
    raw_material = models.ForeignKey(
        "RawMaterial",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice_items",
        verbose_name="ماده اولیه انبار",
    )

    class Meta:
        verbose_name = "آیتم فاکتور"
        verbose_name_plural = "آیتم‌های فاکتور"
        constraints = [
            check_constraint(Q(quantity__gte=0), "rms_invoiceitem_qty_gte_0"),
            check_constraint(Q(unit_price__gte=0), "rms_invoiceitem_price_gte_0"),
        ]

    def __str__(self):
        return f"{self.item_name} x{self.quantity}"

    @property
    def line_total(self):
        return self.quantity * self.unit_price


# ─── 7. READY MATERIALS ──────────────────


class InventoryMovement(TenantModel):
    class MovementType(models.TextChoices):
        IN = "in", "ورود"
        OUT = "out", "خروج"
        WASTE = "waste", "ضایعات"
        ADJUSTMENT = "adjustment", "تعدیل"
        PRODUCTION = "production", "تولید"
        ORDER_USAGE = "order_usage", "مصرف سفارش"

    raw_material = models.ForeignKey(
        RawMaterial,
        on_delete=models.PROTECT,
        related_name="movements",
        verbose_name="ماده اولیه",
        db_index=True,
    )
    warehouse = models.ForeignKey(
        "Warehouse",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movements",
        verbose_name="انبار",
        db_index=True,
    )
    movement_type = models.CharField(
        "نوع جابجایی", max_length=20, choices=MovementType.choices
    )
    quantity = models.DecimalField("مقدار", max_digits=12, decimal_places=3)
    previous_stock = models.DecimalField("موجودی قبل", max_digits=12, decimal_places=3)
    new_stock = models.DecimalField("موجودی بعد", max_digits=12, decimal_places=3)

    reference_type = models.CharField("نوع مرجع", max_length=50, blank=True)
    reference_id = models.PositiveIntegerField("شناسه مرجع", blank=True, null=True)
    notes = description_field(verbose_name="یادداشت")
    waste_reason = models.CharField(
        max_length=20,
        choices=[
            ("spolied", "خراب شده"),
            ("expired", "تاریخ گذشته"),
            ("damaged", "آسیب دیده"),
            ("other", "سایر"),
        ],
        blank=True,
        default="",
        verbose_name="دلیل ضایعات",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="ایجاد شده توسط",
    )
    created_at = created_at_field(verbose_name="تاریخ")

    class Meta:
        verbose_name = "جابجایی انبار"
        verbose_name_plural = "جابجایی‌های انبار"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["restaurant", "raw_material", "-created_at"]),
            models.Index(fields=["restaurant", "movement_type", "-created_at"]),
            models.Index(fields=["restaurant", "reference_type", "reference_id"]),
        ]

    def __str__(self):
        return f"{self.get_movement_type_display()} — {self.raw_material.name} — {self.quantity}"


# ─── 10. KITCHEN MANAGEMENT ──────────────


class Tenant(models.Model):
    name = models.CharField(max_length=200, verbose_name="نام رستوران")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,  # ★ FIXED: حذف کاربر دیگر کل مستأجر را پاک نمی‌کند
        related_name="owned_tenants",
        verbose_name="مالک",
    )
    phone = models.CharField(max_length=20, blank=True, default="")
    address = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    def _live_services(self):
        """سرویس‌های فعال و منقضی‌نشده."""
        now = timezone.now()
        today = timezone.localdate()
        return (
            self.services.filter(is_enabled=True)
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .filter(Q(end_date__isnull=True) | Q(end_date__gte=today))
        )

    @property
    def active_services_count(self):
        return self._live_services().count()

    @property
    def monthly_revenue(self):
        return sum(ts.price for ts in self._live_services())


class Warehouse(TenantModel):
    """انبار — هر رستوران یک انبار مرکزی (Mother) دارد."""

    TYPE_CHOICES = [
        ("mother", "انبار مرکزی"),
        ("kitchen", "آشپزخانه"),
        ("cold_storage", "سردخانه"),
        ("freezer", "فریزر"),
        ("vegetables", "انبار سبزیجات"),
        ("branch", "شعبه"),
        ("other", "سایر"),
    ]

    name = name_field(verbose_name="نام انبار")
    warehouse_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default="other",
        verbose_name="نوع انبار",
        db_index=True,
    )
    is_mother = models.BooleanField(
        default=False,
        verbose_name="انبار مرکزی",
        help_text="هر رستوران فقط یک انبار مرکزی می‌تواند داشته باشد",
    )
    description = description_field()
    is_active = is_active_field()
    created_at = created_at_field()
    updated_at = updated_at_field()

    class Meta:
        ordering = ["-is_mother", "name"]
        verbose_name = "انبار"
        verbose_name_plural = "انبارها"
        unique_together = ["restaurant", "name"]

    def __str__(self):
        prefix = "🏭 " if self.is_mother else ""
        return f"{prefix}{self.name}"

    def clean(self):
        super().clean()
        if self.is_mother:
            existing = Warehouse.all_objects.filter(
                restaurant_id=self.restaurant_id,
                is_mother=True,
            ).exclude(pk=self.pk)
            if existing.exists():
                raise ValidationError({
                    "is_mother": "هر رستوران فقط یک انبار مرکزی می‌تواند داشته باشد."
                })

    @property
    def stock_count(self):
        return self.stock_items.filter(quantity__gt=0).count()


class StockItem(TenantModel):
    """موجودی هر کالا در هر انبار — منبع اصلی موجودی"""

    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name="stock_items",
        verbose_name="انبار",
        db_index=True,
    )
    raw_material = models.ForeignKey(
        RawMaterial,
        on_delete=models.CASCADE,
        related_name="stock_items",
        verbose_name="ماده اولیه",
        db_index=True,
    )
    quantity = qty_field(
        max_digits=12, decimal_places=3, default=0, verbose_name="موجودی"
    )
    updated_at = updated_at_field()

    class Meta:
        verbose_name = "موجودی انبار"
        verbose_name_plural = "موجودی‌های انبار"
        unique_together = ["restaurant", "warehouse", "raw_material"]
        indexes = [
            models.Index(fields=["restaurant", "warehouse", "raw_material"]),
            models.Index(fields=["restaurant", "raw_material"]),
        ]
        constraints = [
            check_constraint(Q(quantity__gte=0), "rms_stockitem_qty_gte_0"),
        ]

    def __str__(self):
        return f"{self.raw_material.name} @ {self.warehouse.name}: {self.quantity}"

    @property
    def total_value(self):
        return self.quantity * self.raw_material.price

    @property
    def is_low(self):
        min_stock = getattr(self.raw_material, "minimum_stock", 0)
        return min_stock > 0 and self.quantity <= min_stock

    def increase(self, amount):
        """افزایش اتمیک"""
        if amount <= 0:
            raise ValidationError("مقدار افزایش باید مثبت باشد.")
        StockItem.all_objects.filter(pk=self.pk).update(
            quantity=F("quantity") + amount,
            updated_at=timezone.now(),
        )
        self.refresh_from_db(fields=["quantity", "updated_at"])

    def decrease(self, amount):
        """کاهش اتمیک — فقط اگر موجودی کافی باشد"""
        if amount <= 0:
            raise ValidationError("مقدار کاهش باید مثبت باشد.")
        with transaction.atomic():
            updated = StockItem.all_objects.filter(
                pk=self.pk, quantity__gte=amount
            ).update(
                quantity=F("quantity") - amount,
                updated_at=timezone.now(),
            )
        self.refresh_from_db(fields=["quantity", "updated_at"])
        if not updated:
            raise ValidationError(
                f"موجودی کافی نیست. موجودی فعلی: {self.quantity}، درخواست: {amount}"
            )


# ═══════════════════════════════════════════════════════════════
#  ★ 11. INVOICING — فاکتور فروش، مرجوعی، مشتری، هزینه
# ═══════════════════════════════════════════════════════════════


class Customer(TenantModel):
    """مشتری — برای نسیه و تاریخچه خرید"""

    name = name_field(verbose_name="نام مشتری")
    phone = phone_field()
    address = models.TextField("آدرس", blank=True, default="")
    opening_balance = price_field(default=0, verbose_name="بدهی اول دوره")
    note = description_field(verbose_name="یادداشت")
    is_active = is_active_field()
    created_at = created_at_field()

    class Meta:
        ordering = ["name"]
        verbose_name = "مشتری"
        verbose_name_plural = "مشتریان"
        unique_together = ["restaurant", "name"]

    def __str__(self):
        return self.name

    @property
    def total_debt(self):
        """بدهی فعلی = بدهی اول دوره + فروش نسیه − پرداختی‌ها − مرجوعی‌ها"""
        credit_total = self.invoices.filter(
            payment_method="credit"
        ).aggregate(t=Sum("total"))["t"] or Decimal("0")
        paid = self.invoices.aggregate(
            t=Sum("paid_amount")
        )["t"] or Decimal("0")
        returns = self.returns.aggregate(
            t=Sum("amount")
        )["t"] or Decimal("0")
        return self.opening_balance + credit_total - paid - returns


class SalesInvoice(TenantModel):
    """فاکتور فروش — عمومی (مستقل از منوی رستوران)"""

    PAYMENT_METHOD_CHOICES = [
        ("cash", "نقدی"),
        ("card", "کارت"),
        ("credit", "نسیه"),
    ]

    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
        verbose_name="مشتری",
    )
    customer_name = name_field(
        max_length=200, blank=True, default="", verbose_name="نام مشتری",
    )
    invoice_number = models.CharField(
        max_length=50, blank=True, default="", verbose_name="شماره فاکتور",
    )
    date = models.DateField(default=timezone.now, verbose_name="تاریخ")
    payment_method = models.CharField(
        max_length=10,
        choices=PAYMENT_METHOD_CHOICES,
        default="cash",
        db_index=True,
        verbose_name="نوع پرداخت",
    )
    total = price_field(max_digits=14, default=0, verbose_name="جمع کل")
    discount = price_field(default=0, verbose_name="تخفیف")
    paid_amount = price_field(max_digits=14, default=0, verbose_name="پرداخت‌شده")
    description = description_field()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="ایجاد شده توسط",
    )
    created_at = created_at_field()

    class Meta:
        ordering = ["-date", "-created_at"]
        verbose_name = "فاکتور فروش"
        verbose_name_plural = "فاکتورهای فروش"
        indexes = [
            models.Index(fields=["restaurant", "-date"]),
            models.Index(fields=["restaurant", "payment_method", "-date"]),
        ]
        constraints = [
            check_constraint(Q(total__gte=0), "rms_salesinv_total_gte_0"),
            check_constraint(Q(discount__gte=0), "rms_salesinv_disc_gte_0"),
        ]

    def __str__(self):
        return f"{self.invoice_number} — {self.customer_name or 'نقدی'}"

    @property
    def net_total(self):
        return (self.total or 0) - (self.discount or 0)

    @property
    def remaining(self):
        return self.net_total - (self.paid_amount or 0)

    @property
    def total_profit(self):
        return sum(i.profit for i in self.items.all())

    @property
    def total_returns(self):
        return sum(r.amount for r in self.returns.all())


class SalesInvoiceItem(TenantModel):
    """اقلام فاکتور فروش — با قیمت خرید برای محاسبه سود"""

    invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="فاکتور",
        db_index=True,
    )
    item_name = name_field(max_length=200, verbose_name="نام کالا")
    quantity = qty_field(max_digits=12, decimal_places=3, default=0)
    unit = unit_field()
    unit_price = price_field(default=0, verbose_name="قیمت فروش")
    cost_price = price_field(default=0, verbose_name="قیمت خرید")
    discount = price_field(default=0, verbose_name="تخفیف")

    class Meta:
        verbose_name = "قلم فروش"
        verbose_name_plural = "اقلام فروش"
        constraints = [
            check_constraint(Q(quantity__gte=0), "rms_salesitem_qty_gte_0"),
            check_constraint(Q(unit_price__gte=0), "rms_salesitem_price_gte_0"),
            check_constraint(Q(cost_price__gte=0), "rms_salesitem_cost_gte_0"),
        ]

    def __str__(self):
        return f"{self.item_name} x{self.quantity}"

    @property
    def line_total(self):
        return (self.quantity * self.unit_price) - (self.discount or 0)

    @property
    def profit(self):
        return (
            ((self.unit_price or 0) - (self.cost_price or 0)) * self.quantity
            - (self.discount or 0)
        )


class SalesReturn(TenantModel):
    """مرجوعی فروش"""

    invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.CASCADE,
        related_name="returns",
        verbose_name="فاکتور فروش",
        db_index=True,
    )
    item_name = name_field(max_length=200, verbose_name="نام کالا")
    quantity = qty_field(max_digits=12, decimal_places=3, default=0)
    unit = unit_field()
    amount = price_field(default=0, verbose_name="مبلغ برگشتی")
    reason = models.CharField(max_length=200, blank=True, default="", verbose_name="دلیل")
    date = models.DateField(default=timezone.now, verbose_name="تاریخ")
    created_at = created_at_field()

    class Meta:
        ordering = ["-date"]
        verbose_name = "مرجوعی فروش"
        verbose_name_plural = "مرجوعی‌های فروش"

    def __str__(self):
        return f"مرجوعی {self.item_name} — {self.amount}"


class PurchaseReturn(TenantModel):
    """مرجوعی خرید"""

    invoice = models.ForeignKey(
        PurchaseInvoice,
        on_delete=models.CASCADE,
        related_name="returns",
        verbose_name="فاکتور خرید",
        db_index=True,
    )
    item_name = name_field(max_length=200, verbose_name="نام کالا")
    quantity = qty_field(max_digits=12, decimal_places=3, default=0)
    unit = unit_field()
    amount = price_field(default=0, verbose_name="مبلغ برگشتی")
    reason = models.CharField(max_length=200, blank=True, default="", verbose_name="دلیل")
    date = models.DateField(default=timezone.now, verbose_name="تاریخ")
    created_at = created_at_field()

    class Meta:
        ordering = ["-date"]
        verbose_name = "مرجوعی خرید"
        verbose_name_plural = "مرجوعی‌های خرید"

    def __str__(self):
        return f"مرجوعی خرید {self.item_name} — {self.amount}"


class Expense(TenantModel):
    """هزینه‌های جاری — برای محاسبه سود خالص"""

    title = name_field(max_length=200, verbose_name="عنوان هزینه")
    amount = price_field(max_digits=14, default=0, verbose_name="مبلغ")
    category = models.CharField(
        max_length=50, blank=True, default="سایر", verbose_name="دسته",
    )
    date = models.DateField(default=timezone.now, verbose_name="تاریخ")
    note = description_field()
    created_at = created_at_field()

    class Meta:
        ordering = ["-date"]
        verbose_name = "هزینه"
        verbose_name_plural = "هزینه‌ها"

    def __str__(self):
        return f"{self.title} — {self.amount}"