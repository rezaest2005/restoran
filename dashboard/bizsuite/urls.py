"""
Business Management System — URLs (★ نسخه v12 — session-check)
"""
from django.urls import path, re_path
from django.http import JsonResponse
from . import views
from .views import system as system_views
from .views.dashboard import (
    dashboard_analytics, dashboard_summary,
)
from .views import storefront as sf_views
from .views import delivery as dl_views
from .views import catalog as cat_views
from .views import club as club_views
from .views import club_public as club_pub
from .views.super_admin import modules as mod_views
from .views.super_admin import qr as qr_super
from .views import qr_redirect as qr_public
from .views import accounting_auto as acc_auto
from .views import accounting_pro as acc_pro
from .views import business_settings
from .views import activity as activity_views
from .views.super_admin import support as sup_super
from .views import support as sup_views

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
    inventory_network, user_warehouse_access,
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
    path("api/users/transport/", views.transport_people, name="transport_people"),
    path("api/users/transport/<int:user_id>/", views.transport_person_detail, name="transport_person_detail"),

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
    path("api/inventory/network/", inventory_network, name="inv_network"),
    path("api/inventory/users/<int:user_id>/warehouses/", user_warehouse_access, name="inv_user_warehouses"),

    # ── Dashboard Analytics ─────────────────────────────────
    path("api/dashboard/analytics/", dashboard_analytics, name="dashboard_analytics"),
    path("api/dashboard/summary/", dashboard_summary, name="dashboard_summary"),

    # ── POS ─────────────────────────────────────────────────
    path("api/pos/create-order/", _get_view("pos_create_order"), name="pos_create_order"),
    path("api/pos/daily-report/", _get_view("pos_daily_report"), name="pos_daily_report"),
    path("api/pos/daily-orders/", _get_view("pos_daily_orders"), name="pos-daily-orders"),
    path("api/pos/day-summary/", _get_view("pos_day_summary"), name="pos_day_summary"),
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
    path("api/formulas/<int:pk>/analysis/", views.formula_analysis_view, name="formula_analysis"),
    path("api/formulas/parse-process/", views.formula_parse_process, name="formula_parse_process"),
    # ── Catalog (Definitions) ──
    path("api/catalog/categories/", cat_views.categories, name="catalog_categories"),
    path("api/catalog/categories/<int:pk>/", cat_views.category_detail, name="catalog_category_detail"),
    path("api/catalog/products/", cat_views.products, name="catalog_products"),
    path("api/catalog/products/<int:pk>/", cat_views.product_detail, name="catalog_product_detail"),
    path("api/catalog/products/<int:pk>/link-item/", cat_views.product_link_item, name="catalog_product_link"),
    path("api/catalog/items/", cat_views.items, name="catalog_items"),
    path("api/catalog/items/<int:pk>/", cat_views.item_detail, name="catalog_item_detail"),
    path("api/catalog/barcodes/generate/", cat_views.barcodes_generate, name="catalog_barcodes_generate"),
    path("api/catalog/barcodes/labels/", cat_views.barcodes_labels, name="catalog_barcodes_labels"),
    path("api/catalog/warehouses/<int:pk>/sales-default/", cat_views.warehouse_sales_default, name="catalog_wh_sales_default"),
    path("api/pos/barcode/<str:code>/", cat_views.pos_barcode_lookup, name="pos_barcode_lookup"),
    path("api/production/orders/", views.production_orders, name="production_orders"),
    path("api/production/orders/<int:pk>/", views.production_order_detail, name="production_order_detail"),
    path("api/production/orders/<int:pk>/start/", views.production_order_start, name="production_order_start"),
    path("api/production/orders/<int:pk>/complete/", views.production_order_complete, name="production_order_complete"),
    path("api/production/orders/<int:pk>/cancel/", views.production_order_cancel, name="production_order_cancel"),
    path("api/production/orders/<int:pk>/steps/<int:step_id>/start/", views.production_step_start, name="production_step_start"),
    path("api/production/orders/<int:pk>/steps/<int:step_id>/complete/", views.production_step_complete, name="production_step_complete"),
    path("api/production/orders/<int:pk>/steps/<int:step_id>/skip/", views.production_step_skip, name="production_step_skip"),
    path("api/production/plan/", views.production_plan, name="production_plan"),


    # ── باشگاه مشتریان ──────────────────────────────────────
    path("api/club/settings/", views.club_settings, name="club_settings"),
    path("api/club/members/", views.club_members, name="club_members"),
    path("api/club/members/<int:pk>/", views.club_member_detail, name="club_member_detail"),
    path("api/club/members/<int:pk>/adjust/", views.club_member_adjust, name="club_member_adjust"),
    path("api/club/lookup/", views.club_lookup, name="club_lookup"),
    path("api/club/redeem/", views.club_redeem, name="club_redeem"),
    path("api/club/members/<int:pk>/wallet/", club_views.club_member_wallet, name="club_member_wallet"),
    path("api/club/members/<int:pk>/reward/", club_views.club_member_reward, name="club_member_reward"),
    path("api/club/purchases/", club_views.club_purchases, name="club_purchases"),
    path("api/club/purchases/quote/", club_views.club_purchase_quote, name="club_purchase_quote"),
    path("api/club/purchases/<int:pk>/void/", club_views.club_purchase_void, name="club_purchase_void"),
    path("api/club/coupons/check/", club_views.club_coupon_check, name="club_coupon_check"),
    path("api/club/tiers/", club_views.club_tiers, name="club_tiers"),
    path("api/club/tiers/<int:pk>/", club_views.club_tier_detail, name="club_tier_detail"),
    path("api/club/rules/", club_views.club_rules, name="club_rules"),
    path("api/club/rules/<int:pk>/", club_views.club_rule_detail, name="club_rule_detail"),
    path("api/club/rewards/", club_views.club_rewards, name="club_rewards"),
    path("api/club/rewards/<int:pk>/", club_views.club_reward_detail, name="club_reward_detail"),
    path("api/club/coupons/", club_views.club_coupons, name="club_coupons"),
    path("api/club/coupons/<int:pk>/", club_views.club_coupon_detail, name="club_coupon_detail"),
    path("api/club/campaigns/", club_views.club_campaigns, name="club_campaigns"),
    path("api/club/campaigns/<int:pk>/", club_views.club_campaign_detail, name="club_campaign_detail"),
    path("api/club/campaigns/<int:pk>/run/", club_views.club_campaign_run, name="club_campaign_run"),
    path("api/club/messages/", club_views.club_messages, name="club_messages"),
    path("api/club/reports/", club_views.club_reports, name="club_reports"),
    path("api/club/run-daily/", club_views.club_run_daily, name="club_run_daily"),
    path("api/public/club/<slug:slug>/", club_pub.public_club_info, name="public_club_info"),
    path("api/public/club/<slug:slug>/lookup/", club_pub.public_club_lookup, name="public_club_lookup"),
    path("api/public/club/<slug:slug>/join/", club_pub.public_club_join, name="public_club_join"),

    # ── حمل و تحویل ─────────────────────────────────────────
    path("api/delivery/vehicles/", dl_views.vehicles, name="delivery_vehicles"),
    path("api/delivery/vehicles/<int:pk>/", dl_views.vehicle_detail, name="delivery_vehicle_detail"),
    path("api/delivery/carriers/", dl_views.carriers, name="delivery_carriers"),
    path("api/delivery/carriers/<int:pk>/", dl_views.carrier_detail, name="delivery_carrier_detail"),
    path("api/delivery/drivers/", dl_views.drivers, name="delivery_drivers"),
    path("api/delivery/drivers/<int:pk>/", dl_views.driver_detail, name="delivery_driver_detail"),
    path("api/delivery/drivers/<int:pk>/shift/", dl_views.driver_shift, name="delivery_driver_shift"),
    path("api/business/subscription/", business_settings.business_subscription, name="business_subscription"),
    path("api/delivery/history/", dl_views.courier_history, name="delivery_history"),
    path("api/delivery/history/trips/<int:pk>/route/", dl_views.trip_route, name="delivery_trip_route"),
    path("api/activity/", activity_views.activity_list, name="activity_list"),
    path("api/activity/meta/", activity_views.activity_meta, name="activity_meta"),
    path("api/delivery/driver-manifest/", dl_views.driver_manifest, name="delivery_driver_manifest"),
    path("api/delivery/dispatchable/", dl_views.dispatchable_invoices, name="delivery_dispatchable"),
    path("api/delivery/pending-orders/", dl_views.pending_orders, name="delivery_pending_orders"),
    path("api/delivery/trips/", dl_views.trips, name="delivery_trips"),
    path("api/delivery/trips/<int:pk>/", dl_views.trip_detail, name="delivery_trip_detail"),
    path("api/delivery/trips/<int:pk>/assign/", dl_views.trip_assign, name="delivery_trip_assign"),
    path("api/delivery/trips/<int:pk>/status/", dl_views.trip_status, name="delivery_trip_status"),
    path("api/delivery/trips/<int:pk>/optimize/", dl_views.trip_optimize, name="delivery_trip_optimize"),
    path("api/delivery/zones/", dl_views.zones, name="delivery_zones"),
    path("api/delivery/zones/quote/", dl_views.zone_quote, name="delivery_zone_quote"),
    path("api/delivery/zones/<int:pk>/", dl_views.zone_detail, name="delivery_zone_detail"),
    path("api/delivery/reports/", dl_views.reports, name="delivery_reports"),
    path("api/delivery/stops/<int:pk>/status/", dl_views.stop_status, name="delivery_stop_status"),
    path("api/delivery/driver/me/", dl_views.driver_me, name="delivery_driver_me"),
    path("api/delivery/driver/shift/", dl_views.driver_shift_me, name="delivery_driver_shift_me"),
    path("api/delivery/driver/location/", dl_views.driver_location, name="delivery_driver_location"),
    path("api/delivery/driver/stops/<int:pk>/status/", dl_views.driver_stop_status, name="delivery_driver_stop_status"),
    path("api/delivery/ping/", dl_views.device_ping, name="delivery_device_ping"),
    path("api/delivery/map/", dl_views.live_map, name="delivery_map"),
    path("api/delivery/settlements/", dl_views.settlements, name="delivery_settlements"),
    path("api/delivery/cash/", dl_views.cash_overview, name="delivery_cash"),
    path("api/delivery/track/<str:token>/", dl_views.public_track, name="delivery_track"),

    # ── حسابداری ────────────────────────────────────────────
    path("api/accounting/accounts/", views.accounts, name="accounting_accounts"),
    path("api/accounting/accounts/<int:pk>/", views.account_detail, name="accounting_account_detail"),
    path("api/accounting/cost-centers/", views.cost_centers, name="accounting_cost_centers"),
    path("api/accounting/journal/", views.journal, name="accounting_journal"),
    path("api/accounting/journal/<int:pk>/", views.journal_detail, name="accounting_journal_detail"),
    path("api/accounting/journal/<int:pk>/reverse/", views.journal_reverse, name="accounting_journal_reverse"),
    path("api/accounting/journal/<int:pk>/post/", views.journal_post, name="accounting_journal_post"),
    path("api/accounting/settings/", acc_pro.settings_view, name="acc_settings"),
    path("api/accounting/chart-templates/", acc_pro.chart_templates, name="acc_chart_templates"),
    path("api/accounting/details/", acc_pro.details, name="acc_details"),
    path("api/accounting/details/<int:pk>/", acc_pro.detail_item, name="acc_detail_item"),
    path("api/accounting/fiscal-years/", acc_pro.fiscal_years, name="acc_fiscal_years"),
    path("api/accounting/fiscal-years/<int:pk>/", acc_pro.fiscal_year_item, name="acc_fiscal_year_item"),
    path("api/accounting/fiscal-years/<int:pk>/close/", acc_pro.fiscal_year_close, name="acc_fiscal_year_close"),
    path("api/accounting/fiscal-years/<int:pk>/reopen/", acc_pro.fiscal_year_reopen, name="acc_fiscal_year_reopen"),
    path("api/accounting/periods/<int:pk>/lock/", acc_pro.period_lock, name="acc_period_lock"),
    path("api/accounting/money-accounts/", acc_pro.money_accounts, name="acc_money_accounts"),
    path("api/accounting/money-accounts/<int:pk>/", acc_pro.money_account_item, name="acc_money_account_item"),
    path("api/accounting/money-accounts/<int:pk>/reconcile/", acc_pro.reconcile_view, name="acc_reconcile"),
    path("api/accounting/money-accounts/<int:pk>/statement/", acc_pro.statement_import, name="acc_statement_import"),
    path("api/accounting/money-accounts/<int:pk>/auto-match/", acc_pro.statement_auto_match, name="acc_auto_match"),
    path("api/accounting/statement-lines/<int:pk>/", acc_pro.statement_line_item, name="acc_statement_line"),
    path("api/accounting/statement-lines/<int:pk>/match/", acc_pro.statement_line_match, name="acc_statement_match"),
    path("api/accounting/transfers/", acc_pro.transfers, name="acc_transfers"),
    path("api/accounting/transfers/<int:pk>/cancel/", acc_pro.transfer_cancel, name="acc_transfer_cancel"),
    path("api/accounting/cheques/", acc_pro.cheques, name="acc_cheques"),
    path("api/accounting/cheques/reminders/", acc_pro.cheque_reminders, name="acc_cheque_reminders"),
    path("api/accounting/cheques/<int:pk>/", acc_pro.cheque_item, name="acc_cheque_item"),
    path("api/accounting/cheques/<int:pk>/status/", acc_pro.cheque_status, name="acc_cheque_status"),
    path("api/accounting/cheques/<int:pk>/undo/", acc_pro.cheque_undo, name="acc_cheque_undo"),
    path("api/accounting/budgets/", acc_pro.budgets, name="acc_budgets"),
    path("api/accounting/budgets/<int:pk>/", acc_pro.budget_item, name="acc_budget_item"),
    path("api/accounting/vat-documents/", acc_pro.vat_document, name="acc_vat_document"),
    path("api/accounting/reports/journal-book/", acc_pro.report_journal_book, name="acc_journal_book"),
    path("api/accounting/reports/trial-balance-ext/", acc_pro.report_trial_balance_ext, name="acc_trial_ext"),
    path("api/accounting/reports/cash-flow/", acc_pro.report_cash_flow, name="acc_cash_flow"),
    path("api/accounting/reports/aging/", acc_pro.report_aging, name="acc_aging"),
    path("api/accounting/reports/party-balances/", acc_pro.report_party_balances, name="acc_party_balances"),
    path("api/accounting/reports/vat/", acc_pro.report_vat, name="acc_vat_report"),
    path("api/accounting/reports/trial-balance/", views.report_trial_balance, name="accounting_trial_balance"),
    path("api/accounting/reports/ledger/", views.report_ledger, name="accounting_ledger"),
    path("api/accounting/reports/income-statement/", views.report_income_statement, name="accounting_income_statement"),
    path("api/accounting/reports/balance-sheet/", views.report_balance_sheet, name="accounting_balance_sheet"),
    path("api/accounting/autopilot/", acc_auto.autopilot_overview, name="acc_autopilot"),
    path("api/accounting/opening/", acc_auto.opening, name="acc_opening"),
    path("api/accounting/expenses/", acc_auto.expenses, name="acc_expenses"),
    path("api/accounting/expenses/<int:pk>/", acc_auto.expense_remove, name="acc_expense_remove"),
    path("api/accounting/payments/", acc_auto.payments, name="acc_payments"),
    path("api/accounting/payments/<int:pk>/", acc_auto.payment_remove, name="acc_payment_remove"),
    path("api/accounting/recurring/", acc_auto.recurring, name="acc_recurring"),
    path("api/accounting/recurring/<int:pk>/", acc_auto.recurring_detail, name="acc_recurring_detail"),
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

    path("api/super/modules/", mod_views.super_modules_api, name="super_modules"),
    path("api/super/qr/", qr_super.super_qr_links, name="super_qr_links"),
    path("api/super/qr/<int:pk>/", qr_super.super_qr_detail, name="super_qr_detail"),
    re_path(r"^q/(?P<code>[A-Za-z0-9]{4,16})/?$", qr_public.qr_redirect, name="qr_redirect"),
    path("api/super/plans/", mod_views.super_plans_api, name="super_plans"),
    path("api/super/features/", mod_views.super_features_api, name="super_features"),
    path("api/super/businesses/<int:business_id>/modules/", mod_views.super_business_modules_api, name="super_business_modules"),
    path("api/super/businesses/<int:business_id>/plan/", mod_views.super_business_plan_api, name="super_business_plan"),
    path("api/super/businesses/<int:business_id>/subscription/", mod_views.super_business_subscription_api, name="super_business_subscription"),
    path("api/super/storefront/templates/", sf_views.super_storefront_templates, name="super_sf_templates"),
    path("api/super/storefront/templates/<int:pk>/", sf_views.super_storefront_template_detail, name="super_sf_template_detail"),
    path("api/super/storefront/business/<int:business_id>/template/", sf_views.super_storefront_set_template, name="super_sf_set_template"),

    path("api/super/storefront/business/<int:business_id>/domain/", sf_views.super_storefront_domain, name="super_sf_domain"),
    path("api/super/storefront/<int:business_id>/", sf_views.super_storefront_draft, name="super_sf_draft"),
    path("api/super/storefront/<int:business_id>/publish/", sf_views.super_storefront_publish, name="super_sf_publish"),
    path("api/super/storefront/<int:business_id>/unpublish/", sf_views.super_storefront_unpublish, name="super_sf_unpublish"),
    path("api/super/storefront/<int:business_id>/apply-template/", sf_views.super_storefront_apply_template, name="super_sf_apply_template"),
    path("api/super/storefront/<int:business_id>/preview-token/", sf_views.super_storefront_preview_token, name="super_sf_preview_token"),
    path("api/super/storefront/<int:business_id>/revisions/", sf_views.super_storefront_revisions, name="super_sf_revisions"),
    path("api/super/storefront/<int:business_id>/assets/", sf_views.super_storefront_assets, name="super_sf_assets"),
    path("api/super/storefront/<int:business_id>/revisions/<int:pk>/restore/", sf_views.super_storefront_restore, name="super_sf_restore"),
    path("api/super/storefront/<int:business_id>/domain/", sf_views.super_storefront_domain, name="super_sf_domain_short"),

    # ── Storefront (no-code website) ──
    path("api/storefront/mine/summary/", sf_views.storefront_mine_summary, name="storefront_mine_summary"),
    path("api/storefront/by-host/", sf_views.storefront_by_host, name="storefront_by_host"),
    path("api/storefront/<slug:slug>/club/join/", sf_views.storefront_club_join, name="storefront_club_join"),
    path("api/storefront/<slug:slug>/preview/", sf_views.storefront_preview, name="storefront_preview"),
    path("api/storefront/<slug:slug>/", sf_views.storefront_public, name="storefront_public"),

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
    # ── Platform support tickets (business -> platform owner) ──
    path("api/support/tickets/", sup_views.support_tickets, name="support_tickets"),
    path("api/support/tickets/<int:pk>/", sup_views.support_ticket_detail, name="support_ticket_detail"),
    path("api/support/tickets/<int:pk>/messages/", sup_views.support_ticket_message, name="support_ticket_message"),
    path("api/support/tickets/<int:pk>/resolve/", sup_views.support_ticket_resolve, name="support_ticket_resolve"),
    path("api/super/support/tickets/", sup_super.super_support_tickets, name="super_support_tickets"),
    path("api/super/support/tickets/<int:pk>/", sup_super.super_support_ticket_detail, name="super_support_ticket_detail"),
    path("api/super/support/tickets/<int:pk>/reply/", sup_super.super_support_reply, name="super_support_reply"),
    path("api/super/support/tickets/<int:pk>/status/", sup_super.super_support_status, name="super_support_status"),
    path("api/super/support/summary/", sup_super.super_support_summary, name="super_support_summary"),

    # ── HTML Pages ──────────────────────────────────────────
    path("dashboard/", views.auth_page, name="auth_page"),
    path("dashboard/auth/", views.redirect_to_dashboard, name="auth_redirect"),
    path("dashboard/app/", views.home, name="dashboard_app"),
    path("dashboard/logout/", views.logout_page, name="logout_page"),
    path("dashboard/super/auth/", views.super_admin_auth_page, name="super_admin_auth"),
    path("dashboard/super/", views.super_admin_page, name="super_admin"),
    path("dashboard/orders/", views.orders_dashboard, name="orders_dashboard"),
]