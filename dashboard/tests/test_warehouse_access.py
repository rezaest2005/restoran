from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.inventory_services import get_or_create_mother_warehouse, receive_stock, transfer_stock
from bizsuite.models import (
    Business, Category, Food, Formula, FormulaLine, RawMaterial, StockItem,
    User, UserWarehouse, Warehouse,
)
from bizsuite.modules import ensure_catalog
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token
from bizsuite.warehouse_access import allowed_warehouse_ids

D = Decimal


def client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.b = Business.objects.create(name="الف", slug="wa-one")
        cls.other = Business.objects.create(name="ب", slug="wa-two")
        cls.mother = get_or_create_mother_warehouse(cls.b)
        cls.wa = Warehouse.all_objects.create(business=cls.b, name="انبار الف")
        cls.wb = Warehouse.all_objects.create(business=cls.b, name="انبار ب")
        cls.foreign = Warehouse.all_objects.create(business=cls.other, name="خارجی")
        cls.rice = RawMaterial.all_objects.create(
            business=cls.b, name="برنج", unit="kg", price=100,
            minimum_stock=D("100"), target_stock=D("200"))
        cls.oil = RawMaterial.all_objects.create(business=cls.b, name="روغن", unit="kg", price=10)
        cls.owner = User.objects.create_user(username="wo", password="x", role="owner", business=cls.b)
        cls.mgr = User.objects.create_user(username="wm", password="x", role="manager", business=cls.b)
        cls.k1 = User.objects.create_user(
            username="k1", password="x", role="warehouse", business=cls.b, all_warehouses=False)
        cls.k2 = User.objects.create_user(
            username="k2", password="x", role="warehouse", business=cls.b, all_warehouses=False)
        cls.k0 = User.objects.create_user(
            username="k0", password="x", role="warehouse", business=cls.b, all_warehouses=False)
        cls.free = User.objects.create_user(username="kf", password="x", role="warehouse", business=cls.b)
        cls.alien = User.objects.create_user(username="al", password="x", role="manager", business=cls.other)
        UserWarehouse.all_objects.create(business=cls.b, user=cls.k1, warehouse=cls.wa)
        UserWarehouse.all_objects.create(business=cls.b, user=cls.k2, warehouse=cls.wb)
        receive_stock(cls.b, cls.wa, cls.rice, 50)
        receive_stock(cls.b, cls.wb, cls.rice, 30)
        receive_stock(cls.b, cls.wb, cls.oil, 7)

    def setUp(self):
        clear_current_business()

    def op(self, user, path, **body):
        return client(user).post(f"/api/inventory/{path}/", body, format="json")


class VisibilityTests(Base):
    def test_service_helpers(self):
        self.assertIsNone(allowed_warehouse_ids(self.owner, self.b))
        self.assertIsNone(allowed_warehouse_ids(self.mgr, self.b))
        self.assertIsNone(allowed_warehouse_ids(self.free, self.b))
        self.assertEqual(allowed_warehouse_ids(self.k1, self.b), {self.wa.pk})
        self.assertEqual(allowed_warehouse_ids(self.k0, self.b), set())

    def test_stock_and_movements_scoped(self):
        d1 = client(self.k1).get("/api/inventory/stock/").json()
        self.assertEqual({i["warehouse_id"] for i in d1["items"]}, {self.wa.pk})
        d2 = client(self.k2).get("/api/inventory/stock/").json()
        self.assertEqual({i["warehouse_id"] for i in d2["items"]}, {self.wb.pk})
        m1 = client(self.k1).get("/api/inventory/movements/").json()
        self.assertEqual({r["warehouse_id"] for r in m1["results"]}, {self.wa.pk})
        self.assertEqual(m1["count"], 1)
        self.assertEqual(client(self.k1).get(f"/api/inventory/stock/?warehouse_id={self.wb.pk}").status_code, 403)
        self.assertEqual(client(self.k1).get(f"/api/inventory/movements/?warehouse_id={self.wb.pk}").status_code, 403)

    def test_warehouse_list_scoped_with_destinations(self):
        d = client(self.k1).get("/api/inventory/warehouses/").json()
        self.assertEqual([w["id"] for w in d["warehouses"]], [self.wa.pk])
        self.assertEqual(
            {w["id"] for w in d["transfer_destinations"]},
            {self.mother.pk, self.wa.pk, self.wb.pk})
        self.assertEqual(d["warehouse_access"], {"all_access": False, "warehouse_ids": [self.wa.pk]})
        full = client(self.mgr).get("/api/inventory/warehouses/").json()
        self.assertEqual(len(full["warehouses"]), 3)

    def test_manager_sees_all(self):
        d = client(self.mgr).get("/api/inventory/stock/").json()
        self.assertEqual({i["warehouse_id"] for i in d["items"]}, {self.wa.pk, self.wb.pk})

    def test_all_access_flag(self):
        d = client(self.free).get("/api/inventory/stock/").json()
        self.assertEqual({i["warehouse_id"] for i in d["items"]}, {self.wa.pk, self.wb.pk})

    def test_user_without_assignment_sees_nothing(self):
        c = client(self.k0)
        self.assertEqual(c.get("/api/inventory/stock/").json()["count"], 0)
        self.assertEqual(c.get("/api/inventory/movements/").json()["count"], 0)
        self.assertEqual(c.get("/api/inventory/warehouses/").json()["warehouses"], [])
        self.assertEqual(c.get("/api/inventory/purchase-suggestions/").json()["count"], 0)
        dash = c.get("/api/inventory/dashboard/").json()["dashboard"]
        self.assertEqual((dash["warehouse_count"], dash["total_stock_value"], dash["low_stock_count"]), (0, 0, 0))
        self.assertEqual(self.op(self.k0, "receive", warehouse_id=self.wa.pk,
                                 raw_material_id=self.rice.pk, quantity=1).status_code, 403)

    def test_reports_dashboard_and_suggestions(self):
        c = client(self.k1)
        dash = c.get("/api/inventory/dashboard/").json()["dashboard"]
        self.assertEqual(dash["warehouse_count"], 1)
        self.assertEqual(dash["total_stock_value"], 50 * 100)
        full = client(self.mgr).get("/api/inventory/dashboard/").json()["dashboard"]
        self.assertEqual(full["total_stock_value"], 80 * 100 + 7 * 10)
        rep = c.get(f"/api/inventory/reports/item-movement/?raw_material_id={self.rice.pk}").json()
        self.assertEqual(rep["total_stock"], 50.0)
        self.assertEqual([s["warehouse_id"] for s in rep["stock_by_warehouse"]], [self.wa.pk])
        self.assertEqual(len(rep["movements"]), 1)
        sv = c.get("/api/inventory/reports/stock-value/").json()
        self.assertEqual(sv["total_value"], 5000)
        self.assertEqual(c.get(f"/api/inventory/reports/stock-value/?warehouse_id={self.wb.pk}").status_code, 403)
        self.assertEqual(
            c.get(f"/api/inventory/reports/warehouse-movements/?warehouse_id={self.wb.pk}").status_code, 403)
        self.assertEqual(
            c.get(f"/api/inventory/reports/warehouse-movements/?warehouse_id={self.wa.pk}").status_code, 200)
        # suggestions use only the keeper's own stock (50 of rice, min 100)
        s = c.get("/api/inventory/purchase-suggestions/").json()["results"][0]
        self.assertEqual(s["quantity"], 50.0)
        s = client(self.mgr).get("/api/inventory/purchase-suggestions/").json()["results"][0]
        self.assertEqual(s["quantity"], 80.0)


