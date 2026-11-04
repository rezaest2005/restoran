from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from restaurant.accounting_services import income_statement, trial_balance
from restaurant.delivery_services import (
    assign_trip, change_trip_status, create_trip, haversine_km, public_tracking, record_ping,
    settle_driver_cash, uncollected_cash, update_stop, validate_coords,
)
from restaurant.models import Carrier, Driver, Restaurant, Trip, TripStop, Vehicle
from restaurant.tenancy import clear_current_restaurant

D = Decimal


def stop(**kw):
    base = {"customer_name": "علی", "phone": "0912", "address": "تهران", "lat": 35.70, "lng": 51.40}
    base.update(kw)
    return base


class TripFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r = Restaurant.objects.create(name="کارخانه", slug="dl-one")
        cls.r2 = Restaurant.objects.create(name="دیگر", slug="dl-two")
        cls.truck = Vehicle.all_objects.create(restaurant=cls.r, name="کامیون ۱", kind="truck",
                                               capacity_kg=D("1000"))
        cls.bike = Vehicle.all_objects.create(restaurant=cls.r, name="موتور ۱", kind="motorbike")
        cls.drv = Driver.all_objects.create(restaurant=cls.r, name="رضا احمدی", phone="0935",
                                            pay_per_trip=D("50000"), default_vehicle=cls.bike)
        cls.other_drv = Driver.all_objects.create(restaurant=cls.r, name="دیگری")
        cls.foreign_drv = Driver.all_objects.create(restaurant=cls.r2, name="غریبه")

    def setUp(self):
        clear_current_restaurant()

    def test_numbers_status_and_default_vehicle(self):
        t1 = create_trip(self.r, [stop()], driver=self.drv)
        t2 = create_trip(self.r, [stop()])
        self.assertEqual((t1.number, t2.number), (1, 2))
        self.assertEqual(t1.status, "assigned")
        self.assertEqual(t1.vehicle, self.bike)
        self.assertEqual(t1.driver_pay, D("50000"))
        self.assertEqual(t2.status, "planned")

    def test_validation(self):
        with self.assertRaises(ValueError):
            create_trip(self.r, [])
        with self.assertRaises(ValueError):
            create_trip(self.r, [stop()], driver=self.foreign_drv)
        with self.assertRaises(ValueError):
            create_trip(self.r, [stop(amount_due=-5)])
        with self.assertRaises(ValueError):
            create_trip(self.r, [stop(lat=95, lng=10)])
        with self.assertRaises(ValueError):
            create_trip(self.r, [stop(weight_kg=800), stop(weight_kg=300)], vehicle=self.truck)
        self.assertEqual(Trip.all_objects.count(), 0)   # هیچ مأموریت نیمه‌کاره‌ای نمی‌ماند

    def test_assign_rules(self):
        t = create_trip(self.r, [stop()])
        with self.assertRaises(ValueError):
            assign_trip(t, self.foreign_drv)
        assign_trip(t, self.drv)
        t.refresh_from_db()
        self.assertEqual(t.driver, self.drv)
        change_trip_status(t, "in_progress")
        with self.assertRaises(ValueError):
            assign_trip(t, self.other_drv)     # در مسیر است

    def test_status_machine(self):
        t = create_trip(self.r, [stop()])
        with self.assertRaises(ValueError):
            change_trip_status(t, "in_progress")   # بدون راننده
        with self.assertRaises(ValueError):
            change_trip_status(t, "completed")
        assign_trip(t, self.drv)
        change_trip_status(t, "in_progress")
        with self.assertRaises(ValueError):
            change_trip_status(t, "completed")      # توقف باز دارد
        change_trip_status(t, "cancelled")
        with self.assertRaises(ValueError):
            change_trip_status(t, "in_progress")

    def test_stop_flow_cod_and_authorization(self):
        t = create_trip(self.r, [stop(amount_due=100000)], driver=self.drv, delivery_fee=D("20000"))
        s = TripStop.all_objects.get(trip=t)
        with self.assertRaises(ValueError):
            update_stop(s, "delivered", driver=self.other_drv, collected_amount=100000, collected_method="cash")
        with self.assertRaises(ValueError):
            update_stop(s, "delivered", driver=self.drv, collected_amount=100000)       # بدون روش
        with self.assertRaises(ValueError):
            update_stop(s, "failed", driver=self.drv)                                    # بدون علت
        with self.assertRaises(ValueError):
            update_stop(s, "delivered", driver=self.drv, collected_amount=-1, collected_method="cash")
        update_stop(s, "arrived", driver=self.drv)
        t.refresh_from_db()
        self.assertEqual(t.status, "in_progress")
        update_stop(s, "delivered", driver=self.drv, collected_amount=100000, collected_method="cash")
        s.refresh_from_db()
        self.assertEqual(s.status, "delivered")
        with self.assertRaises(ValueError):
            update_stop(s, "failed", driver=self.drv, failure_reason="x")               # دیگر قابل تغییر نیست
        self.assertEqual(uncollected_cash(self.drv), D("100000"))

    def test_failed_stop_can_retry_then_complete(self):
        t = create_trip(self.r, [stop()], driver=self.drv)
        s = TripStop.all_objects.get(trip=t)
        update_stop(s, "failed", driver=self.drv, failure_reason="در دسترس نبود")
        update_stop(s, "pending", driver=self.drv)
        update_stop(s, "delivered", driver=self.drv)
        change_trip_status(t, "completed")
        t.refresh_from_db()
        self.assertEqual(t.status, "completed")

    def test_accounting_on_completion_and_settlement(self):
        t = create_trip(self.r, [stop(amount_due=120000)], driver=self.drv,
                        delivery_fee=D("20000"), carrier_cost=D("0"))
        s = TripStop.all_objects.get(trip=t)
        update_stop(s, "delivered", driver=self.drv, collected_amount=120000, collected_method="cash")
        change_trip_status(t, "completed")
        rows = {r["code"]: r for r in trial_balance(self.r)["rows"]}
        self.assertEqual(rows["1150"]["balance_debit"], D("120000"))      # وجه نزد راننده
        self.assertEqual(rows["4110"]["balance_credit"], D("100000"))     # فروش
        self.assertEqual(rows["4120"]["balance_credit"], D("20000"))      # درآمد حمل
        self.assertEqual(rows["5210"]["balance_debit"], D("50000"))       # کارمزد راننده
        self.assertEqual(rows["2120"]["balance_credit"], D("50000"))
        self.assertTrue(trial_balance(self.r)["balanced"])
        self.assertEqual(income_statement(self.r)["net_profit"], D("70000"))

        # تسویه با کسری ۵۰۰۰
        st = settle_driver_cash(self.drv, 115000)
        self.assertEqual((st.expected_amount, st.difference), (D("120000"), D("-5000")))
        rows = {r["code"]: r for r in trial_balance(self.r)["rows"]}
        self.assertEqual(rows["1150"]["balance_debit"], D("0"))           # صفر شد
        self.assertEqual(rows["1150"]["balance_credit"], D("0"))
        self.assertEqual(rows["1110"]["balance_debit"], D("115000"))
        self.assertEqual(rows["5400"]["balance_debit"], D("5000"))
        self.assertTrue(trial_balance(self.r)["balanced"])
        self.assertEqual(uncollected_cash(self.drv), D("0"))
        with self.assertRaises(ValueError):
            settle_driver_cash(self.drv, 0)                                # چیزی برای تسویه نیست

    def test_non_cash_goes_to_bank_and_external_carrier(self):
        carrier = Carrier.all_objects.create(restaurant=self.r, name="باربری سریع", is_external=True)
        t = create_trip(self.r, [stop(amount_due=50000)], carrier=carrier, carrier_cost=D("30000"))
        assign_trip(t, self.drv)
        s = TripStop.all_objects.get(trip=t)
        update_stop(s, "delivered", driver=self.drv, collected_amount=50000, collected_method="card")
        change_trip_status(t, "completed")
        rows = {r["code"]: r for r in trial_balance(self.r)["rows"]}
        self.assertEqual(rows["1120"]["balance_debit"], D("50000"))
        self.assertEqual(rows["5240"]["balance_debit"], D("30000"))
        self.assertEqual(rows["2130"]["balance_credit"], D("30000"))
        self.assertTrue(trial_balance(self.r)["balanced"])

    def test_accounting_is_posted_once(self):
        t = create_trip(self.r, [stop()], driver=self.drv)
        update_stop(TripStop.all_objects.get(trip=t), "delivered", driver=self.drv)
        change_trip_status(t, "completed")
        from restaurant.delivery_services import post_trip_accounting
        self.assertIsNone(post_trip_accounting(t))
        from restaurant.models import JournalEntry
        self.assertEqual(JournalEntry.all_objects.filter(source_type="trip").count(), 1)


class LocationAndTrackingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r = Restaurant.objects.create(name="پیک", slug="dl-loc")
        cls.drv = Driver.all_objects.create(restaurant=cls.r, name="سارا رضایی", phone="0912")
        cls.veh = Vehicle.all_objects.create(restaurant=cls.r, name="V1", device_key="K" * 20)

    def setUp(self):
        clear_current_restaurant()

    def test_coords_validation_and_distance(self):
        self.assertEqual(validate_coords("35.7", "51.4"), (D("35.700000"), D("51.400000")))
        for bad in [("x", 1), (91, 0), (0, 181)]:
            with self.assertRaises(ValueError):
                validate_coords(*bad)
        self.assertAlmostEqual(haversine_km(35.7, 51.4, 35.7, 51.4), 0, places=3)
        self.assertAlmostEqual(haversine_km(0, 0, 0, 1), 111.19, places=1)

    def test_ping_rules(self):
        record_ping(driver=self.drv, lat=35.7, lng=51.4)
        self.drv.refresh_from_db()
        self.assertEqual(self.drv.last_lat, D("35.700000"))
        with self.assertRaises(ValueError):
            record_ping(lat=1, lng=1)
        with self.assertRaises(ValueError):
            record_ping(driver=self.drv, lat=1, lng=1, recorded_at=timezone.now() + timezone.timedelta(hours=1))
        with self.assertRaises(ValueError):
            record_ping(driver=self.drv, lat=1, lng=1, recorded_at=timezone.now() - timezone.timedelta(days=3))

    def test_public_tracking_is_safe_and_live(self):
        t = create_trip(self.r, [stop(lat=35.75, lng=51.45)], driver=self.drv, vehicle=self.veh)
        s = TripStop.all_objects.get(trip=t)
        self.assertIsNone(public_tracking("nope"))
        data = public_tracking(s.public_token)
        self.assertEqual(data["status"], "pending")
        self.assertIsNone(data["position"])                      # هنوز در مسیر نیست
        update_stop(s, "picked_up", driver=self.drv, lat=35.70, lng=51.40)
        data = public_tracking(s.public_token)
        self.assertIsNotNone(data["position"])
        self.assertIsNotNone(data["eta"])
        self.assertEqual(data["driver"]["name"], "سارا")          # فقط نام کوچک
        for forbidden in ("id", "restaurant", "pay", "driver_pay", "token", "notes"):
            self.assertNotIn(forbidden, data)
        update_stop(s, "delivered", driver=self.drv)
        self.assertIsNone(public_tracking(s.public_token)["position"])   # بعد از تحویل موقعیت پنهان
