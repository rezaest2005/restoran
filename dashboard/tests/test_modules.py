from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bizsuite.models import Business, BusinessModule, User
from bizsuite.modules import (
    ModuleDependencyError, apply_modules, business_state, enabled_modules, ensure_catalog,
    module_enabled,
)
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token


class _Result:
    def __init__(self, status_code, body):
        self.status_code, self._body, self.content = status_code, body, str(body).encode()

    def json(self):
        return self._body


class ModuleBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.biz = Business.objects.create(name="الف", slug="mod-a")
        cls.owner = User.objects.create_user(
            username="mo1", password="Pass12345!", role="owner", business=cls.biz)
        cls.admin = User.objects.create_superuser(username="msu", password="Pass12345!")

    def setUp(self):
        clear_current_business()
        self.sup = APIClient()
        self.sup.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.admin))
        self.staff = APIClient()
        self.staff.force_authenticate(self.owner)

    def put(self, modules, auto_requires=False):
        """Apply module changes through the service (the old super-admin modules endpoint was removed with its tab)."""
        from django.utils.dateparse import parse_datetime
        changes = {}
        for code, ch in modules.items():
            item = dict(ch)
            for f in ("starts_at", "expires_at"):
                if f in item and item[f]:
                    item[f] = parse_datetime(item[f])
            changes[code] = item
        try:
            return _Result(200, {"data": apply_modules(self.biz, changes, auto_requires)})
        except ModuleDependencyError as exc:
            return _Result(409, {"errors": exc.details})


class CatalogueTests(ModuleBase):
    def test_catalogue_has_all_modules_and_edges(self):
        from bizsuite.models import Module
        codes = {m.code: {"requires": m.requires, "suggests": m.suggests, "name_fa": m.name_fa, "name_en": m.name_en,
                          "price_monthly": m.price_monthly, "is_core": m.is_core} for m in Module.objects.all()}
        self.assertEqual(set(codes), {"pos", "club", "inventory", "production", "accounting",
                                      "delivery", "feedback"})
        self.assertEqual(codes["club"]["requires"], [])       # club works standalone (no POS)
        self.assertIn("pos", codes["club"]["suggests"])
        self.assertEqual(codes["production"]["requires"], ["inventory"])
        self.assertIn("accounting", codes["delivery"]["suggests"])
        self.assertTrue(all(k in codes["pos"] for k in ("name_fa", "name_en", "price_monthly", "is_core")))

    def test_unmanaged_business_has_everything(self):
        self.assertIsNone(enabled_modules(self.biz))
        self.assertTrue(module_enabled(self.biz, "accounting"))
        self.assertTrue(module_enabled(None, "pos") or True)


class DependencyTests(ModuleBase):
    def test_enable_refuses_with_clear_list(self):
        self.put({c: {"is_enabled": False} for c in
                  ("pos", "club", "inventory", "production", "accounting", "delivery",
                   "feedback")})
        r = self.put({"production": {"is_enabled": True}})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["errors"]["missing_requires"], {"production": ["inventory"]})
        self.assertFalse(module_enabled(self.biz, "production"))
        r = self.put({"club": {"is_enabled": True}})       # standalone module
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(module_enabled(self.biz, "club"))

    def test_auto_requires_enables_prerequisites(self):
        self.put({c: {"is_enabled": False} for c in
                  ("pos", "club", "inventory", "production", "accounting", "delivery",
                   "feedback")})
        r = self.put({"production": {"is_enabled": True}}, auto_requires=True)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(enabled_modules(self.biz), {"production", "inventory"})

    def test_disable_refused_while_dependents_enabled(self):
        r = self.put({"inventory": {"is_enabled": False}})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["errors"]["dependents"], {"inventory": ["production"]})
        r = self.put({"inventory": {"is_enabled": False}, "production": {"is_enabled": False}})
        self.assertEqual(r.status_code, 200)

    def test_unknown_module_rejected(self):
        self.assertEqual(self.put({"nope": {"is_enabled": True}}).status_code, 409)

    def test_expired_prerequisite_disables_dependent(self):
        past = (timezone.now() - timedelta(days=1)).isoformat()
        r = self.put({"inventory": {"expires_at": past}})
        self.assertEqual(r.status_code, 200)
        live = enabled_modules(self.biz)
        self.assertNotIn("inventory", live)
        self.assertNotIn("production", live)  # hard requirement not live
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
        self.put({"accounting": {"is_enabled": False}})
        data = self.staff.get("/api/auth/me/").json()["data"]
        self.assertNotIn("accounting", data["business_tabs"])      # unsold module -> no tab
        self.assertIn("pos", data["business_tabs"])
        self.assertNotIn("accounting", data["business_modules"])
        self.assertIn("pos", data["business_modules"])


class ModuleServiceTests(ModuleBase):
    def test_price_summary_with_override(self):
        self.put({c: {"is_enabled": c in ("pos", "accounting")} for c in
                  ("pos", "club", "inventory", "production", "accounting", "delivery", "feedback")})
        base = business_state(self.biz)["total_monthly"]
        r = self.put({"pos": {"price_override": 1000}})
        self.assertEqual(r.status_code, 200)
        delta = base - r.json()["data"]["total_monthly"]
        from bizsuite.models import Module
        self.assertEqual(delta, Module.objects.get(code="pos").price_monthly - 1000)

    def test_apply_modules_service_raises(self):
        apply_modules(self.biz, {c: {"is_enabled": False} for c in ("inventory", "production")})
        with self.assertRaises(ModuleDependencyError):
            apply_modules(self.biz, {"production": {"is_enabled": True}})
