# restaurant/admin.py

from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from django.template.response import TemplateResponse
from .models import (
    # 1. Menu
    Category, Food,
    # 2. Tables
    Table, Reservation,
    # 3. Orders
    Order, OrderItem,
    # 4. Inventory
    RawMaterial, InventoryUsageLog,
    # 5. Semi-Finished
    SemiFinished, SemiFinishedIngredient,
    # 6. Procurement
    Supplier, PurchaseInvoice, PurchaseInvoiceItem,
    # 7. Ready Materials
    ReadyMaterial,
    # 8. Loyalty
    MembershipLevel, CustomerProfile, LoyaltyTransaction,
    Coupon, CustomerCoupon, LoyaltyWallet, WalletTransaction,
    Reward, RewardRedemption, Referral, LoyaltyNotification,
    # 9. Auth
    Restaurant, User,
    # 10. Recipe
    Recipe, RecipeIngredient, RecipeSemiFinished,
    # 11. Inventory Tracking
    InventoryMovement,
    # 12. Kitchen
    KitchenProduct, KitchenInventory,
    ProductionPlan, ProductionPlanItem, ProductionBatch,
    KitchenDiscount, CapacityAnalysis, ProductionLog,
)


# ═══════════════════════════════════════════
#  Site Branding
# ═══════════════════════════════════════════

admin.site.site_header = "مدیریت رستوران"
admin.site.site_title  = "پنل مدیریت"
admin.site.index_title = "داشبورد"


# ═══════════════════════════════════════════
#  1. MENU — Category · Food
# ═══════════════════════════════════════════

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display  = ("name", "is_active", "order", "food_count")
    list_filter   = ("is_active",)
    search_fields = ("name",)
    list_editable = ("is_active", "order")

    def food_count(self, obj):
        return obj.foods.count() if hasattr(obj, 'foods') else obj.food_set.count()
    food_count.short_description = "تعداد غذا"


@admin.register(Food)
class FoodAdmin(admin.ModelAdmin):
    list_display  = ("name", "category", "price", "final_price_display", "is_available", "created_at")
    list_filter   = ("category", "is_available", "created_at")
    search_fields = ("name",)
    list_editable = ("is_available",)
    readonly_fields = ("created_at",)
    list_per_page = 30

    fieldsets = (
        ("اطلاعات غذا", {"fields": ("category", "name", "image", "price", "final_price", "is_available")}),
        ("تاریخ", {"fields": ("created_at",)}),
    )

    def final_price_display(self, obj):
        return f"{int(obj.final_price):,} ت"
    final_price_display.short_description = "قیمت نهایی"


# ═══════════════════════════════════════════
#  2. TABLES & RESERVATIONS
# ═══════════════════════════════════════════

@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display  = ("number", "is_reserved")
    list_editable = ("is_reserved",)


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display    = ("customer_name", "table", "date", "time", "guests", "phone", "created_at")
    list_filter     = ("date", "table")
    search_fields   = ("customer_name", "phone")
    readonly_fields = ("created_at",)
    list_per_page   = 20


# ═══════════════════════════════════════════
#  3. ORDERS
# ═══════════════════════════════════════════

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    fields = ("food", "quantity", "price", "line_total_display")
    readonly_fields = ("price", "line_total_display")
    autocomplete_fields = ("food",)

    def line_total_display(self, obj):
        if obj.price and obj.quantity:
            return f"{int(obj.price * obj.quantity):,} ت"
        return "—"
    line_total_display.short_description = "جمع ردیف"


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "id", "customer_name", "table",
        "status_colored", "items_count",
        "total_price_display", "created_at",
    )
    list_filter     = ("status", "created_at", "table")
    search_fields   = ("customer_name", "phone")
    readonly_fields = ("total_price", "created_at")
    inlines         = [OrderItemInline]
    list_per_page   = 25

    fieldsets = (
        ("مشتری", {"fields": ("customer_name", "phone")}),
        ("سفارش", {"fields": ("table", "status", "total_price")}),
        ("تاریخ", {"fields": ("created_at",)}),
    )

    actions = ["mark_preparing", "mark_ready", "mark_delivered"]

    def status_colored(self, obj):
        colors = {
            "pending":   "#f39c12",
            "confirmed": "#3b82f6",
            "preparing": "#e67e22",
            "ready":     "#2ecc71",
            "delivered": "#95a5a6",
            "cancelled": "#e74c3c",
        }
        c = colors.get(obj.status, "#333")
        return format_html(
            '<span style="color:{};font-weight:700;">{}</span>',
            c, obj.get_status_display(),
        )
    status_colored.short_description = "وضعیت"

    def items_count(self, obj):
        return obj.items.count()
    items_count.short_description = "اقلام"

    def total_price_display(self, obj):
        return f"{int(obj.total_price):,} ت"
    total_price_display.short_description = "مبلغ کل"

    @admin.action(description="در حال آماده‌سازی")
    def mark_preparing(self, request, queryset):
        queryset.filter(status="pending").update(status="preparing")

    @admin.action(description="آماده")
    def mark_ready(self, request, queryset):
        queryset.filter(status="preparing").update(status="ready")

    @admin.action(description="تحویل داده شده")
    def mark_delivered(self, request, queryset):
        queryset.filter(status="ready").update(status="delivered")


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display    = ("order", "food", "quantity", "price_display")
    search_fields   = ("food__name", "order__customer_name")
    autocomplete_fields = ("order", "food")
    list_per_page   = 30

    def price_display(self, obj):
        return f"{int(obj.price):,} ت" if obj.price else "—"
    price_display.short_description = "قیمت واحد"


