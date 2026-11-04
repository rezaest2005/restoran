"""Owner permissions on the storefront tab and smoke checks for formerly-500 URLs."""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, User
from bizsuite.modules import apply_modules
from bizsuite.tenancy import clear_current_business

URLS = ("/api/accounting/accounts/", "/api/accounting/journal/", "/api/storefront/mine/")


class ConsoleFixTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.biz = Business.objects.create(name="Demo", slug="demo")
        # legacy owner whose saved tab list predates the storefront tab
        cls.owner = User.objects.create_user(
            username="cfowner", password="Pass12345!", role="owner", business=cls.biz,
            dashboard_permissions=["pos", "accounting"])
        cls.manager = User.objects.create_user(
            username="cfmgr", password="Pass12345!", role="manager", business=cls.biz,
            dashboard_permissions=["pos"])
        cls.nobiz = User.objects.create_user(username="cfnobiz", password="Pass12345!", role="owner")
        cls.root = User.objects.create_superuser(username="cfroot", password="Pass12345!")

    def setUp(self):
        cache.clear()
        clear_current_business()

    def client_for(self, user):
        c = APIClient(HTTP_HOST="localhost")
        c.force_authenticate(user)
        return c

    def test_owner_can_apply_template_despite_stale_permission_list(self):
        apply_modules(self.biz, {"pos": {"is_enabled": True}, "storefront": {"is_enabled": True}})
        r = self.client_for(self.owner).post(
            "/api/storefront/mine/apply-template/", {"template": "minimal"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def test_owner_blocked_when_storefront_module_disabled(self):
        apply_modules(self.biz, {"pos": {"is_enabled": True}, "storefront": {"is_enabled": False}})
        r = self.client_for(self.owner).post(
            "/api/storefront/mine/apply-template/", {"template": "minimal"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_restricted_manager_still_forbidden(self):
        apply_modules(self.biz, {"pos": {"is_enabled": True}, "storefront": {"is_enabled": True}})
        r = self.client_for(self.manager).post(
            "/api/storefront/mine/apply-template/", {"template": "minimal"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_no_server_errors_for_owner_nobiz_and_superuser(self):
        for user in (self.owner, self.nobiz, self.root):
            c = self.client_for(user)
            for url in URLS:
                r = c.get(url)
                self.assertLess(r.status_code, 500, f"{user.username} {url} -> {r.status_code}")
