"""
Dashboard — بخش صندوق (POS)
"""
import datetime
from decimal import Decimal

from django.db.models import Sum, F, Count
from django.db.models.functions import TruncDay, TruncHour

from ...models import Order, OrderItem, Expense
from .constants import CATEGORY_COLORS, day_label_fa, day_label_en


def build_pos_section(business, w):
    """آمار و نمودارهای صندوق."""
    today = w.today
    week_start = w.week_start
    prev_week_start = w.prev_week_start
    month_start_dt = w.month_start_dt

    # ═══════════════════════════════════════════
    #  بخش صندوق (POS)
    # ═══════════════════════════════════════════

    today_orders = Order.objects.filter(business=business, created_at__date=today)
    active_orders = today_orders.exclude(status="cancelled")
    today_sales = active_orders.aggregate(t=Sum("total_price"))["t"] or Decimal("0")
    today_count = active_orders.count()
    today_delivered = today_orders.filter(status="delivered").count()
    today_cancelled = today_orders.filter(status="cancelled").count()
    today_customers = active_orders.values("customer_name").exclude(customer_name="").distinct().count()

    # ── میانگین زمان سفارش ──
    avg_minutes = 0
    try:
        delivered_orders = today_orders.filter(status="delivered")
        total_secs = 0
        count = 0
        for o in delivered_orders:
            updated = getattr(o, "updated_at", None) or getattr(o, "delivered_at", None)
            if updated and o.created_at:
                delta = updated - o.created_at
                total_secs += delta.total_seconds()
                count += 1
        if count > 0:
            avg_minutes = round(total_secs / count / 60, 1)
    except Exception:
        pass

    # ── سود امروز ──
    today_cost = 0
    try:
        cost_agg = OrderItem.objects.filter(
            order__business=business,
            order__created_at__date=today,
        ).exclude(order__status="cancelled").aggregate(
            total_cost=Sum(F("quantity") * F("food__cost_price"))
        )
        today_cost = int(cost_agg["total_cost"] or 0)
    except Exception:
        today_cost = 0

    # ── هزینه‌های امروز ──
    today_expense = int(
        Expense.objects.filter(
            business=business, date=today
        ).aggregate(t=Sum("amount"))["t"] or 0
    )

    today_profit = int(today_sales) - today_cost - today_expense

    pos_stats = {
        "sales": int(today_sales),
        "salesChange": 0,
        "orders": today_count,
        "ordersChange": 0,
        "avgOrderValue": int(today_sales / today_count) if today_count else 0,
        "avgTime": avg_minutes,
        "avgTimeChange": 0,
        "customers": today_customers,
        "newCustomers": 0,
        "profit": today_profit,
        "profitChange": 0,
        "delivered": today_delivered,
        "cancelled": today_cancelled,
    }

    # ── روند فروش هفتگی ──
    trend_qs = (
        Order.objects.filter(business=business, created_at__date__gte=week_start)
        .exclude(status="cancelled")
        .annotate(day=TruncDay("created_at"))
        .values("day")
        .annotate(total=Sum("total_price"), cnt=Count("id"))
        .order_by("day")
    )
    trend_map = {t["day"].date(): t for t in trend_qs}
    sales_trend = []
    for i in range(6, -1, -1):
        d = today - datetime.timedelta(days=i)
        entry = trend_map.get(d, {})
        sales_trend.append({
            "name": day_label_fa(d),
            "nameEn": day_label_en(d),
            "date": d.strftime("%Y-%m-%d"),
            "sales": int(entry.get("total", 0) or 0),
            "orders": entry.get("cnt", 0),
        })

    # ── فروش ساعتی ──
    hourly_qs = (
        active_orders
        .annotate(h=TruncHour("created_at"))
        .values("h")
        .annotate(total=Sum("total_price"), cnt=Count("id"))
        .order_by("h")
    )
    hourly = [
        {
            "hour": h["h"].strftime("%H:00"),
            "hourEn": h["h"].strftime("%H:00"),
            "orders": h["cnt"],
            "sales": int(h["total"] or 0),
        }
        for h in hourly_qs
    ]

    # ── دسته‌بندی‌ها ──
    cat_qs = (
        OrderItem.objects.filter(
            order__business=business,
            order__created_at__date__gte=week_start,
            food__isnull=False,
        )
        .exclude(order__status="cancelled")
        .values("food__category__name")
        .annotate(total=Sum(F("price") * F("quantity")))
        .order_by("-total")[:8]
    )
    categories = [
        {
            "name": c["food__category__name"] or "سایر",
            "nameEn": c["food__category__name"] or "Other",
            "value": int(c["total"] or 0),
            "color": CATEGORY_COLORS[i % len(CATEGORY_COLORS)],
        }
        for i, c in enumerate(cat_qs)
    ]

    # ── پرفروش‌ترین ──
    top_qs = (
        OrderItem.objects.filter(
            order__business=business,
            order__created_at__date__gte=week_start,
            food__isnull=False,
        )
        .exclude(order__status="cancelled")
        .values("food__name", "food__name_en")
        .annotate(
            total_qty=Sum("quantity"),
            total_revenue=Sum(F("price") * F("quantity")),
        )
        .order_by("-total_qty")[:5]
    )
    top_items = [
        {
            "name": t["food__name"],
            "nameEn": t["food__name_en"] or t["food__name"],
            "sales": t["total_qty"],
            "revenue": int(t["total_revenue"] or 0),
        }
        for t in top_qs
    ]

    # ── کم‌فروش‌ترین ──
    low_qs = (
        OrderItem.objects.filter(
            order__business=business,
            order__created_at__date__gte=week_start,
            food__isnull=False,
        )
        .exclude(order__status="cancelled")
        .values("food__name", "food__name_en")
        .annotate(
            total_qty=Sum("quantity"),
            total_revenue=Sum(F("price") * F("quantity")),
        )
        .order_by("total_qty")[:5]
    )
    low_items = [
        {
            "name": t["food__name"],
            "nameEn": t["food__name_en"] or t["food__name"],
            "sales": t["total_qty"],
            "revenue": int(t["total_revenue"] or 0),
        }
        for t in low_qs
    ]

    # ── وضعیت سفارشات ──
    STATUS_MAP = {
        "completed": {"name": "تکمیل شده", "nameEn": "Completed", "color": "#10b981"},
        "delivered": {"name": "تحویل شده", "nameEn": "Delivered", "color": "#10b981"},
        "preparing": {"name": "در حال آماده‌سازی", "nameEn": "Preparing", "color": "#f59e0b"},
        "pending": {"name": "در انتظار", "nameEn": "Pending", "color": "#3b82f6"},
        "delivering": {"name": "در حال ارسال", "nameEn": "Delivering", "color": "#3b82f6"},
        "cancelled": {"name": "لغو شده", "nameEn": "Cancelled", "color": "#ef4444"},
    }
    status_counts = today_orders.values("status").annotate(cnt=Count("id"))
    order_status = []
    for s in status_counts:
        info = STATUS_MAP.get(s["status"], {"name": s["status"], "nameEn": s["status"], "color": "#6b7280"})
        order_status.append({
            "name": info["name"],
            "nameEn": info["nameEn"],
            "count": s["cnt"],
            "color": info["color"],
        })

    # ── مقایسه هفتگی ──
    this_week_total = sum(d["sales"] for d in sales_trend)
    prev_week_sales = (
        Order.objects.filter(
            business=business,
            created_at__date__gte=prev_week_start,
            created_at__date__lt=week_start,
        )
        .exclude(status="cancelled")
        .aggregate(t=Sum("total_price"))["t"]
        or Decimal("0")
    )
    prev_week_total = int(prev_week_sales)
    change_pct = (
        round((this_week_total - prev_week_total) / prev_week_total * 100, 1)
        if prev_week_total > 0 else 0
    )
    weekly_compare = {
        "thisWeek": this_week_total,
        "lastWeek": prev_week_total,
        "change": change_pct,
    }

    # ── روند ماهانه ──
    monthly_qs = (
        Order.objects.filter(business=business, created_at__gte=month_start_dt)
        .exclude(status="cancelled")
        .annotate(day=TruncDay("created_at"))
        .values("day")
        .annotate(total=Sum("total_price"), cnt=Count("id"))
        .order_by("day")
    )
    monthly_trend = [
        {
            "name": day_label_fa(m["day"].date()),
            "nameEn": day_label_en(m["day"].date()),
            "date": m["day"].strftime("%Y-%m-%d"),
            "sales": int(m["total"] or 0),
            "orders": m["cnt"],
        }
        for m in monthly_qs
    ]

    return {
        "posStats": pos_stats,
        "salesTrend": sales_trend,
        "hourly": hourly,
        "categories": categories,
        "topItems": top_items,
        "lowItems": low_items,
        "orderStatus": order_status,
        "weeklyCompare": weekly_compare,
        "monthlyTrend": monthly_trend,
    }
