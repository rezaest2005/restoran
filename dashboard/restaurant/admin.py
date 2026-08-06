"""
restaurant/admin.py — Multi-tenant Admin

★ تغییرات نسبت به نسخه قبل:
  ۱. Order: فیلدهای source, payment_status, payment_method, confirmed_by, updated_at اضافه شد
  ۲. OrderItem: فیلد item_name + display_name اضافه شد
  ۳. PurchaseInvoice: FK جدید supplier اضافه شد
  ۴. RawMaterial: فیلدهای created_at, updated_at نمایش داده می‌شود
  ۵. LoyaltyTransaction: order از IntegerField به ForeignKey تغییر کرد
  ۶. WalletTransaction: مشابه بالا
  ۷. مدل‌های جدید OnlineOrderSettings, Service, Tenant, TenantService ثبت شدند
  ۸. OrderAdmin: فیلدهای به‌روز شده در fieldsets و list_display
"""

from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from django.utils.safestring import mark_safe
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
    # 9. Auth (shared — بدون tenant)
    Restaurant, User,
    # 10. Recipe
    Recipe, RecipeIngredient, RecipeSemiFinished, RecipePackagingItem,
    # 11. Inventory Tracking
    InventoryMovement,
    # 12. Kitchen
    KitchenProduct, KitchenInventory,
    ProductionPlan, ProductionPlanItem, ProductionBatch,
    ProductionLog, WasteLog,
    # 12.5 Online Settings
    OnlineOrderSettings,
    # 13. Day Close
    DayCloseReport, DayCloseLog,
    # 14. Dictionary
    DictionaryGroup, ItemDictionary,
    # 15. Super Admin Panel
    Service, Tenant, TenantService,
)
from .models import UNIT_CHOICES  # ثابت سطح ماژول


# ═══════════════════════════════════════════
#  Site Branding
# ═══════════════════════════════════════════

admin.site.site_header = "مدیریت رستوران"
admin.site.site_title  = "پنل مدیریت"
admin.site.index_title = "داشبورد"


# ═══════════════════════════════════════════
#  Tenant-aware base
# ═══════════════════════════════════════════

class TenantModelAdmin(admin.ModelAdmin):
    """ادمین پایه برای مدل‌های Tenant — نمایش all_objects"""
    def get_queryset(self, request):
        return self.model.all_objects.get_queryset()


# ═══════════════════════════════════════════
#  1. MENU
# ═══════════════════════════════════════════

@admin.register(Category)
class CategoryAdmin(TenantModelAdmin):
    list_display  = ("name", "restaurant", "is_active", "order", "food_count")
    list_filter   = ("restaurant", "is_active")
    search_fields = ("name",)
    list_editable = ("is_active", "order")

    def food_count(self, obj):
        return obj.foods.count()
    food_count.short_description = "تعداد غذا"


@admin.register(Food)
class FoodAdmin(TenantModelAdmin):
    list_display  = ("name", "restaurant", "category", "price", "final_price_display", "is_available", "created_at")
    list_filter   = ("restaurant", "category", "is_available", "created_at")
    search_fields = ("name",)
    list_editable = ("is_available",)
    readonly_fields = ("created_at",)
    list_per_page = 30

    fieldsets = (
        ("اطلاعات غذا", {"fields": ("restaurant", "category", "name", "image", "price", "final_price", "is_available")}),
        ("تاریخ", {"fields": ("created_at",)}),
    )

    def final_price_display(self, obj):
        return f"{int(obj.final_price):,} ت"
    final_price_display.short_description = "قیمت نهایی"


# ═══════════════════════════════════════════
#  2. TABLES & RESERVATIONS
# ═══════════════════════════════════════════

@admin.register(Table)
class TableAdmin(TenantModelAdmin):
    list_display  = ("number", "restaurant", "is_reserved")
    list_filter   = ("restaurant",)
    list_editable = ("is_reserved",)


@admin.register(Reservation)
class ReservationAdmin(TenantModelAdmin):
    list_display    = ("customer_name", "restaurant", "table", "date", "time", "guests", "phone", "created_at")
    list_filter     = ("restaurant", "date", "table")
    search_fields   = ("customer_name", "phone")
    readonly_fields = ("created_at",)
    list_per_page   = 20


# ═══════════════════════════════════════════
#  3. ORDERS — ★ اصلاح‌شده
# ═══════════════════════════════════════════

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    # ★ FIXED: item_name اضافه شد
    fields = ("food", "item_name", "quantity", "price", "line_total_display")
    readonly_fields = ("price", "line_total_display")
    autocomplete_fields = ("food",)

    def line_total_display(self, obj):
        if obj.price and obj.quantity:
            return f"{int(obj.price * obj.quantity):,} ت"
        return "—"
    line_total_display.short_description = "جمع ردیف"


