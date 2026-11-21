"""
حسابداری حرفه‌ای: قالب سرفصل، پیش‌نویس/قطعی/برگشت، سال مالی و قفل دوره، بستن سال، تفصیلی، بانک و انتقال،
مغایرت بانکی، چک، گزارش‌ها (تراز ۶ستونی، جریان نقد، سن بدهی، ارزش افزوده، بودجه) و حالت مستقل (فقط حسابداری).
"""
import datetime
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.accounting_charts import CHART_TEMPLATE_KEYS, CORE_CHART, apply_chart_template
from bizsuite.accounting_fiscal import close_fiscal_year, create_fiscal_year, reopen_fiscal_year, set_period_lock
from bizsuite.accounting_reports import (
    aging, budget_vs_actual, cash_flow, journal_book, party_balances, trial_balance_ext, vat_report,
)
from bizsuite.accounting_services import (
    balance_sheet, create_detail, delete_draft, income_statement, ledger, post_draft, post_entry, reverse_entry,
    save_draft, seed_default_chart, trial_balance,
)
from bizsuite.accounting_treasury import (
    auto_match, change_cheque_status, create_money_account, import_statement, money_balance, reconciliation,
    register_cheque, transfer, undo_cheque_status,
)
from bizsuite.models import (
    Account, AccountingPeriod, AccountingSettings, Budget, BudgetLine, Business, JournalEntry, User,
)
from bizsuite.modules import apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

D = Decimal
d = datetime.date


def bal(biz, code, detail=None):
    led = ledger(biz, code, detail=detail)
    return led["closing"]


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.b = Business.objects.create(name="حساب", slug="accpro")
        seed_default_chart(cls.b)

    def setUp(self):
        clear_current_business()


class ChartTemplateTests(Base):
    def test_all_template_keys(self):
        self.assertEqual(set(CHART_TEMPLATE_KEYS),
                         {"general", "service", "retail", "restaurant", "manufacturing", "distribution",
                          "iran_standard"})
        for i, key in enumerate(CHART_TEMPLATE_KEYS):
            biz = Business.objects.create(name=f"t{i}", slug=f"tpl-{i}")
            n = apply_chart_template(biz, key)
            self.assertGreaterEqual(n, len(CORE_CHART))
            self.assertEqual(apply_chart_template(biz, key), 0)  # idempotent
            # every core code used by automatic posting exists in every template
            for row in CORE_CHART:
                self.assertTrue(Account.all_objects.filter(business=biz, code=row[0]).exists(), (key, row[0]))
            self.assertEqual(AccountingSettings.all_objects.get(business=biz).chart_template, key)
            # group accounts never accept postings
            for a in Account.all_objects.filter(business=biz, is_postable=True):
                self.assertFalse(a.children.exists(), (key, a.code))

    def test_templates_stack(self):
        apply_chart_template(self.b, "retail")
        n = apply_chart_template(self.b, "iran_standard")
        self.assertGreater(n, 0)
        self.assertTrue(Account.all_objects.filter(business=self.b, code="2220").exists())
        self.assertTrue(Account.all_objects.filter(business=self.b, code="4115").exists())

    def test_bad_template(self):
        with self.assertRaises(ValueError):
            apply_chart_template(self.b, "nope")

    def test_roles_backfilled(self):
        self.assertEqual(Account.all_objects.get(business=self.b, code="1110").role, "cash")
        self.assertEqual(Account.all_objects.get(business=self.b, code="2141").role, "vat_out")


