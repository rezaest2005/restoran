"""
باشگاه مشتریان — API کارکنان

  /api/club/settings/                    GET / PUT
  /api/club/members/                     GET (?q=&segment=&tier=) / POST
  /api/club/members/<pk>/                GET (پرونده) / PUT (ویرایش مشخصات)
  /api/club/members/<pk>/adjust/         POST اصلاح دستی امتیاز
  /api/club/members/<pk>/wallet/         POST شارژ/اصلاح کیف پول
  /api/club/members/<pk>/reward/         POST {reward_id} معاوضه‌ی جایزه → کوپن
  /api/club/lookup/                      POST {phone | code}   (صندوق)
  /api/club/redeem/                      POST {phone, points}  (صندوق)
  /api/club/purchases/                   GET / POST  ثبت خرید (بدون صندوق هم کار می‌کند)
  /api/club/purchases/quote/             POST پیش‌نمایش تخفیف و امتیاز
  /api/club/purchases/<pk>/void/         POST ابطال خرید
  /api/club/coupons/check/               POST {code, amount, phone?}
  /api/club/{tiers,rules,rewards,coupons,campaigns}/[<pk>/]   CRUD
  /api/club/campaigns/<pk>/run/          POST اجرای فوری
  /api/club/messages/                    GET صندوق خروجی پیام‌ها
  /api/club/reports/?days=30             GET گزارش
  /api/club/run-daily/                   POST اجرای فوری کار روزانه برای این کسب‌وکار
"""

from datetime import date
from decimal import Decimal

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ..activity import audit
from ..club_analytics import SEGMENTS, report, rfm_table, segment_of, segment_q
from ..club_campaigns import ensure_daily_scheduled, run_campaign, run_daily_for
from ..club_services import (
    adjust_points, create_coupon, expiring_soon, find_member, get_or_create_member, get_settings,
    normalize_phone, quote_purchase, record_purchase, redeem_points, redeem_reward, to_int,
    validate_coupon, void_purchase, wallet_change,
)
from ..modules import module_enabled
from ..models import (
    Customer, LoyaltyCampaign, LoyaltyCoupon, LoyaltyEarnRule, LoyaltyMember, LoyaltyMessage,
    LoyaltyPurchase, LoyaltyReward, LoyaltySettings, LoyaltyTier, LoyaltyWalletTransaction,
)
from ..utils import api_error, api_success
from .common import CashierPerm, ClubPerm, StaffAuth, staff_business

LIMIT = 200
NO_BIZ = "کسب‌وکاری برای این کاربر تعریف نشده است."

INT_SETTINGS = {
    "earn_amount": 1, "visit_points": 0, "redeem_value": 0, "min_redeem_points": 1, "welcome_points": 0,
    "points_expiry_days": 0, "tier_window_days": 0, "referrer_points": 0, "referee_points": 0,
    "new_days": 1, "at_risk_days": 1, "lost_days": 1, "loyal_visits": 1,
}
BOOL_SETTINGS = ("is_active", "wallet_enabled", "public_lookup_enabled", "sms_enabled")


def _iso(v):
    return v.isoformat() if v else None


def _money(v):
    return int(v) if v is not None else None


def _settings_data(cfg):
    d = {k: getattr(cfg, k) for k in list(INT_SETTINGS) + list(BOOL_SETTINGS)}
    d.update(redeem_max_percent=cfg.redeem_max_percent, tier_basis=cfg.tier_basis,
             business_slug=getattr(cfg.business, "slug", ""))
    return d


def _tier_data(t):
    if t is None:
        return None
    return {"id": t.id, "name": t.name, "min_value": t.min_value, "multiplier": str(t.multiplier),
            "color": t.color, "perks": t.perks}


def _member_data(m, cfg, rfm=None):
    return {
        "id": m.id, "phone": m.phone, "name": m.name, "code": m.code,
        "points_balance": m.points_balance, "lifetime_points": m.lifetime_points,
        "wallet_balance": int(m.wallet_balance), "total_spent": int(m.total_spent), "visits": m.visits,
        "last_purchase_at": _iso(m.last_purchase_at), "tier": _tier_data(m.tier) if m.tier_id else None,
        "segment": segment_of(m, cfg), "rfm": (rfm or {}).get(m.id),
        "is_active": m.is_active, "joined_at": _iso(m.joined_at),
    }


