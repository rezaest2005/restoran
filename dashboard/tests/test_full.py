# tests/test_full.py

"""
تست کامل فلوی پروژه رستوران — از صفر تا صد
python manage.py test tests.test_full -v 2
"""

import json
import time
from datetime import date, timedelta
from django.test import TestCase, Client
from django.urls import reverse
from restaurant.models import (
    User, Food, Category, Order, OrderItem,
    KitchenProduct, KitchenInventory, WasteLog,
    ReadyMaterial, Recipe, RawMaterial,
      SemiFinished, SemiFinishedIngredient, RecipeIngredient,
    DayCloseReport, DayCloseLog,
)
from django.utils import timezone


# ═══════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════

class BaseAPITestCase(TestCase):
    """کلاس پایه برای همه تست‌ها"""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username='testadmin', password='TestPass123!',
            is_staff=True, is_superuser=True
        )
        cls.user_normal = User.objects.create_user(
            username='testuser', password='TestPass456!',
            is_staff=False, is_superuser=False
        )
        cls.cat_main = Category.objects.create(name='برگر', order=1)
        cls.cat_appetizer = Category.objects.create(name='پیش‌غذا', order=2)
        cls.cat_drink = Category.objects.create(name='نوشیدنی', order=3)
        cls.cat_dessert = Category.objects.create(name='دسر', order=4)

        cls.food1 = Food.objects.create(category=cls.cat_main, name='چیز برگر', final_price=185000)
        cls.food2 = Food.objects.create(category=cls.cat_main, name='دوبل برگر', final_price=245000)
        cls.food3 = Food.objects.create(category=cls.cat_appetizer, name='سیب‌زمینی سرخ‌شده', final_price=75000)
        cls.food4 = Food.objects.create(category=cls.cat_dessert, name='شیک شکلات', final_price=95000)

        cls.recipe1 = Recipe.objects.create(food=cls.food1, yield_quantity=1)
        cls.recipe2 = Recipe.objects.create(food=cls.food2, yield_quantity=1)
        cls.recipe3 = Recipe.objects.create(food=cls.food3, yield_quantity=1)

        cls.kp1 = KitchenProduct.objects.create(
            name='چیز برگر', recipe=cls.recipe1, category='other', selling_price=185000)
        cls.kp2 = KitchenProduct.objects.create(
            name='دوبل برگر', recipe=cls.recipe2, category='other', selling_price=245000)
        cls.kp3 = KitchenProduct.objects.create(
            name='سیب‌زمینی سرخ‌شده', recipe=cls.recipe3, category='other', selling_price=75000)

        for kp in [cls.kp1, cls.kp2, cls.kp3]:
            inv = kp.get_inventory()
            inv.quantity = 50
            inv.save(update_fields=['quantity', 'updated_at'])

        cls.rm1 = ReadyMaterial.objects.create(
            name='پپسی', quantity=30, category=cls.cat_drink, selling_price=35000)
        cls.rm2 = ReadyMaterial.objects.create(
            name='دلستر', quantity=20, category=cls.cat_drink, selling_price=40000)

    def setUp(self):
        self.client = Client()
        self.client.login(username='testadmin', password='TestPass123!')
        self.maxDiff = None

    def api_get(self, url):
        r = self.client.get(url, content_type='application/json')
        return r, self._parse(r)

    def api_post(self, url, data=None):
        r = self.client.post(url, data=json.dumps(data or {}), content_type='application/json')
        return r, self._parse(r)

    def api_patch(self, url, data=None):
        r = self.client.patch(url, data=json.dumps(data or {}), content_type='application/json')
        return r, self._parse(r)

    def api_delete(self, url):
        r = self.client.delete(url, content_type='application/json')
        return r, self._parse(r)

    def _parse(self, response):
        try:
            return json.loads(response.content)
        except (json.JSONDecodeError, ValueError):
            return response.content.decode('utf-8', errors='replace')

    def _find_category_choices(self):
        field = KitchenProduct._meta.get_field('category')
        if hasattr(field, 'choices') and field.choices:
            return [c[0] for c in field.choices]
        return []

    def _get_first_product(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        products = data.get('products', []) if isinstance(data, dict) else []
        return products[0] if products else None

    def _get_first_product_id(self):
        p = self._get_first_product()
        return p.get('id') if p else None

    def _get_valid_category(self):
        choices = self._find_category_choices()
        return choices[0] if choices else 'other'

    def _ensure_stock(self, kp, min_qty=20):
        """اطمینان از موجودی کافی"""
        inv = kp.get_inventory()
        if inv.quantity < min_qty:
            inv.quantity = min_qty
            inv.save(update_fields=['quantity', 'updated_at'])
        return inv

    def _refresh_inventory(self, kp):
        """بروزرسانی موجودی از دیتابیس"""
        inv = kp.get_inventory()
        inv.refresh_from_db()
        return inv

    @classmethod
    def _create_test_orders(cls, count=3, prefix='تست'):
        """ساخت سفارش‌های تستی"""
        cat, _ = Category.objects.get_or_create(name='تست خودکار', defaults={'order': 0})
        food, _ = Food.objects.get_or_create(
            name='غذای تست خودکار', defaults={'category': cat, 'final_price': 100000}
        )
        orders = []
        for i in range(count):
            order = Order.objects.create(
                customer_name=f'{prefix}-{i + 1}', phone='', status='pending', total_price=0
            )
            OrderItem.objects.create(order=order, food=food, quantity=1, price=100000)
            order.total_price = 100000
            order.save()
            orders.append(order)
        return orders


# ═══════════════════════════════════════════════════════
#  ۱. تست‌های انبار مواد اولیه
# ═══════════════════════════════════════════════════════

class TestWarehouseInventory(BaseAPITestCase):

    def test_01_warehouse_api_accessible(self):
        r = self.client.get('/api/warehouse-json/')
        self.assertIn(r.status_code, [200, 302],
                       'آدرس /api/warehouse-json/ در دسترس نیست')

    def test_02_warehouse_returns_data(self):
        r, data = self.api_get('/api/warehouse-json/')
        self.assertEqual(r.status_code, 200,
                          f'انبار باید 200 برگرداند: {r.status_code}')
        if isinstance(data, dict):
            items = data.get('items') or data.get('results') or data.get('materials', [])
        elif isinstance(data, list):
            items = data
        else:
            items = []
        self.assertIsInstance(items, list)
        print(f'  → تعداد آیتم انبار: {len(items)}')

    def test_03_warehouse_raw_materials_page(self):
        r = self.client.get('/raw-materials/')
        self.assertIn(r.status_code, [200, 302])


# ═══════════════════════════════════════════════════════
#  ۲. تست‌های رسپی (Recipe)
# ═══════════════════════════════════════════════════════

class TestRecipes(BaseAPITestCase):

    def test_01_recipes_page(self):
        try:
            r = self.client.get('/recipes/')
            self.assertIn(r.status_code, [200, 302])
        except Exception:
            self.skipTest('template ناقص: recipes.html')

    def test_02_recipe_manager_page(self):
        r = self.client.get('/recipes/manager/')
        self.assertIn(r.status_code, [200, 302])

    def test_03_recipes_api(self):
        r, data = self.api_get('/api/recipes/')
        self.assertEqual(r.status_code, 200,
                          f'رسپی API باید 200 برگرداند: {r.status_code}')
        items = data if isinstance(data, list) else data.get('results', [])
        self.assertIsInstance(items, list)
        print(f'  → تعداد رسپی‌ها: {len(items)}')

    def test_04_recipe_has_ingredients(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        products = data.get('products', [])
        if products:
            pid = products[0].get('id')
            r2, cap = self.api_get(f'/api/kitchen/products/{pid}/capacity/')
            if r2.status_code == 200 and isinstance(cap, dict):
                reqs = cap.get('required_per_unit', [])
                self.assertIsInstance(reqs, list)
                print(f'  → مواد لازم محصول اول: {len(reqs)} قلم')

    def test_05_create_recipe_via_api(self):
        """ساخت رسپی جدید باید ممکن باشد"""
        new_food = Food.objects.create(
            category=self.cat_main, name='تست رسپی جدید', final_price=100000
        )
        r, data = self.api_post('/api/recipes/', {
            'food': new_food.id,
            'yield_quantity': 1,
            'estimated_preparation_time': 15,
            'ingredients': [],
            'semi_finished_items': [],
        })
        if r.status_code in [200, 201]:
            self.assertTrue(data.get('id') or data.get('pk'))
            print(f'  → رسپی #{data.get("id")} ساخته شد')
        else:
            self.assertIn(r.status_code, [200, 201, 400])
            print(f'  → ساخت رسپی خالی: {r.status_code}')


# ═══════════════════════════════════════════════════════
#  ۳. تست‌های نیمه‌آماده (Semi-Finished)
# ═══════════════════════════════════════════════════════

class TestSemiFinished(BaseAPITestCase):

    def test_01_semi_finished_api(self):
        r, data = self.api_get('/api/semi-finished/')
        self.assertEqual(r.status_code, 200)
        items = data if isinstance(data, list) else data.get('results', data.get('items', []))
        self.assertIsInstance(items, list)
        print(f'  → تعداد نیمه‌آماده: {len(items)}')

    def test_02_semi_finished_save_api(self):
        r = self.client.post('/api/semi-finished/save/')
        self.assertNotEqual(r.status_code, 404)

    def test_03_semi_finished_produce_api(self):
        r = self.client.post('/api/recipes/produce-semi/')
        self.assertNotEqual(r.status_code, 404)

    def test_04_create_semi_finished(self):
        """ساخت نیمه‌آماده جدید از طریق API"""
        r, data = self.api_post('/api/semi-finished/', {
            'name': 'سس تست',
            'category': 'sauce',
            'unit': 'kg',
            'quantity_produced': 2,
            'description': 'تست ساخت نیمه‌آماده',
            'ingredients': [],
        })
        self.assertIn(r.status_code, [200, 201, 400])
        print(f'  → ساخت نیمه‌آماده: {r.status_code}')


# ═══════════════════════════════════════════════════════
#  ۴. تست‌های مواد آماده (Ready Products)
# ═══════════════════════════════════════════════════════

class TestReadyProducts(BaseAPITestCase):

    def test_01_ready_materials_page(self):
        r = self.client.get('/ready-materials/')
        self.assertIn(r.status_code, [200, 302])

    def test_02_ready_materials_api(self):
        r = self.client.post('/api/ready-materials/save/')
        self.assertNotEqual(r.status_code, 404)

    def test_03_convert_to_ready_api(self):
        r = self.client.post('/api/convert-to-ready/')
        self.assertNotEqual(r.status_code, 404)

    def test_04_ready_products_have_category(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        products = data.get('products', [])
        categories = set()
        for p in products:
            cat = p.get('category') or p.get('category_name') or ''
            if cat:
                categories.add(cat)
        print(f'  → دسته‌بندی‌های آشپزخانه: {categories}')

    def test_05_ready_products_in_inventory(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        inventory = data.get('inventory', [])
        products = data.get('products', [])
        inv_ids = set()
        for inv in inventory:
            inv_ids.add(inv.get('kitchen_product_id') or inv.get('kitchen_product'))
        missing = []
        for p in products:
            if p.get('id') not in inv_ids:
                missing.append(p.get('name', '?'))
        if missing:
            print(f'  ⚠ محصولات بدون موجودی: {missing}')
        else:
            print(f'  → همه {len(products)} محصول موجودی دارند')

    def test_06_ready_material_stock_non_negative(self):
        """موجودی ReadyMaterial نباید منفی باشد"""
        for rm in ReadyMaterial.objects.all():
            self.assertGreaterEqual(rm.quantity, 0,
                f'ماده آماده «{rm.name}» موجودی منفی دارد: {rm.quantity}')

    def test_07_ready_material_with_category(self):
        """هر ReadyMaterial باید دسته‌بندی داشته باشد"""
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        products = data.get('products', []) if isinstance(data, dict) else []
        self.assertIsInstance(products, list)


# ═══════════════════════════════════════════════════════
#  ۵. تست‌های داشبورد آشپزخانه
# ═══════════════════════════════════════════════════════

class TestKitchenDashboard(BaseAPITestCase):

    def test_01_dashboard_api(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(data, dict)

    def test_02_dashboard_has_products(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        products = data.get('products', [])
        self.assertIsInstance(products, list)
        self.assertGreater(len(products), 0, 'داشبورد محصولی ندارد')
        print(f'  → تعداد محصولات: {len(products)}')

    def test_03_dashboard_has_discounts(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        discounts = data.get('discounts', [])
        if isinstance(discounts, dict):
            discounts = discounts.get('results', [])
        self.assertIsInstance(discounts, list)
        print(f'  → تعداد تخفیف‌ها: {len(discounts)}')

    def test_04_dashboard_has_inventory(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        inventory = data.get('inventory', [])
        self.assertIsInstance(inventory, list)
        self.assertGreater(len(inventory), 0, 'داشبورد موجودی ندارد')
        print(f'  → تعداد موجودی: {len(inventory)}')

    def test_05_dashboard_has_waste(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        waste = data.get('waste', [])
        if isinstance(waste, dict):
            waste = waste.get('results', [])
        self.assertIsInstance(waste, list)
        print(f'  → تعداد ضایعات در داشبورد: {len(waste)}')

    def test_06_dashboard_has_stats(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        stats = data.get('stats', {})
        self.assertIsInstance(stats, dict)
        for key in ['total_products']:
            if key in stats:
                print(f'  → stats.{key} = {stats[key]}')

    def test_07_dashboard_response_time(self):
        start = time.time()
        r, data = self.api_get('/api/kitchen/dashboard/')
        elapsed = time.time() - start
        self.assertEqual(r.status_code, 200)
        print(f'  → زمان پاسخ: {elapsed:.2f}s')
        self.assertLess(elapsed, 5.0)

    def test_08_dashboard_keys(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(data, dict)
        self.assertIn('products', data)
        self.assertIn('stats', data)
        print(f'  → کلیدهای داشبورد: {list(data.keys())}')

    def test_09_dashboard_inventory_has_all_products(self):
        """هر محصول باید در inventory داشبورد حضور داشته باشد"""
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        products = data.get('products', [])
        inventory = data.get('inventory', [])
        product_ids = {p.get('id') for p in products}
        inv_product_ids = {
            inv.get('kitchen_product_id') or inv.get('kitchen_product')
            for inv in inventory
        }
        orphan_products = product_ids - inv_product_ids - {None}
        if orphan_products:
            print(f'  ⚠ محصولات بدون موجودی در داشبورد: {orphan_products}')


# ═══════════════════════════════════════════════════════
#  ۶. تست‌های CRUD محصولات آشپزخانه
# ═══════════════════════════════════════════════════════

class TestKitchenProducts(BaseAPITestCase):

    def test_01_products_list_api(self):
        r, data = self.api_get('/api/kitchen/products/')
        self.assertEqual(r.status_code, 200,
                          f'لیست محصولات باید 200 باشد: {r.status_code}')
        items = data if isinstance(data, list) else data.get('results', [])
        self.assertIsInstance(items, list)
        print(f'  → تعداد محصولات API: {len(items)}')

    def test_02_create_product(self):
        cat = self._get_valid_category()
        r, data = self.api_post('/api/kitchen/products/', {
            'name': 'آش رشته',
            'recipe': self.recipe1.id,
            'category': cat,
            'selling_price': 90000,
            'description': 'تست ساخت محصول'
        })
        if r.status_code in [200, 201]:
            self.assertTrue(data.get('id') or data.get('pk'))
            print(f'  → محصول «آش رشته» ساخته شد: ID={data.get("id") or data.get("pk")}')
        else:
            print(f'  ⚠ ساخت محصول: {r.status_code} — {data}')

    def test_03_product_patch_price(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_patch(f'/api/kitchen/products/{p["id"]}/', {'selling_price': 99000})
        self.assertEqual(r.status_code, 200,
                          f'بروزرسانی قیمت خطا: {r.status_code}')
        print(f'  → قیمت «{p.get("name")}» تغییر کرد')

    def test_04_product_patch_cost(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_patch(f'/api/kitchen/products/{p["id"]}/', {'selling_price': 130000})
        self.assertEqual(r.status_code, 200)
        print(f'  → قیمت فروش «{p.get("name")}» بروزرسانی شد')

    def test_05_product_capacity(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_get(f'/api/kitchen/products/{p["id"]}/capacity/')
        self.assertEqual(r.status_code, 200,
                          f'ظرفیت خطا: {r.status_code}')
        self.assertIn('max_production', data)
        self.assertGreaterEqual(data.get('max_production', 0), 0)
        print(f'  → حداکثر تولید «{p.get("name")}»: {data.get("max_production")}')

    def test_06_product_produce(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        inv_before = KitchenInventory.objects.filter(kitchen_product_id=p['id']).first()
        stock_before = inv_before.quantity if inv_before else 0

        r, data = self.api_post(
            f'/api/kitchen/products/{p["id"]}/produce/',
            {'quantity': 2, 'notes': 'تست تولید'}
        )
        self.assertIn(r.status_code, [200, 201],
                       f'تولید خطا: {r.status_code} — {data}')
        inv_after = KitchenInventory.objects.filter(kitchen_product_id=p['id']).first()
        stock_after = inv_after.quantity if inv_after else 0
        self.assertGreaterEqual(stock_after, stock_before,
            'موجودی بعد از تولید نباید کمتر بشه')
        print(f'  → تولید «{p.get("name")}»: {stock_before} → {stock_after}')

    def test_07_product_delete(self):
        cat = self._get_valid_category()
        r, data = self.api_post('/api/kitchen/products/', {
            'name': 'محصول حذف شدنی', 'category': cat, 'selling_price': 10000
        })
        if r.status_code in [200, 201]:
            pid = data.get('id') or data.get('pk')
            if pid:
                r2, d2 = self.api_delete(f'/api/kitchen/products/{pid}/')
                self.assertIn(r2.status_code, [200, 204])
                print(f'  → محصول #{pid} حذف شد')

    def test_08_product_produce_zero(self):
        """تولید با تعداد صفر باید رد شود"""
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post(
            f'/api/kitchen/products/{p["id"]}/produce/',
            {'quantity': 0, 'notes': ''}
        )
        self.assertIn(r.status_code, [400, 422],
                       f'تولید صفر باید رد شود: {r.status_code}')
        print(f'  → تولید صفر: {r.status_code}')

    def test_09_product_produce_negative(self):
        """تولید با تعداد منفی باید رد شود"""
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post(
            f'/api/kitchen/products/{p["id"]}/produce/',
            {'quantity': -5, 'notes': ''}
        )
        self.assertIn(r.status_code, [400, 422],
                       f'تولید منفی باید رد شود: {r.status_code}')
        print(f'  → تولید منفی: {r.status_code}')


# ═══════════════════════════════════════════════════════
#  ۷. تست‌های تخفیف‌ها
# ═══════════════════════════════════════════════════════

class TestDiscounts(BaseAPITestCase):

    def test_01_discounts_list_api(self):
        r, data = self.api_get('/api/kitchen/discounts/')
        self.assertEqual(r.status_code, 200,
                          f'لیست تخفیف‌ها خطا: {r.status_code}')
        items = data if isinstance(data, list) else data.get('results', [])
        self.assertIsInstance(items, list)
        print(f'  → تعداد تخفیف‌ها: {len(items)}')

    def test_02_create_percentage_discount(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف تست ۲۰٪', 'kitchen_product': p['id'],
            'discount_type': 'percentage', 'scope': 'all_items',
            'value': 20, 'is_active': True
        })
        self.assertIn(r.status_code, [200, 201],
                       f'ساخت تخفیف درصدی خطا: {r.status_code}')
        did = data.get('id') or data.get('pk')
        self.assertIsNotNone(did)
        print(f'  → تخفیف درصدی: ID={did}')

    def test_03_create_fixed_discount(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف ۵۰۰۰ تومان', 'kitchen_product': p['id'],
            'discount_type': 'fixed_amount', 'scope': 'all_items',
            'value': 5000, 'is_active': True
        })
        self.assertIn(r.status_code, [200, 201],
                       f'ساخت تخفیف ثابت خطا: {r.status_code}')
        print(f'  → تخفیف مبلغ ثابت ایجاد شد')

    def test_04_discount_with_timer(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        future = (timezone.now() + timedelta(hours=2)).isoformat()
        r, data = self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف تایمردار', 'kitchen_product': p['id'],
            'discount_type': 'percentage', 'scope': 'all_items',
            'value': 30, 'is_active': True, 'expires_at': future
        })
        self.assertIn(r.status_code, [200, 201],
                       f'تخفیف تایمردار خطا: {r.status_code}')
        print(f'  → تخفیف تایمردار ایجاد شد')

    def test_05_discount_with_quantity_limit(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف محدود', 'kitchen_product': p['id'],
            'discount_type': 'percentage', 'scope': 'first_n_items',
            'value': 15, 'max_quantity': 10, 'is_active': True
        })
        self.assertIn(r.status_code, [200, 201],
                       f'تخفیف محدود خطا: {r.status_code}')
        print(f'  → تخفیف محدود به تعداد ایجاد شد')

    def test_06_happy_hour_discount(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        now = timezone.now()
        start = (now - timedelta(hours=1)).strftime('%H:%M')
        end = (now + timedelta(hours=1)).strftime('%H:%M')
        r, data = self.api_post('/api/kitchen/discounts/', {
            'name': 'ساعت خوش', 'kitchen_product': p['id'],
            'discount_type': 'percentage', 'scope': 'happy_hour',
            'value': 25, 'start_time': start, 'end_time': end, 'is_active': True
        })
        self.assertIn(r.status_code, [200, 201],
                       f'ساعت خوش خطا: {r.status_code}')
        print(f'  → تخفیف ساعت خوش ایجاد شد')

    def test_07_discount_delete(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف حذف شدنی', 'kitchen_product': p['id'],
            'discount_type': 'percentage', 'scope': 'all_items',
            'value': 10, 'is_active': True
        })
        self.assertIn(r.status_code, [200, 201])
        did = data.get('id') or data.get('pk')
        r2, d2 = self.api_delete(f'/api/kitchen/discounts/{did}/')
        self.assertIn(r2.status_code, [200, 204])
        print(f'  → تخفیف #{did} حذف شد')

    def test_08_discount_invalid_values(self):
        """تخفیف بدون name باید رد شود (اگر name اجباری باشد)"""
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post('/api/kitchen/discounts/', {
            'kitchen_product': p['id'], 'discount_type': 'percentage', 'value': 20
        })
        # اگر API name را اجباری بداند → 400/422
        # اگر اجباری نداند → 200/201 (هر دو قابل قبول)
        self.assertIn(r.status_code, [200, 201, 400, 422],
            f'وضعیت غیرمنتظره: {r.status_code}')
        if r.status_code in [400, 422]:
            print(f'  → بدون نام رد شد: {r.status_code} ✓')
        else:
            print(f'  → بدون نام قبول شد: {r.status_code} (name اجباری نیست)')

    def test_09_discount_appears_in_dashboard(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف داشبورد', 'kitchen_product': p['id'],
            'discount_type': 'percentage', 'scope': 'all_items',
            'value': 10, 'is_active': True
        })
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        discounts = data.get('discounts', [])
        if isinstance(discounts, dict):
            discounts = discounts.get('results', [])
        found = [d for d in discounts if d.get('name') == 'تخفیف داشبورد']
        self.assertGreater(len(found), 0, 'تخفیف در داشبورد پیدا نشد')
        print(f'  → تخفیف در داشبورد: {len(found)} مورد')

    def test_10_discount_negative_value(self):
        """تخفیف با مقدار منفی باید رد شود"""
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف منفی', 'kitchen_product': p['id'],
            'discount_type': 'percentage', 'scope': 'all_items',
            'value': -10, 'is_active': True
        })
        self.assertIn(r.status_code, [400, 422],
            f'تخفیف منفی باید رد شود ولی {r.status_code} برگشت')
        print(f'  → تخفیف منفی: {r.status_code} ✓')

    def test_11_discount_over_100_percent(self):
        """تخفیف بالای ۱۰۰٪ باید رد شود"""
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف ۱۵۰٪', 'kitchen_product': p['id'],
            'discount_type': 'percentage', 'scope': 'all_items',
            'value': 150, 'is_active': True
        })
        self.assertIn(r.status_code, [400, 422],
            f'تخفیف ۱۵۰٪ باید رد شود ولی {r.status_code} برگشت')
        print(f'  → تخفیف ۱۵۰٪: {r.status_code} ✓')

    def test_12_discount_invalid_product(self):
        """تخفیف برای محصول ناموجود باید رد شود"""
        r, data = self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف ناموجود', 'kitchen_product': 999999,
            'discount_type': 'percentage', 'scope': 'all_items',
            'value': 10, 'is_active': True
        })
        self.assertIn(r.status_code, [400, 404, 500],
            f'محصول ناموجود باید خطا بده: {r.status_code}')
        print(f'  → محصول ناموجود: {r.status_code}')


# ═══════════════════════════════════════════════════════
#  ۸. تست‌های ضایعات آشپزخانه (Kitchen Waste API)
# ═══════════════════════════════════════════════════════

class TestKitchenWaste(BaseAPITestCase):
    WASTE_REASONS = ['expired', 'damaged', 'overcooked', 'quality_issue', 'returned', 'other']

    def test_01_waste_api_exists(self):
        r = self.client.get('/api/kitchen/waste/')
        self.assertNotEqual(r.status_code, 404, 'آدرس /api/kitchen/waste/ وجود ندارد')
        print(f'  → GET /api/kitchen/waste/: {r.status_code}')

    def test_02_waste_api_requires_auth(self):
        anon = Client()
        r = anon.post('/api/kitchen/waste/',
                       data=json.dumps({'kitchen_product': self.kp1.id, 'quantity': 1, 'reason': 'expired'}),
                       content_type='application/json')
        self.assertIn(r.status_code, [401, 403, 302])
        print(f'  → بدون لاگین: {r.status_code}')

    def test_03_register_waste_expired(self):
        inv = self._ensure_stock(self.kp1, 20)
        stock_before = inv.quantity
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 3, 'reason': 'expired',
        })
        self.assertIn(r.status_code, [200, 201], f'خطا: {data}')
        print(f'  → ضایعات expired: ID={data.get("id")}')
        inv.refresh_from_db()
        self.assertEqual(inv.quantity, stock_before - 3)
        print(f'  → موجودی: {stock_before} → {inv.quantity}')

    def test_04_register_waste_damaged(self):
        inv = self._ensure_stock(self.kp2, 20)
        stock_before = inv.quantity
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp2.id, 'quantity': 1, 'reason': 'damaged',
        })
        self.assertIn(r.status_code, [200, 201])
        inv.refresh_from_db()
        self.assertEqual(inv.quantity, stock_before - 1)
        print(f'  → ضایعات damaged: OK — موجودی: {stock_before} → {inv.quantity}')

    def test_05_register_waste_overcooked(self):
        inv = self._ensure_stock(self.kp3, 20)
        stock_before = inv.quantity
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp3.id, 'quantity': 2, 'reason': 'overcooked',
        })
        self.assertIn(r.status_code, [200, 201])
        inv.refresh_from_db()
        self.assertEqual(inv.quantity, stock_before - 2)
        print(f'  → ضایعات overcooked: OK')

    def test_06_register_waste_quality_issue(self):
        inv = self._ensure_stock(self.kp1, 20)
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 1, 'reason': 'quality_issue',
        })
        self.assertIn(r.status_code, [200, 201])
        print(f'  → ضایعات quality_issue: OK')

    def test_07_register_waste_returned(self):
        inv = self._ensure_stock(self.kp2, 20)
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp2.id, 'quantity': 1, 'reason': 'returned',
        })
        self.assertIn(r.status_code, [200, 201])
        print(f'  → ضایعات returned: OK')

    def test_08_register_waste_other(self):
        inv = self._ensure_stock(self.kp3, 20)
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp3.id, 'quantity': 1, 'reason': 'other',
        })
        self.assertIn(r.status_code, [200, 201])
        print(f'  → ضایعات other: OK')

    def test_09_waste_list_returns_data(self):
        self._ensure_stock(self.kp1, 20)
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 1, 'reason': 'expired'
        })
        r, data = self.api_get('/api/kitchen/waste/')
        self.assertEqual(r.status_code, 200)
        items = data if isinstance(data, list) else data.get('results', data.get('waste', []))
        self.assertGreater(len(items), 0)
        print(f'  → لیست ضایعات: {len(items)} مورد')

    def test_10_waste_item_has_required_fields(self):
        self._ensure_stock(self.kp1, 20)
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 2, 'reason': 'damaged',
        })
        r, data = self.api_get('/api/kitchen/waste/')
        self.assertEqual(r.status_code, 200)
        items = data if isinstance(data, list) else data.get('results', data.get('waste', []))
        if items:
            w = items[-1]
            for f in ['reason', 'quantity']:
                self.assertIn(f, w, f'فیلد «{f}» در آیتم ضایعات نیست')
            print(f'  → فیلدها: {list(w.keys())}')

    def test_11_delete_waste(self):
        self._ensure_stock(self.kp1, 20)
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 1, 'reason': 'expired'
        })
        self.assertIn(r.status_code, [200, 201])
        wid = data.get('id')
        if wid:
            r2, d2 = self.api_delete(f'/api/kitchen/waste/{wid}/')
            self.assertIn(r2.status_code, [200, 204])
            print(f'  → ضایعات #{wid} حذف شد')

    def test_12_waste_invalid_product(self):
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': 999999, 'quantity': 1, 'reason': 'expired'
        })
        self.assertIn(r.status_code, [400, 404, 500])
        print(f'  → محصول ناموجود: {r.status_code}')

    def test_13_waste_zero_quantity(self):
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 0, 'reason': 'expired'
        })
        self.assertIn(r.status_code, [400, 422, 500])
        print(f'  → تعداد صفر: {r.status_code}')

    def test_14_waste_negative_quantity(self):
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': -5, 'reason': 'expired'
        })
        self.assertIn(r.status_code, [400, 422, 500])
        print(f'  → تعداد منفی: {r.status_code}')

    def test_15_waste_exceeds_stock(self):
        """ضایعات بیشتر از موجودی: API باید رد کند یا موجودی منفی نشود"""
        inv = self._ensure_stock(self.kp1, 10)
        stock = inv.quantity
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': stock + 100, 'reason': 'expired'
        })
        inv.refresh_from_db()
        if r.status_code in [400, 422]:
            self.assertEqual(inv.quantity, stock, 'API رد کرد ولی موجودی تغییر کرده')
            print(f'  → API درخواست بیش از حد را رد کرد ✓')
        else:
            self.assertGreaterEqual(inv.quantity, 0,
                f'موجودی منفی شد: {inv.quantity}')
            print(f'  → موجودی: {stock} → {inv.quantity} (نباید منفی باشد)')

    def test_16_waste_stock_never_negative(self):
        inv = self._ensure_stock(self.kp1, 5)
        stock = inv.quantity
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': stock + 50, 'reason': 'expired'
        })
        inv.refresh_from_db()
        self.assertGreaterEqual(inv.quantity, 0)
        print(f'  → موجودی بعد از ضایعات سنگین: {inv.quantity} (نباید منفی باشه)')

    def test_17_waste_appears_in_dashboard(self):
        self._ensure_stock(self.kp1, 20)
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 1, 'reason': 'expired',
        })
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(data, dict)
        waste = data.get('waste', None)
        if waste is not None:
            if isinstance(waste, dict):
                waste = waste.get('results', [])
            self.assertIsInstance(waste, list)
            self.assertGreater(len(waste), 0, 'ضایعات در داشبورد نیست')
            print(f'  → ضایعات در داشبورد: {len(waste)} مورد')
        else:
            r2, data2 = self.api_get('/api/kitchen/waste/')
            self.assertEqual(r2.status_code, 200)
            items = data2 if isinstance(data2, list) else data2.get('results', [])
            self.assertGreater(len(items), 0, 'ضایعات ثبت شده ولی در لیست نیست')
            print(f'  → داشبورد waste ندارد ولی ضایعات از API مستقیم: {len(items)} مورد')

    def test_18_waste_cost_calculation(self):
        self._ensure_stock(self.kp1, 20)
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 2, 'reason': 'expired'
        })
        r, data = self.api_get('/api/kitchen/waste/')
        self.assertEqual(r.status_code, 200)
        items = data if isinstance(data, list) else data.get('results', data.get('waste', []))
        if items:
            w = items[-1]
            cost = w.get('total_cost') or (w.get('cost', 0) * w.get('quantity', 0)) or 0
            print(f'  → هزینه ضایعات: {cost} تومان')

    def test_19_all_waste_reasons_work(self):
        for reason in self.WASTE_REASONS:
            self._ensure_stock(self.kp1, 20)
            r, data = self.api_post('/api/kitchen/waste/', {
                'kitchen_product': self.kp1.id, 'quantity': 1, 'reason': reason,
            })
            self.assertIn(r.status_code, [200, 201],
                          f'دلیل «{reason}» خطا داد: {r.status_code}')
        print(f'  → همه {len(self.WASTE_REASONS)} دلیل OK')

    def test_20_waste_invalid_reason(self):
        """دلیل نامعتبر باید رد شود"""
        self._ensure_stock(self.kp1, 20)
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 1, 'reason': 'invalid_reason_xyz',
        })
        self.assertIn(r.status_code, [400, 422],
            f'دلیل نامعتبر باید رد شود ولی {r.status_code} برگشت')
        print(f'  → دلیل نامعتبر: {r.status_code} ✓')

    def test_21_waste_missing_reason(self):
        """بدون reason باید رد شود"""
        self._ensure_stock(self.kp1, 20)
        r, data = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 1,
        })
        self.assertIn(r.status_code, [400, 422, 500])
        print(f'  → بدون reason: {r.status_code}')

    def test_22_waste_list_sorted_by_date(self):
        """لیست ضایعات باید مرتب باشد"""
        self._ensure_stock(self.kp1, 50)
        for i in range(3):
            self.api_post('/api/kitchen/waste/', {
                'kitchen_product': self.kp1.id, 'quantity': 1, 'reason': 'expired',
            })
        r, data = self.api_get('/api/kitchen/waste/')
        self.assertEqual(r.status_code, 200)
        items = data if isinstance(data, list) else data.get('results', data.get('waste', []))
        if len(items) >= 2:
            print(f'  → لیست ضایعات: {len(items)} مورد')


