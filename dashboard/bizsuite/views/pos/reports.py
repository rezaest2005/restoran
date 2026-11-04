"""
POS — گزارش روزانه و سفارشات امروز
"""
import datetime
import logging

from django.db.models import F
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes

from ...models import Order, OrderItem
from ..common import PosPerm, resolve_business
from ..common import server_error

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  گزارش روزانه
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([PosPerm])
def pos_daily_report(request):
    try:
        business = resolve_business(request)
        date_str = request.GET.get("date", "")
        if date_str:
            target_date = datetime.date.fromisoformat(date_str)
        else:
            target_date = timezone.localdate()

        orders = Order.objects.filter(created_at__date=target_date)
        if business:
            orders = orders.filter(business=business)

        order_count = orders.count()
        total_sales = sum(o.total_price for o in orders)

        top_items = (
            OrderItem.objects.filter(order__in=orders, food__isnull=False)
            .values("food__name", "food__name_en")
            .annotate(qty_total=F("quantity"))
            .order_by("-qty_total")[:10]
        )
        top_list = [
            {
                "name": t["food__name"],
                "name_en": t["food__name_en"] or "",
                "qty": t["qty_total"],
            }
            for t in top_items
        ]

        orders_list = [
            {
                "id": o.id,
                "customer": o.customer_name,
                "customer_en": o.customer_name_en or "",
                "items_count": o.items.count(),
                "total": int(o.total_price),
                "status": o.status,
                "status_display": o.get_status_display(),
                "source": o.source,
                "time": o.created_at.strftime("%H:%M"),
            }
            for o in orders.order_by("-created_at")
        ]

        return JsonResponse({
            "success": True,
            "total_sales": int(total_sales),
            "order_count": order_count,
            "top_items": top_list,
            "orders": orders_list,
        })
    except Exception as exc:
        logger.exception("Error in daily report")
        return server_error(exc, status=200)


# ═══════════════════════════════════════
#  سفارشات امروز
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([PosPerm])
def pos_daily_orders(request):
    business = resolve_business(request)
    date_str = request.GET.get("date")
    if date_str:
        try:
            today = datetime.date.fromisoformat(date_str)
        except ValueError:
            today = timezone.localdate()
    else:
        today = timezone.localdate()

    qs = Order.objects.prefetch_related("items__food").filter(created_at__date=today)
    if business:
        qs = qs.filter(business=business)

    data = []
    for order in qs.order_by("-created_at"):
        items = [
            {
                "name": item.food.name if item.food else (item.item_name or "—"),
                "name_en": (
                    item.food.name_en
                    if item.food and item.food.name_en
                    else (item.item_name_en or "")
                ),
                "quantity": item.quantity,
                "price": int(item.price or 0),
                "line_total": int(item.price or 0) * item.quantity,
            }
            for item in order.items.all()
        ]
        data.append({
            "id": order.id,
            "customer_name": order.customer_name or "",
            "customer_name_en": order.customer_name_en or "",
            "phone": order.phone or "",
            "total_price": int(order.total_price),
            "items": items,
            "status": order.status,
            "created_at": order.created_at.strftime("%Y-%m-%d %H:%M"),
            "payment_method": order.payment_method or "cash",
            "source": order.source or "pos",
        })

    return JsonResponse({
        "success": True,
        "date": str(today),
        "count": len(data),
        "orders": data,
    })
