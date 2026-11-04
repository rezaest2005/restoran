"""
Business Management System — URLs (★ نسخه v12 — session-check)
"""
from django.urls import path
from django.http import JsonResponse
from . import views
from .views import system as system_views
from .views.dashboard import dashboard_analytics

# ─── Invoicing ──────────────────────────
from .views.invoicing import (
    customer_list_create,
    customer_detail,
    sales_invoice_list_create,
    sales_invoice_detail,
    sales_return_list_create,
    sales_return_delete,
    purchase_return_list_create,
    purchase_return_delete,
    expense_list_create,
    expense_delete,
    profit_report,
)

# ─── Session Check (★ جدید) ─────────────
from .views.inventory import (
    warehouse_list, warehouse_save, warehouse_delete,
    stock_list, stock_minimum_update,
    receiving_create, issue_create, waste_create, adjustment_create, transfer_create,
    movement_list, purchase_suggestions, warehouse_movements,
)
from .views.warehouse import raw_material_list_api
from .views.auth import SessionCheckView          # ★ اضافه شد


# ═══════════════════════════════════════
#  Helper: ثبت امن URL — اگه ویو نبود، کرش نکن
# ═══════════════════════════════════════

def _missing_view(request, *args, **kwargs):
    return JsonResponse(
        {"success": False, "error": "این سرویس فعلاً در دسترس نیست."},
        status=501,
    )


def _get_view(name):
    """دریافت ویو از views — اگه نبود، placeholder برمیگردونه"""
    return getattr(views, name, _missing_view)