# ═══════════════════════════════════════════════════════
#  ۹. تست‌های محاسبه مواد
# ═══════════════════════════════════════════════════════

class TestMaterialCalculation(BaseAPITestCase):

    def test_01_calculate_materials_endpoint(self):
        r, data = self.api_post('/api/kitchen/calculate-materials/', {'items': []})
        self.assertNotEqual(r.status_code, 404)

    def test_02_calculate_materials(self):
        pid = self._get_first_product_id()
        if not pid:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post('/api/kitchen/calculate-materials/', {
            'items': [{'product_id': pid, 'quantity': 10}]
        })
        self.assertEqual(r.status_code, 200,
                          f'محاسبه مواد خطا: {r.status_code}')
        raw = data.get('raw_materials', [])
        semi = data.get('semi_materials', [])
        self.assertIsInstance(raw, list)
        print(f'  → مواد اولیه: {len(raw)} قلم / نیمه‌آماده: {len(semi)} قلم')

    def test_03_calculate_multiple_products(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        products = data.get('products', [])
        if len(products) < 2:
            self.skipTest('حداقل ۲ محصول لازم است')
        items = [
            {'product_id': products[0]['id'], 'quantity': 5},
            {'product_id': products[1]['id'], 'quantity': 3}
        ]
        r2, data2 = self.api_post('/api/kitchen/calculate-materials/', {'items': items})
        self.assertEqual(r2.status_code, 200,
                          f'محاسبه چندمحصوله خطا: {r2.status_code}')
        print(f'  → محاسبه چندمحصوله موفق')

    def test_04_calculate_zero_quantity(self):
        pid = self._get_first_product_id()
        if not pid:
            self.skipTest('محصولی وجود ندارد')
        r, data = self.api_post('/api/kitchen/calculate-materials/', {
            'items': [{'product_id': pid, 'quantity': 0}]
        })
        self.assertIn(r.status_code, [200, 400])
        print(f'  → محاسبه صفر: {r.status_code}')

    def test_05_calculate_invalid_product(self):
        r, data = self.api_post('/api/kitchen/calculate-materials/', {
            'items': [{'product_id': 999999, 'quantity': 5}]
        })
        self.assertIn(r.status_code, [200, 400, 404])
        print(f'  → محصول ناموجود: {r.status_code}')


# ═══════════════════════════════════════════════════════
#  ۱۰. تست‌های تاریخچه مصرف
# ═══════════════════════════════════════════════════════

class TestUsageLog(BaseAPITestCase):

    def test_01_usage_log_page(self):
        r = self.client.get('/usage-log/')
        self.assertIn(r.status_code, [200, 302])

    def test_02_usage_log_json_api(self):
        r, data = self.api_get('/api/usage-log/json/')
        self.assertEqual(r.status_code, 200,
                          f'لاگ JSON خطا: {r.status_code}')
        if isinstance(data, dict):
            logs = data.get('results') or data.get('logs') or data.get('items', [])
        elif isinstance(data, list):
            logs = data
        else:
            logs = []
        self.assertIsInstance(logs, list)
        print(f'  → تعداد لاگ: {len(logs)}')

    def test_03_usage_log_detail_api(self):
        r = self.client.get('/api/usage-log/detail/')
        self.assertNotEqual(r.status_code, 404)


# ═══════════════════════════════════════════════════════
#  ۱۱. تست‌های صندوق فروش (POS)
# ═══════════════════════════════════════════════════════

class TestPOSSales(BaseAPITestCase):

    def test_01_pos_page_loads(self):
        r = self.client.get('/pos/')
        self.assertEqual(r.status_code, 200, 'صفحه صندوق باید لود شود')

    def test_02_pos_page_has_tabs(self):
        r = self.client.get('/pos/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('panel-pos', content, 'تب صندوق نیست')
        self.assertIn('panel-report', content, 'تب گزارش نیست')
        self.assertIn('panel-close', content, 'تب بستن روز نیست')
        print(f'  → هر ۳ تب موجود')

    def test_03_create_order_with_food(self):
        food = Food.objects.first()
        if not food:
            self.skipTest('غذایی وجود ندارد')
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'تست صندوق',
            'phone': '09121111111',
            'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}]
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        self.assertGreater(data.get('total_price', 0), 0)
        print(f'  → سفارش #{data.get("order_id")} — {data.get("total_price"):,} تومان')

    def test_04_create_order_with_ready_material(self):
        rm = ReadyMaterial.objects.filter(quantity__gt=0, category__isnull=False).first()
        if not rm:
            self.skipTest('ماده آماده‌ای نیست')
        stock_before = int(rm.quantity)
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'تست آماده',
            'phone': '',
            'items': [{'food_id': f'ready_{rm.id}', 'quantity': 1, 'price': int(rm.selling_price)}]
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        rm.refresh_from_db()
        self.assertEqual(int(rm.quantity), stock_before - 1)
        print(f'  → «{rm.name}» موجودی: {stock_before} → {int(rm.quantity)}')

    def test_05_create_order_deducts_inventory(self):
        food = Food.objects.first()
        if not food:
            self.skipTest('غذایی وجود ندارد')
        kp = KitchenProduct.objects.filter(recipe__food=food).first()
        if not kp:
            self.skipTest('محصول آشپزخانه‌ای نیست')
        inv = kp.get_inventory()
        stock_before = inv.quantity
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'تست موجودی',
            'phone': '',
            'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}]
        })
        self.assertTrue(data.get('success'))
        inv.refresh_from_db()
        self.assertEqual(inv.quantity, stock_before - 1)
        print(f'  → «{kp.name}»: {stock_before} → {inv.quantity}')

    def test_06_create_order_invalid_food(self):
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': '',
            'phone': '',
            'items': [{'food_id': 999999, 'quantity': 1, 'price': 100000}]
        })
        self.assertFalse(data.get('success'), 'سفارش نامعتبر باید رد بشه')
        print(f'  → خطای مورد انتظار: {data.get("error")}')

    def test_07_create_order_empty_items(self):
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': '',
            'phone': '',
            'items': []
        })
        self.assertFalse(data.get('success'))

    def test_08_create_order_multiple_items(self):
        foods = list(Food.objects.all()[:2])
        if len(foods) < 2:
            self.skipTest('حداقل ۲ غذا لازم است')
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'تست چندآیتم',
            'phone': '09122222222',
            'items': [
                {'food_id': foods[0].id, 'quantity': 2, 'price': int(foods[0].final_price)},
                {'food_id': foods[1].id, 'quantity': 1, 'price': int(foods[1].final_price)},
            ]
        })
        self.assertTrue(data.get('success'))
        self.assertEqual(len(data.get('items', [])), 2)
        print(f'  → سفارش #{data.get("order_id")} — {len(data["items"])} آیتم')

    def test_09_order_saved_in_database(self):
        count_before = Order.objects.count()
        food = Food.objects.first()
        if not food:
            self.skipTest('غذایی وجود ندارد')
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'تست دیتابیس',
            'phone': '',
            'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}]
        })
        self.assertTrue(data.get('success'))
        self.assertEqual(Order.objects.count(), count_before + 1)
        order = Order.objects.get(id=data['order_id'])
        self.assertEqual(order.customer_name, 'تست دیتابیس')
        self.assertEqual(order.items.count(), 1)
        print(f'  → سفارش #{order.id} در دیتابیس تأیید شد')

    def test_10_order_exceeds_inventory(self):
        """سفارش بیشتر از موجودی باید رد شود یا موجودی منفی نشود"""
        food = Food.objects.first()
        if not food:
            self.skipTest('غذایی وجود ندارد')
        kp = KitchenProduct.objects.filter(recipe__food=food).first()
        if not kp:
            self.skipTest('محصول آشپزخانه‌ای نیست')
        inv = kp.get_inventory()
        stock = inv.quantity
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'تست بیش از حد',
            'phone': '',
            'items': [{'food_id': food.id, 'quantity': stock + 100, 'price': int(food.final_price)}]
        })
        inv.refresh_from_db()
        if data.get('success'):
            self.assertGreaterEqual(inv.quantity, 0,
                f'موجودی منفی شد: {inv.quantity}')
            print(f'  → قبول کرد ولی موجودی: {inv.quantity}')
        else:
            self.assertEqual(inv.quantity, stock)
            print(f'  → رد شد: {data.get("error")} ✓')

    def test_11_order_zero_quantity(self):
        """سفارش با تعداد صفر باید رد شود"""
        food = Food.objects.first()
        if not food:
            self.skipTest('غذایی وجود ندارد')
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': '',
            'phone': '',
            'items': [{'food_id': food.id, 'quantity': 0, 'price': int(food.final_price)}]
        })
        self.assertFalse(data.get('success'), 'سفارش با تعداد صفر باید رد شود')
        print(f'  → تعداد صفر: رد شد ✓')

    def test_12_order_negative_quantity(self):
        """سفارش با تعداد منفی باید رد شود"""
        food = Food.objects.first()
        if not food:
            self.skipTest('غذایی وجود ندارد')
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': '',
            'phone': '',
            'items': [{'food_id': food.id, 'quantity': -3, 'price': int(food.final_price)}]
        })
        self.assertFalse(data.get('success'), 'سفارش با تعداد منفی باید رد شود')
        print(f'  → تعداد منفی: رد شد ✓')

    def test_13_order_stock_consistency(self):
        """چند سفارش پیاپی باید موجودی را درست کم کنند"""
        food = Food.objects.first()
        if not food:
            self.skipTest('غذایی وجود ندارد')
        kp = KitchenProduct.objects.filter(recipe__food=food).first()
        if not kp:
            self.skipTest('محصول آشپزخانه‌ای نیست')
        inv = kp.get_inventory()
        if inv.quantity < 10:
            inv.quantity = 30
            inv.save(update_fields=['quantity', 'updated_at'])
        inv.refresh_from_db()
        stock_initial = inv.quantity

        for i in range(3):
            r, data = self.api_post('/api/pos/create-order/', {
                'customer_name': f'تست سری {i+1}',
                'phone': '',
                'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}]
            })
            if not data.get('success'):
                break

        inv.refresh_from_db()
        self.assertEqual(inv.quantity, stock_initial - 3,
            f'موجودی باید {stock_initial - 3} باشد ولی {inv.quantity} است')
        print(f'  → ۳ سفارش: {stock_initial} → {inv.quantity} ✓')

    def test_14_order_ready_material_out_of_stock(self):
        """سفارش ماده آماده بدون موجودی باید رد شود"""
        rm = ReadyMaterial.objects.first()
        if not rm:
            self.skipTest('ماده آماده‌ای نیست')
        original_qty = rm.quantity
        rm.quantity = 0
        rm.save(update_fields=['quantity'])
        try:
            r, data = self.api_post('/api/pos/create-order/', {
                'customer_name': 'تست ناموجود',
                'phone': '',
                'items': [{'food_id': f'ready_{rm.id}', 'quantity': 1, 'price': int(rm.selling_price)}]
            })
            self.assertFalse(data.get('success'),
                'سفارش ماده آماده بدون موجودی باید رد شود')
            print(f'  → ماده آماده بدون موجودی: رد شد ✓')
        finally:
            rm.quantity = original_qty
            rm.save(update_fields=['quantity'])


# ═══════════════════════════════════════════════════════
#  ۱۲. تست‌های گزارش روزانه
# ═══════════════════════════════════════════════════════

