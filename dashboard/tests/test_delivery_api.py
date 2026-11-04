from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.accounting_services import CASH
from bizsuite.models import Business, Driver, Trip, TripStop, User, Vehicle
from bizsuite.modules import apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

P = "Pass12345!"
ALL = ["pos", "club", "inventory", "production", "accounting", "delivery", "feedback", "storefront"]


def stop(**kw):
    base = {"customer_name": "علی", "phone": "0912", "address": "تهران", "lat": 35.70, "lng": 51.40,
            "amount_due": 100000}
    base.update(kw)
    return base


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b1 = Business.objects.create(name="الف", slug="dla-one")
        cls.b2 = Business.objects.create(name="ب", slug="dla-two")
        cls.owner = User.objects.create_user(username="dlo1", password=P, role="owner", business=cls.b1)
        cls.owner2 = User.objects.create_user(username="dlo2", password=P, role="owner", business=cls.b2)
        cls.du1 = User.objects.create_user(username="dld1", password=P, role="driver", business=cls.b1)
        cls.du2 = User.objects.create_user(username="dld2", password=P, role="driver", business=cls.b1)
        cls.cust = User.objects.create_user(username="dlc1", password=P, role="cashier", business=cls.b1)
        cls.drv1 = Driver.all_objects.create(business=cls.b1, name="راننده یک", user=cls.du1)
        cls.drv2 = Driver.all_objects.create(business=cls.b1, name="راننده دو", user=cls.du2)

    def setUp(self):
        clear_current_business()
        cache.clear()
        self.api = self.client_for(self.owner)

    @staticmethod
    def client_for(user):
        c = APIClient()
        if user is not None:
            c.force_authenticate(user)
        return c

    def mk_trip(self, driver=None, **kw):
        body = {"stops": [stop()], **kw}
        if driver:
            body["driver_id"] = driver.pk
        r = self.api.post("/api/delivery/trips/", body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["data"]


class CrudTests(Base):
    def test_crud_and_tenant_isolation(self):
        v = self.api.post("/api/delivery/vehicles/", {"name": "موتور", "kind": "motorbike",
                                                      "generate_device_key": True}, format="json")
        self.assertEqual(v.status_code, 201, v.content)
        vid = v.json()["data"]["id"]
        self.assertTrue(v.json()["data"]["device_key"])
        c = self.api.post("/api/delivery/carriers/", {"name": "پست", "is_external": True}, format="json")
        cid = c.json()["data"]["id"]
        d = self.api.post("/api/delivery/drivers/", {"name": "تازه", "default_vehicle_id": vid,
                                                     "carrier_id": cid, "pay_per_trip": 5000}, format="json")
        self.assertEqual(d.status_code, 201, d.content)
        did = d.json()["data"]["id"]
        other = self.client_for(self.owner2)
        for kind, pk in (("vehicles", vid), ("carriers", cid), ("drivers", did)):
            self.assertEqual(other.put(f"/api/delivery/{kind}/{pk}/", {"name": "x"}, format="json").status_code, 404)
            self.assertEqual(other.delete(f"/api/delivery/{kind}/{pk}/").status_code, 404)
            self.assertEqual(other.get(f"/api/delivery/{kind}/").json()["data"], [])
        self.assertEqual(other.post("/api/delivery/drivers/", {"name": "غ", "carrier_id": cid},
                                    format="json").status_code, 400)
        self.assertEqual(self.api.put(f"/api/delivery/vehicles/{vid}/", {"name": "موتور ۲"},
                                      format="json").json()["data"]["name"], "موتور ۲")
        self.assertEqual(self.api.delete(f"/api/delivery/drivers/{did}/").status_code, 200)

    def test_driver_user_link_rules(self):
        r = self.api.post("/api/delivery/drivers/", {"name": "x", "user_id": self.owner2.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.api.post("/api/delivery/drivers/", {"name": "x", "user_id": self.cust.pk}, format="json")
        self.assertEqual(r.status_code, 400)       # صندوقدار مجاز نیست
        r = self.api.post("/api/delivery/drivers/", {"name": "x", "user_id": self.du1.pk}, format="json")
        self.assertEqual(r.status_code, 400)       # قبلاً متصل است

    def test_shift(self):
        r = self.api.post(f"/api/delivery/drivers/{self.drv1.pk}/shift/", {"on": True}, format="json")
        self.assertTrue(r.json()["data"]["on_shift"])
        other = self.client_for(self.owner2)
        self.assertEqual(other.post(f"/api/delivery/drivers/{self.drv1.pk}/shift/", {"on": True},
                                    format="json").status_code, 404)

    def test_trip_isolation_and_filters(self):
        t = self.mk_trip(self.drv1)
        other = self.client_for(self.owner2)
        self.assertEqual(other.get(f"/api/delivery/trips/{t['id']}/").status_code, 404)
        self.assertEqual(other.get("/api/delivery/trips/").json()["data"]["total"], 0)
        self.assertEqual(other.post(f"/api/delivery/trips/{t['id']}/status/", {"status": "cancelled"},
                                    format="json").status_code, 404)
        self.assertEqual(self.api.get("/api/delivery/trips/?status=assigned").json()["data"]["total"], 1)
        self.assertEqual(self.api.get("/api/delivery/trips/?status=planned").json()["data"]["total"], 0)
        self.assertEqual(self.api.get(f"/api/delivery/trips/?driver_id={self.drv2.pk}").json()["data"]["total"], 0)
        d = self.api.get(f"/api/delivery/trips/{t['id']}/").json()["data"]
        self.assertEqual(d["totals"]["amount_due"], 100000)
        self.assertEqual(len(d["stops"]), 1)
        foreign = Driver.all_objects.create(business=self.b2, name="غریبه")
        r = self.api.post("/api/delivery/trips/", {"stops": [stop()], "driver_id": foreign.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.api.post("/api/delivery/trips/", {"stops": []}, format="json").status_code, 400)


class FlowTests(Base):
    def test_status_transitions_and_cod_settlement(self):
        t = self.mk_trip()
        self.assertEqual(t["status"], "planned")
        r = self.api.post(f"/api/delivery/trips/{t['id']}/status/", {"status": "in_progress"}, format="json")
        self.assertEqual(r.status_code, 400)                      # بدون راننده
        r = self.api.post(f"/api/delivery/trips/{t['id']}/assign/", {"driver_id": self.drv1.pk}, format="json")
        self.assertEqual(r.json()["data"]["status"], "assigned")
        sid = r.json()["data"]["stops"][0]["id"]
        r = self.api.post(f"/api/delivery/stops/{sid}/status/", {"status": "failed"}, format="json")
        self.assertEqual(r.status_code, 400)                      # علت لازم است
        for st in ("picked_up", "arrived"):
            self.assertEqual(self.api.post(f"/api/delivery/stops/{sid}/status/", {"status": st},
                                           format="json").status_code, 200)
        r = self.api.post(f"/api/delivery/stops/{sid}/status/",
                          {"status": "delivered", "collected_amount": 100000, "collected_method": "cash"},
                          format="json")
        self.assertEqual(r.status_code, 200, r.content)
        r = self.api.post(f"/api/delivery/trips/{t['id']}/status/", {"status": "completed"}, format="json")
        self.assertEqual(r.json()["data"]["status"], "completed")
        cash = {x["driver_id"]: x["uncollected"] for x in self.api.get("/api/delivery/cash/").json()["data"]}
        self.assertEqual(cash[self.drv1.pk], 100000)
        r = self.api.post("/api/delivery/settlements/", {"driver_id": self.drv1.pk, "received_amount": 90000,
                                                         "deposit_account": CASH}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["data"]["difference"], -10000)
        self.assertEqual(len(self.api.get(f"/api/delivery/settlements/?driver_id={self.drv1.pk}").json()["data"]), 1)
        r = self.api.post("/api/delivery/settlements/", {"driver_id": self.drv1.pk, "received_amount": 5,
                                                         "deposit_account": "9999"}, format="json")
        self.assertEqual(r.status_code, 400)
        other = self.client_for(self.owner2)
        self.assertEqual(other.post("/api/delivery/settlements/", {"driver_id": self.drv1.pk,
                                                                   "received_amount": 1}, format="json").status_code, 400)

    def test_driver_sees_only_own(self):
        t1 = self.mk_trip(self.drv1)
        t2 = self.mk_trip(self.drv2)
        me1 = self.client_for(self.du1)
        d = me1.get("/api/delivery/driver/me/").json()["data"]
        self.assertEqual([t["id"] for t in d["trips"]], [t1["id"]])
        sid2 = t2["stops"][0]["id"]
        sid1 = t1["stops"][0]["id"]
        r = me1.post(f"/api/delivery/driver/stops/{sid2}/status/", {"status": "picked_up"}, format="json")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(TripStop.all_objects.get(pk=sid2).status, "pending")
        r = me1.post(f"/api/delivery/driver/stops/{sid1}/status/", {"status": "picked_up"}, format="json")
        self.assertEqual(r.status_code, 200)
        # راننده به مسیرهای مدیریتی دسترسی ندارد
        self.assertEqual(me1.get("/api/delivery/trips/").status_code, 403)
        self.assertEqual(me1.get("/api/delivery/cash/").status_code, 403)
        self.assertEqual(self.client_for(self.cust).get("/api/delivery/driver/me/").status_code, 404)
        # کاربر بدون پروفایل راننده
        self.assertEqual(self.client_for(self.owner2).get("/api/delivery/driver/me/").status_code, 404)

    def test_driver_location_rate_limit_and_map(self):
        me1 = self.client_for(self.du1)
        r = me1.post("/api/delivery/driver/location/", {"lat": 35.7, "lng": 51.4}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        r = me1.post("/api/delivery/driver/location/", {"lat": 35.71, "lng": 51.4}, format="json")
        self.assertEqual(r.status_code, 429)
        r = self.client_for(self.du2).post("/api/delivery/driver/location/", {"lat": 999, "lng": 1}, format="json")
        self.assertEqual(r.status_code, 400)
        self.mk_trip(self.drv1)
        pts = self.api.get("/api/delivery/map/").json()["data"]["points"]
        self.assertEqual(len(pts), 1)
        self.assertEqual(pts[0]["driver_name"], "راننده یک")
        self.assertEqual(pts[0]["stops_remaining"], 1)
        self.assertEqual(self.client_for(self.owner2).get("/api/delivery/map/").json()["data"]["points"], [])

    def test_device_ping_auth(self):
        v = self.api.post("/api/delivery/vehicles/", {"name": "کامیون", "kind": "truck",
                                                      "generate_device_key": True}, format="json").json()["data"]
        anon = APIClient()
        body = {"lat": 35.7, "lng": 51.4, "speed_kmh": 40}
        self.assertEqual(anon.post("/api/delivery/ping/", body, format="json").status_code, 403)
        self.assertEqual(anon.post("/api/delivery/ping/", body, format="json",
                                   HTTP_X_DEVICE_KEY="wrong").status_code, 403)
        r = anon.post("/api/delivery/ping/", body, format="json", HTTP_X_DEVICE_KEY=v["device_key"])
        self.assertEqual(r.status_code, 200, r.content)
        veh = Vehicle.all_objects.get(pk=v["id"])
        self.assertEqual(veh.last_lat, Decimal("35.700000"))
        r = anon.post("/api/delivery/ping/", {"lat": 200, "lng": 1}, format="json",
                      HTTP_X_DEVICE_KEY=v["device_key"])
        self.assertIn(r.status_code, (400, 429))

    def test_public_track_has_no_internal_fields(self):
        t = self.mk_trip(self.drv1)
        token = t["stops"][0]["tracking_token"]
        anon = APIClient()
        r = anon.get(f"/api/delivery/track/{token}/")
        self.assertEqual(r.status_code, 200)
        data = r.json()["data"]
        text = r.content.decode()
        self.assertEqual(data["business"], "الف")
        for forbidden in ("tracking_token", token, "driver_pay", "carrier_cost", "delivery_fee",
                          "collected", "waybill", "device_key", "trip_id", "customer_name", "address", "user"):
            self.assertNotIn(forbidden, text)
        self.assertEqual(anon.get("/api/delivery/track/nonexistent/").status_code, 404)


class ModuleDisabledTests(Base):
    def test_every_route_403_when_module_off(self):
        t = self.mk_trip(self.drv1)
        sid = t["stops"][0]["id"]
        token = t["stops"][0]["tracking_token"]
        v = self.api.post("/api/delivery/vehicles/", {"name": "م", "generate_device_key": True},
                          format="json").json()["data"]
        apply_modules(self.b1, {c: {"is_enabled": c != "delivery"} for c in ALL}, auto_requires=False)
        me = self.client_for(self.du1)
        gets = ["vehicles/", "carriers/", "drivers/", "trips/", f"trips/{t['id']}/", "map/", "cash/",
                "settlements/"]
        for g in gets:
            self.assertEqual(self.api.get(f"/api/delivery/{g}").status_code, 403, g)
        posts = ["vehicles/", "carriers/", "drivers/", "trips/", "settlements/",
                 f"drivers/{self.drv1.pk}/shift/", f"trips/{t['id']}/assign/", f"trips/{t['id']}/status/",
                 f"stops/{sid}/status/"]
        for p in posts:
            self.assertEqual(self.api.post(f"/api/delivery/{p}", {}, format="json").status_code, 403, p)
        for url, method in ((f"vehicles/{v['id']}/", "put"), (f"vehicles/{v['id']}/", "delete"),
                            (f"carriers/1/", "put"), (f"drivers/{self.drv1.pk}/", "put"),
                            (f"drivers/{self.drv1.pk}/", "delete")):
            self.assertEqual(getattr(self.api, method)(f"/api/delivery/{url}", {}, format="json").status_code, 403, url)
        self.assertEqual(me.get("/api/delivery/driver/me/").status_code, 403)
        self.assertEqual(me.post("/api/delivery/driver/shift/", {"on": True}, format="json").status_code, 403)
        self.assertEqual(me.post("/api/delivery/driver/location/", {"lat": 1, "lng": 1}, format="json").status_code, 403)
        self.assertEqual(me.post(f"/api/delivery/driver/stops/{sid}/status/", {"status": "picked_up"},
                                 format="json").status_code, 403)
        anon = APIClient()
        self.assertEqual(anon.post("/api/delivery/ping/", {"lat": 1, "lng": 1}, format="json",
                                   HTTP_X_DEVICE_KEY=v["device_key"]).status_code, 403)
        self.assertEqual(anon.get(f"/api/delivery/track/{token}/").status_code, 404)
        self.assertEqual(Trip.all_objects.filter(business=self.b1).count(), 1)
