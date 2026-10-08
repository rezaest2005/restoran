# restaurant/seeders.py
import datetime
from django.utils import timezone
from decimal import Decimal
import random
from .models import (
    Restaurant, Category, Food, RawMaterial, 
    Warehouse, StockItem, Order, OrderItem,
    InventoryMovement, WasteLog, KitchenProduct, Recipe
)
from .tenancy import set_current_restaurant

def seed_sample_data(restaurant):
    """
    ایجاد داده‌های نمونه غنی (برای ۷ روز گذشته) تا داشبورد کاملاً پر باشد.
    """
    if not restaurant:
        return False

    set_current_restaurant(restaurant)
    today = timezone.now()
    
    # ۱. ساخت انبار
    warehouse, _ = Warehouse.objects.get_or_create(
        restaurant=restaurant, name="انبار اصلی",
        defaults={"is_mother": True, "warehouse_type": "mother", "is_active": True}
    )

    # ۲. دسته‌بندی‌ها و غذاها
    cat1, _ = Category.objects.get_or_create(restaurant=restaurant, name="پیتزاها", defaults={"name_en": "Pizzas", "order": 1, "is_active": True})
    cat2, _ = Category.objects.get_or_create(restaurant=restaurant, name="برگرها", defaults={"name_en": "Burgers", "order": 2, "is_active": True})
    cat3, _ = Category.objects.get_or_create(restaurant=restaurant, name="نوشیدنی‌ها", defaults={"name_en": "Drinks", "order": 3, "is_active": True})

    foods = []
    food_data = [
        ("پیتزا پپرونی", "Pepperoni Pizza", cat1, 150000),
        ("پیتزا قارچ", "Mushroom Pizza", cat1, 160000),
        ("برگر کلاسیک", "Classic Burger", cat2, 120000),
        ("برگر مخصوص", "Special Burger", cat2, 150000),
        ("نوشابه", "Soda", cat3, 20000),
    ]
    for name, name_en, cat, price in food_data:
        f, _ = Food.objects.get_or_create(
            restaurant=restaurant, name=name,
            defaults={"category": cat, "price": price, "final_price": price, "stock": 50, "is_available": True, "name_en": name_en}
        )
        foods.append(f)

    # ۳. مواد اولیه (برای انبار)
    mat_data = [
        ("خمیر پیتزا", "kg", 20000, 10, 2),
        ("پنیر موزارلا", "kg", 80000, 0.5, 2),  # کم موجود
        ("گوشت چرخ‌کرده", "kg", 65000, 8, 3),
        ("سس مخصوص", "l", 30000, 1.5, 2),       # کم موجود
        ("پیاز", "kg", 10000, 15, 5),
    ]
    mats = []
    for name, unit, price, qty, min_stock in mat_data:
        m, _ = RawMaterial.objects.get_or_create(
            restaurant=restaurant, name=name,
            defaults={"price": price, "unit": unit, "quantity": qty, "minimum_stock": min_stock}
        )
        StockItem.objects.get_or_create(restaurant=restaurant, warehouse=warehouse, raw_material=m, defaults={"quantity": qty})
        mats.append(m)

    # ۴. حرکات انبار (برای ۷ روز گذشته)
    if not InventoryMovement.objects.filter(restaurant=restaurant).exists():
        for i in range(6, 0, -1):
            day = today - datetime.timedelta(days=i)
            # ورود کالا
            InventoryMovement.objects.create(restaurant=restaurant, raw_material=mats[0], warehouse=warehouse, movement_type="in", quantity=random.randint(5, 15), previous_stock=0, new_stock=10, created_at=day)
            InventoryMovement.objects.create(restaurant=restaurant, raw_material=mats[2], warehouse=warehouse, movement_type="in", quantity=random.randint(3, 8), previous_stock=0, new_stock=8, created_at=day)
            # خروج کالا
            InventoryMovement.objects.create(restaurant=restaurant, raw_material=mats[0], warehouse=warehouse, movement_type="out", quantity=random.randint(2, 6), previous_stock=10, new_stock=5, created_at=day)
            InventoryMovement.objects.create(restaurant=restaurant, raw_material=mats[4], warehouse=warehouse, movement_type="out", quantity=random.randint(1, 4), previous_stock=15, new_stock=10, created_at=day)

    # ۵. ضایعات (برای نمودار ضایعات)
    if not WasteLog.objects.filter(restaurant=restaurant).exists():
        recipe1, _ = Recipe.objects.get_or_create(restaurant=restaurant, food=foods[0], defaults={"is_active": True})
        kp, _ = KitchenProduct.objects.get_or_create(restaurant=restaurant, name=foods[0].name, defaults={"recipe": recipe1, "selling_price": foods[0].final_price, "is_active": True})
        
        waste_reasons = ["expired", "damaged", "overcooked", "quality_issue", "returned"]
        for _ in range(5):
            WasteLog.objects.create(
                restaurant=restaurant, kitchen_product=kp, quantity=random.randint(1, 3),
                reason=random.choice(waste_reasons), cost_per_unit=5000,
                created_at=today - datetime.timedelta(days=random.randint(1, 6))
            )

    # ۶. سفارشات (برای ۷ روز گذشته)
    if not Order.objects.filter(restaurant=restaurant, source="pos").exists():
        for i in range(6, 0, -1):
            day = today - datetime.timedelta(days=i)
            num_orders = random.randint(2, 6) # بین ۲ تا ۶ سفارش در روز
            for _ in range(num_orders):
                order = Order.objects.create(
                    restaurant=restaurant, customer_name="مشتری نمونه", phone="09120000000",
                    status="delivered", source="pos", payment_method="cash",
                    payment_status="paid", total_price=0, created_at=day
                )
                num_items = random.randint(1, 3)
                total = 0
                for _ in range(num_items):
                    f = random.choice(foods)
                    qty = random.randint(1, 2)
                    OrderItem.objects.create(restaurant=restaurant, order=order, food=f, quantity=qty, price=f.final_price, item_name=f.name)
                    total += f.final_price * qty
                order.total_price = total
                order.save()

    return True