"""Business subscription: exact end moment, the dashboard closes at that second, countdown data."""
import datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bizsuite import subscription as sub
from bizsuite.features import licensed_features, user_features
from bizsuite.models import ActivityLog, Business, User
from bizsuite.modules import ensure_catalog
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token

P = "Pass12345!"
NOW = datetime.datetime(2026, 1, 10, 12, 30, 45, 123456, tzinfo=datetime.timezone.utc)


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="کی‌اف‌سی", slug="kfc")
        cls.other = Business.objects.create(name="دیگر", slug="other")
        cls.owner = User.objects.create_user(username="s_owner", password=P, role="owner", business=cls.b, is_approved=True)
        cls.root = User.objects.create_superuser(username="s_root", password=P)
        cls.root.is_approved = True
        cls.root.save()

    def setUp(self):
        clear_current_business()
        self.b.refresh_from_db()

    def staff(self):
        c = APIClient()
        c.force_authenticate(User.objects.get(pk=self.owner.pk))
        return c

    def jwt_client(self):
        r = APIClient().post("/api/auth/login/", {"username": "s_owner", "password": P}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Bearer " + r.json()["access"])
        return c

    def sup(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.root))
        return c


class PlanMathTests(Base):
    def utc(self, year, month, day, plan=""):
        year, month = year + (month - 1) // 12, (month - 1) % 12 + 1
        return datetime.datetime(year, month, day, 12, 30, 45, tzinfo=datetime.timezone.utc)

    def test_calendar_months_clamp_the_day(self):
        end = datetime.datetime(2026, 1, 31, 12, 0, 0, tzinfo=datetime.timezone.utc)
        sub.apply(self.b, "monthly", now=end)
        self.assertEqual((self.b.subscription_ends_at.month, self.b.subscription_ends_at.day), (2, 28))
        sub.apply(self.b, "yearly", now=datetime.datetime(2028, 2, 29, 12, 0, 0, tzinfo=datetime.timezone.utc))
        self.assertEqual(timezone.localtime(self.b.subscription_ends_at).date().isoformat(), "2029-02-28")

    def test_fixed_periods_end_to_the_second(self):
        for plan, months in (("monthly", 1), ("quarterly", 3), ("semiannual", 6), ("yearly", 12)):
            sub.apply(self.b, plan, now=NOW)
            self.b.refresh_from_db()
            self.assertEqual(self.b.subscription_ends_at, self.utc(2026, 1 + months, 10, plan), plan)
            self.assertEqual(self.b.subscription_ends_at.microsecond, 0)
            self.assertEqual(self.b.subscription_plan, plan)

    def test_extend_adds_to_the_current_end_only_while_it_is_ahead(self):
        sub.apply(self.b, "monthly", now=NOW)
        first_end = self.b.subscription_ends_at
        sub.apply(self.b, "monthly", mode="extend", now=NOW + datetime.timedelta(days=1))
        self.assertEqual(self.b.subscription_ends_at, sub.add_months(first_end, 1))
        # already over: extend counts from now, not from the past
        later = first_end + datetime.timedelta(days=100)
        sub.apply(self.b, "monthly", mode="extend", now=later)
        self.assertEqual(self.b.subscription_ends_at, sub.add_months(later.replace(microsecond=0), 1))

    def test_unlimited_and_custom(self):
        sub.apply(self.b, "yearly", now=NOW)
        sub.apply(self.b, "unlimited", now=NOW)
        self.assertIsNone(self.b.subscription_ends_at)
        self.assertFalse(sub.is_expired(self.b))
        end = datetime.datetime(2027, 3, 1, 8, 15, 30, tzinfo=datetime.timezone.utc)
        sub.apply(self.b, "custom", ends_at=end, now=NOW)
        self.assertEqual(self.b.subscription_ends_at, end)
        with self.assertRaises(ValueError):
            sub.apply(self.b, "custom", now=NOW)
        with self.assertRaises(ValueError):
            sub.apply(self.b, "weekly", now=NOW)

    def test_exact_second_of_expiry(self):
        sub.apply(self.b, "custom", ends_at=NOW, now=NOW - datetime.timedelta(days=1))
        self.assertFalse(sub.is_expired(self.b, NOW - datetime.timedelta(seconds=1)))
        self.assertTrue(sub.is_expired(self.b, NOW))                      # at that very second it is closed
        end = self.b.subscription_ends_at
        p = sub.payload(self.b, end - datetime.timedelta(seconds=90))
        self.assertEqual((p["seconds_left"], p["expired"], p["unlimited"]), (90, False, False))
        self.assertEqual(sub.payload(self.b, end + datetime.timedelta(seconds=5))["seconds_left"], 0)


class EnforcementTests(Base):
    def expire(self):
        Business.objects.filter(pk=self.b.pk).update(
            subscription_plan="monthly", subscription_ends_at=timezone.now() - datetime.timedelta(seconds=1))

    def test_active_subscription_works_and_unlimited_never_closes(self):
        self.assertEqual(self.staff().get("/api/delivery/drivers/").status_code, 200)
        Business.objects.filter(pk=self.b.pk).update(subscription_ends_at=timezone.now() + datetime.timedelta(minutes=5))
        self.assertEqual(self.staff().get("/api/delivery/drivers/").status_code, 200)

    def test_expired_closes_every_api_with_a_code(self):
        c = self.jwt_client()
        self.assertEqual(c.get("/api/delivery/drivers/").status_code, 200)
        self.expire()
        for url in ("/api/delivery/drivers/", "/api/activity/", "/api/business/subscription/"):
            r = c.get(url)
            self.assertEqual(r.status_code, 403, url)
            self.assertEqual(r.json()["code"], "subscription_expired", url)

    def test_no_feature_is_licensed_after_expiry(self):
        self.assertTrue(licensed_features(self.b))
        self.expire()
        self.b.refresh_from_db()
        self.assertEqual(licensed_features(self.b), set())
        self.assertEqual(user_features(User.objects.get(pk=self.owner.pk)), set())
        self.assertEqual(self.staff().get("/api/delivery/drivers/").status_code, 403)      # session style access too

    def test_sign_in_is_refused_after_expiry_and_works_again_after_renewal(self):
        self.expire()
        r = APIClient().post("/api/auth/login/", {"username": "s_owner", "password": P}, format="json")
        self.assertEqual((r.status_code, r.json()["code"]), (403, "subscription_expired"))
        sub.apply(Business.objects.get(pk=self.b.pk), "monthly")
        self.assertEqual(APIClient().post("/api/auth/login/", {"username": "s_owner", "password": P}, format="json").status_code, 200)

    def test_other_businesses_and_the_super_admin_are_not_affected(self):
        self.expire()
        other_owner = User.objects.create_user(username="o_owner", password=P, role="owner", business=self.other, is_approved=True)
        c = APIClient()
        c.force_authenticate(other_owner)
        self.assertEqual(c.get("/api/delivery/drivers/").status_code, 200)
        self.assertEqual(self.sup().get(f"/api/super/businesses/{self.b.id}/subscription/").status_code, 200)

    def test_login_and_session_carry_the_countdown(self):
        sub.apply(self.b, "yearly")
        r = APIClient().post("/api/auth/login/", {"username": "s_owner", "password": P}, format="json").json()
        s = r["user"]["subscription"]
        self.assertEqual((s["plan"], s["expired"], s["unlimited"]), ("yearly", False, False))
        self.assertGreater(s["seconds_left"], 364 * 86400)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Bearer " + r["access"])
        poll = c.get("/api/business/subscription/").json()["data"]
        self.assertEqual(poll["ends_at"], s["ends_at"])


