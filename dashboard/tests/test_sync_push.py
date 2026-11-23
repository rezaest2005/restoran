"""Local-first sync: push (idempotency, partial failure, conflicts, permissions, parity with the online path, limits)."""
import uuid
from decimal import Decimal

from django.core.cache import cache

from bizsuite.accounting_services import trial_balance
from bizsuite.models import Food, Order, OrderItem
from bizsuite.sync.models import SyncReceipt
from tests.test_sync_changelog import SyncBase


class PushBase(SyncBase):
    def setUp(self):
        super().setUp()
        self.food = self.mk_product("pushed", price=1000, stock=10)

    def mut(self, food=None, qty=1, price=None, base=None, method="cash", **extra):
        food = food or self.food
        i = uuid.uuid4().hex
        line = {"food_id": food.pk, "quantity": qty, "price": price if price is not None else int(food.final_price)}
        if base is not None:
            line["base_price"] = base
        return {"id": i, "key": "k-" + i, "type": "order.create", "entity_id": i,
                "payload": {"items": [line], "payment_method": method, "source": "pos", "customer_name": "x", **extra}}

    def push(self, c, *muts):
        r = c.post("/api/sync/push/", {"mutations": list(muts)}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()["results"]


class PushTests(PushBase):
    def test_order_is_created_through_the_real_logic(self):
        c = self.give("pos_pay_cash")
        m = self.mut(qty=3, base=1000)
        res = self.push(c, m)[0]
        self.assertEqual(res["status"], "ok", res)
        o = Order.all_objects.get(pk=res["server_id"])
        self.assertEqual((o.total_price, o.payment_status, o.source), (3000, "paid", "pos"))
        self.food.refresh_from_db()
        self.assertEqual(self.food.stock, 7)

    def test_same_key_twice_is_one_order(self):
        c = self.give("pos_pay_cash")
        m = self.mut(qty=2)
        a = self.push(c, m)[0]
        b = self.push(c, m)[0]
        self.assertEqual((a["status"], b["status"]), ("ok", "duplicate"))
        self.assertEqual(a["server_id"], b["server_id"])
        self.assertEqual(Order.all_objects.filter(business=self.biz).count(), 1)
        self.food.refresh_from_db()
        self.assertEqual(self.food.stock, 8)

    def test_same_client_uuid_with_a_different_key_is_still_one_order(self):
        c = self.give("pos_pay_cash")
        m = self.mut()
        self.push(c, m)
        m2 = {**m, "key": "another-key"}
        self.assertEqual(self.push(c, m2)[0]["status"], "duplicate")
        self.assertEqual(Order.all_objects.filter(business=self.biz).count(), 1)

    def test_same_key_twice_in_one_batch(self):
        c = self.give("pos_pay_cash")
        m = self.mut()
        res = self.push(c, m, m)
        self.assertEqual([r["status"] for r in res], ["ok", "duplicate"])
        self.assertEqual(Order.all_objects.filter(business=self.biz).count(), 1)

    def test_partial_failure_keeps_the_good_ones(self):
        c = self.give("pos_pay_cash")
        good, ghost = self.mut(), self.mut()
        ghost["payload"]["items"][0]["food_id"] = 999999
        bad_type = {"id": "z1", "type": "nope", "payload": {}}
        res = self.push(c, good, ghost, bad_type, self.mut(qty=2))
        self.assertEqual([r["status"] for r in res], ["ok", "conflict", "rejected", "ok"])
        self.assertEqual(res[1]["code"], "product_missing")
        self.assertEqual(res[2]["code"], "unknown_type")
        self.assertEqual(Order.all_objects.filter(business=self.biz).count(), 2)

    def test_conflicts_are_remembered_and_do_not_create_orders(self):
        c = self.give("pos_pay_cash")
        stock = self.push(c, self.mut(qty=99))[0]
        self.assertEqual((stock["status"], stock["code"]), ("conflict", "stock"))
        self.assertEqual(stock["details"]["lines"][0]["available"], 10)
        price = self.push(c, self.mut(base=900, price=900))[0]
        self.assertEqual((price["status"], price["code"]), ("conflict", "price_changed"))
        self.assertEqual(price["details"]["lines"][0]["now"], 1000)
        self.assertEqual(Order.all_objects.filter(business=self.biz).count(), 0)
        self.food.refresh_from_db()
        self.assertEqual(self.food.stock, 10)
        # resending the same conflicted key returns the stored verdict, no re-evaluation
        m = self.mut(qty=99)
        self.push(c, m)
        Food.all_objects.filter(pk=self.food.pk).update(stock=500)
        self.assertEqual(self.push(c, m)[0]["status"], "duplicate")

    def test_client_total_is_never_trusted(self):
        c = self.give("pos_pay_cash")
        m = self.mut(qty=2)
        m["payload"]["total_price"] = 1
        res = self.push(c, m)[0]
        self.assertEqual(Order.all_objects.get(pk=res["server_id"]).total_price, 2000)

    def test_discount_needs_the_discount_permission(self):
        c = self.give("pos_pay_cash")
        r = self.push(c, self.mut(price=800, base=1000))[0]
        self.assertEqual((r["status"], r["code"]), ("rejected", "permission_denied"))
        self.assertEqual(r["details"]["permission"], "pos_discount")
        self.assertEqual(Order.all_objects.filter(business=self.biz).count(), 0)
        c = self.give("pos_pay_cash", "pos_discount")
        r = self.push(c, self.mut(price=800, base=1000))[0]
        self.assertEqual(r["status"], "ok")
        self.assertEqual(Order.all_objects.get(pk=r["server_id"]).total_price, 800)

    def test_payment_permissions_are_enforced(self):
        self.assertEqual(self.push(self.give(), self.mut())[0]["code"], "permission_denied")
        self.assertEqual(self.push(self.give("pos_pay_cash"), self.mut(method="card"))[0]["status"], "rejected")

    def test_card_terminal_flow_is_online_only(self):
        c = self.give("pos_pay_card")
        r = self.push(c, self.mut(method="card", defer_payment=True))[0]
        self.assertEqual((r["status"], r["code"]), ("rejected", "online_required"))

    def test_user_without_pos_cannot_push(self):
        self.staff.tabs = {"home": True, "inventory_warehouse": True}
        self.staff.dashboard_permissions = list(self.staff.tabs)
        self.staff.save()
        r = self.push(self.api(self.staff), self.mut())[0]
        self.assertEqual(r["status"], "rejected")

    def test_tenant_cannot_sell_another_tenants_product(self):
        other = self.mk_product("alien", biz=self.other)
        r = self.push(self.give("pos_pay_cash"), self.mut(food=other))[0]
        self.assertEqual((r["status"], r["code"]), ("conflict", "product_missing"))

    def test_subscription_ended_blocks_the_push(self):
        from datetime import timedelta
        from django.utils import timezone
        from bizsuite.middleware import TenantJWTAuthentication
        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework.test import APIClient
        self.biz.subscription_ends_at = timezone.now() - timedelta(days=1)
        self.biz.save(update_fields=["subscription_ends_at"])
        self.staff.tabs = {"home": True, "pos": True, "pos_pay_cash": True}
        self.staff.save()
        tok = str(RefreshToken.for_user(self.staff).access_token)
        c = APIClient()
        r = c.post("/api/sync/push/", {"mutations": [self.mut()]}, format="json", HTTP_AUTHORIZATION="Bearer " + tok)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(Order.all_objects.filter(business=self.biz).count(), 0)


class ParityTests(PushBase):
    """Stock and accounting effects equal the online path."""

    def snapshot(self):
        tb = trial_balance(self.biz)["rows"]
        return {r["code"]: (r.get("debit"), r.get("credit")) for r in tb}

    def test_stock_and_accounting_match_the_online_path(self):
        c = self.give("pos_pay_cash")
        online = c.post("/api/pos/create-order/", {"items": [{"food_id": self.food.pk, "quantity": 2, "price": 1000}],
                                                   "source": "pos", "payment_method": "cash"}, format="json")
        self.assertEqual(online.status_code, 200)
        after_online = self.snapshot()
        stock_online = Food.all_objects.get(pk=self.food.pk).stock
        res = self.push(c, self.mut(qty=2))[0]
        self.assertEqual(res["status"], "ok")
        stock_both = Food.all_objects.get(pk=self.food.pk).stock
        self.assertEqual(10 - stock_online, 2)
        self.assertEqual(stock_online - stock_both, 2)
        after_both = self.snapshot()
        for code, (d, cr) in after_online.items():
            d2, c2 = after_both[code]
            self.assertEqual((Decimal(d2 or 0)), Decimal(d or 0) * 2, code)
            self.assertEqual((Decimal(c2 or 0)), Decimal(cr or 0) * 2, code)
        a, b = Order.all_objects.order_by("pk")
        self.assertEqual((a.total_price, a.payment_status, a.payment_method),
                         (b.total_price, b.payment_status, b.payment_method))
        self.assertEqual(OrderItem.all_objects.filter(order=a).count(), OrderItem.all_objects.filter(order=b).count())

    def test_pushed_order_shows_up_in_pull_with_its_client_uuid(self):
        c = self.give("pos_pay_cash")
        m = self.mut()
        with self.commit():
            res = self.push(c, m)[0]
        d = self.pull(c, entities="order")
        mine = [x for x in d["changes"] if x["id"] == res["server_id"]][0]
        self.assertEqual(mine["data"]["client_uuid"], m["entity_id"])
        self.assertEqual(mine["data"]["total_price"], 1000)
        # and the product's stock change was announced
        d = self.pull(c, entities="product")
        self.assertEqual([x["data"]["stock"] for x in d["changes"] if x["id"] == self.food.pk], [9])

    def test_receipt_row_exists_once(self):
        c = self.give("pos_pay_cash")
        m = self.mut()
        self.push(c, m)
        self.push(c, m)
        self.assertEqual(SyncReceipt.objects.filter(business=self.biz, key=m["key"]).count(), 1)


class LimitTests(PushBase):
    def test_too_many_items(self):
        from bizsuite.sync import config
        old = config.MAX_PUSH_ITEMS
        config.MAX_PUSH_ITEMS = 2
        try:
            r = self.give("pos_pay_cash").post("/api/sync/push/", {"mutations": [self.mut() for _ in range(3)]}, format="json")
        finally:
            config.MAX_PUSH_ITEMS = old
        self.assertEqual(r.status_code, 413)
        self.assertEqual(Order.all_objects.count(), 0)

    def test_body_too_large(self):
        from bizsuite.sync import config
        old = config.MAX_PUSH_BYTES
        config.MAX_PUSH_BYTES = 200
        try:
            r = self.give("pos_pay_cash").post("/api/sync/push/", {"mutations": [self.mut()]}, format="json")
        finally:
            config.MAX_PUSH_BYTES = old
        self.assertEqual(r.status_code, 413)

    def test_too_many_lines_in_one_order(self):
        c = self.give("pos_pay_cash")
        m = self.mut()
        m["payload"]["items"] = m["payload"]["items"] * 201
        self.assertEqual(self.push(c, m)[0]["code"], "too_many_lines")

    def test_push_rate_limit(self):
        from bizsuite.sync import config
        c = self.give("pos_pay_cash")
        old = config.PUSH_PER_MIN
        config.PUSH_PER_MIN = 2
        try:
            codes = [c.post("/api/sync/push/", {"mutations": [self.mut()]}, format="json").status_code for _ in range(3)]
        finally:
            config.PUSH_PER_MIN = old
        self.assertEqual(codes, [200, 200, 429])

    def test_empty_and_malformed(self):
        c = self.give("pos_pay_cash")
        self.assertEqual(c.post("/api/sync/push/", {"mutations": []}, format="json").status_code, 400)
        self.assertEqual(c.post("/api/sync/push/", {}, format="json").status_code, 400)
        res = self.push(c, "garbage")
        self.assertEqual(res[0]["status"], "rejected")