@admin.register(Order)
class OrderAdmin(TenantModelAdmin):
    # ★ FIXED: فیلدهای جدید اضافه شد
    list_display = (
        "id", "restaurant", "customer_name", "table",
        "status_colored", "source_badge", "payment_badge",
        "items_count", "total_price_display", "created_at",
    )
    list_filter     = ("restaurant", "status", "source", "payment_status", "payment_method", "created_at", "table")
    search_fields   = ("customer_name", "phone")
    readonly_fields = ("total_price", "created_at", "updated_at", "confirmed_at")
    inlines         = [OrderItemInline]
    list_per_page   = 25

    # ★ FIXED: فیلدهای جدید در fieldsets
    fieldsets = (
        ("مشتری", {"fields": ("restaurant", "customer_name", "phone")}),
        ("سفارش", {"fields": ("table", "status", "total_price")}),
        ("منبع و پرداخت", {
            "fields": ("source", "payment_status", "payment_method"),
        }),
        ("تأیید", {
            "fields": ("confirmed_by", "confirmed_at"),
            "classes": ("collapse",),
        }),
        ("تاریخ", {"fields": ("created_at", "updated_at")}),
    )

    actions = ["mark_preparing", "mark_ready", "mark_delivered", "mark_confirmed", "mark_paid"]

    def status_colored(self, obj):
        colors = {
            "pending": "#f39c12", "confirmed": "#3b82f6", "preparing": "#e67e22",
            "ready": "#2ecc71", "delivered": "#95a5a6", "cancelled": "#e74c3c",
        }
        c = colors.get(obj.status, "#333")
        return format_html(
            '<span style="color:{};font-weight:700;">{}</span>',
            c, obj.get_status_display(),
        )
    status_colored.short_description = "وضعیت"

    # ★ FIXED: badge برای منبع سفارش
    def source_badge(self, obj):
        icons = {"pos": "💳", "online": "🌐", "phone": "📞"}
        icon = icons.get(obj.source, "")
        return f"{icon} {obj.get_source_display()}"
    source_badge.short_description = "منبع"

    # ★ FIXED: badge برای وضعیت پرداخت
    def payment_badge(self, obj):
        colors = {
            "pending": "#f39c12", "paid": "#2ecc71",
            "failed": "#e74c3c", "refunded": "#3498db",
        }
        c = colors.get(obj.payment_status, "#333")
        return format_html(
            '<span style="color:{};font-weight:600;">{}</span>',
            c, obj.get_payment_status_display(),
        )
    payment_badge.short_description = "پرداخت"

    def items_count(self, obj):
        return obj.items.count()
    items_count.short_description = "اقلام"

    def total_price_display(self, obj):
        return f"{int(obj.total_price):,} ت"
    total_price_display.short_description = "مبلغ کل"

    # ★ FIXED: اکشن‌های جدید
    @admin.action(description="در حال آماده‌سازی")
    def mark_preparing(self, request, queryset):
        queryset.filter(status__in=["pending", "confirmed"]).update(status="preparing")

    @admin.action(description="آماده")
    def mark_ready(self, request, queryset):
        queryset.filter(status="preparing").update(status="ready")

    @admin.action(description="تحویل داده شده")
    def mark_delivered(self, request, queryset):
        queryset.filter(status="ready").update(status="delivered")

    @admin.action(description="تأیید سفارش")
    def mark_confirmed(self, request, queryset):
        from django.utils import timezone as tz
        queryset.filter(status="pending").update(
            status="confirmed",
            confirmed_by=request.user,
            confirmed_at=tz.now(),
        )

    @admin.action(description="پرداخت شده")
    def mark_paid(self, request, queryset):
        queryset.filter(payment_status="pending").update(payment_status="paid")


@admin.register(OrderItem)
class OrderItemAdmin(TenantModelAdmin):
    # ★ FIXED: item_name اضافه شد
    list_display        = ("order", "restaurant", "display_name_col", "food", "quantity", "price_display")
    search_fields       = ("food__name", "item_name", "order__customer_name")
    autocomplete_fields = ("order", "food")
    list_per_page       = 30

    def display_name_col(self, obj):
        return obj.display_name
    display_name_col.short_description = "نام آیتم"

    def price_display(self, obj):
        return f"{int(obj.price):,} ت" if obj.price else "—"
    price_display.short_description = "قیمت واحد"


# ═══════════════════════════════════════════
#  4. RAW MATERIALS & INVENTORY LOG
# ═══════════════════════════════════════════