class SuperAdminApiTests(Base):
    def test_set_extend_unlimited_and_custom_through_the_api(self):
        url = f"/api/super/businesses/{self.b.id}/subscription/"
        r = self.sup().post(url, {"plan": "quarterly"}, format="json").json()["data"]
        self.assertEqual((r["plan"], r["unlimited"], r["expired"]), ("quarterly", False, False))
        self.assertAlmostEqual(r["seconds_left"], (sub.add_months(timezone.now(), 3) - timezone.now()).total_seconds(), delta=5)
        ext = self.sup().post(url, {"plan": "monthly", "mode": "extend"}, format="json").json()["data"]
        self.assertAlmostEqual(ext["seconds_left"], (sub.add_months(sub.add_months(timezone.now(), 3), 1) - timezone.now()).total_seconds(), delta=5)
        cu = self.sup().post(url, {"plan": "custom", "ends_at": "2030-01-01T10:20:30+00:00"}, format="json").json()["data"]
        self.assertTrue(cu["ends_at"].startswith("2030-01-01T10:20:30"))
        un = self.sup().post(url, {"plan": "unlimited"}, format="json").json()["data"]
        self.assertTrue(un["unlimited"])
        self.assertEqual(self.sup().get(url).json()["data"]["plan"], "unlimited")

    def test_validation_and_permissions(self):
        url = f"/api/super/businesses/{self.b.id}/subscription/"
        self.assertEqual(self.sup().post(url, {"plan": "custom"}, format="json").status_code, 400)
        self.assertEqual(self.sup().post(url, {"plan": "weekly"}, format="json").status_code, 400)
        self.assertEqual(self.sup().post(url, {"plan": "monthly", "mode": "x"}, format="json").status_code, 400)
        self.assertEqual(self.sup().post("/api/super/businesses/999999/subscription/", {"plan": "monthly"}, format="json").status_code, 404)
        self.assertIn(self.staff().post(url, {"plan": "unlimited"}, format="json").status_code, (401, 403))      # a business owner cannot renew himself
        self.assertIsNone(Business.objects.get(pk=self.b.pk).subscription_ends_at)

    def test_changes_are_logged_and_listed(self):
        from bizsuite.models import Tenant
        t = Tenant.objects.create(name="kfc", owner=self.owner)
        Business.objects.filter(pk=self.b.pk).update(tenant=t)
        self.sup().post(f"/api/super/businesses/{self.b.id}/subscription/", {"plan": "yearly"}, format="json")
        row = ActivityLog.all_objects.get(business=self.b, action="subscription.set")
        self.assertEqual(row.details["plan"], "yearly")
        listing = self.sup().get("/api/super/tenants/").json()
        self.assertIn("subscription", str(listing))


class CustomerFormPlanTests(Base):
    """The Users form applies the plan together with the save (same transaction, same sub.apply)."""

    def create(self, **extra):
        body = {"username": "cust1", "password": "pw1234", **extra}
        return self.sup().post("/api/super/users/create/", body, format="json")

    def months_ahead(self, ends_iso, months):
        want = sub.add_months(timezone.now(), months)
        got = datetime.datetime.fromisoformat(ends_iso)
        self.assertAlmostEqual((got - want).total_seconds(), 0, delta=5)

    def test_default_create_has_no_plan_and_row_reports_unlimited(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content)
        row = self.sup().get("/api/super/users/").json()["users"][0]
        self.assertTrue(row["subscription"]["unlimited"])

    def test_each_plan_on_create_and_edit(self):
        for months, plan in ((1, "monthly"), (3, "quarterly"), (6, "semiannual"), (12, "yearly")):
            r = self.create(username=f"cust_{plan}", subscription={"plan": plan})
            self.assertEqual(r.status_code, 201, r.content)
            uid = r.json()["user_id"]
            d = self.sup().get(f"/api/super/users/{uid}/").json()["subscription"]
            self.assertEqual(d["plan"], plan)
            self.months_ahead(d["ends_at"], months)

    def test_extend_vs_set_and_unlimited_on_edit(self):
        uid = self.create(subscription={"plan": "monthly"}).json()["user_id"]
        url = f"/api/super/users/{uid}/"
        first = self.sup().get(url).json()["subscription"]["ends_at"]
        r = self.sup().put(url, {"subscription": {"plan": "quarterly", "mode": "extend"}}, format="json").json()
        self.assertEqual(datetime.datetime.fromisoformat(r["subscription"]["ends_at"]),
                         sub.add_months(datetime.datetime.fromisoformat(first), 3))
        r = self.sup().put(url, {"subscription": {"plan": "monthly", "mode": "set"}}, format="json").json()
        self.months_ahead(r["subscription"]["ends_at"], 1)
        # the form offers the four periods only
        for bad in ({"plan": "custom", "ends_at": "2031-05-06T07:08:09+00:00"}, {"plan": "unlimited"}):
            self.assertEqual(self.sup().put(url, {"subscription": bad}, format="json").status_code, 400)

    def test_bad_plan_rolls_back_the_whole_create(self):
        r = self.create(subscription={"plan": "weekly"})
        self.assertEqual(r.status_code, 400)
        self.assertFalse(User.objects.filter(username="cust1").exists())
        self.assertEqual(self.create(subscription={"plan": "custom"}).status_code, 400)
        self.assertEqual(self.create(subscription={"plan": "monthly", "mode": "x"}).status_code, 400)

    def test_expired_is_reported_in_the_list(self):
        uid = self.create().json()["user_id"]
        b = User.objects.get(pk=uid).business
        b.subscription_ends_at = timezone.now() - datetime.timedelta(days=1)
        b.save(update_fields=["subscription_ends_at"])
        row = [u for u in self.sup().get("/api/super/users/").json()["users"] if u["id"] == uid][0]
        self.assertTrue(row["subscription"]["expired"])


