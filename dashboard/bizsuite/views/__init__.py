"""
Business Views Package — Re-export everything.
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
from .qr_order import qr_order_submit
from .accounting import (
    accounts,
    account_detail,
    cost_centers,
    journal,
    journal_detail,
    journal_reverse,
    report_trial_balance,
    report_ledger,
    report_income_statement,
    report_balance_sheet,
    accounting_summary,
)
from .club import (
    club_settings,
    club_members,
    club_member_detail,
    club_member_adjust,
    club_lookup,
    club_redeem,
)
from .production import (
    formulas,
    production_materials,
    formula_detail,
    production_orders,
    production_order_detail,
    production_order_start,
    production_order_complete,
    production_order_cancel,
)
from .pos import (
    pos_create_order,
    pos_daily_report,
    pos_daily_orders,
    pos_close_all_pending,
    pos_update_food_price,
    pos_online_orders,
    pos_reject_online_order,
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
    user_tabs_api, 
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
from .business_page_views import (
    root_redirect,
    home,
    auth_page,
    logout_page,
    redirect_to_dashboard,
    orders_dashboard,
    user_management_page,
)

# ── Feedback ──
from .feedback import (
    feedback_submit,
    feedback_list,
    feedback_update,
    feedback_page,
    feedback_form,
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
    "pos_close_all_pending",
    "pos_update_food_price",
    "pos_online_orders",
    "pos_reject_online_order",
    "public_menu_api",
    "qr_order_submit",
    "club_settings",
    "club_members",
    "club_member_detail",
    "club_member_adjust",
    "club_lookup",
    "club_redeem",
    "formulas",
    "production_materials",
    "formula_detail",
    "production_orders",
    "production_order_detail",
    "production_order_start",
    "production_order_complete",
    "production_order_cancel",
    # Users
    "user_management_api",
    "create_user_api",
    "user_update_role",
    "user_toggle_active",
    "admin_reset_password",
    "user_delete",
    "user_tabs_api",
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
    # Feedback
    "feedback_submit",
    "feedback_list",
    "feedback_update",
    "feedback_page",
    "feedback_form",
    # Accounting
    "accounts",
    "account_detail",
    "cost_centers",
    "journal",
    "journal_detail",
    "journal_reverse",
    "report_trial_balance",
    "report_ledger",
    "report_income_statement",
    "report_balance_sheet",
    "accounting_summary",
]