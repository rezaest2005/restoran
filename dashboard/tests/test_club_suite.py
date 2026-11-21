"""Customer club as a standalone product: rules, tiers, expiry, coupons, rewards, wallet,
referrals, campaigns, segments/RFM, reports and the public member page."""

from datetime import date, timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bizsuite import club_services as cs
from bizsuite.club_analytics import _quintile_scores, rfm_segment, segment_counts
from bizsuite.club_campaigns import run_campaign, run_daily_for
from bizsuite.models import (
    Business, Category, Food, LoyaltyCampaign, LoyaltyCoupon, LoyaltyMember, LoyaltyMessage,
    LoyaltyPurchase, LoyaltyTransaction, Order, OrderItem, User,
)
from bizsuite.modules import apply_modules, ensure_catalog
from bizsuite.tenancy import clear_current_business

ALL = ["pos", "club", "inventory", "production", "accounting", "delivery", "feedback", "storefront"]


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.biz = Business.objects.create(name="سالن", slug="club-suite")
        cls.other = Business.objects.create(name="دیگر", slug="club-suite-2")
        cls.owner = User.objects.create_user(
            username="cs1", password="Pass12345!", role="owner", business=cls.biz)

    def setUp(self):
        clear_current_business()
        cache.clear()
        self.api = APIClient()
        self.api.force_authenticate(self.owner)
        r = self.api.put("/api/club/settings/", {
            "is_active": True, "earn_amount": 10000, "redeem_value": 1000, "min_redeem_points": 5,
            "welcome_points": 0}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def member(self, phone="09120000001", name="سارا", **kw):
        return cs.get_or_create_member(self.biz, phone, name, **kw)[0]

    def buy(self, m, amount, **kw):
        return cs.record_purchase(self.biz, m, amount, **kw)


class StandaloneTests(Base):
    def test_club_only_tenant_records_purchase_without_pos(self):
        ensure_catalog()
        apply_modules(self.biz, {c: {"is_enabled": c == "club"} for c in ALL})
        r = self.api.post("/api/club/purchases/", {"phone": "09121112222", "name": "مینا",
                                                   "amount": 250000, "reference": "F-1"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["data"]["points_earned"], 25)
        self.assertEqual(r.json()["data"]["member"]["visits"], 1)
        self.assertEqual(self.api.get("/api/pos/daily-report/").status_code, 403)

    def test_checkout_routes_closed_when_club_module_off(self):
        ensure_catalog()
        apply_modules(self.biz, {c: {"is_enabled": c == "pos"} for c in ALL})
        r = self.api.post("/api/club/purchases/", {"phone": "09121112222", "amount": 1000}, format="json")
        self.assertGreaterEqual(r.status_code, 400)
        self.assertFalse(LoyaltyPurchase.all_objects.exists())

    def test_pos_order_still_earns_with_items(self):
        cat = Category.all_objects.create(business=self.biz, name="نوشیدنی")
        food = Food.all_objects.create(business=self.biz, category=cat, name="قهوه", price=50000,
                                       final_price=50000, stock=10, is_available=True)
        self.api.post("/api/club/rules/", {"name": "قهوه دوبل", "kind": "category", "match": "نوشیدنی",
                                           "multiplier": "2"}, format="json")
        o = Order.all_objects.create(business=self.biz, customer_name="علی", phone="09125550000",
                                     total_price=100000, payment_status="paid")
        OrderItem.all_objects.create(business=self.biz, order=o, food=food, item_name="قهوه", quantity=2,
                                     price=50000)
        self.assertEqual(cs.earn_for_order(o), 20)  # 10 base + 10 category bonus
        self.assertEqual(cs.earn_for_order(o), 0)
        self.assertEqual(LoyaltyPurchase.all_objects.filter(order=o).count(), 1)


class RulesAndTiersTests(Base):
    def test_visit_min_amount_weekday_and_tier_multiplier(self):
        self.api.put("/api/club/settings/", {"visit_points": 2}, format="json")
        self.api.post("/api/club/rules/", {"name": "بالای ۵۰۰", "kind": "min_amount", "min_amount": 500000,
                                           "bonus_points": 10}, format="json")
        self.api.post("/api/club/rules/", {"name": "همه‌روزه", "kind": "weekday", "multiplier": "1.5",
                                           "weekdays": list(range(7))}, format="json")
        m = self.member()
        p = self.buy(m, 600000)
        # base 60 + visit 2 + min_amount 10 + weekday 30 = 102
        self.assertEqual(p.points_earned, 102)
        self.api.post("/api/club/tiers/", {"name": "طلایی", "min_value": 100, "multiplier": "2"}, format="json")
        m.refresh_from_db()
        self.assertEqual(m.tier.name, "طلایی")
        p2 = self.buy(m, 100000)   # (10 + 2 + 15) * 2 = 54
        self.assertEqual(p2.points_earned, 54)

    def test_tier_auto_downgrade_with_rolling_window(self):
        self.api.put("/api/club/settings/", {"tier_basis": "spend", "tier_window_days": 30}, format="json")
        self.api.post("/api/club/tiers/", {"name": "VIP", "min_value": 1000000}, format="json")
        m = self.member()
        p = self.buy(m, 1500000)
        m.refresh_from_db()
        self.assertEqual(m.tier.name, "VIP")
        LoyaltyPurchase.all_objects.filter(pk=p.pk).update(created_at=timezone.now() - timedelta(days=40))
        run_daily_for(self.biz)
        m.refresh_from_db()
        self.assertIsNone(m.tier)


class LedgerTests(Base):
    def test_expiry_is_fifo_and_redeem_uses_oldest_first(self):
        self.api.put("/api/club/settings/", {"points_expiry_days": 30}, format="json")
        m = self.member()
        self.buy(m, 100000)   # 10 pts, lot A
        LoyaltyTransaction.all_objects.filter(member=m, kind="earn").update(
            expires_at=timezone.now() - timedelta(days=1))
        self.buy(m, 50000)    # 5 pts, lot B
        cs.adjust_points(m, -3)          # consumes from lot A (earliest expiry)
        expired = run_daily_for(self.biz)["expired"]
        self.assertEqual(expired, 7)
        m.refresh_from_db()
        self.assertEqual(m.points_balance, 5)
        self.assertTrue(LoyaltyTransaction.all_objects.filter(member=m, kind="expire", points=-7).exists())

    def test_redeem_cap_and_void_reverses_everything(self):
        self.api.put("/api/club/settings/", {"redeem_max_percent": 50, "wallet_enabled": True}, format="json")
        m = self.member()
        self.buy(m, 300000)   # 30 pts
        cs.wallet_change(m, 20000, "topup")
        with self.assertRaises(ValueError):
            cs.quote_purchase(self.biz, m, 20000, redeem=20)   # 20000 > 50% of 20000
        p = self.buy(m, 100000, redeem=10, wallet_amount=20000)
        self.assertEqual(p.points_discount, 10000)
        self.assertEqual(p.net_amount, 90000)
        self.assertEqual(p.points_earned, 9)
        m.refresh_from_db()
        self.assertEqual((m.points_balance, int(m.wallet_balance), m.visits), (29, 0, 2))
        r = self.api.post(f"/api/club/purchases/{p.id}/void/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        m.refresh_from_db()
        self.assertEqual((m.points_balance, int(m.wallet_balance), m.visits), (30, 20000, 1))
        self.assertEqual(self.api.post(f"/api/club/purchases/{p.id}/void/", {}, format="json").status_code, 400)


class CouponRewardTests(Base):
    def test_coupon_limits(self):
        r = self.api.post("/api/club/coupons/", {"code": "yalda20", "kind": "percent", "value": 20,
                                                 "max_discount": 30000, "usage_limit": 2, "per_member_limit": 1,
                                                 "min_purchase": 50000}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        a, b, c = self.member("09120000011"), self.member("09120000012"), self.member("09120000013")
        chk = self.api.post("/api/club/coupons/check/", {"code": "YALDA20", "amount": 200000,
                                                         "member_id": a.id}, format="json")
        self.assertEqual(chk.json()["data"]["discount"], 30000)   # capped
        with self.assertRaises(ValueError):
            cs.quote_purchase(self.biz, a, 40000, coupon_code="YALDA20")   # min purchase
        self.buy(a, 100000, coupon_code="YALDA20")
        with self.assertRaises(ValueError):
            self.buy(a, 100000, coupon_code="YALDA20")    # per member
        self.buy(b, 100000, coupon_code="YALDA20")
        with self.assertRaises(ValueError):
            self.buy(c, 100000, coupon_code="YALDA20")    # total limit
        self.assertEqual(LoyaltyCoupon.all_objects.get(code="YALDA20").used_count, 2)

    def test_reward_redemption_creates_personal_coupon(self):
        rw = self.api.post("/api/club/rewards/", {"name": "قهوه رایگان", "points_cost": 20, "kind": "free_item",
                                                  "value": 60000, "stock": 1}, format="json").json()["data"]
        m = self.member()
        self.buy(m, 500000)   # 50 pts
        r = self.api.post(f"/api/club/members/{m.id}/reward/", {"reward_id": rw["id"]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        code = r.json()["data"]["code"]
        m.refresh_from_db()
        self.assertEqual(m.points_balance, 30)
        other = self.member("09129999999")
        with self.assertRaises(ValueError):
            cs.validate_coupon(self.biz, code, other, 100000)
        p = self.buy(m, 100000, coupon_code=code)
        self.assertEqual(p.coupon_discount, 60000)
        r2 = self.api.post(f"/api/club/members/{m.id}/reward/", {"reward_id": rw["id"]}, format="json")
        self.assertEqual(r2.status_code, 400)   # out of stock


class ReferralCampaignTests(Base):
    def test_referral_points_after_first_purchase(self):
        self.api.put("/api/club/settings/", {"referrer_points": 50, "referee_points": 20}, format="json")
        ref = self.member("09120000100", "معرف")
        friend = self.member("09120000200", "دوست", referral_code=ref.code.lower())
        self.assertEqual(friend.referred_by_id, ref.id)
        self.assertEqual(friend.points_balance, 20)
        ref.refresh_from_db()
        self.assertEqual(ref.points_balance, 0)
        self.buy(friend, 10000)
        self.buy(friend, 10000)
        ref.refresh_from_db()
        self.assertEqual(ref.points_balance, 50)   # once only

    def test_birthday_campaign_is_idempotent_and_queues_message(self):
        self.api.put("/api/club/settings/", {"sms_enabled": True}, format="json")
        today = timezone.localdate()
        m = self.member()
        LoyaltyMember.all_objects.filter(pk=m.pk).update(birth_date=date(1990, today.month, min(today.day, 28)))
        if today.day > 28:
            return
        c = LoyaltyCampaign.all_objects.create(business=self.biz, name="تولد", kind="birthday", bonus_points=30,
                                               coupon_kind="percent", coupon_value=10,
                                               message="{name} عزیز تولدت مبارک! کد: {coupon}")
        self.assertEqual(run_campaign(c), 1)
        self.assertEqual(run_campaign(c), 0)
        m.refresh_from_db()
        self.assertEqual(m.points_balance, 30)
        msg = LoyaltyMessage.all_objects.get(member=m)
        self.assertIn("سارا", msg.body)
        self.assertEqual(msg.status, "queued")
        self.assertTrue(LoyaltyCoupon.all_objects.filter(member=m, campaign=c).exists())

    def test_inactivity_campaign_once_per_absence(self):
        m = self.member()
        self.buy(m, 10000)
        LoyaltyMember.all_objects.filter(pk=m.pk).update(last_purchase_at=timezone.now() - timedelta(days=90))
        c = LoyaltyCampaign.all_objects.create(business=self.biz, name="دلتنگ", kind="inactivity",
                                               inactivity_days=60, bonus_points=5, message="برگرد!")
        self.assertEqual(run_campaign(c), 1)
        self.assertEqual(run_campaign(c), 0)
        msg = LoyaltyMessage.all_objects.get(member=m)
        self.assertEqual(msg.status, "skipped")    # sms disabled -> recorded, not sent


class AnalyticsTests(Base):
    def test_segments_reports_and_rfm(self):
        now = timezone.now()
        new = self.member("09120000301")
        loyal = self.member("09120000302")
        lost = self.member("09120000303")
        for _ in range(5):
            self.buy(loyal, 50000)
        self.buy(lost, 50000)
        LoyaltyMember.all_objects.filter(pk__in=[loyal.pk, lost.pk]).update(joined_at=now - timedelta(days=400))
        LoyaltyMember.all_objects.filter(pk=lost.pk).update(last_purchase_at=now - timedelta(days=200))
        counts = segment_counts(self.biz)
        self.assertEqual((counts["new"], counts["loyal"], counts["lost"]), (1, 1, 1))
        r = self.api.get("/api/club/members/?segment=lost").json()["data"]
        self.assertEqual([x["id"] for x in r], [lost.id])
        rep = self.api.get("/api/club/reports/?days=30").json()["data"]
        self.assertEqual(rep["members_total"], 3)
        self.assertEqual(rep["purchases"], 5)
        self.assertEqual(rep["points_outstanding"], 30)
        self.assertEqual(rep["liability"], 30000)
        self.assertEqual(rep["repeat_rate"], 50.0)
        self.assertIsNotNone(new)

    def test_rfm_helpers(self):
        self.assertEqual(_quintile_scores([1, 2, 3, 4, 5]), [1, 2, 3, 4, 5])
        self.assertEqual(_quintile_scores([1, 2, 3, 4, 5], reverse=True), [5, 4, 3, 2, 1])
        self.assertEqual(rfm_segment(5, 5, 5), "champions")
        self.assertEqual(rfm_segment(1, 3, 1), "lost")


class PublicPageTests(Base):
    def test_public_lookup_requires_phone_and_code(self):
        pub = APIClient()
        self.assertEqual(pub.get("/api/public/club/club-suite/").status_code, 404)  # not enabled yet
        self.api.put("/api/club/settings/", {"public_lookup_enabled": True}, format="json")
        self.assertEqual(pub.get("/api/public/club/club-suite/").status_code, 200)
        m = self.member()
        self.buy(m, 120000)
        bad = pub.post("/api/public/club/club-suite/lookup/", {"phone": m.phone, "code": "WRONG1"}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = pub.post("/api/public/club/club-suite/lookup/", {"phone": m.phone, "code": m.code.lower()},
                      format="json")
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(ok.json()["data"]["points"], 12)
        for _ in range(5):
            pub.post("/api/public/club/club-suite/lookup/", {"phone": m.phone, "code": "X"}, format="json")
        self.assertEqual(pub.post("/api/public/club/club-suite/lookup/", {"phone": m.phone, "code": m.code},
                                  format="json").status_code, 429)

    def test_public_join_with_referral_no_enumeration(self):
        self.api.put("/api/club/settings/", {"public_lookup_enabled": True, "referee_points": 7}, format="json")
        ref = self.member("09120000500")
        pub = APIClient()
        r1 = pub.post("/api/public/club/club-suite/join/", {"name": "نو", "phone": "09120000600",
                                                            "referral_code": ref.code}, format="json")
        r2 = pub.post("/api/public/club/club-suite/join/", {"name": "نو", "phone": "09120000600"}, format="json")
        self.assertEqual(r1.json()["message"], r2.json()["message"])
        m = LoyaltyMember.all_objects.get(business=self.biz, phone="09120000600")
        self.assertEqual((m.referred_by_id, m.points_balance), (ref.id, 7))

    def test_tenant_isolation_of_new_endpoints(self):
        m = self.member()
        u2 = User.objects.create_user(username="cs2", password="Pass12345!", role="owner", business=self.other)
        api2 = APIClient()
        api2.force_authenticate(u2)
        self.assertEqual(api2.get(f"/api/club/members/{m.id}/").status_code, 404)
        self.api.post("/api/club/coupons/", {"code": "MINE", "value": 1000}, format="json")
        self.assertEqual(api2.get("/api/club/coupons/").json()["data"], [])
        self.assertEqual(api2.post("/api/club/coupons/check/", {"code": "MINE", "amount": 5000},
                                   format="json").status_code, 400)
