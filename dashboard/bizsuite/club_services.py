"""
باشگاه مشتریان — هسته (مستقل از صنعت).

* دفتر امتیاز «دسته‌ای» (lot): هر ردیف مثبت ``remaining`` و ``expires_at`` دارد؛ مصرف و انقضا FIFO
  (ایده‌ی ledger دسته‌ای از افزونه‌های وفاداری متن‌باز؛ کد از خودمان).
* خرید عضو (``LoyaltyPurchase``) از صندوق، فاکتور فروش یا ثبت دستی — کسب‌وکارِ فقط-باشگاه هم کار می‌کند.
* قوانین امتیاز (محصول/دسته/حداقل خرید/روز هفته) + ضریب سطح؛ سطح خودکار بالا/پایین می‌رود.
* کوپن با سقف استفاده (ایده‌ی فیلدها از Saleor Voucher — BSD-3)، کاتالوگ جوایز، کیف پول، معرفی دوست.
"""

from __future__ import annotations

import re
import secrets
from datetime import timedelta
from decimal import ROUND_FLOOR, Decimal

from django.db import IntegrityError, transaction
from django.db.models import F, Q, Sum
from django.utils import timezone

from .models import (
    LoyaltyCoupon, LoyaltyCouponUse, LoyaltyEarnRule, LoyaltyMember, LoyaltyPurchase,
    LoyaltyReward, LoyaltySettings, LoyaltyTier, LoyaltyTransaction, LoyaltyWalletTransaction,
)

_PHONE_RE = re.compile(r"^[0-9]{7,15}$")
_FA_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O/1/I — easy to read aloud
Kind = LoyaltyTransaction.Kind


def normalize_phone(raw):
    phone = str(raw or "").strip().translate(_FA_DIGITS).replace(" ", "").replace("-", "")
    if phone.startswith("+"):
        phone = phone[1:]
    if not _PHONE_RE.match(phone):
        raise ValueError("شماره موبایل نامعتبر است.")
    return phone


def to_int(value, name="مقدار", minimum=0, maximum=10**13):
    try:
        v = int(Decimal(str(value if value not in (None, "") else 0).translate(_FA_DIGITS)))
    except Exception:
        raise ValueError(f"{name} نامعتبر است.")
    if v < minimum or v > maximum:
        raise ValueError(f"{name} خارج از محدوده است.")
    return v


def get_settings(business):
    # A business that bought the club starts with it switched on; the owner can still turn it off in settings.
    obj, _ = LoyaltySettings.all_objects.get_or_create(business=business, defaults={"is_active": True})
    return obj


def random_code(n=6, prefix=""):
    return prefix + "".join(secrets.choice(CODE_ALPHABET) for _ in range(n))


def _new_member_code(business):
    for _ in range(20):
        code = random_code(6)
        if not LoyaltyMember.all_objects.filter(business=business, code=code).exists():
            return code
    return random_code(10)


# ───────────────────────── tiers ─────────────────────────

def tier_list(business):
    return list(LoyaltyTier.all_objects.filter(business=business).order_by("min_value", "id"))


def tier_value(member, cfg):
    """مقداری که سطح بر اساس آن تعیین می‌شود (امتیاز یا مبلغ؛ کل دوره یا بازه‌ی اخیر)."""
    if cfg.tier_window_days:
        since = timezone.now() - timedelta(days=cfg.tier_window_days)
        if cfg.tier_basis == LoyaltySettings.TierBasis.SPEND:
            v = LoyaltyPurchase.all_objects.filter(member=member, is_void=False, created_at__gte=since
                                                   ).aggregate(s=Sum("net_amount"))["s"]
        else:
            v = LoyaltyTransaction.all_objects.filter(
                member=member, created_at__gte=since, points__gt=0,
            ).exclude(kind=Kind.REVERSE).aggregate(s=Sum("points"))["s"]
        return int(v or 0)
    if cfg.tier_basis == LoyaltySettings.TierBasis.SPEND:
        return int(member.total_spent or 0)
    return int(member.lifetime_points or 0)


def tier_for_value(tiers, value):
    best = None
    for t in tiers:
        if value >= t.min_value:
            best = t
    return best


