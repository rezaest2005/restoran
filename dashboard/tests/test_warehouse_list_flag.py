from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.inventory_services import get_or_create_mother_warehouse
from bizsuite.models import Business, User, Warehouse
from bizsuite.tenancy import clear_current_business


class WarehouseListSalesFlagTests(TestCase):
    """GET /api/inventory/warehouses/ exposes is_sales_default (Definitions screen)."""

    @classmethod
    def setUpTestData(cls):
        cls.b = Business.objects.create(name="الف", slug="wh-flag")
        cls.u = User.objects.create_user(username="whflag", password="Pass12345!", role="owner", business=cls.b)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.u)

    def test_flag_listed_and_toggled(self):
        get_or_create_mother_warehouse(self.b)
        shop = Warehouse.all_objects.create(business=self.b, name="فروشگاه", warehouse_type="other")
        rows = self.api.get("/api/inventory/warehouses/").json()["warehouses"]
        self.assertTrue(all("is_sales_default" in r for r in rows))
        self.assertFalse(next(r for r in rows if r["id"] == shop.id)["is_sales_default"])
        r = self.api.post(f"/api/catalog/warehouses/{shop.id}/sales-default/", {"value": True}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        rows = self.api.get("/api/inventory/warehouses/").json()["warehouses"]
        self.assertTrue(next(r for r in rows if r["id"] == shop.id)["is_sales_default"])
        self.assertEqual(sum(1 for r in rows if r["is_sales_default"]), 1)