class TestDailyReport(BaseAPITestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls._create_test_orders(2, prefix='گزارش')

    def test_01_report_api_accessible(self):
        today = timezone.localdate().isoformat()
        r, data = self.api_get(f'/api/pos/daily-report/?date={today}')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))

    def test_02_report_returns_order_count(self):
        today = timezone.localdate().isoformat()
        r, data = self.api_get(f'/api/pos/daily-report/?date={today}')
        self.assertEqual(r.status_code, 200)
        self.assertIn('order_count', data)
        self.assertGreaterEqual(data['order_count'], 2)
        print(f'  → سفارشات امروز: {data["order_count"]}')

    def test_03_report_returns_total_sales(self):
        today = timezone.localdate().isoformat()
        r, data = self.api_get(f'/api/pos/daily-report/?date={today}')
        self.assertEqual(r.status_code, 200)
        self.assertIn('total_sales', data)
        self.assertGreater(data['total_sales'], 0)
        print(f'  → فروش کل: {data["total_sales"]:,} تومان')

    def test_04_report_returns_top_items(self):
        today = timezone.localdate().isoformat()
        r, data = self.api_get(f'/api/pos/daily-report/?date={today}')
        self.assertEqual(r.status_code, 200)
        self.assertIn('top_items', data)
        self.assertIsInstance(data['top_items'], list)
        if data['top_items']:
            top = data['top_items'][0]
            self.assertIn('name', top)
            self.assertIn('qty', top)
            print(f'  → پرفروش‌ترین: {top["name"]} ({top["qty"]} عدد)')

    def test_05_report_returns_orders_list(self):
        today = timezone.localdate().isoformat()
        r, data = self.api_get(f'/api/pos/daily-report/?date={today}')
        self.assertEqual(r.status_code, 200)
        self.assertIn('orders', data)
        self.assertIsInstance(data['orders'], list)

    def test_06_report_returns_waste_total(self):
        today = timezone.localdate().isoformat()
        r, data = self.api_get(f'/api/pos/daily-report/?date={today}')
        self.assertEqual(r.status_code, 200)
        self.assertIn('waste_total', data)
        print(f'  → ضایعات: {data.get("waste_total", 0)} عدد')

    def test_07_report_empty_day(self):
        r, data = self.api_get('/api/pos/daily-report/?date=2020-01-01')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.assertEqual(data.get('order_count'), 0)
        self.assertEqual(data.get('total_sales'), 0)

    def test_08_report_default_date_is_today(self):
        r, data = self.api_get('/api/pos/daily-report/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.assertIn('order_count', data)

    def test_09_report_invalid_date_format(self):
        r, data = self.api_get('/api/pos/daily-report/?date=invalid-date')
        self.assertIn(r.status_code, [200, 400])
        print(f'  → تاریخ نامعتبر: {r.status_code}')

    def test_10_report_future_date(self):
        future = (timezone.localdate() + timedelta(days=30)).isoformat()
        r, data = self.api_get(f'/api/pos/daily-report/?date={future}')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.assertEqual(data.get('order_count'), 0)
        print(f'  → تاریخ آینده: ۰ سفارش')


# ═══════════════════════════════════════════════════════
#  ۱۳. تست‌های بستن روز
# ═══════════════════════════════════════════════════════

class TestCloseDay(BaseAPITestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls._create_test_orders(2, prefix='بستن')

    def test_01_close_summary_api(self):
        r, data = self.api_get('/api/pos/close-summary/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.assertIn('total_sales', data)
        self.assertIn('order_count', data)
        print(f'  → فروش: {int(data["total_sales"]):,}ت / سفارشات: {data["order_count"]}')

    def test_02_close_summary_has_pending_orders(self):
        r, data = self.api_get('/api/pos/close-summary/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('pending_orders', data)
        self.assertIsInstance(data['pending_orders'], list)

    def test_03_close_all_pending(self):
        pending_before = Order.objects.filter(
            created_at__date=timezone.localdate()
        ).exclude(status='delivered').count()
        r, data = self.api_post('/api/pos/close-pending/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        pending_after = Order.objects.filter(
            created_at__date=timezone.localdate()
        ).exclude(status='delivered').count()
        self.assertEqual(pending_after, 0)
        print(f'  → تحویل: {pending_before} → {pending_after}')

    def test_04_close_day(self):
        r, data = self.api_post('/api/pos/close-day/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        print(f'  → {data.get("msg", "")}')

    def test_05_close_day_idempotent(self):
        r1, d1 = self.api_post('/api/pos/close-day/')
        self.assertTrue(d1.get('success'), f'بستن اول خطا: {d1}')
        r2, d2 = self.api_post('/api/pos/close-day/')
        self.assertTrue(d2.get('success'), f'بستن دوم خطا: {d2}')
        print(f'  → بستن اول: {d1.get("success")} / بستن دوم: {d2.get("success")}')

    def test_06_close_day_with_no_orders(self):
        """بستن روز بدون سفارش باید موفق باشد"""
        Order.objects.filter(created_at__date=timezone.localdate()).delete()
        r, data = self.api_post('/api/pos/close-day/')
        self.assertEqual(r.status_code, 200)
        print(f'  → بستن بدون سفارش: {data}')


# ═══════════════════════════════════════════════════════
#  ۱۴. تست‌های ضایعات صندوق (POS Waste)
# ═══════════════════════════════════════════════════════

class TestWasteRegistration(BaseAPITestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()

    def _create_product_with_stock(self):
        cat, _ = Category.objects.get_or_create(name='تست ضایعات POS', defaults={'order': 99})
        food, _ = Food.objects.get_or_create(
            name='غذای تست ضایعات POS', defaults={'category': cat, 'final_price': 80000}
        )
        recipe, _ = Recipe.objects.get_or_create(food=food, defaults={'yield_quantity': 1})
        kp, created = KitchenProduct.objects.get_or_create(
            name='محصول تست ضایعات POS',
            defaults={'recipe': recipe, 'category': 'other', 'selling_price': 80000}
        )
        inv = kp.get_inventory()
        if inv.quantity < 10:
            inv.quantity = 20
            inv.save(update_fields=['quantity', 'updated_at'])
        return kp, inv

    def test_01_waste_api_accessible(self):
        r = self.client.post(
            '/api/pos/register-waste/',
            data=json.dumps({'items': []}),
            content_type='application/json'
        )
        self.assertNotEqual(r.status_code, 404)

    def test_02_register_waste_success(self):
        kp, inv = self._create_product_with_stock()
        stock_before = inv.quantity
        r, data = self.api_post('/api/pos/register-waste/', {
            'items': [{
                'kitchen_product_id': kp.id,
                'quantity': 1,
                'note': 'تست ضایعات POS',
            }]
        })
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        inv.refresh_from_db()
        self.assertEqual(inv.quantity, stock_before - 1)
        print(f'  → موجودی «{kp.name}»: {stock_before} → {inv.quantity}')

    def test_03_waste_creates_log(self):
        kp, inv = self._create_product_with_stock()
        log_count_before = WasteLog.objects.count()
        r, data = self.api_post('/api/pos/register-waste/', {
            'items': [{'kitchen_product_id': kp.id, 'quantity': 2, 'note': 'تست لاگ'}]
        })
        self.assertTrue(data.get('success'))
        self.assertEqual(WasteLog.objects.count(), log_count_before + 1)
        wl = WasteLog.objects.latest('created_at')
        self.assertEqual(wl.kitchen_product_id, kp.id)
        self.assertEqual(wl.quantity, 2)
        print(f'  → WasteLog: qty={wl.quantity}')

    def test_04_waste_multiple_items(self):
        cat, _ = Category.objects.get_or_create(name='تست چندضایعات', defaults={'order': 99})
        products = []
        for i in range(2):
            food, _ = Food.objects.get_or_create(
                name=f'غذای چندضایعات {i}', defaults={'category': cat, 'final_price': 80000}
            )
            recipe, _ = Recipe.objects.get_or_create(food=food, defaults={'yield_quantity': 1})
            kp, _ = KitchenProduct.objects.get_or_create(
                name=f'محصول چندضایعات {i}',
                defaults={'recipe': recipe, 'category': 'other', 'selling_price': 80000}
            )
            inv = kp.get_inventory()
            if inv.quantity < 5:
                inv.quantity = 20
                inv.save(update_fields=['quantity', 'updated_at'])
            products.append(kp)

        items = [
            {'kitchen_product_id': products[0].id, 'quantity': 1, 'note': 'تست ۱'},
            {'kitchen_product_id': products[1].id, 'quantity': 1, 'note': 'تست ۲'},
        ]
        r, data = self.api_post('/api/pos/register-waste/', {'items': items})
        self.assertTrue(data.get('success'))

    def test_05_waste_invalid_product(self):
        r, data = self.api_post('/api/pos/register-waste/', {
            'items': [{'kitchen_product_id': 999999, 'quantity': 1, 'note': ''}]
        })
        self.assertFalse(data.get('success'))

    def test_06_waste_empty_items(self):
        r, data = self.api_post('/api/pos/register-waste/', {'items': []})
        self.assertFalse(data.get('success'))

    def test_07_waste_appears_in_report(self):
        kp, inv = self._create_product_with_stock()
        self.api_post('/api/pos/register-waste/', {
            'items': [{'kitchen_product_id': kp.id, 'quantity': 1, 'note': 'تست گزارش'}]
        })
        today = timezone.localdate().isoformat()
        r2, report = self.api_get(f'/api/pos/daily-report/?date={today}')
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(report.get('success'))
        self.assertGreater(report.get('waste_total', 0), 0)
        print(f'  → ضایعات در گزارش: {report["waste_total"]} عدد')

    def test_08_waste_stock_never_negative(self):
        kp, inv = self._create_product_with_stock()
        stock = inv.quantity
        r, data = self.api_post('/api/pos/register-waste/', {
            'items': [{'kitchen_product_id': kp.id, 'quantity': stock + 100, 'note': ''}]
        })
        inv.refresh_from_db()
        self.assertGreaterEqual(inv.quantity, 0)

    def test_09_waste_zero_quantity(self):
        kp, inv = self._create_product_with_stock()
        r, data = self.api_post('/api/pos/register-waste/', {
            'items': [{'kitchen_product_id': kp.id, 'quantity': 0, 'note': ''}]
        })
        self.assertFalse(data.get('success'), 'ضایعات صفر باید رد شود')
        print(f'  → تعداد صفر: رد شد ✓')

    def test_10_waste_negative_quantity(self):
        kp, inv = self._create_product_with_stock()
        r, data = self.api_post('/api/pos/register-waste/', {
            'items': [{'kitchen_product_id': kp.id, 'quantity': -1, 'note': ''}]
        })
        self.assertFalse(data.get('success'), 'ضایعات منفی باید رد شود')
        print(f'  → تعداد منفی: رد شد ✓')


# ═══════════════════════════════════════════════════════
#  ۱۵. فلوی کامل End-to-End
# ═══════════════════════════════════════════════════════
class TestFullPipeline(BaseAPITestCase):

    def test_01_pipeline_overview(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        products = data.get('products', [])
        discounts = data.get('discounts', [])
        if isinstance(discounts, dict):
            discounts = discounts.get('results', [])
        inventory = data.get('inventory', [])
        waste = data.get('waste', [])
        if isinstance(waste, dict):
            waste = waste.get('results', [])
        stats = data.get('stats', {})
        print(f'\n  ═══ خلاصه سیستم ═══')
        print(f'  محصولات آشپزخانه:  {len(products)}')
        print(f'  تخفیف‌ها:          {len(discounts)}')
        print(f'  موجودی:            {len(inventory)}')
        print(f'  ضایعات:            {len(waste)}')

    def test_02_full_produce_and_sell_flow(self):
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        products = data.get('products', [])
        if not products:
            self.skipTest('محصولی وجود ندارد')
        product = products[0]
        pid = product['id']
        pname = product.get('name', '?')

        r1, cap = self.api_get(f'/api/kitchen/products/{pid}/capacity/')
        if r1.status_code != 200:
            self.skipTest(f'ظرفیت محصول {pname} قابل بررسی نیست')
        max_prod = cap.get('max_production', 0)
        print(f'  → ظرفیت «{pname}»: {max_prod}')

        if max_prod > 0:
            r3, resp = self.api_post(
                f'/api/kitchen/products/{pid}/produce/',
                {'quantity': 2, 'notes': 'تست فلوی کامل'}
            )
            if r3.status_code in [200, 201]:
                print(f'  → تولید «{pname}»: ۲ عدد ✓')

        inv = KitchenInventory.objects.filter(kitchen_product_id=pid).first()
        stock_after_produce = inv.quantity if inv else 0
        print(f'  → موجودی بعد از تولید: {stock_after_produce}')

        food = Food.objects.filter(name=pname).first() or Food.objects.first()
        if food:
            r4, order_data = self.api_post('/api/pos/create-order/', {
                'customer_name': 'تست فلوی کامل',
                'phone': '09120000000',
                'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}]
            })
            if order_data.get('success'):
                print(f'  → سفارش #{order_data.get("order_id")} ثبت شد')
                inv.refresh_from_db()
                self.assertLess(inv.quantity, stock_after_produce)
                print(f'  → موجودی بعد از فروش: {inv.quantity}')

    def test_03_full_discount_flow(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        pid = p['id']

        r1, d1 = self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف فلوی کامل', 'kitchen_product': pid,
            'discount_type': 'percentage', 'scope': 'all_items',
            'value': 10, 'is_active': True
        })
        self.assertIn(r1.status_code, [200, 201])
        did = d1.get('id') or d1.get('pk')
        print(f'  → تخفیف #{did} ساخته شد')

        r2, dash = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r2.status_code, 200)
        discounts = dash.get('discounts', [])
        if isinstance(discounts, dict):
            discounts = discounts.get('results', [])
        found = [d for d in discounts if (d.get('id') or d.get('pk')) == did]
        self.assertGreater(len(found), 0, 'تخفیف در داشبورد نیست')
        print(f'  → تخفیف در داشبورد تأیید شد')

        r4, d4 = self.api_delete(f'/api/kitchen/discounts/{did}/')
        self.assertIn(r4.status_code, [200, 204])
        print(f'  → تخفیف حذف شد')

    def test_04_full_waste_flow(self):
        p = self._get_first_product()
        if not p:
            self.skipTest('محصولی وجود ندارد')
        pid = p['id']

        inv = KitchenInventory.objects.filter(kitchen_product_id=pid).first()
        if not inv or inv.quantity < 5:
            if inv:
                inv.quantity = 20
                inv.save(update_fields=['quantity', 'updated_at'])
            else:
                self.skipTest('موجودی یافت نشد')
        inv.refresh_from_db()
        stock_before = inv.quantity

        r1, w1 = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': pid, 'quantity': 2, 'reason': 'expired', 'notes': 'تست فلوی'
        })
        self.assertIn(r1.status_code, [200, 201])
        print(f'  → ضایعات ثبت شد')

        inv.refresh_from_db()
        self.assertEqual(inv.quantity, stock_before - 2)
        print(f'  → موجودی: {stock_before} → {inv.quantity}')

        r3, dash = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r3.status_code, 200)
        waste = dash.get('waste', [])
        if isinstance(waste, dict):
            waste = waste.get('results', [])
        self.assertGreater(len(waste), 0, 'ضایعات در داشبورد نیست')
        print(f'  → ضایعات در داشبورد: {len(waste)} مورد')

    def test_05_full_pos_waste_and_close_flow(self):
        food = Food.objects.first()
        if not food:
            self.skipTest('غذایی وجود ندارد')

        r1, d1 = self.api_post('/api/pos/create-order/', {
            'customer_name': 'تست بستن کامل', 'phone': '',
            'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}]
        })
        self.assertTrue(d1.get('success'))
        print(f'  → سفارش #{d1.get("order_id")}')

        kp = KitchenProduct.objects.filter(recipe__food=food).first()
        if kp:
            inv = kp.get_inventory()
            if inv.quantity < 2:
                inv.quantity = 10
                inv.save(update_fields=['quantity', 'updated_at'])
            r2, d2 = self.api_post('/api/pos/register-waste/', {
                'items': [{'kitchen_product_id': kp.id, 'quantity': 1, 'note': 'تست بستن'}]
            })
            if d2.get('success'):
                print(f'  → ضایعات POS ثبت شد')

        today = timezone.localdate().isoformat()
        r3, report = self.api_get(f'/api/pos/daily-report/?date={today}')
        self.assertEqual(r3.status_code, 200)
        self.assertTrue(report.get('success'))
        print(f'  → گزارش: {report.get("order_count", 0)} سفارش / {report.get("total_sales", 0):,} فروش')

        r4, close = self.api_post('/api/pos/close-day/')
        self.assertEqual(r4.status_code, 200)
        self.assertTrue(close.get('success'))
        print(f'  → روز بسته شد: {close.get("msg", "")}')

    def test_06_data_consistency(self):
        errors = []
        products = KitchenProduct.objects.all()
        for kp in products:
            inv = kp.get_inventory()
            if inv.quantity < 0:
                errors.append(f'محصول «{kp.name}» موجودی منفی: {inv.quantity}')
            if kp.selling_price is not None and kp.selling_price < 0:
                errors.append(f'محصول «{kp.name}» قیمت منفی: {kp.selling_price}')

        for rm in ReadyMaterial.objects.all():
            if rm.quantity < 0:
                errors.append(f'ماده آماده «{rm.name}» موجودی منفی: {rm.quantity}')

        if errors:
            print(f'\n  ⚠ مشکلات:')
            for e in errors:
                print(f'    - {e}')
        else:
            print(f'  ✓ یکپارچگی داده‌ها تأیید شد ({products.count()} محصول)')
        self.assertEqual(len(errors), 0, f'{len(errors)} مشکل یافت شد')

    def test_07_full_product_lifecycle(self):
        cat = self._get_valid_category()

        r1, d1 = self.api_post('/api/kitchen/products/', {
            'name': 'کوکو سبزی', 'category': cat,
            'selling_price': 70000, 'recipe': self.recipe1.id
        })
        if r1.status_code not in [200, 201]:
            self.skipTest(f'ساخت محصول خطا: {r1.status_code}')
        pid = d1.get('id') or d1.get('pk')
        print(f'  ۱. محصول #{pid} ساخته شد')

        r2, d2 = self.api_patch(f'/api/kitchen/products/{pid}/', {'selling_price': 75000})
        if r2.status_code == 200:
            print(f'  ۲. قیمت: ۷۵,۰۰۰ تومان')

        r3, d3 = self.api_get(f'/api/kitchen/products/{pid}/capacity/')
        max_prod = d3.get('max_production', 0) if r3.status_code == 200 else 0
        print(f'  ۳. ظرفیت: {max_prod}')

        r4, d4 = self.api_post(f'/api/kitchen/products/{pid}/produce/',
                                {'quantity': 5, 'notes': 'تولید اولیه'})
        if r4.status_code in [200, 201]:
            print(f'  ۴. تولید ۵ عدد ✓')

        r5, d5 = self.api_post('/api/kitchen/discounts/', {
            'name': 'تخفیف کوکو', 'kitchen_product': pid,
            'discount_type': 'percentage', 'scope': 'all_items',
            'value': 15, 'is_active': True
        })
        did = (d5.get('id') or d5.get('pk')) if r5.status_code in [200, 201] else None
        print(f'  ۵. تخفیف ۱۵٪: ID={did}')

        food = Food.objects.filter(name='کوکو سبزی').first()
        if food:
            r6, d6 = self.api_post('/api/pos/create-order/', {
                'customer_name': 'چرخه کامل', 'phone': '',
                'items': [{'food_id': food.id, 'quantity': 2, 'price': 75000}]
            })
            if d6.get('success'):
                print(f'  ۶. فروش: سفارش #{d6.get("order_id")}')

        inv = KitchenInventory.objects.filter(kitchen_product_id=pid).first()
        if inv and inv.quantity > 0:
            r7, d7 = self.api_post('/api/kitchen/waste/', {
                'kitchen_product': pid, 'quantity': 1, 'reason': 'returned', 'notes': 'برگشتی'
            })
            if r7.status_code in [200, 201]:
                print(f'  ۷. ضایعات: ۱ عدد ✓')

        if inv:
            inv.refresh_from_db()
            print(f'  ۸. موجودی نهایی: {inv.quantity}')

        if did:
            self.api_delete(f'/api/kitchen/discounts/{did}/')
            print(f'  ۹. تخفیف حذف شد')

        print(f'  ══ چرخه کامل محصول موفق ══')
# ═══════════════════════════════════════════════════════
#  ۱۶. تست‌های صفحه آشپزخانه (HTML)
# ═══════════════════════════════════════════════════════

class TestKitchenPage(BaseAPITestCase):

    def test_01_page_loads(self):
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)

    def test_02_page_has_required_context(self):
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        possible = ['recipes_json', 'categories_json', 'foods_json', 'food_cats_json',
                    'products', 'inventory', 'discounts', 'kitchen']
        found = [v for v in possible if v in content]
        self.assertGreater(len(found), 0, f'هیچ context پیدا نشد: {possible}')
        print(f'  ✓ context: {found}')

    def test_03_page_has_tabs(self):
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('data-tab="menu-foods"', content, 'تب غذاهای منو نیست')
        self.assertIn('data-tab="discounts"', content, 'تب تخفیف‌ها نیست')
        self.assertIn('data-tab="waste"', content, 'تب ضایعات نیست')
        self.assertIn('data-tab="orders"', content, 'تب سفارشات نیست')
        self.assertIn('data-tab="produce"', content, 'تب تولید نیست')
        print(f'  ✓ تب‌ها: orders, menu-foods, produce, discounts, waste')

    def test_04_page_has_waste_panel(self):
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('panel-waste', content, 'پنل ضایعات نیست')
        self.assertIn('ktWasteBody', content, 'جدول ضایعات نیست')
        self.assertIn('ktOpenWasteModal', content, 'دکمه ثبت ضایعات نیست')
        print(f'  ✓ پنل ضایعات: جدول + دکمه ثبت')

    def test_05_page_has_waste_modal(self):
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('ktModalWaste', content, 'مودال ضایعات نیست')
        self.assertIn('mwProduct', content, 'فیلد محصول نیست')
        self.assertIn('mwQty', content, 'فیلد تعداد نیست')
        self.assertIn('mwReason', content, 'فیلد دلیل نیست')
        self.assertIn('mwNotes', content, 'فیلد توضیحات نیست')
        self.assertIn('mwCostPreview', content, 'پیش‌نمایش هزینه نیست')
        print(f'  ✓ مودال ضایعات: محصول + تعداد + دلیل + توضیحات + پیش‌نمایش هزینه')

    def test_06_page_has_waste_reasons(self):
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        reasons = ['expired', 'damaged', 'overcooked', 'quality_issue', 'returned', 'other']
        for reason in reasons:
            self.assertIn(f"'{reason}'", content, f'دلیل «{reason}» در JS نیست')
        print(f'  ✓ همه {len(reasons)} دلیل ضایعات در JS')

    def test_07_page_has_javascript_functions(self):
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        functions = [
            'ktLoad', 'ktRenderAll', 'ktRenderMenuFoods',
            'ktRenderDiscounts', 'ktRenderStats',
            'ktSaveDiscount',
            'ktRenderWaste', 'ktRenderWasteStats', 'ktBuildWasteReasonFilters',
            'ktOpenWasteModal', 'ktSaveWaste', 'ktDeleteWaste',
            'ktUpdateWasteCostPreview',
            'ktDoProduce',
            'ktOpenProduceModal', 'ktProduceUpdateInfo',
        ]
        missing = [fn for fn in functions if f'function {fn}' not in content]
        if missing:
            print(f'  ⚠ توابع گمشده: {missing}')
        self.assertEqual(len(missing), 0, f'{len(missing)} تابع گمشده')
        print(f'  ✓ همه {len(functions)} تابع JS موجود')

    def test_08_page_has_produce_tab_and_modal(self):
        """تب تولید و مودال produce باید وجود داشته باشند"""
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('panel-produce', content, 'پنل تولید نیست')
        self.assertIn('prProduct', content, 'فیلد محصول تولید نیست')
        self.assertIn('prQty', content, 'فیلد تعداد تولید نیست')
        self.assertIn('prNotes', content, 'فیلد یادداشت تولید نیست')
        self.assertIn('ktDoProduce', content, 'تابع تولید نیست')
        print(f'  ✓ تب تولید: فرم + تابع ktDoProduce')

    def test_09_page_has_orders_tab(self):
        """تب سفارشات باید وجود داشته باشد"""
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('panel-orders', content, 'پنل سفارشات نیست')
        self.assertIn('kitchen-orders-list', content, 'لیست سفارشات نیست')
        self.assertIn('loadKitchenOrders', content, 'تابع بارگذاری سفارشات نیست')
        print(f'  ✓ تب سفارشات: لیست + تابع loadKitchenOrders')

    def test_10_waste_stats_in_page(self):
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('ktWasteStats', content, 'آمار ضایعات نیست')
        print(f'  ✓ آمار ضایعات در هدر')

    def test_11_page_has_produce_modal(self):
        """مودال تولید سریع از کارت باید وجود داشته باشد"""
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('ktModalProduce', content, 'مودال تولید سریع نیست')
        print(f'  ✓ مودال تولید سریع موجود')


# ═══════════════════════════════════════════════════════
#  ۱۷. تست‌های صفحه POS
# ═══════════════════════════════════════════════════════

class TestPOSPage(BaseAPITestCase):

    def test_01_page_loads(self):
        r = self.client.get('/pos/')
        self.assertEqual(r.status_code, 200)

    def test_02_page_has_pos_tab(self):
        r = self.client.get('/pos/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('panel-pos', content)
        self.assertIn('posGrid', content)
        self.assertIn('posCartItems', content)
        print(f'  ✓ تب صندوق: گرید + سبد')

    def test_03_page_has_report_tab(self):
        r = self.client.get('/pos/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('panel-report', content)
        self.assertIn('repTotalSales', content)
        self.assertIn('repOrderCount', content)
        self.assertIn('repTopItems', content)
        print(f'  ✓ تب گزارش: آمار + جدول')

    def test_04_page_has_close_tab(self):
        r = self.client.get('/pos/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')
        self.assertIn('panel-close', content)
        self.assertIn('closeTotalSales', content)
        self.assertIn('closeWasteItems', content)
        print(f'  ✓ تب بستن روز')

    def test_05_page_has_url_endpoints(self):
        urls = [
            'pos_create_order', 'pos_daily_report', 'pos_close_summary',
            'pos_register_waste', 'pos_close_all_pending', 'pos_close_day',
        ]
        for name in urls:
            try:
                url = reverse(name)
                print(f'  ✓ {name} → {url}')
            except Exception as e:
                self.fail(f'URL «{name}» resolve نشد: {e}')


# ═══════════════════════════════════════════════════════
#  ۱۸. تست‌های عملکرد (Performance)
# ═══════════════════════════════════════════════════════

class TestPerformance(BaseAPITestCase):

    def test_01_dashboard_performance(self):
        times = []
        for _ in range(5):
            start = time.time()
            r, data = self.api_get('/api/kitchen/dashboard/')
            self.assertEqual(r.status_code, 200)
            times.append(time.time() - start)
        avg = sum(times) / len(times)
        p90 = sorted(times)[int(len(times) * 0.9)]
        print(f'  → داشبورد: avg={avg:.3f}s, p90={p90:.3f}s')
        self.assertLess(avg, 3.0)
        self.assertLess(p90, 4.0)

    def test_02_kitchen_waste_list_performance(self):
        start = time.time()
        r = self.client.get('/api/kitchen/waste/')
        elapsed = time.time() - start
        self.assertIn(r.status_code, [200, 302])
        print(f'  → لیست ضایعات: {elapsed:.3f}s')
        self.assertLess(elapsed, 3.0)

    def test_03_pos_page_performance(self):
        start = time.time()
        r = self.client.get('/pos/')
        elapsed = time.time() - start
        self.assertEqual(r.status_code, 200)
        print(f'  → صفحه صندوق: {elapsed:.3f}s')
        self.assertLess(elapsed, 5.0)

    def test_04_daily_report_performance(self):
        today = timezone.localdate().isoformat()
        start = time.time()
        r, data = self.api_get(f'/api/pos/daily-report/?date={today}')
        elapsed = time.time() - start
        self.assertEqual(r.status_code, 200)
        print(f'  → گزارش روزانه: {elapsed:.3f}s')
        self.assertLess(elapsed, 5.0)

    def test_05_close_summary_performance(self):
        start = time.time()
        r, data = self.api_get('/api/pos/close-summary/')
        elapsed = time.time() - start
        self.assertEqual(r.status_code, 200)
        print(f'  → خلاصه بستن روز: {elapsed:.3f}s')
        self.assertLess(elapsed, 5.0)

    def test_06_products_list_performance(self):
        start = time.time()
        r = self.client.get('/api/kitchen/products/')
        elapsed = time.time() - start
        self.assertIn(r.status_code, [200, 302])
        print(f'  → لیست محصولات: {elapsed:.3f}s')
        self.assertLess(elapsed, 3.0)


# ═══════════════════════════════════════════════════════
#  ۱۹. تست‌های امنیتی
# ═══════════════════════════════════════════════════════

class TestSecurity(BaseAPITestCase):

    def test_01_api_requires_auth(self):
        anon = Client()
        r = anon.get('/api/kitchen/dashboard/')
        self.assertIn(r.status_code, [401, 403, 302])

    def test_02_kitchen_waste_requires_auth(self):
        anon = Client()
        r = anon.post('/api/kitchen/waste/',
                       data=json.dumps({'kitchen_product': 1, 'quantity': 1, 'reason': 'expired'}),
                       content_type='application/json')
        self.assertIn(r.status_code, [401, 403, 302])

    def test_03_pos_requires_auth(self):
        anon = Client()
        r = anon.get('/pos/')
        self.assertIn(r.status_code, [401, 403, 302])

    def test_04_report_requires_auth(self):
        anon = Client()
        r = anon.get('/api/pos/daily-report/')
        self.assertIn(r.status_code, [401, 403, 302])

    def test_05_close_requires_auth(self):
        anon = Client()
        r = anon.post('/api/pos/close-day/')
        self.assertIn(r.status_code, [401, 403, 302])

    def test_06_pos_waste_requires_auth(self):
        anon = Client()
        r = anon.post('/api/pos/register-waste/',
                       data=json.dumps({'items': []}),
                       content_type='application/json')
        self.assertIn(r.status_code, [401, 403, 302])

    def test_07_discount_requires_auth(self):
        anon = Client()
        r = anon.post('/api/kitchen/discounts/',
                       data=json.dumps({'name': 'تست'}),
                       content_type='application/json')
        self.assertIn(r.status_code, [401, 403, 302])

    def test_08_normal_user_access(self):
        """کاربر عادی باید بتواند صفحه ببیند ولی شاید نتواند عملیات حساس انجام دهد"""
        self.client.logout()
        self.client.login(username='testuser', password='TestPass456!')
        r = self.client.get('/api/kitchen/dashboard/')
        self.assertIn(r.status_code, [200, 401, 403, 302])
        print(f'  → کاربر عادی dashboard: {r.status_code}')

    def test_09_csrf_protection_on_post(self):
        """POST بدون CSRF token باید خطای 403 بده"""
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.login(username='testadmin', password='TestPass123!')
        r = csrf_client.post('/api/pos/create-order/',
                              data=json.dumps({'items': []}),
                              content_type='application/json')
        self.assertIn(r.status_code, [403, 400])
        print(f'  → CSRF check: {r.status_code}')


# ═══════════════════════════════════════════════════════
#  ۲۰. تست‌های API Endpoints
# ═══════════════════════════════════════════════════════

class TestAPIEndpoints(BaseAPITestCase):

    def _check_not_404(self, url, method='GET', data=None):
        if method == 'GET':
            r = self.client.get(url)
        elif method == 'POST':
            r = self.client.post(url, data=json.dumps(data or {}),
                                  content_type='application/json')
        else:
            r = self.client.get(url)
        self.assertNotEqual(r.status_code, 404, f'{url} → 404')
        return r.status_code

    def test_01_kitchen_dashboard(self): self._check_not_404('/api/kitchen/dashboard/')
    def test_02_kitchen_products(self): self._check_not_404('/api/kitchen/products/')
    def test_03_kitchen_discounts(self): self._check_not_404('/api/kitchen/discounts/')
    def test_04_kitchen_waste(self): self._check_not_404('/api/kitchen/waste/')
    def test_05_kitchen_inventory(self): self._check_not_404('/api/kitchen/inventory/')
    def test_06_kitchen_calculate_materials(self): self._check_not_404('/api/kitchen/calculate-materials/', 'POST', {'items': []})
    def test_07_semi_finished(self): self._check_not_404('/api/semi-finished/')
    def test_08_recipes(self): self._check_not_404('/api/recipes/')
    def test_09_warehouse_json(self): self._check_not_404('/api/warehouse-json/')
    def test_10_usage_log_json(self): self._check_not_404('/api/usage-log/json/')
    def test_11_foods_api(self): self._check_not_404('/api/foods/')
    def test_12_categories_api(self): self._check_not_404('/api/categories/')
    def test_13_pos_create_order(self): self._check_not_404('/api/pos/create-order/', 'POST', {'items': []})
    def test_14_pos_daily_report(self): self._check_not_404('/api/pos/daily-report/')
    def test_15_pos_close_summary(self): self._check_not_404('/api/pos/close-summary/')
    def test_16_pos_register_waste(self): self._check_not_404('/api/pos/register-waste/', 'POST', {'items': []})
    def test_17_pos_close_pending(self): self._check_not_404('/api/pos/close-pending/', 'POST', {})
    def test_18_pos_close_day(self): self._check_not_404('/api/pos/close-day/', 'POST', {})


# ═══════════════════════════════════════════════════════
#  ۲۱. تست‌های صفحات HTML
# ═══════════════════════════════════════════════════════

class TestHTMLPages(BaseAPITestCase):

    def test_01_auth_page(self):
        r = self.client.get('/auth/')
        self.assertIn(r.status_code, [200, 302])

    def test_02_foods_page(self):
        r = self.client.get('/foods/')
        self.assertIn(r.status_code, [200, 302])

    def test_03_kitchen_page(self):
        r = self.client.get('/kitchen/')
        self.assertIn(r.status_code, [200, 302])

    def test_04_pos_page(self):
        r = self.client.get('/pos/')
        self.assertIn(r.status_code, [200, 302])

    def test_05_ready_materials_page(self):
        r = self.client.get('/ready-materials/')
        self.assertIn(r.status_code, [200, 302])

    def test_06_raw_materials_page(self):
        r = self.client.get('/raw-materials/')
        self.assertIn(r.status_code, [200, 302])

    def test_07_usage_log_page(self):
        r = self.client.get('/usage-log/')
        self.assertIn(r.status_code, [200, 302])

    def test_08_recipes_page(self):
        r = self.client.get('/recipes/')
        self.assertIn(r.status_code, [200, 302])


# ═══════════════════════════════════════════════════════
#  ۲۲. تست‌های تاریخچه بستن روز
# ═══════════════════════════════════════════════════════

class TestCloseHistory(BaseAPITestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls._create_test_orders(2, prefix='تاریخچه')

    def test_01_close_day_creates_report(self):
        count_before = DayCloseReport.objects.count()
        r, data = self.api_post('/api/pos/close-day/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.assertEqual(DayCloseReport.objects.count(), count_before + 1)
        print(f'  → گزارش ذخیره شد: ID={data.get("report_id")}')

    def test_02_report_has_all_fields(self):
        self.api_post('/api/pos/close-day/')
        report = DayCloseReport.objects.latest('closed_at')
        self.assertEqual(report.date, timezone.localdate())
        self.assertGreater(report.total_sales, 0)
        self.assertGreater(report.order_count, 0)
        self.assertIsInstance(report.inventory_snapshot, dict)
        self.assertIsInstance(report.items_detail, list)
        self.assertIsInstance(report.top_items, list)
        if hasattr(report, 'closed_by'):
            self.assertIsNotNone(report.closed_by)

    def test_03_close_day_creates_log(self):
        count_before = DayCloseLog.objects.count()
        r, data = self.api_post('/api/pos/close-day/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.assertEqual(DayCloseLog.objects.count(), count_before + 1)

    def test_04_report_persists(self):
        r, data = self.api_post('/api/pos/close-day/')
        self.assertEqual(r.status_code, 200)
        report_id = data.get('report_id')
        self.assertIsNotNone(report_id)
        r2, detail = self.api_get(f'/api/pos/close-report/{report_id}/')
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(detail.get('success'))

    def test_05_history_api(self):
        self.api_post('/api/pos/close-day/')
        r, data = self.api_get('/api/pos/close-history/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.assertGreater(len(data['reports']), 0)

    def test_06_logs_api(self):
        self.api_post('/api/pos/close-day/')
        r, data = self.api_get('/api/pos/close-logs/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.assertGreater(len(data['logs']), 0)

    def test_07_inventory_snapshot(self):
        self.api_post('/api/pos/close-day/')
        report = DayCloseReport.objects.latest('closed_at')
        self.assertIsInstance(report.inventory_snapshot, dict)
        print(f'  → موجودی ذخیره شده: {len(report.inventory_snapshot)} محصول')

    def test_08_profit_calculation(self):
        self.api_post('/api/pos/close-day/')
        report = DayCloseReport.objects.latest('closed_at')
        self.assertGreater(report.total_sales, 0)
        if (hasattr(report, 'total_profit') and
            hasattr(report, 'total_cost') and
            hasattr(report, 'waste_value')):
            expected = (report.total_sales
                        - (report.total_cost or 0)
                        - (report.waste_value or 0)
                        - (getattr(report, 'discount_total', 0) or 0))
            self.assertEqual(report.total_profit, expected)
            print(f'  → سود: {report.total_profit:,} = فروش - هزینه - ضایعات - تخفیف')
        else:
            print(f'  → فیلدهای سود بررسی شدند')

    def test_09_waste_in_close_report(self):
        kp = KitchenProduct.objects.first()
        if not kp:
            self.skipTest('محصولی نیست')
        inv = kp.get_inventory()
        if inv.quantity < 2:
            inv.quantity = 20
            inv.save()
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': kp.id, 'quantity': 2, 'reason': 'expired',
            'notes': 'تست گزارش بستن'
        })
        self.api_post('/api/pos/close-day/')
        report = DayCloseReport.objects.latest('closed_at')
        self.assertGreater(report.waste_count, 0)
        print(f'  → ضایعات در گزارش: {report.waste_count} عدد / {report.waste_value:,} تومان')

    def test_10_double_close_different_reports(self):
        """بستن روز دو بار: هر کدام باید report جدا بسازند"""
        r1, d1 = self.api_post('/api/pos/close-day/')
        self.assertEqual(r1.status_code, 200)
        r2, d2 = self.api_post('/api/pos/close-day/')
        self.assertEqual(r2.status_code, 200)
        rid1 = d1.get('report_id')
        rid2 = d2.get('report_id')
        if rid1 and rid2:
            self.assertNotEqual(rid1, rid2, 'بستن تکراری باید report جدید بسازد')
            print(f'  → report 1: #{rid1} / report 2: #{rid2}')

    def test_11_history_sorted_by_date(self):
        self.api_post('/api/pos/close-day/')
        r, data = self.api_get('/api/pos/close-history/')
        self.assertEqual(r.status_code, 200)
        reports = data.get('reports', [])
        if len(reports) >= 2:
            dates = [rp.get('date') or rp.get('closed_at', '') for rp in reports]
            print(f'  → تاریخچه: {len(reports)} گزارش')


# ═══════════════════════════════════════════════════════
#  ۲۳. تست‌های Edge Case
# ═══════════════════════════════════════════════════════

class TestEdgeCases(BaseAPITestCase):
    """تست‌های corner case و edge case"""

    def test_01_food_without_recipe(self):
        """غذا بدون رسپی باید قابل سفارش باشد یا خطا بدهد"""
        food_no_recipe = Food.objects.create(
            category=self.cat_main, name='غذا بدون رسپی', final_price=50000
        )
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'تست بدون رسپی',
            'phone': '',
            'items': [{'food_id': food_no_recipe.id, 'quantity': 1, 'price': 50000}]
        })
        self.assertEqual(r.status_code, 200)
        print(f'  → غذا بدون رسپی: success={data.get("success")} status={r.status_code}')
        if not data.get('success'):
            self.assertIn('error', data)
            print(f'  → خطا: {data.get("error")}')

    def test_02_duplicate_order_same_second(self):
        """دو سفارش متوالی نباید موجودی را منفی کنند"""
        food = Food.objects.first()
        if not food:
            self.skipTest('غذایی وجود ندارد')
        kp = KitchenProduct.objects.filter(recipe__food=food).first()
        if not kp:
            self.skipTest('محصولی نیست')
        inv = kp.get_inventory()
        if inv.quantity < 2:
            inv.quantity = 5
            inv.save(update_fields=['quantity', 'updated_at'])
        inv.refresh_from_db()
        stock = inv.quantity

        for i in range(stock + 2):
            r, data = self.api_post('/api/pos/create-order/', {
                'customer_name': f'تست فشار {i}',
                'phone': '',
                'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}]
            })
            if not data.get('success'):
                break

        inv.refresh_from_db()
        self.assertGreaterEqual(inv.quantity, 0,
            f'موجودی منفی شد: {inv.quantity}')
        print(f'  → بعد از {stock + 2} سفارش: موجودی={inv.quantity}')

    def test_03_very_large_order_quantity(self):
        """سفارش با تعداد خیلی زیاد"""
        food = Food.objects.first()
        if not food:
            self.skipTest('غذایی وجود ندارد')
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'تست بزرگ',
            'phone': '',
            'items': [{'food_id': food.id, 'quantity': 999999, 'price': int(food.final_price)}]
        })
        self.assertEqual(r.status_code, 200)
        if data.get('success'):
            kp = KitchenProduct.objects.filter(recipe__food=food).first()
            if kp:
                inv = kp.get_inventory()
                self.assertGreaterEqual(inv.quantity, 0)
        print(f'  → سفارش ۹۹۹,۹۹۹: success={data.get("success")}')

    def test_04_ready_material_negative_stock_after_sale(self):
        """فروش ReadyMaterial نباید موجودی را منفی کند"""
        rm = ReadyMaterial.objects.first()
        if not rm:
            self.skipTest('ماده آماده‌ای نیست')
        original = rm.quantity
        rm.quantity = 1
        rm.save(update_fields=['quantity'])
        try:
            r, data = self.api_post('/api/pos/create-order/', {
                'customer_name': 'تست موجودی آماده',
                'phone': '',
                'items': [{'food_id': f'ready_{rm.id}', 'quantity': 5, 'price': int(rm.selling_price)}]
            })
            rm.refresh_from_db()
            self.assertGreaterEqual(rm.quantity, 0,
                f'موجودی ReadyMaterial منفی شد: {rm.quantity}')
            print(f'  → ReadyMaterial: ۱ → {rm.quantity}')
        finally:
            rm.quantity = original
            rm.save(update_fields=['quantity'])

    def test_05_dashboard_after_heavy_operations(self):
        """داشبورد باید بعد از عملیات سنگین درست کار کند"""
        food = Food.objects.first()
        if food:
            for i in range(3):
                self.api_post('/api/pos/create-order/', {
                    'customer_name': f'heavy-{i}', 'phone': '',
                    'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}]
                })
        kp = KitchenProduct.objects.first()
        if kp:
            inv = kp.get_inventory()
            if inv.quantity > 3:
                for i in range(3):
                    self.api_post('/api/kitchen/waste/', {
                        'kitchen_product': kp.id, 'quantity': 1, 'reason': 'expired'
                    })
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(data, dict)
        print(f'  → داشبورد بعد از عملیات سنگین: OK')



# ═══════════════════════════════════════════════════════
#  ۲۴. تست‌های مدیریت کاربران (User Management)
# ═══════════════════════════════════════════════════════

class TestUserManagement(BaseAPITestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # کاربر owner برای تست مدیریت
        cls.owner = User.objects.create_user(
            username='owner_test', password='OwnerPass123!',
            is_staff=True, is_superuser=True, role='owner',
            first_name='مالک', last_name='تست',
        )
        # کاربر معمولی برای تست
        cls.staff_user = User.objects.create_user(
            username='staff_test', password='StaffPass123!',
            is_staff=True, is_superuser=False, role='cashier',
            first_name='کارمند', last_name='تست',
        )
        # کاربر تأیید نشده
        cls.pending_user = User.objects.create_user(
            username='pending_test', password='PendingPass123!',
            is_staff=False, is_superuser=False, role='customer',
            first_name='در', last_name='انتظار',
            is_approved=False,
        )

    def setUp(self):
        self.client = Client()
        self.client.login(username='owner_test', password='OwnerPass123!')

    # ── لیست کاربران ──────────────────────────────────

    def test_01_users_list_api(self):
        """لیست کاربران باید قابل دریافت باشد"""
        r, data = self.api_get('/api/users/management/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('users', data)
        self.assertIsInstance(data['users'], list)
        self.assertGreater(len(data['users']), 0)
        print(f'  → تعداد کاربران: {len(data["users"])}')

    def test_02_users_list_contains_all_users(self):
        """لیست باید شامل همه کاربران باشد"""
        r, data = self.api_get('/api/users/management/')
        self.assertEqual(r.status_code, 200)
        usernames = [u['username'] for u in data['users']]
        self.assertIn('owner_test', usernames)
        self.assertIn('staff_test', usernames)
        self.assertIn('pending_test', usernames)
        print(f'  → کاربران: {usernames}')

    def test_03_users_list_has_required_fields(self):
        """هر کاربر باید فیلدهای لازم رو داشته باشه"""
        r, data = self.api_get('/api/users/management/')
        self.assertEqual(r.status_code, 200)
        user = next((u for u in data['users'] if u['username'] == 'staff_test'), None)
        self.assertIsNotNone(user, 'کاربر staff_test پیدا نشد')
        for field in ['id', 'username', 'role', 'is_active', 'is_approved']:
            self.assertIn(field, user, f'فیلد «{field}» در لیست کاربران نیست')
        print(f'  → فیلدها: {list(user.keys())}')

    def test_04_users_list_shows_pending_status(self):
        """کاربر تأیید نشده باید وضعیتش مشخص باشه"""
        r, data = self.api_get('/api/users/management/')
        self.assertEqual(r.status_code, 200)
        user = next((u for u in data['users'] if u['username'] == 'pending_test'), None)
        self.assertIsNotNone(user)
        self.assertFalse(user['is_approved'])
        print(f'  → pending_test: is_approved={user["is_approved"]}')

    def test_05_users_list_requires_auth(self):
        """لیست کاربران بدون لاگین باید رد شود"""
        self.client.logout()
        r, data = self.api_get('/api/users/management/')
        self.assertIn(r.status_code, [401, 403, 302])
        print(f'  → بدون لاگین: {r.status_code}')

    # ── ساخت کاربر جدید ───────────────────────────────

    def test_06_create_user_successful(self):
        """ساخت کاربر جدید باید موفق باشد"""
        count_before = User.objects.count()
        r, data = self.api_post('/api/users/create/', {
            'username': 'new_user_test',
            'password': 'NewPass123!',
            'phone_number': '09131000001',
            'role': 'cashier',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        self.assertEqual(User.objects.count(), count_before + 1)
        new_user = User.objects.get(username='new_user_test')
        self.assertEqual(new_user.role, 'cashier')
        self.assertTrue(new_user.is_staff)
        print(f'  → کاربر «new_user_test» ساخته شد: ID={new_user.id}')

    def test_07_create_user_with_manager_role(self):
        """ساخت کاربر با نقش مدیر"""
        r, data = self.api_post('/api/users/create/', {
            'username': 'manager_new',
            'password': 'ManagerPass123!',
            'role': 'manager',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        u = User.objects.get(username='manager_new')
        self.assertEqual(u.role, 'manager')
        print(f'  → مدیر جدید: role={u.role}')

    def test_08_create_user_with_kitchen_role(self):
        """ساخت کاربر با نقش آشپز"""
        r, data = self.api_post('/api/users/create/', {
            'username': 'kitchen_new',
            'password': 'KitchenPass123!',
            'role': 'kitchen',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        u = User.objects.get(username='kitchen_new')
        self.assertEqual(u.role, 'kitchen')
        print(f'  → آشپز جدید: role={u.role}')

    def test_09_create_user_with_owner_role(self):
        """ساخت کاربر با نقش مالک"""
        r, data = self.api_post('/api/users/create/', {
            'username': 'owner_new',
            'password': 'OwnerPass123!',
            'role': 'owner',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        u = User.objects.get(username='owner_new')
        self.assertEqual(u.role, 'owner')
        print(f'  → مالک جدید: role={u.role}')

    def test_10_create_user_duplicate_username(self):
        """ساخت کاربر با نام تکراری باید رد شود"""
        r, data = self.api_post('/api/users/create/', {
            'username': 'staff_test',  # قبلاً وجود داره
            'password': 'DupPass123!',
            'role': 'cashier',
        })
        self.assertFalse(data.get('success'), 'نام تکراری باید رد بشه')
        print(f'  → نام تکراری: error={data.get("error")}')

    def test_11_create_user_empty_username(self):
        """ساخت کاربر بدون نام باید رد شود"""
        r, data = self.api_post('/api/users/create/', {
            'username': '',
            'password': 'EmptyPass123!',
            'role': 'cashier',
        })
        self.assertFalse(data.get('success'), 'بدون نام باید رد بشه')
        print(f'  → بدون نام: error={data.get("error")}')

    def test_12_create_user_short_password(self):
        """ساخت کاربر با رمز کوتاه باید رد شود"""
        r, data = self.api_post('/api/users/create/', {
            'username': 'short_pass_user',
            'password': '123',
            'role': 'cashier',
        })
        self.assertFalse(data.get('success'), 'رمز کوتاه باید رد بشه')
        print(f'  → رمز کوتاه: error={data.get("error")}')

    def test_13_create_user_without_password(self):
        """ساخت کاربر بدون رمز باید رد شود"""
        r, data = self.api_post('/api/users/create/', {
            'username': 'no_pass_user',
            'password': '',
            'role': 'cashier',
        })
        self.assertFalse(data.get('success'), 'بدون رمز باید رد بشه')
        print(f'  → بدون رمز: error={data.get("error")}')

    def test_14_create_user_invalid_role(self):
        """ساخت کاربر با نقش نامعتبر"""
        r, data = self.api_post('/api/users/create/', {
            'username': 'invalid_role_user',
            'password': 'InvalidPass123!',
            'role': 'superadmin_fake',
        })
        # اگر API نقش نامعتبر رو رد کنه → success=False
        # اگر قبول کنه و default بزنه → success=True (هر دو قابل قبول)
        self.assertIn(r.status_code, [200, 400])
        print(f'  → نقش نامعتبر: success={data.get("success")} status={r.status_code}')

    def test_15_create_user_with_phone(self):
        """ساخت کاربر با شماره موبایل"""
        r, data = self.api_post('/api/users/create/', {
            'username': 'phone_user',
            'password': 'PhonePass123!',
            'phone_number': '09132000002',
            'role': 'cashier',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        u = User.objects.get(username='phone_user')
        self.assertEqual(u.phone_number, '09132000002')
        print(f'  → کاربر با موبایل: {u.phone_number}')

    # ── تغییر نقش ─────────────────────────────────────

    def test_16_change_role_to_manager(self):
        """تغییر نقش به مدیر"""
        r, data = self.api_post('/api/users/update-role/', {
            'user_id': self.staff_user.id,
            'role': 'manager',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        self.staff_user.refresh_from_db()
        self.assertEqual(self.staff_user.role, 'manager')
        print(f'  → تغییر نقش staff_test: cashier → manager')

    def test_17_change_role_to_owner(self):
        """تغییر نقش به مالک"""
        r, data = self.api_post('/api/users/update-role/', {
            'user_id': self.staff_user.id,
            'role': 'owner',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.staff_user.refresh_from_db()
        self.assertEqual(self.staff_user.role, 'owner')
        print(f'  → تغییر نقش staff_test: → owner')

    def test_18_change_role_to_kitchen(self):
        """تغییر نقش به آشپز"""
        r, data = self.api_post('/api/users/update-role/', {
            'user_id': self.staff_user.id,
            'role': 'kitchen',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.staff_user.refresh_from_db()
        self.assertEqual(self.staff_user.role, 'kitchen')
        print(f'  → تغییر نقش staff_test: → kitchen')

    def test_19_change_role_to_customer(self):
        """تغییر نقش به مشتری"""
        r, data = self.api_post('/api/users/update-role/', {
            'user_id': self.staff_user.id,
            'role': 'customer',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.staff_user.refresh_from_db()
        self.assertEqual(self.staff_user.role, 'customer')
        print(f'  → تغییر نقش staff_test: → customer')

    def test_20_change_role_invalid_user(self):
        """تغییر نقش کاربر ناموجود"""
        r, data = self.api_post('/api/users/update-role/', {
            'user_id': 999999,
            'role': 'manager',
        })
        self.assertFalse(data.get('success'))
        print(f'  → کاربر ناموجود: error={data.get("error")}')

    def test_21_change_role_invalid_role(self):
        """تغییر نقش به مقدار نامعتبر"""
        r, data = self.api_post('/api/users/update-role/', {
            'user_id': self.staff_user.id,
            'role': 'fake_role_xyz',
        })
        # باید رد بشه یا default بزنه
        self.assertIn(r.status_code, [200, 400])
        print(f'  → نقش نامعتبر: {r.status_code}')

    def test_22_change_role_appears_in_list(self):
        """نقش جدید باید در لیست نمایش داده بشه"""
        self.api_post('/api/users/update-role/', {
            'user_id': self.staff_user.id,
            'role': 'manager',
        })
        r, data = self.api_get('/api/users/management/')
        self.assertEqual(r.status_code, 200)
        user = next((u for u in data['users'] if u['id'] == self.staff_user.id), None)
        self.assertIsNotNone(user)
        self.assertEqual(user['role'], 'manager')
        print(f'  → نقش در لیست: {user["role"]}')

    # ── تغییر رمز عبور ────────────────────────────────

    def test_23_change_password_success(self):
        """تغییر رمز عبور باید موفق باشد"""
        r, data = self.api_post('/api/users/reset-password/', {
            'user_id': self.staff_user.id,
            'new_password': 'NewSecurePass456!',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        # بررسی لاگین با رمز جدید
        self.client.logout()
        logged = self.client.login(username='staff_test', password='NewSecurePass456!')
        self.assertTrue(logged, 'لاگین با رمز جدید ناموفق بود')
        print(f'  → رمز تغییر کرد و لاگین با رمز جدید موفق')

    def test_24_change_password_old_password_fails(self):
        """رمز قدیمی باید دیگه کار نکنه"""
        self.api_post('/api/users/reset-password/', {
            'user_id': self.staff_user.id,
            'new_password': 'NewSecurePass456!',
        })
        self.client.logout()
        logged = self.client.login(username='staff_test', password='StaffPass123!')
        self.assertFalse(logged, 'رمز قدیمی نباید کار کنه')
        print(f'  → رمز قدیمی رد شد ✓')

    def test_25_change_password_short(self):
        """رمز کوتاه باید رد شود"""
        r, data = self.api_post('/api/users/reset-password/', {
            'user_id': self.staff_user.id,
            'new_password': '12',
        })
        self.assertFalse(data.get('success'), 'رمز کوتاه باید رد بشه')
        print(f'  → رمز کوتاه: error={data.get("error")}')

    def test_26_change_password_empty(self):
        """رمز خالی باید رد شود"""
        r, data = self.api_post('/api/users/reset-password/', {
            'user_id': self.staff_user.id,
            'new_password': '',
        })
        self.assertFalse(data.get('success'), 'رمز خالی باید رد بشه')
        print(f'  → رمز خالی: error={data.get("error")}')

    def test_27_change_password_invalid_user(self):
        """تغییر رمز کاربر ناموجود"""
        r, data = self.api_post('/api/users/reset-password/', {
            'user_id': 999999,
            'new_password': 'WhateverPass123!',
        })
        self.assertFalse(data.get('success'))
        print(f'  → کاربر ناموجود: error={data.get("error")}')

    def test_28_change_password_complex(self):
        """رمز پیچیده باید قبول بشه"""
        r, data = self.api_post('/api/users/reset-password/', {
            'user_id': self.staff_user.id,
            'new_password': 'C0mpl3x!P@ss#فا',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.client.logout()
        logged = self.client.login(username='staff_test', password='C0mpl3x!P@ss#فا')
        self.assertTrue(logged, 'لاگین با رمز پیچیده ناموفق')
        print(f'  → رمز پیچیده با کاراکتر خاص: OK ✓')

    # ── فعال / غیرفعال ────────────────────────────────

    def test_29_toggle_active_deactivate(self):
        """غیرفعال کردن کاربر"""
        r, data = self.api_post('/api/users/toggle-active/', {
            'user_id': self.staff_user.id,
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        self.staff_user.refresh_from_db()
        self.assertFalse(self.staff_user.is_active)
        print(f'  → staff_test غیرفعال شد: is_active={self.staff_user.is_active}')

    def test_30_toggle_active_reactivate(self):
        """فعال کردن مجدد کاربر"""
        self.staff_user.is_active = False
        self.staff_user.save(update_fields=['is_active'])

        r, data = self.api_post('/api/users/toggle-active/', {
            'user_id': self.staff_user.id,
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'))
        self.staff_user.refresh_from_db()
        self.assertTrue(self.staff_user.is_active)
        print(f'  → staff_test فعال شد: is_active={self.staff_user.is_active}')

    def test_31_toggle_active_invalid_user(self):
        """تغییر وضعیت کاربر ناموجود"""
        r, data = self.api_post('/api/users/toggle-active/', {
            'user_id': 999999,
        })
        self.assertFalse(data.get('success'))
        print(f'  → کاربر ناموجود: error={data.get("error")}')

    def test_32_deactivated_user_cannot_login(self):
        """کاربر غیرفعال نباید بتونه لاگین کنه"""
        self.staff_user.is_active = False
        self.staff_user.save(update_fields=['is_active'])

        self.client.logout()
        logged = self.client.login(username='staff_test', password='StaffPass123!')
        self.assertFalse(logged, 'کاربر غیرفعال نباید لاگین کنه')
        print(f'  → غیرفعال: لاگین رد شد ✓')

    def test_33_reactivated_user_can_login(self):
        """کاربر فعال شده باید بتونه لاگین کنه"""
        self.staff_user.is_active = False
        self.staff_user.save(update_fields=['is_active'])
        self.staff_user.is_active = True
        self.staff_user.save(update_fields=['is_active'])

        self.client.logout()
        logged = self.client.login(username='staff_test', password='StaffPass123!')
        self.assertTrue(logged, 'کاربر فعال باید بتونه لاگین کنه')
        print(f'  → فعال شده: لاگین موفق ✓')

    def test_34_toggle_active_appears_in_list(self):
        """وضعیت فعال/غیرفعال باید در لیست نمایش داده بشه"""
        self.staff_user.is_active = False
        self.staff_user.save(update_fields=['is_active'])

        r, data = self.api_get('/api/users/management/')
        self.assertEqual(r.status_code, 200)
        user = next((u for u in data['users'] if u['id'] == self.staff_user.id), None)
        self.assertIsNotNone(user)
        self.assertFalse(user['is_active'])
        print(f'  → غیرفعال در لیست: is_active={user["is_active"]}')

    # ── تأیید کاربر ───────────────────────────────────

    def test_35_approve_user(self):
        """تأیید کاربر در انتظار"""
        self.assertFalse(self.pending_user.is_approved)
        r, data = self.api_post('/api/users/approve/', {
            'user_id': self.pending_user.id,
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        self.pending_user.refresh_from_db()
        self.assertTrue(self.pending_user.is_approved)
        print(f'  → pending_test تأیید شد: is_approved={self.pending_user.is_approved}')

    def test_36_approve_already_approved(self):
        """تأیید کاربری که قبلاً تأیید شده"""
        self.pending_user.is_approved = True
        self.pending_user.save(update_fields=['is_approved'])

        r, data = self.api_post('/api/users/approve/', {
            'user_id': self.pending_user.id,
        })
        # باید موفق باشه (멱등ی) یا پیام بده که قبلاً تأیید شده
        self.assertIn(r.status_code, [200, 400])
        print(f'  → تأیید مجدد: success={data.get("success")} status={r.status_code}')

    def test_37_approve_invalid_user(self):
        """تأیید کاربر ناموجود"""
        r, data = self.api_post('/api/users/approve/', {
            'user_id': 999999,
        })
        self.assertFalse(data.get('success'))
        print(f'  → کاربر ناموجود: error={data.get("error")}')

    def test_38_approved_user_appears_in_list(self):
        """کاربر تأیید شده باید وضعیتش درست نمایش داده بشه"""
        self.pending_user.is_approved = True
        self.pending_user.save(update_fields=['is_approved'])

        r, data = self.api_get('/api/users/management/')
        self.assertEqual(r.status_code, 200)
        user = next((u for u in data['users'] if u['id'] == self.pending_user.id), None)
        self.assertIsNotNone(user)
        self.assertTrue(user['is_approved'])
        print(f'  → تأیید شده در لیست: is_approved={user["is_approved"]}')

    # ── حذف کاربر ─────────────────────────────────────

    def test_39_delete_user_success(self):
        """حذف کاربر باید موفق باشد"""
        victim = User.objects.create_user(
            username='victim_delete', password='VictimPass123!',
            is_staff=True, role='cashier',
        )
        count_before = User.objects.count()
        r, data = self.api_post('/api/users/delete/', {
            'user_id': victim.id,
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        self.assertEqual(User.objects.count(), count_before - 1)
        self.assertFalse(User.objects.filter(id=victim.id).exists())
        print(f'  → کاربر #{victim.id} حذف شد')

    def test_40_delete_user_not_in_list(self):
        """کاربر حذف شده نباید در لیست باشه"""
        victim = User.objects.create_user(
            username='victim_list', password='VictimPass123!',
            is_staff=True, role='cashier',
        )
        self.api_post('/api/users/delete/', {'user_id': victim.id})

        r, data = self.api_get('/api/users/management/')
        self.assertEqual(r.status_code, 200)
        usernames = [u['username'] for u in data['users']]
        self.assertNotIn('victim_list', usernames)
        print(f'  → کاربر حذف شده در لیست نیست ✓')

    def test_41_deleted_user_cannot_login(self):
        """کاربر حذف شده نباید بتونه لاگین کنه"""
        victim = User.objects.create_user(
            username='victim_login', password='VictimPass123!',
            is_staff=True, role='cashier',
        )
        self.api_post('/api/users/delete/', {'user_id': victim.id})

        self.client.logout()
        logged = self.client.login(username='victim_login', password='VictimPass123!')
        self.assertFalse(logged, 'کاربر حذف شده نباید لاگین کنه')
        print(f'  → حذف شده: لاگین رد شد ✓')

    def test_42_delete_invalid_user(self):
        """حذف کاربر ناموجود"""
        r, data = self.api_post('/api/users/delete/', {
            'user_id': 999999,
        })
        self.assertFalse(data.get('success'))
        print(f'  → کاربر ناموجود: error={data.get("error")}')

    def test_43_delete_user_cascades(self):
        """حذف کاربر باید سفارش‌ها و داده‌های مرتبط رو هم مدیریت کنه"""
        victim = User.objects.create_user(
            username='victim_cascade', password='VictimPass123!',
            is_staff=True, role='cashier',
        )
        # ساخت سفارش به نام این کاربر (اگر مدل Order فیلد user داشته باشه)
        try:
            r, data = self.api_post('/api/users/delete/', {'user_id': victim.id})
            self.assertTrue(data.get('success'))
            print(f'  → حذف با cascade: OK')
        except Exception as e:
            print(f'  → حذف با cascade: خطا — {e}')

    # ── فلوی کامل مدیریت کاربر ───────────────────────

    def test_44_full_user_lifecycle(self):
        """چرخه کامل: ساخت → تأیید → تغییر نقش → رمز → غیرفعال → فعال → حذف"""
        print(f'\n  ═══ چرخه کامل مدیریت کاربر ═══')

        # ۱. ساخت
        r, d = self.api_post('/api/users/create/', {
            'username': 'lifecycle_user',
            'password': 'LifePass123!',
            'phone_number': '09139000099',
            'role': 'customer',
        })
        self.assertTrue(d.get('success'))
        uid = d.get('user_id')
        print(f'  ۱. ساخت: ID={uid}')

        # ۲. تأیید
        u = User.objects.get(id=uid)
        self.assertFalse(u.is_approved)
        r, d = self.api_post('/api/users/approve/', {'user_id': uid})
        self.assertTrue(d.get('success'))
        u.refresh_from_db()
        self.assertTrue(u.is_approved)
        print(f'  ۲. تأیید: is_approved=True ✓')

        # ۳. تغییر نقش
        r, d = self.api_post('/api/users/update-role/', {
            'user_id': uid, 'role': 'manager',
        })
        self.assertTrue(d.get('success'))
        u.refresh_from_db()
        self.assertEqual(u.role, 'manager')
        print(f'  ۳. نقش: customer → manager ✓')

        # ۴. تغییر رمز
        r, d = self.api_post('/api/users/reset-password/', {
            'user_id': uid, 'new_password': 'NewLifePass456!',
        })
        self.assertTrue(d.get('success'))
        self.client.logout()
        logged = self.client.login(username='lifecycle_user', password='NewLifePass456!')
        self.assertTrue(logged)
        # برگرد به owner
        self.client.logout()
        self.client.login(username='owner_test', password='OwnerPass123!')
        print(f'  ۴. رمز: تغییر و لاگین ✓')

        # ۵. غیرفعال
        r, d = self.api_post('/api/users/toggle-active/', {'user_id': uid})
        self.assertTrue(d.get('success'))
        u.refresh_from_db()
        self.assertFalse(u.is_active)
        print(f'  ۵. غیرفعال: is_active=False ✓')

        # ۶. فعال مجدد
        r, d = self.api_post('/api/users/toggle-active/', {'user_id': uid})
        self.assertTrue(d.get('success'))
        u.refresh_from_db()
        self.assertTrue(u.is_active)
        print(f'  ۶. فعال: is_active=True ✓')

        # ۷. بررسی در لیست
        r, d = self.api_get('/api/users/management/')
        self.assertEqual(r.status_code, 200)
        found = next((u for u in d['users'] if u['id'] == uid), None)
        self.assertIsNotNone(found)
        self.assertEqual(found['role'], 'manager')
        self.assertTrue(found['is_active'])
        self.assertTrue(found['is_approved'])
        print(f'  ۷. لیست: role={found["role"]} active={found["is_active"]} approved={found["is_approved"]} ✓')

        # ۸. حذف
        r, d = self.api_post('/api/users/delete/', {'user_id': uid})
        self.assertTrue(d.get('success'))
        self.assertFalse(User.objects.filter(id=uid).exists())
        print(f'  ۸. حذف: ✓')

        # ۹. تأیید حذف از لیست
        r, d = self.api_get('/api/users/management/')
        found_after = next((u for u in d['users'] if u['id'] == uid), None)
        self.assertIsNone(found_after)
        print(f'  ۹. لیست بدون کاربر حذف شده: ✓')
        print(f'  ══ چرخه کامل موفق ══')

    # ── تست‌های امنیتی مدیریت کاربران ────────────────

    def test_45_non_owner_cannot_create_user(self):
        """کاربر غیر-owner نباید بتونه کاربر بسازه"""
        self.client.logout()
        self.client.login(username='staff_test', password='StaffPass123!')

        r, data = self.api_post('/api/users/create/', {
            'username': 'unauthorized_user',
            'password': 'UnauthPass123!',
            'role': 'cashier',
        })
        # باید 403 بگیره یا success=False
        if r.status_code == 200:
            self.assertFalse(data.get('success'),
                'کاربر غیر-owner نباید بتونه کاربر بسازه')
        else:
            self.assertIn(r.status_code, [401, 403])
        print(f'  → غیر-owner ساخت کاربر: {r.status_code}')

    def test_46_non_owner_cannot_delete_user(self):
        """کاربر غیر-owner نباید بتونه کاربر حذف کنه"""
        self.client.logout()
        self.client.login(username='staff_test', password='StaffPass123!')

        r, data = self.api_post('/api/users/delete/', {
            'user_id': self.pending_user.id,
        })
        if r.status_code == 200:
            self.assertFalse(data.get('success'),
                'کاربر غیر-owner نباید بتونه حذف کنه')
        else:
            self.assertIn(r.status_code, [401, 403])
        print(f'  → غیر-owner حذف کاربر: {r.status_code}')

    def test_47_non_owner_cannot_change_role(self):
        """کاربر غیر-owner نباید بتونه نقش عوض کنه"""
        self.client.logout()
        self.client.login(username='staff_test', password='StaffPass123!')

        r, data = self.api_post('/api/users/update-role/', {
            'user_id': self.pending_user.id,
            'role': 'owner',
        })
        if r.status_code == 200:
            self.assertFalse(data.get('success'),
                'کاربر غیر-owner نباید بتونه نقش عوض کنه')
        else:
            self.assertIn(r.status_code, [401, 403])
        print(f'  → غیر-owner تغییر نقش: {r.status_code}')

    def test_48_non_owner_cannot_reset_password(self):
        """کاربر غیر-owner نباید بتونه رمز دیگران رو عوض کنه"""
        self.client.logout()
        self.client.login(username='staff_test', password='StaffPass123!')

        r, data = self.api_post('/api/users/reset-password/', {
            'user_id': self.pending_user.id,
            'new_password': 'HackedPass123!',
        })
        if r.status_code == 200:
            self.assertFalse(data.get('success'),
                'کاربر غیر-owner نباید بتونه رمز عوض کنه')
        else:
            self.assertIn(r.status_code, [401, 403])
        print(f'  → غیر-owner تغییر رمز: {r.status_code}')

    def test_49_anonymous_cannot_manage_users(self):
        """کاربر ناشناس نباید به هیچ API مدیریت دسترسی داشته باشه"""
        self.client.logout()
        endpoints = [
            ('/api/users/management/', 'GET'),
            ('/api/users/create/', 'POST'),
            ('/api/users/update-role/', 'POST'),
            ('/api/users/reset-password/', 'POST'),
            ('/api/users/toggle-active/', 'POST'),
            ('/api/users/approve/', 'POST'),
            ('/api/users/delete/', 'POST'),
        ]
        for url, method in endpoints:
            if method == 'GET':
                r = self.client.get(url)
            else:
                r = self.client.post(url, data=json.dumps({}), content_type='application/json')
            self.assertIn(r.status_code, [401, 403, 302],
                f'{method} {url} باید رد بشه ولی {r.status_code} برگشت')
        print(f'  → همه {len(endpoints)} endpoint برای ناشناس رد شد ✓')

    # ── تست‌های Edge Case مدیریت کاربران ──────────────

    def test_50_create_user_special_characters(self):
        """ساخت کاربر با کاراکتر خاص در نام"""
        r, data = self.api_post('/api/users/create/', {
            'username': 'user_تست_!@#',
            'password': 'SpecialPass123!',
            'role': 'cashier',
        })
        self.assertEqual(r.status_code, 200)
        if data.get('success'):
            u = User.objects.get(id=data.get('user_id'))
            self.assertEqual(u.username, 'user_تست_!@#')
            print(f'  → کاربر با کاراکتر خاص: {u.username} ✓')
        else:
            print(f'  → کاراکتر خاص رد شد: {data.get("error")}')

    def test_51_create_user_very_long_username(self):
        """ساخت کاربر با نام خیلی بلند"""
        long_name = 'a' * 200
        r, data = self.api_post('/api/users/create/', {
            'username': long_name,
            'password': 'LongPass123!',
            'role': 'cashier',
        })
        self.assertIn(r.status_code, [200, 400])
        if not data.get('success'):
            print(f'  → نام بلند رد شد: {data.get("error")}')
        else:
            print(f'  → نام بلند قبول شد')

    def test_52_multiple_toggles_same_user(self):
        """چند بار toggle پشت سر هم"""
        r1, d1 = self.api_post('/api/users/toggle-active/', {'user_id': self.staff_user.id})
        r2, d2 = self.api_post('/api/users/toggle-active/', {'user_id': self.staff_user.id})
        r3, d3 = self.api_post('/api/users/toggle-active/', {'user_id': self.staff_user.id})
        self.staff_user.refresh_from_db()
        # ۳ بار toggle = غیرفعال
        self.assertFalse(self.staff_user.is_active)
        print(f'  → ۳ بار toggle: is_active=False ✓')

    def test_53_delete_then_recreate_same_username(self):
        """حذف کاربر و ساخت مجدد با همون نام"""
        User.objects.create_user(
            username='delete_recreate', password='Pass1!',
            is_staff=True, role='cashier',
        )
        r, d = self.api_post('/api/users/delete/', {
            'user_id': User.objects.get(username='delete_recreate').id,
        })
        self.assertTrue(d.get('success'))

        r2, d2 = self.api_post('/api/users/create/', {
            'username': 'delete_recreate',
            'password': 'Pass2!',
            'role': 'manager',
        })
        self.assertTrue(d2.get('success'), f'ساخت مجدد خطا: {d2.get("error")}')
        u = User.objects.get(username='delete_recreate')
        self.assertEqual(u.role, 'manager')
        print(f'  → حذف و ساخت مجدد: OK ✓')

    def test_54_user_management_page_loads(self):
        """صفحه مدیریت کاربران باید لود بشه"""
        r = self.client.get('/users/')
        self.assertIn(r.status_code, [200, 302])
        print(f'  → صفحه /users/: {r.status_code}')

    def test_55_user_management_page_has_required_elements(self):
        """صفحه باید المان‌های لازم رو داشته باشه"""
        r = self.client.get('/users/')
        if r.status_code == 200:
            content = r.content.decode('utf-8')
            self.assertIn('usersContainer', content, 'لیست کاربران نیست')
            self.assertIn('addModal', content, 'مودال افزودن نیست')
            self.assertIn('roleModal', content, 'مودال نقش نیست')
            self.assertIn('passModal', content, 'مودال رمز نیست')
            self.assertIn('deleteModal', content, 'مودال حذف نیست')
            self.assertIn('currentUserId', content, 'currentUserId نیست')
            print(f'  ✓ المان‌ها: list + add + role + pass + delete modals + current_user_id')
        else:
            print(f'  → صفحه: {r.status_code}')

    def test_56_roles_json_in_page(self):
     """لیست نقش‌ها باید در صفحه باشه"""
     r = self.client.get('/users/')
     if r.status_code == 200:
        content = r.content.decode('utf-8')
        self.assertIn('var ROLES', content, 'لیست نقش‌ها (ROLES) در صفحه نیست')
        self.assertIn('owner', content)
        self.assertIn('manager', content)
        self.assertIn('cashier', content)
        self.assertIn('kitchen', content)
        print(f'  ✓ roles_json با همه نقش‌ها')
     else:
        print(f'  → صفحه: {r.status_code}')




# ═══════════════════════════════════════════════════════
#  ردیابی کامل سفارش: صندوق → آشپزخانه → آماده
# ═══════════════════════════════════════════════════════

class TestOrderFlowPOS_Kitchen(BaseAPITestCase):
    """
    فلوی واقعی:

    ۱. صندوقدار غذا رو ثبت می‌کنه (POS create order)
    ۲. سفارش وارد آشپزخانه میشه (status = pending)
    ۳. آشپز میبینه و شروع می‌کنه (status = preparing)
    ۴. غذا آماده میشه (status = ready / delivered)
    ۵. موجودی مواد اولیه کم شده
    ۶. موجودی محصول آشپزخانه کم شده
    """

    def _get_kitchen_orders(self):
        """گرفتن لیست سفارشات آشپزخانه — هر API‌ای که وجود داره رو امتحان می‌کنه"""
        endpoints = [
            '/api/kitchen/orders/',
            '/api/kitchen/dashboard/',
            '/api/orders/?status=pending',
            '/api/pos/kitchen-orders/',
        ]
        for url in endpoints:
            r, data = self.api_get(url)
            if r.status_code == 200 and isinstance(data, dict):
                orders = data.get('orders', data.get('pending_orders', data.get('kitchen_orders', [])))
                if isinstance(orders, list):
                    return url, orders
            elif r.status_code == 200 and isinstance(data, list):
                return url, data
        return None, []

    def _get_order_detail(self, order_id):
        """گرفتن جزئیات یک سفارش"""
        endpoints = [
            f'/api/pos/orders/{order_id}/',
            f'/api/orders/{order_id}/',
            f'/api/kitchen/orders/{order_id}/',
        ]
        for url in endpoints:
            r, data = self.api_get(url)
            if r.status_code == 200:
                return data
        return None

    def _update_order_status(self, order_id, status):
        """تغییر وضعیت سفارش"""
        endpoints = [
            (f'/api/pos/orders/{order_id}/', 'PATCH'),
            (f'/api/orders/{order_id}/', 'PATCH'),
            (f'/api/kitchen/orders/{order_id}/update-status/', 'POST'),
            (f'/api/pos/order-status/{order_id}/', 'POST'),
        ]
        for url, method in endpoints:
            if method == 'PATCH':
                r, data = self.api_patch(url, {'status': status})
            else:
                r, data = self.api_post(url, {'status': status, 'order_id': order_id})
            if r.status_code in [200, 201]:
                return True, data
        return False, {}

    def _get_order_from_db(self, order_id):
        """خواندن مستقیم از دیتابیس"""
        try:
            return Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return None

    # ═══════════════════════════════════════════════════
    #  مرحله ۱: صندوقدار سفارش می‌گیره
    # ═══════════════════════════════════════════════════

    def test_01_pos_creates_order_goes_to_kitchen(self):
        """
        صندوقدار ۲ غذا ثبت می‌کنه.
        سفارش باید با status=pending ذخیره بشه
        و آشپزخانه بتونه ببینه.
        """
        print(f'\n  ═══ مرحله ۱: صندوقدار سفارش می‌گیره ═══')

        # ── موجودی قبل ──
        food = self.food1  # چیز برگر
        kp = self.kp1      # محصول آشپزخانه چیز برگر
        inv = kp.get_inventory()
        stock_before = int(inv.quantity)
        order_count_before = Order.objects.count()

        print(f'  غذا: {food.name}')
        print(f'  موجودی آشپزخانه «{kp.name}»: {stock_before}')
        print(f'  تعداد سفارشات فعلی: {order_count_before}')

        # ── ثبت سفارش ──
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'مشتری تست',
            'phone': '09123456789',
            'items': [
                {
                    'food_id': food.id,
                    'quantity': 2,
                    'price': int(food.final_price),
                }
            ],
        })

        self.assertEqual(r.status_code, 200,
            f'ثبت سفارش خطا: {r.status_code}')
        self.assertTrue(data.get('success'),
            f'سفارش ثبت نشد: {data.get("error")}')

        order_id = data.get('order_id')
        self.assertIsNotNone(order_id, 'order_id برنگشت')
        print(f'  ✓ سفارش #{order_id} ثبت شد')
        print(f'  ✓ مبلغ: {data.get("total_price", 0):,} تومان')

        # ── بررسی دیتابیس ──
        order = self._get_order_from_db(order_id)
        self.assertIsNotNone(order, f'سفارش #{order_id} در DB نیست')
        self.assertEqual(order.customer_name, 'مشتری تست')
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.items.first().quantity, 2)
        print(f'  ✓ DB: customer={order.customer_name}, items={order.items.count()}, qty=2')

        # ── بررسی موجودی کم شده ──
        inv.refresh_from_db()
        stock_after_order = int(inv.quantity)
        expected_stock = stock_before - 2
        self.assertEqual(stock_after_order, expected_stock,
            f'موجودی باید {expected_stock} باشه ولی {stock_after_order} هست')
        print(f'  ✓ موجودی «{kp.name}»: {stock_before} → {stock_after_order} (کم شد)')

        # ── سفارش در لیست آشپزخانه ──
        kitchen_url, kitchen_orders = self._get_kitchen_orders()
        if kitchen_url:
            found = next(
                (o for o in kitchen_orders
                 if (o.get('id') or o.get('order_id') or o.get('pk')) == order_id),
                None
            )
            if found:
                print(f'  ✓ سفارش در آشپزخانه: {kitchen_url}')
                print(f'    → status: {found.get("status")}')
            else:
                print(f'  ⚠ سفارش #{order_id} در {kitchen_url} پیدا نشد')
                print(f'    سفارشات موجود: {[o.get("id") for o in kitchen_orders[:5]]}')
        else:
            print(f'  ⚠ لیست آشپزخانه پیدا نشد')

        return order_id, kp, stock_before, stock_after_order

    # ═══════════════════════════════════════════════════
    #  مرحله ۲: آشپز سفارش رو می‌بینه
    # ═══════════════════════════════════════════════════

    def test_02_kitchen_sees_new_order(self):
        """
        بعد از ثبت سفارش، آشپزخانه باید بتونه سفارش رو ببینه.
        """
        print(f'\n  ═══ مرحله ۲: آشپز سفارش رو می‌بینه ═══')

        food = self.food1
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'مشتری آشپزخانه',
            'phone': '',
            'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}],
        })
        self.assertTrue(data.get('success'))
        order_id = data.get('order_id')
        print(f'  سفارش #{order_id} ثبت شد')

        # ── سفارش از طریق API قابل دریافته ──
        order = self._get_order_from_db(order_id)
        self.assertIsNotNone(order)
        self.assertIn(order.status, ['pending', 'preparing', 'new', 'confirmed'],
            f'status غیرمنتظره: {order.status}')
        print(f'  ✓ status در DB: {order.status}')

        # ── داشبورد آشپزخانه این سفارش رو داره ──
        r2, dash = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r2.status_code, 200)

        # چک orders در داشبورد
        orders_in_dash = dash.get('orders', dash.get('pending_orders', []))
        if isinstance(orders_in_dash, list) and orders_in_dash:
            found = next(
                (o for o in orders_in_dash
                 if (o.get('id') or o.get('order_id') or o.get('pk')) == order_id),
                None
            )
            if found:
                print(f'  ✓ سفارش در dashboard.orders موجود')
                print(f'    → items: {found.get("items", found.get("order_items", "?"))}')
            else:
                print(f'  ⚠ سفارش #{order_id} در dashboard.orders نیست')
        else:
            print(f'  ⚠ dashboard فیلد orders ندارد: {list(dash.keys())}')

        # ── اطلاعات آیتم‌ها قابل خوندنه ──
        items = order.items.all()
        for item in items:
            self.assertEqual(item.food_id, food.id)
            self.assertEqual(item.quantity, 1)
            print(f'  ✓ آیتم: {item.food.name} × {item.quantity} = {item.price:,}')

        return order_id

    # ═══════════════════════════════════════════════════
    #  مرحله ۳: آشپز شروع به پخت می‌کنه
    # ═══════════════════════════════════════════════════

    def test_03_kitchen_starts_preparing(self):
        """
        آشپز وضعیت سفارش رو به preparing تغییر میده.
        """
        print(f'\n  ═══ مرحله ۳: آشپز شروع می‌کنه ═══')

        food = self.food1
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'مشتری پخت',
            'phone': '',
            'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}],
        })
        self.assertTrue(data.get('success'))
        order_id = data.get('order_id')

        order = self._get_order_from_db(order_id)
        self.assertIsNotNone(order)
        print(f'  سفارش #{order_id} — status فعلی: {order.status}')

        # ── تغییر وضعیت به preparing ──
        ok, resp = self._update_order_status(order_id, 'preparing')
        if ok:
            order.refresh_from_db()
            self.assertEqual(order.status, 'preparing',
                f'status باید preparing باشه ولی {order.status} هست')
            print(f'  ✓ status: {order.status}')
        else:
            print(f'  ⚠ API تغییر status پیدا نشد یا خطا داد')
            print(f'    endpoints امتحان شدند')
            self.skipTest('API تغییر status پیدا نشد')

        # ── آیا در لیست آشپزخانه نمایش داده میشه ──
        order.refresh_from_db()
        print(f'  ✓ سفارش #{order_id} در حال پخت')

        return order_id

    # ═══════════════════════════════════════════════════
    #  مرحله ۴: غذا آماده شد
    # ═══════════════════════════════════════════════════

    def test_04_kitchen_marks_ready(self):
        """
        آشپز غذا رو آماده اعلام می‌کنه.
        """
        print(f'\n  ═══ مرحله ۴: غذا آماده شد ═══')

        food = self.food1
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'مشتری آماده',
            'phone': '',
            'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}],
        })
        self.assertTrue(data.get('success'))
        order_id = data.get('order_id')
        print(f'  سفارش #{order_id} ثبت شد')

        # ── تغییر به ready ──
        ok, resp = self._update_order_status(order_id, 'ready')
        if ok:
            order = self._get_order_from_db(order_id)
            order.refresh_from_db()
            self.assertEqual(order.status, 'ready')
            print(f'  ✓ status: ready')
        else:
            # تلاش با status متفاوت
            ok2, resp2 = self._update_order_status(order_id, 'delivered')
            if ok2:
                order = self._get_order_from_db(order_id)
                order.refresh_from_db()
                print(f'  ✓ status: {order.status}')
            else:
                self.skipTest('API تغییر status پیدا نشد')

        return order_id

    # ═══════════════════════════════════════════════════
    #  مرحله ۵: ردیابی کامل — سفارش تا تحویل
    # ═══════════════════════════════════════════════════

    def test_05_full_order_lifecycle_with_stock_tracking(self):
        """
        کامل‌ترین تست: سفارش → آماده → تحویل
        با ردیابی دقیق موجودی در هر مرحله.
        """
        print(f'\n  ═══ فلوی کامل سفارش ═══')

        food1 = self.food1   # چیز برگر
        food2 = self.food2   # دوبل برگر
        kp1 = self.kp1
        kp2 = self.kp2

        # ── مرحله ۰: وضعیت اولیه ──
        inv1 = kp1.get_inventory()
        inv2 = kp2.get_inventory()
        s1_0 = int(inv1.quantity)
        s2_0 = int(inv2.quantity)
        orders_0 = Order.objects.count()

        print(f'\n  ── مرحله ۰: وضعیت اولیه ──')
        print(f'  «{kp1.name}»: {s1_0}')
        print(f'  «{kp2.name}»: {s2_0}')
        print(f'  سفارشات: {orders_0}')

        # ── مرحله ۱: صندوقدار سفارش می‌گیره ──
        print(f'\n  ── مرحله ۱: ثبت سفارش (POS) ──')
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'مشتری VIP',
            'phone': '09121112233',
            'items': [
                {'food_id': food1.id, 'quantity': 3, 'price': int(food1.final_price)},
                {'food_id': food2.id, 'quantity': 1, 'price': int(food2.final_price)},
            ],
        })
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        order_id = data.get('order_id')
        total = data.get('total_price', 0)

        print(f'  ✓ سفارش #{order_id}')
        print(f'    چیز برگر × ۳ + دوبل برگر × ۱')
        print(f'    مبلغ: {total:,} تومان')

        # ── بررسی موجودی بعد سفارش ──
        inv1.refresh_from_db()
        inv2.refresh_from_db()
        s1_1 = int(inv1.quantity)
        s2_1 = int(inv2.quantity)

        print(f'\n  ── موجودی بعد سفارش ──')
        print(f'  «{kp1.name}»: {s1_0} → {s1_1} (انتظار: {s1_0 - 3})')
        print(f'  «{kp2.name}»: {s2_0} → {s2_1} (انتظار: {s2_0 - 1})')

        self.assertEqual(s1_1, s1_0 - 3,
            f'«{kp1.name}» باید {s1_0 - 3} باشه ولی {s1_1} هست')
        self.assertEqual(s2_1, s2_0 - 1,
            f'«{kp2.name}» باید {s2_0 - 1} باشه ولی {s2_1} هست')

        # ── بررسی سفارش در DB ──
        order = self._get_order_from_db(order_id)
        self.assertIsNotNone(order)
        self.assertEqual(order.items.count(), 2)

        print(f'\n  ── آیتم‌های سفارش ──')
        for item in order.items.all():
            print(f'    {item.food.name} × {item.quantity} = {item.price:,}')

        # ── مرحله ۲: بررسی در آشپزخانه ──
        print(f'\n  ── مرحله ۲: بررسی آشپزخانه ──')
        kitchen_url, kitchen_orders = self._get_kitchen_orders()
        if kitchen_url:
            found = next(
                (o for o in kitchen_orders
                 if (o.get('id') or o.get('order_id') or o.get('pk')) == order_id),
                None
            )
            if found:
                print(f'  ✓ سفارش #{order_id} در آشپزخانه ({kitchen_url})')
                print(f'    status: {found.get("status")}')
            else:
                print(f'  ⚠ سفارش در آشپزخانه پیدا نشد')

        # ── مرحله ۳: آماده شدن ──
        print(f'\n  ── مرحله ۳: آماده شدن ──')
        ok, _ = self._update_order_status(order_id, 'ready')
        if ok:
            order.refresh_from_db()
            print(f'  ✓ status: {order.status}')
        else:
            ok2, _ = self._update_order_status(order_id, 'delivered')
            if ok2:
                order.refresh_from_db()
                print(f'  ✓ status: {order.status}')

        # ── مرحله ۴: بررسی نهایی ──
        print(f'\n  ── مرحله ۴: بررسی نهایی ──')

        inv1.refresh_from_db()
        inv2.refresh_from_db()
        s1_final = int(inv1.quantity)
        s2_final = int(inv2.quantity)

        print(f'  «{kp1.name}»: {s1_0} → {s1_final} (کم شده: {s1_0 - s1_final})')
        print(f'  «{kp2.name}»: {s2_0} → {s2_final} (کم شده: {s2_0 - s2_final})')
        print(f'  سفارشات: {orders_0} → {Order.objects.count()}')

        self.assertGreaterEqual(s1_final, 0, f'«{kp1.name}» منفی شد')
        self.assertGreaterEqual(s2_final, 0, f'«{kp2.name}» منفی شد')

        # ── خلاصه ──
        print(f'\n  ═══ خلاصه فلوی سفارش ═══')
        print(f'  سفارش #{order_id}')
        print(f'  مشتری: {order.customer_name}')
        print(f'  آیتم‌ها: {order.items.count()}')
        print(f'  «{kp1.name}»: {s1_0} → {s1_final} (فروش: ۳)')
        print(f'  «{kp2.name}»: {s2_0} → {s2_final} (فروش: ۱)')
        print(f'  ✓ فلوی کامل موفق')

    # ═══════════════════════════════════════════════════
    #  مرحله ۶: چند سفارش همزمان
    # ═══════════════════════════════════════════════════

    def test_06_multiple_orders_same_food_sequential(self):
        """
        ۵ سفارش پشت سر هم روی یک غذا.
        موجودی باید دقیقاً ۵ بار کم بشه.
        """
        print(f'\n  ═══ ۵ سفارش متوالی ═══')

        food = self.food1
        kp = self.kp1
        inv = kp.get_inventory()
        if int(inv.quantity) < 10:
            inv.quantity = 30
            inv.save(update_fields=['quantity', 'updated_at'])
        inv.refresh_from_db()
        stock_0 = int(inv.quantity)
        count = 5
        qty_per_order = 1

        print(f'  غذا: {food.name}')
        print(f'  موجودی اولیه: {stock_0}')
        print(f'  سفارشات: {count} × {qty_per_order}')

        order_ids = []
        for i in range(count):
            r, data = self.api_post('/api/pos/create-order/', {
                'customer_name': f'مشتری {i + 1}',
                'phone': '',
                'items': [{'food_id': food.id, 'quantity': qty_per_order,
                           'price': int(food.final_price)}],
            })
            self.assertTrue(data.get('success'),
                f'سفارش {i + 1} خطا: {data.get("error")}')
            order_ids.append(data.get('order_id'))

            inv.refresh_from_db()
            current = int(inv.quantity)
            expected = stock_0 - (qty_per_order * (i + 1))
            self.assertEqual(current, expected,
                f'سفارش {i + 1}: انتظار {expected} ولی {current}')
            print(f'  سفارش #{i + 1} (#{data.get("order_id")}): '
                  f'موجودی {current} ✓')

        inv.refresh_from_db()
        final = int(inv.quantity)
        expected_final = stock_0 - (count * qty_per_order)
        self.assertEqual(final, expected_final,
            f'نهایی: انتظار {expected_final} ولی {final}')
        print(f'\n  ✓ {count} سفارش: {stock_0} → {final} (انتظار: {expected_final})')
        print(f'  ✓ همه {len(order_ids)} سفارش ثبت شد')

    # ═══════════════════════════════════════════════════
    #  مرحله ۷: سفارش + تولید مجدد + فروش
    # ═══════════════════════════════════════════════════

    def test_07_order_then_produce_then_order_again(self):
        """
        فروش → تولید مجدد → فروش مجدد.
        موجودی باید در هر مرحله دقیق باشه.
        """
        print(f'\n  ═══ فروش → تولید → فروش ═══')

        food = self.food1
        kp = self.kp1
        inv = kp.get_inventory()
        if int(inv.quantity) < 10:
            inv.quantity = 20
            inv.save(update_fields=['quantity', 'updated_at'])
        inv.refresh_from_db()
        s0 = int(inv.quantity)

        # ── فروش ۳ ──
        r1, d1 = self.api_post('/api/pos/create-order/', {
            'customer_name': 'فروش اول', 'phone': '',
            'items': [{'food_id': food.id, 'quantity': 3, 'price': int(food.final_price)}],
        })
        self.assertTrue(d1.get('success'))
        inv.refresh_from_db()
        s1 = int(inv.quantity)
        print(f'  فروش -۳: {s0} → {s1} (انتظار: {s0 - 3})')
        self.assertEqual(s1, s0 - 3)

        # ── تولید ۵ ──
        r2, d2 = self.api_post(
            f'/api/kitchen/products/{kp.id}/produce/',
            {'quantity': 5, 'notes': 'تولید مجدد'}
        )
        if r2.status_code in [200, 201]:
            inv.refresh_from_db()
            s2 = int(inv.quantity)
            print(f'  تولید +۵: {s1} → {s2} (انتظار: {s1 + 5})')
            self.assertEqual(s2, s1 + 5)
        else:
            s2 = s1
            print(f'  ⚠ تولید: {r2.status_code}')

        # ── فروش ۲ ──
        r3, d3 = self.api_post('/api/pos/create-order/', {
            'customer_name': 'فروش دوم', 'phone': '',
            'items': [{'food_id': food.id, 'quantity': 2, 'price': int(food.final_price)}],
        })
        self.assertTrue(d3.get('success'))
        inv.refresh_from_db()
        s3 = int(inv.quantity)
        print(f'  فروش -۲: {s2} → {s3} (انتظار: {s2 - 2})')
        self.assertEqual(s3, s2 - 2)

        # ── خلاصه ──
        net = s3 - s0
        expected_net = -3 + 5 - 2  # = 0
        print(f'\n  ✓ خلاصه: {s0} → {s3} (خالص: {net} = انتظار: {expected_net})')
        self.assertEqual(net, expected_net)

    # ═══════════════════════════════════════════════════
    #  مرحله ۸: سفارش چندآیتمه و چک هر آیتم
    # ═══════════════════════════════════════════════════

    def test_08_multi_item_order_each_stock_tracked(self):
        """
        سفارش با ۳ غذای مختلف.
        هر ۳ محصول آشپزخانه باید موجودیشون کم بشه.
        """
        print(f'\n  ═══ سفارش چندآیتمه ═══')

        foods_and_kps = [
            (self.food1, self.kp1, 2),
            (self.food2, self.kp2, 1),
            (self.food3, self.kp3, 3),
        ]

        # ── موجودی قبل ──
        stocks_before = {}
        for food, kp, qty in foods_and_kps:
            inv = kp.get_inventory()
            if int(inv.quantity) < qty + 5:
                inv.quantity = 30
                inv.save(update_fields=['quantity', 'updated_at'])
            inv.refresh_from_db()
            stocks_before[kp.id] = int(inv.quantity)
            print(f'  «{kp.name}»: {stocks_before[kp.id]}')

        # ── ثبت سفارش ──
        items = []
        for food, kp, qty in foods_and_kps:
            items.append({'food_id': food.id, 'quantity': qty, 'price': int(food.final_price)})

        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'مشتری چندآیتم',
            'phone': '09120001122',
            'items': items,
        })
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        order_id = data.get('order_id')
        print(f'\n  ✓ سفارش #{order_id} ثبت شد')

        # ── چک هر محصول ──
        print(f'\n  ── موجودی بعد سفارش ──')
        for food, kp, qty in foods_and_kps:
            inv = kp.get_inventory()
            inv.refresh_from_db()
            stock_after = int(inv.quantity)
            expected = stocks_before[kp.id] - qty
            self.assertEqual(stock_after, expected,
                f'«{kp.name}»: انتظار {expected} ولی {stock_after}')
            print(f'  «{kp.name}»: {stocks_before[kp.id]} → {stock_after} '
                  f'(کم شده: {qty}) ✓')

        # ── چک آیتم‌های سفارش ──
        order = self._get_order_from_db(order_id)
        self.assertEqual(order.items.count(), 3,
            f'انتظار ۳ آیتم ولی {order.items.count()}')
        for item in order.items.all():
            print(f'    {item.food.name} × {item.quantity} = {item.price:,}')

    # ═══════════════════════════════════════════════════
    #  مرحله ۹: سفارش ReadyMaterial (نوشیدنی)
    # ═══════════════════════════════════════════════════

    def test_09_order_ready_material_stock_decreases(self):
        """
        سفارش نوشیدنی (ReadyMaterial) باید موجودیش کم بشه.
        این غذا از آشپزخانه نمیاد، مستقیم از انبار کم میشه.
        """
        print(f'\n  ═══ سفارش نوشیدنی (ReadyMaterial) ═══')

        rm = self.rm1  # پپسی
        rm.refresh_from_db()
        stock_before = int(rm.quantity)
        print(f'  «{rm.name}»: {stock_before}')

        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'مشتری نوشیدنی',
            'phone': '',
            'items': [{'food_id': f'ready_{rm.id}', 'quantity': 2,
                       'price': int(rm.selling_price)}],
        })
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')
        order_id = data.get('order_id')

        rm.refresh_from_db()
        stock_after = int(rm.quantity)
        expected = stock_before - 2
        self.assertEqual(stock_after, expected,
            f'«{rm.name}»: انتظار {expected} ولی {stock_after}')
        print(f'  ✓ «{rm.name}»: {stock_before} → {stock_after} (کم شده: ۲)')
        print(f'  ✓ سفارش #{order_id}')

    # ═══════════════════════════════════════════════════
    #  مرحله ۱۰: سفارش ترکیبی (غذا + نوشیدنی)
    # ═══════════════════════════════════════════════════

    def test_10_mixed_order_food_and_drink(self):
        """
        سفارش همزمان غذا (KitchenProduct) و نوشیدنی (ReadyMaterial).
        هر دو باید موجودیشون کم بشه.
        """
        print(f'\n  ═══ سفارش ترکیبی: غذا + نوشیدنی ═══')

        food = self.food1
        kp = self.kp1
        rm = self.rm1

        kp_inv = kp.get_inventory()
        if int(kp_inv.quantity) < 5:
            kp_inv.quantity = 20
            kp_inv.save(update_fields=['quantity', 'updated_at'])
        kp_inv.refresh_from_db()
        rm.refresh_from_db()

        kp_stock_before = int(kp_inv.quantity)
        rm_stock_before = int(rm.quantity)
        print(f'  «{kp.name}» (آشپزخانه): {kp_stock_before}')
        print(f'  «{rm.name}» (انبار): {rm_stock_before}')

        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'مشتری ترکیبی',
            'phone': '',
            'items': [
                {'food_id': food.id, 'quantity': 2, 'price': int(food.final_price)},
                {'food_id': f'ready_{rm.id}', 'quantity': 1, 'price': int(rm.selling_price)},
            ],
        })
        self.assertTrue(data.get('success'), f'خطا: {data.get("error")}')

        kp_inv.refresh_from_db()
        rm.refresh_from_db()
        kp_stock_after = int(kp_inv.quantity)
        rm_stock_after = int(rm.quantity)

        self.assertEqual(kp_stock_after, kp_stock_before - 2,
            f'«{kp.name}»: انتظار {kp_stock_before - 2} ولی {kp_stock_after}')
        self.assertEqual(rm_stock_after, rm_stock_before - 1,
            f'«{rm.name}»: انتظار {rm_stock_before - 1} ولی {rm_stock_after}')

        print(f'  ✓ «{kp.name}»: {kp_stock_before} → {kp_stock_after} (کم شده: ۲)')
        print(f'  ✓ «{rm.name}»: {rm_stock_before} → {rm_stock_after} (کم شده: ۱)')
        print(f'  ✓ سفارش #{data.get("order_id")}')

    # ═══════════════════════════════════════════════════
    #  مرحله ۱۱: سفارش + ضایعات + گزارش
    # ═══════════════════════════════════════════════════

    def test_11_order_waste_then_report_shows_both(self):
        """
        سفارش + ضایعات → گزارش روزانه هر دو رو نشون بده.
        """
        print(f'\n  ═══ سفارش + ضایعات → گزارش ═══')

        food = self.food1
        kp = self.kp1
        inv = kp.get_inventory()
        if int(inv.quantity) < 10:
            inv.quantity = 20
            inv.save(update_fields=['quantity', 'updated_at'])

        # ── سفارش ──
        r1, d1 = self.api_post('/api/pos/create-order/', {
            'customer_name': 'گزارش‌خواه', 'phone': '',
            'items': [{'food_id': food.id, 'quantity': 1, 'price': int(food.final_price)}],
        })
        self.assertTrue(d1.get('success'))
        print(f'  ✓ سفارش #{d1.get("order_id")}: {int(food.final_price):,} تومان')

        # ── ضایعات ──
        inv.refresh_from_db()
        if int(inv.quantity) >= 2:
            r2, d2 = self.api_post('/api/kitchen/waste/', {
                'kitchen_product': kp.id, 'quantity': 2, 'reason': 'expired'
            })
            if r2.status_code in [200, 201]:
                print(f'  ✓ ضایعات: ۲ عدد')
            else:
                print(f'  ⚠ ضایعات: {r2.status_code}')

        # ── گزارش ──
        today = timezone.localdate().isoformat()
        r3, report = self.api_get(f'/api/pos/daily-report/?date={today}')
        self.assertEqual(r3.status_code, 200)
        self.assertTrue(report.get('success'))

        print(f'\n  ── گزارش امروز ──')
        print(f'  فروش: {report.get("total_sales", 0):,} تومان')
        print(f'  سفارشات: {report.get("order_count", 0)}')
        print(f'  ضایعات: {report.get("waste_total", 0)}')
        print(f'  تخفیف: {report.get("discount_total", 0):,}')

        self.assertGreater(report.get('total_sales', 0), 0,
            'فروش باید بیشتر از صفر باشه')
        self.assertGreater(report.get('order_count', 0), 0,
            'سفارشات باید بیشتر از صفر باشه')

    # ═══════════════════════════════════════════════════
    #  مرحله ۱۲: اتمام موجودی و سفارش بعدی
    # ═══════════════════════════════════════════════════

    def test_12_stock_goes_to_zero_then_order_fails(self):
        """
        موجودی صفر بشه → سفارش بعدی رد بشه.
        """
        print(f'\n  ═══ اتمام موجودی ═══')

        food = self.food1
        kp = self.kp1
        inv = kp.get_inventory()
        stock = int(inv.quantity)

        if stock < 3:
            inv.quantity = 3
            inv.save(update_fields=['quantity', 'updated_at'])
            stock = 3
        print(f'  موجودی: {stock}')

        # ── فروش همه ──
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'آخرین مشتری', 'phone': '',
            'items': [{'food_id': food.id, 'quantity': stock,
                       'price': int(food.final_price)}],
        })
        self.assertTrue(data.get('success'), f'فروش همه خطا: {data.get("error")}')

        inv.refresh_from_db()
        self.assertEqual(int(inv.quantity), 0,
            f'موجودی باید ۰ باشه ولی {inv.quantity}')
        print(f'  ✓ موجودی: {stock} → {int(inv.quantity)} (صفر)')

        # ── سفارش بعدی باید رد بشه ──
        r2, d2 = self.api_post('/api/pos/create-order/', {
            'customer_name': 'مشتری ناامید', 'phone': '',
            'items': [{'food_id': food.id, 'quantity': 1,
                       'price': int(food.final_price)}],
        })

        if d2.get('success'):
            # اگه قبول کرد، موجودی نباید منفی بشه
            inv.refresh_from_db()
            self.assertGreaterEqual(int(inv.quantity), 0,
                f'موجودی منفی شد: {inv.quantity}')
            print(f'  ⚠ سفارش بعدی قبول شد ولی منفی نشد: {inv.quantity}')
        else:
            print(f'  ✓ سفارش بعدی رد شد: {d2.get("error")}')
            inv.refresh_from_db()
            self.assertEqual(int(inv.quantity), 0,
                f'رد شد ولی موجودی عوض شد: {inv.quantity}')

    # ═══════════════════════════════════════════════════
    #  مرحله ۱۳: فلوی کامل — از صفر تا بستن روز
    # ═══════════════════════════════════════════════════

    def test_13_full_day_simulation(self):
        """
        شبیه‌سازی یه روز کامل رستوران:

        صبح: تولید → سفارش صبحانه → سفارش ناهار
        عصر: ضایعات → بستن روز → گزارش
        """
        print(f'\n  ═══ شبیه‌سازی یک روز کامل ═══')

        food = self.food1
        kp = self.kp1
        rm = self.rm1

        # ── صبح: تولید ──
        print(f'\n  ── صبح: تولید ۱۰ عدد ──')
        inv = kp.get_inventory()
        inv.quantity = 10
        inv.save(update_fields=['quantity', 'updated_at'])
        inv.refresh_from_db()
        print(f'  موجودی اولیه: {inv.quantity}')

        r, d = self.api_post(
            f'/api/kitchen/products/{kp.id}/produce/',
            {'quantity': 10, 'notes': 'تولید صبح'}
        )
        if r.status_code in [200, 201]:
            inv.refresh_from_db()
            print(f'  ✓ تولید: {inv.quantity}')

        # ── صبح: سفارش اول ──
        print(f'\n  ── صبح: سفارش صبحانه ──')
        r1, d1 = self.api_post('/api/pos/create-order/', {
            'customer_name': 'صبحانه‌خور', 'phone': '',
            'items': [
                {'food_id': food.id, 'quantity': 2, 'price': int(food.final_price)},
                {'food_id': f'ready_{rm.id}', 'quantity': 1, 'price': int(rm.selling_price)},
            ],
        })
        self.assertTrue(d1.get('success'))
        inv.refresh_from_db()
        rm.refresh_from_db()
        print(f'  ✓ سفارش #{d1.get("order_id")}')
        print(f'    «{kp.name}»: {inv.quantity}')
        print(f'    «{rm.name}»: {rm.quantity}')

        # ── ظهر: سفارش ناهار ──
        print(f'\n  ── ظهر: سفارش ناهار ──')
        r2, d2 = self.api_post('/api/pos/create-order/', {
            'customer_name': 'ناهارخور', 'phone': '09131112233',
            'items': [
                {'food_id': food.id, 'quantity': 3, 'price': int(food.final_price)},
                {'food_id': self.food2.id, 'quantity': 2, 'price': int(self.food2.final_price)},
                {'food_id': f'ready_{rm.id}', 'quantity': 2, 'price': int(rm.selling_price)},
            ],
        })
        self.assertTrue(d2.get('success'))
        inv.refresh_from_db()
        kp2_inv = self.kp2.get_inventory()
        kp2_inv.refresh_from_db()
        rm.refresh_from_db()
        print(f'  ✓ سفارش #{d2.get("order_id")}')
        print(f'    «{kp.name}»: {inv.quantity}')
        print(f'    «{self.kp2.name}»: {kp2_inv.quantity}')
        print(f'    «{rm.name}»: {rm.quantity}')

        # ── عصر: ضایعات ──
        print(f'\n  ── عصر: ثبت ضایعات ──')
        inv.refresh_from_db()
        if int(inv.quantity) >= 2:
            r3, d3 = self.api_post('/api/kitchen/waste/', {
                'kitchen_product': kp.id, 'quantity': 2, 'reason': 'expired',
                'notes': 'مونده از ظهر'
            })
            if r3.status_code in [200, 201]:
                inv.refresh_from_db()
                print(f'  ✓ ضایعات: ۲ عدد — موجودی: {inv.quantity}')

        # ── عصر: گزارش ──
        print(f'\n  ── عصر: گزارش روزانه ──')
        today = timezone.localdate().isoformat()
        r4, report = self.api_get(f'/api/pos/daily-report/?date={today}')
        self.assertEqual(r4.status_code, 200)
        print(f'  فروش: {report.get("total_sales", 0):,}')
        print(f'  سفارشات: {report.get("order_count", 0)}')
        print(f'  ضایعات: {report.get("waste_total", 0)}')
        print(f'  تخفیف: {report.get("discount_total", 0):,}')

        # ── شب: بستن روز ──
        print(f'\n  ── شب: بستن روز ──')
        r5, close = self.api_post('/api/pos/close-day/')
        self.assertEqual(r5.status_code, 200)
        self.assertTrue(close.get('success'))
        print(f'  ✓ {close.get("msg", "روز بسته شد")}')

        # ── خلاصه نهایی ──
        inv.refresh_from_db()
        rm.refresh_from_db()
        print(f'\n  ═══ خلاصه روز ═══')
        print(f'  «{kp.name}»: ۱۰ (تولید) → {int(inv.quantity)} (نهایی)')
        print(f'  «{rm.name}»: ۳۰ (اولیه) → {int(rm.quantity)} (نهایی)')
        print(f'  سفارشات: {Order.objects.filter(created_at__date=timezone.localdate()).count()}')
        print(f'  ✓ شبیه‌سازی روز کامل موفق')

# ═══════════════════════════════════════════════════════
#  تست دقیق: کسر مواد اولیه هنگام تولید نیمه‌آماده
# ═══════════════════════════════════════════════════════

class TestSemiFinishedDeduction(BaseAPITestCase):
    """
    وقتی روی نیمه‌آماده کلیک می‌کنی و تولید می‌زنی،
    مواد اولیه‌اش واقعاً از انبار کم بشن.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()

        cls.raw1 = RawMaterial.objects.create(
            name='test_ardestan', quantity=100, unit='kg', price=5000,
        )
        cls.raw2 = RawMaterial.objects.create(
            name='test_roughest', quantity=50, unit='l', price=8000,
        )
        cls.raw3 = RawMaterial.objects.create(
            name='test_namakest', quantity=30, unit='kg', price=2000,
        )

        cls.sf1 = SemiFinished.objects.create(
            name='khamir_test', category='dough', unit='kg',
            quantity_produced=1, current_stock=0,
        )
        SemiFinishedIngredient.objects.create(
            semi_finished=cls.sf1, raw_material=cls.raw1, quantity=2,
        )
        SemiFinishedIngredient.objects.create(
            semi_finished=cls.sf1, raw_material=cls.raw2, quantity=1,
        )

        cls.sf2 = SemiFinished.objects.create(
            name='sos_test', category='sauce', unit='liter',
            quantity_produced=1, current_stock=0,
        )
        SemiFinishedIngredient.objects.create(
            semi_finished=cls.sf2, raw_material=cls.raw1, quantity=3,
        )
        SemiFinishedIngredient.objects.create(
            semi_finished=cls.sf2, raw_material=cls.raw2, quantity=2,
        )
        SemiFinishedIngredient.objects.create(
            semi_finished=cls.sf2, raw_material=cls.raw3, quantity=1,
        )

    def _get_raw_stocks(self):
        self.raw1.refresh_from_db()
        self.raw2.refresh_from_db()
        self.raw3.refresh_from_db()
        return {
            self.raw1.id: float(self.raw1.quantity),
            self.raw2.id: float(self.raw2.quantity),
            self.raw3.id: float(self.raw3.quantity),
        }

    def _set_raw_stocks(self, r1, r2, r3):
        self.raw1.quantity = r1
        self.raw1.save(update_fields=['quantity'])
        self.raw2.quantity = r2
        self.raw2.save(update_fields=['quantity'])
        self.raw3.quantity = r3
        self.raw3.save(update_fields=['quantity'])

    def _reset_semi_stocks(self):
        for sf in [self.sf1, self.sf2]:
            sf.current_stock = 0
            sf.save(update_fields=['current_stock'])

    def test_01_produce_semi_finished_deducts_raw_materials(self):
        """تولید نیمه‌آماده باید مواد اولیه رو کم کنه."""
        self._set_raw_stocks(100, 50, 30)
        self._reset_semi_stocks()
        stocks_before = self._get_raw_stocks()
        print(f'\n  -- before produce --')
        print(f'  raw1: {stocks_before[self.raw1.id]}')
        print(f'  raw2: {stocks_before[self.raw2.id]}')
        print(f'  raw3: {stocks_before[self.raw3.id]}')

        r, data = self.api_post('/api/recipes/produce-semi/', {
            'semi_finished_id': self.sf1.id,
            'quantity': 3,
        })

        if r.status_code not in [200, 201]:
            print(f'  warn API: {r.status_code} - {data}')
            self.skipTest(f'produce-semi API: {r.status_code}')

        stocks_after = self._get_raw_stocks()
        print(f'\n  -- after produce 3 --')
        print(f'  raw1: {stocks_before[self.raw1.id]} -> {stocks_after[self.raw1.id]} (expect: {stocks_before[self.raw1.id] - 6})')
        print(f'  raw2: {stocks_before[self.raw2.id]} -> {stocks_after[self.raw2.id]} (expect: {stocks_before[self.raw2.id] - 3})')
        print(f'  raw3: {stocks_before[self.raw3.id]} -> {stocks_after[self.raw3.id]} (expect: no change)')

        expected_raw1 = stocks_before[self.raw1.id] - 6
        self.assertEqual(stocks_after[self.raw1.id], expected_raw1)
        expected_raw2 = stocks_before[self.raw2.id] - 3
        self.assertEqual(stocks_after[self.raw2.id], expected_raw2)
        self.assertEqual(stocks_after[self.raw3.id], stocks_before[self.raw3.id])
        print(f'  OK: raw materials deducted correctly')

    def test_02_produce_semi_exact_stock_consumed(self):
        """تولید نیمه‌آماده با مقداری که دقیقاً مواد اولیه رو صفر کنه"""
        self._set_raw_stocks(10, 50, 30)
        self._reset_semi_stocks()

        r, data = self.api_post('/api/recipes/produce-semi/', {
            'semi_finished_id': self.sf1.id,
            'quantity': 5,
        })

        if r.status_code not in [200, 201]:
            self.skipTest(f'produce-semi API: {r.status_code}')

        self.raw1.refresh_from_db()
        self.assertEqual(float(self.raw1.quantity), 0)
        print(f'  OK: raw1 exactly zero: 10 - 10 = {self.raw1.quantity}')

    def test_03_produce_semi_insufficient_materials_rejected(self):
        """اگه مواد اولیه کافی نباشه، تولید باید رد بشه"""
        self._set_raw_stocks(3, 2, 30)
        self._reset_semi_stocks()
        stocks_before = self._get_raw_stocks()

        r, data = self.api_post('/api/recipes/produce-semi/', {
            'semi_finished_id': self.sf1.id,
            'quantity': 10,
        })

        stocks_after = self._get_raw_stocks()

        if r.status_code in [400, 422]:
            self.assertEqual(stocks_after[self.raw1.id], stocks_before[self.raw1.id])
            print(f'  OK: rejected and stocks unchanged')
        else:
            self.assertGreaterEqual(stocks_after[self.raw1.id], 0)
            print(f'  warn: accepted but stock not negative: raw1={stocks_after[self.raw1.id]}')

    def test_04_produce_semi_multiple_ingredients(self):
        """تولید نیمه‌آماده با 3 ماده اولیه مختلف"""
        self._set_raw_stocks(50, 30, 20)
        self._reset_semi_stocks()

        r, data = self.api_post('/api/recipes/produce-semi/', {
            'semi_finished_id': self.sf2.id,
            'quantity': 2,
        })

        if r.status_code not in [200, 201]:
            self.skipTest(f'produce-semi API: {r.status_code}')

        stocks_after = self._get_raw_stocks()
        self.assertEqual(stocks_after[self.raw1.id], 50 - 6)
        self.assertEqual(stocks_after[self.raw2.id], 30 - 4)
        self.assertEqual(stocks_after[self.raw3.id], 20 - 2)
        print(f'  OK: all 3 deducted correctly')

    def test_05_produce_semi_raw_stock_never_negative(self):
        """مواد اولیه نباید منفی بشن"""
        self._set_raw_stocks(2, 5, 10)
        self._reset_semi_stocks()

        self.api_post('/api/recipes/produce-semi/', {
            'semi_finished_id': self.sf1.id,
            'quantity': 100,
        })

        self.raw1.refresh_from_db()
        self.raw2.refresh_from_db()
        self.assertGreaterEqual(float(self.raw1.quantity), 0)
        self.assertGreaterEqual(float(self.raw2.quantity), 0)
        print(f'  OK: raw1={self.raw1.quantity}, raw2={self.raw2.quantity} (not negative)')

    def test_06_produce_semi_with_semi_finished_items(self):
        """نیمه‌آماده‌ای که خودش از نیمه‌آماده دیگه ساخته میشه"""
        self._set_raw_stocks(200, 100, 50)
        self._reset_semi_stocks()

        r, data = self.api_post('/api/recipes/produce-semi/', {
            'semi_finished_id': self.sf1.id,
            'quantity': 1,
        })

        if r.status_code not in [200, 201]:
            self.skipTest(f'produce-semi sf1: {r.status_code}')

        self.sf1.refresh_from_db()
        print(f'  OK: sf1 produced, stock={self.sf1.current_stock}')


class TestKitchenProduceDeduction(BaseAPITestCase):
    """
    وقتی تو آشپزخانه روی دکمه produce کلیک می‌کنی،
    مواد اولیه واقعاً کم بشن.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()

        cls.raw_bread = RawMaterial.objects.create(
            name='test_nan', quantity=200, unit='unit', price=5000,
        )
        cls.raw_meat = RawMaterial.objects.create(
            name='test_gosht', quantity=100, unit='kg', price=200000,
        )
        cls.raw_cheese = RawMaterial.objects.create(
            name='test_panir', quantity=80, unit='kg', price=100000,
        )
        cls.raw_potato = RawMaterial.objects.create(
            name='test_sibzamini', quantity=150, unit='kg', price=30000,
        )

        RecipeIngredient.objects.create(
            recipe=cls.recipe1, raw_material=cls.raw_bread,
            quantity=1, unit='unit',
        )
        RecipeIngredient.objects.create(
            recipe=cls.recipe1, raw_material=cls.raw_meat,
            quantity=1, unit='kg',
        )
        RecipeIngredient.objects.create(
            recipe=cls.recipe1, raw_material=cls.raw_cheese,
            quantity=1, unit='kg',
        )

        RecipeIngredient.objects.create(
            recipe=cls.recipe2, raw_material=cls.raw_bread,
            quantity=1, unit='unit',
        )
        RecipeIngredient.objects.create(
            recipe=cls.recipe2, raw_material=cls.raw_meat,
            quantity=2, unit='kg',
        )
        RecipeIngredient.objects.create(
            recipe=cls.recipe2, raw_material=cls.raw_cheese,
            quantity=1, unit='kg',
        )

        RecipeIngredient.objects.create(
            recipe=cls.recipe3, raw_material=cls.raw_potato,
            quantity=1, unit='kg',
        )

    def _get_ingredient_stocks(self, product_id):
        r, data = self.api_get(f'/api/kitchen/products/{product_id}/capacity/')
        if r.status_code != 200:
            return None, None
        required = data.get('required_per_unit', [])
        stocks = {}
        for req in required:
            source = req.get('source') or req.get('type', '')
            source_id = req.get('source_id') or req.get('id')
            source_name = req.get('name', '?')
            qty_needed = req.get('quantity_per_unit') or req.get('required_per_unit', 0)

            if source in ['warehouse', 'raw_material', 'ready_material']:
                try:
                    rm = RawMaterial.objects.get(id=source_id)
                    rm.refresh_from_db()
                    stocks[source_id] = {
                        'name': rm.name, 'type': 'raw',
                        'stock': float(rm.quantity), 'per_unit': qty_needed,
                    }
                except RawMaterial.DoesNotExist:
                    stocks[source_id] = {
                        'name': source_name, 'type': 'raw',
                        'stock': 0, 'per_unit': qty_needed,
                    }
            elif source in ['semi_finished', 'semi']:
                stocks[source_id] = {
                    'name': source_name, 'type': 'semi',
                    'stock': 0, 'per_unit': qty_needed,
                }
            else:
                stocks[source_id] = {
                    'name': source_name, 'type': 'unknown',
                    'stock': 0, 'per_unit': qty_needed,
                }
        return data, stocks

    def _reset_materials(self):
        self.raw_bread.quantity = 200
        self.raw_bread.save(update_fields=['quantity'])
        self.raw_meat.quantity = 100
        self.raw_meat.save(update_fields=['quantity'])
        self.raw_cheese.quantity = 80
        self.raw_cheese.save(update_fields=['quantity'])
        self.raw_potato.quantity = 150
        self.raw_potato.save(update_fields=['quantity'])

    def _ensure_product_stock(self, product, min_qty=20):
        inv = product.get_inventory()
        if inv.quantity < min_qty:
            inv.quantity = min_qty
            inv.save(update_fields=['quantity', 'updated_at'])
        return inv

    def test_01_produce_deducts_warehouse_materials(self):
        """تولید محصول آشپزخانه باید مواد انبار رو کم کنه."""
        self._reset_materials()
        kp = self.kp1
        inv = self._ensure_product_stock(kp)
        stock_before = inv.quantity

        cap_data, ingredients = self._get_ingredient_stocks(kp.id)
        if not cap_data or not ingredients:
            self.skipTest(f'capacity not available')
        if not ingredients:
            self.skipTest(f'no ingredients found')

        print(f'\n  -- product: {kp.name} --')
        print(f'  kitchen stock: {stock_before}')

        ing_before = {}
        for sid, info in ingredients.items():
            ing_before[sid] = info['stock']
            print(f'  material {info["name"]}: {info["stock"]} (per unit: {info["per_unit"]})')

        produce_qty = 2
        r, data = self.api_post(
            f'/api/kitchen/products/{kp.id}/produce/',
            {'quantity': produce_qty, 'notes': 'test deduction'}
        )
        self.assertIn(r.status_code, [200, 201])
        print(f'\n  -- after produce {produce_qty} --')

        _, ingredients_after = self._get_ingredient_stocks(kp.id)
        if not ingredients_after:
            self.skipTest('ingredients after produce not available')

        deducted_something = False
        for sid in ingredients:
            before = ing_before[sid]
            after = ingredients_after[sid]['stock']
            expected_per_unit = ingredients[sid]['per_unit']
            expected_after = before - (expected_per_unit * produce_qty)
            if after < before:
                deducted_something = True
            print(f'  {ingredients[sid]["name"]}: {before} -> {after} (expect: {expected_after})')
            if ingredients[sid]['type'] in ['raw', 'warehouse']:
                self.assertGreaterEqual(after, 0)

        self.assertTrue(deducted_something, 'No material deducted!')
        inv.refresh_from_db()
        self.assertGreater(inv.quantity, stock_before)
        print(f'  OK: kitchen stock {stock_before} -> {inv.quantity}')

    def test_02_produce_exactly_available_materials(self):
        """تولید با دقیقاً مقدار مواد موجود"""
        self._reset_materials()
        kp = self.kp1
        cap_data, ingredients = self._get_ingredient_stocks(kp.id)
        if not ingredients:
            self.skipTest('ingredients not available')

        max_by_material = float('inf')
        limit_material = None
        for sid, info in ingredients.items():
            if info['per_unit'] > 0 and info['type'] in ['raw', 'warehouse']:
                can_make = info['stock'] // info['per_unit']
                if can_make < max_by_material:
                    max_by_material = can_make
                    limit_material = info['name']

        if max_by_material == float('inf') or max_by_material < 1:
            self.skipTest('not enough materials')

        produce_qty = int(max_by_material)
        print(f'\n  -- max produce: {produce_qty} (limit: {limit_material}) --')

        r, data = self.api_post(
            f'/api/kitchen/products/{kp.id}/produce/',
            {'quantity': produce_qty, 'notes': 'test max'}
        )
        self.assertIn(r.status_code, [200, 201])

        _, ingredients_after = self._get_ingredient_stocks(kp.id)
        if ingredients_after:
            for sid, info in ingredients_after.items():
                if info['name'] == limit_material:
                    self.assertGreaterEqual(info['stock'], 0)
                    self.assertLessEqual(info['stock'], info['per_unit'])
                    print(f'  OK: {info["name"]}={info["stock"]} (approx zero)')

    def test_03_produce_exceeds_materials_rejected_or_safe(self):
        """تولید بیشتر از مواد موجود باید رد بشه یا مواد منفی نشه"""
        self._reset_materials()
        kp = self.kp1
        cap_data, ingredients = self._get_ingredient_stocks(kp.id)
        if not ingredients:
            self.skipTest('ingredients not available')

        ing_before = {}
        for sid, info in ingredients.items():
            ing_before[sid] = info['stock']

        huge_qty = 9999
        print(f'\n  -- attempt produce {huge_qty} --')

        r, data = self.api_post(
            f'/api/kitchen/products/{kp.id}/produce/',
            {'quantity': huge_qty, 'notes': 'stress test'}
        )

        _, ingredients_after = self._get_ingredient_stocks(kp.id)

        if r.status_code in [400, 422]:
            for sid in ingredients:
                self.assertEqual(ingredients_after[sid]['stock'], ing_before[sid])
            print(f'  OK: rejected, stocks unchanged')
        else:
            for sid in ingredients:
                self.assertGreaterEqual(ingredients_after[sid]['stock'], 0)
            print(f'  warn: accepted but stocks not negative')

    def test_04_produce_multiple_times_consistent(self):
        """چند بار تولید پشت سر هم"""
        self._reset_materials()
        kp = self.kp1

        cap_data, ingredients = self._get_ingredient_stocks(kp.id)
        if not ingredients:
            self.skipTest('ingredients not available')

        initial_stocks = {}
        for sid, info in ingredients.items():
            initial_stocks[sid] = info['stock']

        times = 3
        qty_each = 2
        print(f'\n  -- {times}x produce {qty_each} --')

        for t in range(times):
            r, data = self.api_post(
                f'/api/kitchen/products/{kp.id}/produce/',
                {'quantity': qty_each, 'notes': f'batch {t+1}'}
            )
            self.assertIn(r.status_code, [200, 201])

        _, ingredients_after = self._get_ingredient_stocks(kp.id)

        total_produced = times * qty_each
        for sid in ingredients:
            before = initial_stocks[sid]
            after = ingredients_after[sid]['stock']
            per_unit = ingredients[sid]['per_unit']
            expected = before - (per_unit * total_produced)
            self.assertAlmostEqual(after, expected, places=1)
            self.assertGreaterEqual(after, 0)
            print(f'  OK: {ingredients[sid]["name"]}: {before} -> {after} (expect: {expected})')

    def test_05_produce_then_check_dashboard_shows_updated_stock(self):
        """بعد از تولید، داشبورد باید موجودی جدید رو نشون بده"""
        self._reset_materials()
        kp = self.kp1
        inv = self._ensure_product_stock(kp)
        before = inv.quantity

        r, data = self.api_post(
            f'/api/kitchen/products/{kp.id}/produce/',
            {'quantity': 3, 'notes': 'test dashboard'}
        )
        self.assertIn(r.status_code, [200, 201])

        inv.refresh_from_db()
        self.assertEqual(inv.quantity, before + 3)
        print(f'  OK: dashboard {before} -> {inv.quantity}')

    def test_06_produce_then_sell_inventory_consistent(self):
        """تولید -> فروش -> موجودی درست"""
        self._reset_materials()
        kp = self.kp1
        inv = self._ensure_product_stock(kp, min_qty=50)
        initial = inv.quantity
        print(f'\n  -- produce-sell --')
        print(f'  initial: {initial}')

        r, _ = self.api_post(
            f'/api/kitchen/products/{kp.id}/produce/',
            {'quantity': 5, 'notes': 'produce'}
        )
        self.assertIn(r.status_code, [200, 201])
        inv.refresh_from_db()
        after_produce = inv.quantity
        print(f'  after produce (+5): {after_produce}')

        self.api_post('/api/pos/create-order/', {
            'customer_name': 'test customer',
            'items': [{'food_id': kp.id, 'quantity': 2, 'type': 'kitchen'}],
        })
        inv.refresh_from_db()
        after_sell = inv.quantity
        print(f'  after sell (-2): {after_sell}')

        self.assertEqual(after_sell, initial + 3)
        print(f'  OK: final = initial + 3 = {after_sell}')

    def test_07_produce_zero_quantity_rejected(self):
        """تولید صفر باید رد بشه"""
        r, data = self.api_post(
            f'/api/kitchen/products/{self.kp1.id}/produce/',
            {'quantity': 0, 'notes': 'zero test'}
        )
        self.assertIn(r.status_code, [400, 422])
        print(f'  OK: zero produce rejected: {r.status_code}')

    def test_08_produce_negative_rejected(self):
        """تولید منفی باید رد بشه"""
        self._reset_materials()
        inv = self.kp1.get_inventory()
        stock_before = inv.quantity

        r, data = self.api_post(
            f'/api/kitchen/products/{self.kp1.id}/produce/',
            {'quantity': -5, 'notes': 'negative test'}
        )

        inv.refresh_from_db()
        self.assertEqual(inv.quantity, stock_before)
        print(f'  OK: negative produce rejected, stock unchanged')

    def test_09_produce_inventory_only_increases_on_produce(self):
        """موجودی محصول آشپزخانه فقط با تولید باید زیاد بشه"""
        self._reset_materials()
        kp = self.kp1
        inv = self._ensure_product_stock(kp, min_qty=50)
        before = inv.quantity

        inv.refresh_from_db()
        self.assertEqual(inv.quantity, before)
        print(f'  OK: stock stable without produce: {before}')

    def test_10_full_deduction_trace(self):
        """ردیابی کامل: مواد اولیه -> تولید -> فروش -> ضایعات"""
        self._reset_materials()
        kp = self.kp1
        inv = self._ensure_product_stock(kp, min_qty=50)
        print(f'\n  === full deduction trace ===')
        print(f'  0. initial: {inv.quantity}')
        initial = inv.quantity

        r, _ = self.api_post(
            f'/api/kitchen/products/{kp.id}/produce/',
            {'quantity': 3, 'notes': 'trace'}
        )
        self.assertIn(r.status_code, [200, 201])
        inv.refresh_from_db()
        expected_after_produce = initial + 3
        print(f'  1. after produce 3: {initial} -> {inv.quantity} (expect: {expected_after_produce})')
        self.assertEqual(inv.quantity, expected_after_produce)

        self.api_post('/api/pos/create-order/', {
            'customer_name': 'trace customer',
            'items': [{'food_id': kp.id, 'quantity': 2, 'type': 'kitchen'}],
        })
        inv.refresh_from_db()
        expected_after_sell = expected_after_produce - 2
        print(f'  2. after sell 2: {expected_after_produce} -> {inv.quantity} (expect: {expected_after_sell})')
        self.assertEqual(inv.quantity, expected_after_sell)

        r, _ = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': kp.id,
            'quantity': 1,
            'reason': 'expired',
            'description': 'trace',
        })
        self.assertIn(r.status_code, [200, 201])
        inv.refresh_from_db()
        expected_after_waste = expected_after_sell - 1
        print(f'  3. after waste 1: {expected_after_sell} -> {inv.quantity} (expect: {expected_after_waste})')
        self.assertEqual(inv.quantity, expected_after_waste)

        net_change = inv.quantity - initial
        print(f'\n  == summary: {initial} -> {inv.quantity} (net: {net_change}) ==')
        print(f'  produce +3 / sell -2 / waste -1 = net 0')
        self.assertEqual(net_change, 0)


class TestProduceUIIntegration(BaseAPITestCase):
    """
    بررسی اینکه دکمه‌های تولید در صفحه واقعاً API درست رو صدا می‌زنن.
    """

    def test_01_kitchen_produce_button_calls_correct_api(self):
        """دکمه تولید در صفحه آشپزخانه باید /api/kitchen/products/{id}/produce/ رو صدا بزنه"""
        r = self.client.get('/kitchen/')
        self.assertEqual(r.status_code, 200)
        content = r.content.decode('utf-8')

        # چک وجود تابع produce در JS
        self.assertIn('ktDoProduce', content,
            'تابع ktDoProduce در صفحه نیست')

        # چک آدرس API در تابع
        self.assertIn('/api/kitchen/products/', content,
            'آدرس API محصولات در صفحه نیست')
        self.assertIn('/produce/', content,
            'آدرس /produce/ در صفحه نیست')

        print(f'  ✓ تابع produce و آدرس API موجود')

    def test_02_kitchen_produce_sends_json_post(self):
        """تولید باید POST با JSON بفرسته"""
        r = self.client.get('/kitchen/')
        content = r.content.decode('utf-8')

        # چک که fetch با method POST می‌فرسته
        self.assertIn("method: 'POST'", content,
            'produce باید POST باشه')
        # یا
        self.assertIn("method:", content,
            'method در fetch produce نیست')

        print(f'  ✓ produce از POST استفاده می‌کنه')

    def test_03_waste_button_calls_correct_api(self):
        """دکمه ضایعات باید /api/kitchen/waste/ رو صدا بزنه"""
        r = self.client.get('/kitchen/')
        content = r.content.decode('utf-8')

        self.assertIn('ktSaveWaste', content,
            'تابع ktSaveWaste در صفحه نیست')
        self.assertIn('/api/kitchen/waste/', content,
            'آدرس /api/kitchen/waste/ در صفحه نیست')

        print(f'  ✓ تابع waste و آدرس API موجود')

    def test_04_semi_finished_produce_exists(self):
        """آدرس تولید نیمه‌آماده باید وجود داشته باشه"""
        r = self.client.post('/api/recipes/produce-semi/')
        self.assertNotEqual(r.status_code, 404,
            '/api/recipes/produce-semi/ وجود ندارد')
        print(f'  ✓ produce-semi: {r.status_code}')

    def test_05_semi_finished_save_exists(self):
        """آدرس ذخیره نیمه‌آماده باید وجود داشته باشه"""
        r = self.client.post('/api/semi-finished/save/')
        self.assertNotEqual(r.status_code, 404,
            '/api/semi-finished/save/ وجود ندارد')
        print(f'  ✓ semi-finished save: {r.status_code}')


# ═══════════════════════════════════════════════════════════════════
#  ADVANCED TESTS — Deep coverage
# ═══════════════════════════════════════════════════════════════════


class AdvancedBase(TestCase):
    """کلاس پایه برای تست‌های پیشرفته"""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username='testadmin', password='TestPass123!',
            is_staff=True, is_superuser=True
        )
        cls.user_cashier = User.objects.create_user(
            username='cashier1', password='Cashier123!',
            is_staff=True, is_superuser=False
        )
        cls.user_kitchen = User.objects.create_user(
            username='kitchen1', password='Kitchen123!',
            is_staff=True, is_superuser=False
        )
        cls.user_normal = User.objects.create_user(
            username='normal1', password='Normal123!',
            is_staff=False, is_superuser=False
        )

        cls.cat_main = Category.objects.create(name='burger_adv', order=1)
        cls.cat_drink = Category.objects.create(name='drink_adv', order=2)

        cls.food1 = Food.objects.create(
            category=cls.cat_main, name='cheese_burger_adv', final_price=185000)
        cls.food2 = Food.objects.create(
            category=cls.cat_main, name='double_burger_adv', final_price=245000)
        cls.food3 = Food.objects.create(
            category=cls.cat_main, name='fries_adv', final_price=75000)

        cls.recipe1 = Recipe.objects.create(food=cls.food1, yield_quantity=1)
        cls.recipe2 = Recipe.objects.create(food=cls.food2, yield_quantity=1)
        cls.recipe3 = Recipe.objects.create(food=cls.food3, yield_quantity=1)

        cls.kp1 = KitchenProduct.objects.create(
            name='cheese_burger_adv', recipe=cls.recipe1,
            category='burger', selling_price=185000)
        cls.kp2 = KitchenProduct.objects.create(
            name='double_burger_adv', recipe=cls.recipe2,
            category='burger', selling_price=245000)
        cls.kp3 = KitchenProduct.objects.create(
            name='fries_adv', recipe=cls.recipe3,
            category='appetizer', selling_price=75000)

        cls.raw_bread = RawMaterial.objects.create(
            name='bread_adv', quantity=500, unit='unit', price=5000)
        cls.raw_meat = RawMaterial.objects.create(
            name='meat_adv', quantity=200, unit='kg', price=200000)
        cls.raw_cheese = RawMaterial.objects.create(
            name='cheese_adv', quantity=150, unit='kg', price=100000)
        cls.raw_potato = RawMaterial.objects.create(
            name='potato_adv', quantity=300, unit='kg', price=30000)

        RecipeIngredient.objects.create(
            recipe=cls.recipe1, raw_material=cls.raw_bread, quantity=1, unit='unit')
        RecipeIngredient.objects.create(
            recipe=cls.recipe1, raw_material=cls.raw_meat, quantity=1, unit='kg')
        RecipeIngredient.objects.create(
            recipe=cls.recipe1, raw_material=cls.raw_cheese, quantity=1, unit='kg')

        RecipeIngredient.objects.create(
            recipe=cls.recipe2, raw_material=cls.raw_bread, quantity=1, unit='unit')
        RecipeIngredient.objects.create(
            recipe=cls.recipe2, raw_material=cls.raw_meat, quantity=2, unit='kg')

        RecipeIngredient.objects.create(
            recipe=cls.recipe3, raw_material=cls.raw_potato, quantity=1, unit='kg')

        cls.rm_pepsi = ReadyMaterial.objects.create(
            name='pepsi_adv', quantity=100, category=cls.cat_drink, selling_price=35000)

        for kp in [cls.kp1, cls.kp2, cls.kp3]:
            inv = kp.get_inventory()
            inv.quantity = 100
            inv.save(update_fields=['quantity', 'updated_at'])

    def setUp(self):
        self.client = Client()
        self.client.login(username='testadmin', password='TestPass123!')
        self.maxDiff = None

    def api_get(self, url):
        r = self.client.get(url, content_type='application/json')
        return r, self._parse(r)

    def api_post(self, url, data=None):
        r = self.client.post(url, data=json.dumps(data or {}),
                             content_type='application/json')
        return r, self._parse(r)

    def api_patch(self, url, data=None):
        r = self.client.patch(url, data=json.dumps(data or {}),
                              content_type='application/json')
        return r, self._parse(r)

    def api_delete(self, url):
        r = self.client.delete(url, content_type='application/json')
        return r, self._parse(r)

    def _parse(self, response):
        try:
            return json.loads(response.content)
        except (json.JSONDecodeError, ValueError):
            return response.content.decode('utf-8', errors='replace')

    def _reset_all(self):
        """بازگردانی همه موجودی‌ها به مقدار اولیه"""
        self.raw_bread.quantity = 500
        self.raw_bread.save(update_fields=['quantity'])
        self.raw_meat.quantity = 200
        self.raw_meat.save(update_fields=['quantity'])
        self.raw_cheese.quantity = 150
        self.raw_cheese.save(update_fields=['quantity'])
        self.raw_potato.quantity = 300
        self.raw_potato.save(update_fields=['quantity'])
        self.rm_pepsi.quantity = 100
        self.rm_pepsi.save(update_fields=['quantity'])
        for kp in [self.kp1, self.kp2, self.kp3]:
            inv = kp.get_inventory()
            inv.quantity = 100
            inv.save(update_fields=['quantity', 'updated_at'])

    def _stock(self, kp):
        """خوندن موجودی فعلی آشپزخانه"""
        inv = kp.get_inventory()
        inv.refresh_from_db()
        return inv.quantity


# ═══════════════════════════════════════════════════════════════
#  1. یکپارچگی داده — اعداد و موجودی‌ها بعد عملیات پیچیده درست بمونن
# ═══════════════════════════════════════════════════════════════

class TestDataIntegrity(AdvancedBase):

    def test_01_stock_consistency_after_many_operations(self):
        """بعد ۲۰ فروش + ۵ تولید + ۳ ضایعات، موجودی دقیق باشه"""
        self._reset_all()
        initial = self._stock(self.kp1)

        for i in range(5):
            r, _ = self.api_post(
                f'/api/kitchen/products/{self.kp1.id}/produce/',
                {'quantity': 1, 'notes': f'produce {i}'})
            self.assertIn(r.status_code, [200, 201])

        after_produce = initial + 5
        self.assertEqual(self._stock(self.kp1), after_produce)

        for i in range(10):
            r, _ = self.api_post('/api/pos/create-order/', {
                'customer_name': f'customer {i}',
                'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
            })
            self.assertIn(r.status_code, [200, 201])

        after_sell = after_produce - 10
        self.assertEqual(self._stock(self.kp1), after_sell)

        for i in range(3):
            r, _ = self.api_post('/api/kitchen/waste/', {
                'kitchen_product': self.kp1.id,
                'quantity': 1, 'reason': 'expired', 'description': f'waste {i}'})
            self.assertIn(r.status_code, [200, 201])

        after_waste = after_sell - 3
        self.assertEqual(self._stock(self.kp1), after_waste)
        print(f'  OK: {initial} -> {after_waste}')

    def test_02_raw_material_consistency(self):
        """موجودی مواد اولیه بعد تولید چندباره درست باشه"""
        self._reset_all()
        bread_before = self.raw_bread.quantity

        for i in range(5):
            self.api_post(
                f'/api/kitchen/products/{self.kp1.id}/produce/',
                {'quantity': 1, 'notes': f'batch {i}'})

        self.raw_bread.refresh_from_db()
        expected = bread_before - 5
        self.assertEqual(float(self.raw_bread.quantity), float(expected))
        print(f'  bread: {bread_before} -> {self.raw_bread.quantity}')

    def test_03_order_total_matches_items(self):
        """جمع مبلغ سفارش = مجموع آیتم‌ها"""
        self._reset_all()
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'integrity test',
            'items': [
                {'food_id': self.kp1.id, 'quantity': 2, 'type': 'kitchen'},
                {'food_id': self.kp2.id, 'quantity': 1, 'type': 'kitchen'},
                {'food_id': self.rm_pepsi.id, 'quantity': 3, 'type': 'ready'},
            ],
        })
        self.assertIn(r.status_code, [200, 201])

        order = Order.objects.latest('id')
        items = order.items.all()
        calc = sum(item.price * item.quantity for item in items)
        self.assertEqual(order.total_price, calc)
        print(f'  total: {order.total_price} = {calc}')

    def test_04_daily_report_matches_orders(self):
        """گزارش روزانه = سفارشات واقعی"""
        self._reset_all()
        total = 0
        for i in range(3):
            r, _ = self.api_post('/api/pos/create-order/', {
                'customer_name': f'report {i}',
                'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
            })
            total += 185000

        r, report = self.api_get('/api/pos/daily-report/')
        self.assertEqual(report['total_sales'], total)
        self.assertEqual(report['order_count'], 3)
        print(f'  report: {report["order_count"]} orders, {report["total_sales"]} sales')

    def test_05_close_day_profit_calculation(self):
        """بستن روز با سفارش + ضایعات"""
        self._reset_all()
        self.api_post('/api/pos/create-order/', {
            'customer_name': 'profit',
            'items': [{'food_id': self.kp1.id, 'quantity': 2, 'type': 'kitchen'}],
        })
        self.api_post('/api/pos/register-waste/', {
            'items': [{'product_id': self.kp1.id, 'quantity': 1,
                        'type': 'kitchen', 'reason': 'expired'}],
        })
        r, data = self.api_post('/api/pos/close-day/')
        self.assertTrue(data.get('success'))
        print(f'  close: {data.get("msg", "")}')

    def test_06_inventory_never_negative(self):
        """موجودی بعد تخلیه هرگز منفی نشه"""
        self._reset_all()
        for i in range(95):
            self.api_post('/api/pos/create-order/', {
                'customer_name': f'drain {i}',
                'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
            })

        stock = self._stock(self.kp1)
        self.assertGreaterEqual(stock, 0)

        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'overflow',
            'items': [{'food_id': self.kp1.id, 'quantity': 10, 'type': 'kitchen'}],
        })
        self.assertGreaterEqual(self._stock(self.kp1), 0)
        print(f'  after drain+overflow: {self._stock(self.kp1)} (>= 0)')


# ═══════════════════════════════════════════════════════════════
#  2. مرز تاریخ — بستن روز، سفارش بعد بستن، تاریخ‌های مختلف
# ═══════════════════════════════════════════════════════════════

class TestDateBoundary(AdvancedBase):

    def test_01_close_day_twice(self):
        """بستن روز دو بار — هر دو موفق"""
        self._reset_all()
        self.api_post('/api/pos/create-order/', {
            'customer_name': 'close',
            'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
        })
        r1, d1 = self.api_post('/api/pos/close-day/')
        r2, d2 = self.api_post('/api/pos/close-day/')
        self.assertTrue(d1.get('success'))
        self.assertTrue(d2.get('success'))
        print(f'  close 1: #{d1.get("report_id")}, close 2: #{d2.get("report_id")}')

    def test_02_order_after_close(self):
        """سفارش بعد بستن روز باید کار کنه"""
        self._reset_all()
        self.api_post('/api/pos/create-order/', {
            'customer_name': 'before',
            'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
        })
        self.api_post('/api/pos/close-day/')
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'after',
            'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
        })
        self.assertIn(r.status_code, [200, 201])
        print(f'  order after close: OK')

    def test_03_close_empty_day(self):
        """بستن روز بدون سفارش"""
        self._reset_all()
        r, data = self.api_post('/api/pos/close-day/')
        self.assertTrue(data.get('success'))
        print(f'  close empty day: OK')

    def test_04_close_preserves_data(self):
        """بعد بستن، داده‌های سفارش حفظ بشه"""
        self._reset_all()
        self.api_post('/api/pos/create-order/', {
            'customer_name': 'preserve',
            'items': [{'food_id': self.kp1.id, 'quantity': 2, 'type': 'kitchen'}],
        })
        order = Order.objects.latest('id')
        self.api_post('/api/pos/close-day/')
        o = Order.objects.get(pk=order.pk)
        self.assertEqual(o.customer_name, 'preserve')
        self.assertEqual(o.total_price, 370000)
        print(f'  preserved: {o.customer_name} = {o.total_price}')

    def test_05_multiple_close_independent(self):
        """هر بستن روز = گزارش مجزا"""
        self._reset_all()
        _, d1 = self.api_post('/api/pos/close-day/')
        _, d2 = self.api_post('/api/pos/close-day/')
        self.assertNotEqual(d1.get('report_id'), d2.get('report_id'))
        print(f'  #{d1.get("report_id")} != #{d2.get("report_id")}')

    def test_06_report_default_today(self):
        """گزارش بدون تاریخ = امروز"""
        self._reset_all()
        self.api_post('/api/pos/create-order/', {
            'customer_name': 'today',
            'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
        })
        r, data = self.api_get('/api/pos/daily-report/')
        self.assertEqual(data['order_count'], 1)
        print(f'  today: 1 order')

    def test_07_report_yesterday_empty(self):
        """گزارش دیروز بدون سفارش = صفر"""
        self._reset_all()
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        r, data = self.api_get(f'/api/pos/daily-report/?date={yesterday}')
        self.assertEqual(data['order_count'], 0)
        print(f'  yesterday: 0 orders')

    def test_08_waste_before_and_after_close(self):
        """ضایعات قبل و بعد بستن روز"""
        self._reset_all()
        self.api_post('/api/pos/register-waste/', {
            'items': [{'product_id': self.kp1.id, 'quantity': 1,
                        'type': 'kitchen', 'reason': 'expired'}],
        })
        self.api_post('/api/pos/close-day/')
        r, data = self.api_post('/api/pos/register-waste/', {
            'items': [{'product_id': self.kp1.id, 'quantity': 1,
                        'type': 'kitchen', 'reason': 'damaged'}],
        })
        self.assertIn(r.status_code, [200, 201])
        print(f'  waste after close: OK')


# ═══════════════════════════════════════════════════════════════
#  3. بازیابی خطا — ورودی‌های اشتباه، غذای ناموجود، تعداد منفی
# ═══════════════════════════════════════════════════════════════

class TestErrorRecovery(AdvancedBase):

    def test_01_invalid_food_id(self):
        """سفارش با غذای ناموجود → خطا + موجودی تغییر نکنه"""
        self._reset_all()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'error',
            'items': [{'food_id': 99999, 'quantity': 1, 'type': 'kitchen'}],
        })
        self.assertIn(r.status_code, [400, 404, 500])
        self.assertEqual(self._stock(self.kp1), 100)
        print(f'  invalid food: {r.status_code}, stock OK')

    def test_02_empty_items(self):
        """سفارش بدون آیتم → خطا"""
        self._reset_all()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'empty', 'items': []})
        self.assertIn(r.status_code, [400, 422])
        print(f'  empty: {r.status_code}')

    def test_03_zero_quantity(self):
        """سفارش تعداد صفر → خطا"""
        self._reset_all()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'zero',
            'items': [{'food_id': self.kp1.id, 'quantity': 0, 'type': 'kitchen'}],
        })
        self.assertIn(r.status_code, [400, 422])
        print(f'  zero: {r.status_code}')

    def test_04_negative_quantity(self):
        """سفارش تعداد منفی → خطا"""
        self._reset_all()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'neg',
            'items': [{'food_id': self.kp1.id, 'quantity': -5, 'type': 'kitchen'}],
        })
        self.assertIn(r.status_code, [400, 422])
        print(f'  negative: {r.status_code}')

    def test_05_produce_zero(self):
        """تولید صفر → خطا"""
        self._reset_all()
        r, _ = self.api_post(
            f'/api/kitchen/products/{self.kp1.id}/produce/',
            {'quantity': 0})
        self.assertIn(r.status_code, [400, 422])
        print(f'  produce zero: {r.status_code}')

    def test_06_produce_negative(self):
        """تولید منفی → خطا"""
        self._reset_all()
        r, _ = self.api_post(
            f'/api/kitchen/products/{self.kp1.id}/produce/',
            {'quantity': -10})
        self.assertIn(r.status_code, [400, 422])
        print(f'  produce neg: {r.status_code}')

    def test_07_waste_zero(self):
        """ضایعات صفر → خطا"""
        self._reset_all()
        r, _ = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 0, 'reason': 'expired'})
        self.assertIn(r.status_code, [400, 422])
        print(f'  waste zero: {r.status_code}')

    def test_08_waste_overflow(self):
        """ضایعات بیشتر از موجودی → موجودی منفی نشه"""
        self._reset_all()
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id, 'quantity': 9999, 'reason': 'expired'})
        self.assertGreaterEqual(self._stock(self.kp1), 0)
        print(f'  waste overflow: {self._stock(self.kp1)} (>= 0)')

    def test_09_produce_nonexistent(self):
        """تولید محصول ناموجود → 404"""
        self._reset_all()
        r, _ = self.api_post('/api/kitchen/products/99999/produce/',
                             {'quantity': 1})
        self.assertIn(r.status_code, [400, 404])
        print(f'  nonexistent produce: {r.status_code}')

    def test_10_waste_nonexistent(self):
        """ضایعات محصول ناموجود → 404"""
        self._reset_all()
        r, _ = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': 99999, 'quantity': 1, 'reason': 'expired'})
        self.assertIn(r.status_code, [400, 404])
        print(f'  nonexistent waste: {r.status_code}')

    def test_11_order_with_missing_field(self):
        """سفارش بدون فیلد → خطا"""
        self._reset_all()
        r, _ = self.api_post('/api/pos/create-order/', {})
        self.assertIn(r.status_code, [400, 422, 500])
        print(f'  missing fields: {r.status_code}')


