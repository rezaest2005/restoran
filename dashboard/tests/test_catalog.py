import io
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from bizsuite.inventory_services import get_or_create_mother_warehouse, receive_stock
from bizsuite.models import (
    UNIT_CHOICES, Business, Category, Food, Formula, FormulaLine, RawMaterial, User, Warehouse,
)
from bizsuite.modules import apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

ALL = ["pos", "club", "inventory", "production", "accounting", "delivery", "feedback", "storefront"]


def png_bytes(fmt="PNG", size=(4, 4)):
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 10, 10)).save(buf, fmt)
    return buf.getvalue()


class CatalogBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.b1 = Business.objects.create(name="الف", slug="cat-one")
        cls.b2 = Business.objects.create(name="ب", slug="cat-two")
        cls.u1 = User.objects.create_user(username="cat1", password="Pass12345!", role="owner", business=cls.b1)
        cls.u2 = User.objects.create_user(username="cat2", password="Pass12345!", role="owner", business=cls.b2)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.u1)
        self.api2 = APIClient()
        self.api2.force_authenticate(self.u2)


class CategoryTests(CatalogBase):
    def test_crud_and_delete_refusal(self):
        r = self.api.post("/api/catalog/categories/", {"name": "پیتزا", "name_en": "Pizza", "order": 2}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        cid = r.json()["data"]["id"]
        self.assertEqual(self.api.post("/api/catalog/categories/", {"name": "پیتزا"}, format="json").status_code, 400)
        r = self.api.put(f"/api/catalog/categories/{cid}/", {"name": "پیتزاها"}, format="json")
        self.assertEqual(r.json()["data"]["name"], "پیتزاها")
        self.assertEqual(self.api.get("/api/catalog/categories/").json()["data"][0]["product_count"], 0)
        p = self.api.post("/api/catalog/products/", {"name": "الف", "category_id": cid, "price": 10}, format="json")
        self.assertEqual(p.status_code, 201)
        r = self.api.delete(f"/api/catalog/categories/{cid}/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("محصول", r.json()["error"])
        self.api.delete(f"/api/catalog/products/{p.json()['data']['id']}/")
        self.assertEqual(self.api.delete(f"/api/catalog/categories/{cid}/").status_code, 200)

    def test_tenant_isolation(self):
        c = Category.all_objects.create(business=self.b1, name="x")
        self.assertEqual(self.api2.put(f"/api/catalog/categories/{c.id}/", {"name": "y"}, format="json").status_code, 404)
        self.assertEqual(self.api2.delete(f"/api/catalog/categories/{c.id}/").status_code, 404)
        self.assertEqual(self.api2.get("/api/catalog/categories/").json()["data"], [])


class ProductTests(CatalogBase):
    def setUp(self):
        super().setUp()
        self.cat = Category.all_objects.create(business=self.b1, name="غذا")

    def mk(self, **kw):
        body = {"name": "پیتزا", "category_id": self.cat.id, "price": 100000}
        body.update(kw)
        return self.api.post("/api/catalog/products/", body, format="json")

    def test_create_get_update_delete(self):
        r = self.mk(final_price=90000, barcode="۶۲۹۱۰۴۱۵۰۰۲۱۳", description="d", order=3)
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()["data"]
        self.assertEqual(d["final_price"], 90000)
        self.assertEqual(d["stock"], 0)
        self.assertFalse(d["has_formula"])
        self.assertEqual(d["barcode"], "6291041500213")
        pid = d["id"]
        r = self.api.put(f"/api/catalog/products/{pid}/", {"price": 120000, "is_available": False}, format="json")
        d = r.json()["data"]
        self.assertEqual((d["price"], d["final_price"], d["is_available"]), (120000, 120000, False))
        self.assertEqual(self.api.get(f"/api/catalog/products/{pid}/").status_code, 200)
        self.assertEqual(self.api.delete(f"/api/catalog/products/{pid}/").status_code, 200)
        self.assertEqual(self.api.get(f"/api/catalog/products/{pid}/").status_code, 404)

    def test_validation(self):
        self.assertEqual(self.mk(name="").status_code, 400)
        self.assertEqual(self.mk(price=-1).status_code, 400)
        self.assertEqual(self.mk(category_id=99999).status_code, 400)
        self.assertEqual(self.mk(price=100, final_price=200).status_code, 400)
        self.assertEqual(self.mk().status_code, 201)
        self.assertEqual(self.mk().status_code, 400)  # duplicate name

    def test_filters_and_paging(self):
        other = Category.all_objects.create(business=self.b1, name="دسر")
        for i in range(5):
            self.mk(name=f"محصول{i}")
        self.mk(name="کیک", category_id=other.id, is_available=False)
        r = self.api.get("/api/catalog/products/?page_size=1000").json()
        self.assertEqual(r["total"], 6)
        self.assertEqual(len(self.api.get("/api/catalog/products/?page_size=2").json()["data"]), 2)
        self.assertEqual(self.api.get(f"/api/catalog/products/?category={other.id}").json()["total"], 1)
        self.assertEqual(self.api.get("/api/catalog/products/?active=false").json()["total"], 1)
        self.assertEqual(self.api.get("/api/catalog/products/?q=کیک").json()["total"], 1)
        self.assertEqual(self.api.get("/api/catalog/products/?linked=true").json()["total"], 0)

    def test_tenant_isolation(self):
        pid = self.mk().json()["data"]["id"]
        self.assertEqual(self.api2.get(f"/api/catalog/products/{pid}/").status_code, 404)
        self.assertEqual(self.api2.put(f"/api/catalog/products/{pid}/", {"price": 1}, format="json").status_code, 404)
        self.assertEqual(self.api2.delete(f"/api/catalog/products/{pid}/").status_code, 404)
        self.assertEqual(self.api2.get("/api/catalog/products/").json()["total"], 0)
        r = self.api2.post("/api/catalog/products/", {"name": "z", "category_id": self.cat.id, "price": 1}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_image_upload(self):
        good = SimpleUploadedFile("a.png", png_bytes(), content_type="image/png")
        r = self.api.post("/api/catalog/products/", {"name": "عکس", "category_id": self.cat.id, "price": 5, "image": good},
                          format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        url = r.json()["data"]["image"]
        self.assertTrue(url.endswith(".png"))
        self.assertNotIn("a.png", url)
        gif = SimpleUploadedFile("a.gif", png_bytes("GIF"), content_type="image/gif")
        r = self.api.post("/api/catalog/products/", {"name": "gif", "category_id": self.cat.id, "price": 5, "image": gif},
                          format="multipart")
        self.assertEqual(r.status_code, 400)
        fake = SimpleUploadedFile("a.png", b"not an image", content_type="image/png")
        r = self.api.post("/api/catalog/products/", {"name": "fake", "category_id": self.cat.id, "price": 5, "image": fake},
                          format="multipart")
        self.assertEqual(r.status_code, 400)

    def test_link_item_endpoint_and_stock(self):
        item = RawMaterial.all_objects.create(business=self.b1, name="pz", material_type="finished", unit="piece")
        foreign = RawMaterial.all_objects.create(business=self.b2, name="fx", material_type="finished", unit="piece")
        pid = self.mk().json()["data"]["id"]
        r = self.api.post(f"/api/catalog/products/{pid}/link-item/", {"item_id": foreign.id}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.api.post(f"/api/catalog/products/{pid}/link-item/", {"item_id": item.id}, format="json")
        self.assertEqual(r.json()["data"]["item_id"], item.id)
        receive_stock(self.b1, get_or_create_mother_warehouse(self.b1), item, 7)
        d = self.api.get(f"/api/catalog/products/{pid}/").json()["data"]
        self.assertEqual(d["stock"], 7)
        self.assertEqual(d["item"]["total_stock"], 7)
        Formula.all_objects.create(business=self.b1, name="f", output_material=item, output_quantity=1)
        self.assertTrue(self.api.get(f"/api/catalog/products/{pid}/").json()["data"]["has_formula"])
        self.assertEqual(self.api.get("/api/catalog/products/?linked=true").json()["total"], 1)
        r = self.api.post(f"/api/catalog/products/{pid}/link-item/", {"item_id": None}, format="json")
        self.assertIsNone(r.json()["data"]["item_id"])

    def test_sales_warehouse_stock(self):
        item = RawMaterial.all_objects.create(business=self.b1, name="pz", material_type="finished", unit="piece")
        mother = get_or_create_mother_warehouse(self.b1)
        shop = Warehouse.all_objects.create(business=self.b1, name="فروشگاه")
        receive_stock(self.b1, mother, item, 10)
        receive_stock(self.b1, shop, item, 4)
        pid = self.mk(item_id=item.id).json()["data"]["id"]
        self.assertEqual(self.api.get(f"/api/catalog/products/{pid}/").json()["data"]["stock"], 10)
        r = self.api.post(f"/api/catalog/warehouses/{shop.id}/sales-default/", {"value": True}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.api.get(f"/api/catalog/products/{pid}/").json()["data"]["stock"], 4)


class ItemTests(CatalogBase):
    def mk(self, **kw):
        body = {"name": "آرد", "material_type": "raw", "unit": "kg", "price": 500}
        body.update(kw)
        return self.api.post("/api/catalog/items/", body, format="json")

    def test_crud(self):
        r = self.mk(minimum_stock="2.5", target_stock=10, barcode="ABC-123", name_en="Flour")
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()["data"]
        self.assertEqual((d["minimum_stock"], d["stock"], d["used_in_formulas"], d["has_formula"]), (2.5, 0, 0, False))
        r = self.api.put(f"/api/catalog/items/{d['id']}/", {"price": 700, "material_type": "packaging"}, format="json")
        self.assertEqual(r.json()["data"]["material_type"], "packaging")
        self.assertEqual(self.api.get("/api/catalog/items/?material_type=packaging").json()["total"], 1)
        self.assertEqual(self.api.get("/api/catalog/items/?q=ABC-123").json()["total"], 1)
        self.assertEqual(self.api.delete(f"/api/catalog/items/{d['id']}/").status_code, 200)

    def test_validation_and_units(self):
        self.assertEqual(self.mk(unit="bogus").status_code, 400)
        self.assertEqual(self.mk(material_type="x").status_code, 400)
        self.assertEqual(self.mk(price=-5).status_code, 400)
        self.assertEqual(self.mk(name="").status_code, 400)
        for unit in ("ton", "meter", "m2", "sheet", "pallet"):
            self.assertEqual(self.mk(name=f"n-{unit}", unit=unit).status_code, 201, unit)

    def test_units_extended_keep_old(self):
        keys = {k for k, _ in UNIT_CHOICES}
        for k in ("kg", "g", "l", "ml", "unit", "bunch", "pack"):
            self.assertIn(k, keys)
        for k in ("ton", "meter", "cm", "m2", "m3", "sheet", "roll", "box", "dozen", "piece", "set", "pallet"):
            self.assertIn(k, keys)
        rm = RawMaterial(business=self.b1, name="steel", unit="ton", material_type="raw")
        rm.full_clean(exclude=["label", "business", "barcode"])

    def test_delete_refusals(self):
        wh = get_or_create_mother_warehouse(self.b1)
        stocked = RawMaterial.all_objects.get(pk=self.mk(name="stocked").json()["data"]["id"])
        receive_stock(self.b1, wh, stocked, 3)
        r = self.api.delete(f"/api/catalog/items/{stocked.id}/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("موجودی", r.json()["error"])
        out = RawMaterial.all_objects.get(pk=self.mk(name="out", material_type="finished").json()["data"]["id"])
        inp = RawMaterial.all_objects.get(pk=self.mk(name="inp").json()["data"]["id"])
        f = Formula.all_objects.create(business=self.b1, name="f", output_material=out, output_quantity=1)
        FormulaLine.all_objects.create(business=self.b1, formula=f, material=inp, quantity=Decimal("1"))
        for obj in (out, inp):
            r = self.api.delete(f"/api/catalog/items/{obj.id}/")
            self.assertEqual(r.status_code, 400)
            self.assertIn("فرمول", r.json()["error"])
        d = self.api.get(f"/api/catalog/items/{inp.id}/").json()["data"]
        self.assertEqual(d["used_in_formulas"], 1)
        self.assertTrue(self.api.get(f"/api/catalog/items/{out.id}/").json()["data"]["has_formula"])
        cat = Category.all_objects.create(business=self.b1, name="c")
        free = RawMaterial.all_objects.get(pk=self.mk(name="free").json()["data"]["id"])
        Food.all_objects.create(business=self.b1, category=cat, name="p", price=1, item=free)
        self.assertEqual(self.api.delete(f"/api/catalog/items/{free.id}/").status_code, 400)

    def test_tenant_isolation(self):
        iid = self.mk().json()["data"]["id"]
        self.assertEqual(self.api2.get(f"/api/catalog/items/{iid}/").status_code, 404)
        self.assertEqual(self.api2.put(f"/api/catalog/items/{iid}/", {"price": 1}, format="json").status_code, 404)
        self.assertEqual(self.api2.delete(f"/api/catalog/items/{iid}/").status_code, 404)
        self.assertEqual(self.api2.get("/api/catalog/items/").json()["total"], 0)


class PermissionTests(CatalogBase):
    def test_modules_and_roles(self):
        ensure_catalog()
        anon = APIClient()
        self.assertIn(anon.get("/api/catalog/products/").status_code, (401, 403))
        apply_modules(self.b1, {c: {"is_enabled": c == "accounting"} for c in ALL})
        self.assertEqual(self.api.get("/api/catalog/products/").status_code, 403)
        apply_modules(self.b1, {c: {"is_enabled": c == "inventory"} for c in ALL})
        self.assertEqual(self.api.get("/api/catalog/items/").status_code, 200)
        self.assertEqual(self.api.get("/api/catalog/products/").status_code, 200)
        self.assertEqual(self.api.get("/api/pos/barcode/123456/").status_code, 403)
        apply_modules(self.b1, {c: {"is_enabled": c == "pos"} for c in ALL})
        self.assertEqual(self.api.get("/api/pos/barcode/123456/").status_code, 404)

    def test_role_without_permission(self):
        u = User.objects.create_user(username="kit1", password="Pass12345!", role="kitchen", business=self.b1)
        c = APIClient()
        c.force_authenticate(u)
        self.assertEqual(c.get("/api/catalog/products/").status_code, 403)
