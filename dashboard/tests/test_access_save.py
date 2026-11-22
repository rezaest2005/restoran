"""Saving a user's access (tabs) must persist and read back — from Definitions → Users & access
and from the super-admin panel — for every tab key the UI can send."""

from bizsuite.features import (
    ALL_FEATURE_KEYS, GRANTABLE_KEYS, OWNER_ONLY_KEYS, licensed_features, user_features, user_ticked,
)
from bizsuite.modules import enabled_modules
from rest_framework.test import APIClient

from bizsuite.models import User
from bizsuite.views.super_admin.auth import _make_super_token
from tests.test_features import FeatureBase

# The groups the two screens render (ManagersSection GROUPS / superConfig PERM_GROUPS).
# Owner-only tabs (activity history) are deliberately not offered: nobody but the account owner can hold them.
UI_KEYS = [
    "home", "pos", "pos_report", "pos_settings", "orders",
    "inventory_invoice", "inventory_sales", "inventory_warehouse", "inventory_receiving",
    "inventory_purchase_list", "inventory_reports", "kitchen", "recipes", "dictionary_recipe",
    "dictionary_menu", "dictionary_items", "dictionary_suppliers", "dictionary_warehouses",
    "dictionary_customers", "dictionary_users",
    "delivery_dispatch", "delivery_shipments", "delivery_fleet", "delivery_cash", "delivery_history",
    "club", "accounting", "feedback",
]


class BusinessAccessSaveTests(FeatureBase):
    def sell_all(self):
        self.sell("pos", "inventory", "production", "delivery", "club", "accounting", "feedback")

    def test_every_ui_key_is_a_server_key(self):
        self.assertEqual(sorted(UI_KEYS), sorted(GRANTABLE_KEYS))
        self.assertEqual(OWNER_ONLY_KEYS, {"activity"})

    def test_owner_saves_every_tab_and_reads_it_back(self):
        self.sell_all()
        c = self.api(self.owner)
        r = c.post("/api/users/tabs/", {"user_id": self.cashier.id, "tabs": {k: True for k in UI_KEYS}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        listed = {u["id"]: u for u in c.get("/api/users/management/").json()["users"]}[self.cashier.id]
        self.assertTrue(all(listed["tabs"][k] for k in UI_KEYS), listed["tabs"])
        self.cashier.refresh_from_db()
        self.assertEqual(user_ticked(self.cashier), set(GRANTABLE_KEYS))
        # and unticking everything also sticks
        c.post("/api/users/tabs/", {"user_id": self.cashier.id, "tabs": {k: False for k in UI_KEYS}}, format="json")
        self.cashier.refresh_from_db()
        self.assertEqual(user_ticked(self.cashier), {"home"})  # home is always granted

    def test_each_key_alone(self):
        self.sell_all()
        c = self.api(self.owner)
        for k in UI_KEYS:
            r = c.post("/api/users/tabs/", {"user_id": self.cashier.id, "tabs": {k: True}}, format="json")
            self.assertEqual(r.status_code, 200, (k, r.content))
            self.cashier.refresh_from_db()
            self.assertIn(k, user_ticked(self.cashier), k)

    def test_role_change_then_tabs_like_the_dialog(self):
        self.sell_all()
        c = self.api(self.owner)
        r = c.post("/api/users/update-role/", {"user_id": self.cashier.id, "role": "warehouse"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        r = c.post("/api/users/tabs/", {"user_id": self.cashier.id, "tabs": {"inventory_reports": True}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.cashier.refresh_from_db()
        self.assertEqual(self.cashier.role, "warehouse")
        self.assertEqual(user_ticked(self.cashier), {"home", "inventory_reports"})  # home is always granted


class SuperAdminAccessSaveTests(FeatureBase):
    """The Access tab of the customer form: ticked tabs = what the customer bought."""

    def super_client(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.root))
        return c

    def put(self, keys, **extra):
        return self.super_client().put(f"/api/super/users/{self.owner.id}/", {"access": keys, **extra}, format="json")

    def read(self):
        return self.super_client().get(f"/api/super/users/{self.owner.id}/").json()["access"]

    def test_every_key_saved_reads_back_and_drives_the_licence(self):
        r = self.put(UI_KEYS)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(sorted(r.json()["access"]), sorted(UI_KEYS))
        self.assertEqual(sorted(self.read()), sorted(UI_KEYS))
        self.biz.refresh_from_db()
        self.assertEqual(self.biz.disabled_features, [])
        self.assertEqual(licensed_features(self.biz), set(ALL_FEATURE_KEYS))

    def test_ticked_tabs_enable_their_module_and_unticked_are_off(self):
        r = self.put(["home", "pos", "orders"])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(sorted(self.read()), ["dictionary_users", "home", "orders", "pos"])
        self.biz.refresh_from_db()
        lic = licensed_features(self.biz)
        self.assertIn("pos", lic)
        self.assertNotIn("pos_report", lic)       # module is on but this tab was not bought
        self.assertNotIn("accounting", lic)       # module off
        self.assertNotIn("inventory_invoice", lic)
        self.assertEqual(live(self.biz), {"pos"})
        # the owner really sees it: only the bought tabs are in effect
        self.assertEqual(user_features(self.owner), {"home", "dictionary_users", "pos", "orders", "activity"})

    def test_requires_are_switched_on_and_untick_all_switches_a_module_off(self):
        self.put(["kitchen"])      # production requires inventory
        self.assertEqual(live(self.biz), {"production", "inventory"})
        self.assertEqual(sorted(self.read()), ["dictionary_users", "home", "kitchen"])
        self.put(["pos"])
        self.assertEqual(live(self.biz), {"pos"})
        self.assertEqual(sorted(self.read()), ["dictionary_users", "home", "pos"])

    def test_locked_always_on_and_owner_only_never_sold(self):
        self.put([])
        self.assertEqual(sorted(self.read()), ["dictionary_users", "home"])
        self.put(["activity", "pos"])
        self.assertNotIn("activity", self.read())
        self.biz.refresh_from_db()
        self.assertNotIn("activity", self.biz.disabled_features)

    def test_unknown_key_is_an_error_and_changes_nothing(self):
        self.put(["pos"])
        r = self.put(["pos", "accounting", "no_such_tab"])
        self.assertEqual(r.status_code, 400)
        self.assertIn("no_such_tab", r.json()["error"])
        self.assertEqual(sorted(self.read()), ["dictionary_users", "home", "pos"])
        self.assertEqual(self.put("pos").status_code, 400)

    def test_save_without_access_leaves_the_licence_alone(self):
        self.put(["pos"])
        r = self.super_client().put(f"/api/super/users/{self.owner.id}/", {"first_name": "Ali"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(sorted(self.read()), ["dictionary_users", "home", "pos"])

    def test_expired_subscription_does_not_change_what_is_shown(self):
        self.put(["pos"])
        r = self.put(["pos"], start_date="2020-01-01", end_date="2020-02-01")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(sorted(self.read()), ["dictionary_users", "home", "pos"])   # shown as bought even when expired
        got = r.json()
        self.assertEqual((got["start_date"], got["end_date"]), ("2020-01-01", "2020-02-01"))


def live(business):
    """Live modules that own tabs (a module that sells no tab is not part of the Access tab)."""
    from bizsuite.features import FEATURES
    return enabled_modules(business) & {f.module for f in FEATURES if f.module}