# ═══════════════════════════════════════════
#  4. RAW MATERIALS & INVENTORY LOG
# ═══════════════════════════════════════════

@admin.register(RawMaterial)
class RawMaterialAdmin(admin.ModelAdmin):
    list_display = (
        "name", "label", "price_display", "unit",
        "quantity", "total_price_display", "stock_badge",
    )
    list_filter   = ("unit",)
    search_fields = ("name", "label")
    list_per_page = 30

    fieldsets = (
        ("اطلاعات", {"fields": ("name", "label")}),
        ("موجودی", {"fields": ("price", "unit", "quantity")}),
    )

    actions = ["reset_quantity"]

    def changelist_view(self, request, extra_context=None):
        context = {
            **self.admin_site.each_context(request),
            "title": "مدیریت مواد اولیه",
            "materials": RawMaterial.objects.all().order_by("name"),
            "unit_choices": RawMaterial.UNIT_CHOICES,
            "opts": self.model._meta,
        }
        return TemplateResponse(request, "restaurant/raw_materials.html", context)

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        extra_context = extra_context or {}
        extra_context["custom_mode"] = True
        return super().changeform_view(request, object_id, form_url, extra_context)

    def price_display(self, obj):
        return f"{int(obj.price):,} ت"
    price_display.short_description = "قیمت واحد"

    def total_price_display(self, obj):
        return f"{int(obj.total_price):,} ت"
    total_price_display.short_description = "ارزش کل"

    def stock_badge(self, obj):
        q = int(obj.quantity)
        if q <= 0:
            return format_html('<span style="color:#e74c3c;font-weight:700;">تمام شده</span>')
        if q < 5:
            return format_html('<span style="color:#f39c12;font-weight:700;">⚠ کمبود</span>')
        return format_html('<span style="color:#2ecc71;">✓ موجود</span>')
    stock_badge.short_description = "وضعیت"

    @admin.action(description="صفر کردن موجودی")
    def reset_quantity(self, request, queryset):
        queryset.update(quantity=0)


@admin.register(InventoryUsageLog)
class InventoryUsageLogAdmin(admin.ModelAdmin):
    list_display    = ("raw_material", "type_badge", "quantity_used", "reference", "used_at")
    list_filter     = ("usage_type", "used_at")
    search_fields   = ("raw_material__name", "reference", "note")
    readonly_fields = ("used_at",)
    list_per_page   = 30

    def changelist_view(self, request, extra_context=None):
        logs = InventoryUsageLog.objects.select_related("raw_material").order_by("-used_at")
        context = {
            **self.admin_site.each_context(request),
            "title": "تاریخچه مصرف انبار",
            "logs": logs,
            "opts": self.model._meta,
        }
        return TemplateResponse(request, "restaurant/usage_log.html", context)

    def type_badge(self, obj):
        colors = {
            "semi_finished": "#3498db",
            "order": "#2ecc71",
            "manual": "#f39c12",
            "waste": "#e74c3c",
        }
        c = colors.get(obj.usage_type, "#333")
        return format_html('<span style="color:{};">{}</span>', c, obj.get_usage_type_display())
    type_badge.short_description = "نوع مصرف"


# ═══════════════════════════════════════════
#  5. SEMI-FINISHED
# ═══════════════════════════════════════════

class SemiFinishedIngredientInline(admin.TabularInline):
    model = SemiFinishedIngredient
    extra = 1
    fields = ("raw_material", "quantity", "cost_display")
    readonly_fields = ("cost_display",)
    autocomplete_fields = ("raw_material",)

    def cost_display(self, obj):
        return f"{int(obj.total_cost):,} ت" if obj.pk else "—"
    cost_display.short_description = "هزینه"


@admin.register(SemiFinished)
class SemiFinishedAdmin(admin.ModelAdmin):
    list_display = (
        "name", "category", "unit", "quantity_produced",
        "ingredients_count", "cost_display", "profit_percentage",
        "suggested_display", "can_produce_display", "created_at",
    )
    list_filter     = ("category", "created_at")
    search_fields   = ("name", "description")
    readonly_fields = ("created_at", "updated_at")
    inlines         = [SemiFinishedIngredientInline]
    list_per_page   = 25

    fieldsets = (
        ("اطلاعات پایه", {"fields": ("name", "category", "description")}),
        ("تولید", {"fields": ("unit", "quantity_produced", "current_stock", "profit_percentage")}),
        ("غذاهای مرتبط", {"fields": ("foods",)}),
        ("تاریخ", {"fields": ("created_at", "updated_at")}),
    )
    filter_horizontal = ("foods",)

    def changelist_view(self, request, extra_context=None):
        context = {
            **self.admin_site.each_context(request),
            "title": "مدیریت مواد نیم‌آماده",
            "semi_finished_list": SemiFinished.objects.all(),
            "raw_materials": RawMaterial.objects.all(),
            "opts": self.model._meta,
        }
        return TemplateResponse(request, "restaurant/semi_finished.html", context)

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        extra_context = extra_context or {}
        extra_context["my_custom_data"] = True
        return super().changeform_view(request, object_id, form_url, extra_context)

    def ingredients_count(self, obj):
        return obj.ingredients.count()
    ingredients_count.short_description = "مواد اولیه"

    def cost_display(self, obj):
        return f"{int(obj.cost_per_unit):,} ت"
    cost_display.short_description = "هزینه/واحد"

    def suggested_display(self, obj):
        return f"{obj.suggested_price:,} ت"
    suggested_display.short_description = "قیمت پیشنهادی"

    def can_produce_display(self, obj):
        qty = obj.can_produce
        if qty == 0:
            return format_html('<span style="color:#e74c3c;">۰</span>')
        return str(qty)
    can_produce_display.short_description = "حداکثر تولید"