class DraftTests(Base):
    L = [{"account": "1110", "debit": 100}, {"account": "4110", "credit": 100}]

    def test_draft_lifecycle(self):
        e = save_draft(self.b, [{"account": "1110", "debit": 100}, {"account": "4110", "credit": 90}])
        self.assertEqual(e.status, "draft")
        self.assertIsNone(e.number)
        # drafts never reach reports
        self.assertEqual(trial_balance(self.b)["rows"], [])
        with self.assertRaises(ValueError):  # unbalanced
            post_draft(e)
        e = save_draft(self.b, self.L, entry=e, description="اصلاح")
        e = post_draft(e)
        self.assertEqual(e.status, "posted")
        self.assertEqual(e.number, 1)
        self.assertEqual(income_statement(self.b)["total_income"], D("100"))
        with self.assertRaises(ValueError):
            save_draft(self.b, self.L, entry=e)
        with self.assertRaises(ValueError):
            delete_draft(e)
        with self.assertRaises(ValueError):
            e.delete()

    def test_numbering_skips_drafts(self):
        post_entry(self.b, self.L)
        dr = save_draft(self.b, self.L)
        e2 = post_entry(self.b, self.L)
        self.assertEqual(e2.number, 2)
        self.assertEqual(post_draft(dr).number, 3)

    def test_delete_draft(self):
        dr = save_draft(self.b, self.L)
        delete_draft(dr)
        self.assertFalse(JournalEntry.all_objects.filter(pk=dr.pk).exists())

    def test_reverse_draft_refused(self):
        dr = save_draft(self.b, self.L)
        with self.assertRaises(ValueError):
            reverse_entry(dr)


class FiscalTests(Base):
    def setUp(self):
        super().setUp()
        self.fy = create_fiscal_year(self.b, "1404", d(2025, 3, 21), d(2026, 3, 20))

    def test_periods_and_overlap(self):
        self.assertEqual(AccountingPeriod.all_objects.filter(fiscal_year=self.fy).count(), 13)  # Gregorian months covering the range
        with self.assertRaises(ValueError):
            create_fiscal_year(self.b, "x", d(2026, 1, 1), d(2026, 12, 31))
        with self.assertRaises(ValueError):  # gap in custom periods
            create_fiscal_year(self.b, "y", d(2027, 1, 1), d(2027, 12, 31),
                               periods=[{"name": "a", "start": d(2027, 1, 1), "end": d(2027, 5, 1)},
                                        {"name": "b", "start": d(2027, 5, 3), "end": d(2027, 12, 31)}])

    def test_period_lock_blocks_posting(self):
        p = AccountingPeriod.all_objects.get(fiscal_year=self.fy, start_date__lte=d(2025, 6, 10), end_date__gte=d(2025, 6, 10))
        set_period_lock(p, True)
        with self.assertRaises(ValueError):
            post_entry(self.b, [{"account": "1110", "debit": 5}, {"account": "4110", "credit": 5}],
                       date=d(2025, 6, 10))
        post_entry(self.b, [{"account": "1110", "debit": 5}, {"account": "4110", "credit": 5}], date=d(2025, 7, 10))
        dr = save_draft(self.b, [{"account": "1110", "debit": 5}, {"account": "4110", "credit": 5}],
                        date=d(2025, 6, 11))
        with self.assertRaises(ValueError):
            post_draft(dr)

    def test_close_and_reopen(self):
        L = lambda acc, dr, cr, amt, dt: post_entry(  # noqa: E731
            self.b, [{"account": dr, "debit": amt}, {"account": cr, "credit": amt}], date=dt)
        L(None, "1120", "3110", D("1000"), d(2025, 4, 1))      # capital
        L(None, "1110", "4110", D("700"), d(2025, 5, 1))       # sales
        L(None, "5320", "1110", D("200"), d(2025, 6, 1))       # rent
        save_draft(self.b, [{"account": "1110", "debit": 1}, {"account": "4110", "credit": 1}], date=d(2025, 7, 1))
        with self.assertRaises(ValueError):  # drafts block closing
            close_fiscal_year(self.fy)
        JournalEntry.all_objects.filter(status="draft").delete()

        bs_before = balance_sheet(self.b, d(2026, 3, 20))
        res = close_fiscal_year(self.fy)
        self.fy.refresh_from_db()
        self.assertEqual(self.fy.status, "closed")
        self.assertIsNotNone(res["next_year"])
        # profit moved to retained earnings; P&L of the closed year still shows it
        self.assertEqual(bal(self.b, "3120"), D("500"))
        self.assertEqual(income_statement(self.b, d(2025, 3, 21), d(2026, 3, 20))["net_profit"], D("500"))
        # balance sheet unchanged in total, temp accounts are zero
        bs_after = balance_sheet(self.b, d(2026, 3, 20))
        self.assertEqual(bs_after["total_assets"], bs_before["total_assets"])
        self.assertTrue(bs_after["balanced"])
        self.assertEqual(bs_after["current_earnings"], 0)
        # perm closing/opening cancel out: new-year opening balances equal year-end balances
        tb = trial_balance_ext(self.b, d(2026, 3, 21), d(2026, 4, 30))
        cash = next(r for r in tb["rows"] if r["code"] == "1110")
        self.assertEqual(cash["opening_debit"], D("500"))
        self.assertTrue(tb["balanced"])
        kinds = set(JournalEntry.all_objects.filter(business=self.b).values_list("kind", flat=True))
        self.assertTrue({"closing", "closing_perm", "opening_perm"} <= kinds)
        # closed year refuses new entries
        with self.assertRaises(ValueError):
            post_entry(self.b, [{"account": "1110", "debit": 1}, {"account": "4110", "credit": 1}],
                       date=d(2025, 9, 1))
        # reopen restores the pre-closing state without deleting anything
        n_entries = JournalEntry.all_objects.count()
        reopen_fiscal_year(self.fy)
        self.assertGreater(JournalEntry.all_objects.count(), n_entries)
        self.assertEqual(bal(self.b, "3120"), D("0"))
        self.assertEqual(balance_sheet(self.b, d(2026, 3, 20))["current_earnings"], D("500"))
        self.assertTrue(trial_balance(self.b)["balanced"])
        # and it can be closed again
        close_fiscal_year(self.fy)
        self.assertEqual(bal(self.b, "3120"), D("500"))


