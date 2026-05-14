from django.contrib import admin
from .models import Category, Food, Table, Reservation, Order, OrderItem

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'order']
    list_editable = ['is_active', 'order']
    search_fields = ['name']

@admin.register(Food)
class FoodAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'category',
        'price',
        'discount',
        'get_discounted_price',
        'is_available',
        'is_special'
    ]
    list_editable = [
        'price',
        'discount',
        'is_available',
        'is_special'
    ]
    list_filter = ['category', 'is_available', 'is_special']
    search_fields = ['name', 'description']

    def get_discounted_price(self, obj):
        return f"{obj.discounted_price()} تومان"
    get_discounted_price.short_description = 'قیمت با تخفیف'

@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display = ['number', 'capacity', 'is_reserved']
    list_editable = ['is_reserved']

@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ['customer_name', 'phone', 'table', 'date', 'time', 'guests']
    list_filter = ['date', 'table']
    search_fields = ['customer_name', 'phone']

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'customer_name', 'phone', 'table', 'status', 'total_price', 'created_at']
    list_editable = ['status']
    list_filter = ['status']
    search_fields = ['customer_name', 'phone']
    inlines = [OrderItemInline]