def _member_full(m, cfg):
    d = _member_data(m, cfg, rfm_table(m.business))
    d.update({
        "email": m.email, "birth_date": _iso(m.birth_date), "anniversary_date": _iso(m.anniversary_date),
        "note": m.note, "tags": m.tags or [], "sms_opt_in": m.sms_opt_in, "customer_id": m.customer_id,
        "referred_by": ({"id": m.referred_by.id, "name": m.referred_by.name, "code": m.referred_by.code}
                        if m.referred_by_id else None),
        "referrals": m.referrals.count(), "expiring_30d": expiring_soon(m, 30),
        "max_discount": m.points_balance * cfg.redeem_value,
    })
    return d


def _biz(request):
    """کسب‌وکار کاربر؛ اگر ماژول باشگاه خاموش باشد None (مسیرهای صندوق با مجوز pos هم باز هستند)."""
    business = staff_business(request)
    if business is not None and not module_enabled(business, "club"):
        return None
    return business


# ───────────────────────── settings ─────────────────────────

@api_view(["GET", "PUT"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
@audit("pos", "club_settings", "تنظیمات باشگاه")
def club_settings(request):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    cfg = get_settings(business)
    if request.method == "GET":
        return api_success(data=_settings_data(cfg))
    d = request.data
    try:
        for k in BOOL_SETTINGS:
            if k in d:
                setattr(cfg, k, bool(d[k]))
        for k, minimum in INT_SETTINGS.items():
            if k in d:
                setattr(cfg, k, to_int(d[k], k, minimum=minimum, maximum=10**9))
        if "redeem_max_percent" in d:
            cfg.redeem_max_percent = to_int(d["redeem_max_percent"], "redeem_max_percent", 1, 100)
        if "tier_basis" in d:
            if d["tier_basis"] not in LoyaltySettings.TierBasis.values:
                raise ValueError("tier_basis")
            cfg.tier_basis = d["tier_basis"]
    except (ValueError, TypeError):
        return api_error("مقادیر تنظیمات نامعتبر است.")
    if not (cfg.at_risk_days < cfg.lost_days):
        return api_error("روزهای «از دست رفته» باید بیشتر از «در خطر» باشد.")
    cfg.save()
    if cfg.is_active:
        try:
            ensure_daily_scheduled()
        except Exception:
            pass
    return api_success(data=_settings_data(cfg), message="ذخیره شد.")


# ───────────────────────── members ─────────────────────────

def _parse_date(v):
    if v in (None, ""):
        return None
    return date.fromisoformat(str(v)[:10])


def _profile_from(data, business):
    out = {}
    if "email" in data:
        out["email"] = str(data.get("email") or "")[:254]
    for k in ("birth_date", "anniversary_date"):
        if k in data:
            out[k] = _parse_date(data.get(k))
    if "note" in data:
        out["note"] = str(data.get("note") or "")[:500]
    if "tags" in data:
        tags = data.get("tags") or []
        if isinstance(tags, str):
            tags = [t for t in tags.split(",")]
        out["tags"] = [str(t).strip()[:40] for t in tags if str(t).strip()][:20]
    if "sms_opt_in" in data:
        out["sms_opt_in"] = bool(data.get("sms_opt_in"))
    if "customer_id" in data:
        cid = data.get("customer_id") or None
        if cid and not Customer.all_objects.filter(business=business, pk=cid).exists():
            raise ValueError("مشتری پیدا نشد.")
        out["customer_id"] = cid
    return out


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
def club_members(request):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    cfg = get_settings(business)
    if request.method == "GET":
        qs = LoyaltyMember.objects.filter(business=business).select_related("tier")
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(phone__icontains=q) | Q(name__icontains=q) | Q(code__iexact=q))
        seg = request.query_params.get("segment") or ""
        if seg in SEGMENTS:
            qs = qs.filter(segment_q(seg, cfg))
        tier = request.query_params.get("tier") or ""
        if tier == "none":
            qs = qs.filter(tier__isnull=True)
        elif tier.isdigit():
            qs = qs.filter(tier_id=int(tier))
        sort = {"points": "-points_balance", "spent": "-total_spent", "recent": "-last_purchase_at",
                "visits": "-visits"}.get(request.query_params.get("sort") or "", "-joined_at")
        rows = list(qs.order_by(sort, "-id")[:LIMIT])
        rfm = rfm_table(business)
        return api_success(data=[_member_data(m, cfg, rfm) for m in rows])

    try:
        profile = _profile_from(request.data, business)
        member, created = get_or_create_member(
            business, request.data.get("phone"), request.data.get("name", ""), user=request.user,
            referral_code=str(request.data.get("referral_code") or ""), **profile)
    except ValueError as exc:
        return api_error(str(exc))
    member.refresh_from_db()
    return api_success(data=_member_data(member, cfg),
                       message="عضو ثبت شد." if created else "این شماره قبلاً عضو است.",
                       status_code=201 if created else 200)


@api_view(["GET", "PUT"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
@audit("pos", "club_member", "عضو باشگاه")
def club_member_detail(request, pk):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    m = get_object_or_404(LoyaltyMember.objects.filter(business=business).select_related("tier", "referred_by"),
                          pk=pk)
    cfg = get_settings(business)
    if request.method == "PUT":
        d = request.data
        try:
            fields = _profile_from(d, business)
            if "name" in d:
                fields["name"] = str(d.get("name") or "")[:200]
            if "is_active" in d:
                fields["is_active"] = bool(d.get("is_active"))
            if "phone" in d:
                phone = normalize_phone(d.get("phone"))
                if LoyaltyMember.all_objects.filter(business=business, phone=phone).exclude(pk=m.pk).exists():
                    raise ValueError("این شماره متعلق به عضو دیگری است.")
                fields["phone"] = phone
        except ValueError as exc:
            return api_error(str(exc))
        for k, v in fields.items():
            setattr(m, k, v)
        m.save()
    data = _member_full(m, cfg)
    data["transactions"] = [
        {"id": t.id, "points": t.points, "kind": t.kind, "kind_display": t.get_kind_display(), "note": t.note,
         "order_id": t.order_id, "purchase_id": t.purchase_id, "expires_at": _iso(t.expires_at),
         "created_at": _iso(t.created_at)}
        for t in m.transactions.all()[:100]
    ]
    data["purchases"] = [_purchase_data(p) for p in m.purchases.all()[:50]]
    data["wallet"] = [
        {"id": w.id, "amount": int(w.amount), "kind": w.kind, "kind_display": w.get_kind_display(),
         "balance_after": int(w.balance_after), "note": w.note, "created_at": _iso(w.created_at)}
        for w in m.wallet_transactions.all()[:50]
    ]
    data["coupons"] = [_coupon_data(c) for c in m.coupons.all()[:50]]
    return api_success(data=data, message="ذخیره شد." if request.method == "PUT" else "")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
@audit("pos", "club_adjust", "تعدیل امتیاز باشگاه")
def club_member_adjust(request, pk):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    m = get_object_or_404(LoyaltyMember.objects.filter(business=business), pk=pk)
    try:
        delta = int(request.data.get("points"))
    except (TypeError, ValueError):
        return api_error("مقدار امتیاز نامعتبر است.")
    try:
        m = adjust_points(m, delta, note=str(request.data.get("note") or ""), user=request.user)
    except ValueError as exc:
        return api_error(str(exc))
    m.refresh_from_db()
    return api_success(data=_member_data(m, get_settings(business)), message="اصلاح شد.")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([CashierPerm])
@audit("pos", "club_wallet", "کیف پول باشگاه")
def club_member_wallet(request, pk):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    cfg = get_settings(business)
    if not cfg.wallet_enabled:
        return api_error("کیف پول فعال نیست.")
    m = get_object_or_404(LoyaltyMember.objects.filter(business=business), pk=pk)
    kind = request.data.get("kind") or "topup"
    if kind not in (LoyaltyWalletTransaction.Kind.TOPUP, LoyaltyWalletTransaction.Kind.ADJUST):
        return api_error("نوع تراکنش نامعتبر است.")
    try:
        amount = to_int(request.data.get("amount"), "مبلغ", minimum=-10**12)
        if kind == "topup" and amount <= 0:
            raise ValueError("مبلغ شارژ باید مثبت باشد.")
        m = wallet_change(m, amount, kind, note=str(request.data.get("note") or ""), user=request.user)
    except ValueError as exc:
        return api_error(str(exc))
    m.refresh_from_db()
    return api_success(data=_member_data(m, cfg), message="ثبت شد.")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([CashierPerm])
@audit("pos", "club_reward", "معاوضه‌ی جایزه")
def club_member_reward(request, pk):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    m = get_object_or_404(LoyaltyMember.objects.filter(business=business), pk=pk)
    reward = get_object_or_404(LoyaltyReward.objects.filter(business=business), pk=request.data.get("reward_id"))
    try:
        coupon = redeem_reward(m, reward, user=request.user)
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_coupon_data(coupon), message=f"کد جایزه: {coupon.code}")


# ───────────────────────── checkout ─────────────────────────

def _rewards_for(business, member=None):
    qs = LoyaltyReward.objects.filter(business=business, is_active=True).select_related("min_tier")
    out = []
    for r in qs:
        d = _reward_data(r)
        if member is not None:
            d["affordable"] = member.points_balance >= r.points_cost
        out.append(d)
    return out


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([CashierPerm])
def club_lookup(request):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    cfg = get_settings(business)
    try:
        code = str(request.data.get("code") or "").strip()
        m = find_member(business, code=code) if code else find_member(business, phone=request.data.get("phone"))
    except ValueError as exc:
        return api_error(str(exc))
    if not m:
        return api_success(data={"member": None, "settings": _settings_data(cfg)})
    data = _member_data(m, cfg)
    data["max_discount"] = m.points_balance * cfg.redeem_value
    data["coupons"] = [_coupon_data(c) for c in m.coupons.filter(is_active=True)[:20]
                       if c.usage_limit is None or c.used_count < c.usage_limit]
    data["rewards"] = _rewards_for(business, m)
    return api_success(data={"member": data, "settings": _settings_data(cfg)})


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([CashierPerm])
@audit("pos", "club_redeem", "استفاده از امتیاز باشگاه")
def club_redeem(request):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    try:
        result = redeem_points(business, request.data.get("phone"), request.data.get("points"),
                               user=request.user, note=str(request.data.get("note") or ""))
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=result, message="امتیاز استفاده شد.")


def _purchase_data(p):
    return {
        "id": p.id, "member_id": p.member_id, "channel": p.channel, "channel_display": p.get_channel_display(),
        "amount": int(p.amount), "coupon_discount": int(p.coupon_discount),
        "points_discount": int(p.points_discount), "wallet_used": int(p.wallet_used),
        "net_amount": int(p.net_amount), "points_earned": p.points_earned, "points_redeemed": p.points_redeemed,
        "items": p.items, "order_id": p.order_id, "reference": p.reference, "note": p.note,
        "is_void": p.is_void, "created_at": _iso(p.created_at),
    }


def _checkout_member(business, data, create=False, user=None):
    if data.get("member_id"):
        return find_member(business, member_id=data.get("member_id"))
    if data.get("code"):
        return find_member(business, code=data.get("code"))
    if data.get("phone"):
        if create:
            return get_or_create_member(business, data.get("phone"), data.get("name", ""), user=user)[0]
        return find_member(business, phone=data.get("phone"))
    return None


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([CashierPerm])
def club_purchase_quote(request):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    d = request.data
    try:
        member = _checkout_member(business, d)
        q = quote_purchase(business, member, d.get("amount"), items=d.get("items"), redeem=d.get("redeem_points"),
                           coupon_code=d.get("coupon_code", ""), wallet_amount=d.get("wallet_amount"))
    except ValueError as exc:
        return api_error(str(exc))
    q.pop("coupon")
    q["is_member"] = member is not None
    return api_success(data=q)


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([CashierPerm])
@audit("pos", "club_purchase", "ثبت خرید باشگاه")
def club_purchases(request):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    if request.method == "GET":
        qs = LoyaltyPurchase.objects.filter(business=business).select_related("member")
        if request.query_params.get("member"):
            qs = qs.filter(member_id=request.query_params["member"])
        rows = []
        for p in qs[:LIMIT]:
            d = _purchase_data(p)
            d["member_name"] = p.member.name
            d["member_phone"] = p.member.phone
            rows.append(d)
        return api_success(data=rows)
    d = request.data
    try:
        member = _checkout_member(business, d, create=True, user=request.user)
        if member is None:
            raise ValueError("موبایل یا کد عضو را وارد کنید.")
        p = record_purchase(business, member, d.get("amount"), items=d.get("items"),
                            redeem=d.get("redeem_points"), coupon_code=d.get("coupon_code", ""),
                            wallet_amount=d.get("wallet_amount"), reference=d.get("reference", ""),
                            note=d.get("note", ""), user=request.user)
    except ValueError as exc:
        return api_error(str(exc))
    member.refresh_from_db()
    data = _purchase_data(p)
    data["breakdown"] = getattr(p, "breakdown", [])
    data["member"] = _member_data(member, get_settings(business))
    return api_success(data=data, message="خرید ثبت شد.", status_code=201)


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
@audit("pos", "club_purchase_void", "ابطال خرید باشگاه")
def club_purchase_void(request, pk):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    p = get_object_or_404(LoyaltyPurchase.objects.filter(business=business), pk=pk)
    try:
        p = void_purchase(p, user=request.user, note=str(request.data.get("note") or ""))
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_purchase_data(p), message="خرید باطل شد.")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([CashierPerm])
def club_coupon_check(request):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    d = request.data
    try:
        member = _checkout_member(business, d)
        c, disc = validate_coupon(business, d.get("code"), member, to_int(d.get("amount"), "مبلغ"))
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data={"coupon": _coupon_data(c), "discount": int(disc)})