def recompute_tier(member, cfg=None, tiers=None):
    """سطح را دوباره حساب می‌کند (ارتقا و تنزل خودکار). خروجی: True اگر عوض شد."""
    cfg = cfg or get_settings(member.business)
    tiers = tiers if tiers is not None else tier_list(member.business)
    new = tier_for_value(tiers, tier_value(member, cfg))
    new_id = new.id if new else None
    if member.tier_id != new_id:
        LoyaltyMember.all_objects.filter(pk=member.pk).update(tier_id=new_id)
        member.tier_id = new_id
        member.tier = new
        return True
    return False


def tier_multiplier(member):
    return Decimal(member.tier.multiplier) if member.tier_id and member.tier else Decimal(1)


# ───────────────────────── points ledger ─────────────────────────

def _credit(member, points, kind, *, cfg=None, order=None, purchase=None, note="", user=None):
    if points <= 0:
        return None
    cfg = cfg or get_settings(member.business)
    expires = (timezone.now() + timedelta(days=cfg.points_expiry_days)) if cfg.points_expiry_days else None
    tx = LoyaltyTransaction.all_objects.create(
        business_id=member.business_id, member=member, points=points, kind=kind, order=order,
        purchase=purchase, remaining=points, expires_at=expires, note=note[:200], created_by=user,
    )
    updates = {"points_balance": F("points_balance") + points}
    if kind != Kind.REVERSE:
        updates["lifetime_points"] = F("lifetime_points") + points
    LoyaltyMember.all_objects.filter(pk=member.pk).update(**updates)
    member.refresh_from_db(fields=["points_balance", "lifetime_points"])
    return tx


def _debit(member, points, kind, *, order=None, purchase=None, note="", user=None):
    """کسر امتیاز از قدیمی‌ترین / زودانقضاترین دسته‌ها (FIFO)."""
    if points <= 0:
        return None
    member.refresh_from_db(fields=["points_balance"])
    if member.points_balance < points:
        raise ValueError("امتیاز کافی نیست.")
    left = points
    lots = (LoyaltyTransaction.all_objects.select_for_update()
            .filter(member=member, remaining__gt=0)
            .order_by(F("expires_at").asc(nulls_last=True), "created_at", "id"))
    for lot in lots:
        take = min(left, lot.remaining)
        LoyaltyTransaction.all_objects.filter(pk=lot.pk).update(remaining=F("remaining") - take)
        left -= take
        if left <= 0:
            break
    tx = LoyaltyTransaction.all_objects.create(
        business_id=member.business_id, member=member, points=-points, kind=kind, order=order,
        purchase=purchase, note=note[:200], created_by=user,
    )
    LoyaltyMember.all_objects.filter(pk=member.pk).update(points_balance=F("points_balance") - points)
    member.refresh_from_db(fields=["points_balance", "lifetime_points"])
    return tx


def _add(member, points, kind, order=None, note="", user=None):
    """سازگاری با کد قدیمی."""
    if points >= 0:
        return _credit(member, points, kind, order=order, note=note, user=user)
    return _debit(member, -points, kind, order=order, note=note, user=user)


@transaction.atomic
def expire_points(business, now=None):
    """دسته‌های منقضی را صفر و یک ردیف «انقضا» برای هر عضو ثبت می‌کند. خروجی: جمع امتیاز منقضی."""
    now = now or timezone.now()
    lots = (LoyaltyTransaction.all_objects.select_for_update()
            .filter(business=business, remaining__gt=0, expires_at__lte=now))
    per_member = {}
    for lot in lots:
        per_member[lot.member_id] = per_member.get(lot.member_id, 0) + lot.remaining
    if not per_member:
        return 0
    LoyaltyTransaction.all_objects.filter(business=business, remaining__gt=0, expires_at__lte=now
                                          ).update(remaining=0)
    total = 0
    for member_id, pts in per_member.items():
        member = LoyaltyMember.all_objects.select_for_update().get(pk=member_id)
        pts = min(pts, member.points_balance)
        if pts <= 0:
            continue
        LoyaltyTransaction.all_objects.create(
            business=business, member=member, points=-pts, kind=Kind.EXPIRE, note="انقضای امتیاز")
        LoyaltyMember.all_objects.filter(pk=member_id).update(points_balance=F("points_balance") - pts)
        total += pts
    return total


def expiring_soon(member, days=30):
    limit = timezone.now() + timedelta(days=days)
    agg = LoyaltyTransaction.all_objects.filter(
        member=member, remaining__gt=0, expires_at__isnull=False, expires_at__lte=limit,
    ).aggregate(s=Sum("remaining"))
    return int(agg["s"] or 0)


# ───────────────────────── members ─────────────────────────

PROFILE_FIELDS = ("email", "birth_date", "anniversary_date", "note", "tags", "sms_opt_in", "customer_id")


@transaction.atomic
def get_or_create_member(business, phone, name="", user=None, referral_code="", **profile):
    phone = normalize_phone(phone)
    cfg = get_settings(business)
    member = LoyaltyMember.all_objects.filter(business=business, phone=phone).first()
    if member:
        if name and not member.name:
            LoyaltyMember.all_objects.filter(pk=member.pk).update(name=str(name)[:200])
            member.name = str(name)[:200]
        return member, False
    referrer = None
    if referral_code:
        referrer = LoyaltyMember.all_objects.filter(
            business=business, code=str(referral_code).strip().upper(), is_active=True).first()
    try:
        with transaction.atomic():
            member = LoyaltyMember.all_objects.create(
                business=business, phone=phone, name=str(name or "")[:200],
                code=_new_member_code(business), referred_by=referrer,
                **{k: v for k, v in profile.items() if k in PROFILE_FIELDS},
            )
    except IntegrityError:
        return LoyaltyMember.all_objects.get(business=business, phone=phone), False
    if cfg.welcome_points:
        _credit(member, cfg.welcome_points, Kind.WELCOME, cfg=cfg, user=user, note="امتیاز عضویت")
    if referrer and cfg.referee_points:
        _credit(member, cfg.referee_points, Kind.REFERRAL, cfg=cfg, user=user,
                note=f"عضویت با معرفی {referrer.code}")
    recompute_tier(member, cfg)
    return member, True


def find_member(business, phone=None, member_id=None, code=None):
    qs = LoyaltyMember.all_objects.filter(business=business)
    if member_id:
        return qs.filter(pk=member_id).first()
    if code:
        return qs.filter(code=str(code).strip().upper()).first()
    if phone:
        return qs.filter(phone=normalize_phone(phone)).first()
    return None


# ───────────────────────── earn rules ─────────────────────────

def _split(text):
    return [p.strip().lower() for p in str(text or "").split(",") if p.strip()]


def _floor(x):
    return int(Decimal(x).to_integral_value(rounding=ROUND_FLOOR))


def compute_points(business, cfg, member, net_amount, items=None, when=None, rules=None):
    """
    امتیاز یک خرید را حساب می‌کند. خروجی: (امتیاز، ریز محاسبه).
    پایه = کف(مبلغ خالص / مبلغ هر امتیاز) + امتیاز مراجعه؛ سپس قوانین اضافه؛ سپس ضریب سطح.
    ``items``: [{"name", "category", "quantity", "amount"}] (اختیاری).
    """
    net = Decimal(net_amount or 0)
    if net <= 0:
        return 0, []
    when = when or timezone.localtime()
    unit = Decimal(cfg.earn_amount)
    base = _floor(net / unit)
    breakdown = [{"label": "base", "points": base}]
    total = Decimal(base)
    if cfg.visit_points:
        total += cfg.visit_points
        breakdown.append({"label": "visit", "points": cfg.visit_points})
    items = items or []
    gross = sum(Decimal(str(i.get("amount") or 0)) for i in items) or net
    ratio = min(Decimal(1), net / gross) if gross else Decimal(1)
    today = when.date()
    if rules is None:
        rules = LoyaltyEarnRule.all_objects.filter(business=business, is_active=True)
    for r in rules:
        if (r.starts_on and today < r.starts_on) or (r.ends_on and today > r.ends_on):
            continue
        extra = Decimal(0)
        mult = Decimal(r.multiplier) - 1
        if r.kind in (LoyaltyEarnRule.Kind.PRODUCT, LoyaltyEarnRule.Kind.CATEGORY):
            keys = _split(r.match)
            field = "name" if r.kind == LoyaltyEarnRule.Kind.PRODUCT else "category"
            for it in items:
                if str(it.get(field) or "").strip().lower() in keys:
                    amt = Decimal(str(it.get("amount") or 0)) * ratio
                    extra += _floor(amt / unit) * mult + r.bonus_points * max(1, int(it.get("quantity") or 1))
        elif r.kind == LoyaltyEarnRule.Kind.MIN_AMOUNT:
            if net >= Decimal(r.min_amount or 0):
                extra += base * mult + r.bonus_points
        elif r.kind == LoyaltyEarnRule.Kind.WEEKDAY:
            if today.weekday() in [int(d) for d in (r.weekdays or []) if str(d).isdigit()]:
                extra += base * mult + r.bonus_points
        extra = Decimal(_floor(extra))
        if extra:
            total += extra
            breakdown.append({"label": r.name, "points": int(extra), "rule_id": r.id})
    tm = tier_multiplier(member) if member else Decimal(1)
    if tm != 1 and total > 0:
        bonus = _floor(total * (tm - 1))
        if bonus:
            total += bonus
            breakdown.append({"label": "tier", "points": bonus})
    return max(0, _floor(total)), breakdown


