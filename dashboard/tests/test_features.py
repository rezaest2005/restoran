"""دسترسی سه‌لایه: ماژول ∩ تب فعال‌شده توسط سوپرادمین ∩ تب داده‌شده به کاربر — در API هم اعمال می‌شود."""

from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.features import ALL_FEATURE_KEYS, licensed_features, user_features
from bizsuite.models import Business, User
from bizsuite.modules import apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token


class FeatureBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.biz = Business.objects.create(name="الف", slug="feat-a")
        cls.other = Business.objects.create(name="ب", slug="feat-b")
        cls.owner = User.objects.create_user(username="fo", password="Pass12345!", role="owner", business=cls.biz)
        cls.cashier = User.objects.create_user(username="fc", password="Pass12345!", role="cashier", business=cls.biz)
        cls.keeper = User.objects.create_user(username="fk", password="Pass12345!", role="warehouse", business=cls.biz)
        cls.root = User.objects.create_superuser(username="fsu", password="Pass12345!")

    def setUp(self):
        clear_current_business()

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def sell(self, *codes, disabled=()):
        from bizsuite.modules import CATALOG
        apply_modules(self.biz, {m["code"]: {"is_enabled": m["code"] in codes} for m in CATALOG}, auto_requires=True)
        self.biz.disabled_features = list(disabled)
        self.biz.save(update_fields=["disabled_features"])
        clear_current_business()


class LicenceTests(FeatureBase):
    def test_delivery_only_account_gets_no_other_module_tabs(self):
        self.sell("delivery")
        feats = user_features(self.owner)
        self.assertIn("delivery_dispatch", feats)
        self.assertIn("dictionary_customers", feats)
        for k in ("pos", "inventory_warehouse", "accounting", "kitchen", "club", "dictionary_items", "dictionary_menu"):
            self.assertNotIn(k, feats, k)

    def test_disabled_feature_hidden_even_for_owner_and_locked_cannot_be_disabled(self):
        self.sell("pos", "inventory", disabled=["pos_settings", "home", "dictionary_users"])
        feats = user_features(self.owner)
        self.assertNotIn("pos_settings", feats)
        self.assertIn("home", feats)
        self.assertIn("dictionary_users", feats)

    def test_user_gets_only_ticked_tabs_inside_licence(self):
        self.sell("pos", "inventory")
        self.cashier.tabs = {"pos": True, "accounting": True, "inventory_reports": True}
        self.cashier.save()
        feats = user_features(self.cashier)
        self.assertEqual(feats, {"home", "pos", "inventory_reports"})   # accounting not sold

    def test_unmanaged_business_has_everything(self):
        self.assertEqual(licensed_features(self.biz), set(ALL_FEATURE_KEYS))


