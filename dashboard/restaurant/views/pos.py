"""
POS — صندوق فروش API (★ نسخه v6 — cleanup)
"""

import datetime
import logging
from decimal import InvalidOperation

from django.db import transaction
from django.db.models import F
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from ..models import Order, OrderItem, Food
from ..tenancy import (
    get_current_restaurant,
    set_current_restaurant,
    get_restaurant_from_request,
)
from .decorators import make_service_permission

logger = logging.getLogger(__name__)

PosPerm = make_service_permission("pos")


def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    r = getattr(request.user, "restaurant", None)
    if r:
        set_current_restaurant(r)
        return r
    return None


# ═══════════════════════════════════════
#  ایجاد سفارش
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([PosPerm])
def pos_create_order(request):
    try:
        data = request.data
        customer_name = data.get("customer_name", "").strip()
        customer_name_en = data.get("customer_name_en", "").strip()
        phone = data.get("phone", "").strip()
        source = data.get("source", "pos")
        payment_method = data.get("payment_method", "cash")
        items = data.get("items", [])

        if not items:
            return JsonResponse(
                {"success": False, "error": "هیچ غذایی انتخاب نشده"}, status=400,
            )

        restaurant = _resolve_restaurant(request)
        if not restaurant:
            return JsonResponse(
                {"success": False, "error": "رستوران مشخص نشده"}, status=400,
            )

        validated_items = []
        stock_errors = []

        for item in items:
            qty = int(item.get("quantity", 1))
            if qty <= 0:
                continue

            food_id = item.get("food_id") or item.get("id")
            food_id = int(food_id) if food_id else 0
            food = Food.objects.filter(id=food_id, restaurant=restaurant).first() if food_id > 0 else None

            if not food:
                return JsonResponse(
                    {"success": False, "error": f"غذا با شناسه {food_id} پیدا نشد"},
                    status=400,
                )

            try:
                db_price = int(food.final_price)
            except (ValueError, TypeError, InvalidOperation):
                db_price = 0

            if db_price <= 0:
                try:
                    db_price = int(food.price)
                except (ValueError, TypeError, InvalidOperation):
                    db_price = 0

            if db_price <= 0:
                db_price = int(item.get("price", 0))

            # بررسی موجودی
            if food.stock is not None and qty > food.stock:
                stock_errors.append(f"{food.name}: سفارش {qty} ولی موجودی {food.stock}")
                continue

            validated_items.append({
                "obj": food,
                "qty": qty,
                "price": db_price,
            })

        if stock_errors:
            return JsonResponse({
                "success": False,
                "error": "موجودی کافی نیست: " + " | ".join(stock_errors),
            })

        if not validated_items:
            return JsonResponse(
                {"success": False, "error": "هیچ آیتم معتبری وجود ندارد"}, status=400,
            )

        with transaction.atomic():
            order = Order.objects.create(
                restaurant=restaurant,
                customer_name=customer_name or "مشتری",
                customer_name_en=customer_name_en or "",
                phone=phone,
                status="pending",
                source=source,
                payment_method=payment_method,
                payment_status="paid" if source == "pos" else "pending",
                total_price=0,
            )

            total = 0
            order_items = []

            for vi in validated_items:
                qty = vi["qty"]
                price = vi["price"]
                line_total = price * qty
                total += line_total
                food = vi["obj"]

                # کاهش اتمیک موجودی
                Food.objects.filter(
                    id=food.id, stock__gte=qty,
                ).update(stock=F("stock") - qty)

                OrderItem.objects.create(
                    restaurant=restaurant,
                    order=order,
                    food=food,
                    item_name=food.name,
                    item_name_en=food.name_en or "",
                    quantity=qty,
                    price=price,
                )
                order_items.append({
                    "name": food.name,
                    "name_en": food.name_en or "",
                    "quantity": qty,
                    "price": price,
                    "line_total": line_total,
                })

            order.recalculate_total()

        return JsonResponse({
            "success": True,
            "order_id": order.id,
            "customer_name": order.customer_name,
            "customer_name_en": order.customer_name_en,
            "total_price": int(order.total_price),
            "items": order_items,
            "created_at": order.created_at.strftime("%Y-%m-%d %H:%M"),
            "msg": f"سفارش #{order.id} ثبت شد",
        })

    except Exception as exc:
        logger.exception("Error creating POS order")
        return JsonResponse({"success": False, "error": str(exc)})


