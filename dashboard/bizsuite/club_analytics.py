"""
باشگاه مشتریان — بخش‌بندی، RFM و گزارش‌ها.

* بخش‌های ساده (جدید، وفادار، عادی، در خطر، از دست رفته) با آستانه‌های قابل تنظیم — یک ``Q`` برای
  شمارش، فیلتر فهرست و کمپین.
* RFM: امتیاز ۱..۵ با پنجک‌های هم‌فراوانی روی رتبه، و جدول نگاشت امتیاز به بخش اقتباس‌شده از
  بسته‌ی MIT «rfm» (github.com/sonwanesuresh95/rfm) — بدون pandas، بازنویسی با پایتون خالص.
"""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone

from .club_services import get_settings
from .models import LoyaltyMember, LoyaltyPurchase, LoyaltyTier, LoyaltyTransaction

SEGMENTS = ["new", "loyal", "regular", "at_risk", "lost"]
RFM_SEGMENTS = ["champions", "loyal_accounts", "promising", "potential_loyalist", "new_active",
                "low_spenders", "need_attention", "about_to_sleep", "at_risk", "lost", "other"]

SPENT_KINDS = ["redeem", "reward"]


# ───────────────────────── simple segments ─────────────────────────

def _inactive_since(days, now):
    cut = now - timedelta(days=days)
    return Q(last_purchase_at__lt=cut) | Q(last_purchase_at__isnull=True, joined_at__lt=cut)


def segment_q(segment, cfg, now=None):
    """فیلتر هر بخش؛ بخش‌ها با هم هم‌پوشانی ندارند (به ترتیب SEGMENTS)."""
    now = now or timezone.now()
    new = Q(joined_at__gte=now - timedelta(days=cfg.new_days))
    lost = _inactive_since(cfg.lost_days, now) & ~new
    at_risk = _inactive_since(cfg.at_risk_days, now) & ~new & ~lost
    loyal = Q(visits__gte=max(1, cfg.loyal_visits)) & ~new & ~lost & ~at_risk
    regular = ~new & ~lost & ~at_risk & ~loyal
    return {"new": new, "lost": lost, "at_risk": at_risk, "loyal": loyal, "regular": regular}.get(segment)


def segment_of(member, cfg, now=None):
    now = now or timezone.now()
    if member.joined_at >= now - timedelta(days=cfg.new_days):
        return "new"
    ref = member.last_purchase_at or member.joined_at
    if ref < now - timedelta(days=cfg.lost_days):
        return "lost"
    if ref < now - timedelta(days=cfg.at_risk_days):
        return "at_risk"
    if member.visits >= max(1, cfg.loyal_visits):
        return "loyal"
    return "regular"


def segment_counts(business, cfg=None, now=None):
    cfg = cfg or get_settings(business)
    base = LoyaltyMember.all_objects.filter(business=business, is_active=True)
    return {s: base.filter(segment_q(s, cfg, now)).count() for s in SEGMENTS}


# ───────────────────────── RFM ─────────────────────────