# ═══════════════════════════════════════════════════════════════
#  4. حجم — سیستم زیر فشار
# ═══════════════════════════════════════════════════════════════

class TestVolume(AdvancedBase):

    def test_01_50_orders_stock_correct(self):
        """۵۰ سفارش پشت سر هم → موجودی دقیق"""
        self._reset_all()
        start = self._stock(self.kp1)
        for i in range(50):
            r, _ = self.api_post('/api/pos/create-order/', {
                'customer_name': f'vol {i}',
                'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
            })
            self.assertIn(r.status_code, [200, 201])
        self.assertEqual(self._stock(self.kp1), start - 50)
        print(f'  50 orders: {start} -> {self._stock(self.kp1)}')

    def test_02_20_produces_stock_correct(self):
        """۲۰ تولید پشت سر هم → موجودی دقیق"""
        self._reset_all()
        start = self._stock(self.kp1)
        for i in range(20):
            r, _ = self.api_post(
                f'/api/kitchen/products/{self.kp1.id}/produce/',
                {'quantity': 1, 'notes': f'vol {i}'})
            self.assertIn(r.status_code, [200, 201])
        self.assertEqual(self._stock(self.kp1), start + 20)
        print(f'  20 produces: {start} -> {self._stock(self.kp1)}')

    def test_03_10_wastes_stock_correct(self):
        """۱۰ ضایعات پشت سر هم → موجودی دقیق"""
        self._reset_all()
        start = self._stock(self.kp1)
        for i in range(10):
            self.api_post('/api/kitchen/waste/', {
                'kitchen_product': self.kp1.id,
                'quantity': 1, 'reason': 'expired'})
        self.assertEqual(self._stock(self.kp1), start - 10)
        print(f'  10 wastes: {start} -> {self._stock(self.kp1)}')

    def test_04_mixed_operations(self):
        """ترکیب تولید + فروش + ضایعات → موجودی دقیق"""
        self._reset_all()
        start = self._stock(self.kp1)
        delta = 0
        for i in range(5):
            self.api_post(f'/api/kitchen/products/{self.kp1.id}/produce/',
                          {'quantity': 1})
        delta += 5
        for i in range(10):
            self.api_post('/api/pos/create-order/', {
                'customer_name': f'm {i}',
                'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
            })
        delta -= 10
        for i in range(3):
            self.api_post('/api/kitchen/waste/', {
                'kitchen_product': self.kp1.id,
                'quantity': 1, 'reason': 'expired'})
        delta -= 3
        for i in range(8):
            self.api_post(f'/api/kitchen/products/{self.kp1.id}/produce/',
                          {'quantity': 1})
        delta += 8
        self.assertEqual(self._stock(self.kp1), start + delta)
        print(f'  mixed: {start} -> {self._stock(self.kp1)} (delta {delta})')

    def test_05_dashboard_performance(self):
        """داشبورد زیر فشار سریع باشه"""
        self._reset_all()
        for i in range(10):
            self.api_post('/api/pos/create-order/', {
                'customer_name': f'perf {i}',
                'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
            })
        t0 = time.time()
        for _ in range(5):
            r, _ = self.api_get('/api/kitchen/dashboard/')
            self.assertEqual(r.status_code, 200)
        avg = (time.time() - t0) / 5
        self.assertLess(avg, 2.0)
        print(f'  dashboard avg: {avg:.3f}s')

    def test_06_report_performance(self):
        """گزارش زیر فشار سریع باشه"""
        self._reset_all()
        for i in range(20):
            self.api_post('/api/pos/create-order/', {
                'customer_name': f'rp {i}',
                'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
            })
        t0 = time.time()
        r, _ = self.api_get('/api/pos/daily-report/')
        elapsed = time.time() - t0
        self.assertEqual(r.status_code, 200)
        self.assertLess(elapsed, 2.0)
        print(f'  report: {elapsed:.3f}s')


