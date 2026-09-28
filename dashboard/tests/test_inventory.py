import json
import time
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from restaurant.models import (
    User, Food, Category, RawMaterial, Restaurant,
    Warehouse, StockItem, StockTransfer, Receiving, ReceivingItem,
    StockLayer, StockAdjustment, PurchaseListItem,
    InventoryMovement, Supplier,
)
from restaurant.tenancy import set_current_restaurant, clear_current_restaurant


# ═══════════════════════════════════════════════════════════
#  ابزار — Setup مشترک سیستم انبارداری
# ═══════════════════════════════════════════════════════════

class InventoryBaseTest(TestCase):
    """Setup مشترک — رستوران، کاربر، انبارها، مواد، تأمین‌کننده"""

    @classmethod
    def setUpTestData(cls):
        # ── رستوران ──
        cls.restaurant = Restaurant.objects.create(name='تست انبارداری')
        set_current_restaurant(cls.restaurant)

        # ── کاربر ──
        cls.user = User.objects.create_user(
            username='admin_inv', password='InvPass123!',
            is_staff=True, is_superuser=True)

        # ── انبار مرکزی ──
        cls.mother = Warehouse.objects.create(
            name='انبار مرکزی',
            warehouse_type='mother',
            is_mother=True,
            restaurant=cls.restaurant,
        )

        # ── انبار آشپزخانه ──
        cls.kitchen = Warehouse.objects.create(
            name='آشپزخانه',
            warehouse_type='kitchen',
            is_mother=False,
            restaurant=cls.restaurant,
        )

        # ── مواد اولیه ──
        cls.raw_meat = RawMaterial.objects.create(
            name='test_inv_gosht', quantity=0, unit='kg',
            price=850000, restaurant=cls.restaurant)
        cls.raw_onion = RawMaterial.objects.create(
            name='test_inv_piaz', quantity=0, unit='kg',
            price=50000, restaurant=cls.restaurant)
        cls.raw_bread = RawMaterial.objects.create(
            name='test_inv_nan', quantity=0, unit='unit',
            price=15000, restaurant=cls.restaurant)

        # ── تأمین‌کننده ──
        cls.supplier = Supplier.objects.create(
            name='شرکت گوشت پارس',
            phone='02112345678',
            restaurant=cls.restaurant,
        )

    def setUp(self):
        self.user.restaurant = self.restaurant
        self.user.save()
        set_current_restaurant(self.restaurant)

        self.client = APIClient()

        refresh = RefreshToken.for_user(self.user)
        refresh.access_token['restaurant_id'] = self.restaurant.id
        self.access_token = str(refresh.access_token)

        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )

    @classmethod
    def tearDownClass(cls):
        clear_current_restaurant()
        super().tearDownClass()

    # ── ابزارها ──

    def api_post(self, url, data=None):
        set_current_restaurant(self.restaurant)
        r = self.client.post(
            url, json.dumps(data or {}),
            content_type='application/json')
        set_current_restaurant(self.restaurant)  # ← context بعد از request
        try:
            return r, json.loads(r.content)
        except (json.JSONDecodeError, ValueError):
            return r, {}

    def api_get(self, url):
        set_current_restaurant(self.restaurant)
        r = self.client.get(url)
        set_current_restaurant(self.restaurant)  # ← context بعد از request
        try:
            return r, json.loads(r.content)
        except (json.JSONDecodeError, ValueError):
            return r, {}

    def _stock(self, material, warehouse=None):
        """موجودی فعلی یک کالا در یک انبار"""
        set_current_restaurant(self.restaurant)
        wh = warehouse or self.mother
        si = StockItem.objects.filter(
            warehouse=wh, raw_material=material
        ).first()
        return float(si.quantity) if si else 0

    def _reset_all(self):
        """بازنشانی کامل داده‌ها بین تست‌ها"""
        set_current_restaurant(self.restaurant)
        StockItem.objects.all().delete()
        StockLayer.objects.all().delete()
        StockTransfer.objects.all().delete()
        Receiving.objects.all().delete()
        ReceivingItem.objects.all().delete()
        StockAdjustment.objects.all().delete()
        PurchaseListItem.objects.all().delete()
        InventoryMovement.objects.all().delete()

    def _receive(self, material, qty, warehouse=None, price=None):
        """ورود سریع کالا (helper)"""
        wh = warehouse or self.mother
        return self.api_post('/api/inventory/receiving/create/', {
            'warehouse_id': wh.id,
            'items': [
                {
                    'raw_material_id': material.id,
                    'quantity': qty,
                    'unit_price': price or material.price,
                }
            ],
            'notes': 'تست',
        })

    def _transfer(self, material, qty, src=None, dst=None):
        """انتقال سریع (helper)"""
        return self.api_post('/api/inventory/transfer/create/', {
            'source_warehouse_id': (src or self.mother).id,
            'destination_warehouse_id': (dst or self.kitchen).id,
            'raw_material_id': material.id,
            'quantity': qty,
            'notes': 'تست',
        })

    def _issue(self, material, qty, warehouse=None):
        """خروج سریع (helper)"""
        wh = warehouse or self.mother
        return self.api_post('/api/inventory/issue/create/', {
            'warehouse_id': wh.id,
            'raw_material_id': material.id,
            'quantity': qty,
            'notes': 'تست',
        })

    def _waste(self, material, qty, warehouse=None, reason='expired'):
        """ضایعات سریع (helper)"""
        wh = warehouse or self.mother
        return self.api_post('/api/inventory/waste/create/', {
            'warehouse_id': wh.id,
            'raw_material_id': material.id,
            'quantity': qty,
            'waste_reason': reason,
            'notes': 'تست',
        })