@admin.register(SemiFinishedIngredient)
class SemiFinishedIngredientAdmin(admin.ModelAdmin):
    list_display        = ("semi_finished", "raw_material", "quantity", "cost_display")
    search_fields       = ("raw_material__name", "semi_finished__name")
    autocomplete_fields = ("semi_finished", "raw_material")
    list_per_page       = 30

    def cost_display(self, obj):
        return f"{int(obj.total_cost):,} ت"
    cost_display.short_description = "هزینه"


# ═══════════════════════════════════════════
#  6. PROCUREMENT
# ═══════════════════════════════════════════

@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display    = ("name", "phone", "contact_person", "created_at")
    search_fields   = ("name", "phone", "contact_person")
    readonly_fields = ("created_at",)

    fieldsets = (
        ("اطلاعات شرکت", {"fields": ("name", "phone", "address")}),
        ("ارتباطات", {"fields": ("contact_person", "description")}),
        ("تاریخ", {"fields": ("created_at",)}),
    )


class PurchaseInvoiceItemInline(admin.TabularInline):
    model = PurchaseInvoiceItem
    extra = 1
    fields = ("item_name", "quantity", "unit", "unit_price", "line_display")
    readonly_fields = ("line_display",)

    def line_display(self, obj):
        return f"{int(obj.line_total):,} ت" if obj.pk else "—"
    line_display.short_description = "جمع ردیف"


@admin.register(PurchaseInvoice)
class PurchaseInvoiceAdmin(admin.ModelAdmin):
    list_display    = ("supplier_name", "invoice_number", "date", "items_count", "total_display", "created_at")
    list_filter     = ("date", "created_at")
    search_fields   = ("supplier_name", "invoice_number", "description")
    readonly_fields = ("created_at",)
    inlines         = [PurchaseInvoiceItemInline]
    list_per_page   = 20

    fieldsets = (
        ("فاکتور", {"fields": ("supplier_name", "invoice_number", "date")}),
        ("توضیحات و فایل", {"fields": ("description", "file")}),
        ("تاریخ", {"fields": ("created_at",)}),
    )

    def changelist_view(self, request, extra_context=None):
        context = {
            **self.admin_site.each_context(request),
            "title": "فاکتورهای خرید",
            "invoices": PurchaseInvoice.objects.all(),
            "opts": self.model._meta,
        }
        return TemplateResponse(request, "restaurant/create_invoice.html", context)

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        extra_context = extra_context or {}
        extra_context["my_custom_data"] = True
        return super().changeform_view(request, object_id, form_url, extra_context)

    def items_count(self, obj):
        return obj.items.count()
    items_count.short_description = "اقلام"

    def total_display(self, obj):
        return f"{int(obj.total_amount):,} ت"
    total_display.short_description = "مبلغ کل"


@admin.register(PurchaseInvoiceItem)
class PurchaseInvoiceItemAdmin(admin.ModelAdmin):
    list_display    = ("invoice", "item_name", "quantity", "unit", "unit_price_display", "line_display")
    search_fields   = ("item_name", "invoice__supplier_name")
    list_per_page   = 30

    def unit_price_display(self, obj):
        return f"{int(obj.unit_price):,} ت"
    unit_price_display.short_description = "قیمت واحد"

    def line_display(self, obj):
        return f"{int(obj.line_total):,} ت"
    line_display.short_description = "جمع"


# ═══════════════════════════════════════════
#  7. READY MATERIALS
# ═══════════════════════════════════════════

@admin.register(ReadyMaterial)
class ReadyMaterialAdmin(admin.ModelAdmin):
    list_display = (
        "name", "unit", "quantity", "purchase_price",
        "selling_price", "stock_status_display", "supplier", "is_active",
    )
    list_filter     = ("unit", "is_active", "supplier", "created_at")
    search_fields   = ("name", "barcode", "description")
    list_editable   = ("is_active",)
    readonly_fields = ("created_at", "updated_at")
    list_per_page   = 30

    fieldsets = (
        ("اطلاعات پایه", {"fields": ("name", "description", "unit", "barcode")}),
        ("قیمت‌گذاری", {"fields": ("purchase_price", "selling_price")}),
        ("موجودی", {"fields": ("quantity", "minimum_stock")}),
        ("تأمین‌کننده و ارتباط", {"fields": ("supplier", "category", "source_raw_material", "consume_quantity")}),
        ("وضعیت", {"fields": ("is_active",)}),
        ("تاریخ", {"fields": ("created_at", "updated_at")}),
    )

    def stock_status_display(self, obj):
        status = obj.stock_status
        if status == "out":
            return format_html('<span style="color:#dc2626;font-weight:700;">ناموجود</span>')
        elif status == "low":
            return format_html('<span style="color:#f59e0b;font-weight:700;">کم</span>')
        return format_html('<span style="color:#16a34a;font-weight:700;">موجود</span>')
    stock_status_display.short_description = "وضعیت موجودی"


# ═══════════════════════════════════════════
#  8. LOYALTY SYSTEM
# ═══════════════════════════════════════════

