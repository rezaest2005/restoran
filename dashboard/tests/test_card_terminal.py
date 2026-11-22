"""کارتخوان: تنظیمات، حالت سرور و پل محلی، بدون‌پرداخت‌دوباره، امنیت آدرس، جداسازی کسب‌وکارها، رسید."""

import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

import mock_card_reader as sim_mod
from bizsuite.card_terminal import net, protocol, services as svc
from bizsuite.card_terminal.adapters import get_adapter, HttpBridgeAdapter, Target
from bizsuite.models import (
    ActivityLog, Business, CardPaymentAttempt, CardTerminalSettings, Category, Food, JournalEntry, Order, TripStop, User,
)
from bizsuite.tenancy import clear_current_business

P = "Pass12345!"
PAN = sim_mod.FAKE_PAN


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.b = Business.objects.create(name="الف", slug="ct-one")
        cls.o = Business.objects.create(name="ب", slug="ct-two")
        cls.owner = User.objects.create_user(username="ct1", password=P, role="owner", business=cls.b)
        cls.cashier = User.objects.create_user(username="ct2", password=P, role="cashier", business=cls.b)
        cls.kitchen = User.objects.create_user(username="ct3", password=P, role="kitchen", business=cls.b)
        cls.manager = User.objects.create_user(username="ct4", password=P, role="manager", business=cls.b)
        cls.other_owner = User.objects.create_user(username="ct5", password=P, role="owner", business=cls.o)
        cat = Category.all_objects.create(business=cls.b, name="c")
        cls.food = Food.all_objects.create(business=cls.b, category=cat, name="کالا", price=1000, stock=50)
        cat2 = Category.all_objects.create(business=cls.o, name="c")
        cls.food2 = Food.all_objects.create(business=cls.o, category=cat2, name="کالا", price=500, stock=50)

    def setUp(self):
        clear_current_business()
        cache.clear()
        self.srv, self.sim, self.url = sim_mod.start_in_thread(mode="approve", delay=0.05)
        self.port = int(self.url.rsplit(":", 1)[1])
        self.addCleanup(self._stop)
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def _stop(self):
        self.srv.shutdown()
        self.srv.server_close()

    def cfg(self, business=None, **kw):
        base = dict(enabled=True, mode="server", host="127.0.0.1", port=self.port, timeout_seconds=15,
                    amount_unit="rial")
        base.update(kw)
        return CardTerminalSettings.all_objects.update_or_create(business=business or self.b, defaults=base)[0]

    def make_order(self, api=None, qty=2, **kw):
        body = {"items": [{"food_id": self.food.id, "quantity": qty}], "source": "pos", "defer_payment": True,
                "customer_name": "علی"}
        body.update(kw)
        return (api or self.api).post("/api/pos/create-order/", body, format="json").json()

    def pay(self, order_id, api=None, **kw):
        return (api or self.api).post("/api/card-reader/pay/", {"order_id": order_id, **kw}, format="json")

    def order_obj(self, oid):
        return Order.all_objects.get(pk=oid)


class UnitAndProtocolTests(TestCase):
    def test_toman_to_rial(self):
        self.assertEqual(protocol.to_device_amount(25000, "rial"), 250000)
        self.assertEqual(protocol.to_device_amount(25000, "toman"), 25000)
        with self.assertRaises(ValueError):
            protocol.to_device_amount(0, "rial")
        with self.assertRaises(ValueError):
            protocol.to_device_amount(5, "dollar")

    def test_card_is_masked_and_junk_dropped(self):
        self.assertEqual(protocol.mask_card(PAN), ("621986", "5678"))
        self.assertEqual(protocol.mask_card("621986******5678"), ("621986", "5678"))
        self.assertEqual(protocol.mask_card("****5678"), ("", "5678"))
        r = protocol.normalize_response({"success": True, "status": "approved", "trace_number": "12 34",
                                         "card_number": PAN, "cvv2": "123", "pin": "1", "track2": PAN,
                                         "message": "ok " + PAN})
        self.assertEqual((r.outcome, r.card_first6, r.card_last4, r.trace_number), ("approved", "621986", "5678", "1234"))
        self.assertNotIn(PAN, repr(r))
        self.assertFalse(hasattr(r, "cvv2"))

    def test_never_guesses_paid(self):
        self.assertEqual(protocol.normalize_response({"status": "weird"}).outcome, "unknown")
        self.assertEqual(protocol.normalize_response({}).outcome, "unknown")
        self.assertEqual(protocol.normalize_response("x").outcome, "unknown")
        self.assertEqual(protocol.normalize_response({"success": False}).outcome, "declined")


