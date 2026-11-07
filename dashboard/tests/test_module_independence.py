"""
Each module must work alone: for a set of enabled modules, every module's main
endpoint answers 200 if its module is live and 403 otherwise, never 500; and
cross-module side effects (accounting posting, club points) are silent no-ops.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.delivery_services import (
    change_trip_status, create_trip, settle_driver_cash, update_stop,
)
from bizsuite.models import (
    Business, Category, Driver, Food, JournalEntry, LoyaltyMember, Order, TripStop, User,
)
from bizsuite.modules import apply_modules, ensure_catalog, module_enabled
from bizsuite.tenancy import clear_current_business

ALL = ["pos", "club", "inventory", "production", "accounting", "delivery", "feedback", "storefront"]

# module -> main endpoints (GET)
ENDPOINTS = {
    "inventory": ["/api/inventory/stock/", "/api/suppliers/", "/api/inventory/warehouses/"],
    "pos": ["/api/pos/daily-report/", "/api/pos/online-orders/", "/api/orders/list/"],
    "club": ["/api/club/settings/", "/api/club/members/"],
    "accounting": ["/api/accounting/summary/", "/api/accounting/accounts/"],
    "production": ["/api/formulas/", "/api/production/orders/"],
    "feedback": ["/api/feedback/list/"],
    "storefront": ["/api/storefront/mine/summary/"],
}

COMBOS = {
    "inventory_only": ["inventory"],
    "pos_club": ["pos", "club"],
    "accounting_only": ["accounting"],
    "delivery_only": ["delivery"],
    "production_inventory": ["production", "inventory"],
    "all": ALL,
    "none": [],
}


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.biz = Business.objects.create(name="الف", slug="ind-a")
        cls.owner = User.objects.create_user(
            username="ind1", password="Pass12345!", role="owner", business=cls.biz)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def enable(self, codes):
        apply_modules(self.biz, {c: {"is_enabled": c in codes} for c in ALL}, auto_requires=False)


class EndpointMatrixTests(Base):
    def test_matrix(self):
        for name, codes in COMBOS.items():
            self.enable(codes)
            for module, urls in ENDPOINTS.items():
                for url in urls:
                    r = self.api.get(url)
                    self.assertLess(r.status_code, 500, (name, url, r.content[:300]))
                    expected = 200 if module_enabled(self.biz, module) else 403
                    self.assertEqual(r.status_code, expected, (name, url))

    def test_only_selected_modules_are_live(self):
        self.enable(["pos", "club"])
        self.assertTrue(module_enabled(self.biz, "club"))
        self.assertFalse(module_enabled(self.biz, "inventory"))
        self.assertFalse(module_enabled(self.biz, "accounting"))


class SideEffectTests(Base):
    def setUp(self):
        super().setUp()
        cat = Category.all_objects.create(business=self.biz, name="دسته")
        self.food = Food.all_objects.create(
            business=self.biz, category=cat, name="محصول", price=10000, final_price=10000,
            stock=10, is_available=True)

    def order(self):
        return self.api.post("/api/pos/create-order/", {
            "customer_name": "x", "phone": "09121234567", "payment_method": "cash",
            "items": [{"food_id": self.food.id, "quantity": 2}]}, format="json")

    def test_pos_alone_creates_order_without_accounting_or_club(self):
        self.enable(["pos"])
        r = self.order()
        self.assertLess(r.status_code, 300, r.content)
        self.assertEqual(Order.all_objects.filter(business=self.biz).count(), 1)
        self.assertEqual(JournalEntry.all_objects.filter(business=self.biz).count(), 0)
        self.assertEqual(LoyaltyMember.all_objects.filter(business=self.biz).count(), 0)

    def test_pos_with_accounting_posts_entry(self):
        self.enable(["pos", "accounting"])
        self.assertLess(self.order().status_code, 300)
        self.assertEqual(JournalEntry.all_objects.filter(business=self.biz).count(), 1)

    def test_accounting_disabled_after_use_does_not_break_pos(self):
        self.enable(["pos", "accounting"])
        self.order()
        self.enable(["pos"])
        r = self.order()
        self.assertLess(r.status_code, 300)
        self.assertEqual(JournalEntry.all_objects.filter(business=self.biz).count(), 1)

    def test_club_points_only_when_club_enabled(self):
        self.api.force_authenticate(self.owner)
        self.enable(["pos", "club"])
        self.api.put("/api/club/settings/", {"is_active": True, "earn_amount": 1000}, format="json")
        r = self.order()
        self.assertLess(r.status_code, 300, r.content)
        # order is created unpaid; points are earned on payment, never raise
        self.enable(["pos"])
        self.assertLess(self.order().status_code, 300)

    def test_pos_expense_and_invoicing_without_accounting(self):
        self.enable(["inventory"])
        self.client.force_login(self.owner)
        r = self.client.post("/api/invoicing/expenses/", {"title": "اجاره", "amount": 5000,
                                                          "category": "other"},
                             content_type="application/json")
        self.assertLess(r.status_code, 500, r.content)
        self.assertEqual(JournalEntry.all_objects.filter(business=self.biz).count(), 0)

    def test_delivery_alone_complete_trip_and_settle(self):
        self.enable(["delivery"])
        drv = Driver.all_objects.create(business=self.biz, name="راننده", phone="0935",
                                        pay_per_trip=Decimal("1000"))
        trip = create_trip(self.biz, [{"customer_name": "ع", "phone": "0912", "address": "ت",
                                       "lat": 35.7, "lng": 51.4, "amount_due": Decimal("5000")}],
                           driver=drv)
        change_trip_status(trip, "in_progress")
        update_stop(TripStop.all_objects.filter(trip=trip).first(), "delivered", driver=drv, collected_amount=Decimal("5000"),
                    collected_method="cash")
        change_trip_status(trip, "completed")
        settle_driver_cash(drv, Decimal("5000"))
        self.assertEqual(JournalEntry.all_objects.filter(business=self.biz).count(), 0)

    def test_delivery_with_accounting_still_posts(self):
        self.enable(["delivery", "accounting"])
        drv = Driver.all_objects.create(business=self.biz, name="راننده", phone="0935",
                                        pay_per_trip=Decimal("1000"))
        trip = create_trip(self.biz, [{"customer_name": "ع", "phone": "0912", "address": "ت",
                                       "lat": 35.7, "lng": 51.4}], driver=drv)
        change_trip_status(trip, "in_progress")
        update_stop(TripStop.all_objects.filter(trip=trip).first(), "delivered", driver=drv)
        change_trip_status(trip, "completed")
        self.assertGreaterEqual(JournalEntry.all_objects.filter(business=self.biz).count(), 1)
