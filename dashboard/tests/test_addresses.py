"""آدرس‌ها: slug قابل‌ویرایش توسط مالک، شماره‌ی پیک‌ها (۱، ۲، ۳ …)، manifest هر پیک و جابه‌جایی پنل جنگو."""

from django.test import Client, TestCase, TransactionTestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, Driver, User
from bizsuite.slugs import validate_slug
from bizsuite.tenancy import clear_current_business

P = "Pass12345!"


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = Business.objects.create(name="الف", slug="alpha")
        cls.b = Business.objects.create(name="ب", slug="beta")
        cls.owner = User.objects.create_user(username="ad_o", password=P, role="owner", business=cls.a)
        cls.cashier = User.objects.create_user(username="ad_c", password=P, role="cashier", business=cls.a)
        cls.owner_b = User.objects.create_user(username="ad_ob", password=P, role="owner", business=cls.b)

    def setUp(self):
        clear_current_business()

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(User.objects.get(pk=user.pk))
        return c


class SlugTests(Base):
    def test_owner_changes_slug_and_addresses_follow(self):
        r = self.client_for(self.owner).put("/api/business/slug/", {"slug": "My-Shop_1"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.a.refresh_from_db()
        self.assertEqual(self.a.slug, "my-shop_1")                      # normalised to lower case

    def test_only_the_owner_may_change_it(self):
        self.assertEqual(self.client_for(self.cashier).put("/api/business/slug/", {"slug": "newname"}, format="json").status_code, 403)
        self.assertEqual(self.client_for(self.cashier).get("/api/business/slug/").json()["data"]["slug"], "alpha")   # may read

    def test_bad_reserved_and_taken_slugs_are_refused(self):
        c = self.client_for(self.owner)
        for bad in ("", "a", "has space", "ünï", "-start", "x" * 60, "admin", "api", "driver", "dashboard", "bizsuite_dashboard", "bizsuite_admin", "bizsuite_driver", "trade_dashboard", "ember", "beta"):
            self.assertEqual(c.put("/api/business/slug/", {"slug": bad}, format="json").status_code, 400, bad)
        self.a.refresh_from_db()
        self.assertEqual(self.a.slug, "alpha")

    def test_keeping_my_own_slug_is_fine(self):
        self.assertEqual(self.client_for(self.owner).put("/api/business/slug/", {"slug": "alpha"}, format="json").status_code, 200)

    def test_super_admin_uses_the_same_rules(self):
        self.assertFalse(validate_slug("admin")[0])
        self.assertFalse(validate_slug("beta")[0])
        self.assertTrue(validate_slug("beta", exclude_business_id=self.b.pk)[0])
        self.assertTrue(validate_slug("fresh-name")[0])


class DriverNumberTests(Base):
    def make(self, client, name):
        r = client.post("/api/delivery/drivers/", {"name": name}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["data"]

    def test_numbers_count_up_per_business_and_build_the_courier_address(self):
        ca, cb = self.client_for(self.owner), self.client_for(self.owner_b)
        one, two = self.make(ca, "رضا"), self.make(ca, "علی")
        other = self.make(cb, "سارا")
        self.assertEqual((one["number"], two["number"], other["number"]), (1, 2, 1))
        self.assertEqual(one["link_path"], "/alpha/bizsuite_driver/1")
        self.assertEqual(other["link_path"], "/beta/bizsuite_driver/1")

    def test_a_deleted_courier_does_not_cause_a_duplicate_number(self):
        ca = self.client_for(self.owner)
        first, second = self.make(ca, "یک"), self.make(ca, "دو")
        self.assertEqual(ca.delete(f"/api/delivery/drivers/{first['id']}/").status_code, 200)
        third = self.make(ca, "سه")
        self.assertEqual(third["number"], 3)                            # numbers are never reused

    def test_slug_change_moves_the_courier_links_too(self):
        ca = self.client_for(self.owner)
        self.make(ca, "رضا")
        ca.put("/api/business/slug/", {"slug": "newshop"}, format="json")
        listed = self.client_for(self.owner).get("/api/delivery/drivers/").json()["data"]
        self.assertEqual(listed[0]["link_path"], "/newshop/bizsuite_driver/1")


class ManifestAndAdminTests(Base):
    def test_manifest_for_a_courier_page(self):
        r = Client().get("/api/delivery/driver-manifest/", {"path": "/alpha/bizsuite_driver/3"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("manifest+json", r["Content-Type"])
        m = r.json()
        self.assertEqual((m["start_url"], m["scope"], m["display"]), ("/alpha/bizsuite_driver/3", "/alpha/bizsuite_driver/", "standalone"))

    def test_manifest_refuses_anything_that_is_not_a_courier_page(self):
        for bad in ("", "/alpha/dashboard/login", "https://evil.example/bizsuite_driver/1", "/alpha/bizsuite_driver/1/../../x", "//evil.com/bizsuite_driver/1", "/a/bizsuite_driver/x"):
            self.assertEqual(Client().get("/api/delivery/driver-manifest/", {"path": bad}).status_code, 400, bad)

    def test_django_admin_moved_and_the_old_address_is_free(self):
        self.assertLess(Client().get("/django-admin/login/").status_code, 500)
        self.assertEqual(Client().get("/django-admin/login/").status_code, 200)
        self.assertEqual(Client().get("/admin/login/").status_code, 404)    # the SPA owns /admin/login now


class ConcurrentNumberingTests(TransactionTestCase):
    def test_two_couriers_created_at_once_get_different_numbers(self):
        import threading
        from django.db import connection
        clear_current_business()
        b = Business.objects.create(name="هم‌زمان", slug="race-num")
        owner = User.objects.create_user(username="rn_o", password=P, role="owner", business=b)
        out, barrier = [], threading.Barrier(3)

        def go(i):
            try:
                c = APIClient()
                c.force_authenticate(User.objects.get(pk=owner.pk))
                barrier.wait(timeout=10)
                out.append(c.post("/api/delivery/drivers/", {"name": f"p{i}"}, format="json").status_code)
            finally:
                connection.close()

        ts = [threading.Thread(target=go, args=(i,)) for i in range(3)]
        [t.start() for t in ts]
        [t.join(timeout=60) for t in ts]
        self.assertEqual(out, [201, 201, 201])
        self.assertEqual(sorted(Driver.all_objects.filter(business=b).values_list("number", flat=True)), [1, 2, 3])
