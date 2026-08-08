"""
دکوراتورهای محافظت ویوها بر اساس دسترسی سرویس‌ها

★ نسخه v5 — tenant-aware redirects
  - LOGIN_URL حالا داینامیکه با SCRIPT_NAME
  - redirect ها شامل پیشوند tenant هستن
"""

from functools import wraps
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse
from rest_framework.permissions import BasePermission


# ═══════════════════════════════════════════
#  ساخت URL با پیشوند tenant
# ═══════════════════════════════════════════

def _tenant_url(request, url_name=None, path=None):
    """
    URL بساز با پیشوند tenant.

    _tenant_url(request, 'auth_page')       → /reza/dashboard/
    _tenant_url(request, path='/dashboard/') → /reza/dashboard/
    """
    script_name = request.META.get('SCRIPT_NAME', '')

    if url_name:
        url = reverse(url_name)
    elif path:
        url = path
    else:
        url = '/'

    # اگه پیشوند tenant داری ولی URL هنوز نداره
    if script_name and not url.startswith(script_name):
        url = script_name + url

    return url


# ═══════════════════════════════════════════
#  بررسی دسترسی کاربر
# ═══════════════════════════════════════════

def _user_has_any_service(user, service_codes):
    """بررسی دسترسی — مشترک بین decorator و permission"""
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    user_perms = user.get_permissions() if hasattr(user, 'get_permissions') else []
    return any(code in user_perms for code in service_codes)


# ═══════════════════════════════════════════
#  تشخیص API request
# ═══════════════════════════════════════════

def _is_api(request):
    if request.path.startswith('/api/'):
        return True
    accept = request.META.get('HTTP_ACCEPT', '')
    if 'application/json' in accept:
        return True
    content_type = request.META.get('CONTENT_TYPE', '')
    if 'application/json' in content_type:
        return True
    return False


# ═══════════════════════════════════════════
#  برای ویوهای تابعی (HTML pages)
# ═══════════════════════════════════════════

def require_service(*service_codes):
    """
    دکوراتور محافظت ویوهای تابعی.

    استفاده:
        @require_service('users')
        def user_management_page(request): ...
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            user = request.user

            if not user.is_authenticated:
                if _is_api(request):
                    return JsonResponse(
                        {'error': 'لاگین نیستید'},
                        status=401,
                    )
                # ★ tenant-aware redirect به صفحه رمز
                return redirect(_tenant_url(request, 'auth_page'))

            if _user_has_any_service(user, service_codes):
                return view_func(request, *args, **kwargs)

            if _is_api(request):
                return JsonResponse({
                    'error': 'شما دسترسی به این بخش را ندارید',
                    'required': list(service_codes),
                }, status=403)
            # ★ tenant-aware redirect به داشبورد
            return redirect(_tenant_url(request, 'dashboard_app'))

        return wrapper
    return decorator


# ═══════════════════════════════════════════
#  برای ویوهای کلاسی (DRF Class-Based)
# ═══════════════════════════════════════════

def make_service_permission(*service_codes):
    """
    ساخت Permission کلاس برای DRF.

    استفاده:
        KitchenPerm = make_service_permission('kitchen')

        class MyView(generics.ListAPIView):
            permission_classes = [KitchenPerm]
    """
    class _ServicePermission(BasePermission):
        message = 'شما دسترسی به این بخش را ندارید'

        def has_permission(self, request, view):
            return _user_has_any_service(request.user, service_codes)

        def has_object_permission(self, request, view, obj):
            return _user_has_any_service(request.user, service_codes)

    _ServicePermission.__name__ = f'HasAny_{"_".join(service_codes)}'
    _ServicePermission.__qualname__ = _ServicePermission.__name__
    return _ServicePermission