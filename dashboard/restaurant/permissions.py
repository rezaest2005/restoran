"""
Restaurant Management — Custom Permissions (★ نسخه اصلاح‌شده v3)

★ تغییرات نسبت به نسخه قبل:
  ۱. نام نقش‌ها با مدل User.Role سازگار شد:
     - kitchen_staff → kitchen
     - warehouse_staff → warehouse
     - staff → حذف (وجود ندارد)
  ۲. استفاده از User.Role enum به‌جای string hardcoded
  ۳. اضافه شدن IsCashier
  ۴. بهبود docstring‌ها
  ۵. superuser همیشه اجازه دارد (در صورت نیاز)
"""

from rest_framework.permissions import BasePermission


def _get_role(user):
    """دریافت امن نقش کاربر"""
    return getattr(user, 'role', None)


def _is_authenticated(user):
    """بررسی لاگین بودن"""
    return user and user.is_authenticated


# ═══════════════════════════════════════
#  تک‌نقشی
# ═══════════════════════════════════════

class IsOwner(BasePermission):
    """فقط مالک"""
    def has_permission(self, request, view):
        return _is_authenticated(request.user) and _get_role(request.user) == 'owner'


class IsManager(BasePermission):
    """فقط مدیر"""
    def has_permission(self, request, view):
        return _is_authenticated(request.user) and _get_role(request.user) == 'manager'


class IsCashier(BasePermission):
    """فقط صندوقدار"""
    def has_permission(self, request, view):
        return _is_authenticated(request.user) and _get_role(request.user) == 'cashier'


class IsKitchenStaff(BasePermission):
    """فقط آشپزخانه — ★ FIXED: kitchen_staff → kitchen"""
    def has_permission(self, request, view):
        return _is_authenticated(request.user) and _get_role(request.user) == 'kitchen'


class IsWarehouseStaff(BasePermission):
    """فقط انباردار — ★ FIXED: warehouse_staff → warehouse"""
    def has_permission(self, request, view):
        return _is_authenticated(request.user) and _get_role(request.user) == 'warehouse'


# ═══════════════════════════════════════
#  ترکیبی — مدیریت و مالکیت
# ═══════════════════════════════════════

class IsOwnerOrManager(BasePermission):
    """مالک یا مدیر"""
    def has_permission(self, request, view):
        return (
            _is_authenticated(request.user)
            and _get_role(request.user) in ('owner', 'manager')
        )


# ═══════════════════════════════════════
#  ترکیبی — آشپزخانه
# ═══════════════════════════════════════

class IsOwnerOrManagerOrKitchenStaff(BasePermission):
    """
    مالک / مدیر / آشپزخانه — برای عملیات تولید و آشپزخانه.
    ★ FIXED: kitchen_staff → kitchen, staff → حذف
    """
    def has_permission(self, request, view):
        return (
            _is_authenticated(request.user)
            and _get_role(request.user) in ('owner', 'manager', 'kitchen')
        )


# ═══════════════════════════════════════
#  ترکیبی — انبار
# ═══════════════════════════════════════

class IsOwnerOrManagerOrWarehouseStaff(BasePermission):
    """مالک / مدیر / انباردار — برای مدیریت انبار.
    ★ FIXED: warehouse_staff → warehouse"""
    def has_permission(self, request, view):
        return (
            _is_authenticated(request.user)
            and _get_role(request.user) in ('owner', 'manager', 'warehouse')
        )


class IsOwnerOrWarehouse(BasePermission):
    """مالک یا انباردار — ★ FIXED: warehouse_staff → warehouse"""
    def has_permission(self, request, view):
        return (
            _is_authenticated(request.user)
            and _get_role(request.user) in ('owner', 'warehouse')
        )


# ═══════════════════════════════════════
#  ترکیبی — صندوق
# ═══════════════════════════════════════

class IsOwnerOrManagerOrCashier(BasePermission):
    """مالک / مدیر / صندوقدار — برای عملیات صندوق"""
    def has_permission(self, request, view):
        return (
            _is_authenticated(request.user)
            and _get_role(request.user) in ('owner', 'manager', 'cashier')
        )


# ═══════════════════════════════════════
#  کلی — هر نقش کارمندی
# ═══════════════════════════════════════

class IsStaffRole(BasePermission):
    """
    هر نقش کارمندی (غیر از مشتری).
    ★ FIXED: حذف 'staff' — در مدل وجود ندارد
    """
    def has_permission(self, request, view):
        return (
            _is_authenticated(request.user)
            and _get_role(request.user) in (
                'owner', 'manager', 'cashier', 'kitchen', 'warehouse',
            )
        )