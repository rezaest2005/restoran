"""
سوپر ادمین — توکن، لاگین و صفحات
"""
import logging
from functools import wraps

from django.contrib.auth import (
    authenticate, login as auth_login, logout as auth_logout,
)
from django.core import signing
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.conf import settings

from rest_framework.permissions import BasePermission

from ...models import User
from ..common import json_body

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════
#  تنظیمات امنیتی
# ═══════════════════════════════════════════

SUPER_TOKEN_SALT = 'super-admin-panel-v1'


SUPER_TOKEN_COOKIE = 'super_admin_token'


SUPER_TOKEN_MAX_AGE = 3600 * 5


# ═══════════════════════════════════════════
#  توابع کمکی احراز هویت
# ═══════════════════════════════════════════

def _verify_super_token(request):
    token = request.COOKIES.get(SUPER_TOKEN_COOKIE)
    if not token:
        return None
    try:
        data = signing.loads(
            token, salt=SUPER_TOKEN_SALT, max_age=SUPER_TOKEN_MAX_AGE,
        )
        return User.objects.get(
            id=data['uid'], is_superuser=True, is_active=True,
        )
    except Exception:
        return None


def _is_super_admin(request):
    user = _verify_super_token(request)
    if user:
        if not request.user.is_authenticated:
            auth_login(request, user)
        return True
    return False


def _super_admin_required(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not _is_super_admin(request):
            return redirect('/dashboard/super/auth/?next=/dashboard/super/')
        return view_func(request, *args, **kwargs)
    return wrapper


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        django_request = (
            request._request if hasattr(request, '_request') else request
        )
        user = _verify_super_token(django_request)
        if user:
            request.user = user
            return True

        auth_header = django_request.META.get('HTTP_AUTHORIZATION', '')
        if auth_header.startswith('Token '):
            token = auth_header[6:]
            try:
                data = signing.loads(token, salt=SUPER_TOKEN_SALT, max_age=SUPER_TOKEN_MAX_AGE)
                user = User.objects.get(id=data['uid'], is_superuser=True, is_active=True)
                request.user = user
                return True
            except Exception:
                pass
        return False


def _make_super_token(user):
    return signing.dumps({'uid': user.id}, salt=SUPER_TOKEN_SALT)


def _set_super_cookie(response, token):
    response.set_cookie(
        SUPER_TOKEN_COOKIE, token,
        httponly=True, samesite='Lax',
        secure=not settings.DEBUG, path='/',
    )
    return response


# ═══════════════════════════════════════════
#  صفحات HTML
# ═══════════════════════════════════════════

def super_admin_auth_page(request):
    if _is_super_admin(request):
        return redirect('/dashboard/super/')
    return render(request, 'super_auth.html')


@_super_admin_required
def super_admin_page(request):
    return render(request, 'restaurant/super_admin.html')


# ═══════════════════════════════════════════
#  API: ورود / خروج مدیر کل
# ═══════════════════════════════════════════

@csrf_exempt
@require_POST
def super_admin_login_api(request):
    data = json_body(request)
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    if not username or not password:
        return JsonResponse({'error': 'نام کاربری و رمز عبور الزامی است'}, status=400)

    user = authenticate(
        request, username=username, password=password,
        backend='django.contrib.auth.backends.ModelBackend',
    )

    if user is None:
        return JsonResponse({'error': 'نام کاربری یا رمز عبور اشتباه است'}, status=401)

    if not user.is_superuser:
        return JsonResponse({'error': 'شما مجوز دسترسی به این بخش را ندارید'}, status=403)

    auth_login(request, user)
    token = _make_super_token(user)
    response = JsonResponse({
        'ok': True, 'token': token,
        'user': {
            'id': user.id,
            'username': user.username,
            'first_name': user.first_name or '',
            'is_superuser': True,
        },
    })
    _set_super_cookie(response, token)
    return response


@require_POST
def super_admin_logout_api(request):
    auth_logout(request)
    response = JsonResponse({'ok': True})
    response.delete_cookie(SUPER_TOKEN_COOKIE, path='/')
    return response
