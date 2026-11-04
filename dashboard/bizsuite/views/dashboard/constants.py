"""
Dashboard — ثابت‌ها و برچسب‌های نمودار
"""

CATEGORY_COLORS = ["#ff6b35", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#84cc16"]
WASTE_COLORS = {
    "expired": "#ef4444", "damaged": "#f59e0b", "overcooked": "#8b5cf6",
    "quality_issue": "#3b82f6", "returned": "#10b981", "other": "#6b7280",
}
WASTE_LABELS = {
    "expired": "تاریخ گذشته", "damaged": "آسیب‌دیده", "overcooked": "بیش‌پخت",
    "quality_issue": "مشکل کیفیت", "returned": "برگشتی مشتری", "other": "سایر",
}
DAY_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]
DAY_EN = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]


def day_label_fa(d): return DAY_FA[d.weekday()]
def day_label_en(d): return DAY_EN[d.weekday()]
