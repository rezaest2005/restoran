"""
سیستم نقش‌های کاربری کسب‌وکار
==============================
Owner    → مالک — دسترسی کامل
Manager  → مدیر — همه بخش‌ها منهای تنظیمات مالی
Cashier  → صندوقدار — POS + فاکتور + سفارشات
Kitchen  → خط تولید — تولید + موجودی + ضایعات
Waiter   → گارسون — ثبت سفارش + مشاهده وضعیت
Transport→ حمل‌ونقل — پیک سفارش‌ها و راننده‌ی بار/محصول (فقط برنامه‌ی راننده)
Customer → مشتری — فقط مشاهده منو و باشگاه
"""

# ═══ نقش‌ها ═══

ROLE_OWNER    = "owner"
ROLE_MANAGER  = "manager"
ROLE_CASHIER  = "cashier"
ROLE_KITCHEN  = "kitchen"
ROLE_WAITER   = "waiter"
ROLE_CUSTOMER = "customer"
ROLE_WAREHOUSE = "warehouse"
ROLE_TRANSPORT = "transport"  # one role for everyone who moves things: order couriers AND cargo/unit drivers
ROLE_OTHER = "other"        # any custom job title: the owner ticks exactly the tabs it needs

# Legacy names of the transport role. The API still accepts them and stores ROLE_TRANSPORT.
ROLE_DRIVER = "driver"
ROLE_COURIER = "courier"
ROLE_ALIASES = {ROLE_DRIVER: ROLE_TRANSPORT, ROLE_COURIER: ROLE_TRANSPORT}


def normalize_role(role):
    """Map legacy role names (driver / courier) to the current one; other values unchanged."""
    role = (role or "").strip() if isinstance(role, str) else role
    return ROLE_ALIASES.get(role, role)


def is_transport_role(role) -> bool:
    return normalize_role(role) == ROLE_TRANSPORT

ROLE_CHOICES = [
    (ROLE_OWNER,    "مالک"),
    (ROLE_MANAGER,  "مدیر"),
    (ROLE_CASHIER,  "صندوقدار"),
    (ROLE_KITCHEN,  "خط تولید"),
    (ROLE_WAITER,   "گارسون"),
    (ROLE_WAREHOUSE, "انباردار"),
    (ROLE_TRANSPORT, "حمل‌ونقل (راننده / پیک)"),
    (ROLE_CUSTOMER, "مشتری"),
    (ROLE_OTHER,    "سایر"),
]


# ═══ ماتریس مجوزها — هر نقش چه کارهایی می‌تونه بکنه ═══

ROLE_PERMISSIONS = {
    ROLE_OWNER: [
        "pos.access", "pos.create_order", "pos.close_day", "pos.daily_report",
        "pos.validate_coupon", "pos.register_waste",
        "orders.view", "orders.change_status", "orders.send_to_kitchen",
        "kitchen.view", "kitchen.produce", "kitchen.plans", "kitchen.discounts",
        "kitchen.waste", "kitchen.inventory",
        "inventory.view", "inventory.edit", "inventory.purchase_invoice",
        "inventory.raw_materials", "inventory.semi_finished",
        "inventory.ready_materials", "inventory.usage_log",
        "foods.view", "foods.edit", "foods.categories",
        "recipes.view", "recipes.edit",
        "suppliers.view", "suppliers.edit",
        "users.view", "users.edit", "users.create", "users.delete",
        "reports.view", "reports.close_history",
        "settings.manage",
    ],
    ROLE_MANAGER: [
        "pos.access", "pos.create_order", "pos.close_day", "pos.daily_report",
        "pos.validate_coupon", "pos.register_waste",
        "orders.view", "orders.change_status", "orders.send_to_kitchen",
        "kitchen.view", "kitchen.produce", "kitchen.plans", "kitchen.discounts",
        "kitchen.waste", "kitchen.inventory",
        "inventory.view", "inventory.edit", "inventory.purchase_invoice",
        "inventory.raw_materials", "inventory.semi_finished",
        "inventory.ready_materials", "inventory.usage_log",
        "foods.view", "foods.edit", "foods.categories",
        "recipes.view", "recipes.edit",
        "suppliers.view", "suppliers.edit",
        "users.view",
        "reports.view", "reports.close_history",
    ],
    ROLE_CASHIER: [
        "pos.access", "pos.create_order", "pos.daily_report",
        "pos.validate_coupon",
        "orders.view", "orders.change_status",
        "inventory.view",
        "foods.view",
        "reports.view",
    ],
    ROLE_KITCHEN: [
        "kitchen.view", "kitchen.produce", "kitchen.plans",
        "kitchen.waste", "kitchen.inventory",
        "inventory.view", "inventory.usage_log",
        "recipes.view",
        "orders.view", "orders.send_to_kitchen",
    ],
    ROLE_WAITER: [
        "pos.access", "pos.create_order",
        "orders.view", "orders.change_status",
        "foods.view",
    ],
    ROLE_WAREHOUSE: [
        "inventory.view", "inventory.edit", "inventory.usage_log",
        "suppliers.view", "recipes.view", "foods.view",
    ],
    ROLE_TRANSPORT: [],
    ROLE_CUSTOMER: [
        "foods.view",
    ],
}


# ═══ توابع کمکی ═══

def get_user_role(user) -> str:
    """نقش کاربر رو برمی‌گردونه."""
    if user.is_superuser:
        return ROLE_OWNER
    if hasattr(user, "role") and user.role:
        return normalize_role(user.role)
    return ""


def has_permission(user, permission: str) -> bool:
    """آیا کاربر این مجوز رو داره؟"""
    if user.is_superuser:
        return True
    role = get_user_role(user)
    allowed = ROLE_PERMISSIONS.get(role, [])
    return permission in allowed


def get_user_permissions(user) -> list:
    """لیست همه مجوزهای کاربر."""
    if user.is_superuser:
        all_perms = set()
        for perms in ROLE_PERMISSIONS.values():
            all_perms.update(perms)
        return sorted(all_perms)
    role = get_user_role(user)
    return ROLE_PERMISSIONS.get(role, [])


def get_role_display(user) -> str:
    """نام فارسی نقش کاربر."""
    role = get_user_role(user)
    display_map = dict(ROLE_CHOICES)
    return display_map.get(role, "نامشخص")


# ═══ دکوراتور برای ویوها ═══

from functools import wraps
from django.http import JsonResponse
from django.shortcuts import redirect


def require_permission(permission: str):
    """
    دکوراتور: فقط کاربرانی با این مجوز می‌تونن ویو رو ببینن.
    استفاده:
        @require_permission("pos.access")
        def pos_page(request):
            ...
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                if request.headers.get("Accept") == "application/json":
                    return JsonResponse({"error": "ابتدا وارد شوید."}, status=401)
                return redirect("/auth/")

            if not has_permission(request.user, permission):
                if request.headers.get("Accept") == "application/json":
                    return JsonResponse({"error": "شما دسترسی ندارید."}, status=403)
                return redirect("/?error=access_denied")

            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator

def business_has_owner(business, exclude_pk=None) -> bool:
    """True if the business already has an owner account (super admins don't count).

    A business has exactly one owner: the person who bought the account.
    """
    if business is None:
        return False
    from .models import User
    qs = User.objects.filter(business=business, role=ROLE_OWNER, is_superuser=False)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    return qs.exists()


OWNER_EXISTS_MSG = "این کسب‌وکار از قبل یک مالک دارد. نقش مالک فقط برای خریدار حساب است؛ برای همکار از نقش «مدیر» استفاده کنید."