# ───────────────────────── catalogue CRUD (tiers, rules, rewards, coupons, campaigns) ─────────────────────────

def _dt(v):
    from django.utils.dateparse import parse_datetime
    if v in (None, ""):
        return None
    dt = parse_datetime(str(v))
    if dt is None:
        d = date.fromisoformat(str(v)[:10])
        from datetime import datetime, time
        from django.utils import timezone as tz
        dt = tz.make_aware(datetime.combine(d, time.min))
    return dt


def _dec(v, name, minimum=0, maximum=10**13):
    try:
        x = Decimal(str(v if v not in (None, "") else 0))
    except Exception:
        raise ValueError(f"{name} نامعتبر است.")
    if x < minimum or x > maximum:
        raise ValueError(f"{name} خارج از محدوده است.")
    return x


def _opt_int(v, name):
    return None if v in (None, "") else to_int(v, name)


def _choice(v, choices, name):
    if v not in choices:
        raise ValueError(f"{name} نامعتبر است.")
    return v


def _text(v, n):
    return str(v or "").strip()[:n]


def _tier_parse(d, business, obj):
    out = {}
    if "name" in d or obj is None:
        out["name"] = _text(d.get("name"), 60)
        if not out["name"]:
            raise ValueError("نام سطح الزامی است.")
    if "min_value" in d:
        out["min_value"] = to_int(d.get("min_value"), "آستانه")
    if "multiplier" in d:
        out["multiplier"] = _dec(d.get("multiplier") or 1, "ضریب", 0, 100)
    if "color" in d:
        out["color"] = _text(d.get("color"), 20)
    if "perks" in d:
        out["perks"] = _text(d.get("perks"), 300)
    return out