class DetailAndPartyTests(Base):
    def test_detail_ledger_and_party_balances(self):
        ali = create_detail(self.b, "علی", kind="customer")
        sara = create_detail(self.b, "سارا", kind="customer")
        self.assertEqual(ali.code, "20001")
        self.assertEqual(sara.code, "20002")
        post_entry(self.b, [{"account": "1130", "debit": 300, "detail": ali}, {"account": "4110", "credit": 300}],
                   date=d(2026, 1, 1))
        post_entry(self.b, [{"account": "1130", "debit": 50, "detail": sara}, {"account": "4110", "credit": 50}],
                   date=d(2026, 3, 1))
        post_entry(self.b, [{"account": "1110", "debit": 100}, {"account": "1130", "credit": 100, "detail": ali}],
                   date=d(2026, 2, 1))
        self.assertEqual(bal(self.b, "1130", ali), D("200"))
        pb = party_balances(self.b, "receivable")
        self.assertEqual({r["name"]: r["balance"] for r in pb["rows"]}, {"علی": D("200"), "سارا": D("50")})
        ag = aging(self.b, "receivable", as_of=d(2026, 3, 15))
        row = next(r for r in ag["rows"] if r["name"] == "علی")
        self.assertEqual(row["buckets"][2], D("200"))  # 73 days old -> 61-90
        self.assertEqual(ag["total"], D("250"))
        tb = trial_balance_ext(self.b, level="detail")
        self.assertTrue(any(r["detail_name"] == "علی" and r["balance_debit"] == D("200") for r in tb["rows"]))

    def test_detail_from_other_business_rejected(self):
        other = Business.objects.create(name="o", slug="accpro-o")
        x = create_detail(other, "x")
        with self.assertRaises(ValueError):
            post_entry(self.b, [{"account": "1130", "debit": 1, "detail": x}, {"account": "4110", "credit": 1}])

    def test_levels(self):
        post_entry(self.b, [{"account": "1110", "debit": 10}, {"account": "4110", "credit": 10}])
        g = trial_balance_ext(self.b, level="group")
        self.assertEqual({r["code"] for r in g["rows"]}, {"1000", "4000"})
        self.assertTrue(g["balanced"])
        led = trial_balance_ext(self.b, level="ledger")
        self.assertIn("1100", {r["code"] for r in led["rows"]})
        # ledger for a group account includes its children
        self.assertEqual(ledger(self.b, "1000")["closing"], D("10"))


class TreasuryTests(Base):
    def setUp(self):
        super().setUp()
        self.cash = create_money_account(self.b, "cash", "صندوق اصلی", opening_balance=1000, opening_date=d(2026, 1, 1))
        self.mellat = create_money_account(self.b, "bank", "ملت", opening_balance=0, account_number="123")
        self.party = create_detail(self.b, "مشتری", kind="customer")
        self.supp = create_detail(self.b, "تأمین", kind="supplier")

    def test_transfer_with_fee(self):
        transfer(self.b, self.cash, self.mellat, 400, fee=5, date=d(2026, 1, 2))
        self.assertEqual(money_balance(self.cash), D("595"))
        self.assertEqual(money_balance(self.mellat), D("400"))
        self.assertEqual(bal(self.b, "5410"), D("5"))
        with self.assertRaises(ValueError):
            transfer(self.b, self.cash, self.cash, 1)
        cf = cash_flow(self.b, d(2026, 1, 2), d(2026, 1, 31))
        self.assertEqual(cf["net_change"], D("-5"))  # only the fee leaves the business

    def test_received_cheque_lifecycle(self):
        post_entry(self.b, [{"account": "1130", "debit": 500, "detail": self.party}, {"account": "4110", "credit": 500}])
        ch = register_cheque(self.b, "received", self.party, "111", 500, d(2026, 1, 5), d(2026, 2, 5),
                             bank_name="ملی", sayad_id="1234567890123456")
        self.assertEqual(bal(self.b, "1135"), D("500"))
        self.assertEqual(bal(self.b, "1130", self.party), D("0"))
        ch = change_cheque_status(ch, "deposited", d(2026, 2, 5), money_account=self.mellat)
        self.assertEqual(bal(self.b, "1136"), D("500"))
        ch = change_cheque_status(ch, "bounced", d(2026, 2, 7))
        self.assertEqual(bal(self.b, "1137"), D("500"))
        ch = undo_cheque_status(ch)
        self.assertEqual(ch.status, "deposited")
        self.assertEqual(bal(self.b, "1137"), D("0"))
        ch = change_cheque_status(ch, "cleared", d(2026, 2, 8))
        self.assertEqual(money_balance(self.mellat), D("500"))
        self.assertEqual(bal(self.b, "1136"), D("0"))
        with self.assertRaises(ValueError):  # cleared is final
            change_cheque_status(ch, "returned", d(2026, 2, 9))
        self.assertTrue(trial_balance(self.b)["balanced"])

    def test_bounce_and_return_to_owner(self):
        ch = register_cheque(self.b, "received", self.party, "222", 300, d(2026, 1, 5), d(2026, 1, 20))
        ch = change_cheque_status(ch, "bounced", d(2026, 1, 21))
        ch = change_cheque_status(ch, "returned", d(2026, 1, 22))
        self.assertEqual(bal(self.b, "1137"), D("0"))
        self.assertEqual(bal(self.b, "1130", self.party), D("0"))  # -300 at receipt, +300 back

    def test_endorse(self):
        ch = register_cheque(self.b, "received", self.party, "333", 200, d(2026, 1, 5), d(2026, 1, 20))
        with self.assertRaises(ValueError):
            change_cheque_status(ch, "endorsed", d(2026, 1, 6))
        change_cheque_status(ch, "endorsed", d(2026, 1, 6), endorsed_to=self.supp)
        self.assertEqual(bal(self.b, "2110", self.supp), D("-200"))
        self.assertEqual(bal(self.b, "1135"), D("0"))

    def test_issued_cheque(self):
        with self.assertRaises(ValueError):  # bank required
            register_cheque(self.b, "issued", self.supp, "9", 100, d(2026, 1, 5), d(2026, 1, 25))
        ch = register_cheque(self.b, "issued", self.supp, "9", 100, d(2026, 1, 5), d(2026, 1, 25),
                             money_account=self.mellat)
        self.assertEqual(bal(self.b, "2115"), D("100"))
        change_cheque_status(ch, "cleared", d(2026, 1, 25))
        self.assertEqual(bal(self.b, "2115"), D("0"))
        self.assertEqual(money_balance(self.mellat), D("-100"))

    def test_duplicate_and_bad_sayad(self):
        register_cheque(self.b, "received", self.party, "1", 10, d(2026, 1, 1), d(2026, 1, 2), bank_name="x")
        with self.assertRaises(ValueError):
            register_cheque(self.b, "received", self.party, "1", 10, d(2026, 1, 1), d(2026, 1, 2), bank_name="x")
        with self.assertRaises(ValueError):
            register_cheque(self.b, "received", self.party, "2", 10, d(2026, 1, 1), d(2026, 1, 2), sayad_id="12")

    def test_reconciliation(self):
        transfer(self.b, self.cash, self.mellat, 300, date=d(2026, 1, 10))
        post_entry(self.b, [{"account": "5410", "debit": 2},
                            {"account": "1120", "credit": 2, "detail": self.mellat.detail}], date=d(2026, 1, 31))
        import_statement(self.mellat, [
            {"date": d(2026, 1, 12), "amount": D("300"), "description": "واریز"},
            {"date": d(2026, 1, 31), "amount": D("-7"), "description": "کارمزد پیامک"},
        ])
        self.assertEqual(auto_match(self.mellat), 1)
        rec = reconciliation(self.mellat, statement_balance=D("293"))
        self.assertEqual(rec["book_balance"], D("298"))
        self.assertEqual(len(rec["unmatched_book"]), 1)
        # 293 + (-2 still in books, not in bank) - (-7 in bank, not in books) = 298
        self.assertEqual(rec["difference"], D("0"))


