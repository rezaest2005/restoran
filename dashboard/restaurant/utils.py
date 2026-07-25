"""
Restaurant — Utility Functions
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        response.data = {
            'success': False,
            'error': response.data.get('detail', str(response.data)) if isinstance(response.data, dict) else str(response.data),
            'status_code': response.status_code,
        }
    return response


def api_success(data=None, message='عملیات موفقیت‌آمیز بود.', status_code=status.HTTP_200_OK):
    return Response({'success': True, 'message': message, 'data': data}, status=status_code)


def api_error(message='خطایی رخ داده.', status_code=status.HTTP_400_BAD_REQUEST, errors=None):
    resp = {'success': False, 'error': message}
    if errors:
        resp['errors'] = errors
    return Response(resp, status=status_code)