@admin.register(RawMaterial)
class RawMaterialAdmin(TenantModelAdmin):
    # ★ FIXED: created_at, updated_at اضافه شد
    list_display = (
        "name", "restaurant", "label", "material_type", "price_display", "unit",
        "quantity", "total_price_display", "stock_badge", "updated_at",
    )
    list_filter     = ("restaurant", "unit", "material_type")
    search_fields   = ("name", "label")
    readonly_fields = ("created_at", "updated_at")  # ★ FIXED
    list_per_page   = 30

    fieldsets = (
        ("اطلاعات", {"fields": ("restaurant", "name", "label", "material_type")}),
        ("موجودی", {"fields": ("price", "unit", "quantity")}),
        ("تاریخ", {"fields": ("created_at", "updated_at")}),  # ★ FIXED
    )

    actions = ["reset_quantity"]

    def price_display(self, obj):
        return f"{int(obj.price):,} ت"
    price_display.short_description = "قیمت واحد"

    def total_price_display(self, obj):
        return f"{int(obj.total_price):,} ت"
    total_price_display.short_description = "ارزش کل"

    def stock_badge(self, obj):
        q = int(obj.quantity)
        if q <= 0:
            return mark_safe('<span style="color:#e74c3c;font-weight:700;">تمام شده</span>')
        if q < 5:
            return mark_safe('<span style="color:#f39c12;font-weight:700;">⚠ کمبود</span>')
        return mark_safe('<span style="color:#2ecc71;">✓ موجود</span>')
    stock_badge.short_description = "وضعیت"

    @admin.action(description="صفر کردن موجودی")
    def reset_quantity(self, request, queryset):
        queryset.update(quantity=0)


