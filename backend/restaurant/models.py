"""
Restaurant Management System — Models (Multi-tenant)
"""

from __future__ import annotations

import json
import uuid
from decimal import Decimal

from django.db import models
from django.db.models import F, Sum
from django.db.models.signals import pre_save
from django.dispatch import receiver
from django.utils import timezone
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.conf import settings

from .tenancy import TenantModel, TenantManager, AllObjectsManager


# ═══════════════════════════════════════════
#  ثابت‌ها و ابزارهای مشترک
# ═══════════════════════════════════════════

UNIT_CHOICES = [
    ("kg",    "کیلوگرم"),
    ("g",     "گرم"),
    ("l",     "لیتر"),
    ("ml",    "میلی‌لیتر"),
    ("unit",  "عدد"),
    ("bunch", "دسته"),
    ("pack",  "بسته"),
]

UNIT_MAX_LENGTH = 10


class DecimalSafeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            if obj % 1 == 0:          # ← باگ‌فیکس: int() روی اعشاری خطا نمی‌ده
                return int(obj)
            return float(obj)
        return super().default(obj)


# ═══════════════════════════════════════════
#  فیلدهای مشترک
# ═══════════════════════════════════════════

def unit_field(**kwargs):
    defaults = {'max_length': UNIT_MAX_LENGTH, 'choices': UNIT_CHOICES, 'verbose_name': 'واحد'}
    defaults.update(kwargs)
    return models.CharField(**defaults)


def name_field(max_length=200, verbose_name='نام', **kwargs):
    defaults = {'max_length': max_length, 'verbose_name': verbose_name, 'db_index': True}
    defaults.update(kwargs)
    return models.CharField(**defaults)


def price_field(max_digits=12, decimal_places=0, verbose_name='قیمت (تومان)', **kwargs):
    defaults = {'max_digits': max_digits, 'decimal_places': decimal_places, 'verbose_name': verbose_name}
    defaults.update(kwargs)
    return models.DecimalField(**defaults)


def qty_field(max_digits=10, decimal_places=0, verbose_name='مقدار', **kwargs):
    defaults = {'max_digits': max_digits, 'decimal_places': decimal_places, 'verbose_name': verbose_name}
    defaults.update(kwargs)
    return models.DecimalField(**defaults)


def phone_field(max_length=20, verbose_name='تلفن', **kwargs):
    defaults = {'max_length': max_length, 'verbose_name': verbose_name, 'blank': True}
    defaults.update(kwargs)
    return models.CharField(**defaults)


def description_field(verbose_name='توضیحات', **kwargs):
    defaults = {'verbose_name': verbose_name, 'blank': True}
    defaults.update(kwargs)
    return models.TextField(**defaults)


def is_active_field(**kwargs):
    defaults = {'default': True, 'verbose_name': 'فعال'}
    defaults.update(kwargs)
    return models.BooleanField(**defaults)


def created_at_field(**kwargs):
    defaults = {'auto_now_add': True, 'verbose_name': 'تاریخ ایجاد'}
    defaults.update(kwargs)
    return models.DateTimeField(**defaults)


def updated_at_field(**kwargs):
    defaults = {'auto_now': True, 'verbose_name': 'تاریخ بروزرسانی'}
    defaults.update(kwargs)
    return models.DateTimeField(**defaults)


# ═══════════════════════════════════════════
#  SHARED MODELS (بدون tenant — توی همه رستوران‌ها مشترکن)
# ═══════════════════════════════════════════


class Restaurant(models.Model):
    name       = name_field(max_length=200, verbose_name='نام رستوران')
    phone      = phone_field(verbose_name='تلفن')
    address    = models.TextField('آدرس', blank=True)
    logo       = models.ImageField('لوگو', upload_to='restaurants/logos/', blank=True, null=True)
    is_active  = is_active_field(verbose_name='فعال')
    created_at = created_at_field(verbose_name='تاریخ ایجاد')

    class Meta:
        verbose_name        = 'رستوران'
        verbose_name_plural = 'رستوران‌ها'
        ordering            = ['-created_at']

    def __str__(self):
        return self.name


class User(AbstractUser):
    class Role(models.TextChoices):
        OWNER     = 'owner',     'مالک'
        MANAGER   = 'manager',   'مدیر'
        CASHIER   = 'cashier',   'صندوقدار'
        KITCHEN   = 'kitchen',   'آشپزخانه'
        WAREHOUSE = 'warehouse', 'انباردار'
        CUSTOMER  = 'customer',  'مشتری'

    phone_number  = models.CharField('شماره موبایل', max_length=11, unique=True, blank=True, null=True)
    role          = models.CharField('نقش', max_length=20, choices=Role.choices, default=Role.CUSTOMER, db_index=True)
    restaurant    = models.ForeignKey(
        Restaurant, on_delete=models.CASCADE,
        related_name='users', verbose_name='رستوران',
        blank=True, null=True,
    )
    profile_image = models.ImageField('عکس پروفایل', upload_to='profiles/', blank=True, null=True)
    is_verified   = models.BooleanField('تأیید شده', default=False)
    is_approved   = models.BooleanField('تأیید مدیر', default=False)
    created_at    = created_at_field(verbose_name='تاریخ ایجاد')
    updated_at    = updated_at_field(verbose_name='تاریخ بروزرسانی')

    class Meta:
        verbose_name        = 'کاربر'
        verbose_name_plural = 'کاربران'
        ordering            = ['-created_at']

    def __str__(self):
        name = self.get_full_name() or self.username
        return f'{name} ({self.get_role_display()})'

    @property
    def is_owner(self):     return self.role == self.Role.OWNER

    @property
    def is_manager(self):   return self.role == self.Role.MANAGER

    @property
    def is_cashier(self):   return self.role == self.Role.CASHIER

    @property
    def is_kitchen(self):   return self.role == self.Role.KITCHEN

    @property
    def is_warehouse(self): return self.role == self.Role.WAREHOUSE

    @property
    def is_customer(self):  return self.role == self.Role.CUSTOMER

    @property
    def is_staff_role(self):
        return self.role in (
            self.Role.OWNER, self.Role.MANAGER, self.Role.CASHIER,
            self.Role.KITCHEN, self.Role.WAREHOUSE,
        )


# ═══════════════════════════════════════════
#  TENANT MODELS (از اینجا به بعد همه TenantModel هستن)
# ═══════════════════════════════════════════


# ─── 1. MENU ────────────────────────────


class Category(TenantModel):
    name      = name_field(verbose_name='نام دسته‌بندی')
    image     = models.ImageField(upload_to="categories/", blank=True)
    is_active = is_active_field()
    order     = models.IntegerField(default=0)

    class Meta:
        ordering            = ["order"]
        verbose_name        = "دسته‌بندی"
        verbose_name_plural = "دسته‌بندی‌ها"

    def __str__(self) -> str:
        return self.name


