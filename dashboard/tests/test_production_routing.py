"""فرمول چندسطحی، خط تولید (مراحل)، برنامه‌ریز، محصول جانبی و توصیف فرایند."""
from decimal import Decimal

from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from bizsuite.inventory_services import get_or_create_mother_warehouse, receive_stock
from bizsuite.models import (
    Business, Category, Food, Formula, FormulaByProduct, FormulaLine, FormulaStage,
    ProductionOrder, ProductionOrderStep, RawMaterial, StockItem, User,
)
from bizsuite.production_engine import BomGraph, convert, line_requirement, stage_minutes
from bizsuite.production_parser import parse_process
from bizsuite.tenancy import clear_current_business

D = Decimal


def mk(b, name, kind="raw", price=0, unit="kg"):
    return RawMaterial.all_objects.create(
        business=b, name=name, material_type=kind, price=price, unit=unit)


class EngineUnitTests(SimpleTestCase):
    def test_unit_conversion(self):
        self.assertEqual(convert(D("250"), "g", "kg"), D("0.25"))
        self.assertEqual(convert(D("2"), "l", "ml"), D("2000"))
        self.assertEqual(convert(D("1"), "dozen", "unit"), D("12"))
        with self.assertRaises(ValueError):
            convert(D("1"), "kg", "l")

    def test_line_requirement_waste_setup_rounding(self):
        # 10 × 3 × 1.1 = 33 ؛ +2 راه‌اندازی = 35 ؛ گرد به مضرب 25 → 50
        self.assertEqual(line_requirement(D("10"), D("10"), D("2"), D("25"), D("3")), D("50.000"))
        self.assertEqual(line_requirement(D("10"), 0, 0, 0, D("0.5")), D("5.000"))
        self.assertEqual(line_requirement(D("10"), 0, 5, 0, 0), D("0"))

    def test_stage_minutes_capacity(self):
        # 10 دقیقه آماده‌سازی + ceil(2500/1000)=3 نوبت × 30
        self.assertEqual(stage_minutes(10, 30, 1000, 1, 2500), D("100.00"))
        # ظرفیت صفر = یک دسته‌ی فرمول (4) → ceil(10/4)=3 نوبت × 15
        self.assertEqual(stage_minutes(0, 15, 0, 4, 10), D("45.00"))


class DetergentFactoryTests(TestCase):
    """خط مایع ظرفشویی: پایه‌ی مایع (نیمه‌آماده) → بطری پرشده (محصول)."""

    @classmethod
    def setUpTestData(cls):
        cls.b = Business.objects.create(name="کارخانه شوینده", slug="det-one")
        cls.other = Business.objects.create(name="دیگر", slug="det-two")
        cls.wh = get_or_create_mother_warehouse(cls.b)
        cls.water = mk(cls.b, "آب", price=1, unit="l")
        cls.sles = mk(cls.b, "SLES", price=100, unit="kg")
        cls.salt = mk(cls.b, "نمک", price=10, unit="kg")
        cls.bottle = mk(cls.b, "بطری", "packaging", price=50, unit="unit")
        cls.base = mk(cls.b, "پایه مایع", "semi_finished", unit="l")
        cls.product = mk(cls.b, "مایع ظرفشویی ۱ لیتری", "finished", unit="unit")
        cls.residue = mk(cls.b, "پساب قابل بازیافت", "semi_finished", unit="l")
        receive_stock(cls.b, cls.wh, cls.water, 1000)
        receive_stock(cls.b, cls.wh, cls.sles, 30)
        receive_stock(cls.b, cls.wh, cls.salt, 10)
        receive_stock(cls.b, cls.wh, cls.bottle, 120)
        # پایه: 100 لیتر = 80 لیتر آب + 15 کیلو SLES + 2000 گرم نمک
        cls.f_base = Formula.all_objects.create(
            business=cls.b, name="پایه", output_material=cls.base, output_quantity=D("100"))
        mix = FormulaStage.all_objects.create(
            business=cls.b, formula=cls.f_base, sequence=1, name="اختلاط", workstation="میکسر",
            setup_minutes=10, run_minutes=30, capacity=200, labour_rate=60, overhead_rate=0)
        FormulaLine.all_objects.create(business=cls.b, formula=cls.f_base, material=cls.water,
                                       quantity=D("80"), stage=mix)
        FormulaLine.all_objects.create(business=cls.b, formula=cls.f_base, material=cls.sles,
                                       quantity=D("15"))
        FormulaLine.all_objects.create(business=cls.b, formula=cls.f_base, material=cls.salt,
                                       quantity=D("2000"), unit="g")
        FormulaByProduct.all_objects.create(business=cls.b, formula=cls.f_base,
                                            material=cls.residue, quantity=D("5"),
                                            cost_share_percent=D("10"))
        # محصول: 1 بطری = 1 لیتر پایه + 1 بطری
        cls.f_prod = Formula.all_objects.create(
            business=cls.b, name="پرکنی", output_material=cls.product, output_quantity=D("1"))
        FormulaStage.all_objects.create(
            business=cls.b, formula=cls.f_prod, sequence=1, name="پرکنی", workstation="پرکن",
            setup_minutes=5, run_minutes=D("0.5"), capacity=1, labour_rate=120)
        FormulaStage.all_objects.create(
            business=cls.b, formula=cls.f_prod, sequence=2, name="برچسب", workstation="برچسب‌زن",
            run_minutes=D("0.1"), capacity=1, labour_rate=60)
        FormulaLine.all_objects.create(business=cls.b, formula=cls.f_prod, material=cls.base,
                                       quantity=D("1"))
        FormulaLine.all_objects.create(business=cls.b, formula=cls.f_prod, material=cls.bottle,
                                       quantity=D("1"))
        cls.user = User.objects.create_user(
            username="detm", password="Pass12345!", role="manager", business=cls.b)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def _plan(self, items, **extra):
        res = self.api.post("/api/production/plan/", {"items": items, **extra}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()["data"]

    # ── انفجار BOM ──
    def test_multilevel_explosion_with_units(self):
        g = BomGraph(self.b)
        p = g.plan([(self.f_prod.id, D("100"))], use_stock=True)
        mats = {m["material"]: m for m in p["materials"]}
        self.assertEqual(mats["آب"]["required"], D("80.000"))
        self.assertEqual(mats["SLES"]["required"], D("15.000"))
        self.assertEqual(mats["نمک"]["required"], D("2.000"))  # 2000 g → 2 kg
        self.assertEqual(mats["بطری"]["required"], D("100.000"))
        # ترتیب ساخت: اول نیمه‌آماده (پایه) بعد محصول
        self.assertEqual([s["material"] for s in p["make_steps"]], ["پایه مایع", "مایع ظرفشویی ۱ لیتری"])

    def test_planner_shortage_and_purchase_list(self):
        p = self._plan([{"formula_id": self.f_prod.id, "quantity": 300}])
        self.assertFalse(p["can_produce"])
        buy = {m["material"]: m for m in p["purchase_list"]}
        # 300 لیتر پایه ⇒ 45 کیلو SLES، موجود 30 ⇒ کسری 15
        self.assertEqual(buy["SLES"]["shortage"], 15.0)
        self.assertEqual(buy["SLES"]["shortage_cost"], 1500.0)
        self.assertEqual(buy["بطری"]["shortage"], 180.0)
        self.assertNotIn("آب", buy)
        # حداکثر قابل تولید از موجودی: محدودیت بطری (120) و SLES (30÷0.15=200) ⇒ 120
        self.assertEqual(p["targets"][0]["max_producible"], 120.0)

    def test_planner_nets_semi_finished_stock(self):
        receive_stock(self.b, self.wh, self.base, 40)
        p = self._plan([{"formula_id": self.f_prod.id, "quantity": 100}])
        steps = {s["material"]: s for s in p["make_steps"]}
        self.assertEqual(steps["پایه مایع"]["quantity"], 60.0)  # 100 − 40 موجود
        self.assertEqual(p["from_stock"][0]["quantity"], 40.0)
        sles = next(m for m in p["materials"] if m["material"] == "SLES")
        self.assertEqual(sles["required"], 9.0)

    def test_planner_time_cost_bottleneck(self):
        p = self._plan([{"formula_id": self.f_prod.id, "quantity": 100}], use_stock=False)
        # پایه 100 لیتر: 10 + 1 نوبت × 30 = 40 دقیقه ؛ پرکنی 5 + 100×0.5 = 55 ؛ برچسب 10
        self.assertEqual(p["total_minutes"], 105.0)
        self.assertEqual(p["bottleneck"]["name"], "پرکن")
        t = p["targets"][0]
        # مواد پایه/لیتر: (80×1 + 15×100 + 2×10)/100 = 16 ؛ دستمزد اختلاط 40 دقیقه × 60/60 = 40 ⇒ 0.4/لیتر
        # سهم محصول جانبی 10٪ ⇒ پایه = (1600+40)×0.9/100 = 14.76 در لیتر
        # محصول: 14.76 + 50 بطری = 64.76 ×100 = 6476 ؛ دستمزد 55 دقیقه×2 + 10 دقیقه×1 = 120
        self.assertAlmostEqual(t["material_cost"], 6476.0, places=2)
        self.assertAlmostEqual(t["operation_cost"], 120.0, places=2)
        self.assertAlmostEqual(t["unit_cost"], 65.96, places=2)

    def test_create_orders_from_plan(self):
        p = self._plan([{"formula_id": self.f_prod.id, "quantity": 50}], create_orders=True)
        self.assertEqual(len(p["created_orders"]), 2)
        top = ProductionOrder.all_objects.get(pk=p["created_orders"][0]["id"])
        child = ProductionOrder.all_objects.get(pk=p["created_orders"][1]["id"])
        self.assertEqual(child.parent_id, top.id)
        self.assertEqual(child.formula_id, self.f_base.id)
        self.assertEqual(child.planned_quantity, D("50"))
        self.assertEqual(top.steps.model.all_objects.filter(order=top).count(), 2)

    # ── چرخه ──
    def test_cycle_rejected(self):
        # پایه ← محصول (محصول خودش از پایه ساخته می‌شود) ⇒ چرخه
        body = {"lines": [{"material_id": self.water.id, "quantity": 1},
                          {"material_id": self.product.id, "quantity": 1}]}
        res = self.api.put(f"/api/formulas/{self.f_base.id}/", body, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("چرخه", res.content.decode())
        self.assertEqual(FormulaLine.all_objects.filter(formula=self.f_base).count(), 3)  # بدون تغییر

    def test_incompatible_unit_rejected(self):
        body = {"lines": [{"material_id": self.sles.id, "quantity": 1, "unit": "l"}]}
        res = self.api.put(f"/api/formulas/{self.f_base.id}/", body, format="json")
        self.assertEqual(res.status_code, 400)

    def test_save_structure_round_trip(self):
        body = {
            "name": "پایه ۲", "output_material_id": self.base.id, "output_quantity": 50,
            "industry": "detergent", "overhead_percent": 5,
            "stages": [{"name": "توزین", "run_minutes": 5}, {"name": "اختلاط", "run_minutes": 20,
                                                             "workstation": "میکسر"}],
            "lines": [{"material_id": self.water.id, "quantity": 40, "stage_index": 1},
                      {"material_id": self.salt.id, "quantity": 500, "unit": "g", "stage_index": 0}],
            "byproducts": [{"material_id": self.residue.id, "quantity": 1, "cost_share_percent": 5}],
        }
        res = self.api.post("/api/formulas/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        d = res.json()["data"]
        self.assertEqual([s["name"] for s in d["stages"]], ["توزین", "اختلاط"])
        lines = {l["material"]: l for l in d["lines"]}
        self.assertEqual(lines["نمک"]["line_unit"], "g")
        self.assertEqual(lines["نمک"]["required_for_batch"], 0.5)
        self.assertEqual(lines["آب"]["stage_index"], 1)
        self.assertEqual(d["byproducts"][0]["cost_share_percent"], 5.0)
        self.assertEqual(d["industry"], "detergent")

    # ── دستور تولید با مراحل ──
    def _order(self, f, qty):
        res = self.api.post("/api/production/orders/",
                            {"formula_id": f.id, "planned_quantity": qty}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()["data"]

    def test_steps_follow_sequence(self):
        o = self._order(self.f_prod, 10)
        s1, s2 = o["steps"]
        self.assertEqual(o["planned_minutes"], 11.0)  # (5+10×0.5) + 10×0.1
        url = f"/api/production/orders/{o['id']}/steps"
        self.assertEqual(self.api.post(f"{url}/{s2['id']}/start/").status_code, 400)
        r = self.api.post(f"{url}/{s1['id']}/start/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["data"]["status"], "in_progress")
        r = self.api.post(f"{url}/{s1['id']}/complete/",
                          {"good_quantity": 9, "scrap_quantity": 1, "actual_minutes": 12,
                           "quality_ok": True}, format="json")
        st = r.json()["data"]["steps"][0]
        self.assertEqual((st["status"], st["actual_minutes"], st["scrap_quantity"]), ("done", 12.0, 1.0))
        self.assertEqual(self.api.post(f"{url}/{s2['id']}/skip/").status_code, 200)

    def test_complete_with_byproduct_operations_and_actuals(self):
        o = self._order(self.f_base, 100)
        res = self.api.post(f"/api/production/orders/{o['id']}/complete/", {
            "produced_quantity": 95, "scrap_quantity": 5,
            "consumed": [{"material_id": self.sles.id, "quantity": 16}],
        }, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        d = res.json()["data"]
        level = lambda m: StockItem.all_objects.get(
            business=self.b, warehouse=self.wh, raw_material=m).quantity
        self.assertEqual(level(self.sles), D("14"))      # مصرف واقعی 16 به‌جای 15
        self.assertEqual(level(self.salt), D("8"))       # 2000 گرم
        self.assertEqual(level(self.water), D("920"))
        self.assertEqual(level(self.base), D("95"))
        self.assertEqual(level(self.residue), D("5"))    # محصول جانبی
        # مواد: 80 + 1600 + 20 = 1700 ؛ عملیات: 40 دقیقه × 60/ساعت = 40
        self.assertEqual(d["material_cost"], 1700.0)
        self.assertEqual(d["operation_cost"], 40.0)
        self.assertEqual(d["total_cost"], 1740.0)
        self.assertEqual(d["scrap_quantity"], 5.0)
        # 90٪ بها برای خروجی اصلی: 1566 / 95
        self.assertAlmostEqual(d["unit_cost"], 16.4842, places=3)
        self.residue.refresh_from_db()

    def test_complete_shortage_rolls_back(self):
        o = self._order(self.f_base, 1000)
        res = self.api.post(f"/api/production/orders/{o['id']}/complete/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(StockItem.all_objects.get(
            business=self.b, warehouse=self.wh, raw_material=self.water).quantity, D("1000"))

    # ── تحلیل ──
    def test_analysis_margin_and_bottleneck(self):
        cat = Category.all_objects.create(business=self.b, name="شوینده")
        Food.all_objects.create(business=self.b, category=cat, name="مایع ۱ لیتری",
                                price=100, final_price=100, item=self.product)
        res = self.api.get(f"/api/formulas/{self.f_prod.id}/analysis/")
        self.assertEqual(res.status_code, 200, res.content)
        a = res.json()["data"]
        self.assertEqual(a["selling_price"], 100.0)
        self.assertAlmostEqual(a["unit_cost"], 14.76 + 50 + (5.5 / 60 * 120) + (0.1 / 60 * 60), places=2)
        self.assertAlmostEqual(a["margin"], 100 - a["unit_cost"], places=4)
        self.assertEqual(a["bottleneck"]["name"], "پرکنی")
        self.assertEqual(a["materials"][0]["material"], "بطری")  # بیشترین سهم
        self.assertEqual(a["max_producible"], 120.0)

    def test_tenant_isolation_plan(self):
        u2 = User.objects.create_user(username="detm2", password="Pass12345!",
                                      role="manager", business=self.other)
        api = APIClient()
        api.force_authenticate(u2)
        res = api.post("/api/production/plan/",
                       {"items": [{"formula_id": self.f_prod.id, "quantity": 1}]}, format="json")
        self.assertEqual(res.status_code, 400)


class ParserTests(SimpleTestCase):
    def test_english_line(self):
        r = parse_process("mix 10kg water with 2kg SLES for 15 min in mixer",
                          [(1, "Water", "l"), (2, "SLES", "kg")])
        st = r["stages"][0]
        self.assertEqual(st["name"], "mix")
        self.assertEqual(st["workstation"], "mixer")
        self.assertEqual(st["run_minutes"], D("15.00"))
        comps = {c["name"]: c for c in st["components"]}
        self.assertEqual(comps["water"]["quantity"], D("10"))
        self.assertEqual(comps["water"]["material_id"], 1)
        self.assertEqual(comps["SLES"]["unit"], "kg")

    def test_persian_lines(self):
        r = parse_process("۱۰ کیلو آب و ۲ کیلو SLES را ۱۵ دقیقه در میکسر مخلوط کن\n"
                          "سپس تا ۷۰ درجه گرم کن ۱ ساعت\n۳ عدد تخم‌مرغ و ۲۰۰ گرم آرد را هم بزن",
                          [(5, "آب", "l")])
        s1, s2, s3 = r["stages"]
        self.assertEqual(s1["name"], "مخلوط کن")
        self.assertEqual(s1["workstation"], "میکسر")
        self.assertEqual(s1["components"][0]["material_id"], 5)
        self.assertEqual(s2["run_minutes"], D("60.00"))
        self.assertEqual(s2["components"], [])
        self.assertEqual([(c["name"], c["unit"]) for c in s3["components"]],
                         [("تخم‌مرغ", "unit"), ("آرد", "g")])