def _quintile_scores(values, reverse=False):
    """
    امتیاز ۱..۵ هم‌فراوانی روی رتبه (معادل pd.qcut(rank(method="first"), 5)).
    reverse=True یعنی مقدار کمتر بهتر است (تازگی بر حسب روز).
    """
    n = len(values)
    order = sorted(range(n), key=lambda i: (values[i], i), reverse=reverse)
    scores = [0] * n
    for rank, idx in enumerate(order):
        scores[idx] = min(5, rank * 5 // max(n, 1) + 1)
    return scores


def rfm_segment(r, f, m):
    """نگاشت امتیاز RFM به بخش — اقتباس از جدول بسته‌ی MIT ``rfm`` (sonwanesuresh95/rfm)."""
    if r in (4, 5) and f in (4, 5) and m in (4, 5):
        return "champions"
    if r in (4, 5) and f in (1, 2) and m in (3, 4, 5):
        return "promising"
    if r in (3, 4, 5) and f in (3, 4, 5) and m in (3, 4, 5):
        return "loyal_accounts"
    if r in (3, 4, 5) and f in (2, 3) and m in (2, 3, 4):
        return "potential_loyalist"
    if r == 5 and f == 1:
        return "new_active"
    if r in (3, 4, 5) and m in (1, 2):
        return "low_spenders"
    if r in (2, 3) and f in (1, 2) and m in (4, 5):
        return "need_attention"
    if r in (2, 3) and f in (1, 2) and m in (1, 2, 3):
        return "about_to_sleep"
    if r in (1, 2) and m in (3, 4, 5):
        return "at_risk"
    if r in (1, 2) and m in (1, 2):
        return "lost"
    return "other"


def rfm_table(business, now=None):
    """{member_id: {"r","f","m","score","segment","recency_days"}} برای اعضایی که خرید داشته‌اند."""
    now = now or timezone.now()
    rows = list(LoyaltyMember.all_objects.filter(business=business, is_active=True, visits__gt=0,
                                                 last_purchase_at__isnull=False)
                .values("id", "last_purchase_at", "visits", "total_spent"))
    if not rows:
        return {}
    rec = [(now - r["last_purchase_at"]).days for r in rows]
    rs = _quintile_scores(rec, reverse=True)   # تازه‌ترین → ۵
    fs = _quintile_scores([r["visits"] for r in rows])
    ms = _quintile_scores([int(r["total_spent"] or 0) for r in rows])
    out = {}
    for i, r in enumerate(rows):
        out[r["id"]] = {"r": rs[i], "f": fs[i], "m": ms[i], "score": f"{rs[i]}{fs[i]}{ms[i]}",
                        "segment": rfm_segment(rs[i], fs[i], ms[i]), "recency_days": rec[i]}
    return out


def rfm_counts(table):
    counts = {s: 0 for s in RFM_SEGMENTS}
    for v in table.values():
        counts[v["segment"]] = counts.get(v["segment"], 0) + 1
    return counts


# ───────────────────────── reports ─────────────────────────

def report(business, days=30, now=None):
    """گزارش خلاصه‌ی باشگاه برای یک بازه (روز)."""
    now = now or timezone.now()
    cfg = get_settings(business)
    days = max(1, min(int(days or 30), 3650))
    start = now - timedelta(days=days)
    prev_start = start - timedelta(days=days)
    members = LoyaltyMember.all_objects.filter(business=business)
    purchases = LoyaltyPurchase.all_objects.filter(business=business, is_void=False)
    cur = purchases.filter(created_at__gte=start)
    tx = LoyaltyTransaction.all_objects.filter(business=business, created_at__gte=start)

    pagg = cur.aggregate(n=Count("id"), revenue=Sum("net_amount"), disc_p=Sum("points_discount"),
                         disc_c=Sum("coupon_discount"))
    cur_buyers = set(cur.values_list("member_id", flat=True).distinct())
    prev_buyers = set(purchases.filter(created_at__gte=prev_start, created_at__lt=start)
                      .values_list("member_id", flat=True).distinct())
    retained = len(cur_buyers & prev_buyers)
    bal = members.aggregate(points=Sum("points_balance"), wallet=Sum("wallet_balance"))
    ever = members.filter(visits__gte=1).count()
    repeat = members.filter(visits__gte=2).count()

    def tx_sum(kinds, sign=1):
        v = tx.filter(kind__in=kinds).aggregate(s=Sum("points"))["s"] or 0
        return int(v) * sign

    rfm = rfm_table(business, now)
    tiers = [{"id": t.id, "name": t.name, "color": t.color,
              "count": members.filter(tier=t, is_active=True).count()}
             for t in LoyaltyTier.all_objects.filter(business=business).order_by("min_value")]
    top = (cur.values("member_id", "member__name", "member__phone")
           .annotate(spent=Sum("net_amount"), n=Count("id")).order_by("-spent")[:10])
    revenue = int(pagg["revenue"] or 0)
    return {
        "days": days,
        "members_total": members.count(),
        "members_active": len(cur_buyers),
        "members_new": members.filter(joined_at__gte=start).count(),
        "purchases": pagg["n"] or 0,
        "revenue": revenue,
        "avg_basket": int(revenue / pagg["n"]) if pagg["n"] else 0,
        "discount_points": int(pagg["disc_p"] or 0),
        "discount_coupons": int(pagg["disc_c"] or 0),
        "points_issued": int(tx.filter(points__gt=0).exclude(kind="reverse")
                             .aggregate(s=Sum("points"))["s"] or 0),
        "points_redeemed": tx_sum(SPENT_KINDS, -1),
        "points_expired": tx_sum(["expire"], -1),
        "points_outstanding": int(bal["points"] or 0),
        "liability": int(bal["points"] or 0) * cfg.redeem_value,
        "wallet_liability": int(bal["wallet"] or 0),
        "retention_rate": round(retained * 100 / len(prev_buyers), 1) if prev_buyers else None,
        "repeat_rate": round(repeat * 100 / ever, 1) if ever else None,
        "segments": segment_counts(business, cfg, now),
        "rfm": rfm_counts(rfm),
        "tiers": tiers,
        "top_members": [{"id": r["member_id"], "name": r["member__name"], "phone": r["member__phone"],
                         "spent": int(r["spent"] or 0), "purchases": r["n"]} for r in top],
    }
