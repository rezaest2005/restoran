"""Generic delivery product: route ordering, zones & fees, proof of delivery, attempts, timeline, reports."""

import base64
import io
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from bizsuite.delivery_routing import (
    haversine_km, optimize_order, path_km, point_in_polygon, validate_polygon, zone_contains,
)
from bizsuite.models import Business, DeliveryZone, Driver, StopEvent, Trip, TripStop, User
from bizsuite.modules import apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

P = "Pass12345!"
ALL = ["pos", "club", "inventory", "production", "accounting", "delivery", "feedback"]
MEDIA = tempfile.mkdtemp(prefix="dlv-pod-")


def png_data_url(w=8, h=8):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 30, 60)).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


class RoutingTests(SimpleTestCase):
    def test_haversine_known_distance(self):
        # Tehran (Azadi) → Tehran (Milad tower) is roughly 5 km
        self.assertAlmostEqual(haversine_km(35.6997, 51.3380, 35.7448, 51.3753), 6.0, delta=0.6)
        self.assertEqual(haversine_km(35.7, 51.4, 35.7, 51.4), 0)

    def test_line_of_stops_is_put_in_order(self):
        # five points on a line, given shuffled; from the west end the best path is west → east
        xs = [51.40, 51.44, 51.41, 51.43, 51.42]
        stops = [{"lat": 35.7, "lng": x} for x in xs]
        order, before, after = optimize_order(stops, start=(35.7, 51.39))
        self.assertEqual([xs[i] for i in order], sorted(xs))
        self.assertLess(after, before)

    def test_two_opt_removes_a_crossing(self):
        # a square visited corner-to-corner crosses itself; 2-opt must uncross it
        sq = [(0.0, 0.0), (0.01, 0.01), (0.0, 0.01), (0.01, 0.0)]
        stops = [{"lat": a, "lng": b} for a, b in sq]
        order, before, after = optimize_order(stops)
        self.assertLess(after, before)
        self.assertAlmostEqual(after, path_km([sq[i] for i in order]), places=2)
        # an uncrossed open path over a unit square has 3 sides
        self.assertAlmostEqual(after, 3 * haversine_km(0, 0, 0, 0.01), delta=0.05)

    def test_deterministic_and_never_worse(self):
        import random
        rnd = random.Random(7)
        stops = [{"lat": 35.6 + rnd.random() * 0.2, "lng": 51.2 + rnd.random() * 0.3} for _ in range(25)]
        a = optimize_order(stops, start=(35.7, 51.4))
        b = optimize_order(stops, start=(35.7, 51.4))
        self.assertEqual(a, b)
        self.assertLessEqual(a[2], a[1])
        self.assertEqual(sorted(a[0]), list(range(25)))

    def test_priority_tiers_and_unlocated_stops(self):
        stops = [
            {"lat": 35.70, "lng": 51.41},                    # 0 near, normal
            {"lat": 35.70, "lng": 51.60, "priority": 2},     # 1 far, urgent
            {"lat": None, "lng": None},                      # 2 no coordinates
            {"lat": 35.70, "lng": 51.42},                    # 3 near, normal
        ]
        order, _, _ = optimize_order(stops, start=(35.70, 51.40))
        self.assertEqual(order[0], 1)          # urgent first even though it is far
        self.assertEqual(order[-1], 2)         # unlocated last
        self.assertEqual(order[1:3], [3, 0])   # from the urgent stop (east) the nearer-east stop comes first

    def test_polygon_and_circle(self):
        square = [[35.0, 51.0], [35.0, 52.0], [36.0, 52.0], [36.0, 51.0]]
        self.assertTrue(point_in_polygon(35.5, 51.5, square))
        self.assertFalse(point_in_polygon(36.5, 51.5, square))
        self.assertTrue(point_in_polygon(35.0, 51.5, square))     # on an edge
        self.assertTrue(zone_contains({"center_lat": 35.7, "center_lng": 51.4, "radius_km": 2}, 35.71, 51.4))
        self.assertFalse(zone_contains({"center_lat": 35.7, "center_lng": 51.4, "radius_km": 0.5}, 35.71, 51.4))
        with self.assertRaises(ValueError):
            validate_polygon([[1, 2], [3, 4]])
        with self.assertRaises(ValueError):
            validate_polygon([[1, 2], [3, 4], [99, 4]])


