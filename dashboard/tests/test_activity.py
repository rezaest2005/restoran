"""تاریخچه‌ی رویدادها: هر اتفاق مهم ثبت می‌شود، ویرایش/حذف‌شدنی نیست، و مالک آن را فیلتر و مرور می‌کند."""

import datetime
from decimal import Decimal as D

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bizsuite.delivery_services import change_trip_status, create_trip, settle_driver_cash, update_stop
from bizsuite.models import (
    ActivityLog, Business, Category, Driver, Food, LocationPing, Trip, TripStop, User,
)
from bizsuite.modules import CATALOG, apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

P = "Pass12345!"


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="الف", slug="act-one")
        cls.o = Business.objects.create(name="ب", slug="act-two")
        cls.owner = User.objects.create_user(username="ac_o", password=P, role="owner", business=cls.b, is_approved=True)
        cls.cashier = User.objects.create_user(username="ac_c", password=P, role="cashier", business=cls.b)
        cls.other_owner = User.objects.create_user(username="ac_ob", password=P, role="owner", business=cls.o)
        cls.duser = User.objects.create_user(username="ac_d", password=P, role="driver", business=cls.b)
        cls.drv = Driver.all_objects.create(business=cls.b, name="رضا", number=1, user=cls.duser)

    def setUp(self):
        clear_current_business()

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(User.objects.get(pk=user.pk))
        return c

    def actions(self, biz=None):
        return list(ActivityLog.all_objects.filter(business=biz or self.b).order_by("id").values_list("action", flat=True))


class DeliveryEventsTests(Base):
    def run_trip(self):
        t = create_trip(self.b, [{"customer_name": "علی", "address": "تهران، آزادی", "cargo_description": "۲ پیتزا", "amount_due": 500000}],
                        driver=self.drv, user=self.owner)
        change_trip_status(t, "in_progress", user=self.owner)
        stop = TripStop.all_objects.get(trip=t)
        update_stop(stop, "delivered", driver=self.drv, collected_amount=500000, collected_method="cash", lat=35.7, lng=51.4)
        change_trip_status(t, "completed", user=self.owner)
        settle_driver_cash(self.drv, 500000, user=self.owner)
        return t

    def test_a_whole_trip_leaves_a_readable_trail(self):
        self.run_trip()
        self.assertEqual(self.actions(), ["trip.created", "trip.in_progress", "stop.delivered", "trip.completed", "cash.settled"])
        rows = {a.action: a for a in ActivityLog.all_objects.filter(business=self.b)}
        self.assertIn("رضا", rows["stop.delivered"].summary)
        self.assertIn("۲ پیتزا", rows["stop.delivered"].summary)
        self.assertIn("500000", rows["stop.delivered"].summary)
        self.assertEqual(rows["stop.delivered"].driver_id, self.drv.id)
        self.assertEqual(rows["stop.delivered"].actor_id, self.duser.id)           # the courier's own account
        self.assertEqual(rows["stop.delivered"].details["lat"], 35.7)
        self.assertEqual(rows["trip.created"].actor_id, self.owner.id)
        self.assertEqual(rows["trip.created"].details["stops"][0]["address"], "تهران، آزادی")

    def test_failed_delivery_records_the_reason(self):
        t = create_trip(self.b, [{"customer_name": "علی", "address": "x"}], driver=self.drv, user=self.owner)
        change_trip_status(t, "in_progress", user=self.owner)
        update_stop(TripStop.all_objects.get(trip=t), "failed", driver=self.drv, failure_reason="مشتری در دسترس نبود")
        row = ActivityLog.all_objects.get(business=self.b, action="stop.failed")
        self.assertIn("مشتری در دسترس نبود", row.summary)

    def test_shift_changes_are_logged_with_the_courier(self):
        c = self.client_for(self.duser)
        self.assertEqual(c.post("/api/delivery/driver/shift/", {"on": True}, format="json").status_code, 200)
        self.assertEqual(c.post("/api/delivery/driver/shift/", {"on": False}, format="json").status_code, 200)
        self.assertEqual(self.actions(), ["shift.on", "shift.off"])