@admin.register(MembershipLevel)
class MembershipLevelAdmin(admin.ModelAdmin):
    list_display = (
        "icon", "title", "name", "min_spending_display", "min_points",
        "discount_percent", "points_multiplier", "cashback_rate",
        "free_delivery", "priority_support", "order",
    )
    list_editable = ("order",)
    search_fields = ("title", "name")
    list_per_page = 10

    fieldsets = (
        ("پایه", {"fields": ("name", "title", "icon", "color", "order")}),
        ("شرایط ارتقا", {"fields": ("min_spending", "min_points")}),
        ("مزایا", {"fields": ("discount_percent", "points_multiplier", "cashback_rate", "free_delivery", "priority_support")}),
        ("توضیحات", {"fields": ("description",)}),
    )

    def min_spending_display(self, obj):
        return f"{int(obj.min_spending):,} ت"
    min_spending_display.short_description = "حداقل خرید"


class LoyaltyTxInline(admin.TabularInline):
    model = LoyaltyTransaction
    extra = 0
    fields = ("transaction_type", "points", "balance_after", "description", "created_at")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)

    def has_add_permission(self, request, obj=None):
        return False


class CustCouponInline(admin.TabularInline):
    model = CustomerCoupon
    extra = 0
    fields = ("coupon", "used_count", "first_used_at", "last_used_at")
    readonly_fields = ("first_used_at", "last_used_at")


@admin.register(CustomerProfile)
class CustomerProfileAdmin(admin.ModelAdmin):
    list_display = (
        "phone", "full_name", "level_display", "total_points",
        "available_points", "spending_display", "total_orders",
        "referral_code", "is_active", "joined_at",
    )
    list_filter     = ("membership_level", "is_active", "joined_at")
    search_fields   = ("phone", "first_name", "last_name", "email", "referral_code")
    readonly_fields = ("referral_code", "total_points", "available_points", "total_spending", "total_orders", "joined_at", "updated_at")
    inlines         = [LoyaltyTxInline, CustCouponInline]
    list_per_page   = 25

    fieldsets = (
        ("اطلاعات شخصی", {"fields": ("phone", "email", "first_name", "last_name", "birth_date", "profile_image")}),
        ("باشگاه", {"fields": ("membership_level", "total_points", "available_points", "total_spending", "total_orders")}),
        ("دعوت", {"fields": ("referral_code", "referred_by")}),
        ("وضعیت", {"fields": ("notes", "is_active")}),
        ("تاریخ", {"fields": ("joined_at", "updated_at")}),
    )

    actions = ["activate", "deactivate"]

    def full_name(self, obj):
        return obj.full_name or "—"
    full_name.short_description = "نام"

    def level_display(self, obj):
        if obj.membership_level:
            return f"{obj.membership_level.icon} {obj.membership_level.title}"
        return "—"
    level_display.short_description = "سطح"

    def spending_display(self, obj):
        return f"{int(obj.total_spending):,} ت"
    spending_display.short_description = "مجموع خرید"

    @admin.action(description="فعال‌سازی")
    def activate(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="غیرفعال‌سازی")
    def deactivate(self, request, queryset):
        queryset.update(is_active=False)


@admin.register(LoyaltyTransaction)
class LoyaltyTransactionAdmin(admin.ModelAdmin):
    list_display    = ("customer", "type_badge", "points", "balance_after", "description", "created_at")
    list_filter     = ("transaction_type", "created_at")
    search_fields   = ("customer__phone", "customer__first_name", "description")
    readonly_fields = ("created_at",)
    list_per_page   = 30

    def type_badge(self, obj):
        credits = ("earn", "referral", "birthday", "cashback", "bonus")
        if obj.transaction_type in credits:
            return format_html('<span style="color:#2ecc71;">+{} {}</span>', obj.points, obj.get_transaction_type_display())
        return format_html('<span style="color:#e74c3c;">-{} {}</span>', obj.points, obj.get_transaction_type_display())
    type_badge.short_description = "نوع"


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = (
        "code", "name", "coupon_type", "discount_type",
        "discount_value_display", "usage_display",
        "validity_badge", "is_active", "valid_from", "valid_until",
    )
    list_filter         = ("coupon_type", "discount_type", "is_active")
    search_fields       = ("code", "name")
    list_editable       = ("is_active",)
    filter_horizontal   = ("applicable_levels",)
    readonly_fields     = ("used_count", "created_at", "updated_at")
    list_per_page       = 20

    fieldsets = (
        ("پایه", {"fields": ("code", "name", "description", "coupon_type")}),
        ("تخفیف", {"fields": ("discount_type", "discount_value", "max_discount_amount", "min_order_amount")}),
        ("محدودیت", {"fields": ("max_uses", "max_uses_per_customer", "used_count")}),
        ("زمان", {"fields": ("valid_from", "valid_until")}),
        ("وضعیت", {"fields": ("is_active", "applicable_levels")}),
        ("تاریخ", {"fields": ("created_at", "updated_at")}),
    )

    def discount_value_display(self, obj):
        if obj.discount_type == "percentage":
            return f"{obj.discount_value}%"
        return f"{int(obj.discount_value):,} ت"
    discount_value_display.short_description = "مقدار تخفیف"

    def usage_display(self, obj):
        return f"{obj.used_count} / {obj.max_uses}"
    usage_display.short_description = "استفاده"

    def validity_badge(self, obj):
        if obj.is_valid:
            return format_html('<span style="color:#2ecc71;font-weight:700;">✓ معتبر</span>')
        return format_html('<span style="color:#e74c3c;">✗ نامعتبر</span>')
    validity_badge.short_description = "اعتبار"


