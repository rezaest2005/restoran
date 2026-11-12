"""مرورگر هم کوکی نشست دارد هم توکن JWT؛ درخواست‌های POST با توکن نباید به‌خاطر CSRF کوکی ۴۰۳ شوند."""

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bizsuite.models import Business, Driver, User
from bizsuite.tenancy import clear_current_business


class BrowserAuthTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.b = Business.objects.create(name="الف", slug="ba-one")
        cls.u = User.objects.create_user(username="ba_drv", password="Pass12345!", role="driver", business=cls.b, is_approved=True)
        cls.drv = Driver.all_objects.create(business=cls.b, name="پیک", user=cls.u)

    def setUp(self):
        clear_current_business()

    def browser(self):
        """مثل مرورگر واقعی: کوکی نشست + هدر Bearer، و بررسی CSRF فعال."""
        c = APIClient(enforce_csrf_checks=True)
        c.force_login(self.u)                                    # کوکی نشست (django_login هنگام ورود)
        c.credentials(HTTP_AUTHORIZATION="Bearer " + str(RefreshToken.for_user(self.u).access_token))
        return c

    def test_post_with_jwt_and_session_cookie_is_not_blocked_by_csrf(self):
        r = self.browser().post("/api/delivery/driver/shift/", {"on": True}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.drv.refresh_from_db()
        self.assertTrue(self.drv.on_shift)

    def test_cookie_only_post_still_requires_csrf(self):
        c = APIClient(enforce_csrf_checks=True)
        c.force_login(self.u)                                    # فقط کوکی، بدون توکن
        r = c.post("/api/delivery/driver/shift/", {"on": True}, format="json")
        self.assertEqual(r.status_code, 403)
