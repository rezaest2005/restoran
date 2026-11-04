"""باشگاه مشتریان — کسب و استفاده از امتیاز."""

import re

from django.db import IntegrityError, transaction
from django.db.models import F

from .models import LoyaltyMember, LoyaltySettings, LoyaltyTransaction

_PHONE_RE = re.compile(r"^[0-9]{7,15}$")
_FA_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_phone(raw):
    phone = str(raw or "").strip().translate(_FA_DIGITS).replace(" ", "").replace("-", "")
    if not _PHONE_RE.match(phone):
        raise ValueError("شماره موبایل نامعتبر است.")
    return phone


def get_settings(business):
    obj, _ = LoyaltySettings.all_objects.get_or_create(business=business)
    return obj


def tier_for(settings_obj, lifetime_points):
    if lifetime_points >= settings_obj.gold_points:
        return "gold"
    if lifetime_points >= settings_obj.silver_points:
        return "silver"
    return "member"


def _add(member, points, kind, order=None, note="", user=None):
    LoyaltyTransaction.all_objects.create(
        business=member.business, member=member, points=points, kind=kind,
        order=order, note=note[:200], created_by=user,
    )
    updates = {"points_balance": F("points_balance") + points}
    if points > 0:
        updates["lifetime_points"] = F("lifetime_points") + points
    LoyaltyMember.all_objects.filter(pk=member.pk).update(**updates)
    member.refresh_from_db(fields=["points_balance", "lifetime_points"])


@transaction.atomic
def get_or_create_member(business, phone, name="", user=None):
    phone = normalize_phone(phone)
    cfg = get_settings(business)
    member = LoyaltyMember.all_objects.filter(business=business, phone=phone).first()
    if member:
        return member, False
    try:
        with transaction.atomic():
            member = LoyaltyMember.all_objects.create(
                business=business, phone=phone, name=str(name or "")[:200]
            )
    except IntegrityError:
        return LoyaltyMember.all_objects.get(business=business, phone=phone), False
    if cfg.welcome_points:
        _add(member, cfg.welcome_points, LoyaltyTransaction.Kind.WELCOME, user=user,
             note="امتیاز عضویت")
    return member, True


@transaction.atomic
def earn_for_order(order):
    """
    امتیاز یک سفارش را به عضو باشگاه می‌دهد (idempotent).
    فقط اگر باشگاه فعال باشد و سفارش شماره موبایل داشته باشد.
    خروجی: تعداد امتیاز داده‌شده (۰ اگر چیزی داده نشد).
    """
    cfg = LoyaltySettings.all_objects.filter(business_id=order.business_id).first()
    if not cfg or not cfg.is_active or not order.phone:
        return 0
    try:
        phone = normalize_phone(order.phone)
    except ValueError:
        return 0
    points = int(order.total_price) // cfg.earn_amount
    if points <= 0:
        return 0
    if LoyaltyTransaction.all_objects.filter(order=order, kind="earn").exists():
        return 0
    member, _ = get_or_create_member(order.business, phone, order.customer_name)
    member = LoyaltyMember.all_objects.select_for_update().get(pk=member.pk)
    try:
        with transaction.atomic():
            _add(member, points, LoyaltyTransaction.Kind.EARN, order=order,
                 note=f"سفارش #{order.pk}")
    except IntegrityError:
        return 0
    return points


@transaction.atomic
def redeem_points(business, phone, points, user=None, note=""):
    """
    استفاده از امتیاز؛ مبلغ تخفیف را برمی‌گرداند.
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
        business=business, phone=phone, is_active=True
    ).first()
    if not member:
        raise ValueError("عضو باشگاه پیدا نشد.")
    if member.points_balance < points:
        raise ValueError("امتیاز کافی نیست.")
    _add(member, -points, LoyaltyTransaction.Kind.REDEEM, note=note or "استفاده از امتیاز",
         user=user)
    return {"discount": points * cfg.redeem_value, "points_used": points,
            "balance": member.points_balance}


@transaction.atomic
def adjust_points(member, delta, note="", user=None):
    member = LoyaltyMember.all_objects.select_for_update().get(pk=member.pk)
    delta = int(delta)
    if delta == 0:
        raise ValueError("مقدار اصلاح نمی‌تواند صفر باشد.")
    if member.points_balance + delta < 0:
        raise ValueError("امتیاز نمی‌تواند منفی شود.")
    _add(member, delta, LoyaltyTransaction.Kind.ADJUST, note=note or "اصلاح دستی", user=user)
    return member