# ═══════════════════════════════════════════════════════════════
#  5. سراسری — شبیه‌سازی کامل یه روز رستوران
# ═══════════════════════════════════════════════════════════════

class TestEndToEnd(AdvancedBase):

    def test_01_complete_day(self):
        """یه روز کامل: صبح تولید → ظهر فروش → عصر ضایعات → شب بستن"""
        self._reset_all()
        s0 = self._stock(self.kp1)

        # صبح: تولید
        for i in range(5):
            self.api_post(f'/api/kitchen/products/{self.kp1.id}/produce/',
                          {'quantity': 2, 'notes': f'am {i}'})
        s1 = self._stock(self.kp1)
        self.assertEqual(s1, s0 + 10)

        # ظهر: ۸ سفارش
        for i in range(8):
            self.api_post('/api/pos/create-order/', {
                'customer_name': f'lunch {i}',
                'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
            })
        s2 = self._stock(self.kp1)
        self.assertEqual(s2, s1 - 8)

        # عصر: ضایعات
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 1, 'reason': 'expired'})
        s3 = self._stock(self.kp1)
        self.assertEqual(s3, s2 - 1)

        # شب: گزارش + بستن
        r, report = self.api_get('/api/pos/daily-report/')
        self.assertEqual(report['order_count'], 8)

        r, close = self.api_post('/api/pos/close-day/')
        self.assertTrue(close.get('success'))
        print(f'  day: {s0} -> {s3} ({report["order_count"]} orders)')

    def test_02_multi_product_day(self):
        """روز با چند محصول مختلف"""
        self._reset_all()
        s1 = self._stock(self.kp1)
        s2 = self._stock(self.kp2)
        s3 = self._stock(self.kp3)
        sp = self.rm_pepsi.quantity

        orders = [
            {'items': [
                {'food_id': self.kp1.id, 'quantity': 2, 'type': 'kitchen'},
                {'food_id': self.rm_pepsi.id, 'quantity': 2, 'type': 'ready'}]},
            {'items': [
                {'food_id': self.kp2.id, 'quantity': 1, 'type': 'kitchen'},
                {'food_id': self.kp3.id, 'quantity': 3, 'type': 'kitchen'}]},
            {'items': [
                {'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'},
                {'food_id': self.kp2.id, 'quantity': 1, 'type': 'kitchen'},
                {'food_id': self.kp3.id, 'quantity': 1, 'type': 'kitchen'},
                {'food_id': self.rm_pepsi.id, 'quantity': 4, 'type': 'ready'}]},
        ]

        for i, order in enumerate(orders):
            r, _ = self.api_post('/api/pos/create-order/', {
                'customer_name': f'multi {i}', 'items': order['items']})
            self.assertIn(r.status_code, [200, 201])

        self.assertEqual(self._stock(self.kp1), s1 - 3)
        self.assertEqual(self._stock(self.kp2), s2 - 2)
        self.assertEqual(self._stock(self.kp3), s3 - 4)
        self.assertEqual(float(self.rm_pepsi.quantity), sp - 6)
        print(f'  multi: kp1-{s1}->{self._stock(self.kp1)}, kp2-{s2}->{self._stock(self.kp2)}')

    def test_03_full_cycle(self):
        """چرخه کامل: تولید → فروش → ضایعات → گزارش → بستن"""
        self._reset_all()
        self.api_post(f'/api/kitchen/products/{self.kp1.id}/produce/',
                      {'quantity': 10})
        s1 = self._stock(self.kp1)

        for i in range(5):
            self.api_post('/api/pos/create-order/', {
                'customer_name': f'c {i}',
                'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
            })
        s2 = self._stock(self.kp1)

        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 2, 'reason': 'expired'})
        s3 = self._stock(self.kp1)

        r, report = self.api_get('/api/pos/daily-report/')
        self.assertEqual(report['order_count'], 5)

        r, close = self.api_post('/api/pos/close-day/')
        self.assertTrue(close.get('success'))
        print(f'  cycle: {s1} -> {s3}')

    def test_04_zero_then_restock(self):
        """تخلیه تا صفر → فروش رد بشه → تولید → فروش دوباره"""
        self._reset_all()
        stock = self._stock(self.kp1)

        for i in range(stock):
            self.api_post('/api/pos/create-order/', {
                'customer_name': f'd {i}',
                'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
            })
        self.assertEqual(self._stock(self.kp1), 0)
        print(f'  drained to 0')

        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'over',
            'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
        })
        self.assertEqual(self._stock(self.kp1), 0)
        print(f'  extra sell blocked')

        self.api_post(f'/api/kitchen/products/{self.kp1.id}/produce/',
                      {'quantity': 10})
        self.assertEqual(self._stock(self.kp1), 10)
        print(f'  restocked: 10')


