# restaurant/views/dashboard.py
import datetime
import random
from decimal import Decimal

from django.db.models import Sum, F, Count, Q, Max
from django.db.models.functions import TruncDay, TruncHour
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ..models import (
    Order, OrderItem, RawMaterial, StockItem,
    Category, Food, WasteLog, InventoryMovement,
    PurchaseInvoice, Restaurant
)
from ..tenancy import (
    get_current_restaurant, 
    set_current_restaurant, 
    get_restaurant_from_request
)

# ─── رنگ‌های ثابت نمودارها ───
CATEGORY_COLORS = [
    "#ff6b35", "#3b82f6", "#10b981", "#8b5cf6",
    "#f59e0b", "#ef4444", "#06b6d4", "#84cc16",
]

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
    if r: return r
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

    # ★★★ کلید هوشمند: اگر کاربر دمو را دیده باشد (بار دوم لاگین)، این کلید False است ★★★
    show_demo = not request.user.has_seen_demo

    today = datetime.date.today()
    week_start = today - datetime.timedelta(days=6)
    prev_week_start = week_start - datetime.timedelta(days=7)
    month_start = today.replace(day=1)
    month_start_dt = datetime.datetime.combine(month_start, datetime.time.min)

    today_orders = Order.objects.filter(restaurant=restaurant, created_at__date=today)
    active_orders = today_orders.exclude(status="cancelled")
    today_sales = active_orders.aggregate(t=Sum("total_price"))["t"] or Decimal("0")
    today_count = active_orders.count()
    today_delivered = today_orders.filter(status="delivered").count()
    today_cancelled = today_orders.filter(status="cancelled").count()
    today_customers = active_orders.values("customer_name").exclude(customer_name="").distinct().count()

    # ─── stats ───
    if show_demo and today_count == 0:
        pos_stats = {"sales": 1250000, "orders": 14, "customers": 9, "avgTime": 18, "delivered": 12, "cancelled": 1, "avgOrder": 89285}
    else:
        pos_stats = {"sales": int(today_sales), "orders": today_count, "customers": today_customers, "avgTime": 18, "delivered": today_delivered, "cancelled": today_cancelled, "avgOrder": int(today_sales / today_count) if today_count else 0}

    trend_qs = Order.objects.filter(restaurant=restaurant, created_at__date__gte=week_start).exclude(status="cancelled").annotate(day=TruncDay("created_at")).values("day").annotate(total=Sum("total_price"), cnt=Count("id")).order_by("day")
    trend_map = {t["day"].date(): t for t in trend_qs}
    sales_trend = []
    for i in range(6, -1, -1):
        d = today - datetime.timedelta(days=i)
        entry = trend_map.get(d, {})
        sales_trend.append({"name": day_label_fa(d), "nameEn": day_label_en(d), "date": d.strftime("%Y-%m-%d"), "sales": int(entry.get("total", 0) or 0), "orders": entry.get("cnt", 0)})

    hourly_qs = active_orders.annotate(h=TruncHour("created_at")).values("h").annotate(total=Sum("total_price"), cnt=Count("id")).order_by("h")
    hourly = []
    for h in hourly_qs:
        hr = h["h"]; hour_str = hr.strftime("%H:00")
        hourly.append({"hour": hour_str, "hourEn": hour_str, "orders": h["cnt"], "sales": int(h["total"] or 0)})
    if show_demo and not hourly:
        for sh in ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"]:
            hourly.append({"hour": sh, "hourEn": sh, "orders": random.randint(1, 5), "sales": random.randint(50000, 200000)})

    cat_qs = OrderItem.objects.filter(order__restaurant=restaurant, order__created_at__date__gte=week_start, food__isnull=False).exclude(order__status="cancelled").values("food__category__name").annotate(total=Sum(F("price") * F("quantity"))).order_by("-total")[:8]
    categories = []
    for i, c in enumerate(cat_qs):
        categories.append({"name": c["food__category__name"] or "سایر", "nameEn": c["food__category__name"] or "Other", "value": int(c["total"] or 0), "color": CATEGORY_COLORS[i % len(CATEGORY_COLORS)]})
    if show_demo and not categories:
        cats = Category.objects.filter(restaurant=restaurant, is_active=True)[:4]
        for i, c in enumerate(cats):
            categories.append({"name": c.name, "nameEn": c.name_en or c.name, "value": random.randint(50000, 200000), "color": CATEGORY_COLORS[i % len(CATEGORY_COLORS)]})

    top_qs = OrderItem.objects.filter(order__restaurant=restaurant, order__created_at__date__gte=week_start, food__isnull=False).exclude(order__status="cancelled").values("food__name", "food__name_en").annotate(total_qty=Sum("quantity")).order_by("-total_qty")[:5]
    top_items = [{"name": t["food__name"], "nameEn": t["food__name_en"] or t["food__name"], "sales": t["total_qty"]} for t in top_qs]

    low_qs = OrderItem.objects.filter(order__restaurant=restaurant, order__created_at__date__gte=week_start, food__isnull=False).exclude(order__status="cancelled").values("food__name", "food__name_en").annotate(total_qty=Sum("quantity")).order_by("total_qty")[:5]
    low_items = [{"name": t["food__name"], "nameEn": t["food__name_en"] or t["food__name"], "sales": t["total_qty"]} for t in low_qs]

    status_counts = today_orders.values("status").annotate(cnt=Count("id"))
    order_status = [{"name": s["status"], "value": s["cnt"]} for s in status_counts]

    this_week_total = sum(d["sales"] for d in sales_trend)
    prev_week_sales = Order.objects.filter(restaurant=restaurant, created_at__date__gte=prev_week_start, created_at__date__lt=week_start).exclude(status="cancelled").aggregate(t=Sum("total_price"))["t"] or Decimal("0")
    prev_week_total = int(prev_week_sales)
    change_pct = round((this_week_total - prev_week_total) / prev_week_total * 100, 1) if prev_week_total > 0 else 0
    weekly_compare = {"thisWeek": this_week_total, "lastWeek": prev_week_total, "change": change_pct}

    monthly_qs = Order.objects.filter(restaurant=restaurant, created_at__gte=month_start_dt).exclude(status="cancelled").annotate(day=TruncDay("created_at")).values("day").annotate(total=Sum("total_price"), cnt=Count("id")).order_by("day")
    monthly_trend = [{"name": day_label_fa(m["day"].date()), "nameEn": day_label_en(m["day"].date()), "date": m["day"].strftime("%Y-%m-%d"), "sales": int(m["total"] or 0), "orders": m["cnt"]} for m in monthly_qs]

    stock_items = StockItem.objects.filter(warehouse__restaurant=restaurant).select_related("raw_material", "warehouse")
    inv_agg = stock_items.aggregate(tv=Sum(F("quantity") * F("raw_material__price")), tc=Count("id"))
    total_inv_value = int(inv_agg["tv"] or 0)
    low_stock_qs = stock_items.filter(raw_material__minimum_stock__gt=0, quantity__lte=F("raw_material__minimum_stock"))
    waste_month_value = sum(w.total_cost for w in WasteLog.objects.filter(restaurant=restaurant, created_at__gte=month_start_dt))
    inv_stats = {"stockValue": total_inv_value, "lowStock": low_stock_qs.count(), "expiring": 0, "monthlyWaste": int(waste_month_value)}

    stock_level = []
    for si in low_stock_qs.select_related("raw_material", "warehouse")[:10]:
        stock_level.append({"name": si.raw_material.name, "nameEn": si.raw_material.name, "current": float(si.quantity), "min": float(si.raw_material.minimum_stock)})
    if show_demo and not stock_level:
        for si in stock_items[:5]:
            stock_level.append({"name": si.raw_material.name, "nameEn": si.raw_material.name, "current": float(si.quantity), "min": float(si.raw_material.minimum_stock or 1)})

    movement_qs = InventoryMovement.objects.filter(restaurant=restaurant, created_at__date__gte=week_start).annotate(day=TruncDay("created_at")).values("day", "movement_type").annotate(total=Sum("quantity")).order_by("day")
    flow_map = {}
    for m in movement_qs:
        d = m["day"].date()
        if d not in flow_map: flow_map[d] = {"in": 0, "out": 0}
        val = float(m["total"] or 0)
        if m["movement_type"] in ("in", "production", "adjustment"): flow_map[d]["in"] += val
        else: flow_map[d]["out"] += val
    stock_flow = []
    for i in range(6, -1, -1):
        d = today - datetime.timedelta(days=i)
        entry = flow_map.get(d, {"in": 0, "out": 0})
        stock_flow.append({"day": day_label_fa(d), "dayEn": day_label_en(d), "inbound": round(entry["in"], 1), "outbound": round(entry["out"], 1)})
    if show_demo and not any(d["inbound"] > 0 or d["outbound"] > 0 for d in stock_flow):
        for d_obj in stock_flow:
            d_obj["inbound"] = round(random.uniform(1, 10), 1); d_obj["outbound"] = round(random.uniform(1, 10), 1)

    waste_by_reason = WasteLog.objects.filter(restaurant=restaurant, created_at__gte=month_start_dt).values("reason").annotate(total=Sum("quantity")).order_by("-total")
    waste_pie = [{"name": WASTE_LABELS.get(w["reason"], w["reason"]), "nameEn": w["reason"].title(), "value": w["total"], "color": WASTE_COLORS.get(w["reason"], "#6b7280")} for w in waste_by_reason]
    if show_demo and not waste_pie:
        waste_pie = [{"name": "تاریخ گذشته", "nameEn": "Expired", "value": 2, "color": "#ef4444"}, {"name": "آسیب‌دیده", "nameEn": "Damaged", "value": 1, "color": "#f59e0b"}, {"name": "بیش‌پخت", "nameEn": "Overcooked", "value": 1, "color": "#8b5cf6"}]

    stock_alerts = []
    for si in low_stock_qs.select_related("raw_material", "warehouse")[:10]:
        level = "critical" if si.quantity <= 0 else "warning"
        msg = f"{si.raw_material.name}: موجودی ({float(si.quantity)}) زیر حداقل ({float(si.raw_material.minimum_stock)})"
        stock_alerts.append({"name": si.raw_material.name, "nameEn": si.raw_material.name, "message": msg, "messageEn": msg, "level": level, "current": float(si.quantity), "min": float(si.raw_material.minimum_stock)})

    top_used_qs = InventoryMovement.objects.filter(restaurant=restaurant, created_at__date__gte=week_start, movement_type="out").values("raw_material__name", "raw_material__unit").annotate(total=Sum("quantity")).order_by("-total")[:5]
    top_used = [{"name": t["raw_material__name"], "nameEn": t["raw_material__name"], "used": float(t["total"] or 0), "unit": t["raw_material__unit"] or ""} for t in top_used_qs]
    if show_demo and not top_used:
        for m in RawMaterial.objects.filter(restaurant=restaurant)[:5]:
            top_used.append({"name": m.name, "nameEn": m.name, "used": float(m.quantity), "unit": m.unit})

    slow_movers = []
    slow_qs = InventoryMovement.objects.filter(restaurant=restaurant, movement_type="out").values("raw_material__name", "raw_material__unit").annotate(total_qty=Sum("quantity"), last_use=Max("created_at")).order_by("last_use")[:5]
    for s in slow_qs:
        last = s["last_use"]
        slow_movers.append({"name": s["raw_material__name"], "nameEn": s["raw_material__name"], "lastUsed": last.strftime("%Y-%m-%d") if last else "—", "lastUsedEn": last.strftime("%Y-%m-%d") if last else "—", "quantity": float(s["total_qty"] or 0), "unit": s["raw_material__unit"] or ""})
    if show_demo and not slow_movers:
        for m in RawMaterial.objects.filter(restaurant=restaurant)[:5]:
            slow_movers.append({"name": m.name, "nameEn": m.name, "lastUsed": "۱۴۰۳/۰۱/۱۰", "lastUsedEn": "2024-01-10", "quantity": float(m.quantity), "unit": m.unit})

    expiring = []
    if show_demo:
        for m in RawMaterial.objects.filter(restaurant=restaurant)[:3]:
            expiring.append({"name": m.name, "nameEn": m.name, "quantity": float(m.quantity), "unit": m.unit, "expiry": "۱۴۰۳/۰۱/۱۵", "expiryEn": "2024-01-15", "severity": "warning"})

    return JsonResponse({
        "success": True, "posStats": pos_stats, "salesTrend": sales_trend, "hourly": hourly, "categories": categories,
        "topItems": top_items, "lowItems": low_items, "orderStatus": order_status, "weeklyCompare": weekly_compare, "monthlyTrend": monthly_trend,
        "invStats": inv_stats, "stockLevel": stock_level, "stockFlow": stock_flow, "wastePie": waste_pie, "stockAlerts": stock_alerts,
        "expiring": expiring, "topUsed": top_used, "slowMovers": slow_movers, "invWeekly": [],
    })