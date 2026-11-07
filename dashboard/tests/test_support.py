from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, SupportMessage, SupportTicket, User
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token

LIST = "/api/support/tickets/"
SLIST = "/api/super/support/tickets/"


def _client(user=None, super_user=None):
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    if super_user is not None:
        c.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(super_user))
    return c


class SupportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.b1 = Business.objects.create(name="Alpha", slug="alpha")
        cls.b2 = Business.objects.create(name="Beta", slug="beta")
        cls.o1 = User.objects.create_user(username="o1", password="Pass12345!", role="owner", business=cls.b1)
        cls.m1 = User.objects.create_user(username="m1", password="Pass12345!", role="manager", business=cls.b1)
        cls.c1 = User.objects.create_user(username="c1", password="Pass12345!", role="cashier", business=cls.b1)
        cls.o2 = User.objects.create_user(username="o2", password="Pass12345!", role="owner", business=cls.b2)
        cls.root = User.objects.create_user(
            username="root", password="Pass12345!", is_superuser=True, is_staff=True)

    def setUp(self):
        clear_current_business()
        self.biz1 = _client(self.o1)
        self.biz2 = _client(self.o2)
        self.sup = _client(super_user=self.root)

    def _create(self, client=None, **over):
        body = {"subject": "Printer issue", "message": "It does not print", "category": "bug"}
        body.update(over)
        return (client or self.biz1).post(LIST, body, format="json")

    # ── business side ──
    def test_create_list_and_thread(self):
        res = self._create()
        self.assertEqual(res.status_code, 201)
        data = res.json()["data"]
        self.assertEqual(data["status"], "open")
        self.assertEqual(len(data["messages"]), 1)
        self.assertEqual(data["messages"][0]["author_kind"], "business")
        lst = self.biz1.get(LIST).json()["data"]
        self.assertEqual([t["id"] for t in lst], [data["id"]])
        self.assertEqual(lst[0]["message_count"], 1)
        self.assertEqual(self.biz1.get(f"{LIST}{data['id']}/").status_code, 200)

    def test_isolation_between_businesses(self):
        tid = self._create().json()["data"]["id"]
        self.assertEqual(self.biz2.get(LIST).json()["data"], [])
        self.assertEqual(self.biz2.get(f"{LIST}{tid}/").status_code, 404)
        self.assertEqual(self.biz2.post(f"{LIST}{tid}/messages/", {"message": "x"}, format="json").status_code, 404)
        self.assertEqual(self.biz2.post(f"{LIST}{tid}/resolve/").status_code, 404)
        self.assertEqual(SupportTicket.all_objects.get(pk=tid).status, "open")

    def test_manager_allowed_cashier_and_anonymous_denied(self):
        self.assertEqual(_client(self.m1).get(LIST).status_code, 200)
        self.assertEqual(_client(self.c1).get(LIST).status_code, 403)
        self.assertIn(APIClient().get(LIST).status_code, (401, 403))
        self.assertEqual(_client(self.root).get(LIST).status_code, 403)

    def test_validation(self):
        self.assertEqual(self._create(subject="  ").status_code, 400)
        self.assertEqual(self._create(subject="x" * 201).status_code, 400)
        self.assertEqual(self._create(message="").status_code, 400)
        self.assertEqual(self._create(message="y" * 4001).status_code, 400)
        self.assertEqual(self._create(category="nope").status_code, 400)
        self.assertEqual(self._create(priority="urgent").status_code, 400)
        self.assertEqual(SupportTicket.all_objects.count(), 0)
        self.assertEqual(self.biz1.post(LIST, ["x"], format="json").status_code, 400)

    def test_control_characters_stripped(self):
        d = self._create(subject="Hel\x00lo\nworld", message="a\x07b\x1fc\r\nline2").json()["data"]
        self.assertEqual(d["subject"], "Hello world")
        self.assertEqual(d["messages"][0]["body"], "abc\nline2")

    def test_rate_limit_per_business(self):
        for _ in range(10):
            self.assertEqual(self._create().status_code, 201)
        self.assertEqual(self._create().status_code, 429)
        self.assertEqual(self._create(client=self.biz2).status_code, 201)

    def test_follow_up_reopens_and_resolve(self):
        tid = self._create().json()["data"]["id"]
        self.sup.post(f"/api/super/support/tickets/{tid}/reply/", {"message": "Try again"}, format="json")
        self.assertEqual(SupportTicket.all_objects.get(pk=tid).status, "answered")
        res = self.biz1.post(f"{LIST}{tid}/messages/", {"message": "Still broken"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["data"]["status"], "open")
        self.assertEqual(len(res.json()["data"]["messages"]), 3)
        self.assertEqual(self.biz1.post(f"{LIST}{tid}/messages/", {"message": ""}, format="json").status_code, 400)

        res = self.biz1.post(f"{LIST}{tid}/resolve/")
        self.assertEqual(res.json()["data"]["status"], "resolved")
        res = self.biz1.post(f"{LIST}{tid}/messages/", {"message": "Back again"}, format="json")
        self.assertEqual(res.json()["data"]["status"], "open")

    def test_business_never_sees_platform_author_identity(self):
        tid = self._create().json()["data"]["id"]
        self.sup.post(f"/api/super/support/tickets/{tid}/reply/", {"message": "Hi"}, format="json")
        msgs = self.biz1.get(f"{LIST}{tid}/").json()["data"]["messages"]
        self.assertEqual(msgs[1]["author_kind"], "platform")
        self.assertEqual(msgs[1]["author_name"], "")
        self.assertNotIn("root", str(msgs[1]))

    def test_list_ordering_by_latest_activity(self):
        t1 = self._create(subject="first").json()["data"]["id"]
        t2 = self._create(subject="second").json()["data"]["id"]
        self.assertEqual([t["id"] for t in self.biz1.get(LIST).json()["data"]], [t2, t1])
        self.biz1.post(f"{LIST}{t1}/messages/", {"message": "bump"}, format="json")
        self.assertEqual([t["id"] for t in self.biz1.get(LIST).json()["data"]], [t1, t2])

    # ── super admin ──
    def test_super_endpoints_require_super_admin(self):
        tid = self._create().json()["data"]["id"]
        for c in (self.biz1, APIClient()):
            self.assertIn(c.get(SLIST).status_code, (401, 403))
            self.assertIn(c.get(f"{SLIST}{tid}/").status_code, (401, 403))
            self.assertIn(c.post(f"{SLIST}{tid}/reply/", {"message": "x"}, format="json").status_code, (401, 403))
            self.assertIn(c.post(f"{SLIST}{tid}/status/", {"status": "resolved"}, format="json").status_code, (401, 403))
            self.assertIn(c.get("/api/super/support/summary/").status_code, (401, 403))

    def test_super_list_filters_and_pagination(self):
        a = self._create(subject="Login broken", category="bug").json()["data"]["id"]
        self._create(subject="Invoice question", category="billing")
        b = self._create(client=self.biz2, subject="Other thing", message="needle inside").json()["data"]["id"]
        res = self.sup.get(SLIST).json()["data"]
        self.assertEqual(res["count"], 3)
        self.assertEqual(res["results"][0]["id"], b)
        self.assertEqual(res["results"][0]["business"]["slug"], "beta")
        self.assertEqual(self.sup.get(SLIST, {"category": "billing"}).json()["data"]["count"], 1)
        self.assertEqual(self.sup.get(SLIST, {"business": self.b1.id}).json()["data"]["count"], 2)
        self.assertEqual(self.sup.get(SLIST, {"business": "beta"}).json()["data"]["count"], 1)
        self.assertEqual(self.sup.get(SLIST, {"q": "needle"}).json()["data"]["count"], 1)
        self.assertEqual(self.sup.get(SLIST, {"q": "login"}).json()["data"]["results"][0]["id"], a)
        self.assertEqual(self.sup.get(SLIST, {"status": "resolved"}).json()["data"]["count"], 0)
        p = self.sup.get(SLIST, {"page_size": 2, "page": 2}).json()["data"]
        self.assertEqual((p["count"], p["pages"], len(p["results"])), (3, 2, 1))

    def test_super_thread_reply_status_summary(self):
        tid = self._create().json()["data"]["id"]
        d = self.sup.get(f"{SLIST}{tid}/").json()["data"]
        self.assertEqual(d["business"]["name"], "Alpha")
        self.assertEqual(d["created_by_name"], "o1")

        res = self.sup.post(f"{SLIST}{tid}/reply/", {"message": "We fixed it"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["data"]["status"], "answered")
        self.assertEqual(SupportMessage.objects.filter(ticket_id=tid, author_kind="platform").count(), 1)
        self.assertEqual(self.sup.post(f"{SLIST}{tid}/reply/", {"message": " "}, format="json").status_code, 400)

        self.assertEqual(self.sup.post(f"{SLIST}{tid}/status/", {"status": "bogus"}, format="json").status_code, 400)
        res = self.sup.post(f"{SLIST}{tid}/status/", {"status": "in_progress"}, format="json")
        self.assertEqual(res.json()["data"]["status"], "in_progress")
        self.assertEqual(self.sup.get(f"{SLIST}99999/").status_code, 404)

        self._create(subject="second")
        s = self.sup.get("/api/super/support/summary/").json()["data"]
        self.assertEqual(s["counts"]["open"], 1)
        self.assertEqual(s["counts"]["in_progress"], 1)
        self.assertEqual(s["counts"]["answered"], 0)
        self.assertEqual(s["counts"]["resolved"], 0)
        self.assertEqual(s["waiting"], 2)
        self.assertEqual(s["total"], 2)
