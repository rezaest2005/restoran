from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.club_services import earn_for_order, get_settings, redeem_points
from bizsuite.models import (
    LoyaltyMember, LoyaltyTransaction, Order, RawMaterial, Business, User,
)
from bizsuite.tenancy import clear_current_business


class ClubTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r1 = Business.objects.create(name="یک", slug="club-one")
        cls.r2 = Business.objects.create(name="دو", slug="club-two")
        cls.owner = User.objects.create_user(
            username="o1", password="Pass12345!", role="owner", business=cls.r1)
        cls.owner2 = User.objects.create_user(
            username="o2", password="Pass12345!", role="owner", business=cls.r2)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.owner)
        self.api.put("/api/club/settings/", {
            "is_active": True, "earn_amount": 10000, "redeem_value": 1000,
            "min_redeem_points": 5, "welcome_points": 3}, format="json")

    def _order(self, total, phone="09121234567", r=None):
        return Order.all_objects.create(
            business=r or self.r1, customer_name="علی", phone=phone,
            total_price=total, payment_status="paid")

    def test_earn_is_idempotent_and_floors(self):
        o = self._order(125000)
        self.assertEqual(earn_for_order(o), 12)
        self.assertEqual(earn_for_order(o), 0)  # تکراری
        m = LoyaltyMember.all_objects.get(business=self.r1, phone="09121234567")
        self.assertEqual(m.points_balance, 15)  # 3 عضویت + 12
        self.assertEqual(
            LoyaltyTransaction.all_objects.filter(order=o, kind="earn").count(), 1)

    def test_no_points_when_inactive_or_without_phone(self):
        self.api.put("/api/club/settings/", {"is_active": False}, format="json")
        self.assertEqual(earn_for_order(self._order(500000)), 0)
        self.api.put("/api/club/settings/", {"is_active": True}, format="json")
        self.assertEqual(earn_for_order(self._order(500000, phone="")), 0)

    def test_persian_digits_normalized(self):
        o = self._order(50000, phone="۰۹۱۲۱۲۳۴۵۶۷")
        earn_for_order(o)
        self.assertTrue(LoyaltyMember.all_objects.filter(phone="09121234567").exists())

    def test_redeem_rules(self):
        earn_for_order(self._order(200000))  # 20 + 3 = 23
        with self.assertRaises(ValueError):
            redeem_points(self.r1, "09121234567", 2)      # کمتر از حداقل
        with self.assertRaises(ValueError):
            redeem_points(self.r1, "09121234567", 99)     # بیشتر از موجودی
        res = redeem_points(self.r1, "09121234567", 10)
        self.assertEqual(res["discount"], 10000)
        self.assertEqual(res["balance"], 13)

    def test_redeem_api_and_lookup(self):
        earn_for_order(self._order(200000))
        look = self.api.post("/api/club/lookup/", {"phone": "09121234567"}, format="json")
        self.assertEqual(look.json()["data"]["member"]["points_balance"], 23)
        red = self.api.post("/api/club/redeem/",
                            {"phone": "09121234567", "points": 10}, format="json")
        self.assertEqual(red.status_code, 200, red.content)
        bad = self.api.post("/api/club/redeem/",
                            {"phone": "09121234567", "points": 500}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_tenant_isolation(self):
        earn_for_order(self._order(200000))
        other = APIClient()
        other.force_authenticate(self.owner2)
        self.assertEqual(other.get("/api/club/members/").json()["data"], [])
        look = other.post("/api/club/lookup/", {"phone": "09121234567"}, format="json")
        self.assertIsNone(look.json()["data"]["member"])
        member = LoyaltyMember.all_objects.get(business=self.r1)
        self.assertEqual(other.get(f"/api/club/members/{member.id}/").status_code, 404)

    def test_adjust_cannot_go_negative(self):
        m = self.api.post("/api/club/members/", {"phone": "09120000000"}, format="json")
        mid = m.json()["data"]["id"]
        ok = self.api.post(f"/api/club/members/{mid}/adjust/", {"points": 10}, format="json")
        self.assertEqual(ok.status_code, 200)
        bad = self.api.post(f"/api/club/members/{mid}/adjust/", {"points": -999}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_settings_validation(self):
        r = self.api.put("/api/club/settings/", {"earn_amount": 0}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.api.put("/api/club/settings/",
                         {"silver_points": 100, "gold_points": 50}, format="json")
        self.assertEqual(r.status_code, 400)


class MaterialsEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r1 = Business.objects.create(name="یک", slug="mat-one")
        cls.r2 = Business.objects.create(name="دو", slug="mat-two")
        RawMaterial.all_objects.create(business=cls.r1, name="الف", material_type="raw", price=1)
        RawMaterial.all_objects.create(business=cls.r1, name="ب", material_type="semi_finished", price=2)
        RawMaterial.all_objects.create(business=cls.r2, name="ج", material_type="raw", price=3)
        cls.u = User.objects.create_user(
            username="m1", password="Pass12345!", role="manager", business=cls.r1)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.u)

    def test_lists_only_own_with_id_and_type(self):
        data = self.api.get("/api/production/materials/").json()["data"]
        self.assertEqual({m["name"] for m in data}, {"الف", "ب"})
        self.assertTrue(all("id" in m and "material_type" in m for m in data))

    def test_filter_by_type(self):
        data = self.api.get("/api/production/materials/?type=semi_finished").json()["data"]
        self.assertEqual([m["name"] for m in data], ["ب"])