@admin.register(CustomerCoupon)
class CustomerCouponAdmin(admin.ModelAdmin):
    list_display  = ("customer", "coupon", "used_count", "first_used_at", "last_used_at")
    search_fields = ("customer__phone", "coupon__code")
    list_per_page = 30


class WalletTxInline(admin.TabularInline):
    model = WalletTransaction
    extra = 0
    fields = ("transaction_type", "amount", "balance_after", "description", "created_at")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(LoyaltyWallet)
class LoyaltyWalletAdmin(admin.ModelAdmin):
    list_display    = ("customer", "balance_display", "updated_at")
    search_fields   = ("customer__phone",)
    readonly_fields = ("updated_at",)
    inlines         = [WalletTxInline]

    def balance_display(self, obj):
        return f"{int(obj.balance):,} ت"
    balance_display.short_description = "موجودی"


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display    = ("wallet", "type_badge", "amount_display", "balance_display", "description", "created_at")
    list_filter     = ("transaction_type", "created_at")
    search_fields   = ("wallet__customer__phone", "description")
    readonly_fields = ("created_at",)
    list_per_page   = 30

    def type_badge(self, obj):
        credits = ("deposit", "cashback", "refund", "reward")
        if obj.transaction_type in credits:
            return format_html('<span style="color:#2ecc71;">+{}</span>', f"{int(obj.amount):,}")
        return format_html('<span style="color:#e74c3c;">-{}</span>', f"{int(obj.amount):,}")
    type_badge.short_description = "نوع"

    def amount_display(self, obj):
        return f"{int(obj.amount):,} ت"
    amount_display.short_description = "مبلغ"

    def balance_display(self, obj):
        return f"{int(obj.balance_after):,} ت"
    balance_display.short_description = "مانده"


@admin.register(Reward)
class RewardAdmin(admin.ModelAdmin):
    list_display = (
        "name", "category", "points_display", "value_display",
        "qty_display", "min_membership_level", "available_badge", "is_active",
    )
    list_filter   = ("category", "is_active")
    search_fields = ("name", "description")
    list_editable = ("is_active",)
    list_per_page = 20

    fieldsets = (
        ("پایه", {"fields": ("name", "description", "category", "image")}),
        ("ارزش", {"fields": ("points_required", "value")}),
        ("محدودیت", {"fields": ("quantity_available", "min_membership_level")}),
        ("وضعیت", {"fields": ("is_active",)}),
    )

    def points_display(self, obj):
        return f"{int(obj.points_required):,} امتیاز"
    points_display.short_description = "امتیاز لازم"

    def value_display(self, obj):
        return f"{int(obj.value):,} ت"
    value_display.short_description = "ارزش"

    def qty_display(self, obj):
        return "نامحدود" if obj.quantity_available == -1 else str(obj.quantity_available)
    qty_display.short_description = "موجودی"

    def available_badge(self, obj):
        if obj.is_available:
            return format_html('<span style="color:#2ecc71;">✓</span>')
        return format_html('<span style="color:#e74c3c;">✗</span>')
    available_badge.short_description = "قابل استفاده"


@admin.register(RewardRedemption)
class RewardRedemptionAdmin(admin.ModelAdmin):
    list_display    = ("customer", "reward", "points_spent", "status_badge", "redeemed_at")
    list_filter     = ("status", "redeemed_at")
    search_fields   = ("customer__phone", "reward__name")
    readonly_fields = ("redeemed_at",)
    list_per_page   = 20

    def status_badge(self, obj):
        colors = {"pending": "#f39c12", "approved": "#2ecc71", "used": "#3498db", "cancelled": "#95a5a6"}
        c = colors.get(obj.status, "#333")
        return format_html('<span style="color:{};font-weight:700;">{}</span>', c, obj.get_status_display())
    status_badge.short_description = "وضعیت"


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display    = ("referrer", "referred", "referral_code", "bonus_points", "is_rewarded", "rewarded_at", "created_at")
    list_filter     = ("is_rewarded", "created_at")
    search_fields   = ("referrer__phone", "referred__phone", "referral_code")
    readonly_fields = ("created_at",)
    list_per_page   = 20


@admin.register(LoyaltyNotification)
class LoyaltyNotificationAdmin(admin.ModelAdmin):
    list_display    = ("customer", "channel", "notification_type", "title", "read_badge", "sent_badge", "created_at")
    list_filter     = ("channel", "notification_type", "is_read", "is_sent", "created_at")
    search_fields   = ("customer__phone", "title", "message")
    readonly_fields = ("created_at",)
    list_per_page   = 30

    fieldsets = (
        ("گیرنده", {"fields": ("customer",)}),
        ("اعلان", {"fields": ("channel", "notification_type", "title", "message")}),
        ("داده", {"fields": ("data",)}),
        ("وضعیت", {"fields": ("is_read", "is_sent", "sent_at")}),
        ("تاریخ", {"fields": ("created_at",)}),
    )

    actions = ["mark_read", "mark_sent"]

    def read_badge(self, obj):
        if obj.is_read:
            return format_html('<span style="color:#2ecc71;">✓</span>')
        return format_html('<span style="color:#e74c3c;font-weight:700;">●</span>')
    read_badge.short_description = "خوانده"

    def sent_badge(self, obj):
        if obj.is_sent:
            return format_html('<span style="color:#2ecc71;">✓</span>')
        return format_html('<span style="color:#95a5a6;">✗</span>')
    sent_badge.short_description = "ارسال"

    @admin.action(description="علامت خوانده‌شده")
    def mark_read(self, request, queryset):
        queryset.update(is_read=True)

    @admin.action(description="علامت ارسال‌شده")
    def mark_sent(self, request, queryset):
        queryset.update(is_sent=True, sent_at=timezone.now())


