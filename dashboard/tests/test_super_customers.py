"""The admin Users page creates a whole customer account in one step: user (owner) + tenant + business."""
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, Tenant, User
from bizsuite.modules import enabled_modules
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token

P = "Pass12345!"


class SuperCustomerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.root = User.objects.create_user(username="sc_root", password=P, is_superuser=True, is_staff=True)

    def setUp(self):
        clear_current_business()

    def sup(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.root))
        return c

    def create(self, **extra):
        body = {"username": "user1", "password": "secret99", "first_name": "علی", "last_name": "رضایی", **extra}
        return self.sup().post("/api/super/users/create/", body, format="json")

    def test_one_step_creates_owner_tenant_business(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content)
        u = User.objects.get(username="user1")
        self.assertEqual(u.role, "owner")
        self.assertTrue(u.is_approved and u.is_active)
        self.assertIsNotNone(u.business_id)
        self.assertEqual(u.business.name, "علی رضایی")
        self.assertEqual(u.business.slug, "user1")
        self.assertEqual(u.business.tenant.owner_id, u.id)
        self.assertEqual(Tenant.objects.filter(owner=u).count(), 1)
        self.assertEqual(r.json()["slug"], "user1")

    def test_business_name_falls_back_to_username_and_slug_is_made_unique(self):
        Business.objects.create(name="x", slug="bob")
        r = self.sup().post("/api/super/users/create/", {"username": "Bob", "password": "secret99"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        b = User.objects.get(username="Bob").business
        self.assertEqual(b.name, "Bob")
        self.assertEqual(b.slug, "bob-2")
        # a username that is no valid slug (and a reserved one) still gets a business
        for name in ("مشتری", "admin", "x"):
            r = self.sup().post("/api/super/users/create/", {"username": name, "password": "secret99"}, format="json")
            self.assertEqual(r.status_code, 201, (name, r.content))
            self.assertIsNotNone(User.objects.get(username=name).business_id)

    def test_new_customer_defaults_match_tenant_creation_and_can_sign_in(self):
        self.create()
        b = User.objects.get(username="user1").business
        self.assertIsNone(enabled_modules(b))            # unmanaged: every module on, like a new tenant
        c = APIClient()
        r = c.post("/api/auth/login/", {"username": "user1", "password": "secret99"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data["user"]["role"], "owner")
        self.assertTrue(data["access"])

    def test_nothing_is_left_behind_when_creation_fails(self):
        r = self.create(start_date="2025-05-01", end_date="2025-01-01")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(User.objects.filter(username="user1").exists())
        self.assertFalse(Business.objects.filter(slug="user1").exists())
        self.assertEqual(self.create(access=["nope"]).status_code, 400)
        self.assertFalse(User.objects.filter(username="user1").exists())
        self.assertEqual(self.create(password="12").status_code, 400)
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.create().status_code, 400)       # duplicate username

    def test_create_with_access_and_dates_reads_back(self):
        r = self.create(access=["pos", "orders"], start_date="2030-01-01", end_date="2030-06-30")
        self.assertEqual(r.status_code, 201, r.content)
        got = self.sup().get(f"/api/super/users/{r.json()['user_id']}/").json()
        self.assertEqual(sorted(got["access"]), ["dictionary_users", "home", "orders", "pos"])
        self.assertEqual((got["start_date"], got["end_date"]), ("2030-01-01", "2030-06-30"))
        self.assertEqual(got["slug"], "user1")

    def test_list_shows_customers_only_and_no_role_filter(self):
        self.create()
        b = Business.objects.create(name="S", slug="sc-s")
        User.objects.create_user(username="sc_staff", password=P, role="cashier", business=b)
        rows = self.sup().get("/api/super/users/").json()["users"]
        self.assertEqual([x["username"] for x in rows], ["user1"])
        self.assertNotIn("role", rows[0])
        self.assertEqual(rows[0]["slug"], "user1")

    def test_edit_keeps_username_changes_password_and_phone(self):
        uid = self.create().json()["user_id"]
        r = self.sup().put(f"/api/super/users/{uid}/", {
            "username": "hacked", "password": "newpass1", "phone_number": "09120000000", "first_name": "Z"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        u = User.objects.get(pk=uid)
        self.assertEqual(u.username, "user1")
        self.assertTrue(u.check_password("newpass1"))
        self.assertEqual(u.phone_number, "09120000000")
        self.assertEqual(self.sup().put(f"/api/super/users/{uid}/", {"password": "1"}, format="json").status_code, 400)

    def test_an_owner_without_a_business_gets_one_when_saved(self):
        orphan = User.objects.create_user(username="orphan", password=P, role="owner", is_approved=True)
        r = self.sup().put(f"/api/super/users/{orphan.pk}/", {"first_name": "Orphan"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        orphan.refresh_from_db()
        self.assertIsNotNone(orphan.business_id)
        self.assertEqual(self.sup().post("/api/auth/login/", {"username": "orphan", "password": P}, format="json").status_code, 200)

    def test_delete_removes_the_whole_account(self):
        uid = self.create().json()["user_id"]
        r = self.sup().delete(f"/api/super/users/{uid}/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(User.objects.filter(pk=uid).exists())
        self.assertFalse(Business.objects.filter(slug="user1").exists())
        self.assertFalse(Tenant.objects.filter(name="علی رضایی").exists())
        self.assertEqual(self.sup().delete(f"/api/super/users/{self.root.pk}/").status_code, 403)

    def test_removed_tenant_endpoints(self):
        self.assertEqual(self.sup().post("/api/super/tenants/", {"name": "x"}, format="json").status_code, 405)
        self.assertEqual(self.sup().get("/api/super/tenants/").status_code, 200)
