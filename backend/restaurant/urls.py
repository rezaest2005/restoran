"""
Restaurant Management System — URLs (کامل و یکپارچه)
=====================================================
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter
from . import views, recipe_views, dictionary_views


# ══════════════════════════════════════════════════════════════════════════════
#  REST API Router
# ══════════════════════════════════════════════════════════════════════════════

router = DefaultRouter()

# ── Restaurant CRUD
router.register("categories",        views.CategoryViewSet,        basename="category")
router.register("foods",             views.FoodViewSet,             basename="food")
router.register("tables",            views.TableViewSet,            basename="table")
router.register("reservations",      views.ReservationViewSet,      basename="reservation")
router.register("orders",            views.OrderViewSet,            basename="order")
router.register("semi-finished",     views.SemiFinishedViewSet,     basename="semi-finished")
router.register("ready-materials",   views.ReadyMaterialViewSet,    basename="ready-material")

# ── Loyalty CRUD
router.register("membership-levels",     views.MembershipLevelViewSet,     basename="membership-level")
router.register("customers",             views.CustomerViewSet,            basename="customer")
router.register("coupons",               views.CouponViewSet,              basename="coupon")
router.register("rewards",               views.RewardViewSet,              basename="reward")
router.register("referrals",             views.ReferralViewSet,            basename="referral")
router.register("notifications",         views.NotificationViewSet,        basename="notification")
router.register("loyalty-transactions",  views.LoyaltyTransactionViewSet,  basename="loyalty-transaction")
router.register("reward-redemptions",    views.RewardRedemptionViewSet,    basename="reward-redemption")

# ── Recipe
router.register("recipes", recipe_views.RecipeViewSet, basename="recipe")
router.register("inventory-movements", recipe_views.InventoryMovementViewSet, basename="inventory-movement")


# ══════════════════════════════════════════════════════════════════════════════
#  URL Patterns
# ══════════════════════════════════════════════════════════════════════════════

urlpatterns = [

    # ──────────────────────────────────────────────────────────────
    #  Dictionary (دیکشنری اسامی)
    # ──────────────────────────────────────────────────────────────
    path("api/dictionary/list/",                    dictionary_views.dictionary_list,        name="dictionary_list"),
    path("api/dictionary/autocomplete/",            dictionary_views.dictionary_autocomplete, name="dictionary_autocomplete"),
    path("api/dictionary/create/",                  dictionary_views.dictionary_create,       name="dictionary_create"),
    path("api/dictionary/<int:pk>/update/",         dictionary_views.dictionary_update,       name="dictionary_update"),
    path("api/dictionary/<int:pk>/delete/",         dictionary_views.dictionary_delete,       name="dictionary_delete"),

    # ──────────────────────────────────────────────────────────────
    #  Kitchen
    # ──────────────────────────────────────────────────────────────
    path("api/kitchen/dashboard/",                      views.kitchen_dashboard_api,              name="kitchen_dashboard"),
    path("api/kitchen/products/",                       views.KitchenProductListCreate.as_view(), name="kitchen-products-list"),
    path("api/kitchen/products/<int:pk>/",              views.KitchenProductDetail.as_view(),     name="kitchen-products-detail"),
    path("api/kitchen/products/<int:pk>/capacity/",     views.kitchen_product_capacity,           name="kitchen-product-capacity"),
    path("api/kitchen/products/<int:pk>/produce/",      views.kitchen_product_produce,            name="kitchen-product-produce"),
    path("api/kitchen/calculate-materials/",             views.kitchen_calculate_materials,        name="kitchen-calculate-materials"),
    path("api/kitchen/inventory/",                      views.KitchenInventoryList.as_view(),     name="kitchen-inventory-list"),
    path("api/kitchen/plans/",                          views.ProductionPlanListCreate.as_view(), name="production-plans-list"),
    path("api/kitchen/plans/<int:pk>/",                 views.ProductionPlanDetail.as_view(),     name="production-plans-detail"),
    path("api/kitchen/plans/<int:pk>/approve/",         views.production_plan_approve,            name="production-plan-approve"),
    path("api/kitchen/plans/<int:pk>/execute/",         views.production_plan_execute,            name="production-plan-execute"),
    path("api/kitchen/discounts/",                      views.KitchenDiscountListCreate.as_view(), name="kitchen-discounts-list"),
    path("api/kitchen/discounts/<int:pk>/",             views.KitchenDiscountDetail.as_view(),     name="kitchen-discounts-detail"),
    path("api/kitchen/logs/",                           views.ProductionLogList.as_view(),         name="production-logs-list"),
    path("api/kitchen/waste/",      views.KitchenWasteListCreate.as_view(), name="kitchen-waste-list"),
    path("api/kitchen/waste/<int:pk>/", views.KitchenWasteDetail.as_view(), name="kitchen-waste-detail"),

    # ──────────────────────────────────────────────────────────────
    #  Loyalty
    # ──────────────────────────────────────────────────────────────
    path("api/loyalty/process-order/",  views.process_order_loyalty_view, name="process_order_loyalty"),
    path("api/loyalty/dashboard/",      views.loyalty_dashboard_view,     name="loyalty_dashboard_api"),
    path("api/loyalty/birthday-check/", views.birthday_check_view,        name="birthday_check"),
    path("api/loyalty/seed-levels/",    views.seed_levels_view,           name="seed_levels"),

    # ──────────────────────────────────────────────────────────────
    #  Auth
    # ──────────────────────────────────────────────────────────────
    path("api/auth/login/",             views.LoginView.as_view(),          name="login"),
    path("api/auth/refresh/",           views.RefreshView.as_view(),        name="refresh"),
    path("api/auth/register/",          views.RegisterView.as_view(),       name="register"),
    path("api/auth/logout/",            views.LogoutView.as_view(),         name="logout"),
    path("api/auth/me/",                views.CurrentUserView.as_view(),    name="current_user"),
    path("api/auth/change-password/",   views.ChangePasswordView.as_view(), name="change_password"),
    path("api/auth/reset-password/",    views.ResetPasswordView.as_view(),  name="reset_password"),
    path("api/auth/users/",             views.UserListView.as_view(),       name="user_list"),
    path("api/auth/users/<int:pk>/",    views.UserDetailView.as_view(),     name="user_detail"),
    path("api/auth/set-session/",       views.SetSessionView.as_view(),     name="set_session"),

    # ──────────────────────────────────────────────────────────────
    #  User Management
    # ──────────────────────────────────────────────────────────────
    path("users/",                    views.user_management_page,  name="user_management"),
    path("api/users/management/",     views.user_management_api,   name="user_management_api"),
    path("api/users/create/",         views.create_user_api,       name="create_user_api"),
    path("api/users/update-role/",    views.user_update_role,      name="user_update_role"),
    path("api/users/reset-password/", views.admin_reset_password,  name="admin_reset_password"),
    path("api/users/toggle-active/",  views.user_toggle_active,    name="user_toggle_active"),
    path("api/users/approve/",        views.approve_user_api,      name="approve_user"),
    path("api/users/reject/",         views.reject_user_api,       name="reject_user"),
    path('api/users/delete/', views.user_delete, name='user_delete'),

    # ──────────────────────────────────────────────────────────────
    #  Raw Materials & Suppliers
    # ──────────────────────────────────────────────────────────────
    path("api/raw-materials/save/",        views.raw_material_save,        name="raw_material_save"),
    path("api/raw-materials/delete/",      views.raw_material_delete,      name="raw_material_delete"),
    path("api/raw-materials/suggestions/", views.raw_material_suggestions, name="raw_material_suggestions"),
    path("api/suppliers/",                 views.supplier_list,            name="supplier_list"),
    path("api/suppliers/save/",            views.supplier_save,            name="supplier_save"),
    path("api/suppliers/delete/",          views.supplier_delete,          name="supplier_delete"),
    path("api/suppliers/suggestions/",     views.supplier_suggestions,     name="supplier_suggestions"),

    # ──────────────────────────────────────────────────────────────
    #  Warehouse & Inventory
    # ──────────────────────────────────────────────────────────────
    path("api/invoices/parse-excel/",      views.parse_excel_file,            name="parse_excel"),
    path("api/usage-log/json/",            views.usage_log_json,              name="usage_log_json"),
    path("api/usage-log/detail/",          views.usage_log_detail_json,       name="usage_log_detail"),
    path("api/semi-finished/save/",        views.semi_finished_save,          name="semi_finished_save"),
    path("api/semi-finished/delete/",      views.semi_finished_delete,        name="semi_finished_delete"),
    path("api/warehouse-json/",            views.warehouse_json,              name="warehouse-json"),
    path("api/semi-finished/<int:pk>/produce-detail/", views.semi_finished_produce_detail, name="semi-finished-produce-detail"),

    # ──────────────────────────────────────────────────────────────
    #  Recipes
    # ──────────────────────────────────────────────────────────────
    path("api/recipes/validate-inventory/",    recipe_views.validate_order_inventory_view,  name="validate_order_inventory"),
    path("api/recipes/deduct-inventory/",      recipe_views.deduct_inventory_view,          name="deduct_inventory"),
    path("api/recipes/recalculate-all/",       recipe_views.recalculate_costs_view,         name="recalculate_costs"),
    path("api/recipes/analytics/",             recipe_views.inventory_analytics_view,       name="inventory_analytics"),
    path("api/recipes/produce-semi/",          recipe_views.produce_semi_finished_view,     name="produce_semi_finished"),
    path("api/recipes/foods/suggest/",         recipe_views.food_suggestions_view,          name="food_suggestions"),
    path("api/recipes/raw-materials/suggest/", recipe_views.raw_material_suggestions_api,   name="recipe_raw_material_suggestions"),
    path("api/recipes/semi-finished/suggest/", recipe_views.semi_finished_suggestions_api,  name="semi_finished_suggestions"),

    # ──────────────────────────────────────────────────────────────
    #  Foods & Categories
    # ──────────────────────────────────────────────────────────────
    path("api/foods/",                 views.public_food_list,     name="public_food_list"),
    path("api/categories/",            views.public_category_list, name="public_category_list"),
    path("api/foods/save/",            views.food_save,            name="food_save"),
    path("api/foods/delete/",          views.food_delete,          name="food_delete"),
    path("api/foods/management/",      views.food_management_api,  name="food_management_api"),
    path("api/categories/save/",       views.category_save,        name="category_save"),
    path("api/categories/delete/",     views.category_delete,      name="category_delete"),

    # ──────────────────────────────────────────────────────────────
    #  POS
    # ──────────────────────────────────────────────────────────────
    path("dashboard/pos/",                          views.pos_page,              name="pos_page"),
    path("api/pos/create-order/",         views.pos_create_order,      name="pos_create_order"),
    path("pos/receipt/<int:pk>/",         views.pos_receipt,           name="pos_receipt"),
    path("api/pos/daily-report/",         views.pos_daily_report,      name="pos_daily_report"),
    path("api/pos/close-summary/",        views.pos_close_summary,     name="pos_close_summary"),
    path("api/pos/register-waste/",       views.pos_register_waste,    name="pos_register_waste"),
    path("api/pos/close-pending/",        views.pos_close_all_pending, name="pos_close_all_pending"),
    path("api/pos/close-day/",            views.pos_close_day,         name="pos_close_day"),
    path("api/pos/validate-coupon/",      views.pos_validate_coupon,   name="pos_validate_coupon"),

    # ──────────────────────────────────────────────────────────────
    #  کارتخوان
    # ──────────────────────────────────────────────────────────────
    path("api/card-reader/pay/",    views.send_to_card_reader,  name="card_reader_pay"),
    path("api/card-reader/cancel/", views.cancel_card_payment,  name="card_reader_cancel"),

    # ──────────────────────────────────────────────────────────────
    #  Ready Materials
    # ──────────────────────────────────────────────────────────────
    path("api/ready-materials/save/",          views.ready_material_save,         name="ready_material_save"),
    path("api/ready-materials/delete/",        views.ready_material_delete,       name="ready_material_delete"),
    path("api/convert-to-ready/",              views.convert_to_ready_material,   name="convert_to_ready_material"),
    path("api/ready-materials/update-price/",  views.ready_material_update_price,  name="ready_material_update_price"),

    # ──────────────────────────────────────────────────────────────
    #  Product Category Memory
    # ──────────────────────────────────────────────────────────────
    path("api/product-category-lookup/", views.product_category_lookup, name="product_category_lookup"),

    # ──────────────────────────────────────────────────────────────
    #  بستن روز — تاریخچه
    # ──────────────────────────────────────────────────────────────
    path("api/pos/close-history/",                   views.pos_close_history,        name="pos_close_history"),
    path("api/pos/close-report/<int:report_id>/",    views.pos_close_report_detail,  name="pos_close_report_detail"),
    path("api/pos/close-logs/",                      views.pos_close_logs,           name="pos_close_logs"),

    # ──────────────────────────────────────────────────────────────
    #  Orders
    # ──────────────────────────────────────────────────────────────
    path("api/orders/<int:pk>/status/",          views.order_change_status,   name="order_change_status"),
    path("api/orders/<int:pk>/send-to-kitchen/", views.order_send_to_kitchen, name="order_send_to_kitchen"),
    path("api/orders/kitchen/",                  views.kitchen_orders_api,    name="kitchen_orders_api"),

    # ──────────────────────────────────────────────────────────────
    #  REST API (باید آخر از همه باشه)
    # ──────────────────────────────────────────────────────────────
    path("api/", include(router.urls)),

    # ──────────────────────────────────────────────────────────────
    #  Pages (HTML)
    # ──────────────────────────────────────────────────────────────
    path("dashboard/",                                    views.home,       name="home"),
    path("dashboard/auth/",                               views.auth_page,  name="auth_page"),
    path("dashboard/logout/",                              views.logout_page, name="logout_page"),

    path("dashboard/invoices/",                           views.purchase_invoice_list,    name="invoice_list"),
    path("dashboard/invoices/create/",                    views.create_purchase_invoice,  name="create_invoice"),
    path("dashboard/invoices/create/view/",               views.create_invoice_view,      name="create_invoice_view"),
    path("dashboard/invoices/<int:pk>/",                  views.purchase_invoice_detail,  name="invoice_detail"),

    path("dashboard/raw-materials/",                      views.raw_materials_view,       name="raw_materials"),
    path("dashboard/semi-finished/",                      views.semi_finished_view,       name="semi_finished"),
    path("dashboard/ready-materials/",                    views.ready_materials_page,     name="ready_materials"),

    path("dashboard/usage-log/",                          views.usage_log_view,           name="usage_log"),
    path("dashboard/kitchen/",                            views.kitchen_page,             name="kitchen_page"),

    path("dashboard/loyalty/",                            views.loyalty_dashboard_page,        name="loyalty_dashboard"),
    path("dashboard/loyalty/customers/",                  views.loyalty_customers_page,        name="loyalty_customers"),
    path("dashboard/loyalty/customers/<int:pk>/",         views.loyalty_customer_detail_page,  name="loyalty_customer_detail"),
    path("dashboard/loyalty/coupons/",                    views.loyalty_coupons_page,          name="loyalty_coupons"),
    path("dashboard/loyalty/rewards/",                    views.loyalty_rewards_page,          name="loyalty_rewards"),
    path("dashboard/loyalty/notifications/",              views.loyalty_notifications_page,    name="loyalty_notifications"),
    path("dashboard/loyalty/register/",                   views.loyalty_register_page,         name="loyalty_register"),

    path("dashboard/recipes/",                            recipe_views.recipes_page,           name="recipes_page"),
    path("dashboard/recipes/manager/",                    recipe_views.recipe_manager_page,    name="recipe_manager"),

    path("dashboard/foods/",                              views.food_management_page,          name="food_management"),

    path("dashboard/orders/", views.orders_dashboard, name="orders_dashboard"),

    path("dashboard/dictionary/", views.dictionary_page, name="dictionary_page"),
]