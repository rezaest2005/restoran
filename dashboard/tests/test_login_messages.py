"""Sign-in: every refusal has its own code + message (never a generic failure), the password is hashed once, and
the endpoint never answers with a bare 500."""
import datetime

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from bizsuite.models import Business, User
from bizsuite.modules import ensure_catalog
from bizsuite.tenancy import clear_current_business

P = "Pass12345!"
FAST = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # test speed only; production keeps Django's PBKDF2


@override_settings(PASSWORD_HASHERS=FAST)
class LoginMessages(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.biz = Business.objects.create(name="کافه", slug="cafe", username_prefix="z")

    def setUp(self):
        clear_current_business()
        cache.clear()

    def make(self, username="user1", **kw):
        kw.setdefault("role", "owner")
        kw.setdefault("business", self.biz)
        kw.setdefault("is_approved", True)
        return User.objects.create_user(username=username, password=P, **kw)

    def login(self, username="user1", password=P, **extra):
        return APIClient().post("/api/auth/login/", {"username": username, "password": password, **extra}, format="json")

    def refused(self, r, code, status=400):
        self.assertEqual(r.status_code, status, r.content)
        body = r.json()
        self.assertEqual(body["code"], code, body)
        self.assertTrue(body["error"])
        return body

    # ── success ──
    def test_owner_signs_in_with_everything_the_dashboard_needs(self):
        self.make()
        r = self.login()
        self.assertEqual(r.status_code, 200, r.content)
        d = r.json()
        self.assertTrue(d["access"] and d["refresh"])
        self.assertEqual(d["user"]["business_slug"], "cafe")
        self.assertIn("business_tabs", d["user"])
        self.assertIn("subscription", d["user"])

    def test_staff_role_signs_in(self):
        self.make("cash1", role="cashier")
        self.assertEqual(self.login("cash1").status_code, 200)

    def test_unknown_custom_role_with_business_still_signs_in(self):
        self.make("weird", role="waiter")
        self.assertEqual(self.login("weird").status_code, 200)

    def test_super_admin_without_business_signs_in(self):
        User.objects.create_superuser(username="root", password=P, is_approved=True)
        self.assertEqual(self.login("root").status_code, 200)

    # ── refusals ──
    def test_wrong_password_and_unknown_user_are_the_same_generic_message(self):
        self.make()
        a = self.refused(self.login(password="nope"), "invalid_credentials")
        b = self.refused(self.login("ghost"), "invalid_credentials")
        self.assertEqual(a["error"], b["error"])

    def test_account_without_business(self):
        self.make("nobiz", business=None)
        self.refused(self.login("nobiz"), "no_business")

    def test_wrong_password_on_account_without_business_does_not_leak(self):
        self.make("nobiz", business=None)
        self.refused(self.login("nobiz", password="bad"), "invalid_credentials")

    def test_not_approved(self):
        self.make("pend", is_approved=False)
        body = self.refused(self.login("pend"), "pending")
        self.assertTrue(body["pending"])

    def test_inactive_user(self):
        self.make("off", is_active=False)
        self.refused(self.login("off"), "inactive")

    def test_inactive_business(self):
        self.biz.is_active = False
        self.biz.save()
        self.make()
        self.refused(self.login(), "business_inactive")

    def test_customer_role(self):
        self.make("cust", role="customer")
        self.refused(self.login("cust"), "customer_account")

    def test_subscription_ended(self):
        self.biz.subscription_ends_at = timezone.now() - datetime.timedelta(minutes=1)
        self.biz.save()
        self.make()
        self.refused(self.login(), "subscription_expired", status=403)

    def test_rate_limit_has_a_code(self):
        self.make()
        for _ in range(5):
            self.login(password="bad")
        self.refused(self.login(), "rate_limited", status=429)

    def test_missing_fields_are_400_not_500(self):
        for payload in ({}, {"username": ""}, {"password": P}, {"username": "x"}):
            r = APIClient().post("/api/auth/login/", payload, format="json")
            self.assertEqual(r.status_code, 400, (payload, r.content))
            cache.clear()

    # ── never 500 ──
    def test_hostile_input_never_500s(self):
        self.make()
        for payload in (
            {"username": "a\x00b", "password": P},
            {"username": "u" * 5000, "password": "p" * 5000},
            {"username": ["a"], "password": P},
            {"username": None, "password": None},
            {"phone_number": "\x00", "password": P},
            {"username": "user1", "password": P, "slug": "x" * 500},
        ):
            r = APIClient().post("/api/auth/login/", payload, format="json")
            self.assertLess(r.status_code, 500, (payload, r.content))
            cache.clear()
        r = APIClient().post("/api/auth/login/", "[1,2]", content_type="application/json")
        self.assertLess(r.status_code, 500)

    # ── username lookup ──
    def test_username_case_is_forgiven_when_unambiguous(self):
        self.make("user1")
        self.assertEqual(self.login("User1").status_code, 200)

    def test_prefix_of_the_business_in_the_address_is_applied(self):
        self.make("zuser1")
        self.assertEqual(self.login("user1", slug="cafe").status_code, 200)
        self.refused(self.login("user1"), "invalid_credentials")  # no slug: no guess

    def test_password_is_hashed_once(self):
        from unittest import mock
        from django.contrib.auth.models import AbstractBaseUser
        self.make()
        with mock.patch.object(AbstractBaseUser, "check_password", autospec=True, side_effect=AbstractBaseUser.check_password) as m:
            self.assertEqual(self.login().status_code, 200)
        self.assertEqual(m.call_count, 1)

    def test_owner_without_a_business_gets_a_clear_message(self):
        """An old owner row with no business (created before the admin form made one) must say so at sign-in."""
        User.objects.create_user(username="orphan1", password="secret123", role="owner", is_approved=True)
        self.refused(self.login("orphan1", password="secret123"), "no_business")

    def test_customer_created_in_the_admin_panel_signs_in(self):
        """POST /api/super/users/create/ builds the user together with its business, so sign-in just works."""
        from bizsuite.views.super_admin.auth import _make_super_token
        root = User.objects.create_superuser(username="root", password=P, is_approved=True)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(root))
        r = c.post("/api/super/users/create/", {"username": "user1", "password": "secret123"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self.login("user1", password="secret123").status_code, 200)
