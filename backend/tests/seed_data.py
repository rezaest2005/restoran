"""seed_data.py — وارد کردن کامل دیتای تست (نسخه نهایی — بدون try/except)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.db import connection
from django.utils import timezone
from restaurant.models import *
from restaurant.views import calculate_max_production
from decimal import Decimal

print("=" * 60)
print("  وارد کردن دیتای کامل تست — نسخه نهایی")
print("=" * 60)

# ═══════════════════════════════════════
#  ۰. پاکسازی کامل
# ═══════════════════════════════════════
print("\n[۰] پاکسازی کامل...")

with connection.cursor() as cursor:
    cursor.execute("PRAGMA foreign_keys = OFF;")

OrderItem.objects.all().delete()
Order.objects.all().delete()
KitchenDiscount.objects.all().delete()
ProductionLog.objects.all().delete()
ProductionBatch.objects.all().delete()
ProductionPlanItem.objects.all().delete()
ProductionPlan.objects.all().delete()
KitchenInventory.objects.all().delete()
KitchenProduct.objects.all().delete()
RecipeSemiFinished.objects.all().delete()
RecipeIngredient.objects.all().delete()
Recipe.objects.all().delete()
SemiFinishedIngredient.objects.all().delete()
SemiFinished.objects.all().delete()
PurchaseInvoiceItem.objects.all().delete()
PurchaseInvoice.objects.all().delete()
Food.objects.all().delete()
Category.objects.all().delete()
ReadyMaterial.objects.all().delete()
RawMaterial.objects.all().delete()

with connection.cursor() as cursor:
    cursor.execute("PRAGMA foreign_keys = ON;")

print("   ✓ تمام داده‌ها پاک شدند")

# ═══════════════════════════════════════
#  ۱. مواد اولیه (40 قلم)
# ═══════════════════════════════════════
print("\n[۱] مواد اولیه...")

materials_data = [
    # ── پایه ──
    {"name": "آرد",              "unit": "kg",   "quantity": 20, "price": 8000},
    {"name": "پنیر پیتزا",       "unit": "kg",   "quantity": 10, "price": 120000},
    {"name": "سس گوجه",          "unit": "kg",   "quantity": 5,  "price": 25000},
    {"name": "قارچ",             "unit": "kg",   "quantity": 8,  "price": 45000},
    {"name": "فلفل دلمه‌ای",     "unit": "kg",   "quantity": 5,  "price": 30000},
    {"name": "کاهو",             "unit": "kg",   "quantity": 5,  "price": 20000},
    {"name": "خیار",             "unit": "kg",   "quantity": 5,  "price": 15000},
    {"name": "گوجه فرنگی",       "unit": "kg",   "quantity": 8,  "price": 18000},
    {"name": "زیتون",            "unit": "kg",   "quantity": 3,  "price": 80000},
    {"name": "روغن زیتون",       "unit": "l",    "quantity": 3,  "price": 90000},
    {"name": "آویشن",            "unit": "kg",   "quantity": 1,  "price": 150000},
    {"name": "نمک",              "unit": "kg",   "quantity": 5,  "price": 5000},
    {"name": "خمیر پیتزا",       "unit": "unit", "quantity": 30, "price": 12000},
    {"name": "سینه مرغ",         "unit": "kg",   "quantity": 10, "price": 85000},
    {"name": "ادویه سوخاری",     "unit": "kg",   "quantity": 2,  "price": 120000},
    {"name": "پودر سوخاری",      "unit": "kg",   "quantity": 5,  "price": 40000},
    {"name": "نان باگت",         "unit": "unit", "quantity": 20, "price": 8000},
    {"name": "کالباس",           "unit": "kg",   "quantity": 5,  "price": 180000},
    {"name": "سس مایونز",        "unit": "kg",   "quantity": 3,  "price": 35000},
    {"name": "سس خردل",          "unit": "kg",   "quantity": 2,  "price": 40000},
    {"name": "پیاز",             "unit": "kg",   "quantity": 8,  "price": 12000},
    {"name": "سیر",              "unit": "kg",   "quantity": 2,  "price": 60000},
    {"name": "جعفری",            "unit": "kg",   "quantity": 2,  "price": 35000},
    {"name": "لیمو ترش",         "unit": "unit", "quantity": 20, "price": 5000},
    {"name": "ذرت",              "unit": "kg",   "quantity": 5,  "price": 25000},
    {"name": "رب گوجه",          "unit": "kg",   "quantity": 5,  "price": 45000},
    {"name": "سرکه",             "unit": "l",    "quantity": 2,  "price": 18000},
    {"name": "شکر",              "unit": "kg",   "quantity": 3,  "price": 22000},
    {"name": "فلفل سیاه",        "unit": "kg",   "quantity": 1,  "price": 200000},
    {"name": "پاپریکا",          "unit": "kg",   "quantity": 1,  "price": 180000},
    # ── نوشیدنی (جدید) ──
    {"name": "ماست",             "unit": "kg",   "quantity": 5,  "price": 30000},
    {"name": "پرتقال",           "unit": "kg",   "quantity": 10, "price": 25000},
    {"name": "موز",              "unit": "kg",   "quantity": 5,  "price": 35000},
    {"name": "نعناع تازه",       "unit": "kg",   "quantity": 1,  "price": 40000},
    {"name": "یخ",               "unit": "kg",   "quantity": 10, "price": 3000},
    {"name": "توت‌فرنگی",        "unit": "kg",   "quantity": 3,  "price": 60000},
    {"name": "عسل",              "unit": "kg",   "quantity": 2,  "price": 180000},
    {"name": "شیر",              "unit": "l",    "quantity": 5,  "price": 28000},
    {"name": "قهوه اسپرسو",     "unit": "kg",   "quantity": 1,  "price": 350000},
    {"name": "چای سیاه",         "unit": "kg",   "quantity": 2,  "price": 120000},
]

mat_objects = {}
for m in materials_data:
    obj = RawMaterial.objects.create(
        name=m["name"], unit=m["unit"],
        quantity=m["quantity"], price=m["price"],
    )
    mat_objects[m["name"]] = obj

print(f"   ✓ {len(materials_data)} ماده اولیه ثبت شد")

# ═══════════════════════════════════════
#  ۲. مواد آماده (25 قلم)
# ═══════════════════════════════════════
print("\n[۲] مواد آماده...")

# ── دسته‌بندی‌ها رو زودتر میسازیم چون ReadyMaterial بهشون نیاز داره ──
cats_data = [
    {"name": "پیتزا",    "order": 1},
    {"name": "سالاد",    "order": 2},
    {"name": "سوخاری",   "order": 3},
    {"name": "ساندویچ",  "order": 4},
    {"name": "پیش‌غذا",  "order": 5},
    {"name": "نوشیدنی",  "order": 6},
]

cat_objects = {}
for c in cats_data:
    obj = Category.objects.create(name=c["name"], order=c["order"])
    cat_objects[c["name"]] = obj

drinks_cat = cat_objects["نوشیدنی"]

ready_data = [
    # ── نوشیدنی‌های بسته‌بندی (دارای دسته‌بندی → در POS نشون داده میشن) ──
    {"name": "نوشابه کولا ۳۳۰ml",      "unit": "unit", "qty": 48, "purchase": 10000,  "selling": 15000,  "cat": drinks_cat},
    {"name": "نوشابه پرتقالی ۳۳۰ml",  "unit": "unit", "qty": 48, "purchase": 10000,  "selling": 15000,  "cat": drinks_cat},
    {"name": "نوشابه لیمویی ۳۳۰ml",   "unit": "unit", "qty": 24, "purchase": 10000,  "selling": 15000,  "cat": drinks_cat},
    {"name": "دلستر انگور",            "unit": "unit", "qty": 24, "purchase": 16000,  "selling": 22000,  "cat": drinks_cat},
    {"name": "دلستر لیمو",             "unit": "unit", "qty": 24, "purchase": 16000,  "selling": 22000,  "cat": drinks_cat},
    {"name": "دلستر هلو",              "unit": "unit", "qty": 24, "purchase": 16000,  "selling": 22000,  "cat": drinks_cat},
    {"name": "آب معدنی",               "unit": "unit", "qty": 48, "purchase": 5000,   "selling": 8000,   "cat": drinks_cat},
    {"name": "دوغ",                    "unit": "unit", "qty": 24, "purchase": 8000,   "selling": 12000,  "cat": drinks_cat},
    {"name": "ماءالشعیر",              "unit": "unit", "qty": 24, "purchase": 12000,  "selling": 18000,  "cat": drinks_cat},
    {"name": "نوشابه کولا ۱.۵ لیتر",  "unit": "unit", "qty": 12, "purchase": 20000,  "selling": 28000,  "cat": drinks_cat},
    # ── نان (بدون دسته‌بندی → در POS نشون داده نمیشن) ──
    {"name": "نان باگت تازه",          "unit": "unit", "qty": 30, "purchase": 7000,   "selling": 10000,  "cat": None},
    {"name": "نان تست",                "unit": "pack", "qty": 10, "purchase": 18000,  "selling": 25000,  "cat": None},
    {"name": "نان لواش",               "unit": "unit", "qty": 40, "purchase": 3500,   "selling": 5000,   "cat": None},
    # ── بسته‌بندی (بدون دسته‌بندی) ──
    {"name": "جعبه پیتزا کوچک",       "unit": "unit", "qty": 50, "purchase": 3500,   "selling": 5000,   "cat": None},
    {"name": "جعبه پیتزا متوسط",      "unit": "unit", "qty": 50, "purchase": 5500,   "selling": 8000,   "cat": None},
    {"name": "جعبه پیتزا بزرگ",       "unit": "unit", "qty": 30, "purchase": 8500,   "selling": 12000,  "cat": None},
    {"name": "جعبه ساندویچ",          "unit": "unit", "qty": 50, "purchase": 2800,   "selling": 4000,   "cat": None},
    {"name": "ظرف سالاد یکبارمصرف",   "unit": "unit", "qty": 50, "purchase": 2500,   "selling": 3500,   "cat": None},
    {"name": "بسته‌بندی سوخاری",      "unit": "unit", "qty": 50, "purchase": 3000,   "selling": 4500,   "cat": None},
    {"name": "کیسه دسته‌دار",         "unit": "unit", "qty": 200,"purchase": 600,    "selling": 1000,   "cat": None},
    {"name": "دستمال کاغذی بسته‌ای",  "unit": "pack", "qty": 20, "purchase": 5000,   "selling": 8000,   "cat": None},
    {"name": "چنگال یکبارمصرف",       "unit": "unit", "qty": 100,"purchase": 300,    "selling": 500,    "cat": None},
    {"name": "قاشق یکبارمصرف",        "unit": "unit", "qty": 100,"purchase": 300,    "selling": 500,    "cat": None},
    {"name": "لیوان یکبارمصرف",       "unit": "unit", "qty": 100,"purchase": 400,    "selling": 600,    "cat": None},
    {"name": "نی نوشیدنی",            "unit": "unit", "qty": 100,"purchase": 150,    "selling": 300,    "cat": None},
]

rm_objects = {}
for r in ready_data:
    obj = ReadyMaterial.objects.create(
        name=r["name"], unit=r["unit"], quantity=r["qty"],
        purchase_price=r["purchase"], selling_price=r["selling"],
        category=r["cat"], is_active=True,
    )
    rm_objects[r["name"]] = obj

print(f"   ✓ {len(ready_data)} ماده آماده ثبت شد")
print(f"     └─ با دسته‌بندی (در POS): {sum(1 for r in ready_data if r['cat'])}")

# ═══════════════════════════════════════
#  ۳. غذاها (33 آیتم)
# ═══════════════════════════════════════
print("\n[۳] غذاها...")

foods_data = [
    # ── پیتزا ──
    {"name": "پیتزا مخصوص (دو نفره)",       "category": "پیتزا",   "price": 299000},
    {"name": "پیتزا مخصوص (سه نفره)",       "category": "پیتزا",   "price": 429000},
    {"name": "پیتزا مخصوص (پنج نفره)",      "category": "پیتزا",   "price": 649000},
    {"name": "پیتزا مرغ و قارچ (دو نفره)",   "category": "پیتزا",   "price": 320000},
    {"name": "پیتزا مرغ و قارچ (سه نفره)",   "category": "پیتزا",   "price": 459000},
    {"name": "پیتزا مرغ و قارچ (پنج نفره)",  "category": "پیتزا",   "price": 699000},
    {"name": "پیتزا سبزیجات (دو نفره)",      "category": "پیتزا",   "price": 269000},
    {"name": "پیتزا سبزیجات (سه نفره)",      "category": "پیتزا",   "price": 389000},
    {"name": "پیتزا سبزیجات (پنج نفره)",     "category": "پیتزا",   "price": 589000},
    {"name": "پیتزا پپرونی (دو نفره)",       "category": "پیتزا",   "price": 310000},
    {"name": "پیتزا پپرونی (سه نفره)",       "category": "پیتزا",   "price": 445000},
    {"name": "پیتزا پپرونی (پنج نفره)",      "category": "پیتزا",   "price": 679000},
    # ── سالاد ──
    {"name": "سالاد سبزیجات",                "category": "سالاد",    "price": 185000},
    {"name": "سالاد سزار",                   "category": "سالاد",    "price": 220000},
    {"name": "سالاد فصل",                    "category": "سالاد",    "price": 165000},
    {"name": "سالاد یونانی",                 "category": "سالاد",    "price": 235000},
    # ── سوخاری ──
    {"name": "مرغ سوخاری (۴ تکه)",          "category": "سوخاری",   "price": 280000},
    {"name": "مرغ سوخاری (۶ تکه)",          "category": "سوخاری",   "price": 390000},
    {"name": "مرغ سوخاری (۸ تکه)",          "category": "سوخاری",   "price": 490000},
    {"name": "بال سوخاری (۶ عدد)",          "category": "سوخاری",   "price": 220000},
    # ── ساندویچ ──
    {"name": "ساندویچ کالباس",               "category": "ساندویچ",  "price": 150000},
    {"name": "ساندویچ مرغ گریل",             "category": "ساندویچ",  "price": 195000},
    {"name": "ساندویچ سوسیس بندری",         "category": "ساندویچ",  "price": 170000},
    # ── پیش‌غذا ──
    {"name": "سیب‌زمینی سرخ‌شده",           "category": "پیش‌غذا",  "price": 120000},
    {"name": "قارچ سوخاری",                 "category": "پیش‌غذا",  "price": 145000},
    {"name": "حلقه پیاز",                   "category": "پیش‌غذا",  "price": 110000},
    # ── نوشیدنی تولیدی ──
    {"name": "آبمیوه پرتقال",               "category": "نوشیدنی",  "price": 25000},
    {"name": "آبمیوه لیمو",                 "category": "نوشیدنی",  "price": 20000},
    {"name": "لیموناد نعناع",               "category": "نوشیدنی",  "price": 22000},
    {"name": "شیرموز",                      "category": "نوشیدنی",  "price": 28000},
    {"name": "اسموتی میوه‌ای",              "category": "نوشیدنی",  "price": 35000},
    {"name": "قهوه اسپرسو",                "category": "نوشیدنی",  "price": 30000},
    {"name": "چای",                         "category": "نوشیدنی",  "price": 12000},
]

food_objects = {}
for f in foods_data:
    obj = Food.objects.create(
        name=f["name"], category=cat_objects[f["category"]],
        final_price=f["price"],
    )
    food_objects[f["name"]] = obj

print(f"   ✓ {len(foods_data)} غذا ثبت شد")

# ═══════════════════════════════════════
#  ۴. مواد نیمه‌آماده (8 عدد)
# ═══════════════════════════════════════
print("\n[۴] مواد نیمه‌آماده...")

sf_data = [
    {
        "name": "سس مخصوص پیتزا", "category": "sauce", "unit": "kg",
        "description": "سس گوجه با ادویه مخصوص پیتزا",
        "profit": 30, "quantity_produced": 3,
        "ingredients": [
            ("سس گوجه", 1.5), ("رب گوجه", 0.5), ("سیر", 0.1),
            ("آویشن", 0.05), ("نمک", 0.05), ("روغن زیتون", 0.2),
        ]
    },
    {
        "name": "سس سزار", "category": "sauce", "unit": "kg",
        "description": "سس سزار خانگی با لیمو و سیر",
        "profit": 40, "quantity_produced": 2,
        "ingredients": [
            ("سس مایونز", 0.8), ("لیمو ترش", 3), ("سیر", 0.1),
            ("پنیر پیتزا", 0.1), ("روغن زیتون", 0.1), ("نمک", 0.02),
        ]
    },
    {
        "name": "سس خردل عسلی", "category": "sauce", "unit": "kg",
        "description": "سس خردل با عسل برای ساندویچ و سالاد",
        "profit": 35, "quantity_produced": 1.5,
        "ingredients": [
            ("سس خردل", 0.5), ("سس مایونز", 0.5),
            ("شکر", 0.1), ("سرکه", 0.1), ("نمک", 0.02),
        ]
    },
    {
        "name": "ماریناد مرغ", "category": "marinade", "unit": "kg",
        "description": "ماریناد مخصوص مرغ گریل و سوخاری",
        "profit": 25, "quantity_produced": 2,
        "ingredients": [
            ("ماست", 0.5), ("سیر", 0.15), ("آویشن", 0.03),
            ("فلفل سیاه", 0.02), ("پاپریکا", 0.03),
            ("نمک", 0.05), ("روغن زیتون", 0.2),
        ]
    },
    {
        "name": "خمیر پیتزا دست‌ساز", "category": "dough", "unit": "unit",
        "description": "خمیر پیتزا تازه با آرد مخصوص",
        "profit": 20, "quantity_produced": 10,
        "ingredients": [("آرد", 2), ("نمک", 0.05), ("روغن زیتون", 0.1)]
    },
    {
        "name": "سس فلفل تند", "category": "sauce", "unit": "kg",
        "description": "سس تند مخصوص سوخاری",
        "profit": 35, "quantity_produced": 1,
        "ingredients": [
            ("رب گوجه", 0.3), ("فلفل سیاه", 0.05), ("پاپریکا", 0.05),
            ("سرکه", 0.1), ("شکر", 0.05), ("سیر", 0.05), ("نمک", 0.02),
        ]
    },
    {
        "name": "سوپ خامه‌ای قارچ", "category": "soup", "unit": "l",
        "description": "سوپ پیش‌غذا با قارچ و خامه",
        "profit": 30, "quantity_produced": 3,
        "ingredients": [
            ("قارچ", 0.5), ("پیاز", 0.2), ("سیر", 0.05),
            ("نمک", 0.03), ("فلفل سیاه", 0.01),
        ]
    },
    {
        "name": "شربت پایه", "category": "syrup", "unit": "l",
        "description": "شربت ساده برای پایه نوشیدنی‌ها",
        "profit": 50, "quantity_produced": 3,
        "ingredients": [("شکر", 1.5), ("لیمو ترش", 2)]
    },
]

sf_objects = {}
for s in sf_data:
    obj = SemiFinished.objects.create(
        name=s["name"], category=s["category"], unit=s["unit"],
        description=s["description"], profit_percentage=s["profit"],
        quantity_produced=s["quantity_produced"],
    )
    sf_objects[s["name"]] = obj

    for mat_name, qty in s["ingredients"]:
        mat = mat_objects.get(mat_name)
        if not mat:
            print(f"   ⚠ ماده اولیه پیدا نشد: {mat_name} (برای {s['name']})")
            continue
        SemiFinishedIngredient.objects.create(
            semi_finished=obj, raw_material=mat, quantity=qty,
        )

print(f"   ✓ {len(sf_data)} ماده نیمه‌آماده ثبت شد")

# ═══════════════════════════════════════
#  ۵. دستور پخت (33 عدد)
# ═══════════════════════════════════════
print("\n[۵] دستور پخت...")

SIZE_2P = 1.0
SIZE_3P = 1.5
SIZE_5P = 2.5

recipes_data = [
    # ──── پیتزا مخصوص ────
    {"food": "پیتزا مخصوص (دو نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.2), ("قارچ", 0.1),
        ("فلفل دلمه‌ای", 0.05), ("زیتون", 0.05), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.15)], "scale": SIZE_2P},
    {"food": "پیتزا مخصوص (سه نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.2), ("قارچ", 0.1),
        ("فلفل دلمه‌ای", 0.05), ("زیتون", 0.05), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.15)], "scale": SIZE_3P},
    {"food": "پیتزا مخصوص (پنج نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.2), ("قارچ", 0.1),
        ("فلفل دلمه‌ای", 0.05), ("زیتون", 0.05), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.15)], "scale": SIZE_5P},
    # ──── پیتزا مرغ و قارچ ────
    {"food": "پیتزا مرغ و قارچ (دو نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.2), ("قارچ", 0.15),
        ("سینه مرغ", 0.2), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.1), ("ماریناد مرغ", 0.1)], "scale": SIZE_2P},
    {"food": "پیتزا مرغ و قارچ (سه نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.2), ("قارچ", 0.15),
        ("سینه مرغ", 0.2), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.1), ("ماریناد مرغ", 0.1)], "scale": SIZE_3P},
    {"food": "پیتزا مرغ و قارچ (پنج نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.2), ("قارچ", 0.15),
        ("سینه مرغ", 0.2), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.1), ("ماریناد مرغ", 0.1)], "scale": SIZE_5P},
    # ──── پیتزا سبزیجات ────
    {"food": "پیتزا سبزیجات (دو نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.15), ("قارچ", 0.1),
        ("فلفل دلمه‌ای", 0.1), ("ذرت", 0.08), ("زیتون", 0.05), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.12)], "scale": SIZE_2P},
    {"food": "پیتزا سبزیجات (سه نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.15), ("قارچ", 0.1),
        ("فلفل دلمه‌ای", 0.1), ("ذرت", 0.08), ("زیتون", 0.05), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.12)], "scale": SIZE_3P},
    {"food": "پیتزا سبزیجات (پنج نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.15), ("قارچ", 0.1),
        ("فلفل دلمه‌ای", 0.1), ("ذرت", 0.08), ("زیتون", 0.05), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.12)], "scale": SIZE_5P},
    # ──── پیتزا پپرونی ────
    {"food": "پیتزا پپرونی (دو نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.25), ("کالباس", 0.15),
        ("فلفل دلمه‌ای", 0.03), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.1)], "scale": SIZE_2P},
    {"food": "پیتزا پپرونی (سه نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.25), ("کالباس", 0.15),
        ("فلفل دلمه‌ای", 0.03), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.1)], "scale": SIZE_3P},
    {"food": "پیتزا پپرونی (پنج نفره)", "raw": [
        ("خمیر پیتزا", 1), ("پنیر پیتزا", 0.25), ("کالباس", 0.15),
        ("فلفل دلمه‌ای", 0.03), ("آویشن", 0.01),
    ], "semi": [("سس مخصوص پیتزا", 0.1)], "scale": SIZE_5P},
    # ──── سالادها ────
    {"food": "سالاد سبزیجات", "raw": [
        ("کاهو", 0.3), ("خیار", 0.2), ("گوجه فرنگی", 0.2),
        ("زیتون", 0.05), ("روغن زیتون", 0.05), ("نمک", 0.01),
    ], "semi": [], "scale": 1.0},
    {"food": "سالاد سزار", "raw": [
        ("کاهو", 0.3), ("سینه مرغ", 0.15), ("پنیر پیتزا", 0.05),
        ("روغن زیتون", 0.05), ("لیمو ترش", 0.5), ("نمک", 0.01),
    ], "semi": [("سس سزار", 0.1)], "scale": 1.0},
    {"food": "سالاد فصل", "raw": [
        ("کاهو", 0.2), ("خیار", 0.15), ("گوجه فرنگی", 0.15),
        ("ذرت", 0.05), ("نمک", 0.01), ("روغن زیتون", 0.03),
    ], "semi": [], "scale": 1.0},
    {"food": "سالاد یونانی", "raw": [
        ("خیار", 0.2), ("گوجه فرنگی", 0.2), ("فلفل دلمه‌ای", 0.1),
        ("زیتون", 0.1), ("پنیر پیتزا", 0.1), ("روغن زیتون", 0.05),
        ("لیمو ترش", 0.5), ("آویشن", 0.01),
    ], "semi": [], "scale": 1.0},
    # ──── سوخاری ────
    {"food": "مرغ سوخاری (۴ تکه)", "raw": [
        ("سینه مرغ", 0.4), ("پودر سوخاری", 0.1), ("ادویه سوخاری", 0.02),
        ("روغن زیتون", 0.1), ("نمک", 0.01),
    ], "semi": [("سس فلفل تند", 0.05)], "scale": 1.0},
    {"food": "مرغ سوخاری (۶ تکه)", "raw": [
        ("سینه مرغ", 0.6), ("پودر سوخاری", 0.15), ("ادویه سوخاری", 0.03),
        ("روغن زیتون", 0.15), ("نمک", 0.02),
    ], "semi": [("سس فلفل تند", 0.08)], "scale": 1.0},
    {"food": "مرغ سوخاری (۸ تکه)", "raw": [
        ("سینه مرغ", 0.8), ("پودر سوخاری", 0.2), ("ادویه سوخاری", 0.04),
        ("روغن زیتون", 0.2), ("نمک", 0.02),
    ], "semi": [("سس فلفل تند", 0.1)], "scale": 1.0},
    {"food": "بال سوخاری (۶ عدد)", "raw": [
        ("سینه مرغ", 0.3), ("پودر سوخاری", 0.08), ("ادویه سوخاری", 0.02),
        ("روغن زیتون", 0.08), ("نمک", 0.01),
    ], "semi": [("سس فلفل تند", 0.05)], "scale": 1.0},
    # ──── ساندویچ‌ها ────
    {"food": "ساندویچ کالباس", "raw": [
        ("نان باگت", 1), ("کالباس", 0.15), ("کاهو", 0.05),
        ("گوجه فرنگی", 0.05), ("سس مایونز", 0.03), ("سس خردل", 0.02),
    ], "semi": [], "scale": 1.0},
    {"food": "ساندویچ مرغ گریل", "raw": [
        ("نان باگت", 1), ("سینه مرغ", 0.2), ("کاهو", 0.05),
        ("گوجه فرنگی", 0.05), ("سس مایونز", 0.03), ("فلفل دلمه‌ای", 0.03),
    ], "semi": [("ماریناد مرغ", 0.08), ("سس خردل عسلی", 0.05)], "scale": 1.0},
    {"food": "ساندویچ سوسیس بندری", "raw": [
        ("نان باگت", 1), ("کالباس", 0.12), ("پیاز", 0.05),
        ("گوجه فرنگی", 0.05), ("سس خردل", 0.02), ("فلفل دلمه‌ای", 0.03),
    ], "semi": [("سس فلفل تند", 0.03)], "scale": 1.0},
    # ──── پیش‌غذاها ────
    {"food": "سیب‌زمینی سرخ‌شده", "raw": [
        ("روغن زیتون", 0.08), ("نمک", 0.01),
    ], "semi": [("سس فلفل تند", 0.03)], "scale": 1.0},
    {"food": "قارچ سوخاری", "raw": [
        ("قارچ", 0.25), ("پودر سوخاری", 0.05), ("روغن زیتون", 0.08), ("نمک", 0.01),
    ], "semi": [("سس فلفل تند", 0.03)], "scale": 1.0},
    {"food": "حلقه پیاز", "raw": [
        ("پیاز", 0.2), ("آرد", 0.05), ("پودر سوخاری", 0.03),
        ("روغن زیتون", 0.08), ("نمک", 0.01),
    ], "semi": [("سس خردل عسلی", 0.03)], "scale": 1.0},
    # ──── نوشیدنی‌ها ────
    {"food": "آبمیوه پرتقال", "raw": [
        ("پرتقال", 0.4), ("شکر", 0.05), ("یخ", 0.15),
    ], "semi": [("شربت پایه", 0.1)], "scale": 1.0},
    {"food": "آبمیوه لیمو", "raw": [
        ("لیمو ترش", 3), ("شکر", 0.08), ("یخ", 0.15),
    ], "semi": [("شربت پایه", 0.08)], "scale": 1.0},
    {"food": "لیموناد نعناع", "raw": [
        ("لیمو ترش", 2), ("نعناع تازه", 0.03), ("شکر", 0.06), ("یخ", 0.2),
    ], "semi": [("شربت پایه", 0.1)], "scale": 1.0},
    {"food": "شیرموز", "raw": [
        ("موز", 0.25), ("شیر", 0.3), ("شکر", 0.03), ("یخ", 0.1),
    ], "semi": [], "scale": 1.0},
    {"food": "اسموتی میوه‌ای", "raw": [
        ("موز", 0.15), ("توت‌فرنگی", 0.15), ("شیر", 0.2),
        ("عسل", 0.03), ("یخ", 0.15),
    ], "semi": [], "scale": 1.0},
    {"food": "قهوه اسپرسو", "raw": [
        ("قهوه اسپرسو", 0.02), ("شکر", 0.02),
    ], "semi": [], "scale": 1.0},
    {"food": "چای", "raw": [
        ("چای سیاه", 0.01), ("شکر", 0.02),
    ], "semi": [], "scale": 1.0},
]

recipe_objects = {}
for r in recipes_data:
    food = food_objects.get(r["food"])
    if not food:
        print(f"   ⚠ غذا پیدا نشد: {r['food']}")
        continue

    recipe = Recipe.objects.create(food=food, yield_quantity=1, is_active=True)
    recipe_objects[r["food"]] = recipe

    for mat_name, qty in r["raw"]:
        mat = mat_objects.get(mat_name)
        if not mat:
            print(f"   ⚠ ماده اولیه پیدا نشد: {mat_name} (برای {r['food']})")
            continue
        RecipeIngredient.objects.create(
            recipe=recipe, raw_material=mat,
            quantity=round(qty * r["scale"], 4), unit=mat.unit,
        )

    for sf_name, qty in r.get("semi", []):
        sf = sf_objects.get(sf_name)
        if not sf:
            print(f"   ⚠ نیمه‌آماده پیدا نشد: {sf_name} (برای {r['food']})")
            continue
        RecipeSemiFinished.objects.create(
            recipe=recipe, semi_finished=sf,
            quantity=round(qty * r["scale"], 4), unit=sf.unit,
        )

print(f"   ✓ {len(recipes_data)} دستور پخت ثبت شد")

# ═══════════════════════════════════════
#  ۶. محصول آشپزخانه (33 عدد)
# ═══════════════════════════════════════
print("\n[۶] محصولات آشپزخانه...")

kp_data = [
    # پیتزا
    {"name": "پیتزا مخصوص (دو نفره)",      "cat": "pizza",     "price": 299000,  "food": "پیتزا مخصوص (دو نفره)"},
    {"name": "پیتزا مخصوص (سه نفره)",      "cat": "pizza",     "price": 429000,  "food": "پیتزا مخصوص (سه نفره)"},
    {"name": "پیتزا مخصوص (پنج نفره)",     "cat": "pizza",     "price": 649000,  "food": "پیتزا مخصوص (پنج نفره)"},
    {"name": "پیتزا مرغ و قارچ (دو نفره)",  "cat": "pizza",     "price": 320000,  "food": "پیتزا مرغ و قارچ (دو نفره)"},
    {"name": "پیتزا مرغ و قارچ (سه نفره)",  "cat": "pizza",     "price": 459000,  "food": "پیتزا مرغ و قارچ (سه نفره)"},
    {"name": "پیتزا مرغ و قارچ (پنج نفره)", "cat": "pizza",     "price": 699000,  "food": "پیتزا مرغ و قارچ (پنج نفره)"},
    {"name": "پیتزا سبزیجات (دو نفره)",     "cat": "pizza",     "price": 269000,  "food": "پیتزا سبزیجات (دو نفره)"},
    {"name": "پیتزا سبزیجات (سه نفره)",     "cat": "pizza",     "price": 389000,  "food": "پیتزا سبزیجات (سه نفره)"},
    {"name": "پیتزا سبزیجات (پنج نفره)",    "cat": "pizza",     "price": 589000,  "food": "پیتزا سبزیجات (پنج نفره)"},
    {"name": "پیتزا پپرونی (دو نفره)",      "cat": "pizza",     "price": 310000,  "food": "پیتزا پپرونی (دو نفره)"},
    {"name": "پیتزا پپرونی (سه نفره)",      "cat": "pizza",     "price": 445000,  "food": "پیتزا پپرونی (سه نفره)"},
    {"name": "پیتزا پپرونی (پنج نفره)",     "cat": "pizza",     "price": 679000,  "food": "پیتزا پپرونی (پنج نفره)"},
    # سالاد
    {"name": "سالاد سبزیجات",               "cat": "salad",     "price": 185000,  "food": "سالاد سبزیجات"},
    {"name": "سالاد سزار",                  "cat": "salad",     "price": 220000,  "food": "سالاد سزار"},
    {"name": "سالاد فصل",                   "cat": "salad",     "price": 165000,  "food": "سالاد فصل"},
    {"name": "سالاد یونانی",                "cat": "salad",     "price": 235000,  "food": "سالاد یونانی"},
    # سوخاری
    {"name": "مرغ سوخاری (۴ تکه)",         "cat": "fried",     "price": 280000,  "food": "مرغ سوخاری (۴ تکه)"},
    {"name": "مرغ سوخاری (۶ تکه)",         "cat": "fried",     "price": 390000,  "food": "مرغ سوخاری (۶ تکه)"},
    {"name": "مرغ سوخاری (۸ تکه)",         "cat": "fried",     "price": 490000,  "food": "مرغ سوخاری (۸ تکه)"},
    {"name": "بال سوخاری (۶ عدد)",         "cat": "fried",     "price": 220000,  "food": "بال سوخاری (۶ عدد)"},
    # ساندویچ
    {"name": "ساندویچ کالباس",              "cat": "sandwich",  "price": 150000,  "food": "ساندویچ کالباس"},
    {"name": "ساندویچ مرغ گریل",            "cat": "sandwich",  "price": 195000,  "food": "ساندویچ مرغ گریل"},
    {"name": "ساندویچ سوسیس بندری",        "cat": "sandwich",  "price": 170000,  "food": "ساندویچ سوسیس بندری"},
    # پیش‌غذا
    {"name": "سیب‌زمینی سرخ‌شده",          "cat": "appetizer", "price": 120000,  "food": "سیب‌زمینی سرخ‌شده"},
    {"name": "قارچ سوخاری",                "cat": "appetizer", "price": 145000,  "food": "قارچ سوخاری"},
    {"name": "حلقه پیاز",                  "cat": "appetizer", "price": 110000,  "food": "حلقه پیاز"},
    # نوشیدنی تولیدی
    {"name": "آبمیوه پرتقال",              "cat": "drink",     "price": 25000,   "food": "آبمیوه پرتقال"},
    {"name": "آبمیوه لیمو",                "cat": "drink",     "price": 20000,   "food": "آبمیوه لیمو"},
    {"name": "لیموناد نعناع",              "cat": "drink",     "price": 22000,   "food": "لیموناد نعناع"},
    {"name": "شیرموز",                     "cat": "drink",     "price": 28000,   "food": "شیرموز"},
    {"name": "اسموتی میوه‌ای",             "cat": "drink",     "price": 35000,   "food": "اسموتی میوه‌ای"},
    {"name": "قهوه اسپرسو",               "cat": "drink",     "price": 30000,   "food": "قهوه اسپرسو"},
    {"name": "چای",                        "cat": "drink",     "price": 12000,   "food": "چای"},
]

kp_objects = {}
for k in kp_data:
    recipe = recipe_objects.get(k["food"])
    if not recipe:
        print(f"   ⚠ دستور پخت ندارد: {k['name']}")
        continue

    obj = KitchenProduct.objects.create(
        name=k["name"], recipe=recipe, category=k["cat"],
        selling_price=k["price"],
        description=f"محصول آشپزخانه: {k['name']}",
    )
    kp_objects[k["name"]] = obj

print(f"   ✓ {len(kp_data)} محصول آشپزخانه ثبت شد")

# ═══════════════════════════════════════
#  ۷. تولید محصولات
# ═══════════════════════════════════════
print("\n[۷] تولید محصولات...")

produce_qty_food = 15
produce_qty_drink = 30

for name, kp in kp_objects.items():
    qty = produce_qty_drink if kp.category == "drink" else produce_qty_food
    inv = kp.get_inventory()
    inv.quantity = qty
    inv.save()
    ProductionLog.objects.create(
        kitchen_product=kp, action='produce',
        quantity=qty, details="تولید اولیه تست",
    )

print(f"   ✓ {len(kp_objects)} محصول تولید شد (غذا: {produce_qty_food} / نوشیدنی: {produce_qty_drink})")

# ═══════════════════════════════════════
#  ۸. فاکتور خرید (6 عدد)
# ═══════════════════════════════════════
print("\n[۸] فاکتورهای خرید...")

invoices_data = [
    {
        "supplier": "تأمین‌کننده مواد غذایی پارسیان",
        "number": "INV-1404-001",
        "desc": "خرید مواد اولیه هفته اول",
        "items": [
            {"name": "آرد", "qty": 50, "unit": "kg", "price": 8000},
            {"name": "پنیر پیتزا", "qty": 20, "unit": "kg", "price": 120000},
            {"name": "سس گوجه", "qty": 10, "unit": "kg", "price": 25000},
            {"name": "روغن زیتون", "qty": 5, "unit": "l", "price": 90000},
        ]
    },
    {
        "supplier": "مرغ و پروتئین سپید",
        "number": "INV-1404-002",
        "desc": "خرید مرغ و کالباس",
        "items": [
            {"name": "سینه مرغ", "qty": 25, "unit": "kg", "price": 85000},
            {"name": "کالباس", "qty": 10, "unit": "kg", "price": 180000},
        ]
    },
    {
        "supplier": "سبزیجات تازه البرز",
        "number": "INV-1404-003",
        "desc": "خرید سبزیجات تازه",
        "items": [
            {"name": "قارچ", "qty": 15, "unit": "kg", "price": 45000},
            {"name": "فلفل دلمه‌ای", "qty": 10, "unit": "kg", "price": 30000},
            {"name": "کاهو", "qty": 10, "unit": "kg", "price": 20000},
            {"name": "گوجه فرنگی", "qty": 15, "unit": "kg", "price": 18000},
            {"name": "خیار", "qty": 10, "unit": "kg", "price": 15000},
        ]
    },
    {
        "supplier": "نوشیدنی‌های خزر",
        "number": "INV-1404-004",
        "desc": "خرید نوشیدنی و دلستر",
        "items": [
            {"name": "نوشابه کولا ۳۳۰ml", "qty": 96, "unit": "unit", "price": 10000},
            {"name": "دلستر انگور", "qty": 48, "unit": "unit", "price": 16000},
            {"name": "آب معدنی", "qty": 96, "unit": "unit", "price": 5000},
            {"name": "دوغ", "qty": 48, "unit": "unit", "price": 8000},
        ]
    },
    {
        "supplier": "میوه و تره‌بار بهار",
        "number": "INV-1404-005",
        "desc": "خرید میوه برای نوشیدنی‌ها",
        "items": [
            {"name": "پرتقال", "qty": 20, "unit": "kg", "price": 25000},
            {"name": "موز", "qty": 10, "unit": "kg", "price": 35000},
            {"name": "توت‌فرنگی", "qty": 5, "unit": "kg", "price": 60000},
            {"name": "لیمو ترش", "qty": 40, "unit": "unit", "price": 5000},
            {"name": "نعناع تازه", "qty": 2, "unit": "kg", "price": 40000},
        ]
    },
    {
        "supplier": "لبنیات و نوشیدنی‌های طبیعی",
        "number": "INV-1404-006",
        "desc": "خرید شیر، عسل و قهوه",
        "items": [
            {"name": "شیر", "qty": 10, "unit": "l", "price": 28000},
            {"name": "عسل", "qty": 3, "unit": "kg", "price": 180000},
            {"name": "قهوه اسپرسو", "qty": 2, "unit": "kg", "price": 350000},
            {"name": "چای سیاه", "qty": 3, "unit": "kg", "price": 120000},
        ]
    },
]

for inv_data in invoices_data:
    invoice = PurchaseInvoice.objects.create(
        supplier_name=inv_data["supplier"],
        invoice_number=inv_data["number"],
        date=timezone.now().date(),
        description=inv_data["desc"],
    )
    for item in inv_data["items"]:
        PurchaseInvoiceItem.objects.create(
            invoice=invoice, item_name=item["name"],
            quantity=item["qty"], unit=item["unit"], unit_price=item["price"],
        )
    total = sum(i["qty"] * i["price"] for i in inv_data["items"])
    print(f"   ✓ {inv_data['number']} — {total:,} تومان ({len(inv_data['items'])} قلم)")

# ═══════════════════════════════════════
#  ۹. سفارشات (8 عدد)
# ═══════════════════════════════════════
print("\n[۹] سفارشات...")

orders_data = [
    {
        "customer": "احمد محمدی", "phone": "09121234567", "status": "delivered",
        "items": [("پیتزا مخصوص (دو نفره)", 2), ("آبمیوه پرتقال", 3), ("سیب‌زمینی سرخ‌شده", 1)]
    },
    {
        "customer": "سارا احمدی", "phone": "09359876543", "status": "delivered",
        "items": [("پیتزا مرغ و قارچ (سه نفره)", 1), ("سالاد سزار", 1), ("لیموناد نعناع", 2)]
    },
    {
        "customer": "رضا کریمی", "phone": "09191112233", "status": "delivered",
        "items": [("مرغ سوخاری (۶ تکه)", 1), ("ساندویچ کالباس", 2), ("قارچ سوخاری", 1), ("اسموتی میوه‌ای", 2), ("شیرموز", 1)]
    },
    {
        "customer": "مریم حسینی", "phone": "09123334455", "status": "ready",
        "items": [("پیتزا پپرونی (پنج نفره)", 1), ("سالاد یونانی", 1), ("حلقه پیاز", 2), ("قهوه اسپرسو", 2), ("چای", 1)]
    },
    {
        "customer": "علی رضایی", "phone": "09367778899", "status": "preparing",
        "items": [("پیتزا سبزیجات (دو نفره)", 1), ("ساندویچ مرغ گریل", 1), ("سالاد فصل", 1), ("آبمیوه لیمو", 3)]
    },
    {
        "customer": "زهرا نوری", "phone": "09184445566", "status": "pending",
        "items": [("مرغ سوخاری (۸ تکه)", 1), ("بال سوخاری (۶ عدد)", 1), ("پیتزا مخصوص (پنج نفره)", 1), ("سالاد سبزیجات", 2), ("آبمیوه پرتقال", 4), ("لیموناد نعناع", 2), ("چای", 3)]
    },
    {
        "customer": "محمد کاظمی", "phone": "09129998877", "status": "preparing",
        "items": [("آبمیوه پرتقال", 5), ("شیرموز", 3), ("اسموتی میوه‌ای", 2), ("قهوه اسپرسو", 4), ("چای", 2)]
    },
    {
        "customer": "نیلوفر صادقی", "phone": "09351112233", "status": "pending",
        "items": [("پیتزا مرغ و قارچ (پنج نفره)", 1), ("پیتزا پپرونی (سه نفره)", 1), ("مرغ سوخاری (۴ تکه)", 2), ("سالاد سزار", 2), ("سیب‌زمینی سرخ‌شده", 3), ("آبمیوه پرتقال", 4), ("آبمیوه لیمو", 2), ("شیرموز", 3)]
    },
]

drink_names_set = {
    "آبمیوه پرتقال", "آبمیوه لیمو", "لیموناد نعناع",
    "شیرموز", "اسموتی میوه‌ای", "قهوه اسپرسو", "چای",
}

for od in orders_data:
    total = 0
    items_created = []

    for food_name, qty in od["items"]:
        food = food_objects.get(food_name)
        if not food:
            print(f"   ⚠ غذا پیدا نشد: {food_name}")
            continue

        price = int(food.final_price)
        total += price * qty

        order_item = OrderItem(food=food, quantity=qty, price=price)
        items_created.append(order_item)

    order = Order.objects.create(
        customer_name=od["customer"], phone=od["phone"],
        status=od["status"], total_price=total,
    )

    for oi in items_created:
        oi.order = order
        oi.save()

    # کسر موجودی آشپزخانه برای سفارشات delivered
    if od["status"] in ("delivered", "ready"):
        for food_name, qty in od["items"]:
            food = food_objects.get(food_name)
            if not food:
                continue
            kp = None
            if hasattr(food, 'recipe') and food.recipe:
                kp = food.recipe.kitchen_products.first()
            if not kp:
                kp = kp_objects.get(food_name)
            if kp:
                try:
                    inv = kp.get_inventory()
                    inv.quantity = max(0, inv.quantity - qty)
                    inv.save()
                except Exception:
                    pass

    drink_count = sum(qty for name, qty in od["items"] if name in drink_names_set)
    drink_text = f" (🥤{drink_count})" if drink_count else ""
    print(f"   ✓ {od['customer']} — {total:,} تومان ({len(od['items'])} آیتم){drink_text}")

# ═══════════════════════════════════════
#  ۱۰. تخفیف‌ها (8 عدد)
# ═══════════════════════════════════════
print("\n[۱۰] تخفیف‌ها...")

now = timezone.now()
discounts_to_create = [
    {"product_name": "سالاد سبزیجات",            "name": "تخفیف ویژه سالاد",       "discount_type": "percentage",   "scope": "all_items", "value": 20,    "max_quantity": 10,  "expires_minutes": 5},
    {"product_name": "پیتزا مخصوص (دو نفره)",    "name": "حراج پیتزا مخصوص",      "discount_type": "fixed_amount", "scope": "all_items", "value": 50000, "max_quantity": None, "expires_minutes": 10},
    {"product_name": "مرغ سوخاری (۴ تکه)",       "name": "تخفیف سوخاری",          "discount_type": "percentage",   "scope": "all_items", "value": 15,    "max_quantity": 20,  "expires_minutes": 15},
    {"product_name": "پیتزا پپرونی (سه نفره)",    "name": "فروش ویژه پپرونی",      "discount_type": "fixed_amount", "scope": "all_items", "value": 70000, "max_quantity": 5,   "expires_minutes": 8},
    {"product_name": "سیب‌زمینی سرخ‌شده",        "name": "پیش‌غذا ارزان",          "discount_type": "percentage",   "scope": "all_items", "value": 25,    "max_quantity": 30,  "expires_minutes": 20},
    {"product_name": "آبمیوه پرتقال",            "name": "آبمیوه نصف قیمت!",      "discount_type": "percentage",   "scope": "all_items", "value": 50,    "max_quantity": 20,  "expires_minutes": 30},
    {"product_name": "اسموتی میوه‌ای",           "name": "تخفیف اسموتی",          "discount_type": "fixed_amount", "scope": "all_items", "value": 10000, "max_quantity": 15,  "expires_minutes": 25},
    {"product_name": "قهوه اسپرسو",             "name": "صبحانه ویژه قهوه",       "discount_type": "percentage",   "scope": "all_items", "value": 30,    "max_quantity": 50,  "expires_minutes": 60},
]

for d in discounts_to_create:
    kp = kp_objects.get(d["product_name"])
    if not kp:
        print(f"   ⚠ محصول پیدا نشد: {d['product_name']}")
        continue

    disc = KitchenDiscount.objects.create(
        name=d["name"], kitchen_product=kp,
        discount_type=d["discount_type"], scope=d["scope"],
        value=d["value"], max_quantity=d["max_quantity"],
        is_active=True,
        expires_at=now + timezone.timedelta(minutes=d["expires_minutes"]),
    )
    val_str = f"{d['value']}%" if d["discount_type"] == "percentage" else f"{d['value']:,} تومان"
    print(f"   ✓ {disc.name} ({val_str}) → {d['product_name']}")

# ═══════════════════════════════════════
#  ۱۱. تست جریان کامل
# ═══════════════════════════════════════
print("\n" + "=" * 60)
print("  ۱۱. تست جریان کامل: فاکتور → صندوق → رسید")
print("=" * 60)

# ── تست ۱: لینک Food ↔ KitchenProduct ──
print("\n  [تست ۱] لینک Food ↔ KitchenProduct:")
linked = unlinked = 0
for food in Food.objects.all():
    kp = None
    if hasattr(food, "recipe") and food.recipe:
        kp = food.recipe.kitchen_products.first()
    if not kp:
        kp = KitchenProduct.objects.filter(name=food.name).first()
    if kp:
        linked += 1
    else:
        unlinked += 1
        print(f"    ⚠ بدون آشپزخانه: {food.name}")
print(f"    ✓ لینک شده: {linked} | بدون لینک: {unlinked}")

# ── تست ۲: قیمت‌ها یکسان ──
print("\n  [تست ۲] تطابق قیمت Food ↔ KitchenProduct:")
mismatches = 0
for food in Food.objects.all():
    kp = KitchenProduct.objects.filter(name=food.name).first()
    if kp and int(kp.selling_price) != int(food.final_price):
        mismatches += 1
        print(f"    ⚠ {food.name}: منو={food.final_price} / آشپزخانه={kp.selling_price}")
print(f"    ✓ مغایرت: {mismatches}")

# ── تست ۳: ReadyMaterial در POS ──
print("\n  [تست ۳] مواد آماده در POS:")
rm_in_pos = ReadyMaterial.objects.filter(quantity__gt=0).exclude(category__isnull=True).count()
rm_total = ReadyMaterial.objects.filter(quantity__gt=0).count()
print(f"    با دسته‌بندی (در POS): {rm_in_pos}")
print(f"    بدون دسته‌بندی (بسته‌بندی): {rm_total - rm_in_pos}")

# ── تست ۴: موجودی نوشیدنی‌ها ──
print("\n  [تست ۴] موجودی نوشیدنی‌های آشپزخانه:")
for kp in KitchenProduct.objects.filter(category="drink").order_by("selling_price"):
    inv = kp.get_inventory()
    print(f"    {kp.name}: {inv.quantity} عدد")

# ═══════════════════════════════════════
#  ۴.۵. موجودی اولیه نیمه‌آماده‌ها
# ═══════════════════════════════════════
print("\n[۴.۵] موجودی اولیه نیمه‌آماده‌ها...")

initial_stock = {
    "سس مخصوص پیتزا": 2.0,
    "سس سزار": 1.0,
    "سس خردل عسلی": 0.5,
    "ماریناد مرغ": 1.0,
    "خمیر پیتزا دست‌ساز": 5.0,
    "سس فلفل تند": 0.5,
    "سوپ خامه‌ای قارچ": 1.5,
    "شربت پایه": 2.0,
}

for sf_name, stock in initial_stock.items():
    sf = sf_objects.get(sf_name)
    if sf:
        sf.current_stock = Decimal(str(stock))
        sf.save(update_fields=['current_stock'])
        print(f"   ✓ {sf_name}: {stock} {sf.get_unit_display()}")

# ── تست ۵: تخفیف‌های فعال ──
print("\n  [تست ۵] تخفیف‌های فعال:")
for d in KitchenDiscount.objects.filter(is_active=True):
    val = f"{d.value}%" if d.discount_type == "percentage" else f"{d.value:,}ت"
    print(f"    {d.name} → {d.kitchen_product.name} ({val})")

# ── تست ۶: سفارشات شامل نوشیدنی ──
print("\n  [تست ۶] سفارشات شامل نوشیدنی:")
for order in Order.objects.all().order_by("-created_at"):
    items = OrderItem.objects.filter(order=order)
    drink_items = [i for i in items if i.food and i.food.name in drink_names_set]
    if drink_items:
        summary = ", ".join(f"{i.food.name}×{i.quantity}" for i in drink_items)
        print(f"    #{order.id} ({order.customer_name}): {summary}")

# ── تست ۷: هزینه تولید ──
print("\n  [تست ۷] هزینه تولید نوشیدنی‌ها:")
for kp in KitchenProduct.objects.filter(category="drink").order_by("selling_price"):
    mx, lim = calculate_max_production(kp)
    cost = kp.calculate_cost()
    profit = int(kp.selling_price) - cost
    print(f"    {kp.name}: هزینه={cost:,} | فروش={kp.selling_price:,} | سود={profit:,} | max={mx}")

# ── تست ۸: جریان صندوق (شبیه‌سازی) ──
print("\n  [تست ۸] شبیه‌سازی سفارش صندوق:")
test_food = Food.objects.filter(category__name="پیتزا").first()
test_drink_rm = ReadyMaterial.objects.filter(category=drinks_cat).first()

if test_food and test_drink_rm:
    kp_test = None
    if hasattr(test_food, 'recipe') and test_food.recipe:
        kp_test = test_food.recipe.kitchen_products.first()

    print(f"    غذا: {test_food.name} — قیمت: {test_food.final_price:,}")
    if kp_test:
        inv_test = kp_test.get_inventory()
        print(f"    موجودی آشپزخانه: {inv_test.quantity}")

    print(f"    نوشیدنی آماده: {test_drink_rm.name} — قیمت: {test_drink_rm.selling_price:,}")
    print(f"    موجودی: {int(test_drink_rm.quantity)}")

    # شبیه‌سازی ثبت سفارش
    test_order = Order.objects.create(
        customer_name="تست صندوق", phone="09000000000",
        status="pending", total_price=0,
    )
    test_total = 0

    # آیتم غذا
    OrderItem.objects.create(
        order=test_order, food=test_food,
        quantity=1, price=test_food.final_price,
    )
    test_total += int(test_food.final_price)

    # آیتم نوشیدنی آماده
    test_drink_rm.quantity -= 1
    test_drink_rm.save(update_fields=["quantity"])
    OrderItem.objects.create(
        order=test_order, food=None,
        quantity=1, price=int(test_drink_rm.selling_price),
    )
    test_total += int(test_drink_rm.selling_price)

    test_order.total_price = test_total
    test_order.save()

    print(f"    ✓ سفارش #{test_order.id} ثبت شد — {test_total:,} تومان")
    print(f"    آیتم‌ها:")
    for oi in test_order.items.all():
        name = oi.food.name if oi.food else "کالای آماده"
        print(f"      • {name} × {oi.quantity} = {int(oi.price) * oi.quantity:,}")

    # cleanup
    test_order.delete()
    test_drink_rm.quantity += 1
    test_drink_rm.save(update_fields=["quantity"])
    print(f"    ✓ سفارش تست حذف شد")

# ═══════════════════════════════════════
#  خلاصه نهایی
# ═══════════════════════════════════════
print("\n" + "=" * 60)
print("  خلاصه نهایی:")
print("=" * 60)
print(f"   مواد اولیه:         {RawMaterial.objects.count()} قلم")
print(f"   مواد آماده:         {ReadyMaterial.objects.count()} قلم")
print(f"   دسته‌بندی:          {Category.objects.count()} عدد")
print(f"   غذا:                {Food.objects.count()} عدد")
print(f"     └─ نوشیدنی:       {Food.objects.filter(category__name='نوشیدنی').count()}")
print(f"   نیمه‌آماده:         {SemiFinished.objects.count()} عدد")
print(f"     └─ مواد:          {SemiFinishedIngredient.objects.count()} قلم")
print(f"   دستور پخت:          {Recipe.objects.count()} عدد")
print(f"     └─ مواد خام:       {RecipeIngredient.objects.count()} قلم")
print(f"     └─ نیمه‌آماده:     {RecipeSemiFinished.objects.count()} قلم")
print(f"   محصول آشپزخانه:     {KitchenProduct.objects.count()} عدد")
print(f"     └─ نوشیدنی:       {KitchenProduct.objects.filter(category='drink').count()}")
print(f"   فاکتور خرید:        {PurchaseInvoice.objects.count()} عدد")
print(f"     └─ اقلام:          {PurchaseInvoiceItem.objects.count()} قلم")
print(f"   سفارش:              {Order.objects.count()} عدد")
print(f"     └─ آیتم:           {OrderItem.objects.count()} قلم")
print(f"   تخفیف فعال:         {KitchenDiscount.objects.filter(is_active=True).count()} عدد")

# ── نوشیدنی‌ها ──
print("\n   ── نوشیدنی‌های آشپزخانه ──")
for kp in KitchenProduct.objects.filter(category="drink").order_by("selling_price"):
    inv = kp.get_inventory()
    disc = KitchenDiscount.objects.filter(kitchen_product=kp, is_active=True).first()
    disc_text = f" 🔥{disc.name}" if disc else ""
    print(f"   • {kp.name}: {kp.selling_price:,}ت — موجودی: {inv.quantity}{disc_text}")

# ── سفارشات ──
print("\n   ── سفارشات ──")
icons = {"pending": "⏳", "preparing": "🔥", "ready": "✅", "delivered": "📦"}
for o in Order.objects.all().order_by("-created_at"):
    cnt = o.items.count()
    print(f"   • {icons[o.status]} {o.customer_name} — {o.total_price:,}ت ({cnt} آیتم)")

print("\n" + "=" * 60)
print("  ✓ تمام شد!")
print()
print("  مراحل بعدی:")
print("  ۱. اصلاحات models.py → makemigrations → migrate")
print("  ۲. اصلاحات serializers.py")
print("  ۳. اصلاحات views.py")
print("  ۴. اجرای seed_data.py")
print("  ۵. تست: http://127.0.0.1:8000/pos/")
print("  ۶. تست: http://127.0.0.1:8000/kitchen/")
print("=" * 60)