class ApiEnforcementTests(FeatureBase):
    def test_tab_ticks_are_honoured_by_the_api(self):
        """باگ قدیمی: انباردار با تب‌های inventory_* روی API انبار ۴۰۳ می‌گرفت."""
        self.sell("inventory")
        self.keeper.tabs = {"inventory_warehouse": True}
        self.keeper.save()
        r = self.api(self.keeper).get("/api/inventory/warehouses/")
        self.assertNotEqual(r.status_code, 403, r.content[:200])

    def test_unsold_module_endpoints_are_forbidden_even_for_owner(self):
        self.sell("delivery")
        for path in ("/api/accounting/summary/", "/api/inventory/warehouses/", "/api/club/members/"):
            self.assertEqual(self.api(self.owner).get(path).status_code, 403, path)

    def test_user_without_tab_is_forbidden(self):
        self.sell("inventory", "accounting")
        self.keeper.tabs = {"inventory_warehouse": True}
        self.keeper.save()
        self.assertEqual(self.api(self.keeper).get("/api/accounting/summary/").status_code, 403)

    def test_delivery_subtabs_are_enforced_per_endpoint(self):
        self.sell("delivery", disabled=["delivery_cash", "delivery_fleet"])
        c = self.api(self.owner)
        self.assertEqual(c.get("/api/delivery/cash/").status_code, 403)
        self.assertEqual(c.get("/api/delivery/settlements/").status_code, 403)
        self.assertEqual(c.get("/api/delivery/vehicles/").status_code, 200)      # dispatch tab may read the fleet
        self.assertEqual(c.post("/api/delivery/vehicles/", {"name": "x"}, format="json").status_code, 403)  # only fleet tab writes
        self.assertEqual(c.get("/api/delivery/trips/").status_code, 200)

    def test_delivery_without_any_trip_tab_blocks_fleet_reads(self):
        self.sell("delivery", disabled=["delivery_dispatch", "delivery_shipments", "delivery_fleet"])
        c = self.api(self.owner)
        self.assertEqual(c.get("/api/delivery/vehicles/").status_code, 403)
        self.assertEqual(c.get("/api/delivery/trips/").status_code, 403)

    def test_pos_price_edit_needs_pos_settings_tab(self):
        self.sell("pos", disabled=["pos_settings"])
        r = self.api(self.owner).post("/api/pos/update-food-price/", {"food_id": 1, "price": 5}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_inventory_report_tab_switch_blocks_report_api(self):
        self.sell("inventory", disabled=["inventory_reports"])
        c = self.api(self.owner)
        self.assertEqual(c.get("/api/inventory/reports/stock-value/").status_code, 403)
        self.assertEqual(c.get("/api/inventory/purchase-suggestions/").status_code, 200)


class TabsApiTests(FeatureBase):
    def post_tabs(self, actor, target, tabs):
        return self.api(actor).post("/api/users/tabs/", {"user_id": target.id, "tabs": tabs}, format="json")

    def find_tabs_url(self):
        from django.urls import reverse
        return reverse("user_tabs_api")

    def test_owner_cannot_grant_unsold_tabs(self):
        from django.urls import reverse
        self.sell("pos")
        url = reverse("user_tabs_api")
        c = self.api(self.owner)
        r = c.post(url, {"user_id": self.cashier.id, "tabs": {"pos": True, "accounting": True, "kitchen": True}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.cashier.refresh_from_db()
        self.assertTrue(self.cashier.tabs["pos"])
        self.assertFalse(self.cashier.tabs["accounting"])
        self.assertFalse(self.cashier.tabs["kitchen"])


class SuperAdminLicenceTests(FeatureBase):
    def setUp(self):
        super().setUp()
        self.sup = APIClient()
        self.sup.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.root))

    def test_set_disabled_features_and_reject_unknown(self):
        url = f"/api/super/businesses/{self.biz.id}/modules/"
        ok = self.sup.put(url, {"disabled_features": ["pos_settings", "accounting"]}, format="json")
        self.assertEqual(ok.status_code, 200, ok.content)
        self.biz.refresh_from_db()
        self.assertEqual(self.biz.disabled_features, ["accounting", "pos_settings"])
        bad = self.sup.put(url, {"disabled_features": ["nope"]}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(self.sup.get(url).json()["data"]["disabled_features"], ["accounting", "pos_settings"])

    def test_catalogue_endpoint_lists_features(self):
        r = self.sup.get("/api/super/features/")
        self.assertEqual(r.status_code, 200)
        keys = {f["key"] for f in r.json()["data"]}
        self.assertIn("delivery_shipments", keys)

    def test_staff_cannot_use_super_endpoints(self):
        r = self.api(self.owner).put(f"/api/super/businesses/{self.biz.id}/modules/",
                                     {"disabled_features": []}, format="json")
        self.assertIn(r.status_code, (401, 403))


class EndToEndTickTests(FeatureBase):
    """سناریوی کاربر: تیک سوپرادمین ← داشبورد نشان می‌دهد؛ بی‌تیک ← نه منو، نه API."""

    def api(self, user):
        # هر درخواست واقعی کاربر را تازه از دیتابیس می‌خواند؛ نمونه‌ی کش‌شده‌ی تست نباید مجوز قدیمی را نگه دارد
        return super().api(User.objects.get(pk=user.pk))

    def tabs_of(self, user):
        c = self.api(user)
        return set(c.get("/api/auth/me/").json()["data"]["business_tabs"])

    def test_super_admin_tick_untick_changes_menu_and_api_together(self):
        sup = APIClient()
        sup.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.root))
        url = f"/api/super/businesses/{self.biz.id}/modules/"
        mods = {m: {"is_enabled": m in ("delivery", "pos")} for m in
                ("pos", "club", "inventory", "production", "accounting", "delivery", "feedback", "storefront")}
        sup.put(url, {"modules": mods, "disabled_features": []}, format="json")
        clear_current_business()
        self.assertIn("delivery_cash", self.tabs_of(self.owner))
        self.assertEqual(self.api(self.owner).get("/api/delivery/cash/").status_code, 200)

        # سوپرادمین تیک «صندوق پیک» را برمی‌دارد
        sup.put(url, {"disabled_features": ["delivery_cash"]}, format="json")
        clear_current_business()
        self.assertNotIn("delivery_cash", self.tabs_of(self.owner))
        self.assertEqual(self.api(self.owner).get("/api/delivery/cash/").status_code, 403)
        self.assertIn("delivery_fleet", self.tabs_of(self.owner))     # بقیه سر جای خود

        # دوباره تیک می‌زند
        sup.put(url, {"disabled_features": []}, format="json")
        clear_current_business()
        self.assertIn("delivery_cash", self.tabs_of(self.owner))
        self.assertEqual(self.api(self.owner).get("/api/delivery/cash/").status_code, 200)

    def test_owner_ticks_for_staff_only_inside_what_was_sold(self):
        self.sell("pos", "delivery", disabled=["delivery_cash"])
        from django.urls import reverse
        r = self.api(self.owner).post(reverse("user_tabs_api"), {"user_id": self.cashier.id, "tabs": {
            "pos": True, "orders": True, "delivery_dispatch": True, "delivery_cash": True, "accounting": True}}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.tabs_of(self.cashier), {"home", "pos", "orders", "delivery_dispatch"})
        self.assertEqual(self.api(self.cashier).get("/api/delivery/cash/").status_code, 403)
        self.assertEqual(self.api(self.cashier).get("/api/delivery/trips/").status_code, 200)
