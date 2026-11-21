"""
باشگاه مشتریان — کمپین‌های قانون‌محور، پیام‌ها و کار روزانه.

* کمپین تولد / سالگرد / عدم مراجعه / بخش مشتریان: امتیاز هدیه، کوپن شخصی و پیام.
  هر عضو در هر «اجرا» (سال تولد، دوره‌ی غیبت ...) فقط یک بار — ``LoyaltyCampaignLog``.
* پیام‌ها در صندوق خروجی ``LoyaltyMessage`` ثبت و از طریق صف کارها (jobs) با ارائه‌دهنده‌ی پیامک
  ارسال می‌شوند. ارائه‌دهنده‌ی پیش‌فرض فقط ثبت می‌کند (بدون API پولی). برای اتصال واقعی:
  ``settings.CLUB_SMS_PROVIDER = "path.to.Provider"`` با متد ``send(phone, body) -> (ok, error)``.
* ``run_daily``: انقضای امتیاز، بازبینی سطح‌ها (تنزل خودکار) و کمپین‌های خودکار.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings as dj_settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.module_loading import import_string

from . import jobs
from .club_analytics import segment_q
from .club_services import create_coupon, expire_points, get_settings, grant_points, recompute_tier, tier_list
from .models import (
    LoyaltyCampaign, LoyaltyCampaignLog, LoyaltyMember, LoyaltyMessage, LoyaltySettings,
)

logger = logging.getLogger(__name__)

AUTO_KINDS = (LoyaltyCampaign.Kind.BIRTHDAY, LoyaltyCampaign.Kind.ANNIVERSARY, LoyaltyCampaign.Kind.INACTIVITY)


# ───────────────────────── SMS provider interface ─────────────────────────

class SmsProvider:
    """رابط ارائه‌دهنده‌ی پیامک. هر پیاده‌سازی ``send`` را بازنویسی می‌کند."""

    name = "base"

    def send(self, phone, body):  # pragma: no cover - interface
        raise NotImplementedError


class LogOnlyProvider(SmsProvider):
    """پیش‌فرض: پیامی ارسال نمی‌کند، فقط در صندوق خروجی ثبت می‌شود (وضعیت «logged»)."""

    name = "log"

    def send(self, phone, body):
        logger.info("club sms (log only) to %s: %s", phone, body[:80])
        return None, ""


def get_provider():
    path = getattr(dj_settings, "CLUB_SMS_PROVIDER", "")
    if path:
        try:
            return import_string(path)()
        except Exception:
            logger.exception("invalid CLUB_SMS_PROVIDER %s", path)
    return LogOnlyProvider()


def render(template, member, **extra):
    values = {
        "name": member.name or "", "points": str(member.points_balance), "code": member.code,
        "phone": member.phone, "business": getattr(member.business, "name", ""),
    }
    values.update({k: str(v) for k, v in extra.items()})
    out = str(template or "")
    for k, v in values.items():
        out = out.replace("{" + k + "}", v)
    return out[:600]


def queue_message(member, body, campaign=None):
    """پیام را در صندوق خروجی می‌گذارد و در صف ارسال قرار می‌دهد."""
    body = (body or "").strip()
    if not body:
        return None
    cfg = get_settings(member.business)
    status = LoyaltyMessage.Status.QUEUED
    error = ""
    if not cfg.sms_enabled:
        status, error = LoyaltyMessage.Status.SKIPPED, "sms disabled"
    elif not member.sms_opt_in:
        status, error = LoyaltyMessage.Status.SKIPPED, "opted out"
    msg = LoyaltyMessage.all_objects.create(
        business_id=member.business_id, member=member, campaign=campaign, phone=member.phone,
        body=body[:600], status=status, error=error)
    if status == LoyaltyMessage.Status.QUEUED:
        transaction.on_commit(lambda: jobs.enqueue("club_send_message", {"id": msg.id}, max_attempts=3))
    return msg


def deliver(msg):
    provider = get_provider()
    ok, error = provider.send(msg.phone, msg.body)
    msg.provider = provider.name
    if ok is None:
        msg.status = LoyaltyMessage.Status.LOGGED
    elif ok:
        msg.status = LoyaltyMessage.Status.SENT
    else:
        msg.status = LoyaltyMessage.Status.FAILED
        msg.error = str(error or "")[:300]
    msg.sent_at = timezone.now()
    msg.save(update_fields=["provider", "status", "error", "sent_at"])
    if msg.status == LoyaltyMessage.Status.FAILED:
        raise RuntimeError(msg.error or "sms failed")   # jobs retries with backoff
    return msg


@jobs.register("club_send_message")
def _job_send_message(payload):
    msg = LoyaltyMessage.all_objects.filter(pk=payload.get("id")).first()
    if msg and msg.status in (LoyaltyMessage.Status.QUEUED, LoyaltyMessage.Status.FAILED):
        deliver(msg)


# ───────────────────────── campaigns ─────────────────────────

def _same_day(d, today):
    if d is None:
        return False
    if d.month == 2 and d.day == 29 and not (today.year % 4 == 0 and (today.year % 100 or today.year % 400 == 0)):
        return today.month == 2 and today.day == 28
    return d.month == today.month and d.day == today.day


def campaign_candidates(campaign, cfg, now=None):
    """[(member, run_key)] — اعضایی که امروز مشمول کمپین‌اند."""
    now = now or timezone.now()
    today = timezone.localtime(now).date()
    base = LoyaltyMember.all_objects.filter(business_id=campaign.business_id, is_active=True)
    kind = campaign.kind
    if kind == LoyaltyCampaign.Kind.BIRTHDAY:
        qs = base.filter(birth_date__isnull=False)
        return [(m, str(today.year)) for m in qs if _same_day(m.birth_date, today)]
    if kind == LoyaltyCampaign.Kind.ANNIVERSARY:
        qs = base.filter(anniversary_date__isnull=False)
        return [(m, str(today.year)) for m in qs if _same_day(m.anniversary_date, today)]
    if kind == LoyaltyCampaign.Kind.INACTIVITY:
        cut = now - timedelta(days=max(1, campaign.inactivity_days))
        qs = base.filter(last_purchase_at__isnull=False, last_purchase_at__lt=cut)
        # یک بار در هر دوره‌ی غیبت: کلید = تاریخ آخرین خرید
        return [(m, timezone.localtime(m.last_purchase_at).strftime("%Y%m%d")) for m in qs]
    if kind == LoyaltyCampaign.Kind.SEGMENT:
        q = segment_q(campaign.segment, cfg, now)
        qs = base.filter(q) if q is not None else base
        return [(m, "once") for m in qs]
    return []


def run_campaign(campaign, now=None, user=None):
    """اجرای یک کمپین (idempotent). خروجی: تعداد اعضایی که این بار مشمول شدند."""
    now = now or timezone.now()
    cfg = get_settings(campaign.business)
    if not cfg.is_active:
        return 0
    count = 0
    for member, key in campaign_candidates(campaign, cfg, now):
        try:
            with transaction.atomic():
                LoyaltyCampaignLog.all_objects.create(business_id=campaign.business_id, campaign=campaign,
                                                      member=member, run_key=key)
                if campaign.bonus_points:
                    member = grant_points(member, campaign.bonus_points, note=f"کمپین: {campaign.name}",
                                          user=user)
                coupon = None
                if campaign.coupon_kind and campaign.coupon_value:
                    coupon = create_coupon(campaign.business, kind=campaign.coupon_kind,
                                           value=campaign.coupon_value, member=member, title=campaign.name,
                                           prefix="C", usage_limit=1,
                                           valid_days=campaign.coupon_valid_days or None, campaign=campaign)
                if campaign.message:
                    queue_message(member, render(campaign.message, member, coupon=coupon.code if coupon else "",
                                                 bonus=campaign.bonus_points), campaign=campaign)
        except IntegrityError:
            continue   # already done for this run
        count += 1
    LoyaltyCampaign.all_objects.filter(pk=campaign.pk).update(last_run_at=now)
    return count


# ───────────────────────── daily maintenance ─────────────────────────

def run_daily_for(business, now=None):
    from .modules import module_enabled

    now = now or timezone.now()
    cfg = get_settings(business)
    if not cfg.is_active or not module_enabled(business, "club"):
        return {"expired": 0, "tier_changes": 0, "campaigns": 0}
    expired = expire_points(business, now)
    tiers = tier_list(business)
    changes = 0
    for m in LoyaltyMember.all_objects.filter(business=business, is_active=True).select_related("tier"):
        if recompute_tier(m, cfg, tiers):
            changes += 1
    reached = 0
    for c in LoyaltyCampaign.all_objects.filter(business=business, is_active=True, kind__in=AUTO_KINDS):
        reached += run_campaign(c, now)
    return {"expired": expired, "tier_changes": changes, "campaigns": reached}


def run_daily(now=None):
    out = {}
    for cfg in LoyaltySettings.all_objects.filter(is_active=True).select_related("business"):
        if not getattr(cfg.business, "is_active", True):
            continue
        try:
            out[cfg.business_id] = run_daily_for(cfg.business, now)
        except Exception:
            logger.exception("club daily failed for business %s", cfg.business_id)
    return out


def _seconds_until_next_run(hour=3):
    now = timezone.localtime()
    nxt = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if nxt <= now:
        nxt += timedelta(days=1)
    return int((nxt - now).total_seconds())


def ensure_daily_scheduled():
    """یک کار «club_daily» در صف نگه می‌دارد (تکراری ساخته نمی‌شود)."""
    return jobs.enqueue("club_daily", {}, delay_seconds=_seconds_until_next_run(), dedupe=True)


@jobs.register("club_daily")
def _job_daily(payload):
    try:
        run_daily()
    finally:
        ensure_daily_scheduled()
