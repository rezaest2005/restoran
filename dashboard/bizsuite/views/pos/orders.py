"""
POS — ثبت سفارش، بستن سفارشات معلق و ویرایش قیمت
"""
import logging
from decimal import InvalidOperation

from django.db import transaction
from django.db.models import F
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes

from ...models import Order, OrderItem, Food
from ...club_services import earn_for_order
from ...accounting_posting import post_pos_order, safe_post
from ..common import (
    PosPerm,
    no_business_response,
    resolve_business,
)
from ..common import server_error

logger = logging.getLogger(__name__)


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
                {"success": False, "error": "هیچ محصولی انتخاب نشده"}, status=400,
            )

        business = resolve_business(request)
        if not business:
            return no_business_response()

        validated_items = []
        stock_errors = []

        for item in items:
            qty = int(item.get("quantity", 1))
            if qty <= 0:
                continue

            food_id = item.get("food_id") or item.get("id")
            food_id = int(food_id) if food_id else 0
            food = Food.objects.filter(id=food_id, business=business).first() if food_id > 0 else None

            if not food:
                return JsonResponse(
                    {"success": False, "error": f"محصول با شناسه {food_id} پیدا نشد"},
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
                business=business,
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
                    business=business,
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

        if order.payment_status == "paid":
            try:
                earn_for_order(order)
            except Exception:
                logger.exception("club earn failed for order %s", order.pk)
            safe_post(post_pos_order, order, request.user if request.user.is_authenticated else None)

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
        return server_error(exc, status=200)


# ═══════════════════════════════════════
#  بستن سفارشات معلق
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([PosPerm])
def pos_close_all_pending(request):
    today = timezone.localdate()
    business = resolve_business(request)

    qs = Order.objects.filter(created_at__date=today).exclude(status="delivered")
    if business:
        qs = qs.filter(business=business)

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

        business = resolve_business(request)
        food_qs = Food.objects.all()
        if business:
            food_qs = food_qs.filter(business=business)
        food = food_qs.filter(id=food_id).first()

        if not food:
            return JsonResponse({"success": False, "error": "محصول پیدا نشد"}, status=404)

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
        return server_error(exc, status=200)
