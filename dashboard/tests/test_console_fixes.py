"""Smoke checks for formerly-500 URLs."""
from bizsuite.features import POS_ACTION_KEYS
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, User
from bizsuite.modules import apply_modules
from bizsuite.tenancy import clear_current_business

URLS = ("/api/accounting/accounts/", "/api/accounting/journal/")


class ConsoleFixTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.biz = Business.objects.create(name="Demo", slug="demo")
        # legacy owner whose saved tab list is stale
        cls.owner = User.objects.create_user(
            username="cfowner", password="Pass12345!", role="owner", business=cls.biz,
            dashboard_permissions=["pos", "accounting", *POS_ACTION_KEYS])
        cls.manager = User.objects.create_user(
            username="cfmgr", password="Pass12345!", role="manager", business=cls.biz,
            dashboard_permissions=["pos", *POS_ACTION_KEYS])
        cls.nobiz = User.objects.create_user(username="cfnobiz", password="Pass12345!", role="owner")
        cls.root = User.objects.create_superuser(username="cfroot", password="Pass12345!")

    def setUp(self):
        cache.clear()
        clear_current_business()

    def client_for(self, user):
        c = APIClient(HTTP_HOST="localhost")
        c.force_authenticate(user)
        return c

    def test_no_server_errors_for_owner_nobiz_and_superuser(self):
        for user in (self.owner, self.nobiz, self.root):
            c = self.client_for(user)
            for url in URLS:
                r = c.get(url)
                self.assertLess(r.status_code, 500, f"{user.username} {url} -> {r.status_code}")
