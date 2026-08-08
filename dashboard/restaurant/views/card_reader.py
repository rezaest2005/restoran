"""
Card reader API (★ نسخه v4 — اصلاح شده)

★ v4 تغییرات:
  - send_to_card_reader: فیلتر restaurant + ذخیره اطلاعات پرداخت
  - cancel_card_payment: timeout از settings
"""

import logging

import requests as http_requests
from django.conf import settings

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from ..models import Order
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  تنظیمات کارتخوان
# ═══════════════════════════════════════

CARD_READER_IP = getattr(settings, 'CARD_READER_IP', '127.0.0.1')
CARD_READER_PORT = getattr(settings, 'CARD_READER_PORT', 8080)
CARD_READER_URL = f"http://{CARD_READER_IP}:{CARD_READER_PORT}"
CARD_READER_TIMEOUT = getattr(settings, 'CARD_READER_TIMEOUT', 120)


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
#  پرداخت
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_to_card_reader(request):
    """
    ارسال درخواست پرداخت به کارتخوان.
    POST /api/card-reader/pay/
    body: {"amount": 250000, "order_id": 123}
    """
    data = request.data
    amount = data.get('amount')
    order_id = data.get('order_id')

    if not amount:
        return Response(
            {'success': False, 'error': 'مبلغ الزامی است'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        amount = int(amount)
    except (TypeError, ValueError):
        return Response(
            {'success': False, 'error': 'مبلغ نامعتبر'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if amount <= 0:
        return Response(
            {'success': False, 'error': 'مبلغ باید بیشتر از صفر باشد'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ★ FIXED: فیلتر restaurant روی Order
    restaurant = _resolve_restaurant(request)
    order = None
    if order_id:
        qs = Order.objects.all()
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        order = qs.filter(pk=order_id).first()

        if not order:
            return Response(
                {'success': False, 'error': f'سفارش #{order_id} یافت نشد'},
                status=status.HTTP_404_NOT_FOUND,
            )

    try:
        resp = http_requests.post(
            f"{CARD_READER_URL}/api/payment",
            json={
                'amount': amount,
                'rrn': str(order_id or ''),
                'description': (
                    f'سفارش #{order_id}' if order_id else 'پرداخت'
                ),
            },
            timeout=CARD_READER_TIMEOUT,
        )
        result = resp.json()

        if result.get('status') == 'approved' or result.get('success'):
            card_num = result.get('card_number', '')
            trace = result.get('trace_number', '')
            ref = result.get('ref_number', '')
            card_last4 = card_num[-4:] if card_num else ''

            # ★ FIXED: ذخیره اطلاعات پرداخت روی Order
            if order:
                update_fields = []
                if hasattr(order, 'trace_number'):
                    order.trace_number = trace
                    update_fields.append('trace_number')
                if hasattr(order, 'ref_number'):
                    order.ref_number = ref
                    update_fields.append('ref_number')
                if hasattr(order, 'card_last4'):
                    order.card_last4 = card_last4
                    update_fields.append('card_last4')
                if hasattr(order, 'payment_status'):
                    order.payment_status = 'paid'
                    update_fields.append('payment_status')
                if update_fields:
                    order.save(update_fields=update_fields)

            return Response({
                'success': True,
                'trace_number': trace,
                'ref_number': ref,
                'card_last4': card_last4,
                'message': 'پرداخت موفق',
            })
        else:
            return Response({
                'success': False,
                'error': result.get('message', 'پرداخت ناموفق'),
            }, status=status.HTTP_400_BAD_REQUEST)

    except http_requests.Timeout:
        logger.warning('Card reader timeout: %s', CARD_READER_URL)
        return Response(
            {'success': False, 'error': 'زمان انتظار کارتخوان تمام شد'},
            status=status.HTTP_504_GATEWAY_TIMEOUT,
        )

    except http_requests.ConnectionError:
        logger.error('Card reader unreachable: %s', CARD_READER_URL)
        return Response(
            {
                'success': False,
                'error': (
                    f'کارتخوان ({CARD_READER_IP}:{CARD_READER_PORT}) '
                    f'در دسترس نیست'
                ),
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    except Exception as e:
        logger.exception('Error communicating with card reader')
        return Response(
            {'success': False, 'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ═══════════════════════════════════════
#  لغو پرداخت
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_card_payment(request):
    """
    لغو پرداخت کارتخوان.
    POST /api/card-reader/cancel/
    """
    try:
        resp = http_requests.post(
            f"{CARD_READER_URL}/api/payment/cancel",
            timeout=CARD_READER_TIMEOUT,  # ★ FIXED: از settings
        )
        result = resp.json()
        return Response({
            'success': result.get('success', True),
            'message': result.get('message', 'لغو ارسال شد'),
        })

    except http_requests.Timeout:
        logger.warning('Card reader timeout on cancel')
        return Response(
            {'success': False, 'error': 'زمان انتظار تمام شد'},
            status=status.HTTP_504_GATEWAY_TIMEOUT,
        )

    except http_requests.ConnectionError:
        return Response(
            {'success': False, 'error': 'کارتخوان در دسترس نیست'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    except Exception as e:
        logger.warning('Error cancelling card payment: %s', e)
        return Response(
            {'success': False, 'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )