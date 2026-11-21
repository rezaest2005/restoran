"""Business type presets, the setup wizard API and the module-gated main dashboard summary."""
import datetime
from decimal import Decimal
from unittest import mock

from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bizsuite import industries
from bizsuite.dashboard_summary import build_summary, dashboard_modules
from bizsuite.models import (
    Business, Category, Food, LoyaltyMember, Order, RawMaterial, SalesInvoice, User,
)
from bizsuite.models.common import UNIT_CHOICES
from bizsuite.modules import CATALOG, apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

P = "Pass12345!"
MODULE_CODES = {m["code"] for m in CATALOG}
RESTAURANT_WORDS = ("میز", "منو", "آشپزخانه", "Table", "Menu", "Kitchen", "Recipe", "Guest")


class PresetTests(SimpleTestCase):
    def test_every_preset_is_consistent(self):
        units = {u for u, _ in UNIT_CHOICES}
        self.assertIn("other", industries.INDUSTRY_BY_KEY)
        for want in ("restaurant", "retail", "manufacturing", "distribution", "services", "pharmacy"):
            self.assertIn(want, industries.INDUSTRY_BY_KEY)
        for ind in industries.INDUSTRIES:
            self.assertTrue(set(ind.modules) <= MODULE_CODES, ind.key)
            self.assertTrue(set(ind.units) <= units, ind.key)
            self.assertTrue(set(ind.widgets) <= set(industries.ALL_WIDGETS), ind.key)
            self.assertEqual(set(ind.all_terms()), set(industries.GENERIC_TERMS), ind.key)
            self.assertIn(ind.coa_template, {"service", "retail", "restaurant", "manufacturing",
                                             "distribution", "iran_standard"})
            # suggested modules never miss a hard prerequisite
            req = {m["code"]: m["requires"] for m in CATALOG}
            for code in ind.modules:
                self.assertTrue(set(req[code]) <= set(ind.modules), f"{ind.key}:{code}")

    def test_terminology_differs_by_type(self):
        self.assertEqual(industries.get_industry("restaurant").all_terms()["spot"]["en"], "Table")
        self.assertEqual(industries.get_industry("retail").all_terms()["product"]["en"], "Product")
        self.assertEqual(industries.get_industry("services").all_terms()["product"]["en"], "Service")
        # neutral types never speak restaurant
        for key in ("retail", "manufacturing", "distribution", "services", "pharmacy", "other"):
            words = " ".join(v for t in industries.get_industry(key).all_terms().values() for v in t.values())
            for bad in RESTAURANT_WORDS:
                self.assertNotIn(bad, words, key)

    def test_normalize_and_aliases(self):
        self.assertEqual(industries.normalize("cafe"), "restaurant")
        self.assertEqual(industries.normalize("Wholesale"), "distribution")
        self.assertEqual(industries.normalize(""), "other")
        self.assertEqual(industries.normalize("spaceship"), "other")

    def test_chart_template_fallback(self):
        self.assertEqual(industries.chart_template_for("services"), "service")  # no registry: key kept
        with mock.patch("bizsuite.accounting_services.CHART_TEMPLATES", {"iran_standard": {}, "retail": {}},
                        create=True):
            self.assertEqual(industries.chart_template_for("retail"), "retail")
            self.assertEqual(industries.chart_template_for("manufacturing"), "iran_standard")
        with mock.patch("bizsuite.accounting_services.CHART_TEMPLATES", {"x": {}}, create=True):
            self.assertEqual(industries.chart_template_for("pharmacy"), "x")

    def test_widget_order_is_complete(self):
        for ind in industries.INDUSTRIES:
            self.assertEqual(sorted(industries.widget_order(ind.key)), sorted(industries.ALL_WIDGETS))


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="شرکت نمونه", slug="sample-co")
        cls.owner = User.objects.create_user(username="i_owner", password=P, role="owner", business=cls.b,
                                             is_approved=True)
        cls.cashier = User.objects.create_user(username="i_cash", password=P, role="cashier", business=cls.b,
                                               is_approved=True)

    def setUp(self):
        clear_current_business()
        self.b.refresh_from_db()

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(User.objects.get(pk=user.pk))
        return c

    def only(self, codes):
        apply_modules(self.b, {c: {"is_enabled": c in codes} for c in MODULE_CODES}, auto_requires=True)
        self.b.refresh_from_db()