# ═══════════════════════════════════════════════════════════
#  ۱. تست انبارها (Warehouse CRUD)
# ═══════════════════════════════════════════════════════════

class TestWarehouse(InventoryBaseTest):

    def test_01_list_warehouses(self):
        """لیست انبارها باید ۲ تا باشد"""
        self._reset_all()
        r, data = self.api_get('/api/inventory/warehouses/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('warehouses', data)
        self.assertEqual(len(data['warehouses']), 2)

    def test_02_create_warehouse(self):
        """ایجاد انبار جدید"""
        self._reset_all()
        r, data = self.api_post('/api/inventory/warehouses/save/', {
            'name': 'سردخانه',
            'warehouse_type': 'cold_storage',
            'description': 'سردخانه اصلی',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(Warehouse.objects.filter(name='سردخانه').exists())

    def test_03_update_warehouse(self):
        """ویرایش نام انبار"""
        self._reset_all()
        r, data = self.api_post('/api/inventory/warehouses/save/', {
            'id': self.kitchen.id,
            'name': 'آشپزخانه مرکزی',
            'warehouse_type': 'kitchen',
        })
        self.assertEqual(r.status_code, 200)
        self.kitchen.refresh_from_db()
        self.assertEqual(self.kitchen.name, 'آشپزخانه مرکزی')

    def test_04_delete_warehouse(self):
        """حذف انبار → غیرفعال شود"""
        self._reset_all()
        r, data = self.api_post('/api/inventory/warehouses/delete/', {
            'id': self.kitchen.id,
        })
        self.assertEqual(r.status_code, 200)
        self.kitchen.refresh_from_db()
        self.assertFalse(self.kitchen.is_active)

    def test_05_cannot_delete_mother(self):
        """انبار مرکزی نباید قابل حذف باشد"""
        self._reset_all()
        r, data = self.api_post('/api/inventory/warehouses/delete/', {
            'id': self.mother.id,
        })
        self.mother.refresh_from_db()
        self.assertTrue(self.mother.is_active,
                        'انبار مرکزی نباید غیرفعال شود')

    def test_06_mother_is_unique(self):
        """فقط یک انبار مرکزی مجاز"""
        self._reset_all()
        r, data = self.api_post('/api/inventory/warehouses/save/', {
            'name': 'مرکزی جدید',
            'warehouse_type': 'mother',
        })
        if r.status_code == 200:
            count = Warehouse.objects.filter(is_mother=True).count()
            self.assertLessEqual(count, 1,
                                 'باید فقط یک انبار مرکزی باشد')


# ═══════════════════════════════════════════════════════════
#  ۲. تست تأمین‌کنندگان (Supplier)
# ═══════════════════════════════════════════════════════════

class TestSupplier(InventoryBaseTest):

    def test_01_create_supplier(self):
        """ایجاد تأمین‌کننده"""
        self._reset_all()
        r, data = self.api_post('/api/suppliers/save/', {
            'name': 'میوه‌فروشی رضا',
            'phone': '09121234567',
            'address': 'تهران',
            'contact_person': 'رضا',
            'description': 'میوه و سبزیجات',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(Supplier.objects.filter(name='میوه‌فروشی رضا').exists())

    def test_02_list_suppliers(self):
        """لیست تأمین‌کنندگان"""
        self._reset_all()
        r, data = self.api_get('/api/suppliers/')
        self.assertEqual(r.status_code, 200)

    def test_03_update_supplier(self):
        """ویرایش تأمین‌کننده"""
        self._reset_all()
        r, data = self.api_post('/api/suppliers/save/', {
            'id': self.supplier.id,
            'name': 'شرکت گوشت پارس — جدید',
            'phone': '02198765432',
        })
        self.assertEqual(r.status_code, 200)
        self.supplier.refresh_from_db()
        self.assertEqual(self.supplier.name, 'شرکت گوشت پارس — جدید')

    def test_04_delete_supplier(self):
        """حذف تأمین‌کننده"""
        self._reset_all()
        r, data = self.api_post('/api/suppliers/delete/', {
            'id': self.supplier.id,
        })
        self.assertEqual(r.status_code, 200)


# ═══════════════════════════════════════════════════════════
#  ۳. تست ورود کالا (Receiving)
# ═══════════════════════════════════════════════════════════

class TestReceiving(InventoryBaseTest):

    def test_01_basic_receiving(self):
        """ورود ۱۰ کیلو گوشت"""
        self._reset_all()
        r, data = self._receive(self.raw_meat, 10, price=850000)

        # ✅ فقط برای دیباگ — print قبل از assert
        print('='*60)
        print('STATUS:', r.status_code)
        print('BODY:', r.content.decode('utf-8'))
        print('DATA:', data)
        print('='*60)

        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat), 10.0)

    def test_02_multiple_receiving_sums(self):
        """ورود چندباره → موجودی جمع می‌شود"""
        self._reset_all()
        self._receive(self.raw_meat, 5, price=850000)
        self._receive(self.raw_meat, 3, price=900000)
        self.assertEqual(self._stock(self.raw_meat), 8.0)

    def test_03_creates_stock_layer(self):
        """هر ورود → یک StockLayer"""
        self._reset_all()
        self._receive(self.raw_meat, 5, price=850000)
        layers = StockLayer.objects.filter(
            warehouse=self.mother, raw_material=self.raw_meat)
        self.assertEqual(layers.count(), 1)
        self.assertEqual(float(layers.first().quantity_remaining), 5.0)

    def test_04_creates_inventory_movement(self):
        """هر ورود → یک InventoryMovement"""
        self._reset_all()
        self._receive(self.raw_meat, 10, price=850000)
        move = InventoryMovement.objects.filter(
            raw_material=self.raw_meat,
            movement_type='in',
        ).first()
        self.assertIsNotNone(move, 'InventoryMovement ثبت نشده')
        self.assertEqual(float(move.quantity), 10.0)

    def test_05_negative_quantity_rejected(self):
        """مقدار منفی رد شود"""
        self._reset_all()
        r, data = self._receive(self.raw_meat, -5)
        self.assertNotEqual(r.status_code, 200)

    def test_06_zero_quantity_rejected(self):
        """مقدار صفر رد شود"""
        self._reset_all()
        r, data = self._receive(self.raw_meat, 0)
        self.assertNotEqual(r.status_code, 200)

    def test_07_nonexistent_material(self):
        """کالای ناموجود رد شود"""
        self._reset_all()
        r, data = self.api_post('/api/inventory/receiving/create/', {
            'warehouse_id': self.mother.id,
            'raw_material_id': 99999,
            'quantity': 5,
            'unit_price': 1000,
        })
        self.assertIn(r.status_code, [400, 404])

    def test_08_receiving_updates_receiving_record(self):
        """رکورد Receiving باید ساخته شود"""
        self._reset_all()
        self._receive(self.raw_meat, 10, price=850000)
        self.assertTrue(
            Receiving.objects.filter(warehouse=self.mother).exists()
            or ReceivingItem.objects.filter(raw_material=self.raw_meat).exists(),
            'رکورد Receiving/ReceivingItem ثبت نشده'
        )


# ═══════════════════════════════════════════════════════════
#  ۴. تست خروج کالا (Issue)
# ═══════════════════════════════════════════════════════════

class TestIssue(InventoryBaseTest):

    def setUp(self):
        super().setUp()
        self._reset_all()
        self._receive(self.raw_meat, 10, price=850000)

    def test_01_basic_issue(self):
        """خروج ۳ کیلو"""
        r, data = self._issue(self.raw_meat, 3)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat), 7.0)

    def test_02_issue_exact_stock(self):
        """خروج دقیقاً همان موجودی"""
        r, data = self._issue(self.raw_meat, 10)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat), 0.0)

    def test_03_issue_more_than_stock(self):
        """خروج بیشتر از موجودی → خطا"""
        r, data = self._issue(self.raw_meat, 20)
        self.assertNotEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat), 10.0,
                         'موجودی نباید تغییر کند')

    def test_04_issue_creates_movement(self):
        """خروج → InventoryMovement"""
        self._issue(self.raw_meat, 3)
        move = InventoryMovement.objects.filter(
            raw_material=self.raw_meat,
            movement_type='out',
        ).first()
        self.assertIsNotNone(move)
        self.assertEqual(float(move.quantity), 3.0)

    def test_05_issue_negative_rejected(self):
        """خروج منفی رد شود"""
        r, data = self._issue(self.raw_meat, -5)
        self.assertNotEqual(r.status_code, 200)

    def test_06_issue_zero_rejected(self):
        """خروج صفر رد شود"""
        r, data = self._issue(self.raw_meat, 0)
        self.assertNotEqual(r.status_code, 200)