class Food(TenantModel):
    category     = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="foods", db_index=True)
    name         = name_field(verbose_name='نام غذا')
    image        = models.ImageField(upload_to="foods/", blank=True)
    price        = price_field(max_digits=10, verbose_name='قیمت')
    final_price  = price_field(max_digits=10, verbose_name='قیمت نهایی')  # ← باگ‌فیکس: از price_field استفاده شد
    is_available = is_active_field(verbose_name='موجود')
    created_at   = created_at_field()

    class Meta:
        verbose_name        = "غذا"
        verbose_name_plural = "غذاها"

    def __str__(self) -> str:
        return self.name

    def discounted_price(self) -> int:
        return int(self.final_price) if self.final_price else 0


@receiver(pre_save, sender=Food)
def set_food_final_price(sender, instance, **kwargs):
    """← باگ‌فیکس: اگه final_price ست نشده، از price کپی کن"""
    if not instance.final_price:
        instance.final_price = instance.price


# ─── 2. TABLES & RESERVATIONS ────────────


class Table(TenantModel):
    number      = models.IntegerField()
    is_reserved = models.BooleanField(default=False)

    class Meta:
        verbose_name        = "میز"
        verbose_name_plural = "میزها"

    def __str__(self) -> str:
        return f"میز {self.number}"


class Reservation(TenantModel):
    table         = models.ForeignKey(Table, on_delete=models.CASCADE)
    customer_name = name_field(max_length=200, verbose_name='نام مشتری', db_index=False)
    phone         = phone_field()  # ← باگ‌فیکس: blank=True از phone_field
    date          = models.DateField()
    time          = models.TimeField()
    guests        = models.IntegerField()
    created_at    = created_at_field()

    class Meta:
        verbose_name        = "رزرو"
        verbose_name_plural = "رزروها"
        indexes = [
            models.Index(fields=["date", "time"]),  # ← ایندکس جدید
        ]

    def __str__(self) -> str:
        return f"{self.customer_name} - میز {self.table.number}"


# ─── 3. ORDERS ────────────────────────────


class Order(TenantModel):
    STATUS_CHOICES = [
        ("pending",   "در انتظار"),
        ("confirmed", "تأیید شده"),
        ("preparing", "در حال آماده‌سازی"),
        ("ready",     "آماده"),
        ("delivered", "تحویل داده شده"),
        ("cancelled", "لغو شده"),
    ]

    table         = models.ForeignKey(Table, on_delete=models.SET_NULL, null=True, blank=True)
    customer_name = models.CharField(max_length=200, blank=True, default="")
    phone         = models.CharField(max_length=20, blank=True, default="")
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    total_price   = models.DecimalField(max_digits=10, decimal_places=0, default=0)
    created_at    = created_at_field()

    class Meta:
        verbose_name        = "سفارش"
        verbose_name_plural = "سفارشات"
        ordering            = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["table", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"سفارش {self.id} - {self.customer_name}"


class OrderItem(TenantModel):
    order    = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    food     = models.ForeignKey(Food, on_delete=models.CASCADE, related_name="order_items", null=True, blank=True)
    quantity = models.IntegerField(default=1)
    price    = models.DecimalField(max_digits=10, decimal_places=0, blank=True, null=True)

    class Meta:
        verbose_name        = "آیتم سفارش"
        verbose_name_plural = "آیتم‌های سفارش"
        indexes = [
            models.Index(fields=["order", "food"]),  # ← ایندکس جدید
        ]

    def __str__(self) -> str:
        name = getattr(self.food, 'name', None) if self.food_id else None
        return f"{name or 'کالای آماده'} x{self.quantity}"


@receiver(pre_save, sender=OrderItem)
def set_order_item_price(sender, instance: OrderItem, **kwargs) -> None:
    if instance.food_id and not instance.price:
        instance.price = instance.food.final_price


# ─── 4. RAW MATERIALS & INVENTORY LOG ────


class RawMaterial(TenantModel):
    UNIT_CHOICES = UNIT_CHOICES
    name     = name_field(verbose_name='نام ماده اولیه')
    label    = models.CharField(max_length=200, blank=True, verbose_name="برچسب")
    price    = price_field()
    unit     = unit_field()
    quantity = qty_field()

    class Meta:
        ordering            = ["name"]
        verbose_name        = "ماده اولیه"
        verbose_name_plural = "مواد اولیه"

    def __str__(self) -> str:
        return f"{self.name} - {self.quantity} {self.get_unit_display()}"

    @property
    def total_price(self):
        return self.price * self.quantity


class InventoryUsageLog(TenantModel):
    USAGE_TYPE_CHOICES = [
        ('semi_finished', 'ماده نیم‌آماده'),
        ('order',         'سفارش'),
        ('manual',        'مصرف دستی'),
        ('waste',         'ضایعات'),
    ]

    raw_material  = models.ForeignKey(RawMaterial, on_delete=models.CASCADE, related_name='usage_logs', verbose_name='ماده اولیه', db_index=True)
    usage_type    = models.CharField(max_length=20, choices=USAGE_TYPE_CHOICES, default='semi_finished', verbose_name='نوع مصرف')
    quantity_used = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='مقدار مصرف شده')
    reference     = models.CharField(max_length=200, blank=True, verbose_name='مرجع')
    note          = description_field(verbose_name='توضیحات')
    used_at       = created_at_field(verbose_name='تاریخ مصرف')

    class Meta:
        ordering            = ['-used_at']
        verbose_name        = 'تاریخچه مصرف'
        verbose_name_plural = 'تاریخچه مصرف‌ها'

    def __str__(self) -> str:
        return f"{self.raw_material.name} — {self.quantity_used} — {self.reference}"


# ─── 5. SEMI-FINISHED PRODUCTS ───────────


class SemiFinished(TenantModel):
    CATEGORY_CHOICES = [
        ('sauce',    'سس‌ها'),
        ('dough',    'خمیرها'),
        ('marinade', 'مارینادها'),
        ('soup',     'سوپ‌ها'),
        ('syrup',    'شربت‌ها'),
        ('other',    'سایر'),
    ]

    name              = name_field(verbose_name='نام ماده نیم‌آماده')
    category          = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other', verbose_name='دسته‌بندی')
    description       = description_field()
    unit              = unit_field()
    quantity_produced = qty_field(decimal_places=2, verbose_name='مقدار تولید شده')
    profit_percentage = models.IntegerField(default=30, verbose_name='درصد سود پیشنهادی')
    foods             = models.ManyToManyField('Food', blank=True, verbose_name='غذاهای مرتبط')
    current_stock     = qty_field(decimal_places=2, default=0, verbose_name='موجودی فعلی')
    created_at        = created_at_field()
    updated_at        = updated_at_field()

    class Meta:
        ordering            = ['name']
        verbose_name        = 'ماده نیم‌آماده'
        verbose_name_plural = 'مواد نیم‌آماده'

    def __str__(self) -> str:
        return self.name

    @property
    def total_cost(self):
        result = self.ingredients.aggregate(
            total=Sum(F('quantity') * F('raw_material__price'))
        )
        return result['total'] or Decimal('0')

    @property
    def cost_per_unit(self):
        if self.quantity_produced > 0:
            return self.total_cost / self.quantity_produced
        return Decimal('0')

    @property
    def suggested_price(self):
        if self.cost_per_unit:
            return int(self.cost_per_unit * (Decimal('1') + Decimal(str(self.profit_percentage)) / Decimal('100')))
        return 0

    @property
    def can_produce(self):
        quantities = []
        for item in self.ingredients.select_related('raw_material').all():
            if item.quantity > 0:
                quantities.append(float(item.raw_material.quantity) / float(item.quantity))
        return int(min(quantities)) if quantities else 0


