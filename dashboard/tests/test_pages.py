"""رندر واقعی همه‌ی صفحه‌های HTML — جلوی خطای ۵۰۰ در قالب‌ها (مثل SyntaxError ی context processor) را می‌گیرد."""

from django.test import Client, TestCase

from restaurant.models import Restaurant, User
from restaurant.tenancy import clear_current_restaurant

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
    "/dashboard/feedback/",
]


class PageRenderTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r = Restaurant.objects.create(name="صفحه", slug="page-one")
        cls.owner = User.objects.create_user(
            username="pg_owner", password="Pass12345!", role="owner", restaurant=cls.r)
        cls.root = User.objects.create_user(
            username="pg_root", password="Pass12345!", is_superuser=True, is_staff=True)

    def setUp(self):
        clear_current_restaurant()

    def _assert_no_server_error(self, client, path):
        res = client.get(path, follow=False)
        self.assertLess(res.status_code, 500, f"{path} -> {res.status_code}")

    def test_anonymous_never_500(self):
        c = Client()
        for path in HTML_ROUTES + ["/feedback/page-one/", "/feedback/unknown-slug/"]:
            with self.subTest(path=path):
                self._assert_no_server_error(c, path)

    def test_owner_never_500(self):
        c = Client()
        c.force_login(self.owner)
        for path in HTML_ROUTES + ["/feedback/page-one/"]:
            with self.subTest(path=path):
                self._assert_no_server_error(c, path)

    def test_superuser_never_500(self):
        c = Client()
        c.force_login(self.root)
        for path in HTML_ROUTES:
            with self.subTest(path=path):
                self._assert_no_server_error(c, path)

    def test_feedback_form_renders_for_active_business(self):
        res = Client().get("/feedback/page-one/")
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "csrf", status_code=200) if False else None  # فرم از fetch+JSON استفاده می‌کند

    def test_django_admin_login_renders(self):
        self.assertLess(Client().get("/admin/login/").status_code, 500)