class ReportTests(Base):
    def test_vat_report(self):
        post_entry(self.b, [{"account": "1130", "debit": 1100}, {"account": "4110", "credit": 1000},
                            {"account": "2141", "credit": 100, "tax_base": 1000}], date=d(2026, 1, 1))
        post_entry(self.b, [{"account": "1140", "debit": 500}, {"account": "1170", "debit": 50, "tax_base": 500},
                            {"account": "2110", "credit": 550}], date=d(2026, 1, 2))
        v = vat_report(self.b, d(2026, 1, 1), d(2026, 3, 31))
        self.assertEqual(v["sales"]["tax"], D("100"))
        self.assertEqual(v["sales"]["base"], D("1000"))
        self.assertEqual(v["purchases"]["tax"], D("50"))
        self.assertEqual(v["payable"], D("50"))

    def test_six_column_trial_balance(self):
        post_entry(self.b, [{"account": "1110", "debit": 100}, {"account": "3110", "credit": 100}], date=d(2026, 1, 1))
        post_entry(self.b, [{"account": "1110", "debit": 40}, {"account": "4110", "credit": 40}], date=d(2026, 2, 1))
        tb = trial_balance_ext(self.b, d(2026, 2, 1), d(2026, 2, 28))
        cash = next(r for r in tb["rows"] if r["code"] == "1110")
        self.assertEqual((cash["opening_debit"], cash["debit"], cash["balance_debit"]), (D("100"), D("40"), D("140")))
        t = tb["totals"]
        self.assertEqual(t["opening_debit"], t["opening_credit"])
        self.assertEqual(t["balance_debit"], t["balance_credit"])

    def test_cash_flow_sections(self):
        post_entry(self.b, [{"account": "1110", "debit": 1000}, {"account": "3110", "credit": 1000}], date=d(2026, 1, 1))
        post_entry(self.b, [{"account": "1220", "debit": 300}, {"account": "1110", "credit": 300}], date=d(2026, 1, 2))
        post_entry(self.b, [{"account": "1110", "debit": 200}, {"account": "4110", "credit": 200}], date=d(2026, 1, 3))
        cf = cash_flow(self.b, d(2026, 1, 1), d(2026, 1, 31))
        self.assertEqual(cf["sections"]["financing"]["total"], D("1000"))
        self.assertEqual(cf["sections"]["investing"]["total"], D("-300"))
        self.assertEqual(cf["sections"]["operating"]["total"], D("200"))
        self.assertEqual(cf["closing"], D("900"))

    def test_budget_and_journal_book(self):
        post_entry(self.b, [{"account": "5320", "debit": 80}, {"account": "1110", "credit": 80}], date=d(2026, 1, 5))
        b = Budget.all_objects.create(business=self.b, name="۱۴۰۵", start_date=d(2026, 1, 1), end_date=d(2026, 12, 31))
        BudgetLine.all_objects.create(business=self.b, budget=b,
                                      account=Account.all_objects.get(business=self.b, code="5320"), amount=100)
        r = budget_vs_actual(b)
        self.assertEqual(r["rows"][0]["actual"], D("80"))
        self.assertEqual(r["rows"][0]["variance"], D("20"))
        jb = journal_book(self.b)
        self.assertEqual(jb["total_debit"], jb["total_credit"])
        self.assertEqual(len(jb["entries"]), 1)