# ═══════════════════════════════════════════
#  9. AUTHENTICATION
# ═══════════════════════════════════════════

@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display    = ("name", "phone", "is_active", "users_count", "created_at")
    list_filter     = ("is_active",)
    search_fields   = ("name", "phone", "address")
    list_editable   = ("is_active",)
    readonly_fields = ("created_at",)

    def users_count(self, obj):
        return obj.users.count()
    users_count.short_description = "کاربران"


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = (
        "username", "get_full_name", "phone_number",
        "role_badge", "restaurant", "is_active", "is_verified", "created_at",
    )
    list_filter     = ("role", "is_active", "is_verified", "restaurant")
    search_fields   = ("username", "first_name", "last_name", "phone_number", "email")
    list_editable   = ("is_active", "is_verified")
    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        ("کاربری", {"fields": ("username", "password", "first_name", "last_name", "email")}),
        ("تماس", {"fields": ("phone_number", "profile_image")}),
        ("نقش", {"fields": ("role", "restaurant")}),
        ("وضعیت", {"fields": ("is_active", "is_staff", "is_superuser", "is_verified")}),
        ("تاریخ", {"fields": ("created_at", "updated_at")}),
    )

    def role_badge(self, obj):
        colors = {
            "owner": "#8e44ad", "manager": "#2980b9", "cashier": "#27ae60",
            "kitchen": "#e67e22", "warehouse": "#16a085", "customer": "#95a5a6",
        }
        c = colors.get(obj.role, "#333")
        return format_html('<span style="color:{};font-weight:700;">{}</span>', c, obj.get_role_display())
    role_badge.short_description = "نقش"


# ═══════════════════════════════════════════
#  10. RECIPE ENGINE
# ═══════════════════════════════════════════

class RecipeIngredientInline(admin.TabularInline):
    model = RecipeIngredient
    extra = 1
    fields = ("raw_material", "quantity", "unit", "wastage_percent", "effective_qty_display", "cost_display", "optional", "notes")
    readonly_fields = ("effective_qty_display", "cost_display")
    autocomplete_fields = ("raw_material",)

    def effective_qty_display(self, obj):
        return f"{obj.effective_quantity:.2f}" if obj.pk else "—"
    effective_qty_display.short_description = "مقدار واقعی"

    def cost_display(self, obj):
        return f"{int(obj.total_cost):,} ت" if obj.pk else "—"
    cost_display.short_description = "هزینه"


class RecipeSemiFinishedInline(admin.TabularInline):
    model = RecipeSemiFinished
    extra = 0
    fields = ("semi_finished", "quantity", "unit", "cost_display")
    readonly_fields = ("cost_display",)
    autocomplete_fields = ("semi_finished",)

    def cost_display(self, obj):
        return f"{int(obj.total_cost):,} ت" if obj.pk else "—"
    cost_display.short_description = "هزینه"


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = (
        "id", "food_name", "version", "ingredients_count", "semi_count",
        "total_cost_display", "cost_per_serving_display",
        "suggested_price_display", "margin_display", "is_active", "updated_at",
    )
    list_filter     = ("is_active", "version", "created_at")
    search_fields   = ("food__name", "instructions", "notes")
    readonly_fields = (
        "total_raw_material_cost", "total_semi_finished_cost",
        "total_cost", "cost_per_serving", "suggested_price",
        "created_at", "updated_at",
    )
    autocomplete_fields = ("food", "restaurant")
    inlines         = [RecipeIngredientInline, RecipeSemiFinishedInline]
    list_per_page   = 25

    fieldsets = (
        ("پایه", {"fields": ("restaurant", "food", "version", "is_active")}),
        ("جزئیات", {"fields": ("yield_quantity", "estimated_preparation_time", "instructions", "notes")}),
        ("هزینه‌ها (محاسبه‌شده)", {
            "fields": ("total_raw_material_cost", "total_semi_finished_cost", "total_cost", "cost_per_serving", "suggested_price"),
            "classes": ("collapse",),
        }),
        ("تاریخ", {"fields": ("created_at", "updated_at")}),
    )

    actions = ["recalculate"]

    def food_name(self, obj):
        return obj.food.name
    food_name.short_description = "غذا"
    food_name.admin_order_field = "food__name"

    def ingredients_count(self, obj):
        return f"{obj.ingredients.count()} ماده"
    ingredients_count.short_description = "مواد اولیه"

    def semi_count(self, obj):
        return f"{obj.semi_finished_items.count()} نیم‌آماده"
    semi_count.short_description = "نیم‌آماده"

    def total_cost_display(self, obj):
        return f"{int(obj.total_cost):,} ت"
    total_cost_display.short_description = "هزینه کل"

    def cost_per_serving_display(self, obj):
        return f"{int(obj.cost_per_serving):,} ت"
    cost_per_serving_display.short_description = "هزینه هر سرو"

    def suggested_price_display(self, obj):
        return f"{int(obj.suggested_price):,} ت"
    suggested_price_display.short_description = "قیمت پیشنهادی"

    def margin_display(self, obj):
        m = obj.profit_margin
        if m > 0:
            return format_html('<span style="color:#2ecc71;font-weight:700;">{:.1f}%</span>', m)
        return format_html('<span style="color:#e74c3c;">{:.1f}%</span>', m)
    margin_display.short_description = "حاشیه سود"

    @admin.action(description="محاسبه مجدد هزینه‌ها")
    def recalculate(self, request, queryset):
        for recipe in queryset:
            recipe.recalculate_cost()
        self.message_user(request, f"{queryset.count()} ریسیپت محاسبه شد.")


