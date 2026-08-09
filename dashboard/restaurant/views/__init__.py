"""
Restaurant Views Package — Re-export everything.

★ نسخه v9 — restaurant_login + check_subscription_api اضافه شد
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
    super_tenant_services_api,
    super_services_list_api,
    super_users_api,
    super_user_create_api,
    super_user_detail_api,
    super_user_permissions_api,
    restaurant_login,          # ★ جدید
    check_subscription_api,    # ★ جدید
)

# ── ViewSets ──
from .viewsets import (
    TableViewSet, ReservationViewSet,
    OrderViewSet, SemiFinishedViewSet, ReadyMaterialViewSet,
    MembershipLevelViewSet, CustomerViewSet, CouponViewSet,
    RewardViewSet, ReferralViewSet, NotificationViewSet,
    LoyaltyTransactionViewSet, RewardRedemptionViewSet,
)

# ── Auth ──
from .auth import (
    LoginView, RefreshView, RegisterView, LogoutView,
    CurrentUserView, ChangePasswordView, ResetPasswordView,
    UserListView, UserDetailView, SetSessionView,
)

# ── Warehouse API ──
from .warehouse import (
    raw_material_save, raw_material_delete, raw_material_suggestions,
    supplier_list, supplier_suggestions, supplier_save, supplier_delete,
    warehouse_json, parse_excel_file,
    ready_material_save, ready_material_delete,
    ready_material_update_price, convert_to_ready_material,
    usage_log_json, usage_log_detail_json,
)

# ── Kitchen API ──
from .kitchen import (
    kitchen_dashboard_api,
    KitchenProductListCreate, KitchenProductDetail,
    kitchen_product_capacity, kitchen_product_produce,
    KitchenInventoryList,
    ProductionPlanListCreate, ProductionPlanDetail,
    kitchen_calculate_materials,
    production_plan_approve, production_plan_execute,
    ProductionLogList,
    KitchenWasteListCreate, KitchenWasteDetail,
)

# ── POS API ──
from .pos import (
    pos_create_order, pos_daily_report,
    pos_close_summary, pos_register_waste,
    pos_close_all_pending, pos_close_day,
    pos_validate_coupon,
    pos_close_history, pos_close_report_detail, pos_close_logs,
    pos_online_orders,
    pos_confirm_online_order,
    pos_reject_online_order,
    online_orders_status,
    toggle_online_orders,
    public_menu_api,
    pos_update_food_price,
)

# ── Orders API ──
from .orders import (
    order_change_status, order_send_to_kitchen,
    kitchen_orders_api, order_list_api,
)

# ── Loyalty API ──
from .loyalty import (
    process_order_loyalty_view, loyalty_dashboard_view,
    birthday_check_view, seed_levels_view,
)

# ── Users API ──
from .users import (
    user_management_api, create_user_api, user_update_role,
    user_toggle_active, admin_reset_password,
    approve_user_api, reject_user_api, user_delete,
)

# ── Card Reader API ──
from .card_reader import send_to_card_reader, cancel_card_payment

# ── Recipe API ──
from .recipe import (
    RecipeViewSet, InventoryMovementViewSet,
    validate_order_inventory_view, deduct_inventory_view,
    recalculate_costs_view, inventory_analytics_view,
    produce_semi_finished_view,
    food_suggestions_view, raw_material_suggestions_api,
    semi_finished_suggestions_api, recipe_materials_api,
)

# ── Dictionary API ──
from .dictionary import (
    dictionary_list, dictionary_autocomplete,
    dictionary_create, dictionary_update, dictionary_delete,
    raw_materials_api,
    dictionary_semi_finished,
    dictionary_ready_materials, dictionary_food_menu,
    dictionary_recipe_materials_api,
    dictionary_group_list, dictionary_group_save, dictionary_group_delete,
    dictionary_food_create, dictionary_food_update, dictionary_food_delete,
)

# ── Page Views (HTML) ──
from .restaurant_page_views import (
    root_redirect,
    home, auth_page, logout_page,
    redirect_to_dashboard,
    purchase_invoice_list, purchase_invoice_detail,
    create_purchase_invoice, create_invoice_view,
    raw_materials_view,
    usage_log_view, ready_materials_page,
    kitchen_page, pos_page, pos_receipt,
    orders_dashboard,
    recipe_manager_page,
    loyalty_dashboard_page, loyalty_customers_page,
    loyalty_customer_detail_page, loyalty_coupons_page,
    loyalty_rewards_page, loyalty_notifications_page,
    loyalty_register_page,
    user_management_page, dictionary_page,
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
    "super_tenant_services_api",
    "super_services_list_api",
    "super_users_api",
    "super_user_create_api",
    "super_user_detail_api",
    "super_user_permissions_api",
    "restaurant_login",          # ★ جدید
    "check_subscription_api",    # ★ جدید
    # ViewSets
    "TableViewSet", "ReservationViewSet",
    "OrderViewSet", "SemiFinishedViewSet", "ReadyMaterialViewSet",
    "MembershipLevelViewSet", "CustomerViewSet", "CouponViewSet",
    "RewardViewSet", "ReferralViewSet", "NotificationViewSet",
    "LoyaltyTransactionViewSet", "RewardRedemptionViewSet",
    # Auth
    "LoginView", "RefreshView", "RegisterView", "LogoutView",
    "CurrentUserView", "ChangePasswordView", "ResetPasswordView",
    "UserListView", "UserDetailView", "SetSessionView",
    # Warehouse
    "raw_material_save", "raw_material_delete", "raw_material_suggestions",
    "supplier_list", "supplier_suggestions", "supplier_save", "supplier_delete",
    "warehouse_json", "parse_excel_file",
    "ready_material_save", "ready_material_delete",
    "ready_material_update_price", "convert_to_ready_material",
    "usage_log_json", "usage_log_detail_json",
    # Kitchen
    "kitchen_dashboard_api",
    "KitchenProductListCreate", "KitchenProductDetail",
    "kitchen_product_capacity", "kitchen_product_produce",
    "KitchenInventoryList",
    "ProductionPlanListCreate", "ProductionPlanDetail",
    "kitchen_calculate_materials",
    "production_plan_approve", "production_plan_execute",
    "ProductionLogList",
    "KitchenWasteListCreate", "KitchenWasteDetail",
    # POS
    "pos_create_order", "pos_daily_report",
    "pos_close_summary", "pos_register_waste",
    "pos_close_all_pending", "pos_close_day",
    "pos_validate_coupon",
    "pos_close_history", "pos_close_report_detail", "pos_close_logs",
    "pos_online_orders", "pos_confirm_online_order", "pos_reject_online_order",
    "online_orders_status", "toggle_online_orders",
    "public_menu_api", "pos_update_food_price",
    # Orders
    "order_change_status", "order_send_to_kitchen",
    "kitchen_orders_api", "order_list_api",
    # Loyalty
    "process_order_loyalty_view", "loyalty_dashboard_view",
    "birthday_check_view", "seed_levels_view",
    # Users
    "user_management_api", "create_user_api", "user_update_role",
    "user_toggle_active", "admin_reset_password",
    "approve_user_api", "reject_user_api", "user_delete",
    # Card Reader
    "send_to_card_reader", "cancel_card_payment",
    # Recipe
    "RecipeViewSet", "InventoryMovementViewSet",
    "validate_order_inventory_view", "deduct_inventory_view",
    "recalculate_costs_view", "inventory_analytics_view",
    "produce_semi_finished_view",
    "food_suggestions_view", "raw_material_suggestions_api",
    "semi_finished_suggestions_api", "recipe_materials_api",
    # Dictionary
    "dictionary_list", "dictionary_autocomplete",
    "dictionary_create", "dictionary_update", "dictionary_delete",
    "raw_materials_api",
    "dictionary_semi_finished",
    "dictionary_ready_materials", "dictionary_food_menu",
    "dictionary_recipe_materials_api",
    "dictionary_group_list", "dictionary_group_save", "dictionary_group_delete",
    "dictionary_food_create", "dictionary_food_update", "dictionary_food_delete",
    # Page Views
    "root_redirect",
    "home", "auth_page", "logout_page",
    "redirect_to_dashboard",
    "purchase_invoice_list", "purchase_invoice_detail",
    "create_purchase_invoice", "create_invoice_view",
    "raw_materials_view", "usage_log_view", "ready_materials_page",
    "kitchen_page", "pos_page", "pos_receipt",
    "orders_dashboard", "recipe_manager_page",
    "loyalty_dashboard_page", "loyalty_customers_page",
    "loyalty_customer_detail_page", "loyalty_coupons_page",
    "loyalty_rewards_page", "loyalty_notifications_page",
    "loyalty_register_page",
    "user_management_page", "dictionary_page",
]