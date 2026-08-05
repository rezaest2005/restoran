import json
import time
from django.test import TestCase, Client
from django.utils import timezone
from restaurant.models import (
    User, Food, Category, Order, OrderItem,
    KitchenProduct, KitchenInventory, WasteLog,
    ReadyMaterial, Recipe, RawMaterial,
    RecipeIngredient, Restaurant,
)
from restaurant.tenancy import set_current_restaurant, clear_current_restaurant


# ═══════════════════════════════════════════════════════
#  AdvancedBase — اصلاح‌شده
# ═══════════════════════════════════════════════════════

class AdvancedBase(TestCase):
    """کلاس پایه برای تست‌های پیشرفته — حجم، یکپارچگی، امنیت"""

    @classmethod
    def setUpTestData(cls):
        # ── تنظیم رستوران ──
        cls.restaurant = Restaurant.objects.create(name='تست پیشرفته')
        set_current_restaurant(cls.restaurant)

        cls.user = User.objects.create_user(
            username='admin_adv', password='AdvPass123!',
            is_staff=True, is_superuser=True)

        # ── دسته‌بندی ──
        cls.cat_burger = Category.objects.create(
            name='برگر', order=1, restaurant=cls.restaurant)
        cls.cat_appetizer = Category.objects.create(
            name='پیش‌غذا', order=2, restaurant=cls.restaurant)
        cls.cat_drink = Category.objects.create(
            name='نوشیدنی', order=3, restaurant=cls.restaurant)

        # ── غذا ──
        cls.food1 = Food.objects.create(
            name='دوبل برگر', category=cls.cat_burger,
            final_price=245000, restaurant=cls.restaurant)
        cls.food2 = Food.objects.create(
            name='چیز برگر', category=cls.cat_burger,
            final_price=185000, restaurant=cls.restaurant)

        # ── مواد اولیه ──
        cls.raw_bread = RawMaterial.objects.create(
            name='test_nan_adv', quantity=200, unit='unit',
            price=5000, restaurant=cls.restaurant)
        cls.raw_meat = RawMaterial.objects.create(
            name='test_gosht_adv', quantity=100, unit='kg',
            price=200000, restaurant=cls.restaurant)
        cls.raw_cheese = RawMaterial.objects.create(
            name='test_panir_adv', quantity=80, unit='kg',
            price=100000, restaurant=cls.restaurant)

        # ── رسپی ──
        cls.recipe1 = Recipe.objects.create(
            food=cls.food1, yield_quantity=1, restaurant=cls.restaurant)
        cls.recipe2 = Recipe.objects.create(
            food=cls.food2, yield_quantity=1, restaurant=cls.restaurant)

        # ── مواد رسپی ──
        RecipeIngredient.objects.create(
            recipe=cls.recipe1, raw_material=cls.raw_bread,
            quantity=1, unit='unit')
        RecipeIngredient.objects.create(
            recipe=cls.recipe1, raw_material=cls.raw_meat,
            quantity=1, unit='kg')
        RecipeIngredient.objects.create(
            recipe=cls.recipe1, raw_material=cls.raw_cheese,
            quantity=0.5, unit='kg')
        RecipeIngredient.objects.create(
            recipe=cls.recipe2, raw_material=cls.raw_bread,
            quantity=1, unit='unit')
        RecipeIngredient.objects.create(
            recipe=cls.recipe2, raw_material=cls.raw_meat,
            quantity=0.5, unit='kg')

        # ── محصولات آشپزخانه ──
        cls.kp1 = KitchenProduct.objects.create(
            name='دوبل برگر', recipe=cls.recipe1,
            category='other', selling_price=245000,
            restaurant=cls.restaurant)
        cls.kp2 = KitchenProduct.objects.create(
            name='چیز برگر', recipe=cls.recipe2,
            category='other', selling_price=185000,
            restaurant=cls.restaurant)

        # ── موجودی اولیه ──
        for kp in [cls.kp1, cls.kp2]:
            inv = kp.get_inventory()
            inv.quantity = 100
            inv.save(update_fields=['quantity', 'updated_at'])

        # ── مواد آماده ──
        cls.rm_pepsi = ReadyMaterial.objects.create(
            name='پپسی', quantity=50, category=cls.cat_drink,
            selling_price=35000, restaurant=cls.restaurant)

    def setUp(self):
        set_current_restaurant(self.restaurant)
        self.client = Client()
        self.client.login(username='admin_adv', password='AdvPass123!')

    @classmethod
    def tearDownClass(cls):
        clear_current_restaurant()
        super().tearDownClass()

    # ── ابزارها ──

    def _stock(self, kp):
        """موجودی فعلی محصول آشپزخانه"""
        set_current_restaurant(self.restaurant)          # ★ اضافه
        inv = KitchenInventory.objects.filter(kitchen_product=kp).first()
        return inv.quantity if inv else 0

    def _reset_all(self):
        """بازنشانی کامل داده‌ها بین تست‌ها"""
        set_current_restaurant(self.restaurant)          # ★ اضافه
        Order.objects.all().delete()
        WasteLog.objects.all().delete()
        KitchenInventory.objects.filter(
            kitchen_product=self.kp1).update(quantity=100)
        KitchenInventory.objects.filter(
            kitchen_product=self.kp2).update(quantity=100)
        ReadyMaterial.objects.filter(
            pk=self.rm_pepsi.pk).update(quantity=50)
        RawMaterial.objects.filter(
            pk=self.raw_bread.pk).update(quantity=200)
        RawMaterial.objects.filter(
            pk=self.raw_meat.pk).update(quantity=100)
        RawMaterial.objects.filter(
            pk=self.raw_cheese.pk).update(quantity=80)

    def _ensure_stock(self, kp, amount):
        """اطمینان از حداقل موجودی"""
        set_current_restaurant(self.restaurant)          # ★ اضافه
        inv = kp.get_inventory()
        if inv.quantity < amount:
            inv.quantity = amount
            inv.save(update_fields=['quantity', 'updated_at'])
        return inv

    def api_post(self, url, data=None):
        set_current_restaurant(self.restaurant)          # ★ اصلی‌ترین فیکس
        r = self.client.post(
            url, json.dumps(data or {}),
            content_type='application/json')
        try:
            return r, json.loads(r.content)
        except (json.JSONDecodeError, ValueError):
            return r, {}

    def api_get(self, url):
        set_current_restaurant(self.restaurant)          # ★ اصلی‌ترین فیکس
        r = self.client.get(url)
        try:
            return r, json.loads(r.content)
        except (json.JSONDecodeError, ValueError):
            return r, {}