class SemiFinishedIngredient(TenantModel):
    semi_finished = models.ForeignKey(SemiFinished, on_delete=models.CASCADE, related_name='ingredients')
    raw_material  = models.ForeignKey(RawMaterial, on_delete=models.CASCADE, verbose_name='ماده اولیه', db_index=True)
    quantity      = qty_field(decimal_places=2, verbose_name='مقدار مصرفی')

    class Meta:
        verbose_name        = 'ماده اولیه مصرفی'
        verbose_name_plural = 'مواد اولیه مصرفی'

    def __str__(self) -> str:
        return f"{self.raw_material.name} - {self.quantity}"

    @property
    def total_cost(self):
        return self.raw_material.price * self.quantity


# ─── 6. SUPPLIERS & PURCHASE INVOICES ────


class Supplier(TenantModel):
    name           = name_field(verbose_name='نام شرکت')
    phone          = phone_field()
    address        = models.TextField(blank=True, verbose_name="آدرس")
    contact_person = models.CharField(max_length=100, blank=True, verbose_name="مسئول فروش")
    description    = description_field()
    created_at     = created_at_field()

    class Meta:
        ordering            = ["-created_at"]
        verbose_name        = "تأمین‌کننده"
        verbose_name_plural = "تأمین‌کنندگان"

    def __str__(self) -> str:
        return self.name


class PurchaseInvoice(TenantModel):
    supplier_name  = name_field(max_length=200, verbose_name='نام تأمین‌کننده')
    invoice_number = models.CharField(max_length=50, blank=True, default="", verbose_name="شماره فاکتور")
    date           = models.DateField(default=timezone.now, verbose_name="تاریخ")
    description    = description_field()
    file           = models.FileField(upload_to="purchase_invoices/%Y/%m/", blank=True, verbose_name="فایل فاکتور")
    created_at     = created_at_field()

    class Meta:
        ordering            = ["-date", "-created_at"]
        verbose_name        = "فاکتور خرید"
        verbose_name_plural = "فاکتورهای خرید"
        indexes = [
            models.Index(fields=["-date"]),
            models.Index(fields=["supplier_name"]),
        ]

    def __str__(self) -> str:
        return f"{self.supplier_name} — {self.date}"

    @property
    def total_amount(self):
        result = self.items.aggregate(
            total=Sum(F('quantity') * F('unit_price'))
        )
        return result['total'] or Decimal('0')

    @property
    def item_count(self) -> int:
        return self.items.count()


class PurchaseInvoiceItem(TenantModel):
    invoice    = models.ForeignKey(PurchaseInvoice, on_delete=models.CASCADE, related_name="items", verbose_name="فاکتور", db_index=True)
    item_name  = models.CharField(max_length=200, verbose_name="نام کالا")
    quantity   = qty_field(decimal_places=2)
    unit       = unit_field()
    unit_price = price_field()
    category   = models.ForeignKey("Category", on_delete=models.SET_NULL, null=True, blank=True, verbose_name="دسته‌بندی")

    class Meta:
        verbose_name        = "آیتم فاکتور"
        verbose_name_plural = "آیتم‌های فاکتور"

    def __str__(self) -> str:
        return f"{self.item_name} x{self.quantity}"

    @property
    def line_total(self):
        return self.quantity * self.unit_price


# ─── 7. READY MATERIALS ──────────────────


class ReadyMaterial(TenantModel):
    name                = name_field(verbose_name='نام ماده')
    description         = description_field()
    unit                = unit_field(default='unit')
    quantity            = qty_field(max_digits=12, decimal_places=3)
    purchase_price      = price_field(verbose_name='قیمت خرید (تومان)')
    selling_price       = price_field(verbose_name='قیمت فروش (تومان)')
    minimum_stock       = qty_field(max_digits=12, decimal_places=3, default=0, verbose_name='حداقل موجودی')
    supplier            = models.ForeignKey("Supplier", on_delete=models.SET_NULL, null=True, blank=True, verbose_name="تأمین‌کننده")
    barcode             = models.CharField(max_length=100, blank=True, verbose_name="بارکد", db_index=True)
    category            = models.ForeignKey("Category", on_delete=models.SET_NULL, null=True, blank=True, related_name="ready_materials", verbose_name="دسته‌بندی")
    source_raw_material = models.ForeignKey("RawMaterial", on_delete=models.SET_NULL, null=True, blank=True, related_name="ready_outputs", verbose_name="ماده اولیه مبدأ")
    consume_quantity    = qty_field(max_digits=12, decimal_places=3, default=0, verbose_name='مقدار مصرف از ماده اولیه')
    is_active           = is_active_field()
    created_at          = created_at_field()
    updated_at          = updated_at_field()

    class Meta:
        ordering            = ["name"]
        verbose_name        = "ماده آماده"
        verbose_name_plural = "مواد آماده"

    def __str__(self) -> str:
        return self.name

    @property
    def total_value(self):
        return int(self.quantity * self.purchase_price)

    @property
    def stock_status(self):
        if self.quantity <= 0:
            return "out"
        if self.minimum_stock > 0 and self.quantity <= self.minimum_stock:
            return "low"
        return "ok"


# ─── 8. LOYALTY SYSTEM ────────────────────


LOYALTY_POINTS_PER_TOMAN       = Decimal('1')
LOYALTY_POINTS_PER_ORDER_BONUS = 10
LOYALTY_BIRTHDAY_BONUS         = 100
LOYALTY_REFERRAL_BONUS         = 50
LOYALTY_MIN_WALLET             = 0
LOYALTY_MAX_WALLET             = Decimal('10000000')


class MembershipLevel(TenantModel):
    LEVEL_CHOICES = [
        ('bronze', 'برنز'),
        ('silver', 'نقره‌ای'),
        ('gold',   'طلایی'),
        ('vip',    'VIP'),
    ]

    name              = models.CharField(max_length=20, choices=LEVEL_CHOICES, verbose_name='سطح')
    title             = models.CharField(max_length=50, verbose_name='عنوان نمایشی')
    icon              = models.CharField(max_length=10, blank=True, default='', verbose_name='آیکون')
    color             = models.CharField(max_length=7, default='#6B7280', verbose_name='رنگ (hex)')
    min_spending      = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name='حداقل خرید')
    min_points        = models.IntegerField(default=0, verbose_name='حداقل امتیاز')
    discount_percent  = models.IntegerField(default=0, verbose_name='درصد تخفیف')
    points_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal('1.00'), verbose_name='ضریب امتیاز')
    free_delivery     = models.BooleanField(default=False, verbose_name='ارسال رایگان')
    cashback_rate     = models.DecimalField(max_digits=5, decimal_places=4, default=Decimal('0'), verbose_name='نرخ کش‌بک')
    priority_support  = models.BooleanField(default=False, verbose_name='پشتیبانی اولویت‌دار')
    description       = description_field()
    order             = models.IntegerField(default=0, verbose_name='ترتیب نمایش')

    class Meta:
        ordering            = ['order']
        verbose_name        = 'سطح عضویت'
        verbose_name_plural = 'سطوح عضویت'
        unique_together     = ['restaurant', 'name']  # ← هر رستوران سطوح خودش

    def __str__(self) -> str:
        return f"{self.icon} {self.title}"


class CustomerProfile(TenantModel):
    phone           = models.CharField(max_length=11, verbose_name='شماره موبایل')
    email           = models.EmailField(blank=True, verbose_name='ایمیل')
    first_name      = models.CharField(max_length=100, blank=True, verbose_name='نام')
    last_name       = models.CharField(max_length=100, blank=True, verbose_name='نام خانوادگی')
    birth_date      = models.DateField(null=True, blank=True, verbose_name='تاریخ تولد')
    profile_image   = models.ImageField(upload_to='loyalty/profiles/', blank=True, verbose_name='تصویر پروفایل')

    membership_level = models.ForeignKey(
        MembershipLevel, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='customers', verbose_name='سطح عضویت',
    )
    total_points     = models.DecimalField(max_digits=12, decimal_places=0, default=0, verbose_name='امتیاز کل')
    available_points = models.DecimalField(max_digits=12, decimal_places=0, default=0, verbose_name='امتیاز قابل استفاده')
    total_spending   = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name='مجموع خرید')
    total_orders     = models.IntegerField(default=0, verbose_name='تعداد سفارش‌ها')

    referral_code    = models.CharField(max_length=12, blank=True, verbose_name='کد دعوت')
    referred_by      = models.ForeignKey(
        'self', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='referrals', verbose_name='دعوت‌کننده',
    )

    notes      = description_field(verbose_name='یادداشت داخلی')
    is_active  = is_active_field()
    joined_at  = created_at_field(verbose_name='تاریخ عضویت')
    updated_at = updated_at_field()

    class Meta:
        ordering            = ['-joined_at']
        verbose_name        = 'مشتری باشگاه'
        verbose_name_plural = 'مشتریان باشگاه'
        indexes = [
            models.Index(fields=['restaurant', 'phone']),  # ← unique per tenant
            models.Index(fields=['referral_code']),
            models.Index(fields=['membership_level', '-total_spending']),
        ]

    def __str__(self) -> str:
        return f"{self.full_name or self.phone} ({self.available_points} امتیاز)"

    def save(self, *args, **kwargs):
        # ← باگ‌فیکس: collision-safe referral code
        if not self.referral_code:
            for _ in range(5):
                code = uuid.uuid4().hex[:8].upper()
                if not CustomerProfile.all_objects.filter(referral_code=code).exists():
                    self.referral_code = code
                    break
            else:
                self.referral_code = uuid.uuid4().hex[:12].upper()
        super().save(*args, **kwargs)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def wallet_balance(self) -> Decimal:
        if hasattr(self, 'loyalty_wallet'):
            return self.loyalty_wallet.balance
        return Decimal('0')

    @property
    def is_birthday_today(self) -> bool:
        if not self.birth_date:
            return False
        today = timezone.now().date()
        return (self.birth_date.month, self.birth_date.day) == (today.month, today.day)

    @property
    def membership_benefits(self) -> dict:
        if self.membership_level:
            return {
                'discount': self.membership_level.discount_percent,
                'multiplier': float(self.membership_level.points_multiplier),
                'free_delivery': self.membership_level.free_delivery,
                'cashback_rate': float(self.membership_level.cashback_rate),
            }
        return {'discount': 0, 'multiplier': 1.0, 'free_delivery': False, 'cashback_rate': 0}


class LoyaltyTransaction(TenantModel):
    TRANSACTION_TYPES = [
        ('earn',      'کسب امتیاز'),
        ('redeem',    'استفاده از امتیاز'),
        ('expire',    'انقضای امتیاز'),
        ('adjust',    'تعدیل دستی'),
        ('referral',  'جایزه دعوت'),
        ('birthday',  'هدیه تولد'),
        ('cashback',  'کش‌بک'),
        ('bonus',     'جایزه ویژه'),
    ]

    customer         = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='loyalty_transactions', verbose_name='مشتری', db_index=True)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES, verbose_name='نوع تراکنش')
    points           = models.DecimalField(max_digits=12, decimal_places=0, verbose_name='امتیاز')
    balance_after    = models.DecimalField(max_digits=12, decimal_places=0, default=0, verbose_name='مانده امتیاز')
    description      = models.CharField(max_length=300, blank=True, verbose_name='توضیحات')
    order_id         = models.IntegerField(null=True, blank=True, verbose_name='شناسه سفارش')
    created_at       = created_at_field(verbose_name='تاریخ')

    class Meta:
        ordering            = ['-created_at']
        verbose_name        = 'تراکنش امتیاز'
        verbose_name_plural = 'تراکنش‌های امتیاز'

    def __str__(self) -> str:
        sign = '+' if self.transaction_type in ('earn', 'referral', 'birthday', 'cashback', 'bonus') else '-'
        return f"{self.customer.phone} | {sign}{self.points}"


class Coupon(TenantModel):
    DISCOUNT_TYPES = [
        ('percentage', 'درصدی'),
        ('fixed',      'مبلغ ثابت'),
    ]
    COUPON_TYPES = [
        ('general',     'عمومی'),
        ('first_order', 'اولین سفارش'),
        ('birthday',    'تولد'),
        ('vip',         'VIP'),
        ('referral',    'دعوت دوست'),
        ('seasonal',    'مناسبتی'),
    ]

    code                  = models.CharField(max_length=30, verbose_name='کد کوپن')
    name                  = name_field(max_length=200, verbose_name='نام کوپن')
    description           = description_field()
    coupon_type           = models.CharField(max_length=20, choices=COUPON_TYPES, default='general', verbose_name='نوع کوپن')
    discount_type         = models.CharField(max_length=15, choices=DISCOUNT_TYPES, default='percentage', verbose_name='نوع تخفیف')
    discount_value        = models.DecimalField(max_digits=12, decimal_places=0, verbose_name='مقدار تخفیف')
    max_discount_amount   = models.DecimalField(max_digits=12, decimal_places=0, null=True, blank=True, verbose_name='سقف تخفیف')
    min_order_amount      = models.DecimalField(max_digits=12, decimal_places=0, default=0, verbose_name='حداقل مبلغ سفارش')
    max_uses              = models.IntegerField(default=1, verbose_name='حداکثر استفاده کل')
    max_uses_per_customer = models.IntegerField(default=1, verbose_name='حداکثر استفاده هر مشتری')
    used_count            = models.IntegerField(default=0, verbose_name='تعداد استفاده شده')
    valid_from            = models.DateTimeField(verbose_name='شروع اعتبار')
    valid_until           = models.DateTimeField(verbose_name='پایان اعتبار')
    is_active             = is_active_field()
    applicable_levels     = models.ManyToManyField(MembershipLevel, blank=True, related_name='coupons', verbose_name='سطوح قابل استفاده')
    created_at            = created_at_field()
    updated_at            = updated_at_field()

    class Meta:
        ordering            = ['-created_at']
        verbose_name        = 'کوپن'
        verbose_name_plural = 'کوپن‌ها'
        unique_together     = ['restaurant', 'code']  # ← کد کوپن هر رستوران یونیک

    def __str__(self) -> str:
        return f"{self.code} — {self.name}"

    @property
    def is_valid(self) -> bool:
        now = timezone.now()
        return self.is_active and self.valid_from <= now <= self.valid_until and self.used_count < self.max_uses

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.valid_until

    def calculate_discount(self, order_amount: Decimal) -> Decimal:
        if self.discount_type == 'percentage':
            discount = order_amount * self.discount_value / Decimal('100')
            if self.max_discount_amount:
                discount = min(discount, self.max_discount_amount)
            return discount
        return min(self.discount_value, order_amount)


class CustomerCoupon(TenantModel):
    customer      = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='customer_coupons', verbose_name='مشتری', db_index=True)
    coupon        = models.ForeignKey(Coupon, on_delete=models.CASCADE, related_name='customer_coupons', verbose_name='کوپن')
    used_count    = models.IntegerField(default=0, verbose_name='تعداد استفاده')
    first_used_at = models.DateTimeField(null=True, blank=True, verbose_name='اولین استفاده')
    last_used_at  = models.DateTimeField(null=True, blank=True, verbose_name='آخرین استفاده')

    class Meta:
        unique_together     = ['customer', 'coupon']
        verbose_name        = 'استفاده کوپن مشتری'
        verbose_name_plural = 'استفاده‌های کوپن مشتری'


class LoyaltyWallet(TenantModel):
    customer   = models.OneToOneField(CustomerProfile, on_delete=models.CASCADE, related_name='loyalty_wallet', verbose_name='مشتری')
    balance    = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name='موجودی (تومان)')
    updated_at = updated_at_field()

    class Meta:
        verbose_name        = 'کیف پول'
        verbose_name_plural = 'کیف پول‌ها'

    def __str__(self) -> str:
        return f"{self.customer.phone} — {self.balance:,} تومان"

    def can_debit(self, amount: Decimal) -> bool:
        return self.balance >= amount


class WalletTransaction(TenantModel):
    TRANSACTION_TYPES = [
        ('deposit',    'واریز'),
        ('withdrawal', 'برداشت'),
        ('purchase',   'خرید'),
        ('cashback',   'کش‌بک'),
        ('refund',     'بازگشت وجه'),
        ('reward',     'جایزه'),
        ('adjust',     'تعدیل دستی'),
    ]

    wallet           = models.ForeignKey(LoyaltyWallet, on_delete=models.CASCADE, related_name='transactions', verbose_name='کیف پول', db_index=True)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES, verbose_name='نوع تراکنش')
    amount           = models.DecimalField(max_digits=14, decimal_places=0, verbose_name='مبلغ (تومان)')
    balance_after    = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name='مانده')
    description      = models.CharField(max_length=300, blank=True, verbose_name='توضیحات')
    order_id         = models.IntegerField(null=True, blank=True, verbose_name='شناسه سفارش')
    created_at       = created_at_field(verbose_name='تاریخ')

    class Meta:
        ordering            = ['-created_at']
        verbose_name        = 'تراکنش کیف پول'
        verbose_name_plural = 'تراکنش‌های کیف پول'

    def __str__(self) -> str:
        sign = '+' if self.transaction_type in ('deposit', 'cashback', 'refund', 'reward') else '-'
        return f"{self.wallet.customer.phone} | {sign}{self.amount:,}"


class Reward(TenantModel):
    CATEGORIES = [
        ('food',     'غذا'),
        ('drink',    'نوشیدنی'),
        ('dessert',  'دسر'),
        ('discount', 'تخفیف'),
        ('delivery', 'ارسال رایگان'),
        ('other',    'سایر'),
    ]

    name                 = name_field(verbose_name='نام جایزه')
    description          = description_field()
    category             = models.CharField(max_length=20, choices=CATEGORIES, default='other', verbose_name='دسته‌بندی')
    image                = models.ImageField(upload_to='loyalty/rewards/', blank=True, verbose_name='تصویر')
    points_required      = models.DecimalField(max_digits=10, decimal_places=0, verbose_name='امتیاز مورد نیاز')
    value                = models.DecimalField(max_digits=12, decimal_places=0, default=0, verbose_name='ارزش ریالی')
    quantity_available   = models.IntegerField(default=-1, verbose_name='موجودی (-1=نامحدود)')
    min_membership_level = models.ForeignKey(MembershipLevel, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='حداقل سطح عضویت')
    is_active            = is_active_field()
    created_at           = created_at_field()

    class Meta:
        ordering            = ['points_required']
        verbose_name        = 'جایزه'
        verbose_name_plural = 'جوایز'

    def __str__(self) -> str:
        return f"{self.name} ({self.points_required} امتیاز)"

    @property
    def is_available(self) -> bool:
        return self.is_active and self.quantity_available != 0


class RewardRedemption(TenantModel):
    STATUS_CHOICES = [
        ('pending',   'در انتظار'),
        ('approved',  'تأیید شده'),
        ('used',      'استفاده شده'),
        ('cancelled', 'لغو شده'),
    ]

    customer     = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='reward_redemptions', verbose_name='مشتری', db_index=True)
    reward       = models.ForeignKey(Reward, on_delete=models.CASCADE, related_name='redemptions', verbose_name='جایزه')
    points_spent = models.DecimalField(max_digits=10, decimal_places=0, verbose_name='امتیاز مصرف شده')
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES, default='approved', verbose_name='وضعیت')
    redeemed_at  = created_at_field(verbose_name='تاریخ')

    class Meta:
        ordering            = ['-redeemed_at']
        verbose_name        = 'معاوضه جایزه'
        verbose_name_plural = 'معاوضه‌های جایزه'


class Referral(TenantModel):
    referrer      = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='sent_referrals', verbose_name='دعوت‌کننده', db_index=True)
    referred      = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='received_referrals', verbose_name='دعوت‌شده')
    referral_code = models.CharField(max_length=12, verbose_name='کد استفاده شده')
    bonus_points  = models.DecimalField(max_digits=10, decimal_places=0, default=0, verbose_name='جایزه امتیاز')
    is_rewarded   = models.BooleanField(default=False, verbose_name='جایزه داده شده')
    rewarded_at   = models.DateTimeField(null=True, blank=True, verbose_name='تاریخ جایزه')
    created_at    = created_at_field()

    class Meta:
        ordering            = ['-created_at']
        verbose_name        = 'دعوت'
        verbose_name_plural = 'دعوت‌ها'
        unique_together     = ['referrer', 'referred']


class LoyaltyNotification(TenantModel):
    CHANNELS = [
        ('sms',    'پیامک'),
        ('email',  'ایمیل'),
        ('push',   'اعلان'),
        ('in_app', 'درون‌برنامه‌ای'),
    ]
    TYPES = [
        ('welcome',         'خوش‌آمدگویی'),
        ('points_earned',   'کسب امتیاز'),
        ('points_redeemed', 'استفاده از امتیاز'),
        ('level_up',        'ارتقاء سطح'),
        ('coupon',          'کوپن'),
        ('birthday',        'تولد'),
        ('referral',        'دعوت'),
        ('wallet',          'کیف پول'),
        ('order',           'سفارش'),
        ('promotion',       'تبلیغات'),
        ('general',         'عمومی'),
    ]

    customer          = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='notifications', verbose_name='مشتری', db_index=True)
    channel           = models.CharField(max_length=10, choices=CHANNELS, default='in_app', verbose_name='کانال')
    notification_type = models.CharField(max_length=20, choices=TYPES, default='general', verbose_name='نوع')
    title             = models.CharField(max_length=200, verbose_name='عنوان')
    message           = models.TextField(verbose_name='متن')
    data              = models.JSONField(default=dict, blank=True, verbose_name='داده اضافی')
    is_read           = models.BooleanField(default=False, verbose_name='خوانده شده')
    is_sent           = models.BooleanField(default=False, verbose_name='ارسال شده')
    sent_at           = models.DateTimeField(null=True, blank=True, verbose_name='زمان ارسال')
    created_at        = created_at_field()

    class Meta:
        ordering            = ['-created_at']
        verbose_name        = 'اعلان باشگاه'
        verbose_name_plural = 'اعلان‌های باشگاه'
        indexes = [
            models.Index(fields=['customer', 'is_read', '-created_at']),
        ]

    def __str__(self) -> str:
        return f"{self.customer.phone} | {self.title}"


# ─── 9. RECIPE ENGINE ────────────────────


class Recipe(TenantModel):
    food = models.OneToOneField(
        Food, on_delete=models.CASCADE,
        related_name='recipe', verbose_name='غذا',
    )
    yield_quantity             = models.FloatField('مقدار خروجی', default=1)
    instructions               = models.TextField('دستورالعمل', blank=True)
    estimated_preparation_time = models.PositiveIntegerField('زمان تخمینی آماده‌سازی (دقیقه)', default=0)
    notes                      = description_field(verbose_name='یادداشت')
    version                    = models.PositiveIntegerField('نسخه', default=1)
    is_active                  = is_active_field()

    total_raw_material_cost  = price_field(max_digits=14, verbose_name='هزینه مواد اولیه')
    total_semi_finished_cost = price_field(max_digits=14, verbose_name='هزینه مواد نیم‌آماده')
    total_cost               = price_field(max_digits=14, verbose_name='هزینه کل')
    cost_per_serving         = price_field(max_digits=14, verbose_name='هزینه هر سرو')
    suggested_price          = price_field(max_digits=14, verbose_name='قیمت پیشنهادی')

    created_at = created_at_field()
    updated_at = updated_at_field()

    class Meta:
        verbose_name        = 'دستور پخت'
        verbose_name_plural = 'دستور پخت‌ها'
        ordering            = ['-updated_at']

    def __str__(self):
        return f'دستور: {self.food.name} (v{self.version})'

    def recalculate_cost(self):
        from .recipe_services import calculate_recipe_cost
        return calculate_recipe_cost(self)

    @property
    def profit_margin(self):
        fp = float(self.food.final_price or 0)
        cs = float(self.cost_per_serving or 0)
        if fp > 0:
            return (fp - cs) / fp * 100
        return 0.0


class RecipeIngredient(TenantModel):
    recipe          = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='ingredients', verbose_name='دستور پخت', db_index=True)
    raw_material    = models.ForeignKey(RawMaterial, on_delete=models.CASCADE, related_name='recipe_usages', verbose_name='ماده اولیه')
    quantity        = models.DecimalField('مقدار', max_digits=10, decimal_places=3)
    unit            = unit_field(default='unit')
    wastage_percent = models.DecimalField('درصد ضایعات', max_digits=5, decimal_places=2, default=0)
    optional        = models.BooleanField('اختیاری', default=False)
    notes           = description_field(verbose_name='یادداشت')

    class Meta:
        verbose_name        = 'ماده اولیه رسپی'
        verbose_name_plural = 'مواد اولیه رسپی'
        unique_together     = ['recipe', 'raw_material']

    def __str__(self):
        return f'{self.raw_material.name} — {self.quantity} {self.unit}'

    @property
    def effective_quantity(self):
        waste = float(self.wastage_percent) / 100
        return float(self.quantity) * (1 + waste)

    @property
    def total_cost(self):
        return Decimal(str(self.effective_quantity)) * self.raw_material.price


class RecipeSemiFinished(TenantModel):
    recipe        = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='semi_finished_items', verbose_name='دستور پخت', db_index=True)
    semi_finished = models.ForeignKey(SemiFinished, on_delete=models.CASCADE, related_name='recipe_usages', verbose_name='ماده نیم‌آماده')
    quantity      = models.DecimalField('مقدار', max_digits=10, decimal_places=3)
    unit          = unit_field(default='unit')

    class Meta:
        verbose_name        = 'ماده نیم‌آماده رسپی'
        verbose_name_plural = 'مواد نیم‌آماده رسپی'
        unique_together     = ['recipe', 'semi_finished']

    def __str__(self):
        return f'{self.semi_finished.name} — {self.quantity} {self.unit}'

    @property
    def total_cost(self):
        return Decimal(str(self.quantity)) * self.semi_finished.cost_per_unit


# ─── 10. INVENTORY TRACKING ──────────────


class InventoryMovement(TenantModel):
    class MovementType(models.TextChoices):
        IN          = 'in',          'ورود'
        OUT         = 'out',         'خروج'
        WASTE       = 'waste',       'ضایعات'
        ADJUSTMENT  = 'adjustment',  'تعدیل'
        PRODUCTION  = 'production',  'تولید'
        ORDER_USAGE = 'order_usage', 'مصرف سفارش'

    raw_material   = models.ForeignKey(
        RawMaterial, on_delete=models.CASCADE,
        related_name='movements', verbose_name='ماده اولیه',
        db_index=True,
    )
    movement_type  = models.CharField('نوع جابجایی', max_length=20, choices=MovementType.choices)
    quantity       = models.DecimalField('مقدار', max_digits=12, decimal_places=3)
    previous_stock = models.DecimalField('موجودی قبل', max_digits=12, decimal_places=3)
    new_stock      = models.DecimalField('موجودی بعد', max_digits=12, decimal_places=3)

    reference_type = models.CharField('نوع مرجع', max_length=50, blank=True)
    reference_id   = models.PositiveIntegerField('شناسه مرجع', blank=True, null=True)
    notes          = description_field(verbose_name='یادداشت')
    created_by     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='ایجاد شده توسط')
    created_at     = created_at_field(verbose_name='تاریخ')

    class Meta:
        verbose_name        = 'جابجایی انبار'
        verbose_name_plural = 'جابجایی‌های انبار'
        ordering            = ['-created_at']
        indexes = [
            models.Index(fields=['raw_material', 'movement_type']),
            models.Index(fields=['reference_type', 'reference_id']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.get_movement_type_display()} — {self.raw_material.name} — {self.quantity}'


# ─── 11. KITCHEN MANAGEMENT ──────────────


class KitchenProduct(TenantModel):
    CATEGORY_CHOICES = [
        ('fast_food',   'فست‌فود'),
        ('traditional', 'سنتی'),
        ('cafe',        'کافه'),
        ('bakery',      'نانوایی و شیرینی'),
        ('pizza',       'پیتزا'),
        ('burger',      'برگر'),
        ('drink',       'نوشیدنی'),
        ('dessert',     'دسر'),
        ('appetizer',   'پیش‌غذا'),
        ('main',        'غذای اصلی'),
        ('other',       'سایر'),
    ]

    name          = name_field(verbose_name='نام محصول')
    recipe        = models.ForeignKey(Recipe, on_delete=models.PROTECT, related_name='kitchen_products', verbose_name='دستور پخت')
    category      = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='main', verbose_name='دسته‌بندی')
    description   = description_field()
    image         = models.ImageField(upload_to='kitchen/products/', blank=True, null=True, verbose_name='تصویر')
    selling_price = models.PositiveIntegerField(default=0, verbose_name='قیمت فروش (تومان)')
    is_active     = is_active_field()
    created_at    = created_at_field()
    updated_at    = updated_at_field()

    class Meta:
        verbose_name        = 'محصول آشپزخانه'
        verbose_name_plural = 'محصولات آشپزخانه'
        ordering            = ['name']

    def __str__(self):
        return self.name

    def calculate_cost(self):
        from .kitchen_services import calculate_recipe_cost
        return calculate_recipe_cost(self)

    def calculate_max_production(self):
        from .kitchen_services import calculate_max_production as _calc
        return _calc(self)

    def calculate_profit(self):
        return self.selling_price - int(self.calculate_cost())

    def get_inventory(self):
        inv, _ = KitchenInventory.objects.get_or_create(
            kitchen_product=self,
            defaults={'low_stock_threshold': 5},
        )
        return inv


