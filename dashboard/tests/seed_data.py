import os, django, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from restaurant.models import Food, Category, Restaurant

rest = Restaurant.objects.first()
print(f"رستوران: {rest.name}")

# ★ دسته‌بندی‌های واقعی خودت رو اینجا بذار
cat_data = [
    {'name': 'پیتزا',     'order': 1},
    {'name': 'برگر',      'order': 2},
    {'name': 'نوشیدنی',   'order': 3},
]

cats = {}
for cd in cat_data:
    cat, created = Category.objects.get_or_create(
        restaurant=rest, name=cd['name'],
        defaults={'is_active': True, 'order': cd['order']}
    )
    cats[cd['name']] = cat
    print(f"  {'ساخته شد' if created else 'وجود داشت'}: {cat.name}")

# ★ غذاهای واقعی خودت رو اینجا بذار
foods_data = [
    {'name': 'پیتزا مخصوص',    'cat': 'پیتزا',   'price': 250000, 'available': True},
    {'name': 'برگر کلاسیک',    'cat': 'برگر',    'price': 180000, 'available': True},
    {'name': 'نوشابه',          'cat': 'نوشیدنی', 'price': 25000,  'available': True},
]

for fd in foods_data:
    food, created = Food.objects.get_or_create(
        restaurant=rest, name=fd['name'],
        defaults={
            'category': cats[fd['cat']],
            'price': fd['price'],
            'final_price': fd['price'],
            'is_available': fd['available'],
        }
    )
    print(f"  {'ساخته شد' if created else 'وجود داشت'}: {food.name} - {food.price:,} تومان")

print(f"\n✅ دسته‌بندی: {Category.objects.filter(restaurant=rest).count()}")
print(f"✅ غذاها:     {Food.objects.filter(restaurant=rest).count()}")