"""
Card reader API.
"""
import json
import requests
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

CARD_READER_URL = f"http://{getattr(settings, 'CARD_READER_IP', '127.0.0.1')}:{getattr(settings, 'CARD_READER_PORT', 8080)}"


@csrf_exempt
@require_POST
def send_to_card_reader(request):
    try:
        data = json.loads(request.body)
        amount = data.get('amount')
        order_id = data.get('order_id')
        if not amount or amount <= 0:
            return JsonResponse({'success': False, 'error': 'مبلغ نامعتبر'})
        resp = requests.post(
            f"{CARD_READER_URL}/api/payment",
            json={'amount': int(amount), 'rrn': str(order_id), 'description': f'سفارش #{order_id}'},
            timeout=120,
        )
        result = resp.json()
        if result.get('status') == 'approved' or result.get('success'):
            card_num = result.get('card_number', '')
            return JsonResponse({
                'success': True, 'trace_number': result.get('trace_number', ''),
                'ref_number': result.get('ref_number', ''),
                'card_last4': card_num[-4:] if card_num else '', 'message': 'پرداخت موفق',
            })
        else:
            return JsonResponse({'success': False, 'error': result.get('message', 'پرداخت ناموفق')})
    except requests.Timeout:
        return JsonResponse({'success': False, 'error': 'زمان انتظار تمام شد'})
    except requests.ConnectionError:
        return JsonResponse({'success': False, 'error': f'کارتخوان ({CARD_READER_URL}) در دسترس نیست'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
@require_POST
def cancel_card_payment(request):
    try:
        requests.post(f"{CARD_READER_URL}/api/payment/cancel", timeout=10)
        return JsonResponse({'success': True})
    except Exception:
        return JsonResponse({'success': False})