@override_settings(MEDIA_ROOT=MEDIA)
class GenericApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="داروخانه", slug="dlg-one")
        cls.b2 = Business.objects.create(name="دیگر", slug="dlg-two")
        apply_modules(cls.b, {c: {"is_enabled": c == "delivery"} for c in ALL}, auto_requires=False)   # delivery alone
        cls.owner = User.objects.create_user(username="dlgo", password=P, role="owner", business=cls.b)
        cls.owner2 = User.objects.create_user(username="dlgo2", password=P, role="owner", business=cls.b2)
        cls.du = User.objects.create_user(username="dlgd", password=P, role="driver", business=cls.b)
        cls.drv = Driver.all_objects.create(business=cls.b, name="پیک", user=cls.du)

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        clear_current_business()
        cache.clear()
        self.api = APIClient()
        self.api.force_authenticate(self.owner)
        self.dapi = APIClient()
        self.dapi.force_authenticate(self.du)

    def trip(self, stops, **kw):
        r = self.api.post("/api/delivery/trips/", {"stops": stops, "driver_id": self.drv.pk, **kw}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["data"]

    # ── zones ──
    def test_zone_crud_quote_and_fee_on_stop(self):
        poly = [[35.6, 51.3], [35.6, 51.5], [35.8, 51.5], [35.8, 51.3]]
        z = self.api.post("/api/delivery/zones/", {"name": "مرکز", "fee": 50000, "free_over": 1000000,
                                                   "polygon": poly, "eta_minutes": 45}, format="json")
        self.assertEqual(z.status_code, 201, z.content)
        zid = z.json()["data"]["id"]
        self.api.post("/api/delivery/zones/", {"name": "حومه", "fee": 90000, "center_lat": 35.9,
                                               "center_lng": 51.4, "radius_km": 30, "sort_order": 5}, format="json")
        q = self.api.get("/api/delivery/zones/quote/", {"lat": 35.7, "lng": 51.4, "amount": 200000}).json()["data"]
        self.assertEqual((q["zone_id"], q["fee"], q["deliverable"]), (zid, 50000.0, True))
        q = self.api.get("/api/delivery/zones/quote/", {"lat": 35.7, "lng": 51.4, "amount": 2000000}).json()["data"]
        self.assertEqual(q["fee"], 0.0)                           # free over the threshold
        q = self.api.get("/api/delivery/zones/quote/", {"lat": 30.0, "lng": 48.0}).json()["data"]
        self.assertFalse(q["deliverable"])
        # zone of a manual stop is found from its coordinates; the trip earns the stop fees
        t = self.trip([{"customer_name": "الف", "address": "x", "lat": 35.7, "lng": 51.4, "amount_due": 200000}])
        s = t["stops"][0]
        self.assertEqual((s["zone_id"], s["fee"]), (zid, 50000.0))
        self.assertIsNotNone(s["window_end"])                     # the zone's 45-minute promise
        self.assertEqual(t["totals"]["delivery_fee"], 50000.0)
        # bad shapes and tenant isolation
        self.assertEqual(self.api.post("/api/delivery/zones/", {"name": "بد"}, format="json").status_code, 400)
        other = APIClient()
        other.force_authenticate(self.owner2)
        self.assertEqual(other.put(f"/api/delivery/zones/{zid}/", {"name": "x"}, format="json").status_code, 404)
        self.assertEqual(other.get("/api/delivery/zones/").json()["data"], [])
        self.assertEqual(self.api.delete(f"/api/delivery/zones/{zid}/").status_code, 200)

    # ── generic shipment fields ──
    def test_generic_fields_and_validation(self):
        start = timezone.now() + timedelta(hours=1)
        t = self.trip([{"customer_name": "کارخانه ب", "address": "جاده", "packages": 12, "volume_m3": "2.5",
                        "weight_kg": 300, "priority": 2, "instructions": "درب پشتی",
                        "window_start": start.isoformat(), "window_end": (start + timedelta(hours=2)).isoformat()}])
        s = t["stops"][0]
        self.assertEqual((s["packages"], s["volume_m3"], s["priority"], s["instructions"]), (12, 2.5, 2, "درب پشتی"))
        self.assertEqual(t["packages"], 12)
        for bad in ({"packages": 0}, {"priority": 9}, {"volume_m3": -1},
                    {"window_start": start.isoformat(), "window_end": start.isoformat()}):
            r = self.api.post("/api/delivery/trips/", {"stops": [{"address": "x", **bad}]}, format="json")
            self.assertEqual(r.status_code, 400, bad)

    # ── proof of delivery ──
    def test_otp_photo_signature_required(self):
        t = self.trip([{"customer_name": "م", "address": "x", "require_otp": True, "require_photo": True,
                        "require_signature": True}])
        sid = t["stops"][0]["id"]
        code = TripStop.all_objects.get(pk=sid).otp_code
        self.assertRegex(code, r"^\d{4}$")
        # the courier never sees the code; the public tracking link does
        me = self.dapi.get("/api/delivery/driver/me/").json()["data"]
        self.assertEqual(me["trips"][0]["stops"][0]["otp_code"], "")
        token = TripStop.all_objects.get(pk=sid).public_token
        self.assertEqual(APIClient().get(f"/api/delivery/track/{token}/").json()["data"]["otp_code"], code)
        url = f"/api/delivery/driver/stops/{sid}/status/"
        self.assertEqual(self.dapi.post(url, {"status": "arrived"}, format="json").status_code, 200)
        wrong = "0000" if code != "0000" else "1111"
        r = self.dapi.post(url, {"status": "delivered", "otp_code": wrong}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.dapi.post(url, {"status": "delivered", "otp_code": code}, format="json")
        self.assertEqual(r.status_code, 400)                      # photo missing
        r = self.dapi.post(url, {"status": "delivered", "otp_code": code, "pod_photo": png_data_url()}, format="json")
        self.assertEqual(r.status_code, 400)                      # signature missing
        r = self.dapi.post(url, {"status": "delivered", "otp_code": code, "pod_photo": "data:image/png;base64,AAAA",
                                 "pod_signature": png_data_url()}, format="json")
        self.assertEqual(r.status_code, 400)                      # not an image
        r = self.dapi.post(url, {"status": "delivered", "otp_code": code, "pod_photo": png_data_url(),
                                 "pod_signature": png_data_url(), "recipient_name": "خانم ر"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        st = TripStop.all_objects.get(pk=sid)
        self.assertTrue(st.pod_photo and st.pod_signature)
        self.assertEqual(st.recipient_name, "خانم ر")
        pub = APIClient().get(f"/api/delivery/track/{token}/").json()["data"]
        self.assertEqual(pub["otp_code"], "")                     # hidden once delivered
        self.assertEqual([e["status"] for e in pub["timeline"]], ["pending", "arrived", "delivered"])

    # ── failed attempts ──
    def test_failure_codes_attempt_limit_and_timeline(self):
        t = self.trip([{"customer_name": "ل", "address": "x"}])
        sid = t["stops"][0]["id"]
        url = f"/api/delivery/stops/{sid}/status/"
        self.assertEqual(self.api.post(url, {"status": "failed", "failure_code": "nope"}, format="json").status_code, 400)
        for _ in range(3):
            r = self.api.post(url, {"status": "failed", "failure_code": "absent"}, format="json")
            self.assertEqual(r.status_code, 200, r.content)
            if TripStop.all_objects.get(pk=sid).attempts < 3:
                self.assertEqual(self.api.post(url, {"status": "pending"}, format="json").status_code, 200)
        st = TripStop.all_objects.get(pk=sid)
        self.assertEqual((st.attempts, st.failure_code, st.status), (3, "absent", "failed"))
        self.assertEqual(self.api.post(url, {"status": "pending"}, format="json").status_code, 400)   # limit reached
        detail = self.api.get(f"/api/delivery/trips/{t['id']}/").json()["data"]
        self.assertEqual(len(detail["stops"][0]["events"]), StopEvent.all_objects.filter(stop_id=sid).count())
        self.assertEqual(detail["stops"][0]["events"][-1]["status"], "failed")

    # ── route ordering via API ──
    def test_optimize_preview_and_apply(self):
        xs = [51.44, 51.41, 51.43, 51.42]
        t = self.trip([{"customer_name": f"S{i}", "address": "x", "lat": 35.7, "lng": x} for i, x in enumerate(xs)],
                      origin_name="انبار")
        Trip.all_objects.filter(pk=t["id"]).update(origin_lat=Decimal("35.7"), origin_lng=Decimal("51.40"))
        prev = self.api.get(f"/api/delivery/trips/{t['id']}/optimize/").json()["data"]
        self.assertLess(prev["km_after"], prev["km_before"])
        self.assertEqual(list(TripStop.all_objects.filter(trip_id=t["id"]).order_by("sequence")
                              .values_list("customer_name", flat=True)), ["S0", "S1", "S2", "S3"])   # preview saves nothing
        r = self.api.post(f"/api/delivery/trips/{t['id']}/optimize/")
        self.assertEqual(r.status_code, 200, r.content)
        names = [s["customer_name"] for s in r.json()["data"]["trip"]["stops"]]
        self.assertEqual(names, ["S1", "S3", "S2", "S0"])         # west → east from the depot
        self.api.post(f"/api/delivery/trips/{t['id']}/status/", {"status": "cancelled"}, format="json")
        self.assertEqual(self.api.post(f"/api/delivery/trips/{t['id']}/optimize/").status_code, 400)

    # ── reports & COD per driver ──
    def test_report_numbers(self):
        past = timezone.now() + timedelta(hours=3)
        t = self.trip([
            {"customer_name": "a", "address": "x", "amount_due": 100000, "window_end": past.isoformat()},
            {"customer_name": "b", "address": "y", "amount_due": 50000},
            {"customer_name": "c", "address": "z"},
        ])
        a, b, c = (s["id"] for s in t["stops"])
        post = lambda sid, body: self.api.post(f"/api/delivery/stops/{sid}/status/", body, format="json")
        self.assertEqual(post(a, {"status": "delivered", "collected_amount": 100000, "collected_method": "cash"}).status_code, 200)
        self.assertEqual(post(b, {"status": "delivered", "collected_amount": 50000, "collected_method": "card"}).status_code, 200)
        self.assertEqual(post(c, {"status": "failed", "failure_code": "refused"}).status_code, 200)
        rep = self.api.get("/api/delivery/reports/").json()["data"]
        tot = rep["totals"]
        self.assertEqual((tot["stops"], tot["delivered"], tot["failed"]), (3, 2, 1))
        self.assertEqual(tot["on_time_pct"], 100.0)
        self.assertAlmostEqual(tot["success_pct"], 66.7)
        self.assertEqual((tot["collected"], tot["cash_collected"], tot["unsettled_cash"]), (150000.0, 100000.0, 100000.0))
        self.assertEqual(rep["drivers"][0]["driver_name"], "پیک")
        self.assertEqual(rep["failure_reasons"], [{"code": "refused", "count": 1}])
        self.assertEqual({m["method"] for m in rep["methods"]}, {"cash", "card"})
        cash = self.api.get("/api/delivery/cash/").json()["data"]
        row = next(x for x in cash if x["driver_id"] == self.drv.pk)
        self.assertEqual((row["uncollected"], row["stops"]), (100000.0, 1))
        self.assertIsNotNone(row["oldest"])
        self.assertEqual(self.api.get("/api/delivery/reports/", {"from": "2026-02-10", "to": "2026-01-01"}).status_code, 400)

    def test_standalone_manual_shipment_without_pos(self):
        """A tenant with only the delivery module creates and finishes a shipment by hand."""
        self.assertEqual(self.api.get("/api/delivery/pending-orders/").status_code, 200)
        t = self.trip([{"customer_name": "لباسشویی", "phone": "0912", "address": "خیابان", "packages": 3,
                        "amount_due": 80000, "stop_type": "pickup"}], cargo_description="لباس")
        sid = t["stops"][0]["id"]
        self.assertEqual(t["stops"][0]["stop_type"], "pickup")
        r = self.api.post(f"/api/delivery/stops/{sid}/status/", {"status": "delivered", "collected_amount": 80000,
                                                                 "collected_method": "cash"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        r = self.api.post(f"/api/delivery/trips/{t['id']}/status/", {"status": "completed"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
