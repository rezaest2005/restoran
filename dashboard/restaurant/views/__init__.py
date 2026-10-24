"""
Restaurant Views Package — Re-export everything.
★ نسخه v10 — cleanup: حذف مدل‌های بلااستفاده
"""

# ── Super Admin ──
from .super_admin import (
    super_admin_auth_page,
    super_admin_page,
    super_admin_login_api,
    super_admin_logout_api,
    super_stats_api,
    super_tenants_api,
    super_tenant_detail_api,
    super_users_api,
    super_user_create_api,
    super_user_detail_api,
    super_user_permissions_api,
    IsSuperAdmin,
)

# ── Auth ──
from .auth import (
    LoginView,
    RefreshView,
    RegisterView,
    LogoutView,
    CurrentUserView,
    ChangePasswordView,
    ResetPasswordView,
    UserListView,
    UserDetailView,
    SetSessionView,
)

# ── Orders ──
from .orders import (
    order_change_status,
    order_list_api,
)

# ── POS ──
from .pos import (
    pos_create_order,
    pos_daily_report,
    pos_daily_orders,
    public_menu_api,
)

# ── Users ──
from .users import (
    user_management_api,
    create_user_api,
    user_update_role,
    user_toggle_active,
    admin_reset_password,
    user_delete,
)

# ── Inventory ──
from .inventory import (
    item_movement_report,
    stock_value_report,
    inventory_dashboard,
)

# ── Warehouse ──
from .warehouse import (
    raw_material_save,
    raw_material_delete,
    raw_material_suggestions,
    supplier_list,
    supplier_save,
    supplier_delete,
    warehouse_json,
)

# ── Page Views (HTML) ──
from .restaurant_page_views import (
    root_redirect,
    home,
    auth_page,
    logout_page,
    redirect_to_dashboard,
    orders_dashboard,
    user_management_page,
)


__all__ = [
    # Super Admin
    "super_admin_auth_page",
    "super_admin_page",
    "super_admin_login_api",
    "super_admin_logout_api",
    "super_stats_api",
    "super_tenants_api",
    "super_tenant_detail_api",
    "super_users_api",
    "super_user_create_api",
    "super_user_detail_api",
    "super_user_permissions_api",
    "IsSuperAdmin",
    # Auth
    "LoginView",
    "RefreshView",
    "RegisterView",
    "LogoutView",
    "CurrentUserView",
    "ChangePasswordView",
    "ResetPasswordView",
    "UserListView",
    "UserDetailView",
    "SetSessionView",
    # Orders
    "order_change_status",
    "order_list_api",
    # POS
    "pos_create_order",
    "pos_daily_report",
    "pos_daily_orders",
    "public_menu_api",
    # Users
    "user_management_api",
    "create_user_api",
    "user_update_role",
    "user_toggle_active",
    "admin_reset_password",
    "user_delete",
    # Inventory
    "item_movement_report",
    "stock_value_report",
    "inventory_dashboard",
    # Warehouse
    "raw_material_save",
    "raw_material_delete",
    "raw_material_suggestions",
    "supplier_list",
    "supplier_save",
    "supplier_delete",
    "warehouse_json",
    # Page Views
    "root_redirect",
    "home",
    "auth_page",
    "logout_page",
    "redirect_to_dashboard",
    "orders_dashboard",
    "user_management_page",
]