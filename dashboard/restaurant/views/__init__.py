"""
Restaurant Views Package — Re-export everything so urls.py stays unchanged.
"""

# ── ViewSets ──
from .viewsets import (
    CategoryViewSet, FoodViewSet, TableViewSet, ReservationViewSet,
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

# ── Foods API ──
from .foods import (
    public_food_list, public_category_list,
    food_save, food_delete, food_management_api,
    category_save, category_delete, product_category_lookup,
)

# ── Warehouse API ──
from .warehouse import (
    raw_material_save, raw_material_delete, raw_material_suggestions,
    supplier_list, supplier_suggestions, supplier_save, supplier_delete,
    warehouse_json, parse_excel_file,
    semi_finished_save, semi_finished_delete,
    semi_finished_produce, semi_finished_produce_detail,
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
    KitchenDiscountListCreate, KitchenDiscountDetail,
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
)

# ── Orders API ──
from .orders import (
    order_change_status, order_send_to_kitchen, kitchen_orders_api,
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
    semi_finished_suggestions_api,
)

# ── Dictionary API ──
from .dictionary import (
    dictionary_list, dictionary_autocomplete,
    dictionary_create, dictionary_update, dictionary_delete,
)

# ── Page Views (HTML) ──
from .restaurant_page_views import (
    home, auth_page, logout_page,
    purchase_invoice_list, purchase_invoice_detail,
    create_purchase_invoice, create_invoice_view,
    raw_materials_view, semi_finished_view,
    usage_log_view, ready_materials_page,
    kitchen_page, pos_page, pos_receipt,
    food_management_page, orders_dashboard,
    recipe_manager_page,
    loyalty_dashboard_page, loyalty_customers_page,
    loyalty_customer_detail_page, loyalty_coupons_page,
    loyalty_rewards_page, loyalty_notifications_page,
    loyalty_register_page,
    user_management_page, dictionary_page,
)

# ═══════════════════════════════════════════════════════════════════
#  Public API — به Pylance میگه اینا عمومی‌ان و باید export بشن
# ═══════════════════════════════════════════════════════════════════

__all__ = [
    # ViewSets
    "CategoryViewSet", "FoodViewSet", "TableViewSet", "ReservationViewSet",
    "OrderViewSet", "SemiFinishedViewSet", "ReadyMaterialViewSet",
    "MembershipLevelViewSet", "CustomerViewSet", "CouponViewSet",
    "RewardViewSet", "ReferralViewSet", "NotificationViewSet",
    "LoyaltyTransactionViewSet", "RewardRedemptionViewSet",
    # Auth
    "LoginView", "RefreshView", "RegisterView", "LogoutView",
    "CurrentUserView", "ChangePasswordView", "ResetPasswordView",
    "UserListView", "UserDetailView", "SetSessionView",
    # Foods
    "public_food_list", "public_category_list",
    "food_save", "food_delete", "food_management_api",
    "category_save", "category_delete", "product_category_lookup",
    # Warehouse
    "raw_material_save", "raw_material_delete", "raw_material_suggestions",
    "supplier_list", "supplier_suggestions", "supplier_save", "supplier_delete",
    "warehouse_json", "parse_excel_file",
    "semi_finished_save", "semi_finished_delete",
    "semi_finished_produce", "semi_finished_produce_detail",
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
    "KitchenDiscountListCreate", "KitchenDiscountDetail",
    "ProductionLogList",
    "KitchenWasteListCreate", "KitchenWasteDetail",
    # POS
    "pos_create_order", "pos_daily_report",
    "pos_close_summary", "pos_register_waste",
    "pos_close_all_pending", "pos_close_day",
    "pos_validate_coupon",
    "pos_close_history", "pos_close_report_detail", "pos_close_logs",
    # Orders
    "order_change_status", "order_send_to_kitchen", "kitchen_orders_api",
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
    "semi_finished_suggestions_api",
    # Dictionary
    "dictionary_list", "dictionary_autocomplete",
    "dictionary_create", "dictionary_update", "dictionary_delete",
    # Page Views
    "home", "auth_page", "logout_page",
    "purchase_invoice_list", "purchase_invoice_detail",
    "create_purchase_invoice", "create_invoice_view",
    "raw_materials_view", "semi_finished_view",
    "usage_log_view", "ready_materials_page",
    "kitchen_page", "pos_page", "pos_receipt",
    "food_management_page", "orders_dashboard",
    "recipe_manager_page",
    "loyalty_dashboard_page", "loyalty_customers_page",
    "loyalty_customer_detail_page", "loyalty_coupons_page",
    "loyalty_rewards_page", "loyalty_notifications_page",
    "loyalty_register_page",
    "user_management_page", "dictionary_page",
]