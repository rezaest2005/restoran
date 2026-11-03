"""
Dashboard — بازه‌های زمانی مشترک بین بخش‌های صندوق و انبار
"""
import datetime
from types import SimpleNamespace


def date_windows():
    today = datetime.date.today()
    week_start = today - datetime.timedelta(days=6)
    prev_week_start = week_start - datetime.timedelta(days=7)
    month_start = today.replace(day=1)
    month_start_dt = datetime.datetime.combine(month_start, datetime.time.min)
    return SimpleNamespace(
        today=today,
        week_start=week_start,
        prev_week_start=prev_week_start,
        month_start=month_start,
        month_start_dt=month_start_dt,
    )