# ═══════════════════════════════════════════════════════
#  ۲۷. یکپارچگی داده
# ═══════════════════════════════════════════════════════

class TestDataIntegrity(AdvancedBase):

    def test_01_stock_consistency(self):
        """تولید +۵، سفارش ۱۰ → موجودی باید ≤ initial+5"""
        self._reset_all()
        initial = self._stock(self.kp1)

        for i in range(5):
            self.api_post(
                f'/api/kitchen/products/{self.kp1.id}/produce/',
                {'quantity': 1, 'notes': f'p{i}'})
        self.assertEqual(self._stock(self.kp1), initial + 5,
                         f'بعد از تولید باید {initial + 5} باشد')

        for i in range(10):
            self.api_post('/api/pos/create-order/', {
                'customer_name': f'c{i}',
                'items': [{'food_id': self.food1.id,
                           'quantity': 1,
                           'price': int(self.food1.final_price)}]})
        self.assertLessEqual(self._stock(self.kp1), initial + 5,
                             f'بعد از سفارش باید ≤ {initial + 5} باشد')

    def test_02_raw_material_consistency(self):
        """تولید باید مواد اولیه مصرف کند"""
        self._reset_all()
        bread_before = float(self.raw_bread.quantity)

        for i in range(3):
            self.api_post(
                f'/api/kitchen/products/{self.kp1.id}/produce/',
                {'quantity': 1, 'notes': f'b{i}'})

        self.raw_bread.refresh_from_db()
        self.assertLess(float(self.raw_bread.quantity), bread_before,
                        f'نان باید کم شده باشد: {bread_before} → {self.raw_bread.quantity}')

    def test_03_inventory_never_negative(self):
        """موجودی هرگز منفی نمی‌شود"""
        self._reset_all()
        for i in range(120):
            self.api_post('/api/pos/create-order/', {
                'customer_name': f'd{i}',
                'items': [{'food_id': self.food1.id,
                           'quantity': 1,
                           'price': int(self.food1.final_price)}]})
        stock = self._stock(self.kp1)
        self.assertGreaterEqual(stock, 0,
                                f'موجودی منفی شده: {stock}')


# ═══════════════════════════════════════════════════════
#  ۲۸. مرز تاریخ
# ═══════════════════════════════════════════════════════