def _rule_data(r):
    return {"id": r.id, "name": r.name, "kind": r.kind, "match": r.match, "multiplier": str(r.multiplier),
            "bonus_points": r.bonus_points, "min_amount": int(r.min_amount), "weekdays": r.weekdays or [],
            "starts_on": _iso(r.starts_on), "ends_on": _iso(r.ends_on), "is_active": r.is_active}


def _rule_parse(d, business, obj):
    out = {}
    if "name" in d or obj is None:
        out["name"] = _text(d.get("name"), 120)
        if not out["name"]:
            raise ValueError("نام قانون الزامی است.")
    if "kind" in d or obj is None:
        out["kind"] = _choice(d.get("kind"), LoyaltyEarnRule.Kind.values, "نوع قانون")
    if "match" in d:
        out["match"] = _text(d.get("match"), 500)
    if "multiplier" in d:
        out["multiplier"] = _dec(d.get("multiplier") or 1, "ضریب", 0, 100)
    if "bonus_points" in d:
        out["bonus_points"] = to_int(d.get("bonus_points"), "امتیاز اضافه", 0, 10**7)
    if "min_amount" in d:
        out["min_amount"] = _dec(d.get("min_amount"), "حداقل مبلغ")
    if "weekdays" in d:
        out["weekdays"] = sorted({int(x) for x in (d.get("weekdays") or []) if str(x).isdigit() and int(x) < 7})
    for k in ("starts_on", "ends_on"):
        if k in d:
            out[k] = _parse_date(d.get(k))
    if "is_active" in d:
        out["is_active"] = bool(d.get("is_active"))
    return out


