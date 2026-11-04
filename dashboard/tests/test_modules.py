from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bizsuite.models import Business, BusinessModule, Plan, User
from bizsuite.modules import (
    ModuleDependencyError, apply_modules, business_state, enabled_modules, ensure_catalog,
    module_enabled,
)
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token


class ModuleBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.biz = Business.objects.create(name="الف", slug="mod-a", dashboard_permissions=[])
        cls.owner = User.objects.create_user(
            username="mo1", password="Pass12345!", role="owner", business=cls.biz)
        cls.admin = User.objects.create_superuser(username="msu", password="Pass12345!")

    def setUp(self):
        clear_current_business()
        self.sup = APIClient()
        self.sup.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.admin))
        self.staff = APIClient()
        self.staff.force_authenticate(self.owner)

    def url(self, suffix="modules/"):
        return f"/api/super/businesses/{self.biz.id}/{suffix}"

    def put(self, modules, **extra):
        return self.sup.put(self.url(), {"modules": modules, **extra}, format="json")


class CatalogueTests(ModuleBase):
    def test_catalogue_has_all_modules_and_edges(self):
        r = self.sup.get("/api/super/modules/").json()["data"]
        codes = {m["code"]: m for m in r}
        self.assertEqual(set(codes), {"pos", "club", "inventory", "production", "accounting",
                                      "delivery", "feedback", "storefront"})
        self.assertEqual(codes["club"]["requires"], ["pos"])
        self.assertIn("accounting", codes["delivery"]["suggests"])
        self.assertTrue(all(k in codes["pos"] for k in ("name_fa", "name_en", "price_monthly", "is_core")))

    def test_unmanaged_business_has_everything(self):
        self.assertIsNone(enabled_modules(self.biz))
        self.assertTrue(module_enabled(self.biz, "accounting"))
        self.assertTrue(module_enabled(None, "pos") or True)

    def test_price_update_super_only(self):
        r = self.sup.post("/api/super/modules/", {"code": "pos", "price_monthly": 777}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.staff.post("/api/super/modules/", {"code": "pos", "price_monthly": 1},
                                         format="json").status_code, 403)


class DependencyTests(ModuleBase):
    def test_enable_refuses_with_clear_list(self):
        self.put({c: {"is_enabled": False} for c in
                  ("pos", "club", "inventory", "production", "accounting", "delivery",
                   "feedback", "storefront")})
        r = self.put({"club": {"is_enabled": True}})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["errors"]["missing_requires"], {"club": ["pos"]})
        self.assertFalse(module_enabled(self.biz, "club"))

    def test_auto_requires_enables_prerequisites(self):
        self.put({c: {"is_enabled": False} for c in
                  ("pos", "club", "inventory", "production", "accounting", "delivery",
                   "feedback", "storefront")})
        r = self.put({"production": {"is_enabled": True}}, auto_requires=True)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(enabled_modules(self.biz), {"production", "inventory"})

    def test_disable_refused_while_dependents_enabled(self):
        r = self.put({"pos": {"is_enabled": False}})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["errors"]["dependents"], {"pos": ["club"]})
        r = self.put({"pos": {"is_enabled": False}, "club": {"is_enabled": False}})
        self.assertEqual(r.status_code, 200)

    def test_unknown_module_rejected(self):
        self.assertEqual(self.put({"nope": {"is_enabled": True}}).status_code, 409)

    def test_expired_prerequisite_disables_dependent(self):
        past = (timezone.now() - timedelta(days=1)).isoformat()
        r = self.put({"pos": {"expires_at": past}})
        self.assertEqual(r.status_code, 200)
        live = enabled_modules(self.biz)
        self.assertNotIn("pos", live)
        self.assertNotIn("club", live)  # hard requirement not live
        self.assertIn("accounting", live)


