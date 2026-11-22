"""QR ordering end to end: menu link -> public order -> cashier panel -> accept / reject."""
from bizsuite.features import POS_ACTION_KEYS
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, Category, Food, Order, User
from bizsuite.modules import apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

ALL = ["pos", "club", "inventory", "production", "accounting", "delivery", "feedback"]


class QrFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.biz = Business.objects.create(name="فروشگاه", slug="qrf-one")
        cat = Category.all_objects.create(business=cls.biz, name="دسته")
        cls.food = Food.all_objects.create(
            business=cls.biz, category=cat, name="محصول", price=10000, final_price=10000,
            stock=10, is_available=True)
        cls.cashier = User.objects.create_user(
            username="qrf-c", password="Pass12345!", role="cashier", business=cls.biz,
            dashboard_permissions=["pos", *POS_ACTION_KEYS])
        cls.owner = User.objects.create_user(
            username="qrf-o", password="Pass12345!", role="owner", business=cls.biz)

    def setUp(self):
        cache.clear()
        clear_current_business()
        self.anon = APIClient()
        self.staff = APIClient()
        self.staff.force_authenticate(self.cashier)

    def place(self, qty=2, table="4"):
        return self.anon.post("/api/menu/order/", {
            "business_slug": "qrf-one", "table": table, "customer_name": "سارا",
            "items": [{"food_id": self.food.id, "quantity": qty}]}, format="json")

    def test_qr_order_appears_in_cashier_panel_and_can_be_accepted(self):
        r = self.place()
        self.assertEqual(r.status_code, 201, r.content)
        oid = r.json()["data"]["order_id"]
        panel = self.staff.get("/api/pos/online-orders/").json()["orders"]
        self.assertEqual([o["id"] for o in panel], [oid])
        self.assertEqual(panel[0]["table_number"], "4")
        self.assertEqual(panel[0]["source"], "qr")
        acc = self.staff.post(f"/api/orders/{oid}/status/", {"status": "confirmed"}, format="json")
        self.assertEqual(acc.status_code, 200, acc.content)
        order = Order.all_objects.get(pk=oid)
        self.assertEqual(order.status, "confirmed")
        self.assertEqual(order.confirmed_by_id, self.cashier.id)
        # no longer pending in the incoming list
        self.assertEqual(self.staff.get("/api/pos/online-orders/").json()["orders"], [])
        self.food.refresh_from_db()
        self.assertEqual(self.food.stock, 8)  # accepted order keeps the stock reserved

    def test_reject_restores_stock_and_cannot_repeat(self):
        oid = self.place(qty=3).json()["data"]["order_id"]
        self.food.refresh_from_db()
        self.assertEqual(self.food.stock, 7)
        r = self.staff.post(f"/api/pos/online-orders/{oid}/reject/", {}, format="json")
        self.assertEqual(r.status_code, 200)
        self.food.refresh_from_db()
        self.assertEqual(self.food.stock, 10)
        again = self.staff.post(f"/api/pos/online-orders/{oid}/reject/", {}, format="json")
        self.assertEqual(again.status_code, 400)
        self.food.refresh_from_db()
        self.assertEqual(self.food.stock, 10)  # no double restore

    def test_accepted_order_cannot_be_rejected(self):
        oid = self.place().json()["data"]["order_id"]
        self.staff.post(f"/api/orders/{oid}/status/", {"status": "confirmed"}, format="json")
        r = self.staff.post(f"/api/pos/online-orders/{oid}/reject/", {}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_modules_off_blocks_public_ordering_and_menu(self):
        apply_modules(self.biz, {c: {"is_enabled": c == "feedback"} for c in ALL})
        self.assertEqual(self.place().status_code, 404)
        self.assertEqual(Order.all_objects.count(), 0)
        r = self.anon.get("/api/menu/public/?business_slug=qrf-one")
        self.assertEqual(r.status_code, 404)
        # cashier panel is not available either
        self.assertEqual(self.staff.get("/api/pos/online-orders/").status_code, 403)

    def test_pos_alone_is_enough_for_qr_ordering(self):
        apply_modules(self.biz, {c: {"is_enabled": c == "pos"} for c in ALL})
        self.assertEqual(self.place().status_code, 201)
        res = self.anon.get("/api/menu/public/?business_slug=qrf-one")
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("stock", res.json()["results"][0])   # public menu never leaks stock/cost
        self.assertNotIn("cost", res.json()["results"][0])

