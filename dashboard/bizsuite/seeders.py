# bizsuite/seeders.py
from .industries import SAMPLES, get_industry
from .models import (
    Category, Food, RawMaterial,
    Warehouse, StockItem
)
from .tenancy import set_current_business


def seed_sample_data(business, industry=None):
    """
    ایجاد داده‌های نمونه (محصولات فروش و کالاهای انبار) متناسب با نوع کسب‌وکار، بدون تراکنش مالی.
    نمونه‌ها در industries.SAMPLES تعریف شده‌اند؛ نوع ناشناخته = نمونه‌ی عمومی.
    """
    if not business:
        return False

    set_current_business(business)
    key = get_industry(industry or business).key
    sample = SAMPLES.get(key) or SAMPLES["other"]

    # ۱. ساخت انبار
    warehouse, _ = Warehouse.objects.get_or_create(
        business=business, name="انبار اصلی",
        defaults={"is_mother": True, "warehouse_type": "mother", "is_active": True}
    )

    # ۲. دسته‌بندی‌ها و محصولات فروش
    cats = []
    for i, (name, name_en) in enumerate(sample["categories"], start=1):
        cat, _ = Category.objects.get_or_create(
            business=business, name=name, defaults={"name_en": name_en, "order": i, "is_active": True})
        cats.append(cat)
    for name, name_en, cat_index, price in sample["products"]:
        Food.objects.get_or_create(
            business=business, name=name,
            defaults={"category": cats[cat_index], "price": price, "final_price": price, "stock": 50,
                      "is_available": True, "name_en": name_en}
        )

    # ۳. کالاها / مواد اولیه (برای انبار) — بعضی عمداً کم‌موجود هستند تا هشدار داشبورد دیده شود
    for name, unit, price, qty, min_stock in sample["materials"]:
        m, _ = RawMaterial.objects.get_or_create(
            business=business, name=name,
            defaults={"price": price, "unit": unit, "quantity": qty, "minimum_stock": min_stock}
        )
        StockItem.objects.get_or_create(business=business, warehouse=warehouse, raw_material=m, defaults={"quantity": qty})

    return True