# ═══════════════════════════════════════
#  گزارش روزانه
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([PosPerm])
def pos_daily_report(request):
    try:
        restaurant = _resolve_restaurant(request)
        date_str = request.GET.get("date", "")
        if date_str:
            target_date = datetime.date.fromisoformat(date_str)
        else:
            target_date = timezone.localdate()

        orders = Order.objects.filter(created_at__date=target_date)
        if restaurant:
            orders = orders.filter(restaurant=restaurant)

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
        return JsonResponse({"success": False, "error": str(exc)})


# ═══════════════════════════════════════
#  سفارشات امروز
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([PosPerm])
def pos_daily_orders(request):
    restaurant = _resolve_restaurant(request)
    date_str = request.GET.get("date")
    if date_str:
        try:
            today = datetime.date.fromisoformat(date_str)
        except ValueError:
            today = timezone.localdate()
    else:
        today = timezone.localdate()

    qs = Order.objects.prefetch_related("items__food").filter(created_at__date=today)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

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


# ═══════════════════════════════════════
#  بستن سفارشات معلق
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([PosPerm])
def pos_close_all_pending(request):
    today = timezone.localdate()
    restaurant = _resolve_restaurant(request)

    qs = Order.objects.filter(created_at__date=today).exclude(status="delivered")
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    count = qs.count()
    qs.update(status="delivered")
    return JsonResponse({"success": True, "msg": f"{count} سفارش تحویل شد"})


# ═══════════════════════════════════════
#  ویرایش قیمت غذا
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([PosPerm])
def pos_update_food_price(request):
    try:
        data = request.data
        food_id = data.get("food_id")
        price = data.get("price")
        final_price = data.get("final_price")

        if not food_id:
            return JsonResponse(
                {"success": False, "error": "food_id الزامی است"}, status=400,
            )

        restaurant = _resolve_restaurant(request)
        food_qs = Food.objects.all()
        if restaurant:
            food_qs = food_qs.filter(restaurant=restaurant)
        food = food_qs.filter(id=food_id).first()

        if not food:
            return JsonResponse({"success": False, "error": "غذا پیدا نشد"}, status=404)

        if price is not None:
            food.price = max(0, int(price))
        if final_price is not None:
            food.final_price = max(0, int(final_price))
        elif price is not None:
            food.final_price = food.price

        food.save(update_fields=["price", "final_price"])

        return JsonResponse({
            "success": True,
            "food_id": food.id,
            "name": food.name,
            "price": int(food.price),
            "final_price": int(food.final_price),
            "msg": f"قیمت {food.name} بروزرسانی شد",
        })
    except Exception as exc:
        logger.exception("Error updating food price")
        return JsonResponse({"success": False, "error": str(exc)})


# ═══════════════════════════════════════
#  منوی عمومی
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([AllowAny])
def public_menu_api(request):
    restaurant = _resolve_restaurant(request)

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
    restaurant = _resolve_restaurant(request)

    qs = Order.objects.filter(source="online").prefetch_related("items__food")
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
    restaurant = _resolve_restaurant(request)

    try:
        qs = Order.objects.filter(source="online")
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

    order.status = "cancelled"
    order.confirmed_by = request.user
    order.confirmed_at = timezone.now()
    order.save(update_fields=["status", "confirmed_by", "confirmed_at"])

    return JsonResponse({
        "success": True,
        "msg": f"سفارش #{order.id} رد شد",
        "order_id": order.id,
    })