@admin.register(InventoryUsageLog)
class InventoryUsageLogAdmin(TenantModelAdmin):
    list_display    = ("raw_material", "restaurant", "type_badge", "quantity_used", "reference", "used_at")
    list_filter     = ("restaurant", "usage_type", "used_at")
    search_fields   = ("raw_material__name", "reference", "note")
    readonly_fields = ("used_at",)
    list_per_page   = 30

    def type_badge(self, obj):
        colors = {
            "semi_finished": "#3498db", "order": "#2ecc71",
            "manual": "#f39c12", "waste": "#e74c3c",
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
class SemiFinishedAdmin(TenantModelAdmin):
    list_display = (
        "name", "restaurant", "category", "unit", "quantity_produced",
        "current_stock", "ingredients_count", "cost_display", "profit_percentage",
        "suggested_display", "can_produce_display", "created_at",
    )
    list_filter     = ("restaurant", "category", "created_at")
    search_fields   = ("name", "description")
    readonly_fields = ("created_at", "updated_at")
    inlines         = [SemiFinishedIngredientInline]
    list_per_page   = 25

    fieldsets = (
        ("اطلاعات پایه", {"fields": ("restaurant", "name", "category", "description")}),
        ("تولید", {"fields": ("unit", "quantity_produced", "current_stock", "profit_percentage")}),
        ("غذاهای مرتبط", {"fields": ("foods",)}),
        ("تاریخ", {"fields": ("created_at", "updated_at")}),
    )
    filter_horizontal = ("foods",)

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
class SemiFinishedIngredientAdmin(TenantModelAdmin):
    list_display        = ("semi_finished", "restaurant", "raw_material", "quantity", "cost_display")
    search_fields       = ("raw_material__name", "semi_finished__name")
    autocomplete_fields = ("semi_finished", "raw_material")
    list_per_page       = 30

    def cost_display(self, obj):
        return f"{int(obj.total_cost):,} ت"
    cost_display.short_description = "هزینه"


# ═══════════════════════════════════════════
#  6. PROCUREMENT — ★ اصلاح‌شده
# ═══════════════════════════════════════════

@admin.register(Supplier)
class SupplierAdmin(TenantModelAdmin):
    list_display    = ("name", "restaurant", "phone", "contact_person", "invoices_count", "created_at")
    list_filter     = ("restaurant",)
    search_fields   = ("name", "phone", "contact_person")
    readonly_fields = ("created_at",)

    fieldsets = (
        ("اطلاعات شرکت", {"fields": ("restaurant", "name", "phone", "address")}),
        ("ارتباطات", {"fields": ("contact_person", "description")}),
        ("تاریخ", {"fields": ("created_at",)}),
    )

    # ★ FIXED: تعداد فاکتورهای تأمین‌کننده
    def invoices_count(self, obj):
        return obj.invoices.count()
    invoices_count.short_description = "فاکتورها"


class PurchaseInvoiceItemInline(admin.TabularInline):
    model = PurchaseInvoiceItem
    extra = 1
    fields = ("item_name", "quantity", "unit", "unit_price", "raw_material", "line_display")
    readonly_fields = ("line_display",)
    autocomplete_fields = ("raw_material",)

    def line_display(self, obj):
        return f"{int(obj.line_total):,} ت" if obj.pk else "—"
    line_display.short_description = "جمع ردیف"


@admin.register(PurchaseInvoice)
class PurchaseInvoiceAdmin(TenantModelAdmin):
    # ★ FIXED: supplier FK اضافه شد
    list_display    = (
        "supplier_name", "supplier_link", "restaurant", "invoice_number",
        "date", "items_count", "total_display", "created_at",
    )
    list_filter     = ("restaurant", "date", "supplier", "created_at")
    search_fields   = ("supplier_name", "invoice_number", "description")
    readonly_fields = ("created_at",)
    autocomplete_fields = ("supplier",)  # ★ FIXED
    inlines         = [PurchaseInvoiceItemInline]
    list_per_page   = 20

    fieldsets = (
        ("فاکتور", {
            "fields": ("restaurant", "supplier", "supplier_name", "invoice_number", "date"),
        }),
        ("توضیحات و فایل", {"fields": ("description", "file")}),
        ("تاریخ", {"fields": ("created_at",)}),
    )

    # ★ FIXED: لینک به تأمین‌کننده
    def supplier_link(self, obj):
        if obj.supplier:
            return format_html(
                '<a href="/admin/restaurant/supplier/{}/change/">{}</a>',
                obj.supplier.pk, obj.supplier.name,
            )
        return "—"
    supplier_link.short_description = "تأمین‌کننده"

    def items_count(self, obj):
        return obj.items.count()
    items_count.short_description = "اقلام"

    def total_display(self, obj):
        return f"{int(obj.total_amount):,} ت"
    total_display.short_description = "مبلغ کل"


@admin.register(PurchaseInvoiceItem)
class PurchaseInvoiceItemAdmin(TenantModelAdmin):
    list_display  = ("invoice", "restaurant", "item_name", "quantity", "unit", "unit_price_display", "line_display", "raw_material")
    search_fields = ("item_name", "invoice__supplier_name")
    autocomplete_fields = ("invoice", "raw_material")
    list_per_page = 30

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
class ReadyMaterialAdmin(TenantModelAdmin):
    list_display = (
        "name", "restaurant", "unit", "quantity", "purchase_price",
        "selling_price", "stock_status_display", "supplier", "is_active",
    )
    list_filter     = ("restaurant", "unit", "is_active", "supplier", "created_at")
    search_fields   = ("name", "barcode", "description")
    list_editable   = ("is_active",)
    readonly_fields = ("created_at", "updated_at")
    list_per_page   = 30

    fieldsets = (
        ("اطلاعات پایه", {"fields": ("restaurant", "name", "description", "unit", "barcode")}),
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
#  8. LOYALTY SYSTEM — ★ اصلاح‌شده
# ═══════════════════════════════════════════

@admin.register(MembershipLevel)
class MembershipLevelAdmin(TenantModelAdmin):
    list_display = (
        "icon", "title", "name", "restaurant", "min_spending_display", "min_points",
        "discount_percent", "points_multiplier", "cashback_rate",
        "free_delivery", "priority_support", "order",
    )
    list_filter   = ("restaurant",)
    list_editable = ("order",)
    search_fields = ("title", "name")
    list_per_page = 10

    fieldsets = (
        ("پایه", {"fields": ("restaurant", "name", "title", "icon", "color", "order")}),
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
    # ★ FIXED: order حالا FK است
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
class CustomerProfileAdmin(TenantModelAdmin):
    list_display = (
        "phone", "full_name", "restaurant", "level_display", "total_points",
        "available_points", "spending_display", "total_orders",
        "referral_code", "is_active", "joined_at",
    )
    list_filter     = ("restaurant", "membership_level", "is_active", "joined_at")
    search_fields   = ("phone", "first_name", "last_name", "email", "referral_code")
    readonly_fields = ("referral_code", "total_points", "available_points", "total_spending", "total_orders", "joined_at", "updated_at")
    inlines         = [LoyaltyTxInline, CustCouponInline]
    list_per_page   = 25

    fieldsets = (
        ("اطلاعات شخصی", {"fields": ("restaurant", "phone", "email", "first_name", "last_name", "birth_date", "profile_image")}),
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
class LoyaltyTransactionAdmin(TenantModelAdmin):
    # ★ FIXED: order حالا FK است
    list_display    = ("customer", "restaurant", "type_badge", "points", "balance_after", "description", "created_at")
    list_filter     = ("restaurant", "transaction_type", "created_at")
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
class CouponAdmin(TenantModelAdmin):
    list_display = (
        "code", "name", "restaurant", "coupon_type", "discount_type",
        "discount_value_display", "usage_display",
        "validity_badge", "is_active", "valid_from", "valid_until",
    )
    list_filter         = ("restaurant", "coupon_type", "discount_type", "is_active")
    search_fields       = ("code", "name")
    list_editable       = ("is_active",)
    filter_horizontal   = ("applicable_levels",)
    readonly_fields     = ("used_count", "created_at", "updated_at")
    list_per_page       = 20

    fieldsets = (
        ("پایه", {"fields": ("restaurant", "code", "name", "description", "coupon_type")}),
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
class CustomerCouponAdmin(TenantModelAdmin):
    list_display  = ("customer", "coupon", "restaurant", "used_count", "first_used_at", "last_used_at")
    list_filter   = ("restaurant",)
    search_fields = ("customer__phone", "coupon__code")
    list_per_page = 30


class WalletTxInline(admin.TabularInline):
    model = WalletTransaction
    extra = 0
    # ★ FIXED: order حالا FK است
    fields = ("transaction_type", "amount", "balance_after", "description", "created_at")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(LoyaltyWallet)
class LoyaltyWalletAdmin(TenantModelAdmin):
    list_display    = ("customer", "restaurant", "balance_display", "updated_at")
    list_filter     = ("restaurant",)
    search_fields   = ("customer__phone",)
    readonly_fields = ("updated_at",)
    inlines         = [WalletTxInline]

    def balance_display(self, obj):
        return f"{int(obj.balance):,} ت"
    balance_display.short_description = "موجودی"


@admin.register(WalletTransaction)
class WalletTransactionAdmin(TenantModelAdmin):
    # ★ FIXED: order حالا FK است
    list_display    = ("wallet", "restaurant", "type_badge", "amount_display", "balance_display", "description", "created_at")
    list_filter     = ("restaurant", "transaction_type", "created_at")
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
class RewardAdmin(TenantModelAdmin):
    list_display = (
        "name", "restaurant", "category", "points_display", "value_display",
        "qty_display", "min_membership_level", "available_badge", "is_active",
    )
    list_filter   = ("restaurant", "category", "is_active")
    search_fields = ("name", "description")
    list_editable = ("is_active",)
    list_per_page = 20

    fieldsets = (
        ("پایه", {"fields": ("restaurant", "name", "description", "category", "image")}),
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
class RewardRedemptionAdmin(TenantModelAdmin):
    list_display    = ("customer", "restaurant", "reward", "points_spent", "status_badge", "redeemed_at")
    list_filter     = ("restaurant", "status", "redeemed_at")
    search_fields   = ("customer__phone", "reward__name")
    readonly_fields = ("redeemed_at",)
    list_per_page   = 20

    def status_badge(self, obj):
        colors = {"pending": "#f39c12", "approved": "#2ecc71", "used": "#3498db", "cancelled": "#95a5a6"}
        c = colors.get(obj.status, "#333")
        return format_html('<span style="color:{};font-weight:700;">{}</span>', c, obj.get_status_display())
    status_badge.short_description = "وضعیت"


@admin.register(Referral)
class ReferralAdmin(TenantModelAdmin):
    list_display    = ("referrer", "restaurant", "referred", "referral_code", "bonus_points", "is_rewarded", "rewarded_at", "created_at")
    list_filter     = ("restaurant", "is_rewarded", "created_at")
    search_fields   = ("referrer__phone", "referred__phone", "referral_code")
    readonly_fields = ("created_at",)
    list_per_page   = 20


@admin.register(LoyaltyNotification)
class LoyaltyNotificationAdmin(TenantModelAdmin):
    list_display    = ("customer", "restaurant", "channel", "notification_type", "title", "read_badge", "sent_badge", "created_at")
    list_filter     = ("restaurant", "channel", "notification_type", "is_read", "is_sent", "created_at")
    search_fields   = ("customer__phone", "title", "message")
    readonly_fields = ("created_at",)
    list_per_page   = 30

    fieldsets = (
        ("گیرنده", {"fields": ("restaurant", "customer")}),
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
#  9. AUTHENTICATION — Shared
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
    list_editable   = ("is_active",)
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


class RecipePackagingInline(admin.TabularInline):
    model = RecipePackagingItem
    extra = 0
    fields = ("raw_material", "quantity", "unit", "cost_display", "notes")
    readonly_fields = ("cost_display",)
    autocomplete_fields = ("raw_material",)

    def cost_display(self, obj):
        return f"{int(obj.total_cost):,} ت" if obj.pk else "—"
    cost_display.short_description = "هزینه"


@admin.register(Recipe)
class RecipeAdmin(TenantModelAdmin):
    list_display = (
        "id", "restaurant", "food_name", "version", "ingredients_count",
        "semi_count", "packaging_count",
        "total_cost_display", "cost_per_serving_display",
        "suggested_price_display", "margin_display", "is_active", "updated_at",
    )
    list_filter     = ("restaurant", "is_active", "version", "created_at")
    search_fields   = ("food__name", "instructions", "notes")
    readonly_fields = (
        "total_raw_material_cost", "total_semi_finished_cost",
        "total_packaging_cost", "total_cost", "cost_per_serving", "suggested_price",
        "created_at", "updated_at",
    )
    autocomplete_fields = ("food",)
    inlines         = [RecipeIngredientInline, RecipeSemiFinishedInline, RecipePackagingInline]
    list_per_page   = 25

    fieldsets = (
        ("پایه", {"fields": ("restaurant", "food", "version", "is_active")}),
        ("جزئیات", {"fields": ("yield_quantity", "estimated_preparation_time", "instructions", "notes")}),
        ("هزینه‌ها (محاسبه‌شده)", {
            "fields": (
                "total_raw_material_cost", "total_semi_finished_cost",
                "total_packaging_cost", "total_cost", "cost_per_serving", "suggested_price",
            ),
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

    def packaging_count(self, obj):
        c = obj.packaging_items.count()
        return f"{c} بسته" if c else "—"
    packaging_count.short_description = "بسته‌بندی"

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
class RecipeIngredientAdmin(TenantModelAdmin):
    list_display        = ("recipe_food", "raw_material", "quantity", "unit", "wastage_percent", "effective_display", "cost_display", "optional")
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
class RecipeSemiFinishedAdmin(TenantModelAdmin):
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


@admin.register(RecipePackagingItem)
class RecipePackagingItemAdmin(TenantModelAdmin):
    list_display        = ("recipe_food", "raw_material", "quantity", "unit", "cost_display")
    search_fields       = ("raw_material__name", "recipe__food__name")
    autocomplete_fields = ("recipe", "raw_material")
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
class InventoryMovementAdmin(TenantModelAdmin):
    list_display = (
        "raw_material", "restaurant", "movement_badge", "quantity",
        "previous_stock", "new_stock", "reference_type",
        "created_by", "created_at",
    )
    list_filter     = ("restaurant", "movement_type", "created_at")
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
class KitchenProductAdmin(TenantModelAdmin):
    list_display = (
        "name", "restaurant", "category", "recipe_name", "selling_price",
        "min_stock", "cost_display", "profit_display", "stock_display",
        "capacity_display", "is_active",
    )
    list_filter         = ("restaurant", "category", "is_active", "created_at")
    search_fields       = ("name", "description", "recipe__food__name")
    list_editable       = ("selling_price", "is_active")
    readonly_fields     = ("created_at", "updated_at")
    autocomplete_fields = ("recipe",)
    inlines             = [KitchenInventoryInline]
    list_per_page       = 25

    fieldsets = (
        ("پایه", {"fields": ("restaurant", "name", "recipe", "category", "description", "image")}),
        ("قیمت و موجودی", {"fields": ("selling_price", "min_stock")}),
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
            if obj.min_stock > 0 and qty < obj.min_stock:
                return format_html('<span style="color:#e74c3c;font-weight:700;">⚠ {} (حداقل: {})</span>', qty, obj.min_stock)
            if inv.is_low_stock:
                return format_html('<span style="color:#f39c12;font-weight:700;">⚠ {}</span>', qty)
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
class KitchenInventoryAdmin(TenantModelAdmin):
    list_display    = ("kitchen_product", "restaurant", "quantity", "reserved_quantity", "available_qty", "low_stock_threshold", "status_badge", "updated_at")
    list_filter     = ("restaurant",)
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
            return mark_safe('<span style="color:#2ecc71;">✓ موجود</span>')
        return format_html('<span style="color:#95a5a6;">✗ ناموجود</span>')
    status_badge.short_description = "وضعیت"


class PlanItemInline(admin.TabularInline):
    model = ProductionPlanItem
    extra = 1
    fields = ("kitchen_product", "quantity")
    autocomplete_fields = ("kitchen_product",)


@admin.register(ProductionPlan)
class ProductionPlanAdmin(TenantModelAdmin):
    list_display    = ("id", "restaurant", "date", "status_badge", "created_by", "items_count", "created_at")
    list_filter     = ("restaurant", "status", "date")
    search_fields   = ("notes", "created_by__username")
    readonly_fields = ("created_at", "updated_at")
    inlines         = [PlanItemInline]
    list_per_page   = 20

    fieldsets = (
        ("برنامه", {"fields": ("restaurant", "date", "status", "notes")}),
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
class ProductionPlanItemAdmin(TenantModelAdmin):
    list_display        = ("production_plan", "restaurant", "kitchen_product", "quantity")
    list_filter         = ("restaurant", "production_plan__date")
    search_fields       = ("kitchen_product__name",)
    autocomplete_fields = ("production_plan", "kitchen_product")


@admin.register(ProductionBatch)
class ProductionBatchAdmin(TenantModelAdmin):
    list_display    = ("id", "restaurant", "kitchen_product", "quantity_produced", "cost_display", "produced_by", "produced_at")
    list_filter     = ("restaurant", "produced_at")
    search_fields   = ("kitchen_product__name", "produced_by__username", "notes")
    readonly_fields = ("produced_at",)
    list_per_page   = 30

    def cost_display(self, obj):
        return f"{obj.production_cost:,} ت"
    cost_display.short_description = "هزینه"


@admin.register(ProductionLog)
class ProductionLogAdmin(TenantModelAdmin):
    list_display    = ("id", "restaurant", "user", "product_name", "action_badge", "quantity", "details_short", "created_at")
    list_filter     = ("restaurant", "action", "created_at")
    search_fields   = ("kitchen_product__name", "user__username", "user__first_name", "details")
    readonly_fields = ("created_at", "materials_consumed")
    list_per_page   = 30

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


@admin.register(WasteLog)
class WasteLogAdmin(TenantModelAdmin):
    list_display = (
        "kitchen_product", "restaurant", "quantity", "reason_badge",
        "cost_per_unit", "total_cost_display", "notes_short",
        "created_by", "created_at",
    )
    list_filter     = ("restaurant", "reason", "created_at")
    search_fields   = ("kitchen_product__name", "notes")
    readonly_fields = ("created_at",)
    list_per_page   = 30

    fieldsets = (
        ("ضایعات", {"fields": ("restaurant", "kitchen_product", "quantity", "reason")}),
        ("هزینه", {"fields": ("cost_per_unit",)}),
        ("جزئیات", {"fields": ("notes", "created_by")}),
        ("تاریخ", {"fields": ("created_at",)}),
    )

    def reason_badge(self, obj):
        colors = {
            'expired':       ('#3b82f6', '#eff6ff'),
            'damaged':       ('#f59e0b', '#fffbeb'),
            'overcooked':    ('#e67e22', '#fef3c7'),
            'quality_issue': ('#dc2626', '#fef2f2'),
            'returned':      ('#8b5cf6', '#f5f3ff'),
            'other':         ('#6b7280', '#f9fafb'),
        }
        color, bg = colors.get(obj.reason, ('#6b7280', '#f9fafb'))
        return format_html(
            '<span style="background:{};color:{};padding:2px 8px;border-radius:6px;font-size:0.85em;font-weight:600">{}</span>',
            bg, color, obj.get_reason_display(),
        )
    reason_badge.short_description = "دلیل"

    def total_cost_display(self, obj):
        return f"{obj.total_cost:,} ت"
    total_cost_display.short_description = "هزینه کل"

    def notes_short(self, obj):
        text = obj.notes or "—"
        return text[:40] + "..." if len(text) > 40 else text
    notes_short.short_description = "یادداشت"


# ═══════════════════════════════════════════
#  12.5. ONLINE ORDER SETTINGS — ★ جدید
# ═══════════════════════════════════════════

@admin.register(OnlineOrderSettings)
class OnlineOrderSettingsAdmin(admin.ModelAdmin):
    list_display    = ("restaurant", "status_badge", "closed_message_short", "updated_at", "updated_by")
    list_filter     = ("is_open",)
    search_fields   = ("restaurant__name",)
    readonly_fields = ("updated_at",)

    def status_badge(self, obj):
        if obj.is_open:
            return format_html('<span style="color:#2ecc71;font-weight:700;">🟢 باز</span>')
        return format_html('<span style="color:#e74c3c;font-weight:700;">🔴 بسته</span>')
    status_badge.short_description = "وضعیت"

    def closed_message_short(self, obj):
        text = obj.closed_message or ""
        return text[:40] + "..." if len(text) > 40 else text
    closed_message_short.short_description = "پیام بسته بودن"


# ═══════════════════════════════════════════
#  13. DAY CLOSE
# ═══════════════════════════════════════════

@admin.register(DayCloseReport)
class DayCloseReportAdmin(TenantModelAdmin):
    list_display = (
        "date", "restaurant", "total_sales_display", "total_cost_display",
        "total_profit_display", "order_count", "delivered_count",
        "waste_count", "discount_total_display", "closed_by", "closed_at",
    )
    list_filter     = ("restaurant", "date")
    search_fields   = ("closed_by__username",)
    readonly_fields = ("closed_at", "inventory_snapshot", "items_detail", "top_items")
    list_per_page   = 20

    fieldsets = (
        ("تاریخ", {"fields": ("restaurant", "date")}),
        ("مالی", {"fields": ("total_sales", "total_cost", "total_profit", "discount_total")}),
        ("آمار", {"fields": ("order_count", "delivered_count", "waste_count", "waste_value")}),
        ("داده", {"fields": ("inventory_snapshot", "items_detail", "top_items"), "classes": ("collapse",)}),
        ("بستن", {"fields": ("closed_by", "closed_at")}),
    )

    def total_sales_display(self, obj):
        return f"{int(obj.total_sales):,} ت"
    total_sales_display.short_description = "فروش"

    def total_cost_display(self, obj):
        return f"{int(obj.total_cost):,} ت"
    total_cost_display.short_description = "هزینه"

    def total_profit_display(self, obj):
        p = int(obj.total_profit)
        if p > 0:
            return format_html('<span style="color:#2ecc71;font-weight:700;">{:,} ت</span>', p)
        return format_html('<span style="color:#e74c3c;">{:,} ت</span>', p)
    total_profit_display.short_description = "سود"

    def discount_total_display(self, obj):
        return f"{int(obj.discount_total):,} ت"
    discount_total_display.short_description = "تخفیف"


@admin.register(DayCloseLog)
class DayCloseLogAdmin(TenantModelAdmin):
    list_display    = ("date", "restaurant", "action_badge", "user", "created_at")
    list_filter     = ("restaurant", "action", "created_at")
    search_fields   = ("user__username",)
    readonly_fields = ("created_at", "details")
    list_per_page   = 30

    def action_badge(self, obj):
        if obj.action == "close":
            return format_html('<span style="color:#e74c3c;font-weight:700;">بستن</span>')
        return format_html('<span style="color:#2ecc71;font-weight:700;">باز کردن</span>')
    action_badge.short_description = "عملیات"


# ═══════════════════════════════════════════
#  14. DICTIONARY
# ═══════════════════════════════════════════

@admin.register(DictionaryGroup)
class DictionaryGroupAdmin(TenantModelAdmin):
    list_display = (
        "name", "restaurant", "slug", "icon", "color_display",
        "usage_recipes", "usage_warehouse", "usage_pos",
        "usage_invoice", "usage_kitchen",
        "item_count_display", "sort_order", "is_active",
    )
    list_filter     = ("restaurant", "is_active", "usage_recipes", "usage_warehouse", "usage_pos", "usage_invoice", "usage_kitchen")
    search_fields   = ("name", "slug")
    list_editable   = ("sort_order", "is_active")
    readonly_fields = ("created_at",)
    list_per_page   = 30

    fieldsets = (
        ("پایه", {"fields": ("restaurant", "name", "slug", "icon", "color", "sort_order")}),
        ("مصرف", {"fields": ("usage_recipes", "usage_warehouse", "usage_pos", "usage_invoice", "usage_kitchen")}),
        ("وضعیت", {"fields": ("is_system", "is_active")}),
        ("تاریخ", {"fields": ("created_at",)}),
    )

    def color_display(self, obj):
        return format_html(
            '<span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:{};border:1px solid #ccc;vertical-align:middle"></span> {}',
            obj.color, obj.color,
        )
    color_display.short_description = "رنگ"

    def item_count_display(self, obj):
        return obj.item_count
    item_count_display.short_description = "آیتم‌ها"


@admin.register(ItemDictionary)
class ItemDictionaryAdmin(TenantModelAdmin):
    list_display  = ("name", "restaurant", "group", "unit", "category", "material_type", "is_active", "created_at")
    list_filter   = ("restaurant", "group", "category", "material_type", "is_active")
    search_fields = ("name", "description")
    list_editable = ("is_active",)
    list_per_page = 30


# ═══════════════════════════════════════════
#  15. SUPER ADMIN PANEL — ★ جدید
# ═══════════════════════════════════════════

@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display    = ("icon_label", "code", "default_price_display", "is_active", "order")
    list_filter     = ("is_active",)
    search_fields   = ("code", "label", "description")
    list_editable   = ("is_active", "order")
    list_per_page   = 20

    def icon_label(self, obj):
        return f"{obj.icon} {obj.label}"
    icon_label.short_description = "سرویس"

    def default_price_display(self, obj):
        return f"{obj.default_price:,} ت"
    default_price_display.short_description = "قیمت ماهانه"


class TenantServiceInline(admin.TabularInline):
    model = TenantService
    extra = 0
    fields = ("service", "is_enabled", "price", "activated_at", "expires_at")
    readonly_fields = ("activated_at",)


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display    = ("name", "owner", "phone", "is_active", "services_count", "revenue_display", "created_at")
    list_filter     = ("is_active",)
    search_fields   = ("name", "phone", "owner__username", "owner__first_name")
    list_editable   = ("is_active",)
    readonly_fields = ("created_at",)
    inlines         = [TenantServiceInline]

    fieldsets = (
        ("اطلاعات", {"fields": ("name", "owner", "phone", "address")}),
        ("وضعیت", {"fields": ("is_active", "created_at")}),
    )

    def services_count(self, obj):
        return obj.active_services_count
    services_count.short_description = "سرویس‌های فعال"

    def revenue_display(self, obj):
        return f"{obj.monthly_revenue:,} ت"
    revenue_display.short_description = "درآمد ماهانه"


@admin.register(TenantService)
class TenantServiceAdmin(admin.ModelAdmin):
    list_display    = ("tenant", "service", "is_enabled", "price_display", "activated_at", "expires_at")
    list_filter     = ("is_enabled", "service")
    search_fields   = ("tenant__name", "service__label")
    list_per_page   = 30

    def price_display(self, obj):
        return f"{obj.price:,} ت"
    price_display.short_description = "قیمت"