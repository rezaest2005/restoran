import threading

from django.db import connection
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from bizsuite import catalog_services as svc
from bizsuite.models import BarcodeSequence, Business, Category, Food, RawMaterial, User
from bizsuite.tenancy import clear_current_business


def valid_ean13(code):
    return len(code) == 13 and code.isdigit() and svc.check_digit(code[:12]) == code[12]


class BarcodeUnitTests(TestCase):
    def test_normalize(self):
        self.assertEqual(svc.normalize_barcode("  ۶۲۹۱۰۴۱۵۰۰۲۱۳ "), "6291041500213")
        self.assertEqual(svc.normalize_barcode("٦٢٩١٠٤١٥٠٠٢١٣"), "6291041500213")
        self.assertEqual(svc.normalize_barcode(None), "")

    def test_validate(self):
        self.assertEqual(svc.validate_barcode("6291041500213"), "6291041500213")   # EAN-13
        self.assertEqual(svc.validate_barcode("96385074"), "96385074")             # EAN-8
        self.assertEqual(svc.validate_barcode("036000291452"), "036000291452")     # UPC-A
        self.assertEqual(svc.validate_barcode("AB-12_x.9"), "AB-12_x.9")
        self.assertEqual(svc.validate_barcode("12345"), "12345")                   # custom numeric
        for bad in ("6291041500214", "96385075", "036000291453", "ab", "a b c d", "x" * 65, "", "کد۱۲۳۴"):
            with self.assertRaises(ValueError, msg=bad):
                svc.validate_barcode(bad)

    def test_format(self):
        self.assertEqual(svc.barcode_format("6291041500213"), "ean13")
        self.assertEqual(svc.barcode_format("ABC-1"), "code128")
        self.assertEqual(svc.barcode_format("036000291452"), "code128")


class BarcodeGenTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.b1 = Business.objects.create(name="الف", slug="bc-one")
        cls.b2 = Business.objects.create(name="ب", slug="bc-two")
        cls.u1 = User.objects.create_user(username="bc1", password="Pass12345!", role="owner", business=cls.b1)
        cls.cat = Category.all_objects.create(business=cls.b1, name="c")

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.u1)

    def food(self, name, **kw):
        kw.setdefault("price", 1)
        return Food.all_objects.create(business=self.b1, category=self.cat, name=name, **kw)

    def item(self, name, **kw):
        return RawMaterial.all_objects.create(business=self.b1, name=name, unit="kg", **kw)

    def test_generate_valid_unique_across_models(self):
        foods = [self.food(f"f{i}") for i in range(30)]
        items = [self.item(f"i{i}") for i in range(30)]
        a = svc.generate_barcodes(self.b1, "product")
        b = svc.generate_barcodes(self.b1, "item")
        codes = a["codes"] + b["codes"]
        self.assertEqual(len(codes), 60)
        self.assertEqual(len(set(codes)), 60)
        for c in codes:
            self.assertTrue(valid_ean13(c), c)
            self.assertTrue(c.startswith("2"))
        for f in foods:
            f.refresh_from_db()
            self.assertIn(f.barcode, codes)
        for i in items:
            i.refresh_from_db()
            self.assertIn(i.barcode, codes)

    def test_only_missing(self):
        f1 = self.food("a", barcode="KEEP-1")
        f2 = self.food("b")
        res = svc.generate_barcodes(self.b1, "product")
        self.assertEqual([x["id"] for x in res["assigned"]], [f2.id])
        f1.refresh_from_db()
        self.assertEqual(f1.barcode, "KEEP-1")
        old = Food.all_objects.get(pk=f2.id).barcode
        svc.generate_barcodes(self.b1, "product", ids=[f1.id, f2.id], only_missing=False)
        f1.refresh_from_db()
        f2.refresh_from_db()
        self.assertTrue(valid_ean13(f1.barcode))
        self.assertNotEqual(f2.barcode, old)

    def test_reserve_count_never_reused(self):
        first = svc.generate_barcodes(self.b1, "product", count=5)["codes"]
        second = svc.generate_barcodes(self.b1, "item", count=5)["codes"]
        self.assertEqual(len(set(first + second)), 10)
        f = self.food("x")
        svc.generate_barcodes(self.b1, "product", ids=[f.id])
        f.refresh_from_db()
        self.assertNotIn(f.barcode, first + second)
        self.assertEqual(BarcodeSequence.all_objects.get(business=self.b1).next_value, 12)

    def test_skips_taken_codes_and_per_business_sequence(self):
        taken = svc._make_ean13(1)
        self.food("taken", barcode=taken)
        codes = svc.generate_barcodes(self.b1, "product", count=3)["codes"]
        self.assertNotIn(taken, codes)
        self.assertEqual(len(codes), 3)
        other = svc.generate_barcodes(self.b2, "product", count=1)["codes"][0]
        self.assertEqual(other, taken)  # independent counter per business

    def test_cap(self):
        with self.assertRaises(ValueError):
            svc.generate_barcodes(self.b1, "product", count=20001)
        with self.assertRaises(ValueError):
            svc.generate_barcodes(self.b1, "product", count=0)
        with self.assertRaises(ValueError):
            svc.generate_barcodes(self.b1, "bogus", count=1)
        self.assertEqual(len(svc.generate_barcodes(self.b1, "product", count=20000)["codes"]), 20000)

    def test_api_generate_and_labels(self):
        f = self.food("پیتزا", final_price=90, price=100)
        self.food("بی‌کد")
        r = self.api.post("/api/catalog/barcodes/generate/", {"target": "product", "ids": [f.id]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        code = r.json()["data"]["codes"][0]
        r = self.api.get(f"/api/catalog/barcodes/labels/?target=product&ids={f.id},999&copies=3")
        rows = r.json()["data"]
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0], {"id": f.id, "name": "پیتزا", "price": 90, "barcode": code, "format": "ean13"})
        r = self.api.get("/api/catalog/barcodes/labels/?target=product")
        self.assertEqual(len(r.json()["data"]), 1)
        self.assertEqual(len(r.json()["missing"]), 1)
        g = self.food("custom", barcode="XY-77")
        r = self.api.get(f"/api/catalog/barcodes/labels/?target=product&ids={g.id}")
        self.assertEqual(r.json()["data"][0]["format"], "code128")
        r = self.api.post("/api/catalog/barcodes/generate/", {"target": "item", "count": 20001}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.api.post("/api/catalog/barcodes/generate/", {"target": "item", "count": 4}, format="json")
        self.assertEqual(len(r.json()["data"]["codes"]), 4)

    def test_uniqueness_across_product_and_item_api(self):
        self.api.post("/api/catalog/items/", {"name": "i", "unit": "kg", "barcode": "SHARED-1"}, format="json")
        r = self.api.post("/api/catalog/products/",
                          {"name": "p", "category_id": self.cat.id, "price": 1, "barcode": "shared-1"}, format="json")
        self.assertEqual(r.status_code, 201)  # case differs: distinct code
        r = self.api.post("/api/catalog/products/",
                          {"name": "p2", "category_id": self.cat.id, "price": 1, "barcode": "SHARED-1"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("بارکد", r.json()["error"])
        r = self.api.post("/api/catalog/items/", {"name": "i2", "unit": "kg", "barcode": "shared-1"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.api.post("/api/catalog/items/", {"name": "i3", "unit": "kg", "barcode": "6291041500214"}, format="json")
        self.assertEqual(r.status_code, 400)  # bad checksum

    def test_other_business_same_barcode_ok(self):
        c2 = Category.all_objects.create(business=self.b2, name="c")
        Food.all_objects.create(business=self.b2, category=c2, name="z", price=1, barcode="SAME-1")
        self.food("y", barcode="SAME-1")

    def test_pos_lookup(self):
        item = self.item("pz", material_type="finished")
        f = self.food("پیتزا", barcode="6291041500213", item=item)
        r = self.api.get("/api/pos/barcode/۶۲۹۱۰۴۱۵۰۰۲۱۳/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["data"]["id"], f.id)
        self.assertEqual(r.json()["data"]["matched"], "product")
        item.barcode = "ITEM-9"
        item.save()
        r = self.api.get("/api/pos/barcode/ITEM-9/")
        self.assertEqual(r.json()["data"]["id"], f.id)
        self.assertEqual(r.json()["data"]["matched"], "item")
        self.assertEqual(self.api.get("/api/pos/barcode/NOPE-1/").status_code, 404)
        lone = self.item("lone", barcode="LONE-1")
        self.assertEqual(self.api.get(f"/api/pos/barcode/{lone.barcode}/").status_code, 404)
        u2 = User.objects.create_user(username="bc2", password="Pass12345!", role="owner", business=self.b2)
        api2 = APIClient()
        api2.force_authenticate(u2)
        self.assertEqual(api2.get("/api/pos/barcode/6291041500213/").status_code, 404)


class BarcodeConcurrencyTests(TransactionTestCase):
    def test_threads_get_distinct_codes(self):
        b = Business.objects.create(name="ج", slug="bc-thr")
        out, errs = [], []

        def work():
            try:
                out.extend(svc.generate_barcodes(b, "item", count=25)["codes"])
            except Exception as exc:
                errs.append(exc)
            finally:
                connection.close()

        ts = [threading.Thread(target=work) for _ in range(4)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        self.assertEqual(errs, [])
        self.assertEqual(len(out), 100)
        self.assertEqual(len(set(out)), 100)
