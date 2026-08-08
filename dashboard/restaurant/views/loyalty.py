"""
Loyalty program API (★ نسخه v5 — اصلاح شده)

★ v5 تغییرات:
  - process_order_loyalty_view: فیلتر restaurant روی Order
  - process_order_loyalty_view: بررسی وضعیت سفارش
"""

import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from ..models import Order
from ..serializers import (
    ProcessOrderLoyaltySerializer, LoyaltyDashboardSerializer,
)
from ..services import (
    process_order_loyalty, get_loyalty_dashboard,
    run_birthday_check_all, seed_membership_levels,
)
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)
from .decorators import make_service_permission

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  Permission
# ═══════════════════════════════════════

LoyaltyPerm = make_service_permission('loyalty')


# ═══════════════════════════════════════
#  resolve restaurant
# ═══════════════════════════════════════

def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    return None


# ═══════════════════════════════════════
#  پردازش کامل باشگاه برای سفارش
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([LoyaltyPerm])
def process_order_loyalty_view(request):
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return Response(
            {"success": False, "error": "رستوران مشخص نشده."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ser = ProcessOrderLoyaltySerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data

    order_id = data.pop('order_id')

    # ★ FIXED: فیلتر restaurant روی Order
    order = Order.objects.filter(
        pk=order_id,
        restaurant=restaurant,
    ).first()

    if not order:
        return Response(
            {"success": False, "error": f"سفارش #{order_id} یافت نشد."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # ★ FIXED: بررسی وضعیت سفارش
    if order.status == 'cancelled':
        return Response(
            {"success": False, "error": "سفارش لغو شده قابل پردازش نیست."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = process_order_loyalty(
            restaurant=restaurant,
            phone=data['phone'],
            order=order,
            order_amount=data['order_amount'],
            coupon_code=data.get('coupon_code', ''),
            use_wallet=data.get('use_wallet', 0),
            redeem_points_count=data.get('redeem_points', 0),
        )
        return Response(result)

    except Exception as e:
        logger.exception("Error processing loyalty for order #%s", order_id)
        return Response(
            {"success": False, "error": f"خطا در پردازش: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ═══════════════════════════════════════
#  داشبورد باشگاه
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([LoyaltyPerm])
def loyalty_dashboard_view(request):
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return Response(
            {"success": False, "error": "رستوران مشخص نشده."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        data = get_loyalty_dashboard(restaurant=restaurant)
        return Response(LoyaltyDashboardSerializer(data).data)
    except Exception as e:
        logger.exception("Error loading loyalty dashboard")
        return Response(
            {"success": False, "error": f"خطا: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ═══════════════════════════════════════
#  بررسی تولد
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([LoyaltyPerm])
def birthday_check_view(request):
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return Response(
            {"success": False, "error": "رستوران مشخص نشده."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        count = run_birthday_check_all(restaurant=restaurant)
        return Response({
            "success": True,
            "birthday_granted": count,
            "msg": f"{count} هدیه تولد اعطا شد.",
        })
    except Exception as e:
        logger.exception("Error running birthday check")
        return Response(
            {"success": False, "error": f"خطا: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ═══════════════════════════════════════
#  ساخت سطوح عضویت پیش‌فرض
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([LoyaltyPerm])
def seed_levels_view(request):
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return Response(
            {"success": False, "error": "رستوران مشخص نشده."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        message = seed_membership_levels(restaurant=restaurant)
        return Response({"success": True, "message": message})
    except Exception as e:
        logger.exception("Error seeding membership levels")
        return Response(
            {"success": False, "error": f"خطا: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )