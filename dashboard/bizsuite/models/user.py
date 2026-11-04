"""Business models: user."""

from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models

from .common import created_at_field, updated_at_field
from .business import Business


# ═══════════════════════════════════════════
#  دسترسی‌های داشبورد
# ═══════════════════════════════════════════

DASHBOARD_SECTIONS = [
    ("pos", "صندوق فروش"),
    ("pos_report", "گزارش روز"),
    ("pos_settings", "تنظیمات صندوق"),
    ("orders", "سفارشات"),
    ("kitchen", "خط تولید"),
    ("recipes", "فرمولاسیون"),
    ("club", "باشگاه مشتریان"),
    ("accounting", "حسابداری"),
    ("delivery", "حمل و تحویل"),
    ("invoices", "فاکتور خرید"),
    ("raw_materials", "مواد اولیه"),
    ("semi_finished", "نیمه‌آماده"),
    ("ready_materials", "مواد آماده"),
    ("usage_log", "لاگ مصرف"),
    ("dictionary", "دیکشنری"),
    ("users", "مدیریت کاربران"),
    ("feedback", "ثبت نظرات"),
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


class User(AbstractUser):
    class Role(models.TextChoices):
        OWNER = "owner", "مالک"
        MANAGER = "manager", "مدیر"
        CASHIER = "cashier", "صندوقدار"
        KITCHEN = "kitchen", "خط تولید"
        WAREHOUSE = "warehouse", "انباردار"
        DRIVER = "driver", "راننده"
        CUSTOMER = "customer", "مشتری"

    phone_number = models.CharField(
        "شماره موبایل", max_length=11, unique=True, blank=True, null=True
    )
    role = models.CharField(
        "نقش", max_length=20, choices=Role.choices, default=Role.CUSTOMER, db_index=True
    )
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name="users",
        verbose_name="کسب‌وکار",
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

    # ★★★ فیلد جدید — دسترسی تب‌های سایدبار ★★★
    tabs = models.JSONField(
        "دسترسی تب‌ها",
        default=dict,
        blank=True,
        help_text='دیکشنری مثل {"pos": true, "inventory_invoice": false, ...}',
    )

    # ★★★ شمارنده لاگین‌های دمو ★★★
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

    def get_business_prefix(self):
        """پیشوند کسب‌وکار — حرف اول نام کاربری مالک"""
        if self.business and self.business.username_prefix:
            return self.business.username_prefix
        return ""
