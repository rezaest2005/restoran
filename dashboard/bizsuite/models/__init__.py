"""
Business Management System — Models (Multi-tenant)  ·  v2

Package split of the former single ``models.py``.  Every name that other
code (views, serializers, admin, migrations, tests ...) imports from
``bizsuite.models`` is re-exported here.
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
from .business import Business, Tenant, _invalidate_business_cache
from .user import (
    DASHBOARD_SECTIONS,
    User,
    _ALL_SECTIONS,
    validate_dashboard_permissions,
)
from .menu import BarcodeSequence, Category, Food, set_food_final_price
from .orders import (
    Order,
    OrderItem,
    _recalculate_order_total,
    _update_order_total_on_delete,
    _update_order_total_on_save,
    set_order_item_price,
)
from .inventory import InventoryMovement, RawMaterial, StockItem, UserWarehouse, Warehouse
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
from .support import SupportMessage, SupportTicket
from .qr import QrLink
from .accounting import (
    EXPENSE_CATEGORIES, EXPENSE_CATEGORY_KEYS, Account, CostCenter, JournalEntry, JournalLine, Payment,
    RecurringExpense,
)
from .jobs import BackgroundJob
from .modules import BusinessModule, Module, Plan
from .storefront import (
    Storefront, StorefrontAsset, StorefrontRevision, StorefrontTemplate,
)
from .delivery import (
    Carrier, CashSettlement, Driver, LocationPing, Trip, TripStop, Vehicle,
)

__all__ = [
    "BusinessModule", "Module", "Plan",
    "QrLink", "Payment", "RecurringExpense", "EXPENSE_CATEGORIES", "EXPENSE_CATEGORY_KEYS", "Storefront", "StorefrontAsset", "StorefrontRevision", "StorefrontTemplate",
    "BackgroundJob",
    "UNIT_CHOICES", "UNIT_MAX_LENGTH", "DecimalSafeEncoder", "check_constraint",
    "created_at_field", "description_field", "is_active_field", "name_field",
    "phone_field", "price_field", "qty_field", "unit_field", "updated_at_field",
    "Business", "Tenant", "DASHBOARD_SECTIONS", "User",
    "validate_dashboard_permissions",
    "BarcodeSequence", "Category", "Food", "set_food_final_price",
    "Order", "OrderItem", "set_order_item_price",
    "InventoryMovement", "RawMaterial", "StockItem", "UserWarehouse", "Warehouse",
    "PurchaseInvoice", "PurchaseInvoiceItem", "PurchaseReturn", "Supplier",
    "Customer", "Expense", "SalesInvoice", "SalesInvoiceItem", "SalesReturn",
    "Formula", "FormulaLine", "ProductionOrder",
    "LoyaltyMember", "LoyaltySettings", "LoyaltyTransaction",
    "Feedback", "SupportMessage", "SupportTicket",
    "Account", "CostCenter", "JournalEntry", "JournalLine",
    "Carrier", "CashSettlement", "Driver", "LocationPing", "Trip", "TripStop", "Vehicle",
]
