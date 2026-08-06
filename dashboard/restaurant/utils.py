"""
Restaurant — Utility Functions

★ تغییرات نسبت به نسخه قبل:
  ۱. custom_exception_handler: مدیریت بهتر انواع خطاها (list, dict, str)
  ۲. api_success / api_error: type hints اضافه شد
  ۳. اضافه شدن helper‌های پرکاربرد: paginate_response, get_int_param
  ۴. اضافه شدن __all__
"""

from typing import Any, Optional, Dict, List

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import PageNumberPagination

__all__ = [
    'custom_exception_handler',
    'api_success', 'api_error',
    'get_int_param', 'paginate_response',
]


# ═══════════════════════════════════════
#  Exception Handler
# ═══════════════════════════════════════

def custom_exception_handler(exc, context):
    """
    هندلر سفارشی خطاها — خروجی یکپارچه {success, error, status_code}
    """
    response = exception_handler(exc, context)
    if response is not None:
        # استخراج پیام خطا از فرمت‌های مختلف DRF
        data = response.data
        if isinstance(data, dict):
            error_msg = data.get('detail', data.get('message', str(data)))
        elif isinstance(data, list):
            error_msg = '; '.join(str(item) for item in data)
        else:
            error_msg = str(data)

        response.data = {
            'success': False,
            'error': error_msg,
            'status_code': response.status_code,
        }
    return response


# ═══════════════════════════════════════
#  API Response Helpers
# ═══════════════════════════════════════

def api_success(
    data: Any = None,
    message: str = 'عملیات موفقیت‌آمیز بود.',
    status_code: int = status.HTTP_200_OK,
) -> Response:
    """پاسخ موفقیت‌آمیز استاندارد"""
    return Response(
        {'success': True, 'message': message, 'data': data},
        status=status_code,
    )


def api_error(
    message: str = 'خطایی رخ داده.',
    status_code: int = status.HTTP_400_BAD_REQUEST,
    errors: Optional[Any] = None,
) -> Response:
    """پاسخ خطای استاندارد"""
    resp: Dict[str, Any] = {'success': False, 'error': message}
    if errors:
        resp['errors'] = errors
    return Response(resp, status=status_code)


# ═══════════════════════════════════════
#  Query Parameter Helpers
# ═══════════════════════════════════════

def get_int_param(request, key: str, default: int = 0) -> int:
    """خواندن پارامتر عددی از query string با مدیریت خطا"""
    val = request.query_params.get(key, request.GET.get(key))
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def paginate_response(
    queryset,
    serializer_class,
    request,
    context: Optional[Dict] = None,
) -> Response:
    """
    صفحه‌بندی سریع — یک خطی.

    Usage:
        return paginate_response(
            Food.objects.all(), FoodSerializer, request,
        )
    """
    paginator = PageNumberPagination()
    paginator.page_size = get_int_param(request, 'page_size', 20)
    page = paginator.paginate_queryset(queryset, request)
    ctx = context or {}
    ctx['request'] = request
    ser = serializer_class(page, many=True, context=ctx)
    return paginator.get_paginated_response(ser.data)