"""
Multi-tenant infrastructure — URL Rewriting + SCRIPT_NAME + Slug

★ نسخه v13 — باگ‌های v12 رفع شد

★ v13:
  - Fix: get_restaurant_from_request — اول کش middleware رو چک میکنه
  - Fix: TenantMiddleware — tenant.is_active هم بررسی میشه
  - Fix: _patch_request_for_tenant — get_full_path_info هم پچ میشه
"""

import re
import threading
import logging

from django.db import models
from django.urls import set_script_prefix

logger = logging.getLogger(__name__)

_context = threading.local()

__all__ = [
    'get_current_restaurant', 'set_current_restaurant',
    'clear_current_restaurant',
    'get_restaurant_from_request',
    'get_tenant_id_from_request',
    'get_tenant_slug_from_request',
    'TenantMiddleware',
    'TenantModel',
    'AllObjectsManager',
    'tenant_redirect',
]


# ═══════════════════════════════════════
#  Context helpers
# ═══════════════════════════════════════

def get_current_restaurant():
    return getattr(_context, 'restaurant', None)


def set_current_restaurant(restaurant):
    _context.restaurant = restaurant


def clear_current_restaurant():
    _context.restaurant = None


# ═══════════════════════════════════════
#  AllObjectsManager
# ═══════════════════════════════════════

class AllObjectsManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset()


# ═══════════════════════════════════════
#  Tenant helpers
# ═══════════════════════════════════════

def get_tenant_id_from_request(request):
    restaurant = get_current_restaurant()
    if restaurant:
        return restaurant.id
    return None


def get_tenant_slug_from_request(request):
    return getattr(request, '_tenant_slug', None)


def get_restaurant_from_request(request):
    # ★ FIX: اول کش middleware رو چک کن، بعد DB بزن
    cached = get_current_restaurant()
    if cached:
        return cached

    slug = get_tenant_slug_from_request(request)
    if slug:
        from .models import Restaurant
        try:
            return Restaurant.objects.get(slug=slug, is_active=True)
        except Restaurant.DoesNotExist:
            return None
    return None


# ═══════════════════════════════════════
#  tenant_redirect — کمکی برای redirect امن
# ═══════════════════════════════════════

def tenant_redirect(request, to, *args, **kwargs):
    """
    redirect با حفظ پیشوند tenant.

    استفاده:
        return tenant_redirect(request, 'dashboard_app')
        return tenant_redirect(request, 'password_page')
        return tenant_redirect(request, '/dashboard/app/')
    """
    from django.shortcuts import redirect as django_redirect
    from django.urls import reverse

    slug = getattr(request, '_tenant_slug', None)

    if not slug:
        return django_redirect(to, *args, **kwargs)

    if not to.startswith('/'):
        # view name → reverse() خودش script_prefix رو اضافه میکنه
        url = reverse(to, args=args, kwargs=kwargs)
    else:
        url = to

    # اطمینان از وجود پیشوند tenant
    prefix = f'/{slug}'
    if not url.startswith(prefix + '/') and url != prefix:
        url = prefix + url if url.startswith('/') else f'{prefix}/{url}'

    return django_redirect(url)


# ═══════════════════════════════════════
#  Middleware — v13
# ═══════════════════════════════════════

_TENANT_RE = re.compile(r'^/([a-zA-Z0-9_-]+)(/.*)$')


class TenantMiddleware:
    """
    ★ v13:
      - tenant.is_active هم بررسی میشه
      - get_full_path_info هم پچ میشه
    """

    SKIP_PATHS = (
        '/static/', '/media/', '/admin/', '/favicon.ico',
    )

    NON_TENANT_SLUGS = frozenset({'dashboard', 'api'})

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path

        # Skip static files
        if any(path.startswith(p) for p in self.SKIP_PATHS):
            return self.get_response(request)

        prev = getattr(_context, 'restaurant', None)

        try:
            match = _TENANT_RE.match(path)

            if match:
                potential_slug = match.group(1)
                rest_of_path = match.group(2)

                if potential_slug not in self.NON_TENANT_SLUGS:
                    script_name = f'/{potential_slug}'

                    # ★ Rewrite path for URL resolution
                    request.path = rest_of_path
                    request.path_info = rest_of_path

                    # ★ SCRIPT_NAME + set_script_prefix
                    request.META['SCRIPT_NAME'] = script_name
                    set_script_prefix(script_name)

                    # ★ پچ get_full_path شامل پیشوند tenant
                    self._patch_request_for_tenant(request, script_name)

                    # Store slug
                    request._tenant_slug = potential_slug

                    # Set restaurant
                    from .models import Restaurant
                    try:
                        restaurant = Restaurant.objects.get(
                            slug=potential_slug, is_active=True,
                        )
                    except Restaurant.DoesNotExist:
                        clear_current_restaurant()
                        set_script_prefix('/')
                        from django.http import HttpResponseNotFound
                        return HttpResponseNotFound(
                            f"رستوران «{potential_slug}» یافت نشد"
                        )

                    # ★ FIX: بررسی tenant.is_active
                    tenant = getattr(restaurant, 'tenant', None)
                    if tenant and not tenant.is_active:
                        clear_current_restaurant()
                        set_script_prefix('/')
                        from django.http import HttpResponseForbidden
                        return HttpResponseForbidden(
                            f"رستوران «{potential_slug}» غیرفعال است"
                        )

                    set_current_restaurant(restaurant)

                    response = self.get_response(request)
                    return response

            # ★ بدون tenant — super admin, landing, etc.
            request._tenant_slug = None
            request.META['SCRIPT_NAME'] = ''
            set_script_prefix('/')
            clear_current_restaurant()

            response = self.get_response(request)
            return response

        finally:
            _context.restaurant = prev
            set_script_prefix('/')

    # ───────────────────────────────────
    #  ★ پچ get_full_path و build_absolute_uri
    # ───────────────────────────────────

    @staticmethod
    def _patch_request_for_tenant(request, script_name):
        """
        get_full_path() و get_full_path_info() بدون پیشوند SCRIPT_NAME
        کار میکنن. این پچ باعث میشه redirect بعد از ورود رمز،
        آدرس درست (با /reza/) رو برگردونه.

        قبل از پچ: request.get_full_path() → /dashboard/app/
        بعد از پچ:  request.get_full_path() → /reza/dashboard/app/
        """
        _original_get_full_path = request.get_full_path

        def tenant_get_full_path(force_append_slash=False):
            path = _original_get_full_path(force_append_slash)
            return script_name + path

        request.get_full_path = tenant_get_full_path

        # ★ FIX: get_full_path_info هم پچ بشه (Django 4.2+)
        if hasattr(request, 'get_full_path_info'):
            _original_get_full_path_info = request.get_full_path_info

            def tenant_get_full_path_info(force_append_slash=False):
                path = _original_get_full_path_info(force_append_slash)
                return script_name + path

            request.get_full_path_info = tenant_get_full_path_info


# ═══════════════════════════════════════
#  Abstract base model
# ═══════════════════════════════════════

class TenantModel(models.Model):
    restaurant = models.ForeignKey(
        'Restaurant',
        on_delete=models.CASCADE,
        related_name='+',
        verbose_name='رستوران',
        db_index=True,
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.restaurant_id:
            restaurant = get_current_restaurant()
            if restaurant:
                self.restaurant = restaurant
            else:
                raise ValueError(
                    f"{self.__class__.__name__}.save(): "
                    f"restaurant مشخص نشده."
                )
        super().save(*args, **kwargs)