def _reward_data(r):
    return {"id": r.id, "name": r.name, "description": r.description, "points_cost": r.points_cost,
            "kind": r.kind, "value": int(r.value), "max_discount": _money(r.max_discount), "stock": r.stock,
            "min_tier": _tier_data(r.min_tier) if r.min_tier_id else None, "min_tier_id": r.min_tier_id,
            "valid_days": r.valid_days, "is_active": r.is_active}


def _reward_parse(d, business, obj):
    out = {}
    if "name" in d or obj is None:
        out["name"] = _text(d.get("name"), 120)
        if not out["name"]:
            raise ValueError("نام جایزه الزامی است.")
    if "points_cost" in d or obj is None:
        out["points_cost"] = to_int(d.get("points_cost"), "امتیاز لازم", 1)
    if "description" in d:
        out["description"] = _text(d.get("description"), 300)
    if "kind" in d:
        out["kind"] = _choice(d.get("kind"), LoyaltyReward.Kind.values, "نوع جایزه")
    if "value" in d:
        out["value"] = _dec(d.get("value"), "مقدار")
    if "max_discount" in d:
        out["max_discount"] = None if d.get("max_discount") in (None, "") else _dec(d.get("max_discount"), "سقف")
    if "stock" in d:
        out["stock"] = _opt_int(d.get("stock"), "موجودی")
    if "valid_days" in d:
        out["valid_days"] = to_int(d.get("valid_days"), "اعتبار", 0, 3650)
    if "min_tier_id" in d:
        tid = d.get("min_tier_id") or None
        if tid and not LoyaltyTier.all_objects.filter(business=business, pk=tid).exists():
            raise ValueError("سطح پیدا نشد.")
        out["min_tier_id"] = tid
    if "is_active" in d:
        out["is_active"] = bool(d.get("is_active"))
    if out.get("kind", getattr(obj, "kind", "amount")) == "percent" and out.get("value", 0) > 100:
        raise ValueError("درصد تخفیف نمی‌تواند بیش از ۱۰۰ باشد.")
    return out


