"""
Dashboard — بخش انبار (Inventory)
"""
import datetime

from django.db.models import Sum, F, Max
from django.db.models.functions import TruncDay

from ...models import RawMaterial, StockItem, InventoryMovement
from .constants import WASTE_COLORS, WASTE_LABELS, day_label_fa, day_label_en


def build_inventory_section(restaurant, w):
    """آمار و نمودارهای انبار."""
    today = w.today
    week_start = w.week_start
    prev_week_start = w.prev_week_start
    month_start_dt = w.month_start_dt

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


    return {
        "invStats": inv_stats,
        "stockLevel": stock_level,
        "stockFlow": stock_flow,
        "wastePie": waste_pie,
        "stockAlerts": stock_alerts,
        "expiring": expiring_items,
        "topUsed": top_used,
        "slowMovers": slow_movers,
        "invWeekly": inv_weekly,
    }