class WriteTests(Base):
    def test_cannot_touch_other_warehouse(self):
        body = dict(warehouse_id=self.wb.pk, raw_material_id=self.rice.pk, quantity=1)
        for path, extra in (("receive", {}), ("issue", {}), ("waste", {}),
                            ("adjust", {"new_quantity": 5})):
            r = self.op(self.k1, path, **{**body, **extra})
            self.assertEqual(r.status_code, 403, path)
            self.assertFalse(r.json()["success"])
            self.assertTrue(r.json()["error"])
        r = self.op(self.k1, "transfer", source_warehouse_id=self.wb.pk,
                    destination_warehouse_id=self.wa.pk, raw_material_id=self.rice.pk, quantity=1)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(StockItem.all_objects.get(warehouse=self.wb, raw_material=self.rice).quantity, D("30"))

    def test_can_work_on_own_warehouse(self):
        base = dict(warehouse_id=self.wa.pk, raw_material_id=self.rice.pk)
        self.assertEqual(self.op(self.k1, "receive", quantity=5, **base).status_code, 200)
        self.assertEqual(self.op(self.k1, "issue", quantity=1, **base).status_code, 200)
        self.assertEqual(self.op(self.k1, "waste", quantity=1, **base).status_code, 200)
        self.assertEqual(self.op(self.k1, "adjust", new_quantity=40, **base).status_code, 200)

    def test_transfer_out_and_receiver_sees_incoming(self):
        r = self.op(self.k1, "transfer", source_warehouse_id=self.wa.pk,
                    destination_warehouse_id=self.wb.pk, raw_material_id=self.rice.pk, quantity=10)
        self.assertEqual(r.status_code, 200, r.content)
        res = client(self.k2).get("/api/inventory/movements/?type=transfer").json()["results"]
        self.assertEqual([(m["warehouse_id"], m["movement_type"], m["quantity"]) for m in res],
                         [(self.wb.pk, "in", 10.0)])
        mine = client(self.k1).get("/api/inventory/movements/?type=transfer").json()["results"]
        self.assertEqual([(m["warehouse_id"], m["movement_type"]) for m in mine], [(self.wa.pk, "out")])
        self.assertEqual(StockItem.all_objects.get(warehouse=self.wb, raw_material=self.rice).quantity, D("40"))

    def test_transfer_to_inactive_destination_rejected(self):
        Warehouse.all_objects.filter(pk=self.wb.pk).update(is_active=False)
        r = self.op(self.k1, "transfer", source_warehouse_id=self.wa.pk,
                    destination_warehouse_id=self.wb.pk, raw_material_id=self.rice.pk, quantity=1)
        self.assertEqual(r.status_code, 400)

    def test_manager_transfers_anywhere(self):
        r = self.op(self.mgr, "transfer", source_warehouse_id=self.wb.pk,
                    destination_warehouse_id=self.wa.pk, raw_material_id=self.rice.pk, quantity=5)
        self.assertEqual(r.status_code, 200, r.content)

    def test_tenant_isolation(self):
        r = self.op(self.alien, "receive", warehouse_id=self.wa.pk,
                    raw_material_id=self.rice.pk, quantity=1)
        self.assertEqual(r.status_code, 404)
        self.assertEqual(client(self.alien).get("/api/inventory/stock/").json()["count"], 0)
        r = self.op(self.k1, "transfer", source_warehouse_id=self.wa.pk,
                    destination_warehouse_id=self.foreign.pk, raw_material_id=self.rice.pk, quantity=1)
        self.assertEqual(r.status_code, 404)

    def test_warehouse_management_manager_only(self):
        for path, body in (("warehouses/save", {"name": "جدید"}),
                           ("warehouses/delete", {"id": self.wa.pk})):
            self.assertEqual(self.op(self.k1, path, **body).status_code, 403, path)
            self.assertEqual(self.op(self.free, path, **body).status_code, 403, path)
        self.assertEqual(self.op(self.mgr, "warehouses/save", name="جدید").status_code, 200)
        self.assertEqual(client(self.k1).post(
            f"/api/catalog/warehouses/{self.wa.pk}/sales-default/", {"value": True}, format="json"
        ).status_code, 403)