class TestDateBoundary(AdvancedBase):

    def test_01_close_day_twice(self):
        """بستن روز دو بار پشت سر هم باید موفق باشد"""
        self._reset_all()
        self.api_post('/api/pos/create-order/', {
            'customer_name': 'close', 'phone': '',
            'items': [{'food_id': self.food1.id,
                       'quantity': 1,
                       'price': int(self.food1.final_price)}]})
        r1, d1 = self.api_post('/api/pos/close-day/')
        r2, d2 = self.api_post('/api/pos/close-day/')
        self.assertTrue(d1.get('success'), 'بستن اول باید موفق باشد')
        self.assertTrue(d2.get('success'), 'بستن دوم باید موفق باشد')

    def test_02_order_after_close(self):
        """سفارش بعد از بستن روز باید کار کند"""
        self._reset_all()
        self.api_post('/api/pos/create-order/', {
            'customer_name': 'before', 'phone': '',
            'items': [{'food_id': self.food1.id,
                       'quantity': 1,
                       'price': int(self.food1.final_price)}]})
        self.api_post('/api/pos/close-day/')
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'after', 'phone': '',
            'items': [{'food_id': self.food1.id,
                       'quantity': 1,
                       'price': int(self.food1.final_price)}]})
        self.assertIn(r.status_code, [200, 201],
                      'سفارش بعد از بستن باید موفق باشد')

    def test_03_close_empty_day(self):
        """بستن روز بدون سفارش"""
        self._reset_all()
        r, data = self.api_post('/api/pos/close-day/')
        self.assertTrue(data.get('success'),
                        'بستن روز خالی باید موفق باشد')

    def test_04_report_default_today(self):
        """گزارش پیش‌فرض باید مال امروز باشد"""
        self._reset_all()
        self.api_post('/api/pos/create-order/', {
            'customer_name': 'today', 'phone': '',
            'items': [{'food_id': self.food1.id,
                       'quantity': 1,
                       'price': int(self.food1.final_price)}]})
        r, data = self.api_get('/api/pos/daily-report/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('order_count', data)


# ═══════════════════════════════════════════════════════
#  ۲۹. بازیابی خطا
# ═══════════════════════════════════════════════════════

class TestErrorRecovery(AdvancedBase):

    def test_01_invalid_food_id(self):
        """غذای ناموجود → خطا، موجودی تغییر نکند"""
        self._reset_all()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'err', 'phone': '',
            'items': [{'food_id': 99999, 'quantity': 1,
                       'price': 100000}]})
        self.assertIn(r.status_code, [400, 404, 500])
        self.assertEqual(self._stock(self.kp1), 100,
                         'موجودی نباید تغییر کند')

    def test_02_empty_items(self):
        """آیتم‌های خالی"""
        self._reset_all()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'empty', 'phone': '', 'items': []})
        self.assertIn(r.status_code, [200, 400, 422])

    def test_03_produce_zero(self):
        """تولید صفر باید رد شود"""
        self._reset_all()
        r, _ = self.api_post(
            f'/api/kitchen/products/{self.kp1.id}/produce/',
            {'quantity': 0})
        self.assertIn(r.status_code, [400, 422])

    def test_04_produce_negative(self):
        """تولید منفی باید رد شود"""
        self._reset_all()
        r, _ = self.api_post(
            f'/api/kitchen/products/{self.kp1.id}/produce/',
            {'quantity': -10})
        self.assertIn(r.status_code, [400, 422])

    def test_05_waste_zero(self):
        """ضایعات صفر باید رد شود"""
        self._reset_all()
        r, _ = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 0, 'reason': 'expired'})
        self.assertIn(r.status_code, [400, 422])

    def test_06_waste_overflow(self):
        """ضایعات بیشتر از موجودی → موجودی منفی نشود"""
        self._reset_all()
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 9999, 'reason': 'expired'})
        stock = self._stock(self.kp1)
        self.assertGreaterEqual(stock, 0,
                                f'موجودی منفی شده: {stock}')

    def test_07_produce_nonexistent(self):
        """تولید محصول ناموجود"""
        self._reset_all()
        r, _ = self.api_post(
            '/api/kitchen/products/99999/produce/',
            {'quantity': 1})
        self.assertIn(r.status_code, [400, 404])

    def test_08_waste_nonexistent(self):
        """ضایعات محصول ناموجود"""
        self._reset_all()
        r, _ = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': 99999,
            'quantity': 1, 'reason': 'expired'})
        self.assertIn(r.status_code, [400, 404])