# ───────────────────────── coupons ─────────────────────────

def coupon_discount(coupon, amount):
    amount = Decimal(amount or 0)
    if coupon.kind == LoyaltyCoupon.Kind.PERCENT:
        d = (amount * Decimal(coupon.value) / 100).to_integral_value(rounding=ROUND_FLOOR)
    else:  # amount / free_item (value = price of the free item)
        d = Decimal(coupon.value)
    if coupon.max_discount is not None:
        d = min(d, Decimal(coupon.max_discount))
    return max(Decimal(0), min(d, amount))


def validate_coupon(business, code, member=None, amount=0, lock=False):
    """کوپن را بررسی می‌کند؛ ValueError با پیام روشن. خروجی: (کوپن، تخفیف)."""
    code = str(code or "").strip().upper()
    if not code:
        raise ValueError("کد تخفیف خالی است.")
    qs = LoyaltyCoupon.all_objects.filter(business=business, code=code)
    if lock:
        qs = qs.select_for_update()
    c = qs.first()
    now = timezone.now()
    if not c or not c.is_active:
        raise ValueError("کد تخفیف معتبر نیست.")
    if c.starts_at and now < c.starts_at:
        raise ValueError("زمان استفاده از این کد هنوز نرسیده است.")
    if c.ends_at and now > c.ends_at:
        raise ValueError("این کد تخفیف منقضی شده است.")
    if c.usage_limit is not None and c.used_count >= c.usage_limit:
        raise ValueError("ظرفیت استفاده از این کد تمام شده است.")
    if (c.members_only or c.member_id or c.per_member_limit) and member is None:
        raise ValueError("این کد فقط برای اعضای باشگاه است.")
    if c.member_id and member and c.member_id != member.id:
        raise ValueError("این کد متعلق به عضو دیگری است.")
    if c.per_member_limit and member is not None:
        used = LoyaltyCouponUse.all_objects.filter(coupon=c, member=member).count()
        if used >= c.per_member_limit:
            raise ValueError("سقف استفاده‌ی شما از این کد پر شده است.")
    if Decimal(amount or 0) < Decimal(c.min_purchase or 0):
        raise ValueError(f"حداقل خرید برای این کد {int(c.min_purchase)} است.")
    return c, coupon_discount(c, amount)


def _use_coupon(coupon, member, purchase, discount):
    updated = LoyaltyCoupon.all_objects.filter(pk=coupon.pk).filter(
        Q(usage_limit__isnull=True) | Q(used_count__lt=F("usage_limit"))
    ).update(used_count=F("used_count") + 1)
    if not updated:
        raise ValueError("ظرفیت استفاده از این کد تمام شده است.")
    LoyaltyCouponUse.all_objects.create(business_id=coupon.business_id, coupon=coupon, member=member,
                                        purchase=purchase, discount=discount)


