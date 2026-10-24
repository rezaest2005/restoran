"""
Restaurant Management System — URLs (★ نسخه v11 — invoicing)
"""
from django.urls import path
from django.http import JsonResponse
from . import views
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

    # ── User Management ─────────────────────────────────────
    path("users/", views.user_management_page, name="user_management"),
    path("api/users/management/", views.user_management_api, name="user_management_api"),
    path("api/users/create/", views.create_user_api, name="create_user_api"),
    path("api/users/update-role/", views.user_update_role, name="user_update_role"),
    path("api/users/reset-password/", views.admin_reset_password, name="admin_reset_password"),
    path("api/users/toggle-active/", views.user_toggle_active, name="user_toggle_active"),
    path("api/users/delete/", views.user_delete, name="user_delete"),

    # ── Raw Materials & Suppliers ───────────────────────────
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

    # ── HTML Pages ──────────────────────────────────────────
    path("dashboard/", views.auth_page, name="auth_page"),
    path("dashboard/auth/", views.redirect_to_dashboard, name="auth_redirect"),
    path("dashboard/app/", views.home, name="dashboard_app"),
    path("dashboard/logout/", views.logout_page, name="logout_page"),
    path("dashboard/super/auth/", views.super_admin_auth_page, name="super_admin_auth"),
    path("dashboard/super/", views.super_admin_page, name="super_admin"),
    path("dashboard/orders/", views.orders_dashboard, name="orders_dashboard"),
]