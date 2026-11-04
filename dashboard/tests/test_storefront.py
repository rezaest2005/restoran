import io
import shutil
import tempfile

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from bizsuite import storefront_services as svc
from bizsuite.models import (
    Business, LoyaltyMember, Storefront, StorefrontAsset, StorefrontTemplate, User,
)
from bizsuite.modules import apply_modules
from bizsuite.tenancy import clear_current_business

MEDIA = tempfile.mkdtemp(prefix="sf_media_")


def png_bytes(size=(20, 20), exif=False, fmt="PNG"):
    img = Image.new("RGB", size, (200, 30, 30))
    buf = io.BytesIO()
    kwargs = {}
    if exif:
        e = Image.Exif()
        e[0x010F] = "SecretCamera"
        kwargs["exif"] = e
    img.save(buf, fmt, **kwargs)
    return buf.getvalue()


@override_settings(MEDIA_ROOT=MEDIA, PLATFORM_PUBLIC_URL="https://app.example.com")
class StorefrontBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.b1 = Business.objects.create(name="یک", slug="shop-one")
        cls.b2 = Business.objects.create(name="دو", slug="shop-two")
        cls.o1 = User.objects.create_user(username="so1", password="Pass12345!", role="owner", business=cls.b1)
        cls.o2 = User.objects.create_user(username="so2", password="Pass12345!", role="owner", business=cls.b2)
        cls.mgr = User.objects.create_user(username="sm1", password="Pass12345!", role="manager", business=cls.b1)
        cls.cashier = User.objects.create_user(
            username="sc1", password="Pass12345!", role="cashier", business=cls.b1,
            dashboard_permissions=["pos"])
        cls.admin = User.objects.create_superuser(username="sadm", password="Pass12345!")

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.o1)
        self.anon = APIClient()

    def mine(self):
        return self.api.get("/api/storefront/mine/").json()["data"]

    def put(self, **body):
        return self.api.put("/api/storefront/mine/", body, format="json")