class AddressGuardTests(Base):
    def test_ip_rules(self):
        for ok in ("10.1.2.3", "172.16.0.5", "172.31.255.1", "192.168.1.100", "127.0.0.1", "169.254.10.10", "::1",
                   "fe80::1", "fd12::1"):
            self.assertTrue(net.is_allowed_ip(ok), ok)
        for bad in ("8.8.8.8", "172.32.0.1", "100.64.0.1", "169.254.169.254", "0.0.0.0", "224.0.0.1", "2001:db8::1",
                    "1.1.1.1"):
            self.assertFalse(net.is_allowed_ip(bad), bad)

    @override_settings(CARD_READER_ALLOW_LOOPBACK=False)
    def test_loopback_can_be_switched_off(self):
        self.assertFalse(net.is_allowed_ip("127.0.0.1"))
        self.assertTrue(net.is_allowed_ip("10.0.0.1"))

    def test_settings_refuse_public_ip(self):
        r = self.api.put("/api/card-reader/settings/", {"mode": "server", "host": "8.8.8.8", "port": 8080}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["fields"]["host"], "not_private")

    def test_dns_name_is_rechecked_at_use_time(self):
        """A name that saved fine but now resolves to a public address is refused (DNS rebinding / SSRF)."""
        self.cfg(host="printer.shop.local")
        o = self.make_order()
        fake = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", self.port))]
        with mock.patch("socket.getaddrinfo", return_value=fake):
            res = self.pay(o["order_id"]).json()
        self.assertEqual(res["attempt"]["status"], "unreachable")
        self.assertEqual(self.sim.requests, [])                       # nothing was sent anywhere
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending")

    def test_mixed_dns_answer_is_refused(self):
        fake = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", 80)),
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 80))]
        with mock.patch("socket.getaddrinfo", return_value=fake):
            with self.assertRaises(net.UnsafeAddress):
                net.resolve_safe("x.example", 80)

    def test_redirects_are_not_followed(self):
        hits = []

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                hits.append(self.path)
                self.send_response(302)
                self.send_header("Location", "http://127.0.0.1:1/evil")
                self.send_header("Content-Length", "0")
                self.send_header("Connection", "close")
                self.end_headers()

            do_GET = do_POST

        srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        res = HttpBridgeAdapter().pay(Target("127.0.0.1", srv.server_address[1], 5), amount=10, reference="r1",
                                      description="x")
        self.assertEqual(res.outcome, "rejected")
        self.assertEqual(hits, ["/api/payment"])                    # the Location was never requested

    def test_test_connection_endpoint(self):
        self.cfg()
        r = self.api.post("/api/card-reader/test/").json()["result"]
        self.assertTrue(r["ok"])
        self.cfg(port=1)
        r = self.api.post("/api/card-reader/test/").json()["result"]
        self.assertFalse(r["ok"])
        self.cfg(host="8.8.8.8")
        self.assertEqual(self.api.post("/api/card-reader/test/").json()["result"]["code"], "not_private")
        self.cfg(mode="local_bridge")
        self.assertEqual(self.api.post("/api/card-reader/test/").json()["result"]["code"], "browser_side")


