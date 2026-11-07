from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, Category, Food, Order, OrderItem, User
from bizsuite.modules import apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

URL = "/api/pos/day-summary/"


class DaySummaryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="الف", slug="ds-one")
        cls.o = Business.objects.create(name="ب", slug="ds-two")
        cls.user = User.objects.create_user(username="ds1", password="Pass12345!", role="owner", business=cls.b)
        cls.cat = Category.all_objects.create(business=cls.b, name="c")
        cls.f1 = Food.all_objects.create(business=cls.b, category=cls.cat, name="الف", price=100, stock=100)
        cls.f2 = Food.all_objects.create(business=cls.b, category=cls.cat, name="ب", price=500, stock=100)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def order(self, biz, lines, method="cash", status="delivered"):
        o = Order.all_objects.create(business=biz, status=status, payment_method=method, source="pos")
        for food, q in lines:
            OrderItem.all_objects.create(business=biz, order=o, food=food, item_name=food.name,
                                         quantity=q, price=food.price)
        o.recalculate_total()
        return o

    def test_totals_and_cancelled_excluded(self):
        self.order(self.b, [(self.f1, 3), (self.f2, 1)], "cash")      # 800
        self.order(self.b, [(self.f2, 2)], "card")                     # 1000
        self.order(self.b, [(self.f1, 1)], "online")                   # 100
        self.order(self.b, [(self.f2, 9)], "cash", status="cancelled")
        d = self.api.get(URL).json()
        self.assertEqual(d["order_count"], 3)
        self.assertEqual(d["cancelled_count"], 1)
        self.assertEqual(d["total_sales"], 1900)
        self.assertEqual(d["average_ticket"], 633)
        pm = {m["method"]: m for m in d["payment_methods"]}
        self.assertEqual((pm["cash"]["total"], pm["card"]["total"], pm["online"]["total"]), (800, 1000, 100))
        self.assertEqual(d["top_by_quantity"][0]["qty"], 4)
        self.assertEqual(d["top_by_revenue"][0]["revenue"], 1500)
        self.assertEqual(sum(h["count"] for h in d["hourly"]), 3)
        self.assertEqual(len(d["hourly"]), 24)

    def test_tenant_isolation(self):
        c = Category.all_objects.create(business=self.o, name="x")
        f = Food.all_objects.create(business=self.o, category=c, name="z", price=999, stock=5)
        self.order(self.o, [(f, 1)])
        d = self.api.get(URL).json()
        self.assertEqual((d["order_count"], d["total_sales"]), (0, 0))

    def test_other_date_empty_and_bad_date(self):
        self.order(self.b, [(self.f1, 1)])
        self.assertEqual(self.api.get(URL, {"date": "2001-01-01"}).json()["order_count"], 0)
        self.assertEqual(self.api.get(URL, {"date": "nope"}).status_code, 400)

    def test_permission(self):
        self.assertEqual(APIClient().get(URL).status_code in (401, 403), True)
        codes = ["pos", "club", "inventory", "production", "accounting", "delivery", "feedback", "storefront"]
        apply_modules(self.b, {c: {"is_enabled": False} for c in codes}, auto_requires=False)
        self.assertEqual(self.api.get(URL).status_code, 403)
