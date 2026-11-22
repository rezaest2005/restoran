"""
Business subscription: one exact moment (to the second) after which the whole dashboard is closed.

  unlimited   no end date
  monthly     1 calendar month   quarterly  3 months   semiannual  6 months   yearly  12 months
  custom      an exact date and time chosen by the super admin

The end is fixed when the plan is applied (now + the period, seconds included). "extend" adds the period to the current
end when it is still in the future. Everything that grants access (features.licensed_features and the API
authentication) asks ``is_expired`` live, so the dashboard closes at that very second, not at the next night.
"""
from __future__ import annotations

import calendar

from django.utils import timezone

UNLIMITED = "unlimited"
PLAN_MONTHS = {"monthly": 1, "quarterly": 3, "semiannual": 6, "yearly": 12}
PLAN_CHOICES = [
    (UNLIMITED, "بدون تاریخ"),
    ("monthly", "یک‌ماهه"),
    ("quarterly", "سه‌ماهه"),
    ("semiannual", "شش‌ماهه"),
    ("yearly", "سالانه"),
    ("custom", "تاریخ دلخواه"),
]
PLAN_LABELS = dict(PLAN_CHOICES)
MESSAGE = "اشتراک شما به پایان رسیده است. برای تمدید با پشتیبانی تماس بگیرید."


def add_months(moment, months):
    """Same wall-clock time ``months`` calendar months later (the day is clamped: 31 Jan + 1 month = 28/29 Feb)."""
    local = timezone.localtime(moment)
    index = local.year * 12 + (local.month - 1) + months
    year, month = divmod(index, 12)
    month += 1
    day = min(local.day, calendar.monthrange(year, month)[1])
    return local.replace(year=year, month=month, day=day)


def is_expired(business, now=None) -> bool:
    ends = getattr(business, "subscription_ends_at", None)
    return ends is not None and ends <= (now or timezone.now())


def payload(business, now=None) -> dict:
    """What the dashboard needs to draw the countdown (server time is included so a wrong PC clock does not matter)."""
    now = now or timezone.now()
    ends = business.subscription_ends_at
    return {
        "plan": business.subscription_plan,
        "plan_display": PLAN_LABELS.get(business.subscription_plan, ""),
        "unlimited": ends is None,
        "started_at": business.subscription_started_at.isoformat() if business.subscription_started_at else None,
        "ends_at": ends.isoformat() if ends else None,
        "seconds_left": None if ends is None else max(0, int((ends - now).total_seconds())),
        "expired": ends is not None and ends <= now,
        "server_now": now.isoformat(),
    }


def apply(business, plan, mode="set", ends_at=None, now=None):
    """Set the plan. mode "set": from now. mode "extend": add the period to the current end when it is still ahead."""
    now = (now or timezone.now()).replace(microsecond=0)
    if plan == UNLIMITED:
        business.subscription_plan, business.subscription_ends_at = UNLIMITED, None
        business.subscription_started_at = None
    elif plan in PLAN_MONTHS:
        base = now
        if mode == "extend" and business.subscription_ends_at and business.subscription_ends_at > now:
            base = business.subscription_ends_at
        business.subscription_ends_at = add_months(base, PLAN_MONTHS[plan])
        business.subscription_plan = plan
        if mode != "extend" or business.subscription_started_at is None:
            business.subscription_started_at = now
    elif plan == "custom":
        if ends_at is None:
            raise ValueError("تاریخ و ساعت پایان لازم است.")
        business.subscription_ends_at = ends_at.replace(microsecond=0)
        business.subscription_plan = "custom"
        business.subscription_started_at = business.subscription_started_at or now
    else:
        raise ValueError("نوع اشتراک نامعتبر است.")
    business.save(update_fields=["subscription_plan", "subscription_started_at", "subscription_ends_at"])
    return business


def _day(value):
    """'YYYY-MM-DD' (or empty) -> date, or ValueError."""
    from datetime import date
    value = (value or "").strip() if isinstance(value, str) else value
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError as exc:
        raise ValueError("تاریخ نامعتبر است.") from exc


def dates_of(business) -> dict:
    """Start / end as plain local dates (what the customer form shows)."""
    def local(dt):
        return timezone.localtime(dt).date().isoformat() if dt else ""
    return {"start_date": local(business.subscription_started_at), "end_date": local(business.subscription_ends_at)}


def apply_dates(business, start_date, end_date):
    """Set the subscription from two calendar days. The dashboard closes at the end of the end day;
    no end day = unlimited. Raises ValueError for a bad date or an end before the start."""
    start, end = _day(start_date), _day(end_date)
    if start and end and end < start:
        raise ValueError("تاریخ پایان نباید قبل از تاریخ شروع باشد.")
    tz = timezone.get_current_timezone()
    from datetime import datetime, time
    business.subscription_started_at = timezone.make_aware(datetime.combine(start, time.min), tz) if start else None
    if end:
        business.subscription_ends_at = timezone.make_aware(datetime.combine(end, time(23, 59, 59)), tz)
        business.subscription_plan = "custom"
    else:
        business.subscription_ends_at = None
        business.subscription_plan = UNLIMITED
    business.save(update_fields=["subscription_plan", "subscription_started_at", "subscription_ends_at"])
    return business