class KitchenInventory(TenantModel):
    kitchen_product     = models.OneToOneField(KitchenProduct, on_delete=models.CASCADE, related_name='inventory_record', verbose_name='محصول')
    quantity            = models.PositiveIntegerField(default=0, verbose_name='موجودی کل')
    reserved_quantity   = models.PositiveIntegerField(default=0, verbose_name='رزرو شده')
    low_stock_threshold = models.PositiveIntegerField(default=5, verbose_name='آستانه کمبود')
    updated_at          = updated_at_field(verbose_name='بروزرسانی')

    class Meta:
        verbose_name        = 'موجودی آشپزخانه'
        verbose_name_plural = 'موجودی‌های آشپزخانه'
        ordering            = ['-updated_at']

    def __str__(self):
        return f'{self.kitchen_product.name} — {self.quantity}'

    @property
    def available_quantity(self):
        return max(0, self.quantity - self.reserved_quantity)

    @property
    def is_low_stock(self):
        return self.available_quantity <= self.low_stock_threshold

    def increase_stock(self, amount):
        self.quantity += amount
        self.save(update_fields=['quantity', 'updated_at'])

    def decrease_stock(self, amount):
        if amount > self.quantity:
            raise ValidationError('موجودی کافی نیست.')
        self.quantity -= amount
        self.save(update_fields=['quantity', 'updated_at'])


class ProductionPlan(TenantModel):
    STATUS_CHOICES = [
        ('draft',     'پیش‌نویس'),
        ('approved',  'تأیید شده'),
        ('completed', 'تکمیل شده'),
        ('cancelled', 'لغو شده'),
    ]

    date       = models.DateField(verbose_name='تاریخ')
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', verbose_name='وضعیت')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='production_plans', verbose_name='ایجادکننده')
    notes      = description_field()
    created_at = created_at_field()
    updated_at = updated_at_field()

    class Meta:
        verbose_name        = 'برنامه تولید'
        verbose_name_plural = 'برنامه‌های تولید'
        ordering            = ['-date', '-created_at']

    def __str__(self):
        return f'برنامه {self.date} — {self.get_status_display()}'


class ProductionPlanItem(TenantModel):
    production_plan = models.ForeignKey(ProductionPlan, on_delete=models.CASCADE, related_name='items', verbose_name='برنامه', db_index=True)
    kitchen_product = models.ForeignKey(KitchenProduct, on_delete=models.CASCADE, related_name='plan_items', verbose_name='محصول')
    quantity        = models.PositiveIntegerField(default=1, verbose_name='تعداد')

    class Meta:
        verbose_name        = 'آیتم برنامه تولید'
        verbose_name_plural = 'آیتم‌های برنامه تولید'

    def __str__(self):
        return f'{self.kitchen_product.name} × {self.quantity}'

    def required_materials(self):
        from .kitchen_services import get_required_materials
        return get_required_materials(self.kitchen_product, self.quantity)


class ProductionBatch(TenantModel):
    production_plan   = models.ForeignKey(ProductionPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name='batches', verbose_name='برنامه تولید')
    kitchen_product   = models.ForeignKey(KitchenProduct, on_delete=models.CASCADE, related_name='batches', verbose_name='محصول')
    quantity_produced = models.PositiveIntegerField(default=0, verbose_name='تعداد تولید')
    production_cost   = models.PositiveIntegerField(default=0, verbose_name='هزینه تولید (تومان)')
    produced_by       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='production_batches', verbose_name='تولیدکننده')
    notes             = description_field()
    produced_at       = created_at_field(verbose_name='زمان تولید')

    class Meta:
        verbose_name        = 'دسته تولید'
        verbose_name_plural = 'دسته‌های تولید'
        ordering            = ['-produced_at']

    def __str__(self):
        return f'{self.kitchen_product.name} × {self.quantity_produced}'


class KitchenDiscount(TenantModel):
    DISCOUNT_TYPE_CHOICES = [
        ('percentage',   'درصدی'),
        ('fixed_amount', 'مبلغ ثابت'),
    ]
    SCOPE_CHOICES = [
        ('all_items',       'همه اقلام'),
        ('first_n_items',   'N قلم اول'),
        ('inventory_based', 'بر اساس موجودی'),
        ('happy_hour',      'ساعت خوش'),
    ]

    name            = name_field(verbose_name='نام تخفیف')
    kitchen_product = models.ForeignKey(KitchenProduct, on_delete=models.CASCADE, null=True, blank=True, related_name='discounts', verbose_name='محصول')
    discount_type   = models.CharField(max_length=20, choices=DISCOUNT_TYPE_CHOICES, default='percentage', verbose_name='نوع تخفیف')
    scope           = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='all_items', verbose_name='دامنه')
    value           = models.DecimalField(max_digits=12, decimal_places=0, default=0, verbose_name='مقدار')
    max_quantity    = models.PositiveIntegerField(null=True, blank=True, verbose_name='حداکثر تعداد')
    start_time      = models.TimeField(null=True, blank=True, verbose_name='ساعت شروع')
    end_time        = models.TimeField(null=True, blank=True, verbose_name='ساعت پایان')
    minimum_stock   = models.PositiveIntegerField(null=True, blank=True, verbose_name='حداقل موجودی')
    expires_at      = models.DateTimeField(null=True, blank=True, verbose_name='زمان انقضا')
    is_active       = is_active_field()
    created_at      = created_at_field()

    class Meta:
        verbose_name        = 'تخفیف آشپزخانه'
        verbose_name_plural = 'تخفیف‌های آشپزخانه'
        ordering            = ['-created_at']

    def __str__(self):
        product_label = self.kitchen_product.name if self.kitchen_product else 'همه'
        return f'{self.name} — {product_label}'

    def get_discounted_price(self, original_price, quantity=1, current_stock=0):
        from .kitchen_services import apply_discount
        return apply_discount(self, original_price, quantity, current_stock)

    def is_expired(self):
        if self.expires_at and self.expires_at <= timezone.now():
            return True
        return False

    def check_and_deactivate(self):
        if self.is_expired() and self.is_active:
            self.is_active = False
            self.save(update_fields=['is_active'])
            return True
        return False