# ═══════════════════════════════════════════════════════
#  ۳۰. تست‌های حجمی
# ═══════════════════════════════════════════════════════

class TestVolume(AdvancedBase):

    def test_01_50_orders(self):
        """هر سفارش باید ۱ واحد از موجودی کم کند"""
        self._reset_all()
        start = self._stock(self.kp1)
        success = 0
        for i in range(50):
            r, data = self.api_post('/api/pos/create-order/', {
                'customer_name': f'v{i}', 'phone': '',
                'items': [{'food_id': self.food1.id,
                           'quantity': 1,
                           'price': int(self.food1.final_price)}]})
            if r.status_code in [200, 201]:
                success += 1
        self.assertGreater(success, 0, 'هیچ سفارشی ثبت نشد')
        self.assertEqual(
            self._stock(self.kp1), start - success,
            f'انتظار {start - success} ولی {self._stock(self.kp1)} شد')

    def test_02_20_produces(self):
        """تولید ۲۰ واحد → موجودی +۲۰"""
        self._reset_all()
        start = self._stock(self.kp1)
        for i in range(20):
            r, _ = self.api_post(
                f'/api/kitchen/products/{self.kp1.id}/produce/',
                {'quantity': 1, 'notes': f'v{i}'})
            self.assertIn(r.status_code, [200, 201],
                          f'تولید #{i} خطا داد: {r.status_code}')
        self.assertEqual(self._stock(self.kp1), start + 20,
                         f'انتظار {start + 20} ولی {self._stock(self.kp1)} شد')

    def test_03_10_wastes(self):
        """ضایعات ۱۰ واحد → موجودی -۱۰"""
        self._reset_all()
        start = self._stock(self.kp1)
        for i in range(10):
            r, _ = self.api_post('/api/kitchen/waste/', {
                'kitchen_product': self.kp1.id,
                'quantity': 1, 'reason': 'expired'})
            self.assertIn(r.status_code, [200, 201],
                          f'ضایعات #{i} خطا داد: {r.status_code}')
        self.assertEqual(self._stock(self.kp1), start - 10,
                         f'انتظار {start - 10} ولی {self._stock(self.kp1)} شد')

    def test_04_mixed_operations(self):
        """ترکیب تولید + سفارش + ضایعات"""
        self._reset_all()
        start = self._stock(self.kp1)
        delta = 0

        # تولید ۵ واحد
        produce_ok = 0
        for i in range(5):
            r, _ = self.api_post(
                f'/api/kitchen/products/{self.kp1.id}/produce/',
                {'quantity': 1})
            if r.status_code in [200, 201]:
                produce_ok += 1
        delta += produce_ok

        # ۱۰ سفارش
        order_ok = 0
        for i in range(10):
            r, _ = self.api_post('/api/pos/create-order/', {
                'customer_name': f'm{i}', 'phone': '',
                'items': [{'food_id': self.food1.id,
                           'quantity': 1,
                           'price': int(self.food1.final_price)}]})
            if r.status_code in [200, 201]:
                order_ok += 1
        delta -= order_ok

        # ۳ ضایعات
        waste_ok = 0
        for i in range(3):
            r, _ = self.api_post('/api/kitchen/waste/', {
                'kitchen_product': self.kp1.id,
                'quantity': 1, 'reason': 'expired'})
            if r.status_code in [200, 201]:
                waste_ok += 1
        delta -= waste_ok

        # تولید ۸ واحد دیگر
        produce2_ok = 0
        for i in range(8):
            r, _ = self.api_post(
                f'/api/kitchen/products/{self.kp1.id}/produce/',
                {'quantity': 1})
            if r.status_code in [200, 201]:
                produce2_ok += 1
        delta += produce2_ok

        expected = start + delta
        actual = self._stock(self.kp1)
        self.assertEqual(
            actual, expected,
            f'انتظار {expected} ولی {actual} شد '
            f'(تولید:{produce_ok}+{produce2_ok} سفارش:{order_ok} ضایعات:{waste_ok})')

    def test_05_dashboard_performance(self):
        """داشبورد باید زیر ۲ ثانیه پاسخ بدهد"""
        self._reset_all()
        t0 = time.time()
        for _ in range(5):
            r, _ = self.api_get('/api/kitchen/dashboard/')
            self.assertEqual(r.status_code, 200)
        avg = (time.time() - t0) / 5
        self.assertLess(avg, 2.0,
                        f'میانگین {avg:.2f}s — باید زیر 2s باشد')

    def test_06_report_performance(self):
        """گزارش روزانه باید زیر ۲ ثانیه باشد"""
        self._reset_all()
        for i in range(10):
            self.api_post('/api/pos/create-order/', {
                'customer_name': f'rp{i}', 'phone': '',
                'items': [{'food_id': self.food1.id,
                           'quantity': 1,
                           'price': int(self.food1.final_price)}]})
        t0 = time.time()
        r, _ = self.api_get('/api/pos/daily-report/')
        elapsed = time.time() - t0
        self.assertEqual(r.status_code, 200)
        self.assertLess(elapsed, 2.0,
                        f'گزارش {elapsed:.2f}s طول کشید')


