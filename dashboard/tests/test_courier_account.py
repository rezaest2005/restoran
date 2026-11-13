"""Courier sign-in made from the fleet form; custom «سایر» role."""
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, Driver, User
from bizsuite.modules import ensure_catalog
from bizsuite.tenancy import clear_current_business

P = "Pass12345!"


class CourierAccountTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="کی‌اف‌سی", slug="kfc")
        cls.o = Business.objects.create(name="دیگر", slug="other-co")
        cls.owner = User.objects.create_user(username="kfc_owner", password=P, role="owner", business=cls.b, is_approved=True)
        cls.other_owner = User.objects.create_user(username="oc_owner", password=P, role="owner", business=cls.o, is_approved=True)

    def setUp(self):
        clear_current_business()

    def api(self, user):
        c = APIClient()
        c.force_authenticate(User.objects.get(pk=user.pk))
        return c

    def test_owner_creates_a_courier_with_a_working_sign_in(self):
        r = self.api(self.owner).post("/api/delivery/drivers/", {"name": "رضا", "username": "reza1", "password": "secret99"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()["data"]
        self.assertEqual(d["number"], 1)
        self.assertTrue(d["username"].endswith("reza1"))
        u = User.objects.get(pk=d["user_id"])
        self.assertEqual((u.role, u.business_id, u.is_approved), ("driver", self.b.id, True))
        self.assertTrue(u.check_password("secret99"))
        self.assertEqual(Driver.all_objects.get(pk=d["id"]).user_id, u.id)

    def test_courier_can_sign_in_and_sees_only_courier_pages(self):
        r = self.api(self.owner).post("/api/delivery/drivers/", {"name": "رضا", "username": "reza2", "password": "secret99"}, format="json")
        username = r.json()["data"]["username"]
        login = APIClient().post("/api/auth/login/", {"username": username, "password": "secret99"}, format="json")
        self.assertEqual(login.status_code, 200, login.content)
        self.assertEqual(login.json()["user"]["business_slug"], "kfc")
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Bearer " + login.json()["access"])
        self.assertEqual(c.get("/api/delivery/driver/me/").status_code, 200)
        self.assertEqual(c.get("/api/accounting/expenses/").status_code, 403)

    def test_username_is_unique_and_password_required(self):
        c = self.api(self.owner)
        self.assertEqual(c.post("/api/delivery/drivers/", {"name": "a", "username": "dup", "password": "secret99"}, format="json").status_code, 201)
        self.assertEqual(c.post("/api/delivery/drivers/", {"name": "b", "username": "dup", "password": "secret99"}, format="json").status_code, 400)
        self.assertEqual(c.post("/api/delivery/drivers/", {"name": "c", "username": "nopass"}, format="json").status_code, 400)
        self.assertEqual(Driver.all_objects.filter(business=self.b).count(), 1)          # failed ones leave nothing behind

    def test_password_reset_and_no_account_option(self):
        c = self.api(self.owner)
        d = c.post("/api/delivery/drivers/", {"name": "x", "username": "reset1", "password": "secret99"}, format="json").json()["data"]
        self.assertEqual(c.put(f"/api/delivery/drivers/{d['id']}/", {"name": "x", "password": "newpass88"}, format="json").status_code, 200)
        self.assertTrue(User.objects.get(pk=d["user_id"]).check_password("newpass88"))
        plain = c.post("/api/delivery/drivers/", {"name": "no login"}, format="json").json()["data"]
        self.assertIsNone(plain["user_id"])

    def test_other_business_cannot_touch_it(self):
        d = self.api(self.owner).post("/api/delivery/drivers/", {"name": "x", "username": "iso1", "password": "secret99"}, format="json").json()["data"]
        self.assertEqual(self.api(self.other_owner).put(f"/api/delivery/drivers/{d['id']}/", {"name": "x", "password": "hacked123"}, format="json").status_code, 404)
        self.assertTrue(User.objects.get(pk=d["user_id"]).check_password("secret99"))

    def test_password_is_not_stored_in_the_activity_log(self):
        from bizsuite.models import ActivityLog
        self.api(self.owner).post("/api/delivery/drivers/", {"name": "x", "username": "log1", "password": "Sup3r-Hidden"}, format="json")
        for a in ActivityLog.all_objects.filter(business=self.b):
            self.assertNotIn("Sup3r-Hidden", str(a.details) + a.summary)

    def test_custom_other_role_gets_exactly_the_ticked_tabs(self):
        c = self.api(self.owner)
        r = c.post("/api/users/create/", {"username": "helper1", "password": "secret99", "role": "other"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        u = User.objects.get(pk=r.json()["user_id"])
        self.assertEqual(u.role, "other")
        from bizsuite.features import user_features
        self.assertEqual(user_features(u), {"home"})                      # nothing ticked yet -> only the home page
        u.tabs = {"pos": True, "activity": True}
        u.save()
        self.assertTrue({"pos", "activity", "home"} <= user_features(User.objects.get(pk=u.pk)))
        self.assertNotIn("accounting", user_features(User.objects.get(pk=u.pk)))