class StandaloneApiTests(TestCase):
    """A tenant with ONLY the accounting module can use everything."""

    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.biz = Business.objects.create(name="فقط حسابداری", slug="acc-only")
        cls.other = Business.objects.create(name="دیگر", slug="acc-other")
        cls.owner = User.objects.create_user(username="acco", password="Pass12345!", role="owner", business=cls.biz)
        cls.stranger = User.objects.create_user(username="accx", password="Pass12345!", role="owner",
                                                business=cls.other)
        apply_modules(cls.biz, {c: {"is_enabled": c == "accounting"} for c in
                                ["pos", "club", "inventory", "production", "accounting", "delivery", "feedback",
                                 "storefront"]}, auto_requires=False)

    def setUp(self):
        clear_current_business()
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def ok(self, r, code=200):
        self.assertEqual(r.status_code, code, r.content[:400])
        return r.json().get("data")

    def test_full_flow(self):
        api = self.api
        self.ok(api.post("/api/accounting/chart-templates/", {"key": "service"}, format="json"))
        accounts = {a["code"]: a for a in self.ok(api.get("/api/accounting/accounts/"))}
        self.assertIn("4150", accounts)
        self.assertEqual(accounts["1100"]["level"], "ledger")
        fy = self.ok(api.post("/api/accounting/fiscal-years/", {"name": "1405", "start_date": "2026-03-21",
                                                               "end_date": "2027-03-20"}, format="json"), 201)
        person = self.ok(api.post("/api/accounting/details/", {"name": "رضا", "kind": "customer"}, format="json"), 201)
        bank = self.ok(api.post("/api/accounting/money-accounts/", {"kind": "bank", "name": "ملی",
                                                                    "opening_balance": "1000",
                                                                    "opening_date": "2026-04-01"},
                                format="json"), 201)
        self.assertEqual(bank["balance"], 1000)
        # draft -> edit -> post
        lines = [{"account_id": accounts["1130"]["id"], "debit": 500, "detail_id": person["id"]},
                 {"account_id": accounts["4150"]["id"], "credit": 500}]
        dr = self.ok(api.post("/api/accounting/journal/", {"date": "2026-04-02", "status": "draft", "lines": lines},
                              format="json"), 201)
        self.assertEqual(dr["status"], "draft")
        self.assertIsNone(dr["number"])
        posted = self.ok(api.post(f"/api/accounting/journal/{dr['id']}/post/"))
        self.assertEqual(posted["status"], "posted")
        r = api.delete(f"/api/accounting/journal/{dr['id']}/")
        self.assertEqual(r.status_code, 400)
        r = api.put(f"/api/accounting/journal/{dr['id']}/", {"date": "2026-04-02", "lines": lines}, format="json")
        self.assertEqual(r.status_code, 400)
        # VAT sale without any invoicing module
        v = self.ok(api.post("/api/accounting/vat-documents/", {"kind": "sale", "net": "1000", "vat_rate": "10",
                                                               "method": "bank", "money_account_id": bank["id"],
                                                               "date": "2026-04-03"}, format="json"), 201)
        self.assertEqual(v["vat"], 100)
        cheque = self.ok(api.post("/api/accounting/cheques/", {"direction": "received", "party_id": person["id"],
                                                               "number": "77", "amount": "500",
                                                               "issue_date": "2026-04-04",
                                                               "due_date": "2026-05-04"}, format="json"), 201)
        self.ok(api.post(f"/api/accounting/cheques/{cheque['id']}/status/",
                         {"to_status": "cleared", "date": "2026-05-04", "money_account_id": bank["id"]},
                         format="json"))
        for name in ("journal-book", "trial-balance-ext", "cash-flow", "aging", "party-balances", "vat"):
            self.ok(api.get(f"/api/accounting/reports/{name}/", {"from": "2026-03-21", "to": "2027-03-20"}))
        tb = self.ok(api.get("/api/accounting/reports/trial-balance-ext/", {"level": "group"}))
        self.assertTrue(tb["balanced"])
        vat = self.ok(api.get("/api/accounting/reports/vat/"))
        self.assertEqual(vat["payable"], 100)
        bud = self.ok(api.post("/api/accounting/budgets/", {"name": "b", "start_date": "2026-03-21",
                                                           "end_date": "2027-03-20",
                                                           "lines": [{"account_id": accounts["4150"]["id"],
                                                                      "amount": "2000"}]}, format="json"), 201)
        self.assertEqual(bud["rows"][0]["actual"], 500)
        lock = self.ok(api.get(f"/api/accounting/fiscal-years/{fy['id']}/"))
        self.assertEqual(lock["preview"]["drafts"], 0)
        self.ok(api.post(f"/api/accounting/fiscal-years/{fy['id']}/close/", {}, format="json"))
        r = api.post("/api/accounting/journal/", {"date": "2026-06-01", "lines": lines}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_tenant_isolation(self):
        det = self.ok(self.api.post("/api/accounting/details/", {"name": "x"}, format="json"), 201)
        other = APIClient()
        other.force_authenticate(self.stranger)
        r = other.put(f"/api/accounting/details/{det['id']}/", {"name": "y"}, format="json")
        self.assertEqual(r.status_code, 404)
        r = other.get("/api/accounting/details/")
        self.assertEqual(r.json()["data"], [])


class ChequeUndoTests(Base):
    def test_double_undo_never_unbalances(self):
        party = create_detail(self.b, "p", kind="customer")
        bank = create_money_account(self.b, "bank", "b")
        ch = register_cheque(self.b, "received", party, "u1", 100, d(2026, 1, 1), d(2026, 1, 9))
        ch = change_cheque_status(ch, "deposited", d(2026, 1, 9), money_account=bank)
        ch = undo_cheque_status(ch)
        self.assertEqual(ch.status, "in_hand")
        with self.assertRaises(ValueError):  # the registration itself cannot be undone
            undo_cheque_status(ch)
        ch = change_cheque_status(ch, "deposited", d(2026, 1, 10), money_account=bank)
        ch = undo_cheque_status(ch)
        self.assertEqual(bal(self.b, "1135"), D("100"))
        self.assertEqual(bal(self.b, "1136"), D("0"))
        self.assertTrue(trial_balance(self.b)["balanced"])


class WizardHookTests(Base):
    def test_public_names_for_industry_wizard(self):
        import re

        from bizsuite import accounting_services as svc
        self.assertTrue({"service", "retail", "restaurant", "manufacturing", "distribution", "iran_standard"}
                        <= set(svc.CHART_TEMPLATES))
        biz = Business.objects.create(name="w", slug="acc-wiz")
        self.assertGreater(svc.seed_chart_template(biz, "restaurant"), 0)
        self.assertTrue(Account.all_objects.filter(business=biz, code="4111").exists())
        self.assertGreaterEqual(svc.seed_chart_template(biz, "unknown-key"), 0)  # never raises
        # user-visible labels stay industry neutral
        bad = re.compile(r"رستوران|restaurant|غذا|آشپز|\bmenu\b|منو", re.I)
        for key, tpl in svc.CHART_TEMPLATES.items():
            self.assertNotRegex(tpl["fa"] + tpl["en"], bad)
            for row in tpl["extra"]:
                self.assertNotRegex(row[1] + row[2], bad)