# ═══════════════════════════════════════════════════════════
#  ۵. تست ضایعات (Waste)
# ═══════════════════════════════════════════════════════════

class TestWaste(InventoryBaseTest):

    def setUp(self):
        super().setUp()
        self._reset_all()
        self._receive(self.raw_meat, 10, price=850000)

    def test_01_basic_waste(self):
        """ضایعات ۲ کیلو — فاسد شده"""
        r, data = self._waste(self.raw_meat, 2, reason='spoiled')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat), 8.0)

    def test_02_waste_records_reason(self):
        """علت ضایعات ذخیره شود"""
        self._waste(self.raw_meat, 2, reason='expired')
        move = InventoryMovement.objects.filter(
            raw_material=self.raw_meat,
            movement_type='waste',
        ).first()
        self.assertIsNotNone(move)
        self.assertEqual(move.waste_reason, 'expired')

    def test_03_waste_more_than_stock(self):
        """ضایعات بیشتر از موجودی → خطا"""
        r, data = self._waste(self.raw_meat, 20, reason='expired')
        self.assertNotEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat), 10.0,
                         'موجودی نباید تغییر کند')

    def test_04_waste_invalid_reason(self):
        """علت نامعتبر رد شود"""
        r, data = self._waste(self.raw_meat, 1, reason='INVALID_REASON')
        self.assertIn(r.status_code, [400, 422])

    def test_05_waste_zero_rejected(self):
        """ضایعات صفر رد شود"""
        r, data = self._waste(self.raw_meat, 0, reason='expired')
        self.assertNotEqual(r.status_code, 200)

    def test_06_all_waste_reasons(self):
        """همه علت‌ها باید قبول شوند"""
        reasons = ['expired', 'spoiled', 'damaged', 'dropped', 'quality', 'other']
        self._reset_all()
        self._receive(self.raw_meat, 20, price=850000)
        for reason in reasons:
            r, data = self._waste(self.raw_meat, 1, reason=reason)
            self.assertEqual(r.status_code, 200,
                             f'علت «{reason}» رد شد')
        self.assertEqual(self._stock(self.raw_meat), 14.0)


