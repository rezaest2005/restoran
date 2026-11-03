"""
باشگاه مشتریان — API

  /api/club/settings/                 GET / PUT
  /api/club/members/                  GET (?q=) / POST
  /api/club/members/<pk>/             GET (تاریخچه)
  /api/club/members/<pk>/adjust/      POST اصلاح دستی امتیاز
  /api/club/lookup/                   POST {phone}   (صندوق)
  /api/club/redeem/                   POST {phone, points}   (صندوق)
"""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ..club_services import (
    adjust_points,
    get_or_create_member,
    get_settings,
    normalize_phone,
    redeem_points,
    tier_for,
)
from ..models import LoyaltyMember
from ..utils import api_error, api_success
from .common import (
    CashierPerm,
    ClubPerm,
    StaffAuth,
    staff_restaurant,
)

LIMIT = 200


def _settings_data(cfg):
    return {
        "is_active": cfg.is_active,
        "earn_amount": cfg.earn_amount,
        "redeem_value": cfg.redeem_value,
        "min_redeem_points": cfg.min_redeem_points,
        "welcome_points": cfg.welcome_points,
        "silver_points": cfg.silver_points,
        "gold_points": cfg.gold_points,
    }


def _member_data(m, cfg):
    return {
        "id": m.id,
        "phone": m.phone,
        "name": m.name,
        "points_balance": m.points_balance,
        "lifetime_points": m.lifetime_points,
        "tier": tier_for(cfg, m.lifetime_points),
        "is_active": m.is_active,
        "joined_at": m.joined_at.isoformat(),
    }


def _int_field(data, key, minimum=0, maximum=10**9):
    value = int(data[key])
    if value < minimum or value > maximum:
        raise ValueError(key)
    return value


@api_view(["GET", "PUT"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
def club_settings(request):
    restaurant = staff_restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    cfg = get_settings(restaurant)
    if request.method == "GET":
        return api_success(data=_settings_data(cfg))

    d = request.data
    try:
        if "is_active" in d:
            cfg.is_active = bool(d["is_active"])
        if "earn_amount" in d:
            cfg.earn_amount = _int_field(d, "earn_amount", minimum=1)
        if "redeem_value" in d:
            cfg.redeem_value = _int_field(d, "redeem_value")
        if "min_redeem_points" in d:
            cfg.min_redeem_points = _int_field(d, "min_redeem_points", minimum=1)
        if "welcome_points" in d:
            cfg.welcome_points = _int_field(d, "welcome_points")
        if "silver_points" in d:
            cfg.silver_points = _int_field(d, "silver_points")
        if "gold_points" in d:
            cfg.gold_points = _int_field(d, "gold_points")
    except (ValueError, TypeError):
        return api_error("مقادیر تنظیمات نامعتبر است.")
    if cfg.gold_points < cfg.silver_points:
        return api_error("آستانه‌ی طلایی نمی‌تواند کمتر از نقره‌ای باشد.")
    cfg.save()
    return api_success(data=_settings_data(cfg), message="ذخیره شد.")


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
def club_members(request):
    restaurant = staff_restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    cfg = get_settings(restaurant)

    if request.method == "GET":
        qs = LoyaltyMember.objects.filter(restaurant=restaurant)
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(phone__icontains=q) | Q(name__icontains=q))
        return api_success(data=[_member_data(m, cfg) for m in qs.order_by("-joined_at")[:LIMIT]])

    try:
        member, created = get_or_create_member(
            restaurant, request.data.get("phone"), request.data.get("name", ""),
            user=request.user,
        )
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(
        data=_member_data(member, cfg),
        message="عضو ثبت شد." if created else "این شماره قبلاً عضو است.",
        status_code=201 if created else 200,
    )


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
def club_member_detail(request, pk):
    restaurant = staff_restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    m = get_object_or_404(LoyaltyMember.objects.filter(restaurant=restaurant), pk=pk)
    cfg = get_settings(restaurant)
    data = _member_data(m, cfg)
    data["transactions"] = [
        {
            "id": t.id, "points": t.points, "kind": t.kind,
            "kind_display": t.get_kind_display(), "note": t.note,
            "order_id": t.order_id, "created_at": t.created_at.isoformat(),
        }
        for t in m.transactions.all()[:100]
    ]
    return api_success(data=data)


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ClubPerm])
def club_member_adjust(request, pk):
    restaurant = staff_restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    m = get_object_or_404(LoyaltyMember.objects.filter(restaurant=restaurant), pk=pk)
    try:
        delta = int(request.data.get("points"))
        m = adjust_points(m, delta, note=str(request.data.get("note") or ""), user=request.user)
    except (TypeError, ValueError) as exc:
        return api_error(str(exc) if str(exc) and not str(exc).startswith("invalid literal")
                         else "مقدار امتیاز نامعتبر است.")
    return api_success(data=_member_data(m, get_settings(restaurant)), message="اصلاح شد.")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([CashierPerm])
def club_lookup(request):
    restaurant = staff_restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    cfg = get_settings(restaurant)
    try:
        phone = normalize_phone(request.data.get("phone"))
    except ValueError as exc:
        return api_error(str(exc))
    m = LoyaltyMember.objects.filter(restaurant=restaurant, phone=phone).first()
    if not m:
        return api_success(data={"member": None, "settings": _settings_data(cfg)})
    data = _member_data(m, cfg)
    data["max_discount"] = m.points_balance * cfg.redeem_value
    return api_success(data={"member": data, "settings": _settings_data(cfg)})


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([CashierPerm])
def club_redeem(request):
    restaurant = staff_restaurant(request)
    if restaurant is None:
        return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")
    try:
        result = redeem_points(
            restaurant, request.data.get("phone"), request.data.get("points"),
            user=request.user, note=str(request.data.get("note") or ""),
        )
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=result, message="امتیاز استفاده شد.")