def _coupon_data(c):
    return {"id": c.id, "code": c.code, "title": c.title, "kind": c.kind, "value": int(c.value),
            "max_discount": _money(c.max_discount), "min_purchase": int(c.min_purchase),
            "usage_limit": c.usage_limit, "per_member_limit": c.per_member_limit, "members_only": c.members_only,
            "used_count": c.used_count, "starts_at": _iso(c.starts_at), "ends_at": _iso(c.ends_at),
            "member_id": c.member_id, "reward_id": c.reward_id, "campaign_id": c.campaign_id,
            "is_active": c.is_active, "created_at": _iso(c.created_at)}


def _coupon_parse(d, business, obj):
    out = {}
    if "title" in d:
        out["title"] = _text(d.get("title"), 120)
    if "kind" in d:
        out["kind"] = _choice(d.get("kind"), LoyaltyCoupon.Kind.values, "نوع کوپن")
    if "value" in d:
        out["value"] = _dec(d.get("value"), "مقدار")
    if "max_discount" in d:
        out["max_discount"] = None if d.get("max_discount") in (None, "") else _dec(d.get("max_discount"), "سقف")
    if "min_purchase" in d:
        out["min_purchase"] = _dec(d.get("min_purchase"), "حداقل خرید")
    for k in ("usage_limit", "per_member_limit"):
        if k in d:
            out[k] = _opt_int(d.get(k), k)
    for k in ("starts_at", "ends_at"):
        if k in d:
            out[k] = _dt(d.get(k))
    for k in ("members_only", "is_active"):
        if k in d:
            out[k] = bool(d.get(k))
    if out.get("kind", getattr(obj, "kind", "amount")) == "percent" and out.get("value", 0) > 100:
        raise ValueError("درصد تخفیف نمی‌تواند بیش از ۱۰۰ باشد.")
    return out


