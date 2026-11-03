"""
POS — منوی عمومی و سفارشات آنلاین
"""
import logging
from decimal import InvalidOperation

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from ...models import Order, Food, Restaurant
from ...tenancy import set_current_restaurant
from ...order_services import restore_order_stock
from ..common import PosPerm, resolve_restaurant

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  منوی عمومی
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([AllowAny])
def public_menu_api(request):
    restaurant = None
    slug = (request.GET.get("restaurant_slug") or "").strip()
    if slug:
        restaurant = Restaurant.objects.filter(slug=slug, is_active=True).first()
        if not restaurant:
            return JsonResponse({"count": 0, "total": 0, "results": []}, status=404)
        set_current_restaurant(restaurant)  # TenantManager برای Food.objects
    if restaurant is None:
        restaurant = resolve_restaurant(request)

    qs = Food.objects.select_related("category").filter(is_available=True)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    cat = request.GET.get("category")
    if cat:
        qs = qs.filter(category_id=cat)

    search = request.GET.get("search")
    if search:
        qs = qs.filter(name__icontains=search)

    foods = qs.order_by("category__order", "category__name", "name")

    try:
        page_size = min(200, max(1, int(request.GET.get("page_size", 100))))
    except (TypeError, ValueError):
        page_size = 100
    try:
        page = max(1, int(request.GET.get("page", 1)))
    except (TypeError, ValueError):
        page = 1

    start_idx = (page - 1) * page_size
    total = foods.count()
    items = foods[start_idx : start_idx + page_size]

    data = []
    for food in items:
        try:
            raw_price = int(food.price or 0)
        except (ValueError, TypeError, InvalidOperation):
            raw_price = 0
        try:
            raw_final = int(food.final_price or 0)
        except (ValueError, TypeError, InvalidOperation):
            raw_final = 0

        price = max(raw_price, raw_final) if (raw_price or raw_final) else 0
        final = raw_final if raw_final > 0 else raw_price

        discount_info = None
        if final < price and price > 0:
            diff = price - final
            pct = round(diff / price * 100)
            discount_info = {"type": "percentage", "value": pct, "label": f"{pct}% تخفیف"}

        image_url = None
        if getattr(food, "image", None) and food.image:
            image_url = food.image.url

        data.append({
            "id": food.id,
            "name": food.name,
            "name_en": food.name_en or "",
            "category_id": food.category_id,
            "category_name": food.category.name if food.category else "",
            "price": price,
            "final_price": final,
            "image": image_url,
            "discount": discount_info,
            "is_available": food.is_available,
        })

    return JsonResponse({
        "count": len(data),
        "total": total,
        "results": data,
    })


# ═══════════════════════════════════════
#  سفارش آنلاین — لیست
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([PosPerm])
def pos_online_orders(request):
    status_filter = request.GET.get("status", "pending")
    since_id = request.GET.get("since")
    restaurant = resolve_restaurant(request)

    qs = Order.objects.filter(source__in=["online", "qr"]).prefetch_related("items__food")
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    if status_filter != "all":
        qs = qs.filter(status=status_filter)
    if since_id:
        qs = qs.filter(id__gt=int(since_id))

    data = []
    for o in qs.order_by("-created_at")[:50]:
        items = [
            {
                "id": oi.id,
                "food_name": oi.food.name if oi.food else (oi.item_name or "—"),
                "name_en": (
                    oi.food.name_en
                    if oi.food and oi.food.name_en
                    else (oi.item_name_en or "")
                ),
                "quantity": oi.quantity,
                "price": int(oi.price or 0),
            }
            for oi in o.items.all()
        ]
        data.append({
            "id": o.id,
            "customer_name": o.customer_name,
            "customer_name_en": o.customer_name_en or "",
            "phone": o.phone,
            "source": o.source,
            "table_number": o.table_number,
            "customer_note": o.customer_note,
            "status": o.status,
            "status_display": o.get_status_display(),
            "payment_status": o.payment_status,
            "payment_method": o.payment_method,
            "total_price": int(o.total_price),
            "items": items,
            "created_at": o.created_at.strftime("%Y-%m-%d %H:%M"),
            "created_at_ts": int(o.created_at.timestamp()),
        })

    return JsonResponse({"success": True, "orders": data})


# ═══════════════════════════════════════
#  سفارش آنلاین — رد
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([PosPerm])
def pos_reject_online_order(request, order_id):
    restaurant = resolve_restaurant(request)

    try:
        qs = Order.objects.filter(source__in=["online", "qr"])
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        order = qs.get(id=order_id)
    except Order.DoesNotExist:
        return JsonResponse({"success": False, "error": "سفارش پیدا نشد"}, status=404)

    if order.status != "pending":
        return JsonResponse({
            "success": False,
            "error": f"سفارش قبلاً {order.get_status_display()} شده",
        }, status=400)

    with transaction.atomic():
        order.status = "cancelled"
        order.confirmed_by = request.user
        order.confirmed_at = timezone.now()
        order.save(update_fields=["status", "confirmed_by", "confirmed_at"])
        restore_order_stock(order)

    return JsonResponse({
        "success": True,
        "msg": f"سفارش #{order.id} رد شد",
        "order_id": order.id,
    })
