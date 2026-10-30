# restaurant/views/dashboard.py
import datetime
from decimal import Decimal

from django.db.models import Sum, F, Count, Q, Max
from django.db.models.functions import TruncDay, TruncHour
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ..models import (
    Order, OrderItem, RawMaterial, StockItem,
    InventoryMovement, PurchaseInvoice, Restaurant, Expense,
)
from ..tenancy import (
    get_current_restaurant,
    set_current_restaurant,
    get_restaurant_from_request,
)

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


def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    if hasattr(request, "user") and request.user.is_authenticated:
        r = getattr(request.user, "restaurant", None)
        if r:
            set_current_restaurant(r)
            return r
    slug = request.headers.get("X-Tenant-Slug", "")
    if slug:
        r = Restaurant.objects.filter(slug=slug, is_active=True).first()
        if r:
            set_current_restaurant(r)
            return r
    r = Restaurant.objects.filter(is_active=True).first()
    if r:
        set_current_restaurant(r)
        return r
    return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_analytics(request):
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"error": "رستوران یافت نشد"}, status=400)

    is_demo = request.session.get('show_demo', False)

    today = datetime.date.today()
    week_start = today - datetime.timedelta(days=6)
    prev_week_start = week_start - datetime.timedelta(days=7)
    month_start = today.replace(day=1)
    month_start_dt = datetime.datetime.combine(month_start, datetime.time.min)
    week_start_dt = datetime.datetime.combine(week_start, datetime.time.min)
    prev_week_start_dt = datetime.datetime.combine(prev_week_start, datetime.time.min)

    # ═══════════════════════════════════════════
    #  بخش صندوق (POS)
    # ═══════════════════════════════════════════

    today_orders = Order.objects.filter(restaurant=restaurant, created_at__date=today)
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
            order__restaurant=restaurant,
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
            restaurant=restaurant, date=today
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
        Order.objects.filter(restaurant=restaurant, created_at__date__gte=week_start)
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
            order__restaurant=restaurant,
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
            order__restaurant=restaurant,
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
            order__restaurant=restaurant,
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
            restaurant=restaurant,
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
        Order.objects.filter(restaurant=restaurant, created_at__gte=month_start_dt)
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

    # ═══════════════════════════════════════════
    #  بخش انبار (Inventory)
    # ═══════════════════════════════════════════

    stock_items = StockItem.objects.filter(
        warehouse__restaurant=restaurant
    ).select_related("raw_material", "warehouse")

    inv_agg = stock_items.aggregate(
        tv=Sum(F("quantity") * F("raw_material__price")),
    )
    total_inv_value = int(inv_agg["tv"] or 0)

    low_stock_qs = stock_items.filter(
        raw_material__minimum_stock__gt=0,
        quantity__lte=F("raw_material__minimum_stock"),
    )

    # ── ضایعات ماه جاری (از InventoryMovement با waste_reason) ──
    monthly_waste_agg = InventoryMovement.objects.filter(
        restaurant=restaurant,
        created_at__gte=month_start_dt,
        waste_reason__isnull=False,
    ).exclude(waste_reason="").aggregate(
        t=Sum(F("quantity") * F("raw_material__price"))
    )
    monthly_waste_value = int(monthly_waste_agg["t"] or 0)

    # ── اقلام نزدیک انقضا (از RawMaterial اگه فیلد داشته باشه) ──
    expiring_items = []
    try:
        soon = today + datetime.timedelta(days=7)
        # بررسی اینکه آیا فیلد expiry_date وجود داره
        raw_fields = [f.name for f in RawMaterial._meta.get_fields()]
        if "expiry_date" in raw_fields or "shelf_life_days" in raw_fields:
            # اگه RawMaterial تاریخ انقضا داره
            expiring_qs = stock_items.filter(
                quantity__gt=0,
            ).select_related("raw_material")[:10]
            for si in expiring_qs:
                rm = si.raw_material
                expiry = getattr(rm, "expiry_date", None)
                if expiry and expiry <= soon:
                    days_left = (expiry - today).days
                    severity = "critical" if days_left <= 1 else ("warning" if days_left <= 3 else "ok")
                    expiring_items.append({
                        "name": rm.name,
                        "nameEn": rm.name,
                        "expiry": f"{days_left} روز",
                        "expiryEn": f"{days_left} days",
                        "quantity": float(si.quantity),
                        "unit": rm.unit or "",
                        "severity": severity,
                    })
    except Exception:
        pass

    inv_stats = {
        "stockValue": total_inv_value,
        "stockValueChange": 0,
        "lowStock": low_stock_qs.count(),
        "lowStockChange": 0,
        "expiring": len(expiring_items),
        "expiringChange": 0,
        "monthlyWaste": monthly_waste_value,
        "wasteChange": 0,
    }

    stock_level = [
        {
            "name": si.raw_material.name,
            "nameEn": si.raw_material.name,
            "current": float(si.quantity),
            "min": float(si.raw_material.minimum_stock),
            "unit": si.raw_material.unit or "",
        }
        for si in low_stock_qs.select_related("raw_material", "warehouse")[:10]
    ]

    # ── جریان ورود/خروج ──
    movement_qs = (
        InventoryMovement.objects.filter(
            restaurant=restaurant, created_at__date__gte=week_start
        )
        .annotate(day=TruncDay("created_at"))
        .values("day", "movement_type")
        .annotate(total=Sum("quantity"))
        .order_by("day")
    )
    flow_map = {}
    for m in movement_qs:
        d = m["day"].date()
        if d not in flow_map:
            flow_map[d] = {"in": 0, "out": 0}
        val = float(m["total"] or 0)
        if m["movement_type"] in ("in", "production", "adjustment"):
            flow_map[d]["in"] += val
        else:
            flow_map[d]["out"] += val

    stock_flow = []
    for i in range(6, -1, -1):
        d = today - datetime.timedelta(days=i)
        entry = flow_map.get(d, {"in": 0, "out": 0})
        stock_flow.append({
            "day": day_label_fa(d),
            "dayEn": day_label_en(d),
            "inbound": round(entry["in"], 1),
            "outbound": round(entry["out"], 1),
        })

    # ── نمودار دایره‌ای ضایعات (از waste_reason) ★ ──
    waste_pie = []
    try:
        waste_breakdown = (
            InventoryMovement.objects.filter(
                restaurant=restaurant,
                created_at__gte=month_start_dt,
            )
            .exclude(waste_reason="")
            .exclude(waste_reason__isnull=True)
            .values("waste_reason")
            .annotate(total=Sum("quantity"))
            .order_by("-total")
        )
        for w in waste_breakdown:
            reason = w["waste_reason"] or "other"
            waste_pie.append({
                "name": WASTE_LABELS.get(reason, reason),
                "nameEn": reason.replace("_", " ").title(),
                "value": float(w["total"] or 0),
                "color": WASTE_COLORS.get(reason, "#6b7280"),
            })
    except Exception:
        pass

    # ── هشدارهای موجودی ──
    stock_alerts = []
    for si in low_stock_qs.select_related("raw_material", "warehouse")[:10]:
        level = "critical" if si.quantity <= 0 else "warning"
        msg = (
            f"{si.raw_material.name}: موجودی ({float(si.quantity)}) "
            f"زیر حداقل ({float(si.raw_material.minimum_stock)})"
        )
        stock_alerts.append({
            "name": si.raw_material.name,
            "nameEn": si.raw_material.name,
            "message": msg,
            "messageEn": msg,
            "level": level,
            "current": float(si.quantity),
            "min": float(si.raw_material.minimum_stock),
        })

    # ── پرمصرف‌ترین مواد ──
    top_used_qs = (
        InventoryMovement.objects.filter(
            restaurant=restaurant,
            created_at__date__gte=week_start,
            movement_type="out",
        )
        .values("raw_material__name", "raw_material__unit")
        .annotate(total=Sum("quantity"))
        .order_by("-total")[:5]
    )
    top_used = [
        {
            "name": t["raw_material__name"],
            "nameEn": t["raw_material__name"],
            "used": float(t["total"] or 0),
            "unit": t["raw_material__unit"] or "",
        }
        for t in top_used_qs
    ]

    # ── کم‌مصرف‌ترین ──
    slow_movers = []
    slow_qs = (
        InventoryMovement.objects.filter(
            restaurant=restaurant, movement_type="out"
        )
        .values("raw_material__name", "raw_material__unit")
        .annotate(total_qty=Sum("quantity"), last_use=Max("created_at"))
        .order_by("last_use")[:5]
    )
    for s in slow_qs:
        last = s["last_use"]
        slow_movers.append({
            "name": s["raw_material__name"],
            "nameEn": s["raw_material__name"],
            "lastUsed": last.strftime("%Y-%m-%d") if last else "—",
            "lastUsedEn": last.strftime("%Y-%m-%d") if last else "—",
            "quantity": float(s["total_qty"] or 0),
            "unit": s["raw_material__unit"] or "",
        })

    # ── مقایسه هفتگی انبار ★ ──
    def calc_movements(start, end=None):
        qs = InventoryMovement.objects.filter(
            restaurant=restaurant, created_at__date__gte=start
        )
        if end:
            qs = qs.filter(created_at__date__lt=end)
        inbound = float(qs.filter(
            movement_type__in=["in", "production", "adjustment"]
        ).aggregate(t=Sum("quantity"))["t"] or 0)
        outbound = float(qs.exclude(
            movement_type__in=["in", "production", "adjustment"]
        ).aggregate(t=Sum("quantity"))["t"] or 0)
        waste = float(qs.exclude(
            waste_reason=""
        ).exclude(
            waste_reason__isnull=True
        ).aggregate(t=Sum("quantity"))["t"] or 0)
        return inbound, outbound, waste

    this_in, this_out, this_waste = calc_movements(week_start)
    prev_in, prev_out, prev_waste = calc_movements(prev_week_start, week_start)

    inv_weekly = {
        "thisWeekStock": total_inv_value,
        "lastWeekStock": 0,
        "thisWeekInbound": round(this_in, 1),
        "lastWeekInbound": round(prev_in, 1),
        "thisWeekWaste": round(this_waste, 1),
        "lastWeekWaste": round(prev_waste, 1),
        "stockChange": 0,
        "inboundChange": round((this_in - prev_in) / prev_in * 100, 1) if prev_in > 0 else 0,
        "wasteChange": round((this_waste - prev_waste) / prev_waste * 100, 1) if prev_waste > 0 else 0,
    }

    return JsonResponse({
        "success": True,
        "is_demo": is_demo,
        # ── صندوق ──
        "posStats": pos_stats,
        "salesTrend": sales_trend,
        "hourly": hourly,
        "categories": categories,
        "topItems": top_items,
        "lowItems": low_items,
        "orderStatus": order_status,
        "weeklyCompare": weekly_compare,
        "monthlyTrend": monthly_trend,
        # ── انبار ──
        "invStats": inv_stats,
        "stockLevel": stock_level,
        "stockFlow": stock_flow,
        "wastePie": waste_pie,
        "stockAlerts": stock_alerts,
        "expiring": expiring_items,
        "topUsed": top_used,
        "slowMovers": slow_movers,
        "invWeekly": inv_weekly,
    })