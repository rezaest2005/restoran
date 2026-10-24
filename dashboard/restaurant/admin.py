# restaurant/admin.py — نسخه تمیز
from django.contrib import admin
from .models import (
    Restaurant,
    User,
    Category,
    Food,
    Order,
    OrderItem,
    RawMaterial,
    Supplier,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    InventoryMovement,
    Tenant,
    Warehouse,
    StockItem,
)


# ─── Restaurant ──────────────────────

@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "phone", "is_active", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "slug", "phone"]


# ─── User ────────────────────────────

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["username", "get_full_name", "role", "restaurant", "is_active", "is_approved"]
    list_filter = ["role", "is_active", "is_approved"]
    search_fields = ["username", "first_name", "last_name", "phone_number"]


# ─── Category ────────────────────────

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "restaurant", "order", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name"]


# ─── Food (Product) ──────────────────

@admin.register(Food)
class FoodAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "price", "final_price", "stock", "is_available"]
    list_filter = ["is_available", "category"]
    search_fields = ["name", "name_en"]


# ─── Order ───────────────────────────

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["id", "customer_name", "status", "payment_status", "total_price", "created_at"]
    list_filter = ["status", "payment_status", "payment_method", "source"]
    search_fields = ["customer_name", "phone"]
    date_hierarchy = "created_at"


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ["order", "item_name", "quantity", "price"]
    search_fields = ["item_name"]


# ─── RawMaterial ─────────────────────

@admin.register(RawMaterial)
class RawMaterialAdmin(admin.ModelAdmin):
    list_display = ["name", "quantity", "unit", "price", "minimum_stock"]
    search_fields = ["name", "label"]


# ─── Supplier ────────────────────────

@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "contact_person"]
    search_fields = ["name", "phone"]


# ─── Purchase ────────────────────────

@admin.register(PurchaseInvoice)
class PurchaseInvoiceAdmin(admin.ModelAdmin):
    list_display = ["supplier_name", "invoice_number", "date"]
    search_fields = ["supplier_name", "invoice_number"]
    date_hierarchy = "date"


@admin.register(PurchaseInvoiceItem)
class PurchaseInvoiceItemAdmin(admin.ModelAdmin):
    list_display = ["invoice", "item_name", "quantity", "unit_price"]
    search_fields = ["item_name"]


# ─── Inventory ───────────────────────

@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ["raw_material", "movement_type", "quantity", "created_at"]
    list_filter = ["movement_type"]
    date_hierarchy = "created_at"


# ─── Warehouse ───────────────────────

@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ["name", "warehouse_type", "is_mother", "is_active"]
    list_filter = ["is_mother", "is_active"]


@admin.register(StockItem)
class StockItemAdmin(admin.ModelAdmin):
    list_display = ["raw_material", "warehouse", "quantity", "updated_at"]
    list_filter = ["warehouse"]


# ─── Tenant ──────────────────────────

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "is_active", "created_at"]
    list_filter = ["is_active"]