import threading
from decimal import Decimal

from django.db import connection
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from bizsuite.catalog_services import get_sales_warehouse
from bizsuite.inventory_services import get_or_create_mother_warehouse, receive_stock
from bizsuite.models import (
    Business, Category, Food, Formula, FormulaLine, InventoryMovement, Order, RawMaterial, StockItem,
    User, Warehouse,
)
from bizsuite.order_services import StockError, release_product_stock, reserve_product_stock
from bizsuite.tenancy import clear_current_business


def qty(biz, item, wh=None):
    wh = wh or get_or_create_mother_warehouse(biz)
    row = StockItem.all_objects.filter(business=biz, warehouse=wh, raw_material=item).first()
    return row.quantity if row else Decimal("0")


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.b = Business.objects.create(name="الف", slug="sl-one")
        cls.o = Business.objects.create(name="ب", slug="sl-two")
        cls.user = User.objects.create_user(username="sl1", password="Pass12345!", role="owner", business=cls.b)
        cls.cat = Category.all_objects.create(business=cls.b, name="c")
        cls.wh = get_or_create_mother_warehouse(cls.b)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def item(self, name, kind="finished", unit="piece"):
        return RawMaterial.all_objects.create(business=self.b, name=name, material_type=kind, unit=unit, price=10)

    def food(self, name, item=None, stock=0, price=1000):
        return Food.all_objects.create(business=self.b, category=self.cat, name=name, price=price,
                                       item=item, stock=stock)

    def sell(self, food, n, **kw):
        body = {"items": [{"food_id": food.id, "quantity": n}], "source": "pos"}
        body.update(kw)
        return self.api.post("/api/pos/create-order/", body, format="json").json()


class SalesWarehouseTests(Base):
    def test_default_is_mother_then_flagged(self):
        self.assertEqual(get_sales_warehouse(self.b).pk, self.wh.pk)
        shop = Warehouse.all_objects.create(business=self.b, name="شعبه", is_sales_default=True)
        self.assertEqual(get_sales_warehouse(self.b).pk, shop.pk)
        shop2 = Warehouse.all_objects.create(business=self.b, name="شعبه۲", is_sales_default=True)
        shop.refresh_from_db()
        self.assertFalse(shop.is_sales_default)  # only one default
        self.assertEqual(get_sales_warehouse(self.b).pk, shop2.pk)