# ═══════════════════════════════════════════════════════
#  ۳۱. سراسری (End-to-End)
# ═══════════════════════════════════════════════════════

class TestEndToEnd(AdvancedBase):

    def test_01_complete_day(self):
        """یک روز کامل: تولید → سفارش → ضایعات → گزارش → بستن"""
        self._reset_all()
        s0 = self._stock(self.kp1)

        # تولید ۵×۲ = ۱۰ واحد
        for i in range(5):
            r, _ = self.api_post(
                f'/api/kitchen/products/{self.kp1.id}/produce/',
                {'quantity': 2, 'notes': f'am{i}'})
            self.assertIn(r.status_code, [200, 201],
                          f'تولید #{i} خطا داد')
        self.assertEqual(self._stock(self.kp1), s0 + 10,
                         f'بعد از تولید: انتظار {s0 + 10}')

        # ۸ سفارش
        for i in range(8):
            r, _ = self.api_post('/api/pos/create-order/', {
                'customer_name': f'l{i}', 'phone': '',
                'items': [{'food_id': self.food1.id,
                           'quantity': 1,
                           'price': int(self.food1.final_price)}]})
        self.assertLessEqual(self._stock(self.kp1), s0 + 10,
                             'موجودی بعد از سفارش نباید بیشتر شود')

        # ۱ ضایعات
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 1, 'reason': 'expired'})

        # گزارش و بستن روز
        r, report = self.api_get('/api/pos/daily-report/')
        self.assertIn('order_count', report)
        r, close = self.api_post('/api/pos/close-day/')
        self.assertTrue(close.get('success'), 'بستن روز ناموفق')

    def test_02_multi_product_day(self):
        """سفارش چند محصول مختلف"""
        self._reset_all()
        s1 = self._stock(self.kp1)
        s2 = self._stock(self.kp2)

        # سفارش ۱: دوبل برگر + پپسی
        self.api_post('/api/pos/create-order/', {
            'customer_name': 'm1', 'phone': '',
            'items': [
                {'food_id': self.food1.id, 'quantity': 2,
                 'price': int(self.food1.final_price)},
                {'food_id': f'ready_{self.rm_pepsi.id}',
                 'quantity': 2,
                 'price': int(self.rm_pepsi.selling_price)}]})

        # سفارش ۲: چیز برگر
        self.api_post('/api/pos/create-order/', {
            'customer_name': 'm2', 'phone': '',
            'items': [
                {'food_id': self.food2.id, 'quantity': 1,
                 'price': int(self.food2.final_price)}]})

        self.assertLessEqual(self._stock(self.kp1), s1,
                             'kp1 باید کم شده باشد')
        self.assertLessEqual(self._stock(self.kp2), s2,
                             'kp2 باید کم شده باشد')

    def test_03_zero_then_restock(self):
        """رسیدن موجودی به صفر و شارژ مجدد"""
        self._reset_all()
        stock = self._stock(self.kp1)
        self.assertGreater(stock, 0, 'موجودی اولیه باید > 0 باشد')

        # خالی کردن
        success = 0
        for i in range(stock):
            r, _ = self.api_post('/api/pos/create-order/', {
                'customer_name': f'd{i}', 'phone': '',
                'items': [{'food_id': self.food1.id,
                           'quantity': 1,
                           'price': int(self.food1.final_price)}]})
            if r.status_code in [200, 201]:
                success += 1

        final = self._stock(self.kp1)
        self.assertEqual(final, 0,
                         f'باید 0 باشد ولی {final} (سفارش موفق: {success})')

        # شارژ مجدد
        self.api_post(
            f'/api/kitchen/products/{self.kp1.id}/produce/',
            {'quantity': 10})
        self.assertEqual(self._stock(self.kp1), 10,
                         'بعد از شارژ باید 10 باشد')


