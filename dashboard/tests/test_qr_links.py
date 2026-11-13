"""لینک کوتاه QR: چاپ یک‌بار، مقصد از پنل سوپرادمین هر وقت عوض شود."""

from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, QrLink, User
from bizsuite.modules import CATALOG, apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token


class QrBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="کافه", slug="cafe-one")
        cls.o = Business.objects.create(name="دیگر", slug="cafe-two")
        cls.root = User.objects.create_superuser(username="qsu", password="Pass12345!")
        cls.owner = User.objects.create_user(username="qo", password="Pass12345!", role="owner", business=cls.b)

    def setUp(self):
        clear_current_business()
        self.sup = APIClient()
        self.sup.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.root))

    def make(self, **kw):
        r = self.sup.post("/api/super/qr/", {"business_id": self.b.id, **kw}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["data"]


class RedirectTests(QrBase):
    def test_menu_link_redirects_to_builtin_menu_and_counts_scans(self):
        q = self.make(label="میز ۵", kind="menu", table_number="5")
        r = self.client.get(q["path"])
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r["Location"], "/m/cafe-one?table=5")
        self.assertEqual(r["Cache-Control"], "no-store")
        self.assertEqual(QrLink.all_objects.get(pk=q["id"]).scans, 1)

    def test_changing_target_redirects_the_same_printed_code_elsewhere(self):
        q = self.make(kind="menu")
        self.assertEqual(self.client.get(q["path"])["Location"], "/m/cafe-one")
        r = self.sup.put(f"/api/super/qr/{q['id']}/", {"kind": "custom", "custom_url": "https://menu.example.com/page?x=1"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.client.get(q["path"])["Location"], "https://menu.example.com/page?x=1")

    def test_custom_url_gets_table_param_appended(self):
        q = self.make(kind="custom", custom_url="https://menu.example.com/m?x=1", table_number="7")
        self.assertEqual(self.client.get(q["path"])["Location"], "https://menu.example.com/m?x=1&table=7")

    def test_unsafe_urls_are_rejected(self):
        for bad in ("javascript:alert(1)", "data:text/html,x", "//evil.com", "ftp://x.com/a", "https://a b.com", "menu.example.com"):
            r = self.sup.post("/api/super/qr/", {"business_id": self.b.id, "kind": "custom", "custom_url": bad}, format="json")
            self.assertEqual(r.status_code, 400, bad)

    def test_inactive_unknown_and_module_off_are_404(self):
        q = self.make(kind="menu")
        self.sup.put(f"/api/super/qr/{q['id']}/", {"is_active": False}, format="json")
        self.assertEqual(self.client.get(q["path"]).status_code, 404)
        self.assertEqual(self.client.get("/q/zzzzzzzz/").status_code, 404)
        self.sup.put(f"/api/super/qr/{q['id']}/", {"is_active": True}, format="json")
        apply_modules(self.b, {m["code"]: {"is_enabled": m["code"] == "delivery"} for m in CATALOG})
        self.assertEqual(self.client.get(q["path"]).status_code, 404)     # menu needs the POS module

    def test_storefront_kind_needs_a_published_site(self):
        q = self.make(kind="storefront")
        self.assertEqual(self.client.get(q["path"]).status_code, 404)


class AdminApiTests(QrBase):
    def test_bulk_tables_and_listing_is_per_business(self):
        made = self.sup.post("/api/super/qr/", {"business_id": self.b.id, "tables": 12, "kind": "menu"}, format="json").json()["data"]
        self.assertEqual([m["label"] for m in made][:2], ["میز 1", "میز 2"])
        self.assertEqual(len({m["code"] for m in made}), 12)
        self.assertEqual(len(self.sup.get(f"/api/super/qr/?business_id={self.b.id}").json()["data"]), 12)
        self.assertEqual(self.sup.get(f"/api/super/qr/?business_id={self.o.id}").json()["data"], [])
        self.assertEqual(self.sup.post("/api/super/qr/", {"business_id": self.b.id, "tables": 9999}, format="json").status_code, 400)

    def test_only_super_admin(self):
        c = APIClient()
        c.force_authenticate(self.owner)
        self.assertIn(c.get(f"/api/super/qr/?business_id={self.b.id}").status_code, (401, 403))
        self.assertIn(c.post("/api/super/qr/", {"business_id": self.b.id}, format="json").status_code, (401, 403))
        self.assertIn(APIClient().get(f"/api/super/qr/?business_id={self.b.id}").status_code, (401, 403))

    def test_delete(self):
        q = self.make()
        self.assertEqual(self.sup.delete(f"/api/super/qr/{q['id']}/").status_code, 200)
        self.assertEqual(self.client.get(q["path"]).status_code, 404)


from django.test import override_settings


class MountedUnderPrefixTests(QrBase):
    @override_settings(URL_PREFIX="/biz")
    def test_pages_stay_at_the_domain_root_even_with_the_hidden_prefix(self):
        q = self.make(kind="menu", table_number="5")
        self.assertEqual(self.client.get(q["path"])["Location"], "/m/cafe-one?table=5")

    @override_settings(URL_PREFIX="/biz")
    def test_custom_url_is_never_prefixed(self):
        q = self.make(kind="custom", custom_url="https://menu.example.com/page")
        self.assertEqual(self.client.get(q["path"])["Location"], "https://menu.example.com/page")