class AssignmentApiTests(Base):
    def url(self, user):
        return f"/api/inventory/users/{user.pk}/warehouses/"

    def test_get_and_put(self):
        c = client(self.mgr)
        self.assertEqual(c.get(self.url(self.k1)).json()["data"],
                         {"all_access": False, "warehouse_ids": [self.wa.pk]})
        r = c.put(self.url(self.k1), {"all_access": False, "warehouse_ids": [self.wb.pk, self.mother.pk]},
                  format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["data"]["warehouse_ids"], sorted([self.wb.pk, self.mother.pk]))
        self.assertEqual(allowed_warehouse_ids(User.objects.get(pk=self.k1.pk), self.b),
                         {self.wb.pk, self.mother.pk})
        r = c.put(self.url(self.k1), {"all_access": True, "warehouse_ids": [self.wa.pk]}, format="json")
        self.assertEqual(r.json()["data"], {"all_access": True, "warehouse_ids": []})
        self.assertFalse(UserWarehouse.all_objects.filter(user=self.k1).exists())
        self.assertIsNone(allowed_warehouse_ids(User.objects.get(pk=self.k1.pk), self.b))

    def test_validation_and_permissions(self):
        c = client(self.mgr)
        r = c.put(self.url(self.k1), {"all_access": False, "warehouse_ids": [self.foreign.pk]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(UserWarehouse.all_objects.get(user=self.k1).warehouse_id, self.wa.pk)
        self.assertEqual(c.put(self.url(self.k1), {"all_access": "x"}, format="json").status_code, 400)
        self.assertEqual(client(self.k1).put(
            self.url(self.k1), {"all_access": True, "warehouse_ids": []}, format="json").status_code, 403)
        self.assertEqual(client(self.k1).get(self.url(self.k2)).status_code, 403)
        # other business
        self.assertEqual(client(self.alien).get(self.url(self.k1)).status_code, 404)
        self.assertEqual(c.get(self.url(self.alien)).status_code, 404)

    def test_auth_me_payload(self):
        d = client(self.k1).get("/api/auth/me/").json()["data"]
        self.assertEqual(d["warehouse_access"], {"all_access": False, "warehouse_ids": [self.wa.pk]})
        d = client(self.mgr).get("/api/auth/me/").json()["data"]
        self.assertEqual(d["warehouse_access"], {"all_access": True, "warehouse_ids": []})
        self.assertEqual(client(self.k0).get("/api/auth/me/").json()["data"]["warehouse_access"],
                         {"all_access": False, "warehouse_ids": []})


class NetworkTests(Base):
    def test_network_numbers(self):
        transfer_stock(self.b, self.wa, self.wb, self.rice, 5, user=self.k1)
        r = client(self.mgr).get("/api/inventory/network/")
        self.assertEqual(r.status_code, 200, r.content)
        rows = {w["id"]: w for w in r.json()["data"]["warehouses"]}
        a, bb, m = rows[self.wa.pk], rows[self.wb.pk], rows[self.mother.pk]
        self.assertEqual((a["item_count"], a["total_stock_value"]), (1, 45 * 100))
        self.assertEqual((bb["item_count"], bb["total_stock_value"]), (2, 35 * 100 + 7 * 10))
        self.assertEqual((a["transfers_out_7d"], a["transfers_in_7d"]), (1, 0))
        self.assertEqual((bb["transfers_out_7d"], bb["transfers_in_7d"]), (0, 1))
        self.assertTrue(m["is_mother"])
        self.assertIn("k1", a["keepers"])
        self.assertIn("kf", a["keepers"])  # unrestricted keeper works everywhere
        self.assertNotIn("k1", bb["keepers"])
        self.assertIn("k2", bb["keepers"])

    def test_network_manager_only(self):
        self.assertEqual(client(self.k1).get("/api/inventory/network/").status_code, 403)
        other = client(self.alien).get("/api/inventory/network/").json()["data"]["warehouses"]
        self.assertTrue(all(w["item_count"] == 0 for w in other))


class SystemServicesTests(Base):
    def test_pos_sale_and_production_ignore_keeper_restriction(self):
        cat = Category.all_objects.create(business=self.b, name="c")
        item = RawMaterial.all_objects.create(
            business=self.b, name="پیتزا", material_type="finished", unit="piece", price=10)
        food = Food.all_objects.create(business=self.b, category=cat, name="پیتزا", price=1000, item=item)
        receive_stock(self.b, self.mother, item, 10)
        cashier = User.objects.create_user(
            username="wc", password="x", role="cashier", business=self.b, all_warehouses=False)
        res = client(cashier).post(
            "/api/pos/create-order/", {"items": [{"food_id": food.id, "quantity": 2}], "source": "pos"},
            format="json").json()
        self.assertTrue(res["success"], res)
        self.assertEqual(
            StockItem.all_objects.get(warehouse=self.mother, raw_material=item).quantity, D("8"))

        out = RawMaterial.all_objects.create(
            business=self.b, name="خروجی", material_type="finished", unit="kg", price=1)
        f = Formula.all_objects.create(business=self.b, name="ف", output_material=out, output_quantity=D("1"))
        FormulaLine.all_objects.create(business=self.b, formula=f, material=self.oil, quantity=D("2"))
        receive_stock(self.b, self.mother, self.oil, 10)
        cook = User.objects.create_user(
            username="wk", password="x", role="manager", business=self.b, all_warehouses=False)
        c = client(cook)
        o = c.post("/api/production/orders/", {"formula_id": f.id, "planned_quantity": "1"}, format="json")
        self.assertEqual(o.status_code, 201, o.content)
        r = c.post(f"/api/production/orders/{o.json()['data']['id']}/complete/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)


class ModuleOffTests(Base):
    def test_inventory_module_off_is_403(self):
        ensure_catalog()
        admin = User.objects.create_superuser(username="wsu", password="x")
        sup = APIClient()
        sup.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(admin))
        r = sup.put(f"/api/super/businesses/{self.b.id}/modules/",
                    {"modules": {"inventory": {"is_enabled": False}, "production": {"is_enabled": False}}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        c = client(self.mgr)
        self.assertEqual(c.get("/api/inventory/network/").status_code, 403)
        self.assertEqual(c.get("/api/inventory/stock/").status_code, 403)