def _campaign_data(c):
    return {"id": c.id, "name": c.name, "kind": c.kind, "is_active": c.is_active, "segment": c.segment,
            "inactivity_days": c.inactivity_days, "bonus_points": c.bonus_points, "coupon_kind": c.coupon_kind,
            "coupon_value": int(c.coupon_value), "coupon_valid_days": c.coupon_valid_days, "message": c.message,
            "last_run_at": _iso(c.last_run_at), "reached": c.logs.count()}


def _campaign_parse(d, business, obj):
    out = {}
    if "name" in d or obj is None:
        out["name"] = _text(d.get("name"), 120)
        if not out["name"]:
            raise ValueError("نام کمپین الزامی است.")
    if "kind" in d or obj is None:
        out["kind"] = _choice(d.get("kind"), LoyaltyCampaign.Kind.values, "نوع کمپین")
    if "segment" in d:
        seg = d.get("segment") or ""
        out["segment"] = _choice(seg, SEGMENTS + [""], "بخش")
    if "inactivity_days" in d:
        out["inactivity_days"] = to_int(d.get("inactivity_days"), "روز", 1, 3650)
    if "bonus_points" in d:
        out["bonus_points"] = to_int(d.get("bonus_points"), "امتیاز", 0, 10**7)
    if "coupon_kind" in d:
        out["coupon_kind"] = _choice(d.get("coupon_kind") or "", LoyaltyCoupon.Kind.values + [""], "نوع کوپن")
    if "coupon_value" in d:
        out["coupon_value"] = _dec(d.get("coupon_value"), "مقدار کوپن")
    if "coupon_valid_days" in d:
        out["coupon_valid_days"] = to_int(d.get("coupon_valid_days"), "اعتبار", 0, 3650)
    if "message" in d:
        out["message"] = _text(d.get("message"), 500)
    if "is_active" in d:
        out["is_active"] = bool(d.get("is_active"))
    return out


def _coupon_create(business, fields, d):
    code = _text(d.get("code"), 30).upper() or None
    if code and not code.replace("-", "").replace("_", "").isalnum():
        raise ValueError("کد فقط حروف و عدد.")
    return create_coupon(business, code=code, prefix="", **fields)


CRUD = {
    "tiers": (LoyaltyTier, _tier_parse, _tier_data, None),
    "rules": (LoyaltyEarnRule, _rule_parse, _rule_data, None),
    "rewards": (LoyaltyReward, _reward_parse, _reward_data, None),
    "coupons": (LoyaltyCoupon, _coupon_parse, _coupon_data, _coupon_create),
    "campaigns": (LoyaltyCampaign, _campaign_parse, _campaign_data, None),
}


def _save_obj(business, kind, d, obj=None):
    model, parse, dump, creator = CRUD[kind]
    fields = parse(d, business, obj)
    if obj is None:
        obj = creator(business, fields, d) if creator else model.all_objects.create(business=business, **fields)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
        obj.save()
    return obj