# ═══════════════════════════════════════════════════════
#  ۳۲. امنیت عمیق
# ═══════════════════════════════════════════════════════

class TestSecurityDeep(AdvancedBase):

    def test_01_anon_cannot_order(self):
        self.client.logout()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': 'hack', 'phone': '',
            'items': [{'food_id': self.food1.id,
                       'quantity': 1,
                       'price': int(self.food1.final_price)}]})
        self.assertIn(r.status_code, [401, 403],
                      'کاربر ناشناس نباید بتواند سفارش دهد')

    def test_02_anon_cannot_produce(self):
        self.client.logout()
        r, _ = self.api_post(
            f'/api/kitchen/products/{self.kp1.id}/produce/',
            {'quantity': 1})
        self.assertIn(r.status_code, [401, 403])

    def test_03_anon_cannot_dashboard(self):
        self.client.logout()
        r, _ = self.api_get('/api/kitchen/dashboard/')
        self.assertIn(r.status_code, [401, 403])

    def test_04_anon_cannot_close(self):
        self.client.logout()
        r, _ = self.api_post('/api/pos/close-day/')
        self.assertIn(r.status_code, [401, 403])

    def test_05_anon_cannot_waste(self):
        self.client.logout()
        r, _ = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 1, 'reason': 'expired'})
        self.assertIn(r.status_code, [401, 403])

    def test_06_sql_injection(self):
        """SQL Injection نباید دیتابیس را خراب کند"""
        self._reset_all()
        count_before = Order.objects.count()
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': "'; DROP TABLE restaurant_order; --",
            'phone': '',
            'items': [{'food_id': self.food1.id,
                       'quantity': 1,
                       'price': int(self.food1.final_price)}]})
        self.assertGreaterEqual(
            Order.objects.count(), count_before,
            'دیتابیس نباید خراب شود')

    def test_07_xss_in_name(self):
        """ورودی خام ذخیره شود — فرار در تمپلیت"""
        self._reset_all()
        payload = '<script>alert(1)</script>'
        r, _ = self.api_post('/api/pos/create-order/', {
            'customer_name': payload,
            'phone': '',
            'items': [{'food_id': self.food1.id,
                       'quantity': 1,
                       'price': int(self.food1.final_price)}]})
        if r.status_code in [200, 201]:
            o = Order.objects.latest('id')
            self.assertEqual(o.customer_name, payload,
                             'ورودی خام باید دقیقاً ذخیره شود')


# ═══════════════════════════════════════════════════════
#  ۳۳. فرمت پاسخ API
# ═══════════════════════════════════════════════════════

class TestAPIResponseFormat(AdvancedBase):

    def test_01_order_success_format(self):
        """پاسخ سفارش باید فیلد success داشته باشد"""
        self._reset_all()
        r, data = self.api_post('/api/pos/create-order/', {
            'customer_name': 'fmt', 'phone': '',
            'items': [{'food_id': self.food1.id,
                       'quantity': 1,
                       'price': int(self.food1.final_price)}]})
        self.assertIn(r.status_code, [200, 201])
        self.assertIn('success', data)

    def test_02_dashboard_keys(self):
        """داشبورد باید products و stats داشته باشد"""
        self._reset_all()
        r, data = self.api_get('/api/kitchen/dashboard/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('products', data, 'فیلد products نیست')
        self.assertIn('stats', data, 'فیلد stats نیست')

    def test_03_report_fields(self):
        """گزارش باید order_count و total_sales داشته باشد"""
        self._reset_all()
        r, data = self.api_get('/api/pos/daily-report/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('order_count', data)
        self.assertIn('total_sales', data)

    def test_04_waste_list_format(self):
        """لیست ضایعات باید قابل دریافت باشد"""
        self._reset_all()
        self._ensure_stock(self.kp1, 20)
        self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 1, 'reason': 'expired'})
        r, data = self.api_get('/api/kitchen/waste/')
        self.assertEqual(r.status_code, 200)

    def test_05_invalid_waste_reason(self):
        """دلیل نامعتبر باید رد شود"""
        self._reset_all()
        r, _ = self.api_post('/api/kitchen/waste/', {
            'kitchen_product': self.kp1.id,
            'quantity': 1, 'reason': 'INVALID'})
        self.assertIn(r.status_code, [400, 422],
                      'دلیل نامعتبر باید 400/422 بدهد')


if __name__ == '__main__':
    import django
    django.setup()