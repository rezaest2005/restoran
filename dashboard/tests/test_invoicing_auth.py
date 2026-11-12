"""احراز هویت و جداسازی کسب‌وکارها در endpointهای فاکتور/مشتری/هزینه + نقش‌ها و تب‌ها."""

from django.test import Client, TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, Customer, Expense, SalesInvoice, Supplier, User
from bizsuite.tenancy import clear_current_business

ROUTES = [
    ("get", "/api/invoicing/customers/"),
    ("get", "/api/invoicing/sales/"),
    ("get", "/api/invoicing/sales-returns/"),
    ("get", "/api/invoicing/purchase-returns/"),
    ("get", "/api/invoicing/expenses/"),
    ("get", "/api/invoicing/profit-report/"),
    ("post", "/api/invoicing/customers/"),
    ("post", "/api/invoicing/expenses/"),
]


class InvoicingAuthTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = Business.objects.create(name="الف", slug="inv-a")
        cls.b = Business.objects.create(name="ب", slug="inv-b")
        cls.ua = User.objects.create_user(username="ua", password="Pass12345!", role="owner", business=cls.a)
        cls.ub = User.objects.create_user(username="ub", password="Pass12345!", role="owner", business=cls.b)
        cls.cashier = User.objects.create_user(
            username="cs", password="Pass12345!", role="cashier", business=cls.a,
            dashboard_permissions=["pos"])
        cls.nobiz = User.objects.create_user(username="nb", password="Pass12345!", role="owner")
        cls.cust_b = Customer.all_objects.create(business=cls.b, name="مشتری ب", phone="0911")

    def setUp(self):
        clear_current_business()

    def test_anonymous_is_rejected_everywhere(self):
        c = APIClient()
        for method, path in ROUTES:
            with self.subTest(path=path, method=method):
                r = getattr(c, method)(path, {}, format="json")
                self.assertIn(r.status_code, (401, 403), r.content[:100])

    def test_owner_crud_and_isolation(self):
        c = APIClient()
        c.force_authenticate(self.ua)
        created = c.post("/api/invoicing/customers/", {"name": "مشتری الف", "phone": "0912"}, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        names = [x["name"] for x in c.get("/api/invoicing/customers/").json()["results"]]
        self.assertEqual(names, ["مشتری الف"])                      # مشتری ب دیده نمی‌شود
        # دسترسی مستقیم به رکورد کسب‌وکار دیگر
        r = c.get(f"/api/invoicing/customers/{self.cust_b.pk}/")
        self.assertEqual(r.status_code, 404)
        r = c.delete(f"/api/invoicing/customers/{self.cust_b.pk}/")
        self.assertEqual(r.status_code, 404)
        self.assertTrue(Customer.all_objects.filter(pk=self.cust_b.pk).exists())

    def test_expense_posts_and_other_business_cannot_delete(self):
        c = APIClient()
        c.force_authenticate(self.ua)
        r = c.post("/api/invoicing/expenses/", {"title": "برق", "amount": 500, "category": "قبوض"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        eid = r.json()["id"]
        other = APIClient()
        other.force_authenticate(self.ub)
        other.delete(f"/api/invoicing/expenses/{eid}/")
        self.assertTrue(Expense.all_objects.filter(pk=eid).exists())
        c.delete(f"/api/invoicing/expenses/{eid}/")
        self.assertFalse(Expense.all_objects.filter(pk=eid).exists())

    def test_sales_invoice_isolated(self):
        inv_b = SalesInvoice.all_objects.create(business=self.b, total=10, paid_amount=10, payment_method="cash")
        c = APIClient()
        c.force_authenticate(self.ua)
        self.assertEqual(c.get(f"/api/invoicing/sales/{inv_b.pk}/").status_code, 404)
        self.assertEqual(c.get("/api/invoicing/sales/").json()["results"] if "results" in c.get("/api/invoicing/sales/").json() else [], [])

    def test_cashier_without_finance_tab_is_forbidden(self):
        c = APIClient()
        c.force_authenticate(self.cashier)
        self.assertEqual(c.get("/api/invoicing/profit-report/").status_code, 403)
        self.assertEqual(c.get("/api/invoicing/expenses/").status_code, 403)

    def test_user_without_business_gets_400_not_500(self):
        c = APIClient()
        c.force_authenticate(self.nobiz)
        r = c.get("/api/invoicing/customers/")
        self.assertIn(r.status_code, (400, 403))
        r = c.post("/api/invoicing/customers/", {"name": "x"}, format="json")
        self.assertIn(r.status_code, (400, 403))


class RolesAndTabsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.biz = Business.objects.create(name="نقش", slug="role-biz")
        cls.owner = User.objects.create_user(username="ro", password="Pass12345!", role="owner", business=cls.biz)

    def setUp(self):
        clear_current_business()

    def test_warehouse_and_driver_roles_are_valid(self):
        from bizsuite.roles import ROLE_CHOICES
        codes = {r[0] for r in ROLE_CHOICES}
        self.assertIn("warehouse", codes)
        self.assertIn("driver", codes)

    def test_tab_keys_include_kitchen_and_recipes(self):
        from bizsuite.views.users.tabs import ALL_TAB_KEYS
        for k in ("kitchen", "recipes", "accounting", "delivery_dispatch", "club"):
            self.assertIn(k, ALL_TAB_KEYS)

    def test_supplier_save_keeps_description(self):
        c = APIClient()
        c.force_authenticate(self.owner)
        r = c.post("/api/suppliers/save/", {"name": "تامین", "phone": "0912", "description": "مهم"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        sid = r.json()["id"]
        c.post("/api/suppliers/save/", {"id": sid, "name": "تامین", "phone": "0913"}, format="json")
        self.assertEqual(Supplier.all_objects.get(pk=sid).description, "مهم")


class CustomerDebtTests(TestCase):
    def setUp(self):
        clear_current_business()
        self.biz = Business.objects.create(name="بدهی", slug="debt-biz")

    def test_total_debt_formula(self):
        from decimal import Decimal
        from bizsuite.models import SalesReturn
        cust = Customer.all_objects.create(business=self.biz, name="مشتری", opening_balance=1000)
        # نسیه‌ی کامل 500؛ پرداخت نقدی کامل 300 (بدهی نمی‌سازد)؛ نسیه‌ی نیمه‌پرداخت 400 با 100 پرداختی
        credit = SalesInvoice.all_objects.create(business=self.biz, customer=cust, total=500, paid_amount=0, payment_method="credit")
        SalesInvoice.all_objects.create(business=self.biz, customer=cust, total=300, paid_amount=300, payment_method="cash")
        SalesInvoice.all_objects.create(business=self.biz, customer=cust, total=400, paid_amount=100, payment_method="credit")
        # مانده‌ی فاکتورها: (500-0) + (300-300) + (400-100) = 800 ؛ بدهی = 1000 + 800
        self.assertEqual(cust.total_debt, Decimal("1800"))
        SalesReturn.all_objects.create(business=self.biz, invoice=credit, item_name="x", amount=200)
        self.assertEqual(cust.total_debt, Decimal("1600"))   # مرجوعی 200 از فاکتور نسیه