class AuditDecoratorTests(Base):
    def test_successful_changes_are_logged_failed_ones_and_reads_are_not(self):
        c = self.client_for(self.owner)
        c.post("/api/accounting/expenses/", {"category": "rent", "amount": 1500000, "title": "اجاره آبان"}, format="json")
        c.post("/api/accounting/expenses/", {"category": "rent", "amount": -5}, format="json")        # refused -> not logged
        c.get("/api/accounting/expenses/")                                                              # read -> not logged
        rows = ActivityLog.all_objects.filter(business=self.b)
        self.assertEqual(rows.count(), 1)
        row = rows.get()
        self.assertEqual((row.category, row.actor_id), ("accounting", self.owner.id))
        self.assertIn("هزینه", row.summary)
        self.assertIn("اجاره آبان", row.summary)
        self.assertIn("1500000", row.summary)

    def test_passwords_and_tokens_are_never_stored(self):
        c = self.client_for(self.owner)
        c.post("/api/auth/users/create/", {"username": "newguy", "password": "Sup3r-Secret-9", "role": "cashier"}, format="json")
        for a in ActivityLog.all_objects.filter(business=self.b):
            self.assertNotIn("Sup3r-Secret-9", str(a.details) + a.summary)
            self.assertFalse(any("pass" in k.lower() for k in a.details))

    def test_deleting_a_record_is_logged_with_its_id(self):
        c = self.client_for(self.owner)
        eid = c.post("/api/accounting/expenses/", {"category": "fuel", "amount": 100}, format="json").json()["data"]["id"]
        c.delete(f"/api/accounting/expenses/{eid}/")
        last = ActivityLog.all_objects.filter(business=self.b).order_by("-id").first()
        self.assertTrue(last.action.endswith(".delete"))
        self.assertEqual(last.target_id, eid)


class AppendOnlyTests(Base):
    def test_a_logged_event_can_be_neither_edited_nor_deleted(self):
        from bizsuite.activity import log
        row = log(self.b, "system", "test.event", "یک رویداد")
        row.summary = "تغییر"
        with self.assertRaises(PermissionError):
            row.save()
        with self.assertRaises(PermissionError):
            row.delete()
        self.assertEqual(ActivityLog.all_objects.get(pk=row.pk).summary, "یک رویداد")

    def test_logging_never_breaks_the_action(self):
        from bizsuite.activity import log
        self.assertIsNone(log(None, "system", "x", "no business"))             # silently ignored


class ActivityApiTests(Base):
    def seed(self):
        from bizsuite.activity import log
        for i in range(60):
            log(self.b, "delivery" if i % 2 else "pos", "t.%d" % i, f"رویداد شماره {i}", actor=self.owner, driver=self.drv if i % 2 else None)
        log(self.o, "pos", "other", "مال کسب‌وکار دیگر")

    def test_owner_pages_and_filters(self):
        self.seed()
        c = self.client_for(self.owner)
        first = c.get("/api/activity/").json()["data"]
        self.assertEqual(len(first["results"]), 50)
        self.assertTrue(first["has_more"])
        self.assertEqual(first["results"][0]["summary"], "رویداد شماره 59")           # newest first
        second = c.get("/api/activity/", {"before_id": first["next_before_id"]}).json()["data"]
        self.assertEqual(len(second["results"]), 10)
        self.assertFalse(second["has_more"])
        self.assertEqual(len(c.get("/api/activity/", {"category": "delivery"}).json()["data"]["results"]), 30)
        self.assertEqual(len(c.get("/api/activity/", {"driver_id": self.drv.id}).json()["data"]["results"]), 30)
        found = c.get("/api/activity/", {"q": "شماره 7"}).json()["data"]["results"]
        self.assertTrue(found and all("شماره 7" in r["summary"] for r in found))

    def test_never_shows_another_business(self):
        self.seed()
        texts = " ".join(r["summary"] for r in self.client_for(self.owner).get("/api/activity/").json()["data"]["results"])
        self.assertNotIn("دیگر", texts)
        self.assertEqual([r["summary"] for r in self.client_for(self.other_owner).get("/api/activity/").json()["data"]["results"]],
                         ["مال کسب‌وکار دیگر"])

    def test_only_people_with_the_tab_can_read_it(self):
        self.assertEqual(self.client_for(self.cashier).get("/api/activity/").status_code, 403)
        self.cashier.tabs = {"pos": True, "activity": True}
        self.cashier.save()
        self.assertEqual(self.client_for(self.cashier).get("/api/activity/").status_code, 200)
        self.b.disabled_features = ["activity"]
        self.b.save()
        self.assertEqual(self.client_for(self.owner).get("/api/activity/").status_code, 403)      # the super admin switched it off

    def test_sign_in_is_logged(self):
        r = APIClient().post("/api/auth/login/", {"username": "ac_o", "password": P}, format="json", HTTP_X_TENANT_SLUG="act-one")
        self.assertEqual(r.status_code, 200, r.content)
        row = ActivityLog.all_objects.get(business=self.b, action="login")
        self.assertEqual((row.category, row.actor_id), ("auth", self.owner.id))

    def test_pos_order_is_logged_with_its_items(self):
        cat = Category.all_objects.create(business=self.b, name="c")
        f = Food.all_objects.create(business=self.b, category=cat, name="پیتزا", price=1000, stock=10)
        r = self.client_for(self.owner).post("/api/pos/create-order/", {"items": [{"food_id": f.id, "quantity": 2}], "source": "pos"}, format="json")
        self.assertTrue(r.json()["success"], r.content)
        row = ActivityLog.all_objects.get(business=self.b, action="order.created")
        self.assertEqual(row.details["items"][0]["name"], "پیتزا")
        self.assertIn("2000", row.summary)