class SettingsTests(Base):
    def test_defaults_come_from_env_when_none_saved(self):
        with override_settings(CARD_READER_IP="10.9.8.7", CARD_READER_PORT=9100, CARD_READER_TIMEOUT=5):
            s = self.api.get("/api/card-reader/settings/").json()["settings"]
        self.assertFalse(s["enabled"])
        self.assertFalse(s["configured"])
        self.assertEqual((s["port"], s["timeout_seconds"]), (9100, 15))     # env timeout clamped to the minimum
        self.assertEqual(s["mode"], "local_bridge")
        self.assertEqual(s["host"], "127.0.0.1")                            # local bridge is always this PC

    def test_save_roundtrip_and_validation(self):
        r = self.api.put("/api/card-reader/settings/", {
            "enabled": True, "mode": "server", "host": "192.168.1.50", "port": 9000, "timeout_seconds": 120,
            "amount_unit": "toman"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        s = self.api.get("/api/card-reader/settings/").json()["settings"]
        self.assertEqual((s["enabled"], s["host"], s["port"], s["timeout_seconds"], s["amount_unit"]),
                         (True, "192.168.1.50", 9000, 120, "toman"))
        self.assertEqual(s["example_device_amount"], 1000)
        for bad in ({"port": 0}, {"port": 70000}, {"timeout_seconds": 3}, {"timeout_seconds": 9999},
                    {"mode": "x"}, {"amount_unit": "euro"}, {"host": "a b;c"}, {"adapter": "nope"}):
            self.assertEqual(self.api.put("/api/card-reader/settings/", bad, format="json").status_code, 400, bad)

    def test_only_owner_or_manager_may_change(self):
        for who, code in ((self.cashier, 403), (self.manager, 200), (self.owner, 200)):
            api = APIClient()
            api.force_authenticate(who)
            r = api.put("/api/card-reader/settings/", {"enabled": True, "mode": "local_bridge"}, format="json")
            self.assertEqual(r.status_code, code, who.username)
        api = APIClient()
        api.force_authenticate(self.cashier)
        self.assertEqual(api.get("/api/card-reader/settings/").status_code, 200)    # cashier reads (needs the mode/port)
        self.assertEqual(api.post("/api/card-reader/test/").status_code, 403)
        self.assertFalse(api.get("/api/card-reader/settings/").json()["settings"]["can_edit"])

    def test_no_pos_access_means_no_access(self):
        api = APIClient()
        api.force_authenticate(self.kitchen)
        self.assertEqual(api.get("/api/card-reader/settings/").status_code, 403)
        self.assertEqual(api.post("/api/card-reader/pay/", {"order_id": 1}, format="json").status_code, 403)
        self.assertEqual(APIClient().get("/api/card-reader/settings/").status_code in (401, 403), True)

    def test_settings_are_per_business(self):
        self.cfg(port=1111)
        self.cfg(business=self.o, port=2222)
        api = APIClient()
        api.force_authenticate(self.other_owner)
        self.assertEqual(api.get("/api/card-reader/settings/").json()["settings"]["port"], 2222)
        self.assertEqual(self.api.get("/api/card-reader/settings/").json()["settings"]["port"], 1111)

    def test_change_is_logged(self):
        self.api.put("/api/card-reader/settings/", {"enabled": True, "mode": "local_bridge"}, format="json")
        self.assertTrue(ActivityLog.all_objects.filter(business=self.b, action="card.settings").exists())


class ServerModeTests(Base):
    def setUp(self):
        super().setUp()
        self.cfg()

    def test_defer_creates_unpaid_order_without_side_effects(self):
        o = self.make_order()
        self.assertTrue(o["awaiting_payment"])
        self.assertEqual(o["payment_status"], "pending")
        self.assertEqual(o["payment_method"], "card")
        self.assertFalse(JournalEntry.all_objects.filter(business=self.b, source_type="pos_order").exists())

    def test_defer_needs_enabled_terminal(self):
        CardTerminalSettings.all_objects.filter(business=self.b).update(enabled=False)
        r = self.api.post("/api/pos/create-order/", {"items": [{"food_id": self.food.id, "quantity": 1}],
                                                     "source": "pos", "defer_payment": True}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Order.all_objects.count(), 0)

    def test_approve_marks_paid_posts_accounting_and_returns_receipt(self):
        o = self.make_order()
        r = self.pay(o["order_id"])
        self.assertEqual(r.status_code, 200, r.content)
        a = r.json()["attempt"]
        self.assertEqual(a["status"], "approved")
        order = self.order_obj(o["order_id"])
        self.assertEqual((order.payment_status, order.payment_method), ("paid", "card"))
        # the device got the exact payable amount in Rial (2 x 1000 Toman -> 20,000 Rial)
        self.assertEqual(self.sim.requests[0]["amount"], 20000)
        self.assertEqual(a["amount"], 2000)
        t = a["order"]["terminal"]
        self.assertTrue(t["trace_number"] and t["ref_number"])
        self.assertEqual(t["card_masked"], "****5678")
        self.assertEqual(a["order"]["payment_status"], "paid")
        # accounting as for any card sale: Dr bank / Cr sales
        je = JournalEntry.all_objects.get(business=self.b, source_type="pos_order", source_id=order.pk)
        lines = {(l.account.code if hasattr(l.account, "code") else str(l.account)): (l.debit, l.credit)
                 for l in je.lines.all()}
        self.assertEqual(sum(d for d, _ in lines.values()), sum(c for _, c in lines.values()))

    def test_toman_unit_sends_toman(self):
        self.cfg(amount_unit="toman")
        o = self.make_order(qty=3)
        self.pay(o["order_id"])
        self.assertEqual(self.sim.requests[0]["amount"], 3000)

    def test_no_full_card_number_anywhere(self):
        o = self.make_order()
        r = self.pay(o["order_id"])
        self.assertNotIn(PAN, r.content.decode())
        a = CardPaymentAttempt.all_objects.get(order_id=o["order_id"])
        self.assertEqual((a.card_first6, a.card_last4), ("621986", "5678"))
        blob = json.dumps([list(CardPaymentAttempt.all_objects.values()),
                           list(ActivityLog.all_objects.values("summary", "details"))], default=str, ensure_ascii=False)
        self.assertNotIn(PAN, blob)
        self.assertNotIn("1012345678", blob)       # the hidden middle digits
        self.assertTrue(ActivityLog.all_objects.filter(action="card.approved").exists())

    def test_declined_leaves_order_unpaid_and_can_retry(self):
        self.sim.mode = "decline"
        o = self.make_order()
        a = self.pay(o["order_id"]).json()["attempt"]
        self.assertEqual(a["status"], "declined")
        self.assertFalse(a["open"])
        order = self.order_obj(o["order_id"])
        self.assertEqual(order.payment_status, "pending")
        self.assertFalse(JournalEntry.all_objects.filter(business=self.b, source_type="pos_order").exists())
        self.assertNotIn("terminal", a.get("order", {}))
        self.sim.mode = "approve"
        again = self.pay(o["order_id"]).json()["attempt"]            # a NEW attempt (cashier pressed retry)
        self.assertEqual(again["status"], "approved")
        self.assertNotEqual(again["id"], a["id"])

    def test_customer_cancelled_on_device(self):
        self.sim.mode = "cancelled"
        o = self.make_order()
        self.assertEqual(self.pay(o["order_id"]).json()["attempt"]["status"], "cancelled")
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending")

    def test_unreachable_never_sends_and_keeps_order_unpaid(self):
        self.cfg(port=1)
        o = self.make_order()
        a = self.pay(o["order_id"]).json()["attempt"]
        self.assertEqual(a["status"], "unreachable")
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending")
        self.assertFalse(CardPaymentAttempt.all_objects.get(pk=a["id"]).is_open)

    def test_timeout_is_unknown_then_status_query_finds_the_payment(self):
        self.sim.mode = "silent"
        # 1 s read timeout (below the API minimum on purpose; set directly)
        self.cfg(timeout_seconds=1)
        o = self.make_order()
        r = self.pay(o["order_id"]).json()
        a = r["attempt"]
        self.assertEqual(a["status"], "unknown")
        self.assertTrue(a["open"])
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending")
        self.assertEqual(len(self.sim.requests), 1)
        # still pending on the device
        chk = self.api.post(f"/api/card-reader/attempts/{a['id']}/check/").json()["attempt"]
        self.assertEqual(chk["status"], "unknown")
        # the customer paid late: the status query now says approved
        ref = CardPaymentAttempt.all_objects.get(pk=a["id"]).reference
        self.sim.final[ref] = "approved"
        self.sim.payments[ref]["status"] = "approved"
        chk = self.api.post(f"/api/card-reader/attempts/{a['id']}/check/").json()["attempt"]
        self.assertEqual(chk["status"], "approved")
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "paid")
        self.assertEqual(len(self.sim.requests), 1)                  # never charged a second time

    def test_unknown_blocks_a_new_charge_until_resolved(self):
        self.sim.mode = "silent"
        self.cfg(timeout_seconds=1)
        o = self.make_order()
        a = self.pay(o["order_id"]).json()["attempt"]
        r = self.pay(o["order_id"])
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["code"], "attempt_open")
        self.assertEqual(r.json()["attempt"]["id"], a["id"])
        self.assertEqual(len(self.sim.requests), 1)
        # settling / cancelling the order by another route is refused while the outcome is unknown
        self.assertEqual(self.api.post(f"/api/pos/orders/{o['order_id']}/settle/", {"payment_method": "cash"},
                                       format="json").status_code, 409)
        self.assertEqual(self.api.post(f"/api/pos/orders/{o['order_id']}/cancel-unpaid/").status_code, 409)
        # cashier: not paid -> closes; now a new attempt is allowed
        rr = self.api.post(f"/api/card-reader/attempts/{a['id']}/resolve/", {"outcome": "not_paid"}, format="json")
        self.assertEqual(rr.json()["attempt"]["status"], "cancelled")
        self.sim.mode = "approve"
        self.assertEqual(self.pay(o["order_id"]).json()["attempt"]["status"], "approved")

    def test_unknown_resolved_as_paid_needs_trace_number(self):
        self.sim.mode = "crash"
        o = self.make_order()
        a = self.pay(o["order_id"]).json()["attempt"]
        self.assertEqual(a["status"], "unknown")
        url = f"/api/card-reader/attempts/{a['id']}/resolve/"
        self.assertEqual(self.api.post(url, {"outcome": "paid"}, format="json").status_code, 400)
        r = self.api.post(url, {"outcome": "paid", "trace_number": "778899"}, format="json").json()["attempt"]
        self.assertEqual((r["status"], r["trace_number"], r["resolved_manually"]), ("approved", "778899", True))
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "paid")
        t = r["order"]["terminal"]
        self.assertTrue(t["manual"])
        # a settled attempt cannot be resolved again
        self.assertEqual(self.api.post(url, {"outcome": "not_paid"}, format="json").status_code, 409)

    def test_bridge_500_is_unknown_not_declined(self):
        self.sim.mode = "error500"
        o = self.make_order()
        self.assertEqual(self.pay(o["order_id"]).json()["attempt"]["status"], "unknown")

    def test_amount_or_reference_mismatch_is_never_paid(self):
        for mode in ("wrong_amount", "wrong_rrn"):
            self.sim.mode = mode
            o = self.make_order()
            a = self.pay(o["order_id"]).json()["attempt"]
            self.assertEqual(a["status"], "unknown", mode)
            self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending")

    def test_double_click_is_one_charge(self):
        self.sim.delay = 0.5
        o = self.make_order()
        attempt = svc.start_attempt(self.b, o["order_id"], self.owner)       # first click opened an attempt
        r = self.pay(o["order_id"])                                          # second click
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["code"], "attempt_open")
        self.assertEqual(CardPaymentAttempt.all_objects.filter(order_id=o["order_id"]).count(), 1)
        self.assertEqual(self.sim.requests, [])
        self.assertEqual(attempt.status, "created")

    def test_db_allows_only_one_open_attempt_per_order(self):
        from django.db import IntegrityError, transaction
        o = self.make_order()
        svc.start_attempt(self.b, o["order_id"], self.owner)
        with self.assertRaises(IntegrityError), transaction.atomic():
            CardPaymentAttempt.all_objects.create(business=self.b, order_id=o["order_id"], amount=1, device_amount=10,
                                                  nonce="x", status="sent")

    def test_paid_or_cancelled_order_cannot_be_charged(self):
        o = self.make_order()
        self.pay(o["order_id"])
        r = self.pay(o["order_id"])
        self.assertEqual((r.status_code, r.json()["code"]), (409, "order_not_payable"))
        self.assertEqual(len(self.sim.requests), 1)

    def test_amount_comes_from_the_order_not_the_client(self):
        o = self.make_order()
        r = self.api.post("/api/card-reader/pay/", {"order_id": o["order_id"], "amount": 1}, format="json").json()
        self.assertEqual(self.sim.requests[0]["amount"], 20000)
        self.assertEqual(r["attempt"]["amount"], 2000)

    def test_cancel_before_sending_and_cancel_flag(self):
        o = self.make_order()
        att = svc.start_attempt(self.b, o["order_id"], self.owner)
        r = self.api.post(f"/api/card-reader/attempts/{att.pk}/cancel/").json()["attempt"]
        self.assertEqual(r["status"], "cancelled")
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending")
        # a sent attempt only gets the cancel flag (the waiting call decides) and the bridge is told
        att2 = svc.start_attempt(self.b, o["order_id"], self.owner)
        CardPaymentAttempt.all_objects.filter(pk=att2.pk).update(status="sent")
        self.sim.payments[att2.reference] = {"rrn": att2.reference, "amount": 0, "status": "pending", "trace": "1", "ref": "2"}
        ev = self.sim.events[att2.reference] = threading.Event()
        r = self.api.post(f"/api/card-reader/attempts/{att2.pk}/cancel/").json()["attempt"]
        self.assertTrue(r["cancel_requested"])
        self.assertTrue(ev.is_set())

    def test_stale_attempts_expire(self):
        from datetime import timedelta
        from django.utils import timezone
        o = self.make_order()
        att = svc.start_attempt(self.b, o["order_id"], self.owner)
        CardPaymentAttempt.all_objects.filter(pk=att.pk).update(created_at=timezone.now() - timedelta(minutes=10))
        self.assertEqual(self.api.get(f"/api/card-reader/attempts/{att.pk}/").json()["attempt"]["status"], "cancelled")
        att = svc.start_attempt(self.b, o["order_id"], self.owner)
        CardPaymentAttempt.all_objects.filter(pk=att.pk).update(status="sent", sent_at=timezone.now() - timedelta(minutes=10))
        self.assertEqual(self.api.get(f"/api/card-reader/attempts/{att.pk}/").json()["attempt"]["status"], "unknown")

    def test_settle_other_way_then_receipt_and_accounting(self):
        self.sim.mode = "decline"
        o = self.make_order()
        self.pay(o["order_id"])
        r = self.api.post(f"/api/pos/orders/{o['order_id']}/settle/", {"payment_method": "cash"}, format="json").json()
        self.assertEqual((r["payment_status"], r["payment_method"]), ("paid", "cash"))
        self.assertNotIn("terminal", r)
        self.assertTrue(JournalEntry.all_objects.filter(business=self.b, source_type="pos_order").exists())
        # paid: not settle-able / chargeable again
        self.assertEqual(self.api.post(f"/api/pos/orders/{o['order_id']}/settle/", {"payment_method": "cash"},
                                       format="json").status_code, 409)
        self.assertEqual(self.pay(o["order_id"]).status_code, 409)

    def test_cancel_unpaid_order_returns_stock(self):
        self.food.refresh_from_db()
        before = Food.all_objects.get(pk=self.food.pk).stock
        o = self.make_order(qty=4)
        self.assertEqual(Food.all_objects.get(pk=self.food.pk).stock, before - 4)
        r = self.api.post(f"/api/pos/orders/{o['order_id']}/cancel-unpaid/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Food.all_objects.get(pk=self.food.pk).stock, before)
        self.assertEqual(self.order_obj(o["order_id"]).status, "cancelled")
        self.assertEqual(self.pay(o["order_id"]).status_code, 409)

    def test_paid_order_cannot_be_cancelled_through_cancel_unpaid(self):
        o = self.make_order()
        self.pay(o["order_id"])
        self.assertEqual(self.api.post(f"/api/pos/orders/{o['order_id']}/cancel-unpaid/").status_code, 409)

    def test_delivery_order_is_dispatched_only_after_payment_and_courier_collects_nothing(self):
        from bizsuite.models import Driver
        drv = Driver.all_objects.create(business=self.b, name="رضا")
        o = self.make_order(order_type="delivery", delivery_address="تهران", driver_id=drv.id)
        self.assertIsNone(o["dispatch"])
        self.assertFalse(TripStop.all_objects.filter(order_id=o["order_id"]).exists())
        self.sim.mode = "decline"
        self.pay(o["order_id"], driver_id=drv.id)
        self.assertFalse(TripStop.all_objects.filter(order_id=o["order_id"]).exists())    # unpaid: nobody leaves
        self.sim.mode = "approve"
        a = self.pay(o["order_id"], driver_id=drv.id).json()["attempt"]
        self.assertEqual(a["status"], "approved")
        stop = TripStop.all_objects.get(order_id=o["order_id"])
        self.assertEqual(stop.amount_due, 0)
        self.assertEqual(a["order"]["dispatch"]["queued"], False)

    def test_dine_in_order_pays_the_same_way(self):
        o = self.make_order(order_type="hall")
        self.assertEqual(self.pay(o["order_id"]).json()["attempt"]["status"], "approved")

    def test_activity_log_lines(self):
        o = self.make_order()
        self.pay(o["order_id"])
        actions = set(ActivityLog.all_objects.filter(business=self.b).values_list("action", flat=True))
        self.assertTrue({"card.start", "card.approved"} <= actions)


class TenantAndPermissionTests(Base):
    def setUp(self):
        super().setUp()
        self.cfg()
        self.cfg(business=self.o)

    def test_other_business_order_is_404(self):
        o = self.make_order()
        api = APIClient()
        api.force_authenticate(self.other_owner)
        r = api.post("/api/card-reader/pay/", {"order_id": o["order_id"]}, format="json")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(self.sim.requests, [])
        self.assertEqual(api.post(f"/api/pos/orders/{o['order_id']}/settle/", {"payment_method": "cash"},
                                  format="json").status_code, 404)
        self.assertEqual(api.post(f"/api/pos/orders/{o['order_id']}/cancel-unpaid/").status_code, 404)

    def test_other_business_attempt_is_404_everywhere(self):
        o = self.make_order()
        a = self.pay(o["order_id"]).json()["attempt"]
        api = APIClient()
        api.force_authenticate(self.other_owner)
        for method, path in (("get", ""), ("post", "check/"), ("post", "cancel/"), ("post", "report/"),
                             ("post", "resolve/")):
            r = getattr(api, method)(f"/api/card-reader/attempts/{a['id']}/{path}", {}, format="json")
            self.assertEqual(r.status_code, 404, path)

    def test_cashier_may_pay(self):
        api = APIClient()
        api.force_authenticate(self.cashier)
        o = self.make_order(api=api)
        self.assertEqual(self.pay(o["order_id"], api=api).json()["attempt"]["status"], "approved")

    def test_unauthenticated_and_foreign_roles_are_refused(self):
        o = self.make_order()
        anon = APIClient()
        self.assertIn(anon.post("/api/card-reader/pay/", {"order_id": o["order_id"]}, format="json").status_code, (401, 403))
        api = APIClient()
        api.force_authenticate(self.kitchen)
        self.assertEqual(api.post("/api/card-reader/pay/", {"order_id": o["order_id"]}, format="json").status_code, 403)
        self.assertEqual(self.sim.requests, [])


class LocalBridgeTests(Base):
    def setUp(self):
        super().setUp()
        self.cfg(mode="local_bridge")

    def start(self, qty=2):
        o = self.make_order(qty=qty)
        r = self.pay(o["order_id"])
        self.assertEqual(r.status_code, 200, r.content)
        a = r.json()["attempt"]
        return o, a

    def report(self, a, token=None, **body):
        body.setdefault("source", "pay")
        return self.api.post(f"/api/card-reader/attempts/{a['id']}/report/",
                             {"token": token or a["bridge"]["token"], **body}, format="json")

    def good(self, a, **kw):
        d = {"success": True, "status": "approved", "trace_number": "555001", "ref_number": "9001",
             "card_number": PAN, "amount": a["bridge"]["request"]["amount"], "rrn": a["bridge"]["request"]["rrn"]}
        d.update(kw)
        return d

    def test_start_gives_request_and_token_but_server_calls_nothing(self):
        o, a = self.start()
        self.assertEqual(a["status"], "created")
        self.assertEqual(a["bridge"]["request"]["amount"], 20000)           # Toman x 10
        self.assertEqual(a["bridge"]["base_url"], f"http://127.0.0.1:{self.port}")
        self.assertEqual(self.sim.requests, [])
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending")

    def test_approved_report_pays_once(self):
        o, a = self.start()
        self.assertEqual(self.report(a, source="sent").json()["attempt"]["status"], "sent")
        r = self.report(a, response=self.good(a)).json()["attempt"]
        self.assertEqual(r["status"], "approved")
        self.assertEqual(r["order"]["terminal"]["card_masked"], "****5678")
        self.assertNotIn(PAN, json.dumps(r))
        order = self.order_obj(o["order_id"])
        self.assertEqual((order.payment_status, order.payment_method), ("paid", "card"))
        self.assertEqual(JournalEntry.all_objects.filter(business=self.b, source_type="pos_order").count(), 1)

    def test_replayed_result_is_rejected(self):
        o, a = self.start()
        self.report(a, response=self.good(a))
        again = self.report(a, response=self.good(a))
        self.assertEqual((again.status_code, again.json()["code"]), (409, "attempt_closed"))
        self.assertEqual(JournalEntry.all_objects.filter(business=self.b, source_type="pos_order").count(), 1)

    def test_replay_on_a_new_attempt_with_old_token_is_rejected(self):
        o, a = self.start()
        self.report(a, response=self.good(a, status="declined", success=False))
        a2 = self.pay(o["order_id"]).json()["attempt"]
        r = self.report(a2, token=a["bridge"]["token"], response=self.good(a2))
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending")

    def test_wrong_amount_is_rejected_and_attempt_stays_open(self):
        o, a = self.start()
        r = self.report(a, response=self.good(a, amount=10))
        self.assertEqual((r.status_code, r.json()["code"]), (400, "result_mismatch"))
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending")
        self.assertTrue(CardPaymentAttempt.all_objects.get(pk=a["id"]).is_open)
        r = self.report(a, response=self.good(a, rrn="other"))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.report(a, response=self.good(a)).json()["attempt"]["status"], "approved")

    def test_bad_or_missing_token_is_rejected(self):
        o, a = self.start()
        self.assertEqual(self.report(a, token="0" * 64, response=self.good(a)).status_code, 403)
        self.assertEqual(self.api.post(f"/api/card-reader/attempts/{a['id']}/report/",
                                       {"response": self.good(a)}, format="json").status_code, 403)
        self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending")

    def test_a_bare_paid_claim_is_not_enough(self):
        o, a = self.start()
        for body in ({"response": {"status": "paid-trust-me"}}, {"response": {}}, {"response": "approved"},
                     {"response": None}):
            self.report(a, **body)
            self.assertEqual(self.order_obj(o["order_id"]).payment_status, "pending", body)

    def test_declined_unreachable_and_unknown_reports(self):
        o, a = self.start()
        r = self.report(a, response={"success": False, "status": "declined", "message": "no funds"}).json()["attempt"]
        self.assertEqual(r["status"], "declined")
        o2 = self.make_order()
        a2 = self.pay(o2["order_id"]).json()["attempt"]
        self.assertEqual(self.report(a2, error="unreachable").json()["attempt"]["status"], "unreachable")
        o3 = self.make_order()
        a3 = self.pay(o3["order_id"]).json()["attempt"]
        self.report(a3, source="sent")
        r = self.report(a3, error="timeout").json()["attempt"]
        self.assertEqual(r["status"], "unknown")                       # sent, then silence: never "unreachable"
        self.assertEqual(self.order_obj(o3["order_id"]).payment_status, "pending")
        # the browser's status query later reports approved
        r = self.report(a3, source="status", response=self.good(a3)).json()["attempt"]
        self.assertEqual(r["status"], "approved")

    def test_server_mode_attempt_ignores_reports(self):
        self.cfg(mode="server")
        o = self.make_order()
        a = self.pay(o["order_id"]).json()["attempt"]
        self.assertEqual(self.report(a, token="x", response={}).status_code, 400)

    def test_double_start_is_blocked(self):
        o, a = self.start()
        r = self.pay(o["order_id"])
        self.assertEqual((r.status_code, r.json()["code"]), (409, "attempt_open"))
        self.assertNotIn("bridge", r.json()["attempt"])                # an existing attempt's token is not handed out again

    def test_check_endpoint_is_for_server_mode_only(self):
        o, a = self.start()
        self.assertEqual(self.api.post(f"/api/card-reader/attempts/{a['id']}/check/").status_code, 400)

    def test_report_works_with_the_real_simulator_answer(self):
        """Exactly what the browser forwards: the simulator's JSON for the attempt's request."""
        import urllib.request
        o, a = self.start()
        req = a["bridge"]["request"]
        raw = urllib.request.urlopen(urllib.request.Request(
            f"{self.url}/api/payment", data=json.dumps(req).encode(), headers={"Content-Type": "application/json"})).read()
        self.assertEqual(self.sim.requests[0]["amount"], 20000)
        r = self.report(a, response=json.loads(raw)).json()["attempt"]
        self.assertEqual(r["status"], "approved")


class AdapterRegistryTests(TestCase):
    def test_registry(self):
        self.assertEqual(get_adapter("http_bridge").code, "http_bridge")
        with self.assertRaises(KeyError):
            get_adapter("saman")
