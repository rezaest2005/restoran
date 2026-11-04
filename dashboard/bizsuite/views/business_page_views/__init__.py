"""
business_page_views — بسته‌بندی شده؛ همهٔ نام‌ها دوباره export می‌شوند.
"""
from .pages import (
    LOGIN_URL,
    root_redirect,
    home,
    auth_page,
    redirect_to_dashboard,
    logout_page,
    pos_receipt,
    orders_dashboard,
    recipe_manager_page,
    user_management_page,
    dictionary_page,
)
from .purchase_pages import (
    _detect_material_type,
    purchase_invoice_list,
    purchase_invoice_detail,
    create_invoice_view,
    create_purchase_invoice,
    raw_materials_view,
)

__all__ = [
    "LOGIN_URL",
    "root_redirect",
    "home",
    "auth_page",
    "redirect_to_dashboard",
    "logout_page",
    "pos_receipt",
    "orders_dashboard",
    "recipe_manager_page",
    "user_management_page",
    "dictionary_page",
    "_detect_material_type",
    "purchase_invoice_list",
    "purchase_invoice_detail",
    "create_invoice_view",
    "create_purchase_invoice",
    "raw_materials_view",
]
