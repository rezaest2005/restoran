"""
دکوراتورهای محافظت ویوها بر اساس دسترسی سرویس‌ها

★ نسخه v2 — اصلاح شده
  - require_service()       → ویوهای تابعی (HTML pages)
  - make_service_permission → ویوهای کلاسی (DRF API views)
"""

from functools import wraps
from django.http import JsonResponse
from django.shortcuts import redirect
from rest_framework.permissions import BasePermission

LOGIN_URL = '/dashboard/'


# ═══════════════════════════════════════════
#  بررسی دسترسی کاربر
# ═══════════════════════════════════════════

def _user_has_any_service(user, service_codes):
    """★ جدید: بررسی دسترسی — مشترک بین decorator و permission"""
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    user_perms = user.get_permissions() if hasattr(user, 'get_permissions') else []
    return any(code in user_perms for code in service_codes)


# ═══════════════════════════════════════════
#  برای ویوهای تابعی (HTML pages)
# ═══════════════════════════════════════════

def require_service(*service_codes):
    """
    دکوراتور محافظت ویوهای تابعی.

    استفاده:
        @require_service('users')
        def user_management_page(request): ...

        @require_service('pos', 'kitchen')
        def some_page(request): ...
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
                return redirect(LOGIN_URL)

            if _user_has_any_service(user, service_codes):
                return view_func(request, *args, **kwargs)

            # ★ دسترسی ندارد
            if _is_api(request):
                return JsonResponse({
                    'error': 'شما دسترسی به این بخش را ندارید',
                    'required': list(service_codes),
                }, status=403)
            return redirect('/dashboard/app/')

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

        # یا چند سرویس:
        KitchenOrPosPerm = make_service_permission('kitchen', 'pos')
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


# ═══════════════════════════════════════════
#  تشخیص API request
# ═══════════════════════════════════════════

def _is_api(request):
    """
    تشخیص اینکه درخواست API هست یا نه.
    ★ FIXED: Content-Type و Accept header هم چک میشه
    """
    if request.path.startswith('/api/'):
        return True
    accept = request.META.get('HTTP_ACCEPT', '')
    if 'application/json' in accept:
        return True
    content_type = request.META.get('CONTENT_TYPE', '')
    if 'application/json' in content_type:
        return True
    return False