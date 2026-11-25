"""Local-first sync: change log, pull (cursor paging, tombstones, tenant isolation, permissions), status, limits."""
from django.core.cache import cache

from bizsuite.models import Business, Category, Customer, Food, Order, User
from bizsuite.sync.models import SyncChange, SyncSettings
from tests.test_features import FeatureBase

P = "Pass12345!"


class SyncBase(FeatureBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.sell("pos", "inventory")
        SyncSettings.objects.update_or_create(business=self.biz, defaults={"enabled": True})
        SyncSettings.objects.update_or_create(business=self.other, defaults={"enabled": True})
        self.staff = User.objects.create_user(username="sy_staff", password=P, role="other", business=self.biz)

    def commit(self):
        """Run the on-commit hooks (a TestCase never commits)."""
        return self.captureOnCommitCallbacks(execute=True)

    def give(self, *keys, user=None):
        u = user or self.staff
        u.tabs = {k: True for k in ("home", "pos") + keys}
        u.dashboard_permissions = list(u.tabs)
        u.save()
        return self.api(u)

    def mk_product(self, name="item", price=1000, stock=10, biz=None):
        biz = biz or self.biz
        cat, _ = Category.all_objects.get_or_create(business=biz, name="cat")
        return Food.all_objects.create(business=biz, category=cat, name=name, price=price, stock=stock)

    def pull(self, c, cursor="", **q):
        r = c.get("/api/sync/pull/", {"cursor": cursor, **q})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()


class ChangeLogTests(SyncBase):
    def test_create_update_delete_make_ordered_changes_and_tombstones(self):
        with self.commit():
            f = self.mk_product()
        c = self.api(self.owner)
        snap = self.pull(c)
        self.assertTrue(snap["snapshot"])
        names = {(x["entity"], x["id"]) for x in snap["changes"]}
        self.assertIn(("product", f.pk), names)
        self.assertIn(("category", f.category_id), names)
        cur = snap["cursor"]
        with self.commit():
            f.price = 1500
            f.save()
        d = self.pull(c, cur)
        self.assertEqual([(x["entity"], x["id"], x["deleted"]) for x in d["changes"]], [("product", f.pk, False)])
        self.assertEqual(d["changes"][0]["data"]["price"], 1500)
        cur = d["cursor"]
        pk = f.pk
        with self.commit():
            f.delete()
        d = self.pull(c, cur)
        self.assertEqual([(x["entity"], x["id"], x["deleted"], x["data"]) for x in d["changes"]],
                         [("product", pk, True, None)])
        # nothing new -> same cursor, empty
        d2 = self.pull(c, d["cursor"])
        self.assertEqual((d2["changes"], d2["cursor"]), ([], d["cursor"]))

    def test_seq_is_strictly_increasing_and_one_row_per_object(self):
        with self.commit():
            a = self.mk_product("a")
            b = self.mk_product("b")
        with self.commit():
            a.price = 5
            a.save()
        rows = list(SyncChange.objects.filter(business=self.biz, entity="product").order_by("seq"))
        self.assertEqual([r.object_id for r in rows], [b.pk, a.pk])          # a moved after b
        self.assertEqual(len({r.seq for r in SyncChange.objects.filter(business=self.biz)}),
                         SyncChange.objects.filter(business=self.biz).count())

    def test_rolled_back_change_is_not_logged(self):
        # no on-commit hook runs for a TestCase transaction -> nothing logged until committed
        self.mk_product("ghost")
        self.assertEqual(SyncChange.objects.filter(business=self.biz).count(), 0)

    def test_cursor_paging_snapshot_and_delta(self):
        with self.commit():
            for i in range(7):
                self.mk_product(f"p{i}")
        c = self.api(self.owner)
        seen, cur, pages = [], "", 0
        while True:
            d = self.pull(c, cur, limit=3, entities="product")
            seen += [x["id"] for x in d["changes"]]
            cur, pages = d["cursor"], pages + 1
            if not d["has_more"]:
                break
        self.assertEqual(len(seen), 7)
        self.assertEqual(len(set(seen)), 7)
        self.assertGreaterEqual(pages, 3)
        self.assertTrue(cur.isdigit())                         # snapshot finished -> numeric delta cursor
        with self.commit():
            for i in range(5):
                self.mk_product(f"q{i}")
        got, cur2 = [], cur
        while True:
            d = self.pull(c, cur2, limit=2, entities="product")
            got += [x["id"] for x in d["changes"]]
            cur2 = d["cursor"]
            if not d["has_more"]:
                break
        self.assertEqual(len(got), 5)

    def test_tenant_isolation(self):
        with self.commit():
            mine = self.mk_product("mine")
            theirs = self.mk_product("theirs", biz=self.other)
        ids = {x["id"] for x in self.pull(self.api(self.owner))["changes"] if x["entity"] == "product"}
        self.assertEqual(ids, {mine.pk})
        self.assertNotIn(theirs.pk, ids)
        d = self.pull(self.api(self.owner), "0")
        self.assertTrue(all(x["id"] != theirs.pk for x in d["changes"]))

    def test_permission_filtering(self):
        with self.commit():
            self.mk_product()
            Customer.all_objects.create(business=self.biz, name="c1", phone="0912")
        # POS cashier: catalog + customers + orders
        d = self.pull(self.give())
        self.assertEqual(set(d["entities"]), {"category", "product", "customer", "order"})
        # a user with only the warehouse tabs: catalog yes (inventory), orders no
        self.staff.tabs = {"home": True, "inventory_warehouse": True}
        self.staff.dashboard_permissions = list(self.staff.tabs)
        self.staff.save()
        d = self.pull(self.api(self.staff), entities="product,order")
        self.assertIn("product", d["entities"])
        self.assertNotIn("order", d["entities"])
        self.assertEqual(d["denied"], ["order"])
        self.assertTrue(all(x["entity"] == "product" for x in d["changes"]))
        # no tabs at all: nothing
        self.staff.tabs = {"home": True}
        self.staff.dashboard_permissions = ["home"]
        self.staff.save()
        d = self.pull(self.api(self.staff))
        self.assertEqual((d["entities"], d["changes"]), ([], []))

    def test_customer_debt_is_not_synced(self):
        with self.commit():
            Customer.all_objects.create(business=self.biz, name="debtor", opening_balance=500)
        d = self.pull(self.api(self.owner), entities="customer")
        self.assertNotIn("total_debt", d["changes"][0]["data"])
        self.assertNotIn("opening_balance", d["changes"][0]["data"])

    def test_orders_window_today_only_without_past_days_permission(self):
        import datetime
        from django.utils import timezone
        with self.commit():
            old = Order.all_objects.create(business=self.biz, customer_name="old", total_price=1)
            new = Order.all_objects.create(business=self.biz, customer_name="new", total_price=1)
        Order.all_objects.filter(pk=old.pk).update(created_at=timezone.now() - datetime.timedelta(days=3))
        ids = lambda c: {x["id"] for x in self.pull(c, entities="order")["changes"]}
        self.assertEqual(ids(self.give("pos_report")), {new.pk})
        self.assertEqual(ids(self.give("pos_report", "pos_past_days")), {old.pk, new.pk})

    def test_pruned_tombstones_force_a_reset(self):
        from bizsuite.sync import changelog
        with self.commit():
            f = self.mk_product()
        c = self.api(self.owner)
        cur = self.pull(c)["cursor"]
        with self.commit():
            f.delete()
        top = changelog.current_seq(self.biz.pk)
        changelog.prune_tombstones_below(self.biz.pk, top)
        d = self.pull(c, cur)
        self.assertTrue(d["reset"])


class GateTests(SyncBase):
    def test_status_payload(self):
        r = self.api(self.owner).get("/api/sync/status/").json()
        self.assertTrue(r["enabled"])
        self.assertIn("subscription", r)
        self.assertIn("limits", r)
        self.assertIn("order", r["entities"])

    def test_local_mode_is_always_on_and_has_no_switch(self):
        c = self.api(self.owner)
        r = c.get("/api/sync/settings/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["enabled"])
        self.assertEqual(c.post("/api/sync/settings/", {"enabled": False}, format="json").status_code, 405)
        self.assertTrue(c.get("/api/sync/status/").json()["enabled"])
        self.assertEqual(c.get("/api/sync/pull/").status_code, 200)

    def test_requires_login(self):
        from rest_framework.test import APIClient
        self.assertIn(APIClient().get("/api/sync/pull/").status_code, (401, 403))

    def test_pull_rate_limit(self):
        from bizsuite.sync import config
        c = self.api(self.owner)
        old = config.PULL_PER_MIN
        config.PULL_PER_MIN = 3
        try:
            codes = [c.get("/api/sync/pull/").status_code for _ in range(5)]
        finally:
            config.PULL_PER_MIN = old
        self.assertEqual(codes[:3], [200, 200, 200])
        self.assertEqual(codes[3], 429)

    def test_bad_cursor(self):
        self.assertEqual(self.api(self.owner).get("/api/sync/pull/", {"cursor": "abc"}).status_code, 400)
