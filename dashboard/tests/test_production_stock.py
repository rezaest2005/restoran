from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.inventory_services import get_or_create_mother_warehouse, receive_stock
from bizsuite.models import (
    Business, Formula, FormulaLine, ProductionOrder, RawMaterial, StockItem, User, Warehouse,
)
from bizsuite.tenancy import clear_current_business


def mk(b, name, kind, price=100, unit="kg"):
    return RawMaterial.all_objects.create(
        business=b, name=name, material_type=kind, price=price, unit=unit)


class ProductionStockTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.b1 = Business.objects.create(name="الف", slug="ps-one")
        cls.b2 = Business.objects.create(name="ب", slug="ps-two")
        cls.wh = get_or_create_mother_warehouse(cls.b1)
        cls.wh2 = Warehouse.all_objects.create(business=cls.b1, name="انبار دوم")
        cls.a = mk(cls.b1, "ماده A", "raw")
        cls.bm = mk(cls.b1, "ماده B", "raw", unit="lt")
        cls.semi = mk(cls.b1, "نیمه‌آماده", "semi_finished")
        cls.final = mk(cls.b1, "محصول", "finished")
        receive_stock(cls.b1, cls.wh, cls.a, 10)
        receive_stock(cls.b1, cls.wh2, cls.a, 5)
        receive_stock(cls.b1, cls.wh, cls.bm, 1)
        # سطح اول: نیمه‌آماده از A و B
        cls.f1 = Formula.all_objects.create(
            business=cls.b1, name="ف۱", output_material=cls.semi, output_quantity=Decimal("1"))
        FormulaLine.all_objects.create(business=cls.b1, formula=cls.f1, material=cls.a,
                                       quantity=Decimal("4"), wastage_percent=Decimal("25"))
        FormulaLine.all_objects.create(business=cls.b1, formula=cls.f1, material=cls.bm,
                                       quantity=Decimal("2"))
        # سطح دوم: محصول از نیمه‌آماده و A
        cls.f2 = Formula.all_objects.create(
            business=cls.b1, name="ف۲", output_material=cls.final, output_quantity=Decimal("1"))
        FormulaLine.all_objects.create(business=cls.b1, formula=cls.f2, material=cls.semi,
                                       quantity=Decimal("1"))
        FormulaLine.all_objects.create(business=cls.b1, formula=cls.f2, material=cls.a,
                                       quantity=Decimal("1"))
        cls.user = User.objects.create_user(
            username="psm", password="Pass12345!", role="manager", business=cls.b1)
        cls.user2 = User.objects.create_user(
            username="psm2", password="Pass12345!", role="manager", business=cls.b2)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def _lines(self, f):
        d = self.api.get(f"/api/formulas/{f.id}/").json()["data"]
        return {l["material"]: l for l in d["lines"]}

    def test_formula_stock_per_line(self):
        L = self._lines(self.f1)
        self.assertEqual(L["ماده A"]["stock_quantity"], 15.0)  # مجموع دو انبار
        self.assertEqual(L["ماده A"]["required_for_batch"], 5.0)  # 4×1.25
        self.assertTrue(L["ماده A"]["available_for_one_batch"])
        self.assertEqual(L["ماده B"]["stock_quantity"], 1.0)
        self.assertFalse(L["ماده B"]["available_for_one_batch"])
        self.assertEqual(L["ماده B"]["unit"], "lt")
        self.assertEqual(L["ماده B"]["material_type"], "raw")
        self.assertIn("unit_price", L["ماده B"])

    def test_multi_level_detection(self):
        L2 = self._lines(self.f2)
        self.assertTrue(L2["نیمه‌آماده"]["is_semi_finished_with_formula"])
        self.assertEqual(L2["نیمه‌آماده"]["sub_formula_id"], self.f1.id)
        self.assertEqual(L2["نیمه‌آماده"]["material_type"], "semi_finished")
        self.assertFalse(L2["ماده A"]["is_semi_finished_with_formula"])
        self.assertIsNone(L2["ماده A"]["sub_formula_id"])
        self.assertEqual(L2["نیمه‌آماده"]["stock_quantity"], 0.0)

    def _order(self, f, qty):
        res = self.api.post("/api/production/orders/",
                            {"formula_id": f.id, "planned_quantity": qty}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()["data"]

    def test_order_lines_readiness(self):
        d = self._order(self.f1, "1")
        self.assertFalse(d["ready"])
        L = {l["material"]: l for l in d["lines"]}
        self.assertEqual(L["ماده A"]["missing"], 0)
        self.assertTrue(L["ماده A"]["ready"])
        self.assertEqual(L["ماده B"]["required"], 2.0)
        self.assertEqual(L["ماده B"]["available"], 1.0)
        self.assertEqual(L["ماده B"]["missing"], 1.0)
        self.assertFalse(L["ماده B"]["ready"])
        self.assertEqual([s["material"] for s in d["shortages"]], ["ماده B"])
        got = self.api.get(f"/api/production/orders/{d['id']}/").json()["data"]
        self.assertEqual(got["ready"], False)
        self.assertEqual(len(got["lines"]), 2)

    def test_order_ready_when_stock_enough(self):
        receive_stock(self.b1, self.wh, self.bm, 10)
        d = self._order(self.f1, "1")
        self.assertTrue(d["ready"])
        self.assertEqual(d["shortages"], [])
        self.assertTrue(all(l["ready"] and l["missing"] == 0 for l in d["lines"]))

    def test_complete_short_returns_readable_400(self):
        d = self._order(self.f1, "1")
        res = self.api.post(f"/api/production/orders/{d['id']}/complete/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        body = res.content.decode()
        self.assertIn("موجودی کافی نیست", body)
        self.assertIn("ماده B", body)
        self.assertNotIn("ماده A", body)
        self.assertEqual(ProductionOrder.all_objects.get(pk=d["id"]).status, "planned")
        self.assertEqual(StockItem.all_objects.get(
            business=self.b1, warehouse=self.wh, raw_material=self.bm).quantity, Decimal("1"))

    def test_tenant_isolation(self):
        other = APIClient()
        other.force_authenticate(self.user2)
        self.assertEqual(other.get(f"/api/formulas/{self.f1.id}/").status_code, 404)
        # ماده‌ی همنام در کسب‌وکار دیگر روی موجودی اثر نمی‌گذارد
        m = mk(self.b2, "ماده A", "raw")
        receive_stock(self.b2, get_or_create_mother_warehouse(self.b2), m, 999)
        self.assertEqual(self._lines(self.f1)["ماده A"]["stock_quantity"], 15.0)