@admin.register(RecipeIngredient)
class RecipeIngredientAdmin(admin.ModelAdmin):
    list_display = ("recipe_food", "raw_material", "quantity", "unit", "wastage_percent", "effective_display", "cost_display", "optional")
    search_fields       = ("raw_material__name", "recipe__food__name")
    autocomplete_fields = ("recipe", "raw_material")
    list_per_page       = 30

    def recipe_food(self, obj):
        return obj.recipe.food.name
    recipe_food.short_description = "غذا"
    recipe_food.admin_order_field = "recipe__food__name"

    def effective_display(self, obj):
        return f"{obj.effective_quantity:.2f}"
    effective_display.short_description = "مقدار واقعی"

    def cost_display(self, obj):
        return f"{int(obj.total_cost):,} ت"
    cost_display.short_description = "هزینه"


@admin.register(RecipeSemiFinished)
class RecipeSemiFinishedAdmin(admin.ModelAdmin):
    list_display        = ("recipe_food", "semi_finished", "quantity", "unit", "cost_display")
    search_fields       = ("semi_finished__name", "recipe__food__name")
    autocomplete_fields = ("recipe", "semi_finished")
    list_per_page       = 30

    def recipe_food(self, obj):
        return obj.recipe.food.name
    recipe_food.short_description = "غذا"

    def cost_display(self, obj):
        return f"{int(obj.total_cost):,} ت"
    cost_display.short_description = "هزینه"


# ═══════════════════════════════════════════
#  11. INVENTORY TRACKING
# ═══════════════════════════════════════════

@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = (
        "raw_material", "movement_badge", "quantity",
        "previous_stock", "new_stock", "reference_type",
        "created_by", "created_at",
    )
    list_filter     = ("movement_type", "created_at")
    search_fields   = ("raw_material__name", "notes")
    readonly_fields = ("created_at",)
    list_per_page   = 30

    def movement_badge(self, obj):
        colors = {
            "in": "#2ecc71", "out": "#e74c3c", "waste": "#c0392b",
            "adjustment": "#f39c12", "production": "#3498db", "order_usage": "#9b59b6",
        }
        c = colors.get(obj.movement_type, "#333")
        return format_html('<span style="color:{};font-weight:700;">{}</span>', c, obj.get_movement_type_display())
    movement_badge.short_description = "نوع"


# ═══════════════════════════════════════════
#  12. KITCHEN MANAGEMENT
# ═══════════════════════════════════════════

class KitchenInventoryInline(admin.StackedInline):
    model = KitchenInventory
    extra = 0
    readonly_fields = ("updated_at",)
    fields = ("quantity", "reserved_quantity", "low_stock_threshold", "updated_at")


@admin.register(KitchenProduct)
class KitchenProductAdmin(admin.ModelAdmin):
    list_display = (
        "name", "category", "recipe_name", "selling_price",
        "cost_display", "profit_display", "stock_display",
        "capacity_display", "is_active",
    )
    list_filter         = ("category", "is_active", "created_at")
    search_fields       = ("name", "description", "recipe__food__name")
    list_editable       = ("selling_price", "is_active")
    readonly_fields     = ("created_at", "updated_at")
    autocomplete_fields = ("recipe",)
    inlines             = [KitchenInventoryInline]
    list_per_page       = 25

    fieldsets = (
        ("پایه", {"fields": ("name", "recipe", "category", "description", "image")}),
        ("قیمت", {"fields": ("selling_price",)}),
        ("وضعیت", {"fields": ("is_active", "created_at", "updated_at")}),
    )

    def recipe_name(self, obj):
        return obj.recipe.food.name if obj.recipe else "—"
    recipe_name.short_description = "دستور"

    def cost_display(self, obj):
        try:
            return f"{int(obj.calculate_cost()):,} ت"
        except Exception:
            return "—"
    cost_display.short_description = "هزینه تولید"

    def profit_display(self, obj):
        try:
            p = obj.calculate_profit()
            if p > 0:
                return format_html('<span style="color:#2ecc71;font-weight:700;">{:,} ت</span>', p)
            return format_html('<span style="color:#e74c3c;">{:,} ت</span>', p)
        except Exception:
            return "—"
    profit_display.short_description = "سود واحد"

    def stock_display(self, obj):
        try:
            inv = obj.get_inventory()
            qty = inv.available_quantity
            if inv.is_low_stock:
                return format_html('<span style="color:#e74c3c;font-weight:700;">⚠ {}</span>', qty)
            if qty > 0:
                return format_html('<span style="color:#2ecc71;">{}</span>', qty)
            return format_html('<span style="color:#95a5a6;">۰</span>')
        except Exception:
            return "—"
    stock_display.short_description = "موجودی"

    def capacity_display(self, obj):
        try:
            mx, lim = obj.calculate_max_production()
            if lim:
                return f"{mx} (محدود: {lim['name']})"
            return str(mx)
        except Exception:
            return "—"
    capacity_display.short_description = "ظرفیت"


