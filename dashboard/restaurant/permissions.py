"""
Restaurant Management — Custom Permissions
"""
from rest_framework.permissions import BasePermission


class IsOwner(BasePermission):
    """Allow only users with role='owner'."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) == 'owner'
        )


class IsManager(BasePermission):
    """Allow only users with role='manager'."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) == 'manager'
        )


class IsKitchenStaff(BasePermission):
    """Allow only users with role='kitchen_staff'."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) == 'kitchen_staff'
        )


class IsWarehouseStaff(BasePermission):
    """Allow only users with role='warehouse_staff'."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) == 'warehouse_staff'
        )


class IsOwnerOrManager(BasePermission):
    """Allow owner or manager."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) in ('owner', 'manager')
        )


class IsOwnerOrManagerOrKitchenStaff(BasePermission):
    """
    Owner / Manager / Kitchen Staff can execute production.
    This is the main permission for kitchen operations.
    """
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) in (
                'owner', 'manager', 'kitchen_staff','staff',
            )
        )


class IsOwnerOrManagerOrWarehouseStaff(BasePermission):
    """Owner / Manager / Warehouse Staff can manage inventory."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) in (
                'owner', 'manager', 'warehouse_staff',
            )
        )

class IsOwnerOrWarehouse(BasePermission):
    """Allow owner or warehouse_staff."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) in ('owner', 'warehouse_staff')
        )


class IsStaffRole(BasePermission):
    """Allow any authenticated staff role."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) in (
                'owner', 'manager', 'kitchen_staff', 'warehouse_staff', 'staff',
            )
        )

