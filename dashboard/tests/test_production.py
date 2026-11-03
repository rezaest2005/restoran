from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from restaurant.inventory_services import get_or_create_mother_warehouse, receive_stock
from restaurant.models import (
    Formula, FormulaLine, ProductionOrder, RawMaterial, Restaurant, StockItem, User,
)
from restaurant.tenancy import clear_current_restaurant


def mk(r, name, kind, price, unit="kg"):
    return RawMaterial.all_objects.create(
        restaurant=r, name=name, material_type=kind, price=price, unit=unit)


class ProductionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r1 = Restaurant.objects.create(name="کارخانه", slug="fac-one")
        cls.r2 = Restaurant.objects.create(name="دیگر", slug="fac-two")
        cls.wh = get_or_create_mother_warehouse(cls.r1)
        cls.iron = mk(cls.r1, "آهن", "raw", 1000)
        cls.coke = mk(cls.r1, "کک", "raw", 500)
        cls.steel = mk(cls.r1, "فولاد", "semi_finished", 0)
        cls.other = mk(cls.r2, "ماده دیگر", "raw", 10)
        receive_stock(cls.r1, cls.wh, cls.iron, 100)
        receive_stock(cls.r1, cls.wh, cls.coke, 50)
        cls.user = User.objects.create_user(
            username="mgr", password="Pass12345!", role="manager", restaurant=cls.r1)
        cls.f = Formula.all_objects.create(
            restaurant=cls.r1, name="فولاد ساده", output_material=cls.steel,
            output_quantity=Decimal("10"))
        FormulaLine.all_objects.create(
            restaurant=cls.r1, formula=cls.f, material=cls.iron, quantity=Decimal("12"))
        FormulaLine.all_objects.create(
            restaurant=cls.r1, formula=cls.f, material=cls.coke, quantity=Decimal("2"),
            wastage_percent=Decimal("10"))

    def setUp(self):
        clear_current_restaurant()
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def _order(self, qty="20"):
        res = self.api.post("/api/production/orders/",
                            {"formula_id": self.f.id, "planned_quantity": qty}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()["data"]

    def test_requirements_scale_with_wastage(self):
        d = self._order("20")  # دو برابر دسته
        need = {r["material"]: r["quantity"] for r in d["required"]}
        self.assertEqual(need["آهن"], 24.0)
        self.assertAlmostEqual(need["کک"], 4.4)  # 2×2×1.1
        self.assertEqual(d["shortages"], [])

    def test_shortage_reported(self):
        d = self._order("1000")
        self.assertTrue(any(s["material"] == "آهن" for s in d["shortages"]))

    def test_complete_moves_stock_and_costs(self):
        d = self._order("20")
        res = self.api.post(f"/api/production/orders/{d['id']}/complete/", {}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        out = res.json()["data"]
        self.assertEqual(out["status"], "completed")
        # هزینه = 24×1000 + 4.4×500 = 26200 ؛ بهای هر واحد = 26200/20
        self.assertEqual(out["total_cost"], 26200.0)
        self.assertAlmostEqual(out["unit_cost"], 1310.0)
        level = lambda m: StockItem.all_objects.get(
            restaurant=self.r1, warehouse=self.wh, raw_material=m).quantity
        self.assertEqual(level(self.iron), Decimal("76"))
        self.assertEqual(level(self.steel), Decimal("20"))
        self.steel.refresh_from_db()
        self.assertEqual(int(self.steel.price), 1310)

    def test_insufficient_stock_rolls_back_everything(self):
        d = self._order("1000")
        res = self.api.post(f"/api/production/orders/{d['id']}/complete/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(ProductionOrder.all_objects.get(pk=d["id"]).status, "planned")
        self.assertEqual(
            StockItem.all_objects.get(restaurant=self.r1, warehouse=self.wh,
                                      raw_material=self.iron).quantity, Decimal("100"))

    def test_cannot_complete_twice(self):
        d = self._order("10")
        self.api.post(f"/api/production/orders/{d['id']}/complete/", {}, format="json")
        again = self.api.post(f"/api/production/orders/{d['id']}/complete/", {}, format="json")
        self.assertEqual(again.status_code, 400)

    def test_formula_create_validations(self):
        body = {"name": "x", "output_material_id": self.steel.id, "output_quantity": 1,
                "lines": [{"material_id": self.steel.id, "quantity": 1}]}
        self.assertEqual(self.api.post("/api/formulas/", body, format="json").status_code, 400)
        body["lines"] = [{"material_id": self.other.id, "quantity": 1}]  # ماده‌ی کسب‌وکار دیگر
        self.assertEqual(self.api.post("/api/formulas/", body, format="json").status_code, 400)
        body["lines"] = [{"material_id": self.iron.id, "quantity": 0}]
        self.assertEqual(self.api.post("/api/formulas/", body, format="json").status_code, 400)
        body["lines"] = [{"material_id": self.iron.id, "quantity": 3}]
        ok = self.api.post("/api/formulas/", body, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)

    def test_tenant_isolation(self):
        u2 = User.objects.create_user(username="m2", password="Pass12345!",
                                      role="manager", restaurant=self.r2)
        other = APIClient()
        other.force_authenticate(u2)
        self.assertEqual(other.get(f"/api/formulas/{self.f.id}/").status_code, 404)
        d = self._order("10")
        self.assertEqual(other.get(f"/api/production/orders/{d['id']}/").status_code, 404)
        self.assertEqual(other.get("/api/formulas/").json()["data"], [])
