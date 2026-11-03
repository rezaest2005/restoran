"""
Restaurant Management System — Models (Multi-tenant)  ·  v2

Package split of the former single ``models.py``.  Every name that other
code (views, serializers, admin, migrations, tests ...) imports from
``restaurant.models`` is re-exported here.
"""

from .common import (
    UNIT_CHOICES,
    UNIT_MAX_LENGTH,
    DecimalSafeEncoder,
    check_constraint,
    created_at_field,
    description_field,
    is_active_field,
    name_field,
    phone_field,
    price_field,
    qty_field,
    unit_field,
    updated_at_field,
)
from .restaurant import Restaurant, Tenant, _invalidate_restaurant_cache
from .user import (
    DASHBOARD_SECTIONS,
    User,
    _ALL_SECTIONS,
    validate_dashboard_permissions,
)
from .menu import Category, Food, set_food_final_price
from .orders import (
    Order,
    OrderItem,
    _recalculate_order_total,
    _update_order_total_on_delete,
    _update_order_total_on_save,
    set_order_item_price,
)
from .inventory import InventoryMovement, RawMaterial, StockItem, Warehouse
from .purchasing import (
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseReturn,
    Supplier,
)
from .sales import Customer, Expense, SalesInvoice, SalesInvoiceItem, SalesReturn
from .production import Formula, FormulaLine, ProductionOrder
from .club import LoyaltyMember, LoyaltySettings, LoyaltyTransaction
from .feedback import Feedback
from .accounting import Account, CostCenter, JournalEntry, JournalLine

__all__ = [
    "UNIT_CHOICES", "UNIT_MAX_LENGTH", "DecimalSafeEncoder", "check_constraint",
    "created_at_field", "description_field", "is_active_field", "name_field",
    "phone_field", "price_field", "qty_field", "unit_field", "updated_at_field",
    "Restaurant", "Tenant", "DASHBOARD_SECTIONS", "User",
    "validate_dashboard_permissions",
    "Category", "Food", "set_food_final_price",
    "Order", "OrderItem", "set_order_item_price",
    "InventoryMovement", "RawMaterial", "StockItem", "Warehouse",
    "PurchaseInvoice", "PurchaseInvoiceItem", "PurchaseReturn", "Supplier",
    "Customer", "Expense", "SalesInvoice", "SalesInvoiceItem", "SalesReturn",
    "Formula", "FormulaLine", "ProductionOrder",
    "LoyaltyMember", "LoyaltySettings", "LoyaltyTransaction",
    "Feedback",
    "Account", "CostCenter", "JournalEntry", "JournalLine",
]
