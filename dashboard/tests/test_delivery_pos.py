"""صندوق ← پیک: سفارش پیک، صف ارسال، پرداخت در محل، بار و پیگیری صاحب بار."""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, Category, Driver, Food, Order, Trip, TripStop, User
from bizsuite.modules import CATALOG, apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

P = "Pass12345!"


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="الف", slug="dp-one")
        cls.o = Business.objects.create(name="ب", slug="dp-two")
        cls.owner = User.objects.create_user(username="dp1", password=P, role="owner", business=cls.b)
        cls.cashier = User.objects.create_user(username="dp2", password=P, role="cashier", business=cls.b)
        cls.cat = Category.all_objects.create(business=cls.b, name="c")
        cls.food = Food.all_objects.create(business=cls.b, category=cls.cat, name="پیتزا", price=1000, stock=50)
        cls.drv = Driver.all_objects.create(business=cls.b, name="رضا")
        cls.foreign_drv = Driver.all_objects.create(business=cls.o, name="بیگانه")

    def setUp(self):
        clear_current_business()
        cache.clear()
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def order(self, **kw):
        body = {"items": [{"food_id": self.food.id, "quantity": 2}], "source": "pos",
                "order_type": "delivery", "customer_name": "علی", "phone": "0912",
                "delivery_address": "تهران، خیابان آزادی"}
        body.update(kw)
        return self.api.post("/api/pos/create-order/", body, format="json").json()


class PosDeliveryTests(Base):
    def test_delivery_order_requires_address(self):
        res = self.order(delivery_address="")
        self.assertFalse(res["success"])
        self.assertEqual(Order.all_objects.count(), 0)

    def test_order_without_driver_goes_to_queue_then_dispatch_once(self):
        res = self.order()
        self.assertTrue(res["success"])
        self.assertTrue(res["dispatch"]["queued"])
        q = self.api.get("/api/delivery/pending-orders/").json()["data"]
        self.assertEqual([x["id"] for x in q], [res["order_id"]])
        self.assertEqual(q[0]["address"], "تهران، خیابان آزادی")
        r = self.api.post("/api/delivery/trips/", {
            "driver_id": self.drv.id, "stops": [{"order_id": res["order_id"]}]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        stop = r.json()["data"]["stops"][0]
        self.assertEqual(stop["address"], "تهران، خیابان آزادی")   # از سفارش پر می‌شود
        self.assertEqual(stop["amount_due"], 0.0)                   # پرداخت‌شده؛ وصولی ندارد
        self.assertEqual(self.api.get("/api/delivery/pending-orders/").json()["data"], [])
        again = self.api.post("/api/delivery/trips/", {"stops": [{"order_id": res["order_id"]}]}, format="json")
        self.assertEqual(again.status_code, 400)                    # یک سفارش، یک مأموریت

    def test_driver_chosen_in_pos_creates_trip_with_tracking_and_cod(self):
        res = self.order(driver_id=self.drv.id, cod=True)
        self.assertFalse(res["dispatch"]["queued"])
        stop = TripStop.all_objects.get(order_id=res["order_id"])
        self.assertEqual(stop.public_token, res["dispatch"]["tracking_token"])
        self.assertEqual(stop.amount_due, 2000)                      # پرداخت در محل
        self.assertEqual(Order.all_objects.get(pk=res["order_id"]).payment_status, "pending")
        t = self.client.get(f"/api/delivery/track/{stop.public_token}/").json()["data"]
        self.assertEqual(t["kind"], "stop")

    def test_foreign_driver_is_not_used(self):
        res = self.order(driver_id=self.foreign_drv.id)
        self.assertTrue(res["success"])
        self.assertTrue(res["dispatch"]["queued"])
        self.assertEqual(TripStop.all_objects.count(), 0)

    def test_other_business_cannot_see_queue(self):
        self.order()
        other = User.objects.create_user(username="dp9", password=P, role="owner", business=self.o)
        c = APIClient()
        c.force_authenticate(other)
        self.assertEqual(c.get("/api/delivery/pending-orders/").json()["data"], [])

    def test_delivery_off_ignores_delivery_fields_without_error(self):
        apply_modules(self.b, {m["code"]: {"is_enabled": m["code"] == "pos"} for m in CATALOG})
        res = self.order(delivery_address="")
        self.assertTrue(res["success"])
        self.assertIsNone(res["dispatch"])
        self.assertEqual(self.api.get("/api/delivery/pending-orders/").status_code, 403)


class ShipmentTests(Base):
    def make(self, **kw):
        body = {
            "shipper_name": "شرکت فولاد", "shipper_phone": "021", "cargo_description": "۱۲ تن میلگرد ۱۴",
            "cargo_weight_kg": 12000, "origin_name": "اهواز", "destination_name": "تهران",
            "stops": [{"customer_name": "انبار تهران", "address": "جاده ساوه",
                       "cargo_description": "میلگرد"}],
        }
        body.update(kw)
        return self.api.post("/api/delivery/trips/", body, format="json")

    def test_shipment_stores_cargo_and_gives_shipper_a_tracking_link(self):
        r = self.make(driver_id=self.drv.id)
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()["data"]
        self.assertEqual(d["cargo_description"], "۱۲ تن میلگرد ۱۴")
        self.assertEqual(d["shipper_name"], "شرکت فولاد")
        tok = d["tracking_token"]
        pub = self.client.get(f"/api/delivery/track/{tok}/").json()["data"]
        self.assertEqual(pub["kind"], "shipment")
        self.assertEqual(pub["cargo_description"], "۱۲ تن میلگرد ۱۴")
        self.assertEqual(pub["destination_name"], "تهران")
        self.assertEqual(pub["stops"][0]["cargo_description"], "میلگرد")
        self.assertNotIn("amount_due", pub)

    def test_shipment_link_dies_when_module_off_and_unknown_token_404(self):
        tok = self.make().json()["data"]["tracking_token"]
        apply_modules(self.b, {m["code"]: {"is_enabled": m["code"] == "pos"} for m in CATALOG})
        self.assertEqual(self.client.get(f"/api/delivery/track/{tok}/").status_code, 404)
        self.assertEqual(self.client.get("/api/delivery/track/nope/").status_code, 404)

    def test_shipments_tab_switch_blocks_trips_api_only_if_both_trip_tabs_off(self):
        apply_modules(self.b, {m["code"]: {"is_enabled": m["code"] == "delivery"} for m in CATALOG})
        self.b.disabled_features = ["delivery_shipments"]
        self.b.save()
        self.assertEqual(self.api.get("/api/delivery/trips/").status_code, 200)   # dispatch still on
        self.b.disabled_features = ["delivery_shipments", "delivery_dispatch"]
        self.b.save()
        self.assertEqual(self.api.get("/api/delivery/trips/").status_code, 403)