def create_coupon(business, *, kind="amount", value=0, member=None, title="", prefix="", usage_limit=None,
                  valid_days=None, reward=None, campaign=None, max_discount=None, min_purchase=0, code=None,
                  **extra):
    if code:
        c = str(code).strip().upper()
        if LoyaltyCoupon.all_objects.filter(business=business, code=c).exists():
            raise ValueError("این کد قبلاً ثبت شده است.")
    else:
        for _ in range(20):
            c = random_code(8, prefix)
            if not LoyaltyCoupon.all_objects.filter(business=business, code=c).exists():
                break
    if valid_days:
        extra["ends_at"] = timezone.now() + timedelta(days=valid_days)
    return LoyaltyCoupon.all_objects.create(
        business=business, code=c, kind=kind, value=value, member=member, title=str(title)[:120],
        usage_limit=usage_limit, reward=reward, campaign=campaign,
        max_discount=max_discount, min_purchase=min_purchase or 0, **extra,
    )


# ───────────────────────── wallet ─────────────────────────

@transaction.atomic
def wallet_change(member, amount, kind, *, purchase=None, note="", user=None):
    amount = Decimal(int(amount))
    if amount == 0:
        raise ValueError("مبلغ نمی‌تواند صفر باشد.")
    member = LoyaltyMember.all_objects.select_for_update().get(pk=member.pk)
    if member.wallet_balance + amount < 0:
        raise ValueError("اعتبار کیف پول کافی نیست.")
    LoyaltyMember.all_objects.filter(pk=member.pk).update(wallet_balance=F("wallet_balance") + amount)
    member.refresh_from_db(fields=["wallet_balance"])
    LoyaltyWalletTransaction.all_objects.create(
        business_id=member.business_id, member=member, amount=amount, kind=kind,
        balance_after=member.wallet_balance, purchase=purchase, note=note[:200], created_by=user)
    return member


# ───────────────────────── purchases ─────────────────────────

def _clean_items(items):
    out = []
    for it in (items or [])[:200]:
        if not isinstance(it, dict):
            continue
        try:
            qty = max(1, int(it.get("quantity") or 1))
            raw = it.get("amount")
            amount = Decimal(str(raw)) if raw not in (None, "") else Decimal(str(it.get("price") or 0)) * qty
        except Exception:
            continue
        out.append({"name": str(it.get("name") or "")[:120], "category": str(it.get("category") or "")[:120],
                    "quantity": qty, "amount": int(amount)})
    return out


def quote_purchase(business, member, amount, *, items=None, redeem=0, coupon_code="", wallet_amount=0,
                   cfg=None, lock=False):
    """محاسبه‌ی تخفیف‌ها و امتیاز بدون ذخیره (پیش‌نمایش صندوق). ValueError در صورت نقض قوانین."""
    cfg = cfg or get_settings(business)
    amount = Decimal(to_int(amount, "مبلغ خرید"))
    items = _clean_items(items)
    coupon, c_disc = None, Decimal(0)
    if coupon_code:
        coupon, c_disc = validate_coupon(business, coupon_code, member, amount, lock=lock)
    after_coupon = amount - c_disc
    redeem = to_int(redeem, "امتیاز")
    p_disc = Decimal(0)
    if redeem:
        if member is None:
            raise ValueError("برای استفاده از امتیاز، عضو را انتخاب کنید.")
        if redeem < cfg.min_redeem_points:
            raise ValueError(f"حداقل امتیاز قابل استفاده {cfg.min_redeem_points} است.")
        if redeem > member.points_balance:
            raise ValueError("امتیاز کافی نیست.")
        cap = after_coupon * Decimal(cfg.redeem_max_percent) / 100
        p_disc = Decimal(redeem * cfg.redeem_value)
        if p_disc > cap:
            raise ValueError(f"حداکثر {int(cap)} از این خرید با امتیاز قابل پرداخت است.")
    net = after_coupon - p_disc
    wallet = Decimal(to_int(wallet_amount, "مبلغ کیف پول"))
    if wallet:
        if not cfg.wallet_enabled or member is None:
            raise ValueError("کیف پول فعال نیست.")
        if wallet > member.wallet_balance:
            raise ValueError("اعتبار کیف پول کافی نیست.")
        if wallet > net:
            raise ValueError("مبلغ کیف پول بیشتر از مبلغ قابل پرداخت است.")
    points, breakdown = compute_points(business, cfg, member, net, items)
    return {
        "amount": int(amount), "coupon": coupon, "coupon_discount": int(c_disc), "points_used": redeem,
        "points_discount": int(p_disc), "net_amount": int(net), "wallet_used": int(wallet),
        "to_pay": int(net - wallet), "points_earned": points, "breakdown": breakdown, "items": items,
    }