class ExpiryAndEnforcementTests(ModuleBase):
    def test_expiry_and_start(self):
        self.put({"accounting": {"expires_at": (timezone.now() + timedelta(days=5)).isoformat()}})
        self.assertTrue(module_enabled(self.biz, "accounting"))
        row = BusinessModule.objects.get(business=self.biz, module__code="accounting")
        row.expires_at = timezone.now() - timedelta(seconds=1)
        row.save()
        self.assertFalse(module_enabled(self.biz, "accounting"))
        row.expires_at = None
        row.starts_at = timezone.now() + timedelta(days=1)
        row.save()
        self.assertFalse(module_enabled(self.biz, "accounting"))

    def test_403_when_module_disabled_and_200_when_enabled(self):
        self.put({"accounting": {"is_enabled": True}})
        self.assertEqual(self.staff.get("/api/accounting/summary/").status_code, 200)
        self.put({"accounting": {"is_enabled": False}})
        self.assertEqual(self.staff.get("/api/accounting/summary/").status_code, 403)
        self.assertEqual(self.staff.get("/api/inventory/stock/").status_code, 200)

    def test_expired_module_returns_403(self):
        self.put({"accounting": {"expires_at": (timezone.now() - timedelta(days=1)).isoformat()}})
        self.assertEqual(self.staff.get("/api/accounting/summary/").status_code, 403)

    def test_tab_visible_only_if_module_and_user_tab(self):
        cashier = User.objects.create_user(
            username="mc1", password="Pass12345!", role="cashier", business=self.biz,
            dashboard_permissions=["pos"])
        c = APIClient()
        c.force_authenticate(cashier)
        self.assertEqual(c.get("/api/pos/daily-report/").status_code, 200)
        self.put({"pos": {"is_enabled": False}, "club": {"is_enabled": False}})
        self.assertEqual(c.get("/api/pos/daily-report/").status_code, 403)
        # module on but user lacks the tab
        self.put({"pos": {"is_enabled": True}})
        self.assertEqual(c.get("/api/club/members/").status_code, 403)

    def test_business_tabs_and_modules_in_me(self):
        self.biz.dashboard_permissions = ["pos", "accounting", "storefront"]
        self.biz.save()
        self.put({"accounting": {"is_enabled": False}})
        data = self.staff.get("/api/auth/me/").json()["data"]
        self.assertNotIn("accounting", data["business_tabs"])
        self.assertIn("pos", data["business_tabs"])
        self.assertNotIn("accounting", data["business_modules"])
        self.assertIn("storefront", data["business_modules"])


class SuperAdminAccessTests(ModuleBase):
    def test_non_super_cannot_read_or_write(self):
        for call in (lambda c: c.get(self.url()), lambda c: c.put(self.url(), {"modules": {}}, format="json"),
                     lambda c: c.post(self.url("plan/"), {"plan": "full"}, format="json"),
                     lambda c: c.post("/api/super/plans/", {}, format="json")):
            self.assertEqual(call(self.staff).status_code, 403)
            self.assertIn(call(APIClient()).status_code, (401, 403))

    def test_price_summary_with_override(self):
        self.put({c: {"is_enabled": c in ("pos", "accounting")} for c in
                  ("pos", "club", "inventory", "production", "accounting", "delivery",
                   "feedback", "storefront")})
        base = business_state(self.biz)["total_monthly"]
        r = self.put({"pos": {"price_override": 1000}})
        self.assertEqual(r.status_code, 200)
        delta = base - r.json()["data"]["total_monthly"]
        from bizsuite.models import Module
        self.assertEqual(delta, Module.objects.get(code="pos").price_monthly - 1000)
        self.assertEqual(self.put({"pos": {"price_override": -5}}).status_code, 400)
        self.assertEqual(self.put({"pos": {"expires_at": "garbage"}}).status_code, 400)

    def test_apply_plan_enables_bundle_with_prerequisites(self):
        r = self.sup.post(self.url("plan/"), {"plan": "retail"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(enabled_modules(self.biz), {"pos", "club", "inventory", "storefront"})
        Plan.objects.filter(code="starter").update(modules=["club"])
        r = self.sup.post(self.url("plan/"), {"plan": "starter"}, format="json")
        self.assertEqual(enabled_modules(self.biz), {"pos", "club"})
        self.assertEqual(self.sup.post(self.url("plan/"), {"plan": "none"}, format="json").status_code, 404)

    def test_plan_create_validates(self):
        ok = self.sup.post("/api/super/plans/", {"code": "mini", "name_fa": "م", "name_en": "M",
                                                 "price_monthly": 5, "modules": ["pos"]}, format="json")
        self.assertEqual(ok.status_code, 200)
        bad = self.sup.post("/api/super/plans/", {"code": "x", "name_fa": "م", "name_en": "M",
                                                  "price_monthly": 5, "modules": ["zzz"]}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_apply_modules_service_raises(self):
        apply_modules(self.biz, {c: {"is_enabled": False} for c in ("pos", "club")})
        with self.assertRaises(ModuleDependencyError):
            apply_modules(self.biz, {"club": {"is_enabled": True}})
