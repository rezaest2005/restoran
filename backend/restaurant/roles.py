"""
سیستم نقش‌های کاربری رستوران
==============================
Owner    → مالک — دسترسی کامل
Manager  → مدیر — همه بخش‌ها منهای تنظیمات مالی
Cashier  → صندوقدار — POS + فاکتور + سفارشات
Kitchen  → آشپزخانه — تولید + موجودی + ضایعات
Waiter   → گارسون — ثبت سفارش + مشاهده وضعیت
Customer → مشتری — فقط مشاهده منو و باشگاه
"""

# ═══ نقش‌ها ═══

ROLE_OWNER    = "owner"
ROLE_MANAGER  = "manager"
ROLE_CASHIER  = "cashier"
ROLE_KITCHEN  = "kitchen"
ROLE_WAITER   = "waiter"
ROLE_CUSTOMER = "customer"

ROLE_CHOICES = [
    (ROLE_OWNER,    "مالک"),
    (ROLE_MANAGER,  "مدیر"),
    (ROLE_CASHIER,  "صندوقدار"),
    (ROLE_KITCHEN,  "آشپزخانه"),
    (ROLE_WAITER,   "گارسون"),
    (ROLE_CUSTOMER, "مشتری"),
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
        "loyalty.view", "loyalty.customers", "loyalty.coupons",
        "loyalty.rewards", "loyalty.notifications",
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
        "loyalty.view", "loyalty.customers", "loyalty.coupons",
        "loyalty.rewards", "loyalty.notifications",
        "users.view",
        "reports.view", "reports.close_history",
    ],
    ROLE_CASHIER: [
        "pos.access", "pos.create_order", "pos.daily_report",
        "pos.validate_coupon",
        "orders.view", "orders.change_status",
        "loyalty.view", "loyalty.customers",
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
    ROLE_CUSTOMER: [
        "foods.view",
        "loyalty.view",
    ],
}


# ═══ توابع کمکی ═══

def get_user_role(user) -> str:
    """نقش کاربر رو برمی‌گردونه."""
    if user.is_superuser:
        return ROLE_OWNER
    if hasattr(user, "role") and user.role:
        return user.role
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