"""رندر واقعی همه‌ی صفحه‌های HTML — جلوی خطای ۵۰۰ در قالب‌ها (مثل SyntaxError ی context processor) را می‌گیرد."""

from django.test import Client, TestCase

from bizsuite.models import Business, User
from bizsuite.tenancy import clear_current_business

HTML_ROUTES = [
    "/",
    "/users/",
    "/dashboard/",
    "/dashboard/auth/",
    "/dashboard/app/",
    "/dashboard/logout/",
    "/dashboard/super/auth/",
    "/dashboard/super/",
    "/dashboard/orders/",
]


class PageRenderTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r = Business.objects.create(name="صفحه", slug="page-one")
        cls.owner = User.objects.create_user(
            username="pg_owner", password="Pass12345!", role="owner", business=cls.r)
        cls.root = User.objects.create_user(
            username="pg_root", password="Pass12345!", is_superuser=True, is_staff=True)

    def setUp(self):
        clear_current_business()

    def _assert_no_server_error(self, client, path):
        res = client.get(path, follow=False)
        self.assertLess(res.status_code, 500, f"{path} -> {res.status_code}")

    def test_anonymous_never_500(self):
        c = Client()
        for path in HTML_ROUTES:
            with self.subTest(path=path):
                self._assert_no_server_error(c, path)

    def test_owner_never_500(self):
        c = Client()
        c.force_login(self.owner)
        for path in HTML_ROUTES:
            with self.subTest(path=path):
                self._assert_no_server_error(c, path)

    def test_superuser_never_500(self):
        c = Client()
        c.force_login(self.root)
        for path in HTML_ROUTES:
            with self.subTest(path=path):
                self._assert_no_server_error(c, path)

    def test_django_admin_login_renders(self):
        self.assertLess(Client().get("/django-admin/login/").status_code, 500)
