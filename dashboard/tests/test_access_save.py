"""Saving a user's access (tabs) must persist and read back — from Definitions → Users & access
and from the super-admin panel — for every tab key the UI can send."""

from bizsuite.features import ALL_FEATURE_KEYS, user_ticked
from rest_framework.test import APIClient

from bizsuite.models import User
from bizsuite.views.super_admin.auth import _make_super_token
from tests.test_features import FeatureBase

# The groups the two screens render (ManagersSection GROUPS / superConfig PERM_GROUPS).
UI_KEYS = [
    "home", "activity", "pos", "pos_report", "pos_settings", "orders",
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
        self.assertEqual(sorted(UI_KEYS), sorted(ALL_FEATURE_KEYS))

    def test_owner_saves_every_tab_and_reads_it_back(self):
        self.sell_all()
        c = self.api(self.owner)
        r = c.post("/api/users/tabs/", {"user_id": self.cashier.id, "tabs": {k: True for k in UI_KEYS}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        listed = {u["id"]: u for u in c.get("/api/users/management/").json()["users"]}[self.cashier.id]
        self.assertTrue(all(listed["tabs"][k] for k in UI_KEYS), listed["tabs"])
        self.cashier.refresh_from_db()
        self.assertEqual(user_ticked(self.cashier), set(ALL_FEATURE_KEYS))
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
    def super_client(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.root))
        return c

    def test_save_every_ui_key_and_read_back(self):
        c = self.super_client()
        url = f"/api/super/users/{self.cashier.id}/permissions/"
        r = c.put(url, {"dashboard_permissions": UI_KEYS}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(sorted(r.json()["dashboard_permissions"]), sorted(UI_KEYS))
        got = c.get(f"/api/super/users/{self.cashier.id}/").json()
        self.assertEqual(sorted(got["effective_permissions"]), sorted(UI_KEYS))
        self.cashier.refresh_from_db()
        self.assertEqual(user_ticked(self.cashier), set(ALL_FEATURE_KEYS))

    def test_overrides_previous_tabs(self):
        """A user who already has a tabs dict (set from the business screen) must follow the super-admin save."""
        self.cashier.tabs = {"pos": True, "orders": True}
        self.cashier.save()
        c = self.super_client()
        r = c.put(f"/api/super/users/{self.cashier.id}/permissions/",
                  {"dashboard_permissions": ["home", "inventory_reports"]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.cashier.refresh_from_db()
        self.assertEqual(user_ticked(self.cashier), {"home", "inventory_reports"})

    def test_each_key_alone_and_empty(self):
        c = self.super_client()
        url = f"/api/super/users/{self.keeper.id}/permissions/"
        for k in UI_KEYS:
            self.assertEqual(c.put(url, {"dashboard_permissions": [k]}, format="json").status_code, 200, k)
            self.keeper.refresh_from_db()
            self.assertEqual(user_ticked(self.keeper), {k}, k)
        c.put(url, {"dashboard_permissions": []}, format="json")
        self.keeper.refresh_from_db()
        self.assertEqual(user_ticked(self.keeper), set())

    def test_unknown_key_is_an_error_not_silently_dropped(self):
        c = self.super_client()
        r = c.put(f"/api/super/users/{self.cashier.id}/permissions/",
                  {"dashboard_permissions": ["pos", "no_such_tab"]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("no_such_tab", r.json()["error"])

    def test_user_edit_and_create_store_permissions(self):
        c = self.super_client()
        r = c.put(f"/api/super/users/{self.cashier.id}/",
                  {"role": "cashier", "dashboard_permissions": ["home", "delivery_dispatch"]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.cashier.refresh_from_db()
        self.assertEqual(user_ticked(self.cashier), {"home", "delivery_dispatch"})
        r = c.post("/api/super/users/create/", {
            "username": "newperm", "password": "Pass12345!", "role": "cashier",
            "business_id": self.biz.id, "dashboard_permissions": ["kitchen", "club"]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(user_ticked(User.objects.get(username="newperm")), {"kitchen", "club"})
        r = c.put(f"/api/super/users/{self.cashier.id}/", {"dashboard_permissions": ["bogus"]}, format="json")
        self.assertEqual(r.status_code, 400)

