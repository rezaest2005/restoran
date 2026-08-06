"""
Card reader API (★ نسخه اصلاح‌شده v3)

★ تغییرات نسبت به نسخه قبل:
  ۱. @csrf_exempt + @require_POST → @api_view(["POST"])
  ۲. json.loads(request.body) → request.data
  ۳. @permission_classes([IsAuthenticated]) اضافه شد
  ۴. بهبود مدیریت خطاها
  ۵. timeout از settings خوانده می‌شود
  ۶. cancel_card_payment: بررسی پاسخ
"""

import logging

import requests as http_requests
from django.conf import settings

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)

# تنظیمات کارتخوان
CARD_READER_IP = getattr(settings, 'CARD_READER_IP', '127.0.0.1')
CARD_READER_PORT = getattr(settings, 'CARD_READER_PORT', 8080)
CARD_READER_URL = f"http://{CARD_READER_IP}:{CARD_READER_PORT}"
CARD_READER_TIMEOUT = getattr(settings, 'CARD_READER_TIMEOUT', 120)


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

    if not amount or int(amount) <= 0:
        return Response(
            {'success': False, 'error': 'مبلغ نامعتبر'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        resp = http_requests.post(
            f"{CARD_READER_URL}/api/payment",
            json={
                'amount': int(amount),
                'rrn': str(order_id or ''),
                'description': f'سفارش #{order_id}' if order_id else 'پرداخت',
            },
            timeout=CARD_READER_TIMEOUT,
        )
        result = resp.json()

        if result.get('status') == 'approved' or result.get('success'):
            card_num = result.get('card_number', '')
            return Response({
                'success': True,
                'trace_number': result.get('trace_number', ''),
                'ref_number': result.get('ref_number', ''),
                'card_last4': card_num[-4:] if card_num else '',
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
            {'success': False, 'error': f'کارتخوان ({CARD_READER_IP}:{CARD_READER_PORT}) در دسترس نیست'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    except Exception as e:
        logger.exception('Error communicating with card reader')
        return Response(
            {'success': False, 'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


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
            timeout=10,
        )
        result = resp.json()
        return Response({
            'success': result.get('success', True),
            'message': result.get('message', 'لغو ارسال شد'),
        })

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