urlpatterns = [
    path("api/app/info/", system_views.app_info, name="app_info"),
    path("api/health/", system_views.health, name="health"),
    path("", views.root_redirect, name="root_redirect"),

    # ── Authentication ──────────────────────────────────────
    path("api/auth/login/", views.LoginView.as_view(), name="login"),
    path("api/auth/refresh/", views.RefreshView.as_view(), name="refresh"),
    path("api/auth/register/", views.RegisterView.as_view(), name="register"),
    path("api/auth/logout/", views.LogoutView.as_view(), name="logout"),
    path("api/auth/me/", views.CurrentUserView.as_view(), name="current_user"),
    path("api/auth/change-password/", views.ChangePasswordView.as_view(), name="change_password"),
    path("api/auth/reset-password/", views.ResetPasswordView.as_view(), name="reset_password"),
    path("api/auth/users/", views.UserListView.as_view(), name="user_list"),
    path("api/auth/users/<int:pk>/", views.UserDetailView.as_view(), name="user_detail"),
    path("api/auth/set-session/", views.SetSessionView.as_view(), name="set_session"),
    path("api/auth/session-check/", SessionCheckView.as_view(), name="session_check"),  # ★ اضافه شد

    # ── User Management ─────────────────────────────────────
    path("users/", views.user_management_page, name="user_management"),
    path("api/users/management/", views.user_management_api, name="user_management_api"),
    path("api/users/create/", views.create_user_api, name="create_user_api"),
    path("api/users/update-role/", views.user_update_role, name="user_update_role"),
    path("api/users/reset-password/", views.admin_reset_password, name="admin_reset_password"),
    path("api/users/toggle-active/", views.user_toggle_active, name="user_toggle_active"),
    path("api/users/delete/", views.user_delete, name="user_delete"),
    path("api/users/tabs/", views.user_tabs_api, name="user_tabs_api"),

    # ── Raw Materials & Suppliers ───────────────────────────
    path("api/raw-materials/", raw_material_list_api, name="raw_material_list"),
    path("api/raw-materials/save/", views.raw_material_save, name="raw_material_save"),
    path("api/raw-materials/delete/", views.raw_material_delete, name="raw_material_delete"),
    path("api/raw-materials/suggestions/", views.raw_material_suggestions, name="raw_material_suggestions"),
    path("api/suppliers/", views.supplier_list, name="supplier_list"),
    path("api/suppliers/save/", views.supplier_save, name="supplier_save"),
    path("api/suppliers/delete/", views.supplier_delete, name="supplier_delete"),
    path("api/warehouse-json/", views.warehouse_json, name="warehouse-json"),

    # ── Inventory Reports ───────────────────────────────────
    path("api/inventory/reports/item-movement/", views.item_movement_report, name="inv_item_movement_report"),
    path("api/inventory/reports/stock-value/", views.stock_value_report, name="inv_stock_value_report"),
    path("api/inventory/dashboard/", views.inventory_dashboard, name="inv_dashboard"),
    path("api/inventory/reports/warehouse-movements/", warehouse_movements, name="inv_warehouse_movements"),

    # ── Inventory Operations ────────────────────────────────
    path("api/inventory/warehouses/", warehouse_list, name="inv_warehouses"),
    path("api/inventory/warehouses/save/", warehouse_save, name="inv_warehouse_save"),
    path("api/inventory/warehouses/delete/", warehouse_delete, name="inv_warehouse_delete"),
    path("api/inventory/stock/", stock_list, name="inv_stock"),
    path("api/inventory/stock/minimum/", stock_minimum_update, name="inv_stock_minimum"),
    path("api/inventory/receive/", receiving_create, name="inv_receive"),
    path("api/inventory/issue/", issue_create, name="inv_issue"),
    path("api/inventory/waste/", waste_create, name="inv_waste"),
    path("api/inventory/adjust/", adjustment_create, name="inv_adjust"),
    path("api/inventory/transfer/", transfer_create, name="inv_transfer"),
    path("api/inventory/movements/", movement_list, name="inv_movements"),
    path("api/inventory/purchase-suggestions/", purchase_suggestions, name="inv_purchase_suggestions"),

    # ── Dashboard Analytics ─────────────────────────────────
    path("api/dashboard/analytics/", dashboard_analytics, name="dashboard_analytics"),

    # ── POS ─────────────────────────────────────────────────
    path("api/pos/create-order/", _get_view("pos_create_order"), name="pos_create_order"),
    path("api/pos/daily-report/", _get_view("pos_daily_report"), name="pos_daily_report"),
    path("api/pos/daily-orders/", _get_view("pos_daily_orders"), name="pos-daily-orders"),
    path("api/pos/close-pending/", _get_view("pos_close_all_pending"), name="pos_close_all_pending"),
    path("api/pos/update-food-price/", _get_view("pos_update_food_price"), name="pos_update_food_price"),
    path("api/pos/online-orders/", _get_view("pos_online_orders"), name="pos_online_orders"),
    path("api/pos/online-orders/<int:order_id>/reject/", _get_view("pos_reject_online_order"), name="pos_reject_online_order"),
    path("api/menu/public/", _get_view("public_menu_api"), name="public_menu_api"),
    path("api/menu/order/", _get_view("qr_order_submit"), name="qr_order_submit"),


    # ── فرمولاسیون و خط تولید ───────────────────────────────
    path("api/production/materials/", views.production_materials, name="production_materials"),
    path("api/formulas/", views.formulas, name="formulas"),
    path("api/formulas/<int:pk>/", views.formula_detail, name="formula_detail"),
    path("api/production/orders/", views.production_orders, name="production_orders"),
    path("api/production/orders/<int:pk>/", views.production_order_detail, name="production_order_detail"),
    path("api/production/orders/<int:pk>/start/", views.production_order_start, name="production_order_start"),
    path("api/production/orders/<int:pk>/complete/", views.production_order_complete, name="production_order_complete"),
    path("api/production/orders/<int:pk>/cancel/", views.production_order_cancel, name="production_order_cancel"),


    # ── باشگاه مشتریان ──────────────────────────────────────
    path("api/club/settings/", views.club_settings, name="club_settings"),
    path("api/club/members/", views.club_members, name="club_members"),
    path("api/club/members/<int:pk>/", views.club_member_detail, name="club_member_detail"),
    path("api/club/members/<int:pk>/adjust/", views.club_member_adjust, name="club_member_adjust"),
    path("api/club/lookup/", views.club_lookup, name="club_lookup"),
    path("api/club/redeem/", views.club_redeem, name="club_redeem"),

    # ── حسابداری ────────────────────────────────────────────
    path("api/accounting/accounts/", views.accounts, name="accounting_accounts"),
    path("api/accounting/accounts/<int:pk>/", views.account_detail, name="accounting_account_detail"),
    path("api/accounting/cost-centers/", views.cost_centers, name="accounting_cost_centers"),
    path("api/accounting/journal/", views.journal, name="accounting_journal"),
    path("api/accounting/journal/<int:pk>/", views.journal_detail, name="accounting_journal_detail"),
    path("api/accounting/journal/<int:pk>/reverse/", views.journal_reverse, name="accounting_journal_reverse"),
    path("api/accounting/reports/trial-balance/", views.report_trial_balance, name="accounting_trial_balance"),
    path("api/accounting/reports/ledger/", views.report_ledger, name="accounting_ledger"),
    path("api/accounting/reports/income-statement/", views.report_income_statement, name="accounting_income_statement"),
    path("api/accounting/reports/balance-sheet/", views.report_balance_sheet, name="accounting_balance_sheet"),
    path("api/accounting/summary/", views.accounting_summary, name="accounting_summary"),

    # ── Orders ──────────────────────────────────────────────
    path("api/orders/list/", _get_view("order_list_api"), name="order_list_api"),
    path("api/orders/<int:pk>/status/", _get_view("order_change_status"), name="order_change_status"),

    # ── Super Admin ─────────────────────────────────────────
    path("api/super/login/", views.super_admin_login_api, name="super_admin_login_api"),
    path("api/super/logout/", views.super_admin_logout_api, name="super_admin_logout_api"),
    path("api/super/stats/", views.super_stats_api, name="super_stats_api"),
    path("api/super/tenants/", views.super_tenants_api, name="super_tenants_api"),
    path("api/super/tenants/<int:pk>/", views.super_tenant_detail_api, name="super_tenant_detail_api"),
    path("api/super/users/", views.super_users_api, name="super_users_api"),
    path("api/super/users/create/", views.super_user_create_api, name="super_user_create"),
    path("api/super/users/<int:pk>/", views.super_user_detail_api, name="super_user_detail"),
    path("api/super/users/<int:pk>/permissions/", views.super_user_permissions_api, name="super_user_permissions"),

    # ── Invoicing API ───────────────────────────────────────
    path("api/invoicing/customers/", customer_list_create, name="inv_customers"),
    path("api/invoicing/customers/<int:pk>/", customer_detail, name="inv_customer_detail"),
    path("api/invoicing/sales/", sales_invoice_list_create, name="inv_sales"),
    path("api/invoicing/sales/<int:pk>/", sales_invoice_detail, name="inv_sales_detail"),
    path("api/invoicing/sales-returns/", sales_return_list_create, name="inv_sales_returns"),
    path("api/invoicing/sales-returns/<int:pk>/", sales_return_delete, name="inv_sales_return_delete"),
    path("api/invoicing/purchase-returns/", purchase_return_list_create, name="inv_purchase_returns"),
    path("api/invoicing/purchase-returns/<int:pk>/", purchase_return_delete, name="inv_purchase_return_delete"),
    path("api/invoicing/expenses/", expense_list_create, name="inv_expenses"),
    path("api/invoicing/expenses/<int:pk>/", expense_delete, name="inv_expense_delete"),
    path("api/invoicing/profit-report/", profit_report, name="inv_profit_report"),

    # ── Feedback (ثبت نظرات) ────────────────────────────────
    path("api/feedback/submit/", views.feedback_submit, name="feedback_submit"),
    path("api/feedback/list/", views.feedback_list, name="feedback_list"),
    path("api/feedback/<int:pk>/update/", views.feedback_update, name="feedback_update"),
    path("feedback/<slug:slug>/", views.feedback_form, name="feedback_form"),

    # ── HTML Pages ──────────────────────────────────────────
    path("dashboard/", views.auth_page, name="auth_page"),
    path("dashboard/auth/", views.redirect_to_dashboard, name="auth_redirect"),
    path("dashboard/app/", views.home, name="dashboard_app"),
    path("dashboard/logout/", views.logout_page, name="logout_page"),
    path("dashboard/super/auth/", views.super_admin_auth_page, name="super_admin_auth"),
    path("dashboard/super/", views.super_admin_page, name="super_admin"),
    path("dashboard/orders/", views.orders_dashboard, name="orders_dashboard"),
    path("dashboard/feedback/", views.feedback_page, name="feedback_page"),
]