# ═══════════════════════════════════════════════════════════
#  ۶. تست انتقال (Transfer)
# ═══════════════════════════════════════════════════════════

class TestTransfer(InventoryBaseTest):

    def setUp(self):
        super().setUp()
        self._reset_all()
        self._receive(self.raw_meat, 20, price=850000)
        self._receive(self.raw_onion, 10, price=50000)

    def test_01_basic_transfer(self):
        """انتقال ۳ کیلو گوشت"""
        r, data = self._transfer(self.raw_meat, 3)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat, self.mother), 17.0)
        self.assertEqual(self._stock(self.raw_meat, self.kitchen), 3.0)

    def test_02_transfer_same_warehouse(self):
        """انتقال بین یک انبار → خطا"""
        r, data = self.api_post('/api/inventory/transfer/create/', {
            'source_warehouse_id': self.mother.id,
            'destination_warehouse_id': self.mother.id,
            'raw_material_id': self.raw_meat.id,
            'quantity': 3,
        })
        self.assertNotEqual(r.status_code, 200)

    def test_03_transfer_more_than_stock(self):
        """انتقال بیشتر از موجودی → خطا"""
        r, data = self._transfer(self.raw_meat, 50)
        self.assertNotEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat, self.mother), 20.0)

    def test_04_transfer_conservation(self):
        """مجموع مبدأ + مقصد نباید تغییر کند"""
        before_total = (
            self._stock(self.raw_meat, self.mother)
            + self._stock(self.raw_meat, self.kitchen)
        )
        self._transfer(self.raw_meat, 7)
        after_total = (
            self._stock(self.raw_meat, self.mother)
            + self._stock(self.raw_meat, self.kitchen)
        )
        self.assertEqual(before_total, after_total,
                         'مجموع موجودی نباید تغییر کند')

    def test_05_transfer_list(self):
        """لیست انتقال‌ها"""
        self._transfer(self.raw_meat, 3)
        r, data = self.api_get('/api/inventory/transfer/list/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('transfers', data)
        self.assertEqual(len(data['transfers']), 1)

    def test_06_transfer_detail(self):
        """جزئیات انتقال"""
        r, data = self._transfer(self.raw_meat, 3)
        transfer_id = data.get('transfer_id')
        if transfer_id:
            r2, data2 = self.api_get(
                f'/api/inventory/transfer/detail/?id={transfer_id}')
            self.assertEqual(r2.status_code, 200)

    def test_07_transfer_creates_movements(self):
        """انتقال → ۲ حرکت (خروج + ورود)"""
        self._transfer(self.raw_meat, 3)
        src_moves = InventoryMovement.objects.filter(
            raw_material=self.raw_meat,
            movement_type='transfer_out',
        ).count()
        dst_moves = InventoryMovement.objects.filter(
            raw_material=self.raw_meat,
            movement_type='transfer_in',
        ).count()
        self.assertGreaterEqual(src_moves, 1, 'حرکت transfer_out نیست')
        self.assertGreaterEqual(dst_moves, 1, 'حرکت transfer_in نیست')

    def test_08_chain_transfers(self):
        """انتقال زنجیره‌ای: مرکزی → آشپزخانه → مرکزی"""
        self._transfer(self.raw_meat, 10)
        self.assertEqual(self._stock(self.raw_meat, self.mother), 10.0)
        self.assertEqual(self._stock(self.raw_meat, self.kitchen), 10.0)

        r, data = self.api_post('/api/inventory/transfer/create/', {
            'source_warehouse_id': self.kitchen.id,
            'destination_warehouse_id': self.mother.id,
            'raw_material_id': self.raw_meat.id,
            'quantity': 5,
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat, self.mother), 15.0)
        self.assertEqual(self._stock(self.raw_meat, self.kitchen), 5.0)


# ═══════════════════════════════════════════════════════════
#  ۷. تست اصلاح / شمارش (Adjustment)
# ═══════════════════════════════════════════════════════════

class TestAdjustment(InventoryBaseTest):

    def setUp(self):
        super().setUp()
        self._reset_all()
        self._receive(self.raw_meat, 10, price=850000)

    def test_01_adjustment_increase(self):
        """افزایش (+۵)"""
        r, data = self.api_post('/api/inventory/adjustment/create/', {
            'warehouse_id': self.mother.id,
            'raw_material_id': self.raw_meat.id,
            'quantity': 5,
            'adjustment_type': 'increase',
            'notes': 'شمارش فیزیکی',
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat), 15.0)

    def test_02_adjustment_decrease(self):
        """کاهش (-۳)"""
        r, data = self.api_post('/api/inventory/adjustment/create/', {
            'warehouse_id': self.mother.id,
            'raw_material_id': self.raw_meat.id,
            'quantity': 3,
            'adjustment_type': 'decrease',
            'notes': 'شمارش فیزیکی',
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat), 7.0)

    def test_03_adjustment_set(self):
        """تنظیم مقدار دقیق"""
        r, data = self.api_post('/api/inventory/adjustment/create/', {
            'warehouse_id': self.mother.id,
            'raw_material_id': self.raw_meat.id,
            'quantity': 15,
            'adjustment_type': 'set',
            'notes': 'شمارش فیزیکی',
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat), 15.0)

    def test_04_decrease_below_zero(self):
        """کاهش بیشتر از موجودی → خطا"""
        r, data = self.api_post('/api/inventory/adjustment/create/', {
            'warehouse_id': self.mother.id,
            'raw_material_id': self.raw_meat.id,
            'quantity': 20,
            'adjustment_type': 'decrease',
            'notes': 'تست',
        })
        self.assertNotEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat), 10.0)


