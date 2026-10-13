# restaurant/seeders.py
from django.utils import timezone
from .models import (
    Restaurant, Category, Food, RawMaterial, 
    Warehouse, StockItem
)
from .tenancy import set_current_restaurant

def seed_sample_data(restaurant):
    """
    ایجاد داده‌های نمونه (فقط منو و انبار) بدون تراکنش مالی.
    تراکنش‌ها توسط dashboard.py به صورت موقت (Fallback) نمایش داده می‌شوند.
    """
    if not restaurant:
        return False

    set_current_restaurant(restaurant)

    # ۱. ساخت انبار
    warehouse, _ = Warehouse.objects.get_or_create(
        restaurant=restaurant, name="انبار اصلی",
        defaults={"is_mother": True, "warehouse_type": "mother", "is_active": True}
    )

    # ۲. دسته‌بندی‌ها و غذاها
    cat1, _ = Category.objects.get_or_create(restaurant=restaurant, name="پیتزاها", defaults={"name_en": "Pizzas", "order": 1, "is_active": True})
    cat2, _ = Category.objects.get_or_create(restaurant=restaurant, name="برگرها", defaults={"name_en": "Burgers", "order": 2, "is_active": True})
    cat3, _ = Category.objects.get_or_create(restaurant=restaurant, name="نوشیدنی‌ها", defaults={"name_en": "Drinks", "order": 3, "is_active": True})

    food_data = [
        ("پیتزا پپرونی", "Pepperoni Pizza", cat1, 150000),
        ("پیتزا قارچ", "Mushroom Pizza", cat1, 160000),
        ("برگر کلاسیک", "Classic Burger", cat2, 120000),
        ("برگر مخصوص", "Special Burger", cat2, 150000),
        ("نوشابه", "Soda", cat3, 20000),
    ]
    for name, name_en, cat, price in food_data:
        Food.objects.get_or_create(
            restaurant=restaurant, name=name,
            defaults={"category": cat, "price": price, "final_price": price, "stock": 50, "is_available": True, "name_en": name_en}
        )

    # ۳. مواد اولیه (برای انبار)
    mat_data = [
        ("خمیر پیتزا", "kg", 20000, 10, 2),
        ("پنیر موزارلا", "kg", 80000, 0.5, 2),  # کم موجود
        ("گوشت چرخ‌کرده", "kg", 65000, 8, 3),
        ("سس مخصوص", "l", 30000, 1.5, 2),       # کم موجود
        ("پیاز", "kg", 10000, 15, 5),
    ]
    for name, unit, price, qty, min_stock in mat_data:
        m, _ = RawMaterial.objects.get_or_create(
            restaurant=restaurant, name=name,
            defaults={"price": price, "unit": unit, "quantity": qty, "minimum_stock": min_stock}
        )
        StockItem.objects.get_or_create(restaurant=restaurant, warehouse=warehouse, raw_material=m, defaults={"quantity": qty})

    return True