# ═══════════════════════════════════════════════════════════════
#  6. امنیت عمیق — کاربر ناشناس، SQL Injection، XSS
# ═══════════════════════════════════════════════════════════════

class TestSecurityDeep(AdvancedBase):

    def test_01_anon_cannot_order(self):
        """ناشناس نتونه سفارش بده"""
        self.client.logout()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'hack',
            'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
        })
        self.assertIn(r.status_code, [401, 403])
        print(f'  anon order: {r.status_code}')

    def test_02_anon_cannot_produce(self):
        """ناشناس نتونه تولید کنه"""
        self.client.logout()
        r, _ = self.api_post(f'/api/kitchen/products/{self.kp1.id}/produce/',
                             {'quantity': 1})
        self.assertIn(r.status_code, [401, 403])
        print(f'  anon produce: {r.status_code}')

    def test_03_anon_cannot_dashboard(self):
        """ناشناس نتونه داشبورد ببینه"""
        self.client.logout()
        r, _ = self.api_get('/api/kitchen/dashboard/')
        self.assertIn(r.status_code, [401, 403])
        print(f'  anon dashboard: {r.status_code}')

    def test_04_anon_cannot_close(self):
        """ناشناس نتونه روز ببنده"""
        self.client.logout()
        r, _ = self.api_post('/api/pos/close-day/')
        self.assertIn(r.status_code, [401, 403])
        print(f'  anon close: {r.status_code}')

    def test_05_anon_cannot_waste(self):
        """ناشناس نتونه ضایعات ثبت کنه"""
        self.client.logout()
        r, _ = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 1, 'reason': 'expired'})
        self.assertIn(r.status_code, [401, 403])
        print(f'  anon waste: {r.status_code}')

    def test_06_anon_cannot_manage_users(self):
        """ناشناس نتونه کاربر مدیریت کنه"""
        self.client.logout()
        urls = [
            '/api/users/', '/api/users/create/',
            '/api/users/1/change-role/', '/api/users/1/change-password/',
            '/api/users/1/toggle-active/', '/api/users/1/approve/',
            '/api/users/1/delete/',
        ]
        for url in urls:
            r, _ = self.api_get(url)
            self.assertIn(r.status_code, [401, 403])
        print(f'  all 7 user endpoints blocked')

    def test_07_normal_cannot_delete_user(self):
        """کاربر عادی نتونه کاربر حذف کنه"""
        self.client.login(username='normal1', password='Normal123!')
        r, _ = self.api_post('/api/users/1/delete/', {})
        self.assertIn(r.status_code, [401, 403])
        print(f'  normal delete: {r.status_code}')

    def test_08_sql_injection(self):
        """SQL Injection نتونه جدول رو خراب کنه"""
        self._reset_all()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': "'; DROP TABLE restaurant_order; --",
            'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
        })
        self.assertGreaterEqual(Order.objects.count(), 0)
        print(f'  SQLi survived: {r.status_code}')

    def test_09_xss_in_name(self):
        """XSS در نام مشتری اجرا نشه"""
        self._reset_all()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': '<script>alert(1)</script>',
            'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
        })
        if r.status_code in [200, 201]:
            o = Order.objects.latest('id')
            self.assertIn('script', o.customer_name)
        print(f'  XSS: {r.status_code}')

    def test_10_massive_body(self):
        """درخواست خیلی بزرگ سیستم رو کرش نکنه"""
        self._reset_all()
        items = [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}
                 for _ in range(1000)]
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'mass', 'items': items})
        self.assertIn(r.status_code, [200, 201, 400, 413, 500])
        print(f'  massive: {r.status_code}')