@transaction.atomic
def record_purchase(business, member, amount, *, items=None, channel=LoyaltyPurchase.Channel.MANUAL,
                    order=None, sales_invoice=None, redeem=0, coupon_code="", wallet_amount=0,
                    reference="", note="", user=None):
    """ثبت خرید: اعمال کوپن، امتیاز و کیف پول، سپس کسب امتیاز، آمار عضو، معرف و سطح."""
    cfg = get_settings(business)
    if not cfg.is_active:
        raise ValueError("باشگاه مشتریان فعال نیست.")
    member = LoyaltyMember.all_objects.select_for_update().get(pk=member.pk)
    if not member.is_active:
        raise ValueError("عضویت این مشتری غیرفعال است.")
    q = quote_purchase(business, member, amount, items=items, redeem=redeem, coupon_code=coupon_code,
                       wallet_amount=wallet_amount, cfg=cfg, lock=True)
    p = LoyaltyPurchase.all_objects.create(
        business=business, member=member, channel=channel, amount=q["amount"],
        coupon_discount=q["coupon_discount"], points_discount=q["points_discount"],
        wallet_used=q["wallet_used"], net_amount=q["net_amount"], points_redeemed=q["points_used"],
        items=q["items"], order=order, sales_invoice=sales_invoice, reference=str(reference or "")[:60],
        note=str(note or "")[:200], created_by=user,
    )
    label = f"خرید #{p.pk}" + (f" — سفارش #{order.pk}" if order else "")
    if q["coupon"]:
        _use_coupon(q["coupon"], member, p, q["coupon_discount"])
    if q["points_used"]:
        _debit(member, q["points_used"], Kind.REDEEM, purchase=p, note=label, user=user)
    if q["wallet_used"]:
        wallet_change(member, -q["wallet_used"], LoyaltyWalletTransaction.Kind.SPEND, purchase=p,
                      note=label, user=user)
    if q["points_earned"]:
        _credit(member, q["points_earned"], Kind.EARN, cfg=cfg, purchase=p, order=order, note=label, user=user)
        LoyaltyPurchase.all_objects.filter(pk=p.pk).update(points_earned=q["points_earned"])
        p.points_earned = q["points_earned"]
    LoyaltyMember.all_objects.filter(pk=member.pk).update(
        total_spent=F("total_spent") + q["net_amount"], visits=F("visits") + 1,
        last_purchase_at=timezone.now())
    member.refresh_from_db()
    if member.referred_by_id and not member.referral_rewarded and q["net_amount"] > 0:
        LoyaltyMember.all_objects.filter(pk=member.pk).update(referral_rewarded=True)
        referrer = LoyaltyMember.all_objects.filter(pk=member.referred_by_id, is_active=True).first()
        if referrer and cfg.referrer_points:
            _credit(referrer, cfg.referrer_points, Kind.REFERRAL, cfg=cfg,
                    note=f"معرفی {member.name or member.code}")
            recompute_tier(referrer, cfg)
    recompute_tier(member, cfg)
    p.breakdown = q["breakdown"]
    return p


