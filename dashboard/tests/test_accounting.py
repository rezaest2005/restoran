from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from restaurant.accounting_posting import (
    post_expense, post_pos_order, post_purchase_invoice, post_sales_invoice, post_sales_return,
    repost, safe_post, unpost,
)
from restaurant.accounting_services import (
    balance_sheet, income_statement, ledger, post_entry, reverse_entry, seed_default_chart,
    trial_balance,
)
from restaurant.models import (
    Account, Expense, JournalEntry, Order, PurchaseInvoice, PurchaseInvoiceItem, Restaurant,
    SalesInvoice, SalesInvoiceItem, SalesReturn, User,
)
from restaurant.tenancy import clear_current_restaurant

D = Decimal


class CoreTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r1 = Restaurant.objects.create(name="یک", slug="ac-one")
        cls.r2 = Restaurant.objects.create(name="دو", slug="ac-two")

    def setUp(self):
        clear_current_restaurant()

    def test_seed_is_idempotent(self):
        n = seed_default_chart(self.r1)
        self.assertGreater(n, 30)
        self.assertEqual(seed_default_chart(self.r1), 0)
        self.assertTrue(Account.all_objects.filter(restaurant=self.r1, code="1110").exists())
        self.assertFalse(Account.all_objects.filter(restaurant=self.r2).exists())

    def test_unbalanced_entry_rejected(self):
        with self.assertRaises(ValueError):
            post_entry(self.r1, [{"account": "1110", "debit": 100}, {"account": "4110", "credit": 90}])

    def test_validation_rules(self):
        bad = [
            [{"account": "1110", "debit": 100}],                                    # یک ردیف
            [{"account": "1110", "debit": 100, "credit": 100}, {"account": "4110", "credit": 0}],
            [{"account": "1000", "debit": 10}, {"account": "4110", "credit": 10}],  # حساب گروه
            [{"account": "9999", "debit": 10}, {"account": "4110", "credit": 10}],  # ناموجود
            [{"account": "1110", "debit": -5}, {"account": "4110", "credit": -5}],
            [{"account": "1110", "debit": 0}, {"account": "4110", "credit": 0}],
        ]
        for lines in bad:
            with self.subTest(lines=lines), self.assertRaises(ValueError):
                post_entry(self.r1, lines)
        self.assertEqual(JournalEntry.all_objects.count(), 0)

    def test_other_business_account_rejected(self):
        seed_default_chart(self.r2)
        foreign = Account.all_objects.get(restaurant=self.r2, code="1110")
        with self.assertRaises(ValueError):
            post_entry(self.r1, [{"account": foreign, "debit": 10}, {"account": "4110", "credit": 10}])

    def test_numbers_are_sequential_per_business(self):
        a = post_entry(self.r1, [{"account": "1110", "debit": 10}, {"account": "4110", "credit": 10}])
        b = post_entry(self.r1, [{"account": "1110", "debit": 5}, {"account": "4110", "credit": 5}])
        c = post_entry(self.r2, [{"account": "1110", "debit": 5}, {"account": "4110", "credit": 5}])
        self.assertEqual((a.number, b.number, c.number), (1, 2, 1))

    def test_source_posting_is_idempotent(self):
        lines = [{"account": "1110", "debit": 10}, {"account": "4110", "credit": 10}]
        e1 = post_entry(self.r1, lines, source_type="x", source_id=7)
        e2 = post_entry(self.r1, lines, source_type="x", source_id=7)
        self.assertEqual(e1.pk, e2.pk)
        self.assertEqual(JournalEntry.all_objects.count(), 1)

    def test_reverse_nets_to_zero_and_cannot_repeat(self):
        e = post_entry(self.r1, [{"account": "1110", "debit": 100}, {"account": "4110", "credit": 100}])
        rev = reverse_entry(e)
        self.assertEqual(rev.reversal_of_id, e.pk)
        tb = trial_balance(self.r1)
        self.assertEqual(tb["totals"]["balance_debit"], D("0"))
        with self.assertRaises(ValueError):
            reverse_entry(e)
        with self.assertRaises(ValueError):
            reverse_entry(rev)

    def test_reports_consistent(self):
        post_entry(self.r1, [{"account": "1110", "debit": 1000}, {"account": "3110", "credit": 1000}])
        post_entry(self.r1, [{"account": "1110", "debit": 500}, {"account": "4110", "credit": 500}])
        post_entry(self.r1, [{"account": "5390", "debit": 200}, {"account": "1110", "credit": 200}])
        tb = trial_balance(self.r1)
        self.assertTrue(tb["balanced"])
        inc = income_statement(self.r1)
        self.assertEqual(inc["total_income"], D("500"))
        self.assertEqual(inc["net_profit"], D("300"))
        bs = balance_sheet(self.r1)
        self.assertEqual(bs["total_assets"], D("1300"))
        self.assertEqual(bs["total_equity"], D("1300"))   # 1000 سرمایه + 300 سود
        self.assertTrue(bs["balanced"])
        led = ledger(self.r1, "1110")
        self.assertEqual(led["closing"], D("1300"))
        self.assertEqual([r["balance"] for r in led["rows"]], [D("1000"), D("1500"), D("1300")])


class PostingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r = Restaurant.objects.create(name="فروشگاه", slug="ac-post")

    def setUp(self):
        clear_current_restaurant()

    def _bal(self, code):
        return {r["code"]: r for r in trial_balance(self.r)["rows"]}.get(code)

    def test_sales_invoice_cash_credit_and_cogs(self):
        inv = SalesInvoice.all_objects.create(
            restaurant=self.r, customer_name="علی", total=1000, paid_amount=600,
            payment_method="card", invoice_number="F1")
        SalesInvoiceItem.all_objects.create(
            restaurant=self.r, invoice=inv, item_name="کالا", quantity=2, unit_price=500, cost_price=300)
        e = post_sales_invoice(inv)
        self.assertIsNotNone(e)
        self.assertEqual(self._bal("1120")["balance_debit"], D("600"))   # بانک (کارت)
        self.assertEqual(self._bal("1130")["balance_debit"], D("400"))   # مطالبات
        self.assertEqual(self._bal("4110")["balance_credit"], D("1000"))
        self.assertEqual(self._bal("5110")["balance_debit"], D("600"))   # 2×300
        self.assertEqual(self._bal("1140")["balance_credit"], D("600"))
        self.assertTrue(trial_balance(self.r)["balanced"])

    def test_credit_sale_goes_fully_to_receivable_and_overpay_is_capped(self):
        credit = SalesInvoice.all_objects.create(
            restaurant=self.r, total=500, paid_amount=500, payment_method="credit")
        post_sales_invoice(credit)
        self.assertEqual(self._bal("1130")["balance_debit"], D("500"))
        over = SalesInvoice.all_objects.create(
            restaurant=self.r, total=100, paid_amount=999, payment_method="cash")
        post_sales_invoice(over)
        self.assertEqual(self._bal("1110")["balance_debit"], D("100"))
        self.assertTrue(trial_balance(self.r)["balanced"])

    def test_edit_reposts_with_reversal_chain(self):
        inv = SalesInvoice.all_objects.create(restaurant=self.r, total=100, paid_amount=100, payment_method="cash")
        post_sales_invoice(inv)
        inv.total = 250
        inv.paid_amount = 250
        inv.save()
        repost(inv, "sales_invoice", post_sales_invoice)
        self.assertEqual(self._bal("4110")["balance_credit"], D("250"))
        self.assertEqual(income_statement(self.r)["total_income"], D("250"))
        inv.total = 300
        inv.paid_amount = 300
        inv.save()
        repost(inv, "sales_invoice", post_sales_invoice)   # دومین ویرایش نباید IntegrityError بدهد
        self.assertEqual(income_statement(self.r)["total_income"], D("300"))
        self.assertTrue(trial_balance(self.r)["balanced"])

    def test_unpost_on_delete(self):
        inv = SalesInvoice.all_objects.create(restaurant=self.r, total=100, paid_amount=100, payment_method="cash")
        post_sales_invoice(inv)
        unpost(self.r, "sales_invoice", inv.pk)
        self.assertEqual(income_statement(self.r)["total_income"], D("0"))
        self.assertIsNone(unpost(self.r, "sales_invoice", inv.pk))   # دوباره: بی‌اثر

    def test_expense_purchase_return_pos(self):
        exp = Expense.all_objects.create(restaurant=self.r, title="برق", amount=70, category="قبوض")
        post_expense(exp)
        self.assertEqual(self._bal("5390")["balance_debit"], D("70"))

        pi = PurchaseInvoice.all_objects.create(restaurant=self.r, supplier_name="تامین", date="2026-01-01")
        PurchaseInvoiceItem.all_objects.create(
            restaurant=self.r, invoice=pi, item_name="الف", quantity=4, unit_price=25)
        post_purchase_invoice(pi)
        self.assertEqual(self._bal("2110")["balance_credit"], D("100"))
        self.assertEqual(self._bal("1140")["balance_debit"], D("100"))

        sale = SalesInvoice.all_objects.create(restaurant=self.r, total=100, paid_amount=100, payment_method="cash")
        ret = SalesReturn.all_objects.create(restaurant=self.r, invoice=sale, item_name="x", amount=30)
        post_sales_return(ret)
        self.assertEqual(self._bal("4130")["balance_debit"], D("30"))

        order = Order.all_objects.create(
            restaurant=self.r, total_price=80, payment_status="paid", payment_method="cash")
        post_pos_order(order)
        self.assertEqual(self._bal("4110")["balance_credit"], D("80"))
        unpaid = Order.all_objects.create(restaurant=self.r, total_price=80, payment_status="pending")
        self.assertIsNone(post_pos_order(unpaid))
        self.assertTrue(trial_balance(self.r)["balanced"])

    def test_safe_post_never_raises(self):
        class Bad:
            pk = 1
            restaurant = self.r
            total = "not-a-number"

        def boom(obj, user=None):
            raise RuntimeError("x")

        self.assertIsNone(safe_post(boom, Bad()))


class ApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.r1 = Restaurant.objects.create(name="یک", slug="ac-api1")
        cls.r2 = Restaurant.objects.create(name="دو", slug="ac-api2")
        cls.u1 = User.objects.create_user(username="a1", password="Pass12345!", role="owner", restaurant=cls.r1)
        cls.u2 = User.objects.create_user(username="a2", password="Pass12345!", role="owner", restaurant=cls.r2)
        cls.cashier = User.objects.create_user(
            username="c1", password="Pass12345!", role="cashier", restaurant=cls.r1)

    def setUp(self):
        clear_current_restaurant()
        self.api = APIClient()
        self.api.force_authenticate(self.u1)

    def _accounts(self):
        return {a["code"]: a["id"] for a in self.api.get("/api/accounting/accounts/").json()["data"]}

    def test_accounts_autoseed_and_create(self):
        acc = self._accounts()
        self.assertIn("1110", acc)
        dup = self.api.post("/api/accounting/accounts/", {"code": "1110", "name": "x", "type": "asset"}, format="json")
        self.assertEqual(dup.status_code, 400)
        ok = self.api.post("/api/accounting/accounts/",
                           {"code": "1111", "name": "صندوق ۲", "type": "asset", "parent_id": acc["1110"]}, format="json")
        # والد 1110 سند ندارد، پس گروه می‌شود
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertFalse(Account.all_objects.get(restaurant=self.r1, code="1110").is_postable)

    def test_manual_journal_and_reverse_flow(self):
        acc = self._accounts()
        body = {"date": "2026-02-01", "description": "سرمایه‌گذاری", "lines": [
            {"account_id": acc["1110"], "debit": 5000}, {"account_id": acc["3110"], "credit": 5000}]}
        res = self.api.post("/api/accounting/journal/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        eid = res.json()["data"]["id"]
        unbalanced = dict(body, lines=[{"account_id": acc["1110"], "debit": 10}, {"account_id": acc["3110"], "credit": 9}])
        self.assertEqual(self.api.post("/api/accounting/journal/", unbalanced, format="json").status_code, 400)
        rev = self.api.post(f"/api/accounting/journal/{eid}/reverse/", {"reason": "اشتباه"}, format="json")
        self.assertEqual(rev.status_code, 201, rev.content)
        again = self.api.post(f"/api/accounting/journal/{eid}/reverse/", {}, format="json")
        self.assertEqual(again.status_code, 400)
        listing = self.api.get("/api/accounting/journal/?from=2026-01-01").json()["data"]
        self.assertEqual(listing["total"], 2)

    def test_reports_and_summary(self):
        acc = self._accounts()
        self.api.post("/api/accounting/journal/", {"date": "2026-03-01", "lines": [
            {"account_id": acc["1110"], "debit": 700}, {"account_id": acc["4110"], "credit": 700}]}, format="json")
        tb = self.api.get("/api/accounting/reports/trial-balance/").json()["data"]
        self.assertTrue(tb["balanced"])
        led = self.api.get(f"/api/accounting/reports/ledger/?account={acc['1110']}").json()["data"]
        self.assertEqual(led["closing"], 700.0)
        self.assertEqual(self.api.get("/api/accounting/reports/ledger/").status_code, 400)
        inc = self.api.get("/api/accounting/reports/income-statement/?from=2026-03-01&to=2026-03-31").json()["data"]
        self.assertEqual(inc["net_profit"], 700.0)
        bs = self.api.get("/api/accounting/reports/balance-sheet/?as_of=2026-12-31").json()["data"]
        self.assertTrue(bs["balanced"])
        self.assertEqual(self.api.get("/api/accounting/reports/trial-balance/?from=bad").status_code, 400)
        s = self.api.get("/api/accounting/summary/").json()["data"]
        self.assertIn("cash", s)

    def test_tenant_isolation_and_permission(self):
        acc = self._accounts()
        self.api.post("/api/accounting/journal/", {"lines": [
            {"account_id": acc["1110"], "debit": 1}, {"account_id": acc["4110"], "credit": 1}]}, format="json")
        other = APIClient()
        other.force_authenticate(self.u2)
        self.assertEqual(other.get("/api/accounting/journal/").json()["data"]["total"], 0)
        eid = JournalEntry.all_objects.get(restaurant=self.r1).pk
        self.assertEqual(other.get(f"/api/accounting/journal/{eid}/").status_code, 404)
        self.assertEqual(other.post(f"/api/accounting/journal/{eid}/reverse/", {}, format="json").status_code, 404)
        # حساب کسب‌وکار دیگر در سند قابل استفاده نیست
        foreign_acc = Account.all_objects.filter(restaurant=self.r1, code="1110").first().pk
        other.get("/api/accounting/accounts/")
        r = other.post("/api/accounting/journal/", {"lines": [
            {"account_id": foreign_acc, "debit": 1}, {"account_id": foreign_acc, "credit": 1}]}, format="json")
        self.assertEqual(r.status_code, 400)
        # صندوقدار بدون تب حسابداری
        cash = APIClient()
        cash.force_authenticate(self.cashier)
        self.assertIn(cash.get("/api/accounting/summary/").status_code, (401, 403))

    def test_system_account_cannot_be_deleted(self):
        acc = self._accounts()
        res = self.api.delete(f"/api/accounting/accounts/{acc['1110']}/")
        self.assertEqual(res.status_code, 400)