class CourierHistoryTests(Base):
    def make_trip(self, with_pings=True):
        t = create_trip(self.b, [{"customer_name": "علی", "address": "تهران", "cargo_description": "۳ برگر", "amount_due": 90000, "lat": 35.70, "lng": 51.40},
                                 {"customer_name": "سارا", "address": "کرج", "cargo_description": "۱ سالاد", "amount_due": 40000}],
                        driver=self.drv, user=self.owner)
        change_trip_status(t, "in_progress", user=self.owner)
        Trip.all_objects.filter(pk=t.pk).update(started_at=timezone.now() - datetime.timedelta(hours=1))
        t.refresh_from_db()
        if with_pings:
            now = timezone.now() - datetime.timedelta(minutes=30)
            for i, (la, ln) in enumerate([(35.70, 51.40), (35.72, 51.42), (35.75, 51.45)]):
                LocationPing.all_objects.create(business=self.b, driver=self.drv, lat=la, lng=ln, recorded_at=now + datetime.timedelta(seconds=i))
        for s in TripStop.all_objects.filter(trip=t):
            update_stop(s, "delivered", driver=self.drv, collected_amount=s.amount_due, collected_method="cash")
        change_trip_status(t, "completed", user=self.owner)
        return t

    def test_history_lists_stops_cargo_cash_and_distance(self):
        t = self.make_trip()
        d = self.client_for(self.owner).get("/api/delivery/history/", {"driver_id": self.drv.id}).json()["data"]
        self.assertEqual(d["totals"]["trips"], 1)
        self.assertEqual((d["totals"]["stops_delivered"], d["totals"]["collected"]), (2, 130000.0))
        self.assertGreater(d["totals"]["distance_km"], 1.0)
        trip = d["trips"][0]
        self.assertEqual([s["cargo"] for s in trip["stops"]], ["۳ برگر", "۱ سالاد"])
        self.assertEqual(trip["stops"][0]["status"], "delivered")
        self.assertEqual(trip["route_points"], 3)

    def test_route_returns_the_driven_points_and_the_stops(self):
        t = self.make_trip()
        r = self.client_for(self.owner).get(f"/api/delivery/history/trips/{t.id}/route/").json()["data"]
        self.assertEqual(len(r["points"]), 3)
        self.assertEqual(r["stops"][0]["name"], "علی")

    def test_other_business_and_missing_permission(self):
        t = self.make_trip()
        self.assertEqual(self.client_for(self.other_owner).get(f"/api/delivery/history/trips/{t.id}/route/").status_code, 404)
        self.assertEqual(self.client_for(self.other_owner).get("/api/delivery/history/", {"driver_id": self.drv.id}).status_code, 404)
        self.assertEqual(self.client_for(self.cashier).get("/api/delivery/history/").status_code, 403)
        self.b.disabled_features = ["delivery_history"]
        self.b.save()
        self.assertEqual(self.client_for(self.owner).get("/api/delivery/history/").status_code, 403)