def _after_tier_change(business):
    from ..club_services import recompute_tier, tier_list
    cfg, tiers = get_settings(business), tier_list(business)
    for m in LoyaltyMember.all_objects.filter(business=business).select_related("tier"):
        recompute_tier(m, cfg, tiers)


def _make_list(kind):
    model, _, dump, _ = CRUD[kind]

    @api_view(["GET", "POST"])
    @authentication_classes(StaffAuth)
    @permission_classes([ClubPerm])
    @audit("pos", f"club_{kind}", f"باشگاه: {kind}")
    def view(request):
        business = _biz(request)
        if business is None:
            return api_error(NO_BIZ)
        if request.method == "GET":
            return api_success(data=[dump(o) for o in model.objects.filter(business=business)[:500]])
        try:
            obj = _save_obj(business, kind, request.data)
        except ValueError as exc:
            return api_error(str(exc))
        except Exception:
            return api_error("ثبت نشد؛ نام/کد تکراری یا مقدار نامعتبر است.")
        if kind == "tiers":
            _after_tier_change(business)
        return api_success(data=dump(obj), message="ذخیره شد.", status_code=201)

    view.__name__ = f"club_{kind}"
    return view


def _make_detail(kind):
    model, _, dump, _ = CRUD[kind]

    @api_view(["GET", "PUT", "DELETE"])
    @authentication_classes(StaffAuth)
    @permission_classes([ClubPerm])
    @audit("pos", f"club_{kind}", f"باشگاه: {kind}")
    def view(request, pk):
        business = _biz(request)
        if business is None:
            return api_error(NO_BIZ)
        obj = get_object_or_404(model.objects.filter(business=business), pk=pk)
        if request.method == "GET":
            return api_success(data=dump(obj))
        if request.method == "DELETE":
            obj.delete()
            if kind == "tiers":
                _after_tier_change(business)
            return api_success(message="حذف شد.")
        try:
            obj = _save_obj(business, kind, request.data, obj)
        except ValueError as exc:
            return api_error(str(exc))
        except Exception:
            return api_error("ذخیره نشد؛ نام/کد تکراری یا مقدار نامعتبر است.")
        if kind == "tiers":
            _after_tier_change(business)
        return api_success(data=dump(obj), message="ذخیره شد.")

    view.__name__ = f"club_{kind}_detail"
    return view


club_tiers, club_tier_detail = _make_list("tiers"), _make_detail("tiers")
club_rules, club_rule_detail = _make_list("rules"), _make_detail("rules")
club_rewards, club_reward_detail = _make_list("rewards"), _make_detail("rewards")
club_coupons, club_coupon_detail = _make_list("coupons"), _make_detail("coupons")
club_campaigns, club_campaign_detail = _make_list("campaigns"), _make_detail("campaigns")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
@audit("pos", "club_campaign_run", "اجرای کمپین باشگاه")
def club_campaign_run(request, pk):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    c = get_object_or_404(LoyaltyCampaign.objects.filter(business=business), pk=pk)
    if not get_settings(business).is_active:
        return api_error("باشگاه مشتریان فعال نیست.")
    n = run_campaign(c, user=request.user)
    return api_success(data={"reached": n}, message=f"{n} عضو مشمول شدند.")


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
def club_messages(request):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    qs = LoyaltyMessage.objects.filter(business=business).select_related("member", "campaign")[:LIMIT]
    return api_success(data=[
        {"id": m.id, "phone": m.phone, "body": m.body, "status": m.status, "status_display": m.get_status_display(),
         "member_name": m.member.name if m.member_id else "", "campaign": m.campaign.name if m.campaign_id else "",
         "error": m.error, "created_at": _iso(m.created_at), "sent_at": _iso(m.sent_at)}
        for m in qs
    ])


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
def club_reports(request):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    try:
        days = int(request.query_params.get("days") or 30)
    except ValueError:
        days = 30
    return api_success(data=report(business, days))


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
@audit("pos", "club_run_daily", "اجرای کار روزانه‌ی باشگاه")
def club_run_daily(request):
    business = _biz(request)
    if business is None:
        return api_error(NO_BIZ)
    return api_success(data=run_daily_for(business), message="انجام شد.")
