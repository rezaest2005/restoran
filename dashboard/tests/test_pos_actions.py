"""Cashier ACTION permissions: super admin licence -> owner ticks -> employee, enforced by the API and visible in the
session payload (business_tabs); plus the free-text job title flow of Definitions -> Users & access."""

import importlib

from django.apps import apps as django_apps

from bizsuite.features import POS_ACTION_KEYS, user_features, user_ticked
from bizsuite.models import Category, Food, Order, User
from tests.test_features import FeatureBase

P = "Pass12345!"
REPORT_PATHS = ("/api/pos/daily-report/", "/api/pos/daily-orders/", "/api/pos/day-summary/")


class PosActionBase(FeatureBase):
    def setUp(self):
        super().setUp()
        self.sell("pos", "inventory")
        cat = Category.all_objects.create(business=self.biz, name="c")
        self.food = Food.all_objects.create(business=self.biz, category=cat, name="item", price=1000, stock=50)
        self.staff = User.objects.create_user(username="pa_staff", password=P, role="other", business=self.biz)

    def give(self, *keys, user=None):
        u = user or self.staff
        u.tabs = {k: True for k in ("home", "pos", "pos_report", "orders") + keys}
        u.dashboard_permissions = list(u.tabs)
        u.save()
        return self.api(u)

    def order(self, c, **extra):
        body = {"items": [{"food_id": self.food.id, "quantity": 1, "price": extra.pop("price", 1000)}],
                "source": "pos", "payment_method": extra.pop("method", "cash"), **extra}
        return c.post("/api/pos/create-order/", body, format="json")

    def make_order(self):
        return Order.all_objects.create(business=self.biz, customer_name="x", status="pending", source="qr",
                                        payment_method="cash", total_price=1000)

    def tabs_of(self, user):
        from bizsuite.views.auth.session import _get_business_tabs
        return set(_get_business_tabs(user))