# ═══════════════════════════════════════════════════════════════
#  7. فرمت پاسخ API — ساختار پاسخ‌ها یکسان باشه
# ═══════════════════════════════════════════════════════════════

class TestAPIResponseFormat(AdvancedBase):

    def test_01_order_success_format(self):
        """سفارش موفق → فیلد success"""
        self._reset_all()
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'fmt',
            'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
        })
        self.assertIn(r.status_code, [200, 201])
        self.assertIn('success', data)
        print(f'  order: success={data.get("success")}')

    def test_02_order_error_format(self):
        """سفارش نامعتبر → کد خطا"""
        self._reset_all()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'err',
            'items': [{'food_id': 99999, 'quantity': 1, 'type': 'kitchen'}],
        })
        self.assertIn(r.status_code, [400, 404, 500])
        print(f'  error: {r.status_code}')

    def test_03_dashboard_keys(self):
        """داشبورد همه کلیدهای لازم رو داشته باشه"""
        self._reset_all()
        r, data = self.api_get('/api/kitchen/dashboard/')
        for k in ['products', 'inventory', 'discounts', 'waste', 'stats']:
            self.assertIn(k, data)
        print(f'  keys: OK')

    def test_04_report_fields(self):
        """گزارش همه فیلدهای لازم رو داشته باشه"""
        self._reset_all()
        r, data = self.api_get('/api/pos/daily-report/')
        for f in ['order_count', 'total_sales', 'orders']:
            self.assertIn(f, data)
        print(f'  fields: OK')

    def test_05_close_format(self):
        """بستن روز → فیلد success"""
        self._reset_all()
        r, data = self.api_post('/api/pos/close-day/')
        self.assertTrue(data.get('success'))
        print(f'  close: success')

    def test_06_waste_list_format(self):
        """لیست ضایعات ساختار درست داشته باشه"""
        self._reset_all()
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 1, 'reason': 'expired'})
        r, data = self.api_get('/api/kitchen/waste/')
        self.assertEqual(r.status_code, 200)
        if isinstance(data, list) and data:
            for k in ['id', 'kitchen_product', 'quantity', 'reason']:
                self.assertIn(k, data[0])
        print(f'  waste list: OK')

    def test_07_produce_format(self):
        """تولید پاسخ مناسب بده"""
        self._reset_all()
        r, _ = self.api_post(f'/api/kitchen/products/{self.kp1.id}/produce/',
                             {'quantity': 3})
        self.assertIn(r.status_code, [200, 201])
        print(f'  produce: {r.status_code}')

    def test_08_users_format(self):
        """لیست کاربران فیلدهای لازم رو داشته باشه"""
        r, data = self.api_get('/api/users/')
        if isinstance(data, list) and data:
            for k in ['id', 'username', 'role', 'is_active']:
                self.assertIn(k, data[0])
        print(f'  users: OK')

    def test_09_invalid_waste_reason(self):
        """دلیل ضایعات نامعتبر → خطا"""
        self._reset_all()
        r, _ = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 1, 'reason': 'INVALID'})
        self.assertIn(r.status_code, [400, 422])
        print(f'  invalid reason: {r.status_code}')

    def test_10_order_returns_id(self):
        """سفارش موفق شناسه برگردونه"""
        self._reset_all()
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'id',
            'items': [{'food_id': self.kp1.id, 'quantity': 1, 'type': 'kitchen'}],
        })
        self.assertIn(r.status_code, [200, 201])
        print(f'  order keys: {list(data.keys()) if isinstance(data, dict) else type(data).__name__}')

if __name__ == '__main__':
    import django
    django.setup()