class SectionPriceTests(Base):
    URL = "/api/super/section-prices/"

    def test_permissions_and_defaults(self):
        self.assertIn(self.staff().get(self.URL).status_code, (401, 403))
        self.assertIn(self.staff().put(self.URL, {"prices": {}}, format="json").status_code, (401, 403))
        d = self.sup().get(self.URL).json()
        self.assertEqual(d["periods"], ["monthly", "quarterly", "semiannual", "yearly"])
        self.assertEqual(d["prices"]["pos"], {"monthly": 0, "quarterly": 0, "semiannual": 0, "yearly": 0})
        self.assertNotIn("general", d["prices"])

    def test_validation(self):
        for bad in ({"pos": {"monthly": -1}}, {"pos": {"monthly": 1.5}}, {"pos": {"monthly": "abc"}},
                    {"nope": {"monthly": 1}}, {"pos": {"weekly": 1}}, {"pos": {"monthly": True}}, []):
            self.assertEqual(self.sup().put(self.URL, {"prices": bad}, format="json").status_code, 400, bad)
        self.assertEqual(self.sup().put(self.URL, {}, format="json").status_code, 400)

    def test_save_and_read_back(self):
        r = self.sup().put(self.URL, {"prices": {"pos": {"monthly": 1250000, "yearly": "9000000"}}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        got = self.sup().get(self.URL).json()["prices"]
        self.assertEqual((got["pos"]["monthly"], got["pos"]["yearly"], got["more"]["monthly"]), (1250000, 9000000, 0))

    def test_automatic_total_and_snapshot(self):
        from bizsuite import pricing
        self.sup().put(self.URL, {"prices": {
            "pos": {"monthly": 100, "quarterly": 270, "semiannual": 500, "yearly": 900},
            "inventory": {"monthly": 40, "quarterly": 110, "semiannual": 200, "yearly": 380}}}, format="json")
        q = pricing.quote(["home", "pos", "orders", "dictionary_users"])          # locked tabs alone never count
        self.assertEqual(q["sections"], ["pos"])
        self.assertEqual(q["totals"], {"monthly": 100, "quarterly": 270, "semiannual": 500, "yearly": 900})
        r = self.sup().post("/api/super/users/create/", {
            "username": "pc", "password": "pw1234", "access": ["pos", "inventory_invoice"],
            "subscription": {"plan": "quarterly"}}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        uid = r.json()["user_id"]
        d = self.sup().get(f"/api/super/users/{uid}/").json()
        self.assertEqual(d["quote"]["totals"]["quarterly"], 380)
        row = [u for u in self.sup().get("/api/super/users/").json()["users"] if u["id"] == uid][0]
        self.assertEqual(row["price"], 380)
        # changing the tabs re-quotes the snapshot
        self.sup().put(f"/api/super/users/{uid}/", {"access": ["pos"]}, format="json")
        self.assertEqual(self.sup().get(f"/api/super/users/{uid}/").json()["price"], 270)

    def test_sections_cover_the_sellable_tabs(self):
        from bizsuite import pricing
        from bizsuite.features import LOCKED_KEYS, sellable_keys
        covered = {c for codes in pricing.SECTIONS.values() for c in codes} | LOCKED_KEYS
        self.assertEqual(set(sellable_keys()) - covered, set())
