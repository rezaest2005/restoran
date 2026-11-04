from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Feedback, Business, User
from bizsuite.tenancy import clear_current_business

SUBMIT = "/api/feedback/submit/"


class FeedbackTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r1 = Business.objects.create(name="کسب‌وکار یک", slug="r-one")
        cls.r2 = Business.objects.create(name="کسب‌وکار دو", slug="r-two")
        cls.off = Business.objects.create(name="غیرفعال", slug="r-off", is_active=False)
        cls.u1 = User.objects.create_user(
            username="own1", password="Pass12345!", role="owner",
            business=cls.r1, dashboard_permissions=["feedback"],
        )
        Feedback.all_objects.create(business=cls.r1, message="مال یک")
        Feedback.all_objects.create(business=cls.r2, message="مال دو")

    def setUp(self):
        cache.clear()
        clear_current_business()
        self.anon = APIClient()

    def _post(self, **over):
        body = {"business_slug": "r-one", "category": "bug",
                "name": "علی", "phone": "0912", "message": "مشکل دارم"}
        body.update(over)
        return self.anon.post(SUBMIT, body, format="json")

    def test_public_submit_ok(self):
        res = self._post()
        self.assertEqual(res.status_code, 200)
        fb = Feedback.all_objects.get(message="مشکل دارم")
        self.assertEqual(fb.business, self.r1)
        self.assertEqual(fb.status, "open")

    def test_honeypot_silent_success(self):
        before = Feedback.all_objects.count()
        res = self._post(website="http://spam")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Feedback.all_objects.count(), before)

    def test_unknown_and_inactive_slug_rejected(self):
        self.assertEqual(self._post(business_slug="nope").status_code, 404)
        self.assertEqual(self._post(business_slug="r-off").status_code, 404)

    def test_message_too_long_or_empty(self):
        self.assertEqual(self._post(message="x" * 2001).status_code, 400)
        self.assertEqual(self._post(message="  ").status_code, 400)

    def test_rate_limit(self):
        for _ in range(5):
            self.assertEqual(self._post().status_code, 200)
        self.assertEqual(self._post().status_code, 429)

    def test_staff_list_only_own(self):
        c = APIClient()
        c.force_authenticate(self.u1)
        res = c.get("/api/feedback/list/")
        self.assertEqual(res.status_code, 200)
        msgs = [i["message"] for i in res.json()["data"]]
        self.assertEqual(msgs, ["مال یک"])

    def test_list_requires_login(self):
        self.assertIn(self.anon.get("/api/feedback/list/").status_code, (401, 403))

    def test_update_sets_and_clears_resolved_at(self):
        c = APIClient()
        c.force_authenticate(self.u1)
        fb = Feedback.all_objects.get(business=self.r1)
        res = c.post(f"/api/feedback/{fb.id}/update/",
                     {"status": "resolved", "admin_note": "انجام شد"}, format="json")
        self.assertEqual(res.status_code, 200)
        fb.refresh_from_db()
        self.assertIsNotNone(fb.resolved_at)
        self.assertEqual(fb.admin_note, "انجام شد")
        c.post(f"/api/feedback/{fb.id}/update/", {"status": "open"}, format="json")
        fb.refresh_from_db()
        self.assertIsNone(fb.resolved_at)

    def test_update_other_business_404(self):
        c = APIClient()
        c.force_authenticate(self.u1)
        other = Feedback.all_objects.get(business=self.r2)
        res = c.post(f"/api/feedback/{other.id}/update/", {"status": "resolved"}, format="json")
        self.assertEqual(res.status_code, 404)
