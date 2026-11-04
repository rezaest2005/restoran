from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.inventory_services import get_or_create_mother_warehouse, receive_stock, transfer_stock
from bizsuite.models import (
    InventoryMovement, RawMaterial, Business, StockItem, User, Warehouse,
)
from bizsuite.tenancy import clear_current_business

D = Decimal


def qty(wh, mat):
    s = StockItem.all_objects.filter(warehouse=wh, raw_material=mat).first()
    return s.quantity if s else D("0")


class InventoryFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r1 = Business.objects.create(name="الف", slug="inv-one")
        cls.r2 = Business.objects.create(name="ب", slug="inv-two")
        cls.w1 = get_or_create_mother_warehouse(cls.r1)
        cls.w2 = Warehouse.all_objects.create(business=cls.r1, name="سردخانه")
        cls.foreign_wh = Warehouse.all_objects.create(business=cls.r2, name="خارجی")
        cls.rice = RawMaterial.all_objects.create(
            business=cls.r1, name="برنج", unit="kg", price=100)
        cls.oil = RawMaterial.all_objects.create(
            business=cls.r1, name="روغن", unit="kg", price=50,
            minimum_stock=D("10"), target_stock=D("30"))
        cls.flour = RawMaterial.all_objects.create(
            business=cls.r1, name="آرد", unit="kg", price=20,
            minimum_stock=D("5"), target_stock=D("0"))
        cls.fine = RawMaterial.all_objects.create(
            business=cls.r1, name="نمک", unit="kg", price=5,
            minimum_stock=D("2"), target_stock=D("10"))
        cls.nomin = RawMaterial.all_objects.create(
            business=cls.r1, name="بدون حداقل", unit="kg", price=1)
        cls.foreign_mat = RawMaterial.all_objects.create(
            business=cls.r2, name="دیگر", unit="kg", price=1)
        cls.user = User.objects.create_user(
            username="mgr", password="Pass12345!", role="manager", business=cls.r1)
        cls.other_user = User.objects.create_user(
            username="mgr2", password="Pass12345!", role="manager", business=cls.r2)
        cls.limited = User.objects.create_user(
            username="lim", password="Pass12345!", role="manager", business=cls.r1,
            dashboard_permissions=["pos"])

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def post(self, path, payload):
        return self.api.post(f"/api/inventory/{path}/", payload, format="json")

    def stock(self, wh, mat):
        return qty(wh, mat)

    # ── receive / issue / waste / adjust ──
    def test_receive_issue_waste_adjust_happy(self):
        r = self.post("receive", {"warehouse_id": self.w1.id, "raw_material_id": self.rice.id,
                                  "quantity": "20", "unit_price": "100", "notes": "x"})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["success"])
        self.assertEqual(self.stock(self.w1, self.rice), D("20"))
        r = self.post("issue", {"warehouse_id": self.w1.id, "raw_material_id": self.rice.id,
                                "quantity": 5, "reason": "consumption"})
        self.assertEqual(r.status_code, 200, r.content)
        r = self.post("waste", {"warehouse_id": self.w1.id, "raw_material_id": self.rice.id,
                                "quantity": 2, "waste_reason": "expired"})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.stock(self.w1, self.rice), D("13"))
        r = self.post("adjust", {"warehouse_id": self.w1.id, "raw_material_id": self.rice.id,
                                 "new_quantity": 10, "reason": "شمارش"})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["difference"], -3.0)
        self.rice.refresh_from_db()
        self.assertEqual(self.rice.quantity, D("10"))
        types = list(InventoryMovement.all_objects.filter(raw_material=self.rice)
                     .order_by("pk").values_list("movement_type", flat=True))
        self.assertEqual(types, ["in", "out", "waste", "adjustment"])

    def test_adjust_increase_decrease(self):
        receive_stock(self.r1, self.w1, self.rice, 10)
        r = self.post("adjust", {"warehouse_id": self.w1.id, "raw_material_id": self.rice.id,
                                 "quantity": 4, "adjustment_type": "increase"})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.stock(self.w1, self.rice), D("14"))
        r = self.post("adjust", {"warehouse_id": self.w1.id, "raw_material_id": self.rice.id,
                                 "quantity": 100, "adjustment_type": "decrease"})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.stock(self.w1, self.rice), D("14"))

    def test_validation(self):
        base = {"warehouse_id": self.w1.id, "raw_material_id": self.rice.id}
        for path in ("receive", "issue", "waste"):
            self.assertEqual(self.post(path, {**base, "quantity": 0}).status_code, 400)
            self.assertEqual(self.post(path, {**base, "quantity": -3}).status_code, 400)
            self.assertEqual(self.post(path, {**base, "quantity": "abc"}).status_code, 400)
            self.assertEqual(self.post(path, {"raw_material_id": self.rice.id, "quantity": 1}).status_code, 400)
            self.assertEqual(self.post(path, {**base, "warehouse_id": "zz", "quantity": 1}).status_code, 400)
            self.assertEqual(self.post(path, {**base, "warehouse_id": self.foreign_wh.id,
                                              "quantity": 1}).status_code, 404)
            self.assertEqual(self.post(path, {**base, "raw_material_id": self.foreign_mat.id,
                                              "quantity": 1}).status_code, 404)
        self.assertEqual(self.post("receive", {**base, "quantity": 1, "unit_price": -1}).status_code, 400)
        self.assertEqual(self.post("adjust", base).status_code, 400)
        self.assertEqual(self.post("adjust", {**base, "new_quantity": -1}).status_code, 400)
        self.assertEqual(StockItem.all_objects.filter(quantity__gt=0).count(), 0)

    def test_issue_beyond_stock_fails_unchanged(self):
        receive_stock(self.r1, self.w1, self.rice, 5)
        for path in ("issue", "waste"):
            r = self.post(path, {"warehouse_id": self.w1.id, "raw_material_id": self.rice.id, "quantity": 6})
            self.assertEqual(r.status_code, 400)
            self.assertFalse(r.json()["success"])
        self.assertEqual(self.stock(self.w1, self.rice), D("5"))
        self.assertEqual(InventoryMovement.all_objects.filter(raw_material=self.rice).count(), 1)

    # ── transfer ──
    def test_transfer_moves_stock(self):
        receive_stock(self.r1, self.w1, self.rice, 10)
        r = self.post("transfer", {"source_warehouse_id": self.w1.id,
                                   "destination_warehouse_id": self.w2.id,
                                   "raw_material_id": self.rice.id, "quantity": "4", "notes": "n"})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.stock(self.w1, self.rice), D("6"))
        self.assertEqual(self.stock(self.w2, self.rice), D("4"))
        self.rice.refresh_from_db()
        self.assertEqual(self.rice.quantity, D("10"))
        mv = InventoryMovement.all_objects.filter(reference_type="transfer")
        self.assertEqual(mv.count(), 2)
        self.assertEqual(len({m.reference_id for m in mv}), 1)
        self.assertEqual({m.movement_type for m in mv}, {"in", "out"})
        out = mv.get(movement_type="out")
        self.assertEqual((out.warehouse_id, out.previous_stock, out.new_stock),
                         (self.w1.id, D("10"), D("6")))

    def test_transfer_failures(self):
        receive_stock(self.r1, self.w1, self.rice, 10)

        def go(**kw):
            payload = {"source_warehouse_id": self.w1.id, "destination_warehouse_id": self.w2.id,
                       "raw_material_id": self.rice.id, "quantity": 1, **kw}
            return self.post("transfer", payload)

        self.assertEqual(go(destination_warehouse_id=self.w1.id).status_code, 400)
        self.assertEqual(go(quantity=11).status_code, 400)
        self.assertEqual(go(quantity=0).status_code, 400)
        self.assertEqual(go(quantity=-1).status_code, 400)
        self.assertEqual(go(destination_warehouse_id=self.foreign_wh.id).status_code, 404)
        self.assertEqual(go(source_warehouse_id=self.foreign_wh.id).status_code, 404)
        self.assertEqual(go(raw_material_id=self.foreign_mat.id).status_code, 404)
        self.assertEqual(self.post("transfer", {"raw_material_id": self.rice.id, "quantity": 1}).status_code, 400)
        self.assertEqual(self.stock(self.w1, self.rice), D("10"))
        self.assertEqual(self.stock(self.w2, self.rice), D("0"))
        self.assertFalse(InventoryMovement.all_objects.filter(reference_type="transfer").exists())

    def test_transfer_service_rejects_foreign_objects(self):
        receive_stock(self.r1, self.w1, self.rice, 10)
        with self.assertRaises(ValueError):
            transfer_stock(self.r1, self.w1, self.foreign_wh, self.rice, 1)
        with self.assertRaises(ValueError):
            transfer_stock(self.r1, self.w1, self.w2, self.foreign_mat, 1)

    # ── movements list ──
    def test_movements_list_scoped_and_filtered(self):
        receive_stock(self.r1, self.w1, self.rice, 10)
        receive_stock(self.r1, self.w1, self.oil, 3)
        self.post("issue", {"warehouse_id": self.w1.id, "raw_material_id": self.rice.id, "quantity": 1})
        self.post("transfer", {"source_warehouse_id": self.w1.id, "destination_warehouse_id": self.w2.id,
                               "raw_material_id": self.rice.id, "quantity": 2})
        other = Warehouse.all_objects.create(business=self.r2, name="W")
        receive_stock(self.r2, other, self.foreign_mat, 7)

        def get(**params):
            res = self.api.get("/api/inventory/movements/", params)
            self.assertEqual(res.status_code, 200, res.content)
            return res.json()

        d = get()
        self.assertTrue(d["success"])
        self.assertEqual(d["count"], 5)
        self.assertNotIn("دیگر", [m["material_name"] for m in d["results"]])
        ids = [m["id"] for m in d["results"]]
        self.assertEqual(ids, sorted(ids, reverse=True))
        first = d["results"][0]
        for key in ("material_name", "material_unit", "warehouse_name", "quantity",
                    "previous_stock", "new_stock", "notes", "user", "created_at"):
            self.assertIn(key, first)
        self.assertEqual(get(type="transfer")["count"], 2)
        self.assertEqual(get(type="in")["count"], 2)
        self.assertEqual(get(type="out")["count"], 1)
        self.assertEqual(get(type="waste")["count"], 0)
        self.assertEqual(get(material_id=self.oil.id)["count"], 1)
        self.assertEqual(get(warehouse_id=self.w2.id)["count"], 1)
        self.assertEqual(len(get(page_size=2, page=2)["results"]), 2)
        self.assertEqual(get(page_size=2)["pages"], 3)
        self.assertEqual(get(**{"from": "2999-01-01"})["count"], 0)
        self.assertEqual(self.api.get("/api/inventory/movements/", {"type": "bogus"}).status_code, 400)
        self.assertEqual(self.api.get("/api/inventory/movements/", {"from": "nope"}).status_code, 400)
        # کاربر کسب‌وکار دیگر فقط حرکات خودش را می‌بیند
        api2 = APIClient()
        api2.force_authenticate(self.other_user)
        d2 = api2.get("/api/inventory/movements/").json()
        self.assertEqual([m["material_name"] for m in d2["results"]], ["دیگر"])

    # ── purchase suggestions ──
    def test_purchase_suggestions(self):
        wh = self.w1
        receive_stock(self.r1, wh, self.oil, 4)      # <= 10: target 30 → 26
        receive_stock(self.r1, self.w2, self.oil, 1)  # مجموع ۵ → 25
        receive_stock(self.r1, wh, self.flour, 5)     # == min, target 0 → 0 → حذف
        receive_stock(self.r1, wh, self.fine, 50)     # بالاتر از حداقل
        res = self.api.get("/api/inventory/purchase-suggestions/")
        self.assertEqual(res.status_code, 200, res.content)
        d = res.json()
        names = {x["material_name"]: x for x in d["results"]}
        self.assertEqual(set(names), {"روغن"})
        oil = names["روغن"]
        self.assertEqual(oil["suggested_quantity"], 25.0)
        self.assertEqual(oil["estimated_cost"], 1250)
        self.assertEqual(oil["unit"], "kg")
        self.assertEqual(d["total_estimated_cost"], 1250)
        # target کوچک‌تر از حداقل → minimum - qty
        RawMaterial.all_objects.filter(pk=self.oil.pk).update(target_stock=0)
        d = self.api.get("/api/inventory/purchase-suggestions/").json()
        self.assertEqual(d["results"][0]["suggested_quantity"], 5.0)

    # ── permissions ──
    def test_permission_enforced(self):
        api = APIClient()
        api.force_authenticate(self.limited)
        body = {"warehouse_id": self.w1.id, "raw_material_id": self.rice.id, "quantity": 1}
        for path in ("receive", "issue", "waste", "adjust", "transfer"):
            self.assertEqual(api.post(f"/api/inventory/{path}/", body, format="json").status_code, 403)
        self.assertEqual(api.get("/api/inventory/movements/").status_code, 403)
        self.assertEqual(api.get("/api/inventory/purchase-suggestions/").status_code, 403)
        anon = APIClient()
        self.assertIn(anon.get("/api/inventory/movements/").status_code, (401, 403))
        self.assertFalse(InventoryMovement.all_objects.exists())
