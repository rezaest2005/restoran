"""
Loyalty program API (★ نسخه اصلاح‌شده v3)

★ تغییرات نسبت به نسخه قبل:
  ۱. اضافه شدن @permission_classes — تمام view‌ها نیاز به لاگین دارند
  ۲. process_order_loyalty_view: order_id → Order instance + restaurant
  ۳. loyalty_dashboard_view: restaurant پارامتر اضافه شد
  ۴. birthday_check_view: restaurant پارامتر اضافه شد
  ۵. seed_levels_view: restaurant پارامتر اضافه شد
  ۶. اضافه شدن _resolve_restaurant (مشترک)
  ۷. مدیریت خطاها و validation بهتر
"""

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
from ..tenancy import get_current_restaurant, set_current_restaurant, get_restaurant_from_request


# ═══════════════════════════════════════
#  resolve restaurant — fallback
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
@permission_classes([IsAuthenticated])
def process_order_loyalty_view(request):
    """
    پردازش کامل باشگاه مشتریان برای یک سفارش
    POST /api/loyalty/process-order/

    body: {
        "phone": "0912...",
        "order_id": 123,
        "order_amount": 250000,
        "coupon_code": "OFF20",       ← اختیاری
        "use_wallet": 50000,           ← اختیاری
        "redeem_points": 500           ← اختیاری
    }
    """
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return Response(
            {"success": False, "error": "رستوران مشخص نشده."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ser = ProcessOrderLoyaltySerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data

    # ★ FIXED: تبدیل order_id (int) به Order instance
    order_id = data.pop('order_id')
    order = Order.objects.filter(pk=order_id).first()
    if not order:
        return Response(
            {"success": False, "error": f"سفارش #{order_id} یافت نشد."},
            status=status.HTTP_404_NOT_FOUND,
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
        return Response(
            {"success": False, "error": f"خطا در پردازش: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ═══════════════════════════════════════
#  داشبورد باشگاه
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def loyalty_dashboard_view(request):
    """داشبورد آمار باشگاه مشتریان"""
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
        return Response(
            {"success": False, "error": f"خطا: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ═══════════════════════════════════════
#  بررسی تولد
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def birthday_check_view(request):
    """اعطای هدیه تولد به مشتریانی که امروز تولدشان است"""
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
        return Response(
            {"success": False, "error": f"خطا: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ═══════════════════════════════════════
#  ساخت سطوح عضویت پیش‌فرض
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def seed_levels_view(request):
    """ساخت/بروزرسانی ۴ سطح عضویت پیش‌فرض برای رستوران"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return Response(
            {"success": False, "error": "رستوران مشخص نشده."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        message = seed_membership_levels(restaurant=restaurant)
        return Response({
            "success": True,
            "message": message,
        })
    except Exception as e:
        return Response(
            {"success": False, "error": f"خطا: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )