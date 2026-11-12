"""حسابداری خودکار: هزینه‌های ثابت ماهانه، دریافت/پرداخت، دسته‌بندی هزینه‌ها و صفحه‌ی خلاصه."""

import datetime
from decimal import Decimal as D

from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.accounting_autopilot import customer_debts, run_recurring, supplier_balance
from bizsuite.accounting_posting import post_purchase_invoice, post_sales_invoice
from bizsuite.accounting_services import expense_account, normalize_category, trial_balance
from bizsuite.models import (
    Business, Customer, Expense, JournalEntry, PurchaseInvoice, PurchaseInvoiceItem, RecurringExpense,
    SalesInvoice, Supplier, User,
)
from bizsuite.modules import CATALOG, apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

d = datetime.date


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="الف", slug="ap-one")
        cls.o = Business.objects.create(name="ب", slug="ap-two")
        cls.owner = User.objects.create_user(username="ap1", password="Pass12345!", role="owner", business=cls.b)
        cls.other = User.objects.create_user(username="ap2", password="Pass12345!", role="owner", business=cls.o)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def bal(self, code, biz=None):
        return {r["code"]: r for r in trial_balance(biz or self.b)["rows"]}.get(code)

    def api_post(self, path, body, client=None):
        return (client or self.api).post(path, body, format="json")


class CategoryTests(Base):
    def test_free_text_maps_to_the_right_expense_account(self):
        self.assertEqual(normalize_category("rent"), "rent")
        self.assertEqual(expense_account("اجاره مغازه"), "5320")
        self.assertEqual(expense_account("حقوق آقای رضایی"), "5310")
        self.assertEqual(expense_account("قبض برق"), "5330")
        self.assertEqual(expense_account("بنزین ون"), "5220")
        self.assertEqual(expense_account("چیز عجیب"), "5390")

    def test_expense_api_posts_to_category_account_and_chosen_money_account(self):
        r = self.api_post("/api/accounting/expenses/", {"category": "payroll", "title": "حقوق علی",
                                                        "amount": "5000000", "payment_method": "bank"})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self.bal("5310")["balance_debit"], D("5000000"))
        self.assertEqual(self.bal("1120")["balance_credit"], D("5000000"))      # bank
        self.assertTrue(trial_balance(self.b)["balanced"])

    def test_bad_amounts_and_methods_are_refused(self):
        for body in ({"amount": "-5"}, {"amount": "0"}, {"amount": "abc"}, {"amount": "10", "payment_method": "crypto"}):
            self.assertEqual(self.api_post("/api/accounting/expenses/", {"category": "rent", **body}).status_code, 400, body)


class RecurringTests(Base):
    def make(self, **kw):
        return RecurringExpense.all_objects.create(
            business=self.b, title="اجاره", category="rent", amount=D("12000000"), day_of_month=5,
            payment_method="bank", start_date=d(2026, 1, 1), **kw)

    def test_catches_up_every_due_month_exactly_once(self):
        self.make()
        self.assertEqual(run_recurring(self.b, d(2026, 3, 10)), 3)             # Jan, Feb, Mar
        self.assertEqual(run_recurring(self.b, d(2026, 3, 20)), 0)             # again: nothing new
        self.assertEqual(Expense.all_objects.filter(business=self.b).count(), 3)
        self.assertEqual(self.bal("5320")["balance_debit"], D("36000000"))
        self.assertEqual(JournalEntry.all_objects.filter(business=self.b, source_type="expense").count(), 3)
        self.assertTrue(trial_balance(self.b)["balanced"])

    def test_current_month_waits_for_its_day(self):
        self.make()
        self.assertEqual(run_recurring(self.b, d(2026, 3, 3)), 2)              # Jan, Feb only
        self.assertEqual(run_recurring(self.b, d(2026, 3, 5)), 1)              # March on the 5th

    def test_paused_template_posts_nothing(self):
        self.make(is_active=False)
        self.assertEqual(run_recurring(self.b, d(2026, 6, 1)), 0)

    def test_api_creates_and_posts_immediately_and_validates(self):
        today = datetime.date.today()
        r = self.api_post("/api/accounting/recurring/", {
            "title": "حقوق رضا", "category": "payroll", "amount": 9000000, "day_of_month": 1,
            "start_date": today.replace(day=1).isoformat()})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertGreaterEqual(Expense.all_objects.filter(business=self.b).count(), 1)
        for bad in ({"day_of_month": 31}, {"day_of_month": 0}, {"amount": -1}, {"title": ""}):
            body = {"title": "x", "category": "rent", "amount": 5, **bad}
            self.assertEqual(self.api_post("/api/accounting/recurring/", body).status_code, 400, bad)

    def test_deleting_template_keeps_past_months(self):
        rec = self.make()
        run_recurring(self.b, d(2026, 2, 10))
        self.assertEqual(self.api.delete(f"/api/accounting/recurring/{rec.id}/").status_code, 200)
        self.assertEqual(Expense.all_objects.filter(business=self.b).count(), 2)
        self.assertEqual(run_recurring(self.b, d(2026, 6, 1)), 0)


class PaymentTests(Base):
    def credit_sale(self, customer, total=1000000):
        inv = SalesInvoice.all_objects.create(
            business=self.b, customer=customer, customer_name=customer.name, total=total, paid_amount=0,
            payment_method="credit", date=d(2026, 1, 10), invoice_number="F1")
        post_sales_invoice(inv)
        return inv

    def purchase(self, supplier, **kw):
        inv = PurchaseInvoice.all_objects.create(business=self.b, supplier=supplier, supplier_name=supplier.name,
                                                 date=d(2026, 1, 12), **kw)
        PurchaseInvoiceItem.all_objects.create(business=self.b, invoice=inv, item_name="آرد", quantity=10, unit_price=50000)
        post_purchase_invoice(inv)
        return inv

    def test_receipt_clears_customer_debt_and_receivable(self):
        c = Customer.all_objects.create(business=self.b, name="مشتری یک")
        self.credit_sale(c)
        self.assertEqual(c.total_debt, D("1000000"))
        self.assertEqual(self.bal("1130")["balance_debit"], D("1000000"))
        r = self.api_post("/api/accounting/payments/", {"kind": "in", "customer_id": c.id, "amount": 400000, "method": "cash"})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(c.total_debt, D("600000"))
        self.assertEqual(self.bal("1130")["balance_debit"], D("600000"))
        self.assertEqual(self.bal("1110")["balance_debit"], D("400000"))
        self.assertEqual(customer_debts(self.b)[0]["amount"], D("600000"))
        self.assertTrue(trial_balance(self.b)["balanced"])

    def test_payout_settles_supplier_balance(self):
        s = Supplier.all_objects.create(business=self.b, name="تأمین یک")
        self.purchase(s)                                             # 500,000 on credit
        self.assertEqual(supplier_balance(s), D("500000"))
        self.assertEqual(self.bal("2110")["balance_credit"], D("500000"))
        r = self.api_post("/api/accounting/payments/", {"kind": "out", "supplier_id": s.id, "amount": 200000, "method": "bank"})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(supplier_balance(s), D("300000"))
        self.assertEqual(self.bal("2110")["balance_credit"], D("300000"))
        self.assertEqual(self.bal("1120")["balance_credit"], D("200000"))
        self.assertTrue(trial_balance(self.b)["balanced"])

    def test_cash_purchase_does_not_leave_a_payable(self):
        s = Supplier.all_objects.create(business=self.b, name="تأمین دو")
        self.purchase(s, payment_method="cash", paid_amount=D("500000"))
        self.assertIsNone(self.bal("2110"))
        self.assertEqual(self.bal("1110")["balance_credit"], D("500000"))
        self.assertEqual(supplier_balance(s), D("0"))

    def test_partly_paid_purchase_splits_between_bank_and_payable(self):
        s = Supplier.all_objects.create(business=self.b, name="تأمین سه")
        self.purchase(s, payment_method="bank", paid_amount=D("200000"))
        self.assertEqual(self.bal("1120")["balance_credit"], D("200000"))
        self.assertEqual(self.bal("2110")["balance_credit"], D("300000"))
        self.assertEqual(supplier_balance(s), D("300000"))

    def test_payment_needs_a_party_and_delete_reverses_the_entry(self):
        c = Customer.all_objects.create(business=self.b, name="مشتری دو")
        self.assertEqual(self.api_post("/api/accounting/payments/", {"kind": "in", "amount": 5}).status_code, 400)
        self.assertEqual(self.api_post("/api/accounting/payments/", {"kind": "out", "amount": 5, "customer_id": c.id}).status_code, 400)
        pid = self.api_post("/api/accounting/payments/", {"kind": "in", "customer_id": c.id, "amount": 70000}).json()["data"]["id"]
        self.assertEqual(self.bal("1110")["balance_debit"], D("70000"))
        self.assertEqual(self.api.delete(f"/api/accounting/payments/{pid}/").status_code, 200)
        self.assertEqual(self.bal("1110")["balance_debit"], D("0"))
        self.assertTrue(trial_balance(self.b)["balanced"])


class OverviewAndAccessTests(Base):
    def test_overview_groups_everything_into_sections(self):
        self.api_post("/api/accounting/expenses/", {"category": "rent", "amount": 3000000, "payment_method": "bank"})
        self.api_post("/api/accounting/expenses/", {"category": "utilities", "amount": 500000})
        data = self.api.get("/api/accounting/autopilot/").json()["data"]
        self.assertEqual(set(data), {"money", "receivable", "payable", "month", "recurring",
                                     "recurring_monthly_total", "balanced", "categories"})
        cats = {c["key"]: c["amount"] for c in data["month"]["expenses_by_category"]}
        self.assertEqual(cats, {"rent": 3000000.0, "utilities": 500000.0})
        self.assertEqual(data["month"]["expense"], 3500000.0)
        self.assertEqual(len(data["categories"]), 6)

    def test_overview_triggers_due_monthly_costs(self):
        RecurringExpense.all_objects.create(
            business=self.b, title="اجاره", category="rent", amount=D("100"), day_of_month=1, payment_method="cash",
            start_date=datetime.date.today().replace(day=1) - datetime.timedelta(days=40))
        before = Expense.all_objects.filter(business=self.b).count()
        self.api.get("/api/accounting/autopilot/")
        self.assertGreater(Expense.all_objects.filter(business=self.b).count(), before)

    def test_other_business_cannot_touch_my_records(self):
        eid = self.api_post("/api/accounting/expenses/", {"category": "rent", "amount": 10}).json()["data"]["id"]
        rid = self.api_post("/api/accounting/recurring/", {"title": "x", "category": "rent", "amount": 5}).json()["data"]["id"]
        c = APIClient()
        c.force_authenticate(self.other)
        self.assertEqual(c.delete(f"/api/accounting/expenses/{eid}/").status_code, 404)
        self.assertEqual(c.delete(f"/api/accounting/recurring/{rid}/").status_code, 404)
        self.assertEqual(c.get("/api/accounting/expenses/").json()["data"], [])

    def test_everything_needs_the_accounting_module(self):
        apply_modules(self.b, {m["code"]: {"is_enabled": m["code"] == "pos"} for m in CATALOG})
        clear_current_business()
        for path in ("/api/accounting/autopilot/", "/api/accounting/expenses/",
                     "/api/accounting/payments/", "/api/accounting/recurring/"):
            c = APIClient()
            c.force_authenticate(User.objects.get(pk=self.owner.pk))
            self.assertEqual(c.get(path).status_code, 403, path)
