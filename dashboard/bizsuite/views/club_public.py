"""
باشگاه مشتریان — صفحه‌ی عمومی عضو (بدون ورود)

  GET  /api/public/club/<slug>/          معرفی برنامه (سطح‌ها، جوایز، امکان عضویت)
  POST /api/public/club/<slug>/lookup/   {phone, code}  → امتیاز، سطح، کوپن‌ها (هر دو باید درست باشند)
  POST /api/public/club/<slug>/join/     {name, phone, referral_code?, website(honeypot)}

فقط وقتی ماژول باشگاه روشن، باشگاه فعال و «صفحه‌ی عمومی» در تنظیمات روشن باشد.
محدودیت تعداد درخواست بر اساس IP و شماره؛ پاسخ‌ها شماره‌ی ثبت‌شده را لو نمی‌دهند.
"""

from django.core.cache import cache
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny

from ..club_analytics import segment_of
from ..club_campaigns import queue_message
from ..club_services import expiring_soon, get_or_create_member, get_settings, normalize_phone
from ..models import Business, LoyaltyMember, LoyaltyReward, LoyaltyTier
from ..modules import module_enabled
from ..utils import api_error, api_success
from .common import client_ip

LOOKUP_LIMIT = 10      # per IP / 10 min
PHONE_LIMIT = 5        # per phone / 10 min (brute force on the code)
JOIN_LIMIT = 5
WINDOW = 600
JOIN_MESSAGE = "درخواست عضویت ثبت شد. کد عضویت را از فروشنده یا پیامک دریافت کنید."


def _program(slug):
    biz = Business.objects.filter(slug=slug, is_active=True).first()
    if biz is None or not module_enabled(biz, "club"):
        return None, None
    cfg = get_settings(biz)
    if not cfg.is_active or not cfg.public_lookup_enabled:
        return None, None
    return biz, cfg


def _hit(key, limit):
    n = cache.get(key, 0)
    if n >= limit:
        return False
    cache.set(key, n + 1, WINDOW)
    return True


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_club_info(request, slug):
    biz, cfg = _program(slug)
    if biz is None:
        return api_error("not found", 404)
    tiers = [{"name": t.name, "min_value": t.min_value, "multiplier": str(t.multiplier), "color": t.color,
              "perks": t.perks} for t in LoyaltyTier.all_objects.filter(business=biz).order_by("min_value")]
    rewards = [{"id": r.id, "name": r.name, "description": r.description, "points_cost": r.points_cost}
               for r in LoyaltyReward.all_objects.filter(business=biz, is_active=True)[:50]]
    return api_success(data={
        "business": biz.name, "earn_amount": cfg.earn_amount, "redeem_value": cfg.redeem_value,
        "welcome_points": cfg.welcome_points, "referee_points": cfg.referee_points,
        "referrer_points": cfg.referrer_points, "tier_basis": cfg.tier_basis, "tiers": tiers, "rewards": rewards,
    })


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_club_lookup(request, slug):
    biz, cfg = _program(slug)
    if biz is None:
        return api_error("not found", 404)
    if not _hit(f"club_pub_ip:{client_ip(request)}", LOOKUP_LIMIT):
        return api_error("too many requests", 429)
    try:
        phone = normalize_phone(request.data.get("phone"))
    except ValueError:
        return api_error("شماره یا کد عضویت درست نیست.", 400)
    if not _hit(f"club_pub_phone:{biz.pk}:{phone}", PHONE_LIMIT):
        return api_error("too many requests", 429)
    code = str(request.data.get("code") or "").strip().upper()
    m = (LoyaltyMember.all_objects.select_related("tier")
         .filter(business=biz, phone=phone, is_active=True).first())
    if m is None or not code or m.code != code:
        return api_error("شماره یا کد عضویت درست نیست.", 400)
    now = timezone.now()
    coupons = [{"code": c.code, "title": c.title, "kind": c.kind, "value": int(c.value),
                "ends_at": c.ends_at.isoformat() if c.ends_at else None}
               for c in m.coupons.filter(is_active=True)
               if (c.usage_limit is None or c.used_count < c.usage_limit) and (not c.ends_at or c.ends_at > now)]
    tiers = list(LoyaltyTier.all_objects.filter(business=biz).order_by("min_value"))
    nxt = next((t for t in tiers if not m.tier_id or t.min_value > m.tier.min_value), None)
    return api_success(data={
        "name": m.name, "points": m.points_balance, "lifetime_points": m.lifetime_points,
        "wallet": int(m.wallet_balance) if cfg.wallet_enabled else None,
        "value": m.points_balance * cfg.redeem_value,
        "tier": {"name": m.tier.name, "color": m.tier.color} if m.tier_id else None,
        "next_tier": {"name": nxt.name, "min_value": nxt.min_value} if nxt and nxt.id != m.tier_id else None,
        "expiring_30d": expiring_soon(m, 30), "visits": m.visits, "segment": segment_of(m, cfg),
        "referral_code": m.code, "coupons": coupons,
    })


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_club_join(request, slug):
    biz, cfg = _program(slug)
    if biz is None:
        return api_error("not found", 404)
    d = request.data
    if str(d.get("website") or "").strip():   # honeypot
        return api_success(None, JOIN_MESSAGE)
    if not _hit(f"club_pub_join:{client_ip(request)}", JOIN_LIMIT):
        return api_error("too many requests", 429)
    name = str(d.get("name") or "").strip()[:200]
    if not name:
        return api_error("نام الزامی است.", 400)
    try:
        member, created = get_or_create_member(biz, d.get("phone"), name,
                                               referral_code=str(d.get("referral_code") or ""))
    except ValueError:
        return api_error("شماره موبایل نامعتبر است.", 400)
    if created:
        queue_message(member, f"{biz.name}: عضویت شما در باشگاه ثبت شد. کد عضویت: {member.code}")
    # same answer for new and existing phones: no account enumeration
    return api_success(None, JOIN_MESSAGE)