@transaction.atomic
def void_purchase(purchase, user=None, note=""):
    """ابطال خرید: برگشت امتیاز کسب‌شده/مصرف‌شده، کیف پول، کوپن و آمار عضو."""
    p = LoyaltyPurchase.all_objects.select_for_update().get(pk=purchase.pk)
    if p.is_void:
        raise ValueError("این خرید قبلاً باطل شده است.")
    member = LoyaltyMember.all_objects.select_for_update().get(pk=p.member_id)
    label = note or f"ابطال خرید #{p.pk}"
    if p.points_earned:
        take = min(p.points_earned, member.points_balance)
        if take:
            _debit(member, take, Kind.REVERSE, purchase=p, note=label, user=user)
        LoyaltyMember.all_objects.filter(pk=member.pk).update(
            lifetime_points=max(0, member.lifetime_points - p.points_earned))
    if p.points_redeemed:
        _credit(member, p.points_redeemed, Kind.REVERSE, purchase=p, note=label, user=user)
    if p.wallet_used:
        wallet_change(member, p.wallet_used, LoyaltyWalletTransaction.Kind.REFUND, purchase=p, note=label,
                      user=user)
    for use in LoyaltyCouponUse.all_objects.filter(purchase=p):
        LoyaltyCoupon.all_objects.filter(pk=use.coupon_id, used_count__gt=0).update(used_count=F("used_count") - 1)
        use.delete()
    member.refresh_from_db()
    last = (LoyaltyPurchase.all_objects.filter(member=member, is_void=False).exclude(pk=p.pk)
            .order_by("-created_at").values_list("created_at", flat=True).first())
    LoyaltyMember.all_objects.filter(pk=member.pk).update(
        total_spent=max(Decimal(0), member.total_spent - p.net_amount), visits=max(0, member.visits - 1),
        last_purchase_at=last)
    p.is_void = True
    p.save(update_fields=["is_void"])
    member.refresh_from_db()
    recompute_tier(member)
    return p


def _club_ready(business):
    from .modules import module_enabled
    if not module_enabled(business, "club"):
        return None
    cfg = LoyaltySettings.all_objects.filter(business_id=business.pk).first()
    return cfg if cfg and cfg.is_active else None


@transaction.atomic
def earn_for_order(order):
    """
    امتیاز یک سفارش صندوق را به عضو باشگاه می‌دهد (idempotent).
    فقط اگر باشگاه فعال باشد و سفارش شماره موبایل داشته باشد.
    خروجی: تعداد امتیاز داده‌شده (۰ اگر چیزی داده نشد).
    """
    if not order.phone or not _club_ready(order.business):
        return 0
    try:
        phone = normalize_phone(order.phone)
    except ValueError:
        return 0
    if (LoyaltyPurchase.all_objects.filter(order=order).exists()
            or LoyaltyTransaction.all_objects.filter(order=order, kind=Kind.EARN).exists()):
        return 0
    if int(order.total_price or 0) <= 0:
        return 0
    member, _ = get_or_create_member(order.business, phone, order.customer_name)
    items = []
    from .models import OrderItem
    for it in OrderItem.all_objects.filter(order=order).select_related("food__category"):
        cat = getattr(getattr(it.food, "category", None), "name", "") if it.food_id else ""
        items.append({"name": it.item_name or (it.food.name if it.food_id else ""), "category": cat,
                      "quantity": it.quantity, "amount": int(it.price) * int(it.quantity)})
    try:
        with transaction.atomic():
            p = record_purchase(order.business, member, int(order.total_price), items=items,
                                channel=LoyaltyPurchase.Channel.POS, order=order)
    except (IntegrityError, ValueError):
        return 0
    return p.points_earned


@transaction.atomic
def earn_for_sales_invoice(invoice):
    """امتیاز فاکتور فروش (مشتریان عمده / B2B) — بر اساس موبایل مشتری تعریف‌شده. idempotent."""
    from .models import SalesInvoiceItem
    customer = getattr(invoice, "customer", None)
    if customer is None or not _club_ready(invoice.business):
        return 0
    if LoyaltyPurchase.all_objects.filter(sales_invoice=invoice).exists():
        return 0
    member = LoyaltyMember.all_objects.filter(business_id=invoice.business_id, customer=customer).first()
    if member is None:
        try:
            member, _ = get_or_create_member(invoice.business, customer.phone, customer.name)
        except ValueError:
            return 0
        if member.customer_id is None:
            LoyaltyMember.all_objects.filter(pk=member.pk).update(customer=customer)
    total = int(Decimal(invoice.total or 0) - Decimal(invoice.discount or 0))
    if total <= 0:
        return 0
    items = [{"name": i.item_name, "quantity": max(1, int(i.quantity or 1)),
              "amount": int(Decimal(i.quantity or 0) * Decimal(i.unit_price or 0) - Decimal(i.discount or 0))}
             for i in SalesInvoiceItem.all_objects.filter(invoice=invoice)]
    try:
        with transaction.atomic():
            p = record_purchase(invoice.business, member, total, items=items,
                                channel=LoyaltyPurchase.Channel.INVOICE, sales_invoice=invoice,
                                reference=invoice.invoice_number or "")
    except (IntegrityError, ValueError):
        return 0
    return p.points_earned