class ValidationTests(StorefrontBase):
    def test_default_draft_is_classic_preset_neutral_name(self):
        d = self.mine()
        self.assertEqual(d["template"], "restaurant_classic")
        tpl = StorefrontTemplate.objects.get(key="restaurant_classic")
        self.assertEqual(tpl.name_en, "Classic")
        self.assertEqual(tpl.name_fa, "کلاسیک")
        types = [s["type"] for s in d["sections"]]
        self.assertEqual(types[0], "hero")
        self.assertIn("menu", types)
        self.assertEqual(d["theme"]["primary"], "#ff5a1a")

    def test_six_templates_and_all_valid(self):
        svc.ensure_presets()
        self.assertEqual(StorefrontTemplate.objects.count(), 6)
        for tpl in StorefrontTemplate.objects.all():
            theme, _w = svc.validate_theme(tpl.default_theme)
            secs = svc.validate_sections(tpl.default_sections, tpl.section_schema)
            self.assertTrue(secs, tpl.key)

    def test_preset_has_no_restaurant_wording(self):
        svc.ensure_presets()
        for tpl in StorefrontTemplate.objects.all():
            blob = (tpl.name_fa + tpl.name_en + str(tpl.default_sections)).lower()
            for bad in ("رستوران", "restaurant", "غذا", "منو"):
                self.assertNotIn(bad, blob.replace("restaurant_classic", ""))

    def test_hex_colors_strict(self):
        for bad in ("red", "#12", "#gggggg", "javascript:1", "#12345678"):
            d = self.mine()
            d["theme"]["primary"] = bad
            r = self.put(theme=d["theme"])
            self.assertEqual(r.status_code, 400, bad)

    def test_contrast_warning_not_blocking(self):
        d = self.mine()
        d["theme"]["text"] = "#777777"
        d["theme"]["background"] = "#808080"
        r = self.put(theme=d["theme"])
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["data"]["warnings"])
        self.assertEqual(svc.contrast_ratio("#000000", "#ffffff"), 21.0)

    def test_font_radius_density_whitelists(self):
        d = self.mine()
        for key, val in (("font_family", "Comic Sans"), ("radius", 99), ("density", "huge"),
                         ("evil", 1)):
            theme = dict(d["theme"])
            theme[key] = val
            self.assertEqual(self.put(theme=theme).status_code, 400, key)

    def test_section_limits_and_schema(self):
        d = self.mine()
        many = [{"id": f"t{i}", "type": "text", "visible": True, "data": {"title": "x"}}
                for i in range(21)]
        self.assertEqual(self.put(sections=many).status_code, 400)
        bad_type = [{"id": "a", "type": "script", "visible": True, "data": {}}]
        self.assertEqual(self.put(sections=bad_type).status_code, 400)
        dup = [{"id": "a", "type": "text", "data": {}}, {"id": "a", "type": "text", "data": {}}]
        self.assertEqual(self.put(sections=dup).status_code, 400)
        unknown = [{"id": "a", "type": "text", "data": {"onclick": "x"}}]
        self.assertEqual(self.put(sections=unknown).status_code, 400)
        long = [{"id": "a", "type": "hero", "data": {"title": "x" * 500}}]
        self.assertEqual(self.put(sections=long).status_code, 400)
        _ = d

    def test_html_and_bad_links_rejected(self):
        for data in ({"title": "<script>alert(1)</script>"}, {"title": "<b>x</b>"}):
            r = self.put(sections=[{"id": "a", "type": "text", "data": data}])
            self.assertEqual(r.status_code, 400)
        for url in ("javascript:alert(1)", "data:text/html,x", "//evil.com", "ftp://x"):
            r = self.put(sections=[{"id": "a", "type": "cta", "data": {"button_url": url}}])
            self.assertEqual(r.status_code, 400, url)
        ok = self.put(sections=[{"id": "a", "type": "cta", "data": {
            "button_url": "https://example.com/x", "title": "سلام"}}])
        self.assertEqual(ok.status_code, 200)

    def test_size_limit(self):
        secs = [{"id": f"t{i}", "type": "text", "visible": True, "data": {"body": "ب" * 4000}}
                for i in range(20)]
        self.assertEqual(self.put(sections=secs).status_code, 400)

    def test_each_section_type_roundtrip(self):
        samples = {
            "hero": {"title": "T", "primary_url": "/x"},
            "about": {"title": "T", "body": "B", "image": "https://x.com/a.png"},
            "menu": {"title": "T", "max_items": 10, "show_prices": True},
            "gallery": {"images": [{"url": "https://x.com/a.png", "alt": "a"}]},
            "hours": {"days": [{"day": 0, "open": "09:00", "close": "18:00"}]},
            "contact": {"phone": "021-1234567", "address": "A", "lat": 35.7, "lng": 51.4},
            "text": {"title": "T", "body": "B"},
            "cta": {"title": "T", "button_url": "tel:+98211234567"},
            "footer": {"copyright": "c", "links": [{"label": "ig", "url": "https://x.com"}]},
        }
        secs = [{"id": k, "type": k, "visible": True, "data": v} for k, v in samples.items()]
        r = self.put(sections=secs)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(self.mine()["sections"]), 9)

    def test_bad_values_per_type(self):
        cases = [
            ("hours", {"days": [{"day": 9}]}), ("hours", {"days": [{"day": 1, "open": "25:00"}]}),
            ("contact", {"lat": 200}), ("contact", {"phone": "abc"}),
            ("gallery", {"images": [{"url": "http://x/../a.png"}]}),
            ("menu", {"max_items": 500}), ("menu", {"show_prices": "yes"}),
        ]
        for t, data in cases:
            r = self.put(sections=[{"id": "a", "type": t, "data": data}])
            self.assertEqual(r.status_code, 400, (t, data))