@admin.register(KitchenInventory)
class KitchenInventoryAdmin(admin.ModelAdmin):
    list_display    = ("kitchen_product", "quantity", "reserved_quantity", "available_qty", "low_stock_threshold", "status_badge", "updated_at")
    search_fields   = ("kitchen_product__name",)
    readonly_fields = ("updated_at",)
    list_per_page   = 25

    def available_qty(self, obj):
        return obj.available_quantity
    available_qty.short_description = "قابل فروش"

    def status_badge(self, obj):
        if obj.is_low_stock:
            return format_html('<span style="color:#e74c3c;font-weight:700;">⚠ کمبود</span>')
        if obj.available_quantity > 0:
            return format_html('<span style="color:#2ecc71;">✓ موجود</span>')
        return format_html('<span style="color:#95a5a6;">✗ ناموجود</span>')
    status_badge.short_description = "وضعیت"


class PlanItemInline(admin.TabularInline):
    model = ProductionPlanItem
    extra = 1
    fields = ("kitchen_product", "quantity")
    autocomplete_fields = ("kitchen_product",)


@admin.register(ProductionPlan)
class ProductionPlanAdmin(admin.ModelAdmin):
    list_display    = ("id", "date", "status_badge", "created_by", "items_count", "created_at")
    list_filter     = ("status", "date")
    search_fields   = ("notes", "created_by__username")
    readonly_fields = ("created_at", "updated_at")
    inlines         = [PlanItemInline]
    list_per_page   = 20

    fieldsets = (
        ("برنامه", {"fields": ("date", "status", "notes")}),
        ("تاریخ", {"fields": ("created_at", "updated_at")}),
    )

    def status_badge(self, obj):
        colors = {"draft": "#95a5a6", "approved": "#f39c12", "completed": "#2ecc71", "cancelled": "#e74c3c"}
        c = colors.get(obj.status, "#333")
        return format_html('<span style="color:{};font-weight:700;">{}</span>', c, obj.get_status_display())
    status_badge.short_description = "وضعیت"

    def items_count(self, obj):
        return obj.items.count()
    items_count.short_description = "اقلام"


@admin.register(ProductionPlanItem)
class ProductionPlanItemAdmin(admin.ModelAdmin):
    list_display        = ("production_plan", "kitchen_product", "quantity")
    list_filter         = ("production_plan__date",)
    search_fields       = ("kitchen_product__name",)
    autocomplete_fields = ("production_plan", "kitchen_product")


@admin.register(ProductionBatch)
class ProductionBatchAdmin(admin.ModelAdmin):
    list_display    = ("id", "kitchen_product", "quantity_produced", "cost_display", "produced_by", "produced_at")
    list_filter     = ("produced_at",)
    search_fields   = ("kitchen_product__name", "produced_by__username", "notes")
    readonly_fields = ("produced_at",)
    list_per_page   = 30

    def cost_display(self, obj):
        return f"{obj.production_cost:,} ت"
    cost_display.short_description = "هزینه"


@admin.register(KitchenDiscount)
class KitchenDiscountAdmin(admin.ModelAdmin):
    list_display  = ("name", "product_display", "discount_type", "scope", "value_display", "is_active")
    list_filter   = ("discount_type", "scope", "is_active")
    search_fields = ("name", "kitchen_product__name")
    list_editable = ("is_active",)
    list_per_page = 20

    fieldsets = (
        ("پایه", {"fields": ("name", "kitchen_product", "discount_type", "scope", "value")}),
        ("محدودیت", {"fields": ("max_quantity", "minimum_stock", "start_time", "end_time", "expires_at")}),
        ("وضعیت", {"fields": ("is_active",)}),
    )

    def product_display(self, obj):
        return obj.kitchen_product.name if obj.kitchen_product else "همه"
    product_display.short_description = "محصول"

    def value_display(self, obj):
        if obj.discount_type == "percentage":
            return f"{obj.value}%"
        return f"{int(obj.value):,} ت"
    value_display.short_description = "مقدار"


@admin.register(CapacityAnalysis)
class CapacityAnalysisAdmin(admin.ModelAdmin):
    list_display    = ("kitchen_product", "max_production_quantity", "limiting_material_name", "limiting_material_type", "calculated_at")
    search_fields   = ("kitchen_product__name", "limiting_material_name")
    readonly_fields = ("calculated_at",)
    list_per_page   = 25


@admin.register(ProductionLog)
class ProductionLogAdmin(admin.ModelAdmin):
    list_display  = ("id", "user", "product_name", "action_badge", "quantity", "details_short", "created_at")
    list_filter   = ("action", "created_at")
    search_fields = ("kitchen_product__name", "user__username", "user__first_name", "details")
    readonly_fields = ("created_at", "materials_consumed")
    list_per_page = 30

    def product_name(self, obj):
        return obj.kitchen_product.name if obj.kitchen_product else "—"
    product_name.short_description = "محصول"

    def action_badge(self, obj):
        colors = {
            "produce": "#2ecc71", "plan_create": "#3498db",
            "plan_approve": "#f39c12", "plan_execute": "#8e44ad", "adjust": "#e74c3c",
        }
        c = colors.get(obj.action, "#333")
        return format_html('<span style="color:{};font-weight:700;">{}</span>', c, obj.get_action_display())
    action_badge.short_description = "عملیات"

    def details_short(self, obj):
        text = obj.details or "—"
        return text[:50] + "..." if len(text) > 50 else text
    details_short.short_description = "جزئیات"