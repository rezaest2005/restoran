"""انبار ↔ حمل‌وتحویل: فاکتور فروش با پیک خود کسب‌وکار به مشتری می‌رسد؛ کامیون خودش بار خرید را از تأمین‌کننده می‌گیرد."""

import datetime
from decimal import Decimal as D

from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.accounting_posting import post_sales_invoice
from bizsuite.accounting_services import trial_balance
from bizsuite.delivery_services import change_trip_status, update_stop
from bizsuite.models import (
    Business, Customer, Driver, PurchaseInvoice, PurchaseInvoiceItem, SalesInvoice, SalesInvoiceItem, Supplier, Trip, TripStop, User,
)
from bizsuite.modules import CATALOG, apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

TODAY = datetime.date.today()


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="الف", slug="wd-one")
        cls.o = Business.objects.create(name="ب", slug="wd-two")
        cls.owner = User.objects.create_user(username="wd1", password="Pass12345!", role="owner", business=cls.b)
        cls.other = User.objects.create_user(username="wd2", password="Pass12345!", role="owner", business=cls.o)
        cls.drv = Driver.all_objects.create(business=cls.b, name="رضا")
        cls.cust = Customer.all_objects.create(business=cls.b, name="مشتری", phone="0912", address="تهران، میدان آزادی")
        cls.sup = Supplier.all_objects.create(business=cls.b, name="تأمین", phone="021", address="اصفهان، شهرک صنعتی")

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def sale(self, total=1000000, paid=0, method="credit"):
        inv = SalesInvoice.all_objects.create(business=self.b, customer=self.cust, customer_name=self.cust.name, total=total,
                                              paid_amount=paid, payment_method=method, date=TODAY, invoice_number="F7")
        SalesInvoiceItem.all_objects.create(business=self.b, invoice=inv, item_name="میلگرد", quantity=10, unit_price=100000)
        post_sales_invoice(inv)
        return inv

    def purchase(self):
        inv = PurchaseInvoice.all_objects.create(business=self.b, supplier=self.sup, supplier_name=self.sup.name, date=TODAY,
                                                 invoice_number="P3")
        PurchaseInvoiceItem.all_objects.create(business=self.b, invoice=inv, item_name="آرد", quantity=40, unit_price=50000)
        return inv

    def trip(self, stops, **kw):
        r = self.api.post("/api/delivery/trips/", {"stops": stops, **kw}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["data"]


class OutboundTests(Base):
    def test_sales_invoice_becomes_a_delivery_stop_with_customer_details(self):
        inv = self.sale()
        listed = self.api.get("/api/delivery/dispatchable/").json()["data"]
        self.assertEqual([x["id"] for x in listed["sales"]], [inv.id])
        self.assertEqual(listed["sales"][0]["address"], "تهران، میدان آزادی")
        t = self.trip([{"invoice_id": inv.id, "cod": True}], driver_id=self.drv.id)
        s = t["stops"][0]
        self.assertEqual((s["address"], s["phone"], s["stop_type"]), ("تهران، میدان آزادی", "0912", "delivery"))
        self.assertIn("میلگرد", s["cargo_description"])
        self.assertEqual(s["amount_due"], 1000000.0)                       # cash on delivery = what is still owed
        self.assertEqual(self.api.get("/api/delivery/dispatchable/").json()["data"]["sales"], [])

    def test_same_invoice_cannot_go_twice_but_returns_after_cancel(self):
        inv = self.sale()
        first = self.trip([{"invoice_id": inv.id}])
        again = self.api.post("/api/delivery/trips/", {"stops": [{"invoice_id": inv.id}]}, format="json")
        self.assertEqual(again.status_code, 400)
        self.api.post(f"/api/delivery/trips/{first['id']}/status/", {"status": "cancelled"}, format="json")
        self.assertEqual(len(self.api.get("/api/delivery/dispatchable/").json()["data"]["sales"]), 1)

    def test_cod_collection_clears_the_receivable_and_never_books_the_sale_twice(self):
        inv = self.sale()                                                  # credit sale: sales 1,000,000 / receivable 1,000,000
        t = self.trip([{"invoice_id": inv.id, "cod": True}], driver_id=self.drv.id)
        trip = Trip.all_objects.get(pk=t["id"])
        change_trip_status(trip, "in_progress")
        stop = TripStop.all_objects.get(trip=trip)
        update_stop(stop, "delivered", driver=self.drv, collected_amount=1000000, collected_method="cash")
        change_trip_status(trip, "completed")
        rows = {r["code"]: r for r in trial_balance(self.b)["rows"]}
        self.assertEqual(rows["4110"]["balance_credit"], D("1000000"))     # sale booked once, by the invoice
        self.assertEqual(rows.get("1130", {}).get("balance_debit", D(0)), D("0"))   # receivable fully cleared
        self.assertEqual(rows["1150"]["balance_debit"], D("1000000"))      # the courier holds the cash
        self.assertEqual(self.cust.total_debt, D("0"))
        self.assertTrue(trial_balance(self.b)["balanced"])

    def test_isolation_and_module_switch(self):
        inv = self.sale()
        c = APIClient()
        c.force_authenticate(self.other)
        self.assertEqual(c.get("/api/delivery/dispatchable/").json()["data"], {"sales": [], "purchases": []})
        self.assertEqual(c.post("/api/delivery/trips/", {"stops": [{"invoice_id": inv.id}]}, format="json").status_code, 400)
        apply_modules(self.b, {m["code"]: {"is_enabled": m["code"] == "delivery"} for m in CATALOG})   # no inventory
        clear_current_business()
        self.api.force_authenticate(User.objects.get(pk=self.owner.pk))
        self.assertEqual(self.api.get("/api/delivery/dispatchable/").json()["data"], {"sales": [], "purchases": []})


class InboundTests(Base):
    def test_own_truck_picks_up_a_purchase(self):
        inv = self.purchase()
        listed = self.api.get("/api/delivery/dispatchable/").json()["data"]
        self.assertEqual([x["id"] for x in listed["purchases"]], [inv.id])
        t = self.trip([{"purchase_id": inv.id}], driver_id=self.drv.id)
        s = t["stops"][0]
        self.assertEqual((s["stop_type"], s["address"], s["phone"]), ("pickup", "اصفهان، شهرک صنعتی", "021"))
        self.assertIn("آرد", s["cargo_description"])
        self.assertEqual(s["amount_due"], 0.0)                             # nothing is collected from a supplier
        again = self.api.post("/api/delivery/trips/", {"stops": [{"purchase_id": inv.id}]}, format="json")
        self.assertEqual(again.status_code, 400)
        self.assertEqual(self.api.get("/api/delivery/dispatchable/").json()["data"]["purchases"], [])

    def test_one_trip_can_mix_a_pickup_and_a_delivery(self):
        t = self.trip([{"purchase_id": self.purchase().id}, {"invoice_id": self.sale().id}], driver_id=self.drv.id)
        self.assertEqual([s["stop_type"] for s in t["stops"]], ["pickup", "delivery"])
