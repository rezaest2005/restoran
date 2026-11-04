from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Category, Food, Order, Business, User
from bizsuite.tenancy import clear_current_business

SUBMIT = "/api/menu/order/"
PUBLIC_MENU = "/api/menu/public/"
INCOMING = "/api/pos/online-orders/"


class QrOrderTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r1 = Business.objects.create(name="یک", slug="qr-one")
        cls.r2 = Business.objects.create(name="دو", slug="qr-two")
        cls.off = Business.objects.create(name="خاموش", slug="qr-off", is_active=False)
        c1 = Category.all_objects.create(business=cls.r1, name="دسته")
        c2 = Category.all_objects.create(business=cls.r2, name="دسته")
        cls.f1 = Food.all_objects.create(
            business=cls.r1, category=c1, name="محصول الف", price=10000,
            final_price=9000, stock=5, is_available=True)
        cls.f2 = Food.all_objects.create(
            business=cls.r2, category=c2, name="محصول ب", price=7000,
            final_price=7000, stock=5, is_available=True)
        cls.cashier = User.objects.create_user(
            username="cash1", password="Pass12345!", role="cashier",
            business=cls.r1, dashboard_permissions=["pos"])

    def setUp(self):
        cache.clear()
        clear_current_business()
        self.anon = APIClient()

    def _post(self, **over):
        body = {"business_slug": "qr-one", "table": "7", "customer_name": "سارا",
                "items": [{"food_id": self.f1.id, "quantity": 2}]}
        body.update(over)
        return self.anon.post(SUBMIT, body, format="json")

    def test_submit_uses_server_price_and_sets_table(self):
        res = self._post(items=[{"food_id": self.f1.id, "quantity": 2, "price": 1}])
        self.assertEqual(res.status_code, 201)
        o = Order.all_objects.get(id=res.json()["data"]["order_id"])
        self.assertEqual(o.source, "qr")
        self.assertEqual(o.table_number, "7")
        self.assertEqual(int(o.total_price), 18000)  # 2 × 9000، نه قیمت کلاینت
        self.assertEqual(o.business, self.r1)
        self.f1.refresh_from_db()
        self.assertEqual(self.f1.stock, 3)

    def test_food_of_other_business_rejected(self):
        res = self._post(items=[{"food_id": self.f2.id, "quantity": 1}])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Order.all_objects.count(), 0)

    def test_unknown_and_inactive_slug(self):
        self.assertEqual(self._post(business_slug="nope").status_code, 404)
        self.assertEqual(self._post(business_slug="qr-off").status_code, 404)

    def test_insufficient_stock_and_bad_quantity(self):
        self.assertEqual(self._post(items=[{"food_id": self.f1.id, "quantity": 6}]).status_code, 400)
        self.assertEqual(self._post(items=[{"food_id": self.f1.id, "quantity": 0}]).status_code, 400)
        self.assertEqual(self._post(items=[]).status_code, 400)
        self.assertEqual(Order.all_objects.count(), 0)

    def test_bad_table_rejected(self):
        self.assertEqual(self._post(table="<script>").status_code, 400)

    def test_honeypot_saves_nothing(self):
        res = self._post(website="x")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Order.all_objects.count(), 0)

    def test_rate_limit(self):
        for _ in range(10):
            self.f1.stock = 100
            self.f1.save()
            self.assertEqual(self._post(items=[{"food_id": self.f1.id, "quantity": 1}]).status_code, 201)
        self.assertEqual(self._post(items=[{"food_id": self.f1.id, "quantity": 1}]).status_code, 429)

    def test_public_menu_by_slug_is_scoped(self):
        res = self.anon.get(PUBLIC_MENU, {"business_slug": "qr-one"})
        self.assertEqual(res.status_code, 200)
        names = [x["name"] for x in res.json()["results"]]
        self.assertEqual(names, ["محصول الف"])
        self.assertEqual(self.anon.get(PUBLIC_MENU, {"business_slug": "nope"}).status_code, 404)

    def test_cashier_sees_qr_orders_with_table_only_of_own_business(self):
        self._post()
        other = APIClient()
        other.post(SUBMIT, {"business_slug": "qr-two", "table": "3",
                            "items": [{"food_id": self.f2.id, "quantity": 1}]}, format="json")
        staff = APIClient()
        staff.force_authenticate(self.cashier)
        res = staff.get(INCOMING)
        self.assertEqual(res.status_code, 200)
        orders = res.json()["orders"]
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["table_number"], "7")
        self.assertEqual(orders[0]["source"], "qr")


class CancelRestoresStockTests(QrOrderTests):
    def test_reject_and_cancel_restore_stock(self):
        res = self._post(items=[{"food_id": self.f1.id, "quantity": 2}])
        oid = res.json()["data"]["order_id"]
        self.f1.refresh_from_db()
        self.assertEqual(self.f1.stock, 3)
        staff = APIClient()
        staff.force_authenticate(self.cashier)
        rej = staff.post(f"/api/pos/online-orders/{oid}/reject/", {}, format="json")
        self.assertEqual(rej.status_code, 200, rej.content)
        self.f1.refresh_from_db()
        self.assertEqual(self.f1.stock, 5)

        res2 = self._post(items=[{"food_id": self.f1.id, "quantity": 1}])
        oid2 = res2.json()["data"]["order_id"]
        ch = staff.post(f"/api/orders/{oid2}/status/", {"status": "cancelled"}, format="json")
        self.assertEqual(ch.status_code, 200, ch.content)
        self.f1.refresh_from_db()
        self.assertEqual(self.f1.stock, 5)