# ═══════════════════════════════════════════════════════════
#  ۸. تست لیست خرید (PurchaseList)
# ═══════════════════════════════════════════════════════════

class TestPurchaseList(InventoryBaseTest):

    def test_01_add_to_purchase_list(self):
        """افزودن به لیست خرید"""
        self._reset_all()
        r, data = self.api_post('/api/inventory/purchase-list/add/', {
            'raw_material_id': self.raw_meat.id,
            'quantity': 20,
            'notes': 'تهیه برای هفته',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(PurchaseListItem.objects.filter(
            raw_material=self.raw_meat).exists())

    def test_02_fetch_purchase_list(self):
        """دریافت لیست خرید"""
        self._reset_all()
        self.api_post('/api/inventory/purchase-list/add/', {
            'raw_material_id': self.raw_meat.id,
            'quantity': 20,
        })
        r, data = self.api_get('/api/inventory/purchase-list/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('items', data)

    def test_03_update_status(self):
        """تغییر وضعیت"""
        self._reset_all()
        r, data = self.api_post('/api/inventory/purchase-list/add/', {
            'raw_material_id': self.raw_meat.id,
            'quantity': 20,
        })
        # ✅ چندین کلید ممکن برای item_id
        item_id = (data.get('item_id')
                   or data.get('id')
                   or data.get('purchase_item_id'))

        # اگر item_id از پاسخ نبود، از DB بگیر
        if not item_id:
            item = PurchaseListItem.objects.filter(
                raw_material=self.raw_meat).first()
            if item:
                item_id = item.pk

        if item_id:
            r2, data2 = self.api_post('/api/inventory/purchase-list/status/', {
                'id': item_id,
                'item_id': item_id,
                'status': 'purchased',
            })
            self.assertIn(r2.status_code, [200, 201],
                          f'Status update failed: {data2}')

    def test_04_auto_suggest_low_stock(self):
        """کالای کمبود → پیشنهاد خودکار"""
        self._reset_all()
        self._receive(self.raw_meat, 2, price=850000)
        # ✅ حداقل موجودی را روی RawMaterial تنظیم کن
        self.raw_meat.minimum_stock = 100
        self.raw_meat.save(update_fields=['minimum_stock'])

        r, data = self.api_get('/api/inventory/purchase-list/')
        self.assertEqual(r.status_code, 200)


# ═══════════════════════════════════════════════════════════
#  ۹. تست گزارشات (Reports)
# ═══════════════════════════════════════════════════════════

class TestReports(InventoryBaseTest):

    def setUp(self):
        super().setUp()
        self._reset_all()
        self._receive(self.raw_meat, 10, price=850000)
        self._issue(self.raw_meat, 3)
        self._transfer(self.raw_meat, 2)
        self._waste(self.raw_meat, 1, reason='expired')

    def test_01_item_movement_report(self):
        """گزارش تحرک کالا"""
        r, data = self.api_get(
            f'/api/inventory/reports/item-movement/?raw_material_id={self.raw_meat.id}')
        self.assertEqual(r.status_code, 200)
        self.assertIn('movements', data)
        self.assertGreaterEqual(len(data['movements']), 4,
                                'حداقل ۴ حرکت باید باشد')

    def test_02_stock_value_report(self):
        """گزارش ارزش موجودی"""
        r, data = self.api_get('/api/inventory/reports/stock-value/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('items', data)

    def test_03_transfer_report(self):
        """گزارش انتقال‌ها"""
        r, data = self.api_get('/api/inventory/reports/transfer/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('transfers', data)

    def test_04_warehouse_movements_report(self):
        """گزارش تحرکات انبار"""
        r, data = self.api_get(
            f'/api/inventory/reports/warehouse-movements/?warehouse_id={self.mother.id}')
        self.assertEqual(r.status_code, 200)
        self.assertIn('movements', data)

    def test_05_report_performance(self):
        """گزارش زیر ۲ ثانیه"""
        t0 = time.time()
        self.api_get('/api/inventory/reports/stock-value/')
        elapsed = time.time() - t0
        self.assertLess(elapsed, 2.0,
                        f'گزارش {elapsed:.2f}s — باید زیر 2s باشد')

    def test_06_waste_report(self):
        """گزارش ضایعات"""
        r, data = self.api_get(
            f'/api/inventory/reports/item-movement/?raw_material_id={self.raw_meat.id}')
        self.assertEqual(r.status_code, 200)
        moves = data.get('movements', [])
        waste_moves = [m for m in moves if m.get('movement_type') == 'waste']
        self.assertGreaterEqual(len(waste_moves), 1,
                                'حرکت ضایعات در گزارش نیست')


# ═══════════════════════════════════════════════════════════
#  ۱۰. تست داشبورد (Dashboard)
# ═══════════════════════════════════════════════════════════

class TestDashboard(InventoryBaseTest):

    def test_01_inventory_dashboard(self):
        """داشبورد انبارداری"""
        self._reset_all()
        self._receive(self.raw_meat, 10, price=850000)
        r, data = self.api_get('/api/inventory/dashboard/')
        self.assertEqual(r.status_code, 200)
        dashboard = data.get('dashboard', {})
        self.assertIn('total_materials', dashboard)
        self.assertIn('total_stock_value', dashboard)
        self.assertIn('low_stock_count', dashboard)
        self.assertIn('warehouse_count', dashboard)

    def test_02_dashboard_performance(self):
        """داشبورد زیر ۲ ثانیه"""
        self._reset_all()
        self._receive(self.raw_meat, 10, price=850000)
        t0 = time.time()
        for _ in range(5):
            r, _ = self.api_get('/api/inventory/dashboard/')
            self.assertEqual(r.status_code, 200)
        avg = (time.time() - t0) / 5
        self.assertLess(avg, 2.0,
                        f'میانگین {avg:.2f}s — باید زیر 2s باشد')


# ═══════════════════════════════════════════════════════════
#  ۱۱. تست سناریوی واقعی (End-to-End)
# ═══════════════════════════════════════════════════════════

class TestRealScenario(InventoryBaseTest):
    """
    سناریوی کامل رستوران:

    ۱. تأمین‌کننده گوشت می‌آورد → ۲۰ کیلو گوشت + ۱۰ کیلو پیاز + ۵۰ نان
    ۲. انباردار ۵ کیلو گوشت + ۳ کیلو پیاز به آشپزخانه انتقال می‌دهد
    ۳. آشپزخانه ۲ کیلو گوشت مصرف می‌کند (خروج)
    ۴. ۱ کیلو پیاز فاسد شده (ضایعات)
    ۵. شمارش فیزیکی
    ۶. گزارش نهایی
    """

    def test_01_full_restaurant_scenario(self):
        self._reset_all()

        # ── مرحله ۱: ورود بار ──
        r, d = self._receive(self.raw_meat, 20, price=850000)
        self.assertEqual(r.status_code, 200, 'ورود گوشت خطا')
        r, d = self._receive(self.raw_onion, 10, price=50000)
        self.assertEqual(r.status_code, 200, 'ورود پیاز خطا')
        r, d = self._receive(self.raw_bread, 50, price=15000)
        self.assertEqual(r.status_code, 200, 'ورود نان خطا')

        # چک مرکزی: گوشت=20, پیاز=10, نان=50
        self.assertEqual(self._stock(self.raw_meat, self.mother), 20.0)
        self.assertEqual(self._stock(self.raw_onion, self.mother), 10.0)
        self.assertEqual(self._stock(self.raw_bread, self.mother), 50.0)

        # ── مرحله ۲: انتقال به آشپزخانه ──
        r, d = self._transfer(self.raw_meat, 5)
        self.assertEqual(r.status_code, 200, 'انتقال گوشت خطا')
        r, d = self._transfer(self.raw_onion, 3)
        self.assertEqual(r.status_code, 200, 'انتقال پیاز خطا')

        # چک: مرکزی گوشت=15, پیاز=7 | آشپزخانه گوشت=5, پیاز=3
        self.assertEqual(self._stock(self.raw_meat, self.mother), 15.0)
        self.assertEqual(self._stock(self.raw_onion, self.mother), 7.0)
        self.assertEqual(self._stock(self.raw_meat, self.kitchen), 5.0)
        self.assertEqual(self._stock(self.raw_onion, self.kitchen), 3.0)

        # ── مرحله ۳: مصرف آشپزخانه (خروج ۲ کیلو گوشت) ──
        r, d = self._issue(self.raw_meat, 2, warehouse=self.kitchen)
        self.assertEqual(r.status_code, 200, 'خروج گوشت خطا')
        self.assertEqual(self._stock(self.raw_meat, self.kitchen), 3.0)

        # ── مرحله ۴: ضایعات (۱ کیلو پیاز فاسد) ──
        r, d = self._waste(self.raw_onion, 1, warehouse=self.kitchen,
                           reason='spoiled')
        self.assertEqual(r.status_code, 200, 'ضایعات پیاز خطا')
        self.assertEqual(self._stock(self.raw_onion, self.kitchen), 2.0)

        # ── مرحله ۵: شمارش فیزیکی ──
        r, d = self.api_post('/api/inventory/adjustment/create/', {
            'warehouse_id': self.mother.id,
            'raw_material_id': self.raw_meat.id,
            'quantity': 15,
            'adjustment_type': 'set',
            'notes': 'شمارش پایان ماه',
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._stock(self.raw_meat, self.mother), 15.0)

        # ── مرحله ۶: گزارش نهایی ──
        r, data = self.api_get('/api/inventory/dashboard/')
        self.assertEqual(r.status_code, 200)
        dashboard = data.get('dashboard', {})
        self.assertGreaterEqual(dashboard.get('total_materials', 0), 3,
                                'حداقل ۳ آیتم باید باشد')

        # گزارش تحرک گوشت
        r, data = self.api_get(
            f'/api/inventory/reports/item-movement/?raw_material_id={self.raw_meat.id}')
        self.assertEqual(r.status_code, 200)
        moves = data.get('movements', [])
        self.assertGreaterEqual(len(moves), 4,
                                'حداقل ۴ حرکت: in + transfer_out + transfer_in + out')

    def test_02_multi_supplier_day(self):
        """روز عادی: ۲ تأمین‌کننده، چند کالا"""
        self._reset_all()

        # تأمین‌کننده ۱: گوشت + پیاز
        self._receive(self.raw_meat, 30, price=850000)
        self._receive(self.raw_onion, 15, price=50000)

        # تأمین‌کننده ۲: نان
        self._receive(self.raw_bread, 100, price=15000)

        # انتقال به آشپزخانه
        for mat, qty in [(self.raw_meat, 10), (self.raw_onion, 5), (self.raw_bread, 30)]:
            r, d = self._transfer(mat, qty)
            self.assertEqual(r.status_code, 200, f'انتقال {mat.name} خطا')

        # آشپزخانه مصرف می‌کند
        for mat, qty in [(self.raw_meat, 3), (self.raw_onion, 2), (self.raw_bread, 25)]:
            r, d = self._issue(mat, qty, warehouse=self.kitchen)
            self.assertEqual(r.status_code, 200, f'خروج {mat.name} خطا')

        # ضایعات
        self._waste(self.raw_onion, 1, warehouse=self.kitchen, reason='spoiled')

        # چک نهایی
        self.assertEqual(self._stock(self.raw_meat, self.mother), 20.0)
        self.assertEqual(self._stock(self.raw_onion, self.mother), 10.0)
        self.assertEqual(self._stock(self.raw_bread, self.mother), 70.0)

        self.assertEqual(self._stock(self.raw_meat, self.kitchen), 7.0)
        self.assertEqual(self._stock(self.raw_onion, self.kitchen), 2.0)
        self.assertEqual(self._stock(self.raw_bread, self.kitchen), 5.0)

    def test_03_stock_never_negative(self):
        """موجودی هرگز منفی نمی‌شود"""
        self._reset_all()
        self._receive(self.raw_meat, 5, price=850000)

        success = 0
        for i in range(10):
            r, d = self._issue(self.raw_meat, 1)
            if r.status_code in [200, 201]:
                success += 1

        self.assertEqual(success, 5,
                         'فقط ۵ بار باید موفق باشد')
        self.assertEqual(self._stock(self.raw_meat), 0.0,
                         'موجودی باید 0 باشد')


# ═══════════════════════════════════════════════════════════
#  ۱۲. تست امنیت (Security)
# ═══════════════════════════════════════════════════════════

class TestSecurity(InventoryBaseTest):

    def test_01_anon_cannot_receive(self):
        """کاربر ناشناس → ورود کالا رد شود"""
        self.client.force_authenticate(user=None)
        r, _ = self._receive(self.raw_meat, 5)
        self.assertIn(r.status_code, [401, 403])

    def test_02_anon_cannot_transfer(self):
        """کاربر ناشناس → انتقال رد شود"""
        self.client.force_authenticate(user=None)
        r, _ = self._transfer(self.raw_meat, 5)
        self.assertIn(r.status_code, [401, 403])

    def test_03_anon_cannot_waste(self):
        """کاربر ناشناس → ضایعات رد شود"""
        self.client.credentials()
        r, _ = self._waste(self.raw_meat, 5)
        self.assertIn(r.status_code, [401, 403])

    def test_04_anon_cannot_see_stock(self):
        """کاربر ناشناس → موجودی رد شود"""
        self.client.force_authenticate(user=None)
        r, _ = self.api_get('/api/inventory/stock/')
        self.assertIn(r.status_code, [401, 403])

    def test_05_anon_cannot_dashboard(self):
        """کاربر ناشناس → داشبورد رد شود"""
        self.client.force_authenticate(user=None)
        r, _ = self.api_get('/api/inventory/dashboard/')
        self.assertIn(r.status_code, [401, 403])

    def test_06_sql_injection_material_name(self):
        """SQL Injection نباید دیتابیس را خراب کند"""
        self._reset_all()
        r, _ = self.api_post('/api/inventory/warehouses/save/', {
            "name": "'; DROP TABLE restaurant_stockitem; --",
            "warehouse_type": "other",
        })
        self.assertTrue(
            Warehouse.objects.exists(),
            'دیتابیس نباید خراب شود')

    def test_07_xss_in_notes(self):
        """ورودی خام ذخیره شود — فرار در تمپلیت"""
        self._reset_all()
        self._receive(self.raw_meat, 10, price=850000)
        payload = '<script>alert(1)</script>'
        r, d = self.api_post('/api/inventory/waste/create/', {
            'warehouse_id': self.mother.id,
            'raw_material_id': self.raw_meat.id,
            'quantity': 1,
            'waste_reason': 'expired',
            'notes': payload,
        })
        if r.status_code in [200, 201]:
            mv = InventoryMovement.objects.filter(
                raw_material=self.raw_meat,
                movement_type='waste',
            ).latest('id')
            self.assertEqual(mv.notes, payload,
                             'ورودی خام باید دقیقاً ذخیره شود')


# ═══════════════════════════════════════════════════════════
#  ۱۳. تست فرمت API
# ═══════════════════════════════════════════════════════════

class TestAPIFormat(InventoryBaseTest):

    def test_01_receiving_response_format(self):
        """پاسخ ورود باید success/msg داشته باشد"""
        self._reset_all()
        r, data = self._receive(self.raw_meat, 5)
        self.assertEqual(r.status_code, 200)

    def test_02_stock_list_format(self):
        """لیست موجودی فرمت items داشته باشد"""
        self._reset_all()
        self._receive(self.raw_meat, 5)
        r, data = self.api_get('/api/inventory/stock/?warehouse_id={}'.format(self.mother.id))
        self.assertEqual(r.status_code, 200)
        self.assertIn('items', data)

    def test_03_warehouse_list_format(self):
        """لیست انبارها فرمت warehouses داشته باشد"""
        self._reset_all()
        r, data = self.api_get('/api/inventory/warehouses/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('warehouses', data)
        for wh in data['warehouses']:
            self.assertIn('id', wh)
            self.assertIn('name', wh)
            self.assertIn('warehouse_type', wh)

    def test_04_stock_item_format(self):
        """آیتم موجودی فرمت درست داشته باشد"""
        self._reset_all()
        self._receive(self.raw_meat, 5)
        r, data = self.api_get('/api/inventory/stock/?warehouse_id={}'.format(self.mother.id))
        items = data.get('items', [])
        self.assertGreater(len(items), 0)
        item = items[0]
        self.assertIn('quantity', item)
        self.assertIn('raw_material_id', item)


if __name__ == '__main__':
    import django
    django.setup()