class ActionEnforcementTests(PosActionBase):
    def test_cash_and_card_payment(self):
        self.assertEqual(self.order(self.give()).status_code, 403)
        self.assertEqual(self.order(self.give("pos_pay_cash")).status_code, 200)
        self.assertEqual(self.order(self.give("pos_pay_cash"), method="card").status_code, 403)
        self.assertEqual(self.order(self.give("pos_pay_card"), method="card").status_code, 200)
        self.assertEqual(self.order(self.give("pos_pay_card"), method="online").status_code, 200)
        self.assertEqual(self.order(self.give("pos_pay_card")).status_code, 403)      # cash needs its own tick

    def test_discount_needs_permission_and_is_applied(self):
        r = self.order(self.give("pos_pay_cash"), price=800)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["permission"], "pos_discount")
        self.assertEqual(Order.all_objects.filter(business=self.biz).count(), 0)
        r = self.order(self.give("pos_pay_cash", "pos_discount"), price=800)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["total_price"], 800)
        # a normal-priced sale never needs the discount permission
        self.assertEqual(self.order(self.give("pos_pay_cash"), price=1000).status_code, 200)

    def test_cancel_order_and_reject_online(self):
        o = self.make_order()
        c = self.give()
        self.assertEqual(c.post(f"/api/orders/{o.id}/status/", {"status": "cancelled"}, format="json").status_code, 403)
        self.assertEqual(c.post(f"/api/pos/online-orders/{o.id}/reject/", {}, format="json").status_code, 403)
        # other transitions are not guarded by this permission
        self.assertEqual(c.post(f"/api/orders/{o.id}/status/", {"status": "confirmed"}, format="json").status_code, 200)
        c = self.give("pos_cancel_order")
        self.assertEqual(c.post(f"/api/orders/{o.id}/status/", {"status": "cancelled"}, format="json").status_code, 200)
        o2 = self.make_order()
        self.assertEqual(c.post(f"/api/pos/online-orders/{o2.id}/reject/", {}, format="json").status_code, 200)

    def test_price_edit_endpoint_and_catalog(self):
        c = self.give()
        self.assertEqual(c.post("/api/pos/update-food-price/", {"food_id": self.food.id, "price": 5}, format="json").status_code, 403)
        r = c.put(f"/api/catalog/products/{self.food.id}/", {"price": 1500}, format="json")
        self.assertEqual(r.status_code, 403, r.content)
        # non-price edits and an unchanged price still work for a cashier
        r = c.put(f"/api/catalog/products/{self.food.id}/", {"price": 1000, "name_en": "x"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        c = self.give("pos_price_edit")
        self.assertEqual(c.post("/api/pos/update-food-price/", {"food_id": self.food.id, "price": 5}, format="json").status_code, 200)
        r = c.put(f"/api/catalog/products/{self.food.id}/", {"price": 1500}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def test_report_tab_and_previous_days(self):
        u = self.staff
        u.tabs = {"home": True, "pos": True}
        u.save()
        for path in REPORT_PATHS:
            self.assertEqual(self.api(u).get(path).status_code, 403, path)           # needs the report tab
        c = self.give()
        for path in REPORT_PATHS:
            self.assertEqual(c.get(path).status_code, 200, path)                     # today
            self.assertEqual(c.get(path + "?date=2020-01-02").status_code, 403, path)
        c = self.give("pos_past_days")
        for path in REPORT_PATHS:
            self.assertEqual(c.get(path + "?date=2020-01-02").status_code, 200, path)

    def test_close_day(self):
        self.assertEqual(self.give().post("/api/pos/close-pending/", {}, format="json").status_code, 403)
        self.assertEqual(self.give("pos_close_day").post("/api/pos/close-pending/", {}, format="json").status_code, 200)


class LicenceChainTests(PosActionBase):
    def test_licence_off_hides_it_for_owner_and_for_a_ticked_employee(self):
        for key in POS_ACTION_KEYS:
            self.sell("pos", "inventory", disabled=[key])
            self.give(*POS_ACTION_KEYS)
            self.assertIn(key, user_ticked(self.staff))
            self.assertNotIn(key, user_features(self.staff), key)
            self.assertNotIn(key, user_features(self.owner), key)
            self.assertNotIn(key, self.tabs_of(self.staff))
            self.assertNotIn(key, self.tabs_of(self.owner))
            self.assertIn("pos", self.tabs_of(self.staff))
            self.assertEqual(len(user_features(self.staff) & set(POS_ACTION_KEYS)), len(POS_ACTION_KEYS) - 1)

    def test_licence_off_is_refused_by_the_api_even_when_ticked(self):
        self.sell("pos", disabled=["pos_pay_cash", "pos_cancel_order"])
        c = self.give(*POS_ACTION_KEYS)
        self.assertEqual(self.order(c).status_code, 403)
        o = self.make_order()
        self.assertEqual(c.post(f"/api/orders/{o.id}/status/", {"status": "cancelled"}, format="json").status_code, 403)
        self.assertEqual(self.order(self.api(self.owner)).status_code, 403)       # the owner too: it is not licensed

    def test_owner_gets_every_licensed_action_without_ticks(self):
        self.assertTrue(set(POS_ACTION_KEYS) <= user_features(self.owner))
        self.assertEqual(self.order(self.api(self.owner)).status_code, 200)

    def test_owner_cannot_grant_what_the_licence_lacks(self):
        self.sell("pos", "inventory", disabled=["pos_discount"])
        c = self.api(self.owner)
        r = c.post("/api/users/tabs/", {"user_id": self.staff.id,
                                        "tabs": {"pos": True, "pos_discount": True, "pos_pay_cash": True}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.tabs["pos_pay_cash"])
        self.assertFalse(self.staff.tabs["pos_discount"])
        listed = c.get("/api/users/tabs/").json()
        self.assertNotIn("pos_discount", listed["licensed"])
        self.assertIn("pos_pay_cash", listed["licensed"])

    def test_a_manager_cannot_grant_what_he_lacks(self):
        mgr = User.objects.create_user(username="pa_mgr", password=P, role="manager", business=self.biz)
        mgr.tabs = {"home": True, "pos": True, "dictionary_users": True, "pos_pay_cash": True}
        mgr.save()
        r = self.api(mgr).post("/api/users/tabs/", {"user_id": self.staff.id,
                                                    "tabs": {"pos_pay_cash": True, "pos_close_day": True}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.tabs["pos_pay_cash"])
        self.assertFalse(self.staff.tabs["pos_close_day"])

    def test_actions_are_in_the_pos_section_and_the_super_admin_access_list(self):
        from bizsuite.features import access_of
        from bizsuite.pricing import SECTIONS
        self.assertTrue(set(POS_ACTION_KEYS) <= set(SECTIONS["pos"]))
        self.assertTrue(set(POS_ACTION_KEYS) <= set(access_of(self.biz)))
        self.sell("pos", disabled=["pos_pay_card"])
        self.assertNotIn("pos_pay_card", access_of(self.biz))


class ExistingStaffKeepWorkingTests(PosActionBase):
    def test_cashier_role_default_has_every_action(self):
        cashier = User.objects.create_user(username="pa_cash", password=P, role="cashier", business=self.biz)
        self.assertTrue(set(POS_ACTION_KEYS) <= user_features(cashier))
        self.assertEqual(self.order(self.api(cashier)).status_code, 200)

    def test_migration_grants_actions_to_employees_with_the_pos_tab_only(self):
        mig = importlib.import_module("bizsuite.migrations.0024_user_role_title_pos_actions")
        a = User.objects.create_user(username="m_a", password=P, role="cashier", business=self.biz)
        a.tabs = {"home": True, "pos": True, "orders": True}
        a.save()
        b = User.objects.create_user(username="m_b", password=P, role="other", business=self.biz)
        b.tabs = {"home": True, "inventory_reports": True}
        b.save()
        c = User.objects.create_user(username="m_c", password=P, role="cashier", business=self.biz)
        c.dashboard_permissions = ["home", "pos"]
        c.save()
        mig.grant_pos_actions(django_apps, None)
        for u in (a, b, c):
            u.refresh_from_db()
        self.assertTrue(all(a.tabs.get(k) for k in POS_ACTION_KEYS))
        self.assertTrue(set(POS_ACTION_KEYS) <= user_features(a))
        self.assertFalse(any(b.tabs.get(k) for k in POS_ACTION_KEYS))
        self.assertFalse(set(POS_ACTION_KEYS) & user_features(b))
        self.assertTrue(set(POS_ACTION_KEYS) <= user_features(c))
        self.assertEqual(self.order(self.api(a)).status_code, 200)

    def test_new_employee_starts_with_none(self):
        r = self.api(self.owner).post("/api/users/create/", {"username": "pa_new", "password": "abcd1234",
                                                             "role_title": "Shift lead"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        u = User.objects.get(pk=r.json()["user_id"])
        self.assertFalse(set(POS_ACTION_KEYS) & user_features(u))


class FreeTextStaffTests(PosActionBase):
    def create(self, **body):
        return self.api(self.owner).post("/api/users/create/", {"username": "ft_one", "password": "abcd1234", **body},
                                         format="json")

    def test_typed_title_becomes_a_custom_person_with_no_preset_access(self):
        r = self.create(role_title="  Evening   supervisor ")
        self.assertEqual(r.status_code, 200, r.content)
        u = User.objects.get(pk=r.json()["user_id"])
        self.assertEqual((u.role, u.role_title, u.is_staff), ("other", "Evening supervisor", False))
        self.assertEqual(user_features(u), {"home"})
        row = {x["id"]: x for x in self.api(self.owner).get("/api/users/management/").json()["users"]}[u.id]
        self.assertEqual(row["role_title"], "Evening supervisor")
        self.assertEqual(row["role_display"], "Evening supervisor")
        self.assertFalse(any(v for k, v in row["tabs"].items() if k != "home"))

    def test_explicit_ticks_are_stored_with_the_title(self):
        uid = self.create(role_title="Front desk").json()["user_id"]
        r = self.api(self.owner).post("/api/users/tabs/", {"user_id": uid, "tabs": {"pos": True, "pos_pay_cash": True}},
                                      format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(user_features(User.objects.get(pk=uid)), {"home", "pos", "pos_pay_cash"})

    def test_a_person_with_nothing_ticked_can_sign_in_and_sees_only_home(self):
        from rest_framework.test import APIClient
        uid = self.create(role_title="Observer").json()["user_id"]
        self.api(self.owner).post("/api/users/tabs/", {"user_id": uid, "tabs": {}}, format="json")
        r = APIClient().post("/api/auth/login/", {"username": "ft_one", "password": "abcd1234"}, format="json",
                             HTTP_X_TENANT_SLUG=self.biz.slug)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.api(User.objects.get(pk=uid)).get("/api/auth/me/").json()["data"]["business_tabs"], ["home"])
        self.assertEqual(self.order(self.api(User.objects.get(pk=uid))).status_code, 403)

    def test_owner_role_cannot_be_created_and_legacy_roles_keep_their_label(self):
        self.assertEqual(self.create(role="owner", role_title="Boss").status_code, 400)   # single owner rule
        mgr = User.objects.create_user(username="ft_mgr", password=P, role="manager", business=self.biz)
        row = {x["id"]: x for x in self.api(self.owner).get("/api/users/management/").json()["users"]}[mgr.id]
        self.assertEqual((row["role"], row["role_title"]), ("manager", ""))
        self.assertTrue(row["role_display"])
        self.assertTrue(all(row["tabs"][k] for k in ("pos", "pos_pay_cash")))             # same tick list as before

    def test_renaming_a_legacy_role_keeps_its_role(self):
        mgr = User.objects.create_user(username="ft_mgr2", password=P, role="manager", business=self.biz)
        r = self.api(self.owner).post("/api/users/update-role/", {"user_id": mgr.id, "role_title": "Head of sales"},
                                      format="json")
        self.assertEqual(r.status_code, 200, r.content)
        mgr.refresh_from_db()
        self.assertEqual((mgr.role, mgr.role_title, mgr.is_staff), ("manager", "Head of sales", False))      # the label only; privileges untouched
        self.api(self.owner).post("/api/users/update-role/", {"user_id": mgr.id, "role": "cashier"}, format="json")
        mgr.refresh_from_db()
        self.assertEqual((mgr.role, mgr.role_title), ("cashier", ""))
