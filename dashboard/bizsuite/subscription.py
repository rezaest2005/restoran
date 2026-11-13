"""
Business subscription: one exact moment (to the second) after which the whole dashboard is closed.

  unlimited   no end date
  monthly     30 days     quarterly  90 days     semiannual  180 days     yearly  365 days
  custom      an exact date and time chosen by the super admin

The end is fixed when the plan is applied (now + the period, seconds included). "extend" adds the period to the current
end when it is still in the future. Everything that grants access (features.licensed_features and the API
authentication) asks ``is_expired`` live, so the dashboard closes at that very second, not at the next night.
"""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

UNLIMITED = "unlimited"
PLAN_DAYS = {"monthly": 30, "quarterly": 90, "semiannual": 180, "yearly": 365}
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
    elif plan in PLAN_DAYS:
        base = now
        if mode == "extend" and business.subscription_ends_at and business.subscription_ends_at > now:
            base = business.subscription_ends_at
        business.subscription_ends_at = base + timedelta(days=PLAN_DAYS[plan])
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