class SetupApiTests(Base):
    def test_new_business_needs_setup_and_old_payload_keys(self):
        self.assertEqual(self.b.industry, "")
        self.assertTrue(industries.is_setup_required(self.b))
        r = APIClient().post("/api/auth/login/", {"username": "i_owner", "password": P}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        user = r.json()["user"]
        self.assertTrue(user["setup_required"])
        self.assertEqual(user["business_industry"], "")
        self.assertIn("product", user["business_terms"])

    def test_owner_completes_wizard(self):
        self.only(["accounting", "delivery"])
        r = self.client_for(self.owner).put("/api/business/setup/", {
            "industry": "distribution", "used_modules": ["accounting", "delivery", "inventory"],
            "name": "پخش البرز", "phone": "02100000000", "address": "تهران",
        }, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.b.refresh_from_db()
        self.assertEqual(self.b.industry, "distribution")
        self.assertIsNotNone(self.b.setup_completed_at)
        self.assertEqual(self.b.name, "پخش البرز")
        self.assertEqual(self.b.industry_options["used_modules"], ["accounting", "delivery"])
        self.assertEqual(self.b.industry_options["requested_modules"], ["inventory"])  # not bought: only a request
        self.assertEqual(self.b.industry_options["coa_template"], "distribution")
        data = r.json()["data"]
        self.assertFalse(data["setup_required"])
        self.assertEqual({m["code"] for m in data["modules"] if m["live"]}, {"accounting", "delivery"})

    def test_wizard_never_changes_licensing(self):
        self.only(["accounting"])
        self.client_for(self.owner).put("/api/business/setup/", {"industry": "retail",
                                                                 "used_modules": ["pos", "inventory"]}, format="json")
        from bizsuite.modules import enabled_modules
        self.assertEqual(enabled_modules(self.b), {"accounting"})

    def test_only_owner_may_edit_and_type_validated(self):
        r = self.client_for(self.cashier).put("/api/business/setup/", {"industry": "retail"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.client_for(self.cashier).get("/api/business/setup/").status_code, 200)
        r = self.client_for(self.owner).put("/api/business/setup/", {"industry": "spaceship"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client_for(self.owner).put("/api/business/setup/", {"industry": "retail",
                                                                     "used_modules": ["nope"]}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_industries_catalog_and_custom_terms(self):
        r = self.client_for(self.cashier).get("/api/business/industries/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()["data"]["industries"]), len(industries.INDUSTRIES))
        self.client_for(self.owner).put("/api/business/setup/", {
            "industry": "retail", "terms": {"customer": {"fa": "خریدار", "en": "Buyer"}, "bogus": {"en": "x"}},
        }, format="json")
        self.b.refresh_from_db()
        terms = industries.terms_for(self.b)
        self.assertEqual(terms["customer"]["en"], "Buyer")
        self.assertNotIn("bogus", terms)

    def test_checklist_dismiss(self):
        r = self.client_for(self.owner).post("/api/business/setup/checklist/", {"dismissed": True}, format="json")
        self.assertEqual(r.status_code, 200)
        self.b.refresh_from_db()
        s = build_summary(self.b, User.objects.get(pk=self.owner.pk))
        self.assertTrue(s["checklist_dismissed"])
        self.assertEqual(s["checklist"], [])
        self.assertEqual(self.client_for(self.cashier).post("/api/business/setup/checklist/", {}).status_code, 403)


class SummaryGatingTests(Base):
    def summary(self, user=None):
        r = self.client_for(user or self.owner).get("/api/dashboard/summary/")
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()["data"]

    def test_accounting_and_delivery_only_has_no_restaurant_blocks(self):
        self.only(["accounting", "delivery"])
        s = self.summary()
        self.assertEqual(set(s["data"]), {"accounting", "deliveries", "receivables"})
        self.assertEqual(s["data"]["receivables"]["source"], "ledger")
        self.assertTrue(set(s["widgets"]) <= {"receivables", "cash", "deliveries"})
        self.assertIn("cash", s["widgets"])
        keys = {c["key"] for c in s["checklist"]}
        self.assertNotIn("products", keys)
        self.assertNotIn("formula", keys)
        self.assertIn("fleet", keys)
        self.assertIn("chart", keys)

    def test_club_with_pos(self):
        self.only(["pos", "club"])
        LoyaltyMember.all_objects.create(business=self.b, phone="09120000000", points_balance=40)
        s = self.summary()
        self.assertEqual(s["data"]["club"]["members"], 1)
        self.assertEqual(s["data"]["club"]["points_outstanding"], 40)
        self.assertIn("pos", s["data"])
        self.assertNotIn("inventory", s["data"])
        self.assertNotIn("accounting", s["data"])

    def test_nothing_enabled(self):
        self.only([])
        s = self.summary()
        self.assertEqual(s["data"], {})
        self.assertEqual(s["widgets"], [])

    def test_user_tabs_narrow_blocks(self):
        # unmanaged business: every module live; a cashier sees POS but not accounting/inventory
        s = self.summary(self.cashier)
        self.assertIn("pos", s["data"])
        self.assertNotIn("accounting", s["data"])
        self.assertNotIn("inventory", s["data"])
        self.assertIn("deliveries", s["data"])  # cashier default tabs include dispatch

    def test_used_modules_hide_live_modules_from_dashboard(self):
        self.b.industry_options = {"used_modules": ["accounting"]}
        self.b.save()
        self.assertEqual(dashboard_modules(self.b), {"accounting"})
        s = self.summary()
        self.assertEqual(set(s["data"]), {"accounting", "receivables"})

    def test_numbers_and_alerts(self):
        self.only(["pos", "inventory", "accounting"])
        cat = Category.all_objects.create(business=self.b, name="عمومی")
        Food.all_objects.create(business=self.b, category=cat, name="کالا", price=1000, final_price=1000)
        Order.all_objects.create(business=self.b, total_price=5000, status="delivered")
        Order.all_objects.create(business=self.b, total_price=9999, status="cancelled")
        SalesInvoice.all_objects.create(business=self.b, total=Decimal("20000"), discount=Decimal("0"),
                                        paid_amount=Decimal("5000"), date=timezone.localdate())
        SalesInvoice.all_objects.create(business=self.b, total=Decimal("7000"), paid_amount=Decimal("7000"),
                                        date=timezone.localdate() - datetime.timedelta(days=40))
        RawMaterial.all_objects.create(business=self.b, name="مواد", unit="kg", quantity=1, minimum_stock=5)
        self.b.subscription_ends_at = timezone.now() + datetime.timedelta(days=2)
        self.b.save()
        s = self.summary()
        d = s["data"]
        self.assertEqual(d["pos"]["today_sales"], 5000)
        self.assertEqual(d["invoices"]["unpaid_count"], 1)
        self.assertEqual(d["invoices"]["unpaid_total"], 15000)
        self.assertEqual(d["sales"]["today"], 25000)
        self.assertEqual(d["inventory"]["low_stock_count"], 1)
        alerts = {a["key"]: a for a in s["alerts"]}
        self.assertIn("low_stock", alerts)
        self.assertEqual(alerts["unpaid_invoices"]["count"], 1)
        self.assertEqual(alerts["subscription"]["level"], "error")
        steps = {c["key"]: c["done"] for c in s["checklist"]}
        self.assertTrue(steps["products"])
        self.assertTrue(steps["items"])

    def test_terms_follow_industry(self):
        self.b.industry = "restaurant"
        self.b.save()
        self.assertEqual(self.summary()["terms"]["spot"]["en"], "Table")
        self.b.industry = "manufacturing"
        self.b.save()
        s = self.summary()
        self.assertEqual(s["industry"]["key"], "manufacturing")
        self.assertEqual(s["terms"]["production_place"]["en"], "Production line")
        self.assertEqual(s["widgets"][0], "production")

    def test_other_business_data_never_leaks(self):
        other = Business.objects.create(name="دیگری", slug="other-co")
        Order.all_objects.create(business=other, total_price=777, status="delivered")
        self.assertEqual(self.summary()["data"]["pos"]["today_sales"], 0)


class SeederTests(Base):
    def test_seed_follows_industry(self):
        from bizsuite.seeders import seed_sample_data
        self.b.industry = "manufacturing"
        self.b.save()
        self.assertTrue(seed_sample_data(self.b))
        names = set(Food.all_objects.filter(business=self.b).values_list("name", flat=True))
        self.assertIn("مایع ظرفشویی ۴ لیتری", names)
        self.assertFalse(any("پیتزا" in n for n in names))