class TenantAndPermissionTests(StorefrontBase):
    def test_isolation(self):
        self.put(sections=[{"id": "a", "type": "text", "data": {"title": "ZZMARK"}}])
        other = APIClient()
        other.force_authenticate(self.o2)
        d = other.get("/api/storefront/mine/").json()["data"]
        self.assertNotEqual(d["slug"], self.mine()["slug"])
        self.assertNotIn("ZZMARK", str(d["sections"]))
        self.assertEqual(Storefront.all_objects.count(), 2)

    def test_cannot_restore_other_business_revision(self):
        self.api.post("/api/storefront/mine/publish/")
        rev_id = self.api.get("/api/storefront/mine/revisions/").json()["data"][0]["id"]
        other = APIClient()
        other.force_authenticate(self.o2)
        self.assertEqual(other.post(f"/api/storefront/mine/revisions/{rev_id}/restore/").status_code, 404)

    def test_tab_required(self):
        c = APIClient()
        c.force_authenticate(self.cashier)
        self.assertEqual(c.get("/api/storefront/mine/").status_code, 403)
        self.assertEqual(self.anon.get("/api/storefront/mine/").status_code in (401, 403), True)

    def test_super_admin_only_template_write(self):
        r = self.api.post("/api/super/storefront/templates/", {}, format="json")
        self.assertIn(r.status_code, (401, 403))

    def test_super_admin_template_crud(self):
        from bizsuite.views.super_admin.auth import _make_super_token, SUPER_TOKEN_COOKIE
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.admin))
        body = {"key": "mine-tpl", "name_fa": "الف", "name_en": "A",
                "default_theme": {"primary": "#112233"},
                "section_schema": {"allowed": ["hero", "text"]},
                "default_sections": [{"id": "h", "type": "hero", "data": {"title": "x"}}]}
        r = c.post("/api/super/storefront/templates/", body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        pk = r.json()["data"]["id"]
        body["default_sections"] = [{"id": "h", "type": "menu", "data": {}}]
        self.assertEqual(c.put(f"/api/super/storefront/templates/{pk}/", body, format="json").status_code, 400)
        r = c.post(f"/api/super/storefront/business/{self.b2.id}/template/", {"template_id": pk}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Storefront.all_objects.get(business=self.b2).template_id, pk)
        self.assertEqual(c.delete(f"/api/super/storefront/templates/{pk}/").status_code, 200)
        _ = SUPER_TOKEN_COOKIE


class PublicTests(StorefrontBase):
    FORBIDDEN = ("business", "business_id", "id", "published_data", "template", "user",
                 "owner", "phone_number", "stock", "cost", "password", "updated_at")

    def test_unpublished_is_404_and_draft_never_leaks(self):
        slug = self.mine()["slug"]
        self.assertEqual(self.anon.get(f"/api/storefront/{slug}/").status_code, 404)
        self.put(sections=[{"id": "a", "type": "text", "data": {"title": "DRAFTONLY"}}])
        self.api.post("/api/storefront/mine/publish/")
        self.put(sections=[{"id": "a", "type": "text", "data": {"title": "NEWDRAFT"}}])
        r = self.anon.get(f"/api/storefront/{slug}/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("DRAFTONLY", r.content.decode())
        self.assertNotIn("NEWDRAFT", r.content.decode())
        self.assertIn("max-age", r["Cache-Control"])

    def test_public_has_no_internal_fields(self):
        self.api.post("/api/storefront/mine/publish/")
        slug = self.mine()["slug"]
        data = self.anon.get(f"/api/storefront/{slug}/").json()

        def walk(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    yield k
                    yield from walk(v)
            elif isinstance(o, list):
                for v in o:
                    yield from walk(v)
        keys = set(walk({k: v for k, v in data.items() if k != "sections"}))
        for bad in self.FORBIDDEN:
            self.assertNotIn(bad, keys, bad)
        self.assertEqual(set(data), {"slug", "name", "content_language", "theme", "sections",
                                     "dashboard_url", "club_join", "menu_slug"})

    def test_hidden_sections_are_dropped(self):
        d = self.mine()
        secs = d["sections"]
        secs[1]["visible"] = False
        hidden_id = secs[1]["id"]
        self.put(sections=secs)
        self.api.post("/api/storefront/mine/publish/")
        data = self.anon.get(f"/api/storefront/{d['slug']}/").json()
        self.assertNotIn(hidden_id, [s["id"] for s in data["sections"]])

    def test_preset_rendering_data(self):
        self.api.post("/api/storefront/mine/publish/")
        data = self.anon.get(f"/api/storefront/{self.mine()['slug']}/").json()
        self.assertEqual(data["theme"]["font_family"], "Vazirmatn")
        self.assertEqual([s["type"] for s in data["sections"]][0], "hero")
        self.assertTrue(all(set(s) == {"id", "type", "visible", "data"} for s in data["sections"]))
        self.assertEqual(data["menu_slug"], "shop-one")

    def test_unpublish(self):
        slug = self.mine()["slug"]
        self.api.post("/api/storefront/mine/publish/")
        self.api.post("/api/storefront/mine/unpublish/")
        self.assertEqual(self.anon.get(f"/api/storefront/{slug}/").status_code, 404)

    def test_preview_token(self):
        slug = self.mine()["slug"]
        self.put(sections=[{"id": "a", "type": "text", "data": {"title": "SECRETDRAFT"}}])
        self.assertEqual(self.anon.get(f"/api/storefront/{slug}/preview/?token=bad").status_code, 404)
        tok = self.api.post("/api/storefront/mine/preview-token/").json()["data"]["token"]
        r = self.anon.get(f"/api/storefront/{slug}/preview/?token={tok}")
        self.assertEqual(r.status_code, 200)
        self.assertIn("SECRETDRAFT", r.content.decode())
        self.assertEqual(self.anon.get(f"/api/storefront/shop-two/preview/?token={tok}").status_code, 404)

    def test_menu_section_hidden_without_pos_module(self):
        slug = self.mine()["slug"]
        self.api.post("/api/storefront/mine/publish/")
        apply_modules(self.b1, {"storefront": {"is_enabled": True}, "pos": {"is_enabled": False},
                                "club": {"is_enabled": False}})
        data = self.anon.get(f"/api/storefront/{slug}/").json()
        self.assertNotIn("menu", [s["type"] for s in data["sections"]])
        self.assertNotIn("menu_slug", data)

    def test_storefront_module_off_hides_page(self):
        slug = self.mine()["slug"]
        self.api.post("/api/storefront/mine/publish/")
        apply_modules(self.b1, {"pos": {"is_enabled": True}, "storefront": {"is_enabled": False}})
        self.assertEqual(self.anon.get(f"/api/storefront/{slug}/").status_code, 404)

    def test_dashboard_link(self):
        self.api.post("/api/storefront/mine/publish/")
        data = self.anon.get(f"/api/storefront/{self.mine()['slug']}/").json()
        self.assertEqual(data["dashboard_url"], "https://app.example.com/shop-one/dashboard/")
        with override_settings(PLATFORM_PUBLIC_URL=""):
            data = self.anon.get(f"/api/storefront/{self.mine()['slug']}/").json()
            self.assertEqual(data["dashboard_url"], "/shop-one/dashboard/")


class PublishRestoreTests(StorefrontBase):
    def test_publish_revisions_restore(self):
        self.put(sections=[{"id": "a", "type": "text", "data": {"title": "V1"}}])
        self.api.post("/api/storefront/mine/publish/")
        self.put(sections=[{"id": "a", "type": "text", "data": {"title": "V2"}}])
        self.api.post("/api/storefront/mine/publish/")
        revs = self.api.get("/api/storefront/mine/revisions/").json()["data"]
        self.assertEqual(len(revs), 2)
        oldest = revs[-1]["id"]
        r = self.api.post(f"/api/storefront/mine/revisions/{oldest}/restore/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.mine()["sections"][0]["data"]["title"], "V1")
        # restore does not publish by itself
        pub = self.anon.get(f"/api/storefront/{self.mine()['slug']}/").json()
        self.assertEqual(pub["sections"][0]["data"]["title"], "V2")
        self.api.post(f"/api/storefront/mine/revisions/{oldest}/restore/", {"publish": True}, format="json")
        pub = self.anon.get(f"/api/storefront/{self.mine()['slug']}/").json()
        self.assertEqual(pub["sections"][0]["data"]["title"], "V1")

    def test_apply_template_resets_content(self):
        r = self.api.post("/api/storefront/mine/apply-template/", {"template": "minimal"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["data"]["template"], "minimal")
        self.assertEqual(self.api.post("/api/storefront/mine/apply-template/",
                                       {"template": "nope"}, format="json").status_code, 404)

    def test_slug_rules(self):
        self.assertEqual(self.put(slug="mine").status_code, 400)
        self.assertEqual(self.put(slug="Bad Slug").status_code, 400)
        self.mine()
        other = APIClient()
        other.force_authenticate(self.o2)
        other.get("/api/storefront/mine/")
        taken = Storefront.all_objects.get(business=self.b2).slug
        self.assertEqual(self.put(slug=taken).status_code, 400)
        self.assertEqual(self.put(slug="my-new-shop").status_code, 200)


class UploadTests(StorefrontBase):
    def up(self, content, name="a.png", ctype="image/png"):
        return self.api.post("/api/storefront/mine/assets/",
                             {"file": SimpleUploadedFile(name, content, content_type=ctype)},
                             format="multipart")

    def test_png_ok_random_name_under_media(self):
        r = self.up(png_bytes())
        self.assertEqual(r.status_code, 201, r.content)
        url = r.json()["data"]["url"]
        self.assertTrue(url.startswith("/media/storefront/"))
        self.assertNotIn("a.png", url)
        self.assertTrue(url.endswith(".png"))
        # url is accepted by section validation
        ok = self.put(sections=[{"id": "a", "type": "about", "data": {"image": url}}])
        self.assertEqual(ok.status_code, 200)

    def test_exif_stripped(self):
        raw = png_bytes(exif=True, fmt="JPEG")
        self.assertIn(b"SecretCamera", raw)
        r = self.up(raw, "p.jpg", "image/jpeg")
        self.assertEqual(r.status_code, 201)
        asset = StorefrontAsset.all_objects.get(pk=r.json()["data"]["id"])
        with asset.file.open("rb") as f:
            stored = f.read()
        self.assertNotIn(b"SecretCamera", stored)
        self.assertFalse(Image.open(io.BytesIO(stored)).getexif())

    def test_webp_ok(self):
        self.assertEqual(self.up(png_bytes(fmt="WEBP"), "a.webp", "image/webp").status_code, 201)

    def test_rejects_other_formats_and_fake_ext(self):
        self.assertEqual(self.up(png_bytes(fmt="GIF"), "a.png").status_code, 400)
        self.assertEqual(self.up(png_bytes(fmt="BMP"), "a.png").status_code, 400)
        self.assertEqual(self.up(b"<svg onload=alert(1)></svg>", "a.png").status_code, 400)
        self.assertEqual(self.up(b"not an image", "a.jpg", "image/jpeg").status_code, 400)

    def test_rejects_over_5mb(self):
        self.assertEqual(self.up(b"0" * (5 * 1024 * 1024 + 1)).status_code, 400)

    def test_requires_file_and_tab(self):
        self.assertEqual(self.api.post("/api/storefront/mine/assets/", {}, format="multipart").status_code, 400)
        c = APIClient()
        c.force_authenticate(self.cashier)
        r = c.post("/api/storefront/mine/assets/", {"file": SimpleUploadedFile("a.png", png_bytes())},
                   format="multipart")
        self.assertEqual(r.status_code, 403)


class DomainTests(StorefrontBase):
    def setUp(self):
        super().setUp()
        self.mine()
        self.sf = Storefront.all_objects.get(business=self.b1)

    def set_domain(self, value, client=None):
        return (client or self.api).put("/api/storefront/mine/", {"custom_domain": value}, format="json")

    def test_addresses_in_editor(self):
        a = self.mine()["addresses"]
        self.assertEqual(a["public_url"], f"https://app.example.com/s/{self.sf.slug}")
        self.assertEqual(a["dashboard_url"], "https://app.example.com/shop-one/dashboard/")
        self.assertEqual(a["qr_order_url"], "https://app.example.com/m/shop-one")

    def test_validation(self):
        for bad in ("*.example.com", "https://shop.example.com", "shop.example.com:8000",
                    "shop.example.com/x", "localhost", "127.0.0.1", "nodot", "app.example.com",
                    "testserver", "a_b.example.com", "-x.example.com"):
            self.assertEqual(self.set_domain(bad).status_code, 400, bad)
        self.assertEqual(self.set_domain("Shop.Example.IR").status_code, 200)
        self.sf.refresh_from_db()
        self.assertEqual(self.sf.custom_domain, "shop.example.ir")

    def test_unique_and_clear(self):
        self.set_domain("shop.example.ir")
        other = APIClient()
        other.force_authenticate(self.o2)
        self.assertEqual(self.set_domain("shop.example.ir", other).status_code, 400)
        self.assertEqual(self.set_domain("").status_code, 200)
        self.sf.refresh_from_db()
        self.assertIsNone(self.sf.custom_domain)

    def test_only_owner_sets_domain(self):
        m = APIClient()
        m.force_authenticate(self.mgr)
        self.assertEqual(self.set_domain("x.example.ir", m).status_code, 403)

    def test_super_admin_sets_domain(self):
        from bizsuite.views.super_admin.auth import _make_super_token
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.admin))
        r = c.put(f"/api/super/storefront/business/{self.b1.id}/domain/",
                  {"custom_domain": "boss.example.ir"}, format="json")
        self.assertEqual(r.status_code, 200)
        r = c.put(f"/api/super/storefront/business/{self.b1.id}/domain/",
                  {"custom_domain": "*.example.ir"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_exact_host_match_serves_storefront_at_root(self):
        self.set_domain("shop.example.ir")
        self.api.post("/api/storefront/mine/publish/")
        r = self.anon.get("/", HTTP_HOST="shop.example.ir")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["slug"], self.sf.slug)
        r = self.anon.get("/", HTTP_HOST="SHOP.example.ir:443")
        self.assertEqual(r.status_code, 200)

    def test_unknown_host_ignored(self):
        self.set_domain("shop.example.ir")
        self.api.post("/api/storefront/mine/publish/")
        for host in ("other.example.ir", "sub.shop.example.ir", "example.ir"):
            r = self.anon.get("/api/health/", HTTP_HOST=host)
            self.assertEqual(r.status_code, 400, host)  # DisallowedHost, not mapped
        r = self.anon.get("/", HTTP_HOST="testserver")
        self.assertNotEqual(r.status_code, 200 if r.get("Content-Type", "").startswith("application/json") else -1)

    def test_unpublished_not_served_via_domain(self):
        self.set_domain("shop.example.ir")
        r = self.anon.get("/", HTTP_HOST="shop.example.ir")
        self.assertNotEqual(r.status_code, 200)
        self.api.post("/api/storefront/mine/publish/")
        self.assertEqual(self.anon.get("/", HTTP_HOST="shop.example.ir").status_code, 200)
        self.api.post("/api/storefront/mine/unpublish/")
        self.assertNotEqual(self.anon.get("/", HTTP_HOST="shop.example.ir").status_code, 200)

    def test_own_host_cannot_be_claimed_or_hijacked(self):
        self.assertEqual(self.set_domain("app.example.com").status_code, 400)
        Storefront.all_objects.filter(pk=self.sf.pk).update(custom_domain="testserver", is_published=True)
        r = self.anon.get("/", HTTP_HOST="testserver")
        self.assertFalse(r.get("Content-Type", "").startswith("application/json")
                         and r.json().get("slug") == self.sf.slug)


@override_settings(PLATFORM_PUBLIC_URL="https://app.example.com")
class ClubJoinTests(StorefrontBase):
    def setUp(self):
        super().setUp()
        self.slug = self.mine()["slug"]
        self.api.post("/api/storefront/mine/publish/")
        self.api.put("/api/club/settings/", {"is_active": True, "earn_amount": 10000,
                                              "welcome_points": 5}, format="json")
        self.url = f"/api/storefront/{self.slug}/club/join/"

    def join(self, **over):
        body = {"name": "سارا", "phone": "09121234567"}
        body.update(over)
        return self.anon.post(self.url, body, format="json")

    def test_join_and_persian_digits(self):
        r = self.join(phone="۰۹۱۲۱۲۳۴۵۶۷")
        self.assertEqual(r.status_code, 200, r.content)
        m = LoyaltyMember.all_objects.get(business=self.b1)
        self.assertEqual(m.phone, "09121234567")
        self.assertEqual(m.points_balance, 5)

    def test_duplicate_same_message_no_enumeration(self):
        r1 = self.join()
        r2 = self.join()
        self.assertEqual(r1.status_code, r2.status_code)
        self.assertEqual(r1.json(), r2.json())
        self.assertEqual(LoyaltyMember.all_objects.filter(business=self.b1).count(), 1)

    def test_invalid_phone_and_missing_name(self):
        self.assertEqual(self.join(phone="12").status_code, 400)
        self.assertEqual(self.join(name="").status_code, 400)

    def test_honeypot_creates_nothing(self):
        r = self.join(website="http://spam")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(LoyaltyMember.all_objects.count(), 0)

    def test_rate_limited(self):
        codes = [self.join(phone=f"0912123456{i}").status_code for i in range(7)]
        self.assertEqual(codes[:5], [200] * 5)
        self.assertEqual(codes[5], 429)

    def test_requires_published_storefront(self):
        self.api.post("/api/storefront/mine/unpublish/")
        self.assertEqual(self.join().status_code, 404)
        self.assertEqual(LoyaltyMember.all_objects.count(), 0)

    def test_requires_club_module(self):
        apply_modules(self.b1, {"storefront": {"is_enabled": True}, "pos": {"is_enabled": True},
                                "club": {"is_enabled": False}})
        self.assertEqual(self.join().status_code, 404)
        apply_modules(self.b1, {"club": {"is_enabled": True}})
        self.assertEqual(self.join().status_code, 200)

    def test_requires_club_active_in_settings(self):
        self.api.put("/api/club/settings/", {"is_active": False}, format="json")
        self.assertEqual(self.join().status_code, 404)

    def test_other_business_unaffected(self):
        self.join()
        self.assertEqual(LoyaltyMember.all_objects.filter(business=self.b2).count(), 0)