# ───────────────────────── redeem / adjust / rewards ─────────────────────────

@transaction.atomic
def redeem_points(business, phone, points, user=None, note=""):
    """
    استفاده از امتیاز بدون ثبت خرید (مثلاً صندوق خارجی)؛ مبلغ تخفیف را برمی‌گرداند.
    ValueError در صورت کمبود امتیاز یا نقض قوانین.
    """
    cfg = get_settings(business)
    if not cfg.is_active:
        raise ValueError("باشگاه مشتریان فعال نیست.")
    try:
        points = int(points)
    except (TypeError, ValueError):
        raise ValueError("تعداد امتیاز نامعتبر است.")
    if points <= 0:
        raise ValueError("تعداد امتیاز باید بیشتر از صفر باشد.")
    if points < cfg.min_redeem_points:
        raise ValueError(f"حداقل امتیاز قابل استفاده {cfg.min_redeem_points} است.")
    phone = normalize_phone(phone)
    member = LoyaltyMember.all_objects.select_for_update().filter(
        business=business, phone=phone, is_active=True).first()
    if not member:
        raise ValueError("عضو باشگاه پیدا نشد.")
    if member.points_balance < points:
        raise ValueError("امتیاز کافی نیست.")
    _debit(member, points, Kind.REDEEM, note=note or "استفاده از امتیاز", user=user)
    return {"discount": points * cfg.redeem_value, "points_used": points, "balance": member.points_balance}


@transaction.atomic
def adjust_points(member, delta, note="", user=None):
    member = LoyaltyMember.all_objects.select_for_update().get(pk=member.pk)
    delta = int(delta)
    if delta == 0:
        raise ValueError("مقدار اصلاح نمی‌تواند صفر باشد.")
    if member.points_balance + delta < 0:
        raise ValueError("امتیاز نمی‌تواند منفی شود.")
    if delta > 0:
        _credit(member, delta, Kind.ADJUST, note=note or "اصلاح دستی", user=user)
    else:
        _debit(member, -delta, Kind.ADJUST, note=note or "اصلاح دستی", user=user)
    recompute_tier(member)
    return member


def grant_points(member, points, kind=Kind.CAMPAIGN, note="", user=None):
    with transaction.atomic():
        member = LoyaltyMember.all_objects.select_for_update().get(pk=member.pk)
        _credit(member, int(points), kind, note=note, user=user)
        recompute_tier(member)
    return member


@transaction.atomic
def redeem_reward(member, reward, user=None):
    """معاوضه‌ی امتیاز با جایزه → یک کوپن شخصی یک‌بارمصرف."""
    member = LoyaltyMember.all_objects.select_for_update().get(pk=member.pk)
    reward = LoyaltyReward.all_objects.select_for_update().get(pk=reward.pk)
    if not reward.is_active or reward.business_id != member.business_id:
        raise ValueError("این جایزه فعال نیست.")
    if not get_settings(member.business).is_active:
        raise ValueError("باشگاه مشتریان فعال نیست.")
    if reward.stock is not None and reward.stock <= 0:
        raise ValueError("موجودی این جایزه تمام شده است.")
    if reward.min_tier_id:
        need = reward.min_tier.min_value
        mine = member.tier.min_value if member.tier_id else -1
        if mine < need:
            raise ValueError(f"این جایزه برای سطح {reward.min_tier.name} و بالاتر است.")
    if member.points_balance < reward.points_cost:
        raise ValueError("امتیاز کافی نیست.")
    _debit(member, reward.points_cost, Kind.REWARD, note=f"جایزه: {reward.name}", user=user)
    if reward.stock is not None:
        LoyaltyReward.all_objects.filter(pk=reward.pk).update(stock=F("stock") - 1)
    kind = LoyaltyCoupon.Kind.FREE_ITEM if reward.kind in ("free_item", "gift") else reward.kind
    return create_coupon(member.business, kind=kind, value=reward.value, member=member, title=reward.name,
                         prefix="R", usage_limit=1, valid_days=reward.valid_days or None, reward=reward,
                         max_discount=reward.max_discount)