class CapacityAnalysis(TenantModel):
    kitchen_product         = models.ForeignKey(KitchenProduct, on_delete=models.CASCADE, related_name='capacity_snapshots', verbose_name='محصول')
    max_production_quantity = models.PositiveIntegerField(default=0, verbose_name='حداکثر تولید')
    limiting_material_name  = models.CharField(max_length=200, blank=True, default='', verbose_name='ماده محدودکننده')
    limiting_material_type  = models.CharField(max_length=30, blank=True, default='', verbose_name='نوع ماده')
    calculated_at           = created_at_field(verbose_name='زمان محاسبه')

    class Meta:
        verbose_name        = 'تحلیل ظرفیت'
        verbose_name_plural = 'تحلیل‌های ظرفیت'
        ordering            = ['-calculated_at']

    def __str__(self):
        return f'{self.kitchen_product.name} — max: {self.max_production_quantity}'


class ProductionLog(TenantModel):
    ACTION_CHOICES = [
        ('produce',      'تولید'),
        ('plan_create',  'ایجاد برنامه'),
        ('plan_approve', 'تأیید برنامه'),
        ('plan_execute', 'اجرای برنامه'),
        ('adjust',       'اصلاح موجودی'),
    ]

    user               = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='production_logs', verbose_name='کاربر')
    kitchen_product    = models.ForeignKey(KitchenProduct, on_delete=models.SET_NULL, null=True, blank=True, related_name='logs', verbose_name='محصول')
    action             = models.CharField(max_length=20, choices=ACTION_CHOICES, default='produce', verbose_name='عملیات')
    quantity           = models.PositiveIntegerField(default=0, verbose_name='تعداد')
    materials_consumed = models.JSONField(default=list, blank=True, verbose_name='مواد مصرفی', encoder=DecimalSafeEncoder)
    production_batch   = models.ForeignKey(ProductionBatch, on_delete=models.SET_NULL, null=True, blank=True, related_name='logs', verbose_name='دسته تولید')
    details            = description_field(verbose_name='جزئیات')
    created_at         = created_at_field(verbose_name='زمان')

    class Meta:
        verbose_name        = 'لاگ تولید'
        verbose_name_plural = 'لاگ‌های تولید'
        ordering            = ['-created_at']

    def __str__(self):
        product_name = self.kitchen_product.name if self.kitchen_product else '—'
        return f'{self.get_action_display()} — {product_name}'


class WasteLog(TenantModel):
    kitchen_product = models.ForeignKey(
        KitchenProduct, on_delete=models.CASCADE,
        related_name='waste_logs', verbose_name='محصول آشپزخانه',
    )
    quantity   = models.PositiveIntegerField(verbose_name='تعداد')
    reason     = models.CharField(max_length=255, blank=True, verbose_name='دلیل')
    created_at = created_at_field()

    class Meta:
        ordering            = ['-created_at']
        verbose_name        = 'ضایعات'
        verbose_name_plural = 'ضایعات'

    def __str__(self):
        return f"{self.kitchen_product.name} × {self.quantity}"


# ─── 12. DAY CLOSE ───────────────────────


class DayCloseReport(TenantModel):
    date               = models.DateField(verbose_name='تاریخ')
    total_sales        = price_field(max_digits=14, verbose_name='فروش کل')
    total_cost         = price_field(max_digits=14, verbose_name='هزینه کل')
    total_profit       = price_field(max_digits=14, verbose_name='سود خالص')
    order_count        = models.IntegerField(default=0, verbose_name='تعداد سفارش')
    delivered_count    = models.IntegerField(default=0, verbose_name='تحویل شده')
    waste_count        = models.IntegerField(default=0, verbose_name='تعداد ضایعات')
    waste_value        = price_field(max_digits=14, verbose_name='ارزش ضایعات')
    discount_total     = price_field(max_digits=14, verbose_name='کل تخفیف')
    inventory_snapshot = models.JSONField(default=dict, verbose_name='عکس موجودی', encoder=DecimalSafeEncoder)
    items_detail       = models.JSONField(default=list, verbose_name='جزئیات آیتم‌ها', encoder=DecimalSafeEncoder)
    top_items          = models.JSONField(default=list, verbose_name='پرفروش‌ترین‌ها', encoder=DecimalSafeEncoder)
    closed_by          = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='closed_reports', verbose_name='بسته شده توسط')
    closed_at          = created_at_field(verbose_name='زمان بستن')

    class Meta:
        verbose_name        = 'گزارش بستن روز'
        verbose_name_plural = 'گزارش‌های بستن روز'
        ordering            = ['-date']
        indexes = [
            models.Index(fields=['restaurant', '-date']),  
        ]

    def __str__(self):
        return f'گزارش {self.date} — {self.total_sales:,} تومان'


class DayCloseLog(TenantModel):
    ACTION_CHOICES = [
        ('close',  'بستن روز'),
        ('reopen', 'باز کردن مجدد'),
    ]

    date       = models.DateField(verbose_name='تاریخ')
    action     = models.CharField(max_length=20, choices=ACTION_CHOICES, verbose_name='عملیات')
    user       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='day_logs', verbose_name='کاربر')
    details    = models.JSONField(default=dict, verbose_name='جزئیات', encoder=DecimalSafeEncoder)
    created_at = created_at_field(verbose_name='زمان')

    class Meta:
        verbose_name        = 'لاگ بستن روز'
        verbose_name_plural = 'لاگ‌های بستن روز'
        ordering            = ['-created_at']

    def __str__(self):
        return f'{self.get_action_display()} — {self.date} — {self.user}'
    
# ─── 13. ITEM DICTIONARY ──────────────────


class ItemDictionary(TenantModel):
    CATEGORY_CHOICES = [
        ('raw_material',   'ماده اولیه'),
        ('semi_finished',  'نیمه‌آماده'),
        ('ready_material', 'ماده آماده'),
        ('final_product',  'محصول نهایی'),
    ]

    name        = name_field(verbose_name='نام')
    unit        = unit_field()
    description = description_field()
    category    = models.CharField(max_length=20, choices=CATEGORY_CHOICES, verbose_name='دسته‌بندی', db_index=True)
    is_active   = is_active_field()
    created_at  = created_at_field()

    class Meta:
        verbose_name        = 'دیکشنری آیتم'
        verbose_name_plural = 'دیکشنری آیتم‌ها'
        unique_together     = ['restaurant', 'name', 'category']
        ordering            = ['category', 'name']

    def __str__(self):
        return f'{self.name} ({self.get_category_display()})'