class LinkedSaleTests(Base):
    def test_linked_sale_deducts_item_stock(self):
        it = self.item("pz")
        f = self.food("پیتزا", item=it, stock=0)
        receive_stock(self.b, self.wh, it, 10)
        res = self.sell(f, 3)
        self.assertTrue(res["success"], res)
        self.assertEqual(qty(self.b, it), 7)
        it.refresh_from_db()
        self.assertEqual(it.quantity, 7)
        f.refresh_from_db()
        self.assertEqual(f.stock, 0)  # legacy counter untouched
        mv = InventoryMovement.all_objects.filter(raw_material=it, movement_type="out").get()
        self.assertEqual((mv.quantity, mv.reference_type, mv.reference_id), (3, "pos_order", res["order_id"]))
        self.assertIn("sale", mv.notes)

    def test_linked_oversell_refused_and_atomic(self):
        it = self.item("pz")
        f = self.food("پیتزا", item=it)
        other = self.food("دیگر", stock=5)
        receive_stock(self.b, self.wh, it, 2)
        res = self.api.post("/api/pos/create-order/", {"items": [
            {"food_id": other.id, "quantity": 1}, {"food_id": f.id, "quantity": 3}], "source": "pos"}, format="json").json()
        self.assertFalse(res["success"])
        self.assertEqual(qty(self.b, it), 2)
        other.refresh_from_db()
        self.assertEqual(other.stock, 5)
        self.assertEqual(Order.all_objects.filter(business=self.b).count(), 0)

    def test_stock_never_negative_sequential(self):
        it = self.item("pz")
        f = self.food("پیتزا", item=it)
        receive_stock(self.b, self.wh, it, 3)
        results = [self.sell(f, 1)["success"] for _ in range(5)]
        self.assertEqual(results, [True, True, True, False, False])
        self.assertEqual(qty(self.b, it), 0)

    def test_service_level_guard_even_without_precheck(self):
        it = self.item("pz")
        f = self.food("پیتزا", item=it)
        receive_stock(self.b, self.wh, it, 1)
        with self.assertRaises(StockError):
            reserve_product_stock([(f, 2)])
        reserve_product_stock([(f, 1)])
        with self.assertRaises(StockError):
            reserve_product_stock([(f, 1)])
        self.assertEqual(qty(self.b, it), 0)

    def test_uses_flagged_sales_warehouse(self):
        it = self.item("pz")
        shop = Warehouse.all_objects.create(business=self.b, name="شعبه", is_sales_default=True)
        f = self.food("پیتزا", item=it)
        receive_stock(self.b, self.wh, it, 10)
        receive_stock(self.b, shop, it, 2)
        self.assertFalse(self.sell(f, 5)["success"])
        self.assertTrue(self.sell(f, 2)["success"])
        self.assertEqual(qty(self.b, it, shop), 0)
        self.assertEqual(qty(self.b, it, self.wh), 10)

    def test_cancel_restores_with_receive_movement(self):
        it = self.item("pz")
        f = self.food("پیتزا", item=it)
        receive_stock(self.b, self.wh, it, 10)
        oid = self.sell(f, 4)["order_id"]
        self.assertEqual(qty(self.b, it), 6)
        r = self.api.post(f"/api/orders/{oid}/status/", {"status": "cancelled"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(qty(self.b, it), 10)
        back = InventoryMovement.all_objects.get(raw_material=it, reference_type="pos_order_cancel")
        self.assertEqual((back.movement_type, back.quantity, back.notes), ("in", 4, "order cancel"))
        # idempotent
        release_product_stock(Order.all_objects.get(pk=oid))
        self.assertEqual(qty(self.b, it), 10)

    def test_reject_online_order_restores(self):
        it = self.item("pz")
        f = self.food("پیتزا", item=it)
        receive_stock(self.b, self.wh, it, 5)
        oid = self.sell(f, 2, source="online")["order_id"]
        self.assertEqual(qty(self.b, it), 3)
        r = self.api.post(f"/api/pos/online-orders/{oid}/reject/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(qty(self.b, it), 5)

    def test_unlinked_keeps_old_behaviour(self):
        f = self.food("ساده", stock=5)
        self.assertTrue(self.sell(f, 2)["success"])
        f.refresh_from_db()
        self.assertEqual(f.stock, 3)
        self.assertFalse(self.sell(f, 4)["success"])
        f.refresh_from_db()
        self.assertEqual(f.stock, 3)
        self.assertEqual(InventoryMovement.all_objects.filter(business=self.b).count(), 0)
        oid = Order.all_objects.filter(business=self.b).first().id
        self.api.post(f"/api/orders/{oid}/status/", {"status": "cancelled"}, format="json")
        f.refresh_from_db()
        self.assertEqual(f.stock, 5)

    def test_unlinking_after_sale_still_returns_to_item(self):
        it = self.item("pz")
        f = self.food("پیتزا", item=it)
        receive_stock(self.b, self.wh, it, 5)
        oid = self.sell(f, 2)["order_id"]
        # product unlinked then order cancelled: legacy counter, not the item (documented edge)
        f.item = None
        f.save()
        release_product_stock(Order.all_objects.get(pk=oid))
        self.assertEqual(qty(self.b, it), 3)

    def test_qr_order_uses_linked_stock(self):
        it = self.item("pz")
        f = self.food("پیتزا", item=it)
        receive_stock(self.b, self.wh, it, 3)
        anon = APIClient()
        body = {"business_slug": "sl-one", "table": "1", "customer_name": "x",
                "items": [{"food_id": f.id, "quantity": 2}]}
        r = anon.post("/api/menu/order/", body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(qty(self.b, it), 1)
        r = anon.post("/api/menu/order/", body, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(qty(self.b, it), 1)
        oid = r_id = Order.all_objects.filter(business=self.b).first().id
        self.assertTrue(oid == r_id)
        self.api.post(f"/api/pos/online-orders/{oid}/reject/", {}, format="json")
        self.assertEqual(qty(self.b, it), 3)


class ProductionToSaleTests(Base):
    def test_multi_level_scenario(self):
        flour, water, chicken = (self.item("flour", "raw", "kg"), self.item("water", "raw", "l"),
                                 self.item("chicken", "raw", "kg"))
        dough = self.item("dough", "semi_finished", "kg")
        pizza = self.item("pizza", "finished")
        f1 = Formula.all_objects.create(business=self.b, name="dough", output_material=dough, output_quantity=Decimal("1"))
        FormulaLine.all_objects.create(business=self.b, formula=f1, material=flour, quantity=Decimal("2"))
        FormulaLine.all_objects.create(business=self.b, formula=f1, material=water, quantity=Decimal("1"))
        f2 = Formula.all_objects.create(business=self.b, name="pizza", output_material=pizza, output_quantity=Decimal("1"))
        FormulaLine.all_objects.create(business=self.b, formula=f2, material=dough, quantity=Decimal("1"))
        FormulaLine.all_objects.create(business=self.b, formula=f2, material=chicken, quantity=Decimal("1"))
        receive_stock(self.b, self.wh, flour, 100)
        receive_stock(self.b, self.wh, water, 100)
        receive_stock(self.b, self.wh, chicken, 10)

        def produce(formula, n):
            r = self.api.post("/api/production/orders/", {"formula_id": formula.id, "planned_quantity": n}, format="json")
            self.assertEqual(r.status_code, 201, r.content)
            oid = r.json()["data"]["id"]
            r = self.api.post(f"/api/production/orders/{oid}/complete/", {}, format="json")
            self.assertEqual(r.status_code, 200, r.content)

        produce(f1, 10)
        self.assertEqual(qty(self.b, dough), 10)
        # product linked to the finished item through the catalog API
        r = self.api.post("/api/catalog/products/", {"name": "Pizza", "category_id": self.cat.id, "price": 50000,
                                                     "item_id": pizza.id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        pid = r.json()["data"]["id"]
        self.assertEqual(r.json()["data"]["stock"], 0)
        self.assertTrue(r.json()["data"]["has_formula"])
        produce(f2, 5)
        self.assertEqual(qty(self.b, dough), 5)
        self.assertEqual(self.api.get(f"/api/catalog/products/{pid}/").json()["data"]["stock"], 5)
        res = self.api.post("/api/pos/create-order/", {"items": [{"food_id": pid, "quantity": 2}], "source": "pos"},
                            format="json").json()
        self.assertTrue(res["success"], res)
        self.assertEqual(self.api.get(f"/api/catalog/products/{pid}/").json()["data"]["stock"], 3)
        r = self.api.post(f"/api/orders/{res['order_id']}/status/", {"status": "cancelled"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.api.get(f"/api/catalog/products/{pid}/").json()["data"]["stock"], 5)


class OversellConcurrencyTests(TransactionTestCase):
    def test_two_terminals_last_unit(self):
        b = Business.objects.create(name="ت", slug="sl-conc")
        user = User.objects.create_user(username="slc", password="Pass12345!", role="owner", business=b)
        cat = Category.all_objects.create(business=b, name="c")
        wh = get_or_create_mother_warehouse(b)
        it = RawMaterial.all_objects.create(business=b, name="pz", material_type="finished", unit="piece")
        f = Food.all_objects.create(business=b, category=cat, name="p", price=100, item=it)
        receive_stock(b, wh, it, 1)
        outcomes, errs = [], []
        barrier = threading.Barrier(4)

        def terminal():
            try:
                clear_current_business()
                api = APIClient()
                api.force_authenticate(user)
                barrier.wait(timeout=10)
                res = api.post("/api/pos/create-order/", {"items": [{"food_id": f.id, "quantity": 1}], "source": "pos"},
                               format="json").json()
                outcomes.append(res["success"])
            except Exception as exc:
                errs.append(exc)
            finally:
                connection.close()

        threads = [threading.Thread(target=terminal) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errs, [])
        self.assertEqual(sorted(outcomes), [False, False, False, True])
        self.assertEqual(StockItem.all_objects.get(business=b, warehouse=wh, raw_material=it).quantity, 0)
        self.assertEqual(Order.all_objects.filter(business=b).count(), 1)
