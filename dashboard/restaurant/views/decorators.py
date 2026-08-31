"""
دکوراتورهای محافظت ویوها بر اساس دسترسی سرویس‌ها

★ نسخه v7 — چک سرویس فعال رستوران + دسترسی کاربر
"""

from functools import wraps
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse
from rest_framework.permissions import BasePermission


# ═══════════════════════════════════════════
#  نقشه گروه‌های permission
# ═══════════════════════════════════════════

PERMISSION_GROUPS = {
    'inventory': ['inventory', 'raw_materials', 'ready_materials',
                  'invoices', 'usage_log', 'semi_finished'],
    'foods':     ['foods', 'recipes'],
}


def _expand_codes(service_codes):
    """کدهای گروهی رو به کدهای واقعی تبدیل کن"""
    expanded = []
    for code in service_codes:
        if code in PERMISSION_GROUPS:
            expanded.extend(PERMISSION_GROUPS[code])
        else:
            expanded.append(code)
    return expanded


# ═══════════════════════════════════════════
#  ساخت URL با پیشوند tenant
# ═══════════════════════════════════════════

def _tenant_url(request, url_name=None, path=None):
    script_name = request.META.get('SCRIPT_NAME', '')

    if url_name:
        url = reverse(url_name)
    elif path:
        url = path
    else:
        url = '/'

    if script_name and not url.startswith(script_name):
        url = script_name + url

    return url


# ═══════════════════════════════════════════
#  ★ گرفتن سرویس‌های فعال رستوران
# ═══════════════════════════════════════════

def _get_enabled_services(request):
    """سرویس‌های فعال این tenant رو برمیگردونه"""
    tenant_slug = getattr(request, '_tenant_slug', None)
    if not tenant_slug:
        return []

    from django.core.cache import cache
    cache_key = f'tenant_enabled_services_{tenant_slug}'
    result = cache.get(cache_key)
    if result is not None:
        return result

    try:
        from ..models import Restaurant, TenantService
        restaurant = Restaurant.objects.filter(slug=tenant_slug).first()
        if restaurant:
            tenant = getattr(restaurant, 'tenant', None)
            if tenant:
                result = list(
                    TenantService.objects.filter(
                        tenant=tenant, is_enabled=True,
                    ).values_list('service__code', flat=True)
                )
                cache.set(cache_key, result, 60)
                return result
    except Exception:
        pass

    return []


# ═══════════════════════════════════════════
#  ★ بررسی دسترسی کاربر + سرویس فعال
# ═══════════════════════════════════════════

def _user_has_any_service(user, service_codes, request=None):
    """هم دسترسی کاربر و هم سرویس فعال رستوران رو چک کن"""
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    expanded = _expand_codes(service_codes)

    # ★ چک سرویس فعال رستوران
    if request:
        enabled = _get_enabled_services(request)
        if enabled:  # اگه tenant داریم و سرویس‌هاش مشخصه
            # آیا هیچکدوم از سرویس‌های درخواستی فعال هست؟
            tenant_has_service = any(code in enabled for code in expanded)
            if not tenant_has_service:
                return False

    # ★ چک دسترسی کاربر
    user_perms = user.get_permissions() if hasattr(user, 'get_permissions') else []
    return any(code in user_perms for code in expanded)


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
    ★ v7: هم دسترسی کاربر و هم سرویس فعال رستوران رو چک میکنه

    استفاده:
        @require_service('inventory')
        @require_service('raw_materials')
        @require_service('inventory', 'pos')
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
                return redirect(_tenant_url(request, 'auth_page'))

            # ★ سوپر ادمین همیشه رد بشه
            if user.is_superuser:
                return view_func(request, *args, **kwargs)

            # ★ چک ترکیبی: سرویس فعال + دسترسی کاربر
            if _user_has_any_service(user, service_codes, request):
                return view_func(request, *args, **kwargs)

            if _is_api(request):
                return JsonResponse({
                    'error': 'شما دسترسی به این بخش را ندارید',
                    'required': list(service_codes),
                }, status=403)
            return redirect(_tenant_url(request, 'dashboard_app'))

        return wrapper
    return decorator


# ═══════════════════════════════════════════
#  برای ویوهای کلاسی (DRF Class-Based)
# ═══════════════════════════════════════════

def make_service_permission(*service_codes):
    class _ServicePermission(BasePermission):
        message = 'شما دسترسی به این بخش را ندارید'

        def has_permission(self, request, view):
            if request.user.is_superuser:
                return True
            return _user_has_any_service(
                request.user, service_codes, request._request,
            )

        def has_object_permission(self, request, view, obj):
            if request.user.is_superuser:
                return True
            return _user_has_any_service(
                request.user, service_codes, request._request,
            )

    _ServicePermission.__name__ = f'HasAny_{"_".join(service_codes)}'
    _ServicePermission.__qualname__ = _ServicePermission.__name__
    return _ServicePermission