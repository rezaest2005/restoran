"""
Multi-tenant infrastructure — v13

تغییرات نسبت به v12:
  • threading.local  →  ContextVar (سازگار با ASGI/async)
  • TenantManager: فیلتر خودکار روی restaurant (بدون tenant = هیچ داده‌ای)
  • all_objects: manager بدون فیلتر (ادمین، سیگنال‌ها، Celery، management command)
  • bulk_create: restaurant را خودکار پر می‌کند
  • middleware: چک عضویت کاربر در رستوران + کش کوتاه‌مدت رستوران
  • tenant_context(): برای اجرای کد خارج از request (shell، seed، تسک‌ها)
  • TenantAdminMixin: برای اینکه ادمین جنگو با manager فیلترشده خالی نشود

/zfc-ali/dashboard/app/ → middleware:
  request.path_info         = /dashboard/app/
  request.path              = /dashboard/app/
  request.META[SCRIPT_NAME] = /zfc-ali
  request._tenant_slug      = "zfc-ali"
  request.get_full_path()   = /zfc-ali/dashboard/app/   ← پچ شده
"""

import contextvars
import logging
import re
from contextlib import contextmanager

from django.conf import settings
from django.core.cache import cache
from django.db import models
from django.http import HttpResponseForbidden, HttpResponseNotFound
from django.urls import set_script_prefix

logger = logging.getLogger(__name__)

_current_restaurant = contextvars.ContextVar("current_restaurant", default=None)

__all__ = [
    "get_current_restaurant",
    "set_current_restaurant",
    "clear_current_restaurant",
    "tenant_context",
    "get_active_restaurant",
    "invalidate_restaurant_cache",
    "get_restaurant_from_request",
    "get_tenant_id_from_request",
    "get_tenant_slug_from_request",
    "TenantMiddleware",
    "TenantModel",
    "TenantManager",
    "TenantQuerySet",
    "AllObjectsManager",
    "TenantAdminMixin",
    "tenant_redirect",
]


# ═══════════════════════════════════════
#  Context helpers
# ═══════════════════════════════════════


def get_current_restaurant():
    return _current_restaurant.get()


def set_current_restaurant(restaurant):
    _current_restaurant.set(restaurant)


def clear_current_restaurant():
    _current_restaurant.set(None)


@contextmanager
def tenant_context(restaurant):
    """
    اجرای کد در چارچوب یک رستوران (خارج از request).

        with tenant_context(restaurant):
            Food.objects.all()          # فقط غذاهای همین رستوران
            Food.objects.create(...)    # restaurant خودکار پر می‌شود
    """
    token = _current_restaurant.set(restaurant)
    try:
        yield restaurant
    finally:
        _current_restaurant.reset(token)


# ═══════════════════════════════════════
#  Restaurant lookup (با کش کوتاه‌مدت)
# ═══════════════════════════════════════


def _cache_key(slug):
    return f"tenant:restaurant:{slug}"


def _cache_ttl():
    return getattr(settings, "TENANT_CACHE_TTL", 30)


def get_active_restaurant(slug):
    key = _cache_key(slug)
    restaurant = cache.get(key)
    if restaurant is not None:
        return restaurant

    from .models import Restaurant

    try:
        restaurant = Restaurant.objects.select_related("tenant").get(
            slug=slug, is_active=True
        )
    except Restaurant.DoesNotExist:
        return None

    ttl = _cache_ttl()
    if ttl:
        cache.set(key, restaurant, ttl)
    return restaurant


def invalidate_restaurant_cache(slug):
    cache.delete(_cache_key(slug))


# ═══════════════════════════════════════
#  Managers
# ═══════════════════════════════════════


class TenantQuerySet(models.QuerySet):
    def bulk_create(self, objs, *args, **kwargs):
        """bulk_create از save() رد می‌شود؛ restaurant را اینجا پر می‌کنیم."""
        objs = list(objs)
        restaurant = get_current_restaurant()
        for obj in objs:
            if not obj.restaurant_id:
                if restaurant is None:
                    raise ValueError(
                        f"{self.model.__name__}.bulk_create(): restaurant مشخص نشده."
                    )
                obj.restaurant = restaurant
        return super().bulk_create(objs, *args, **kwargs)


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    """
    فقط داده‌های رستوران فعلی.
    اگر رستورانی فعال نباشد، queryset خالی برمی‌گردد (امن‌تر از «همه‌ی داده‌ها»).
    """

    def get_queryset(self):
        qs = super().get_queryset()
        restaurant = get_current_restaurant()
        if restaurant is None:
            return qs.none()
        return qs.filter(restaurant_id=restaurant.pk)


class AllObjectsManager(models.Manager.from_queryset(TenantQuerySet)):
    """بدون فیلتر tenant — فقط برای ادمین، سیگنال‌ها و کارهای مدیریتی."""


# ═══════════════════════════════════════
#  Tenant helpers
# ═══════════════════════════════════════


def get_tenant_id_from_request(request):
    restaurant = get_current_restaurant()
    return restaurant.id if restaurant else None


def get_tenant_slug_from_request(request):
    return getattr(request, "_tenant_slug", None)


def get_restaurant_from_request(request):
    restaurant = get_current_restaurant()
    if restaurant:
        return restaurant
    slug = get_tenant_slug_from_request(request)
    if slug:
        return get_active_restaurant(slug)
    return None


# ═══════════════════════════════════════
#  tenant_redirect — redirect امن با حفظ پیشوند
# ═══════════════════════════════════════


def tenant_redirect(request, to, *args, **kwargs):
    """
    redirect با حفظ پیشوند tenant.

        return tenant_redirect(request, 'dashboard_app')
        return tenant_redirect(request, '/dashboard/app/')
    """
    from django.shortcuts import redirect as django_redirect
    from django.urls import reverse

    slug = getattr(request, "_tenant_slug", None)

    if not slug:
        return django_redirect(to, *args, **kwargs)

    if not to.startswith("/"):
        url = reverse(to, args=args, kwargs=kwargs)
    else:
        url = to

    prefix = f"/{slug}"
    if not url.startswith(prefix + "/") and url != prefix:
        url = prefix + url if url.startswith("/") else f"{prefix}/{url}"

    return django_redirect(url)


# ═══════════════════════════════════════
#  Middleware — v13
# ═══════════════════════════════════════

_TENANT_RE = re.compile(r"^/([a-zA-Z0-9_-]+)(/.*)$")


class TenantMiddleware:
    """
    ⚠ باید در MIDDLEWARE **بعد از** AuthenticationMiddleware قرار بگیرد،
      وگرنه چک عضویت کاربر اجرا نمی‌شود (هشدار در لاگ می‌بینید).

    مسیرهای غیر-tenant اضافه (مثلاً login) را در settings.py بدهید:
        TENANT_NON_SLUGS = {"accounts", "login", "logout"}
    """

    SKIP_PATHS = ("/static/", "/media/", "/admin/", "/favicon.ico")
    NON_TENANT_SLUGS = frozenset({"dashboard", "api"})

    def __init__(self, get_response):
        self.get_response = get_response
        extra = frozenset(getattr(settings, "TENANT_NON_SLUGS", ()))
        self.non_tenant_slugs = self.NON_TENANT_SLUGS | extra
        self._warned_no_user = False

    def __call__(self, request):
        path = request.path

        if any(path.startswith(p) for p in self.SKIP_PATHS):
            return self.get_response(request)

        token = _current_restaurant.set(None)

        try:
            match = _TENANT_RE.match(path)

            if match and match.group(1) not in self.non_tenant_slugs:
                slug = match.group(1)
                rest_of_path = match.group(2)

                restaurant = get_active_restaurant(slug)
                if restaurant is None:
                    return HttpResponseNotFound(f"رستوران «{slug}» یافت نشد")

                if not self._user_allowed(request, restaurant):
                    return HttpResponseForbidden("شما به این رستوران دسترسی ندارید.")

                script_name = f"/{slug}"

                # Rewrite برای URL resolution
                request.path = rest_of_path
                request.path_info = rest_of_path
                request.META["SCRIPT_NAME"] = script_name
                set_script_prefix(script_name)
                self._patch_request_for_tenant(request, script_name)

                request._tenant_slug = slug
                _current_restaurant.set(restaurant)

                return self.get_response(request)

            # بدون tenant — super admin, landing, ...
            request._tenant_slug = None
            request.META["SCRIPT_NAME"] = ""
            set_script_prefix("/")
            return self.get_response(request)

        finally:
            _current_restaurant.reset(token)
            set_script_prefix("/")

    # ───────────────────────────────────
    #  چک عضویت کاربر در رستوران
    # ───────────────────────────────────

    def _user_allowed(self, request, restaurant):
        user = getattr(request, "user", None)
        if user is None:
            if not self._warned_no_user:
                logger.warning(
                    "TenantMiddleware قبل از AuthenticationMiddleware است؛ "
                    "چک عضویت کاربر انجام نمی‌شود."
                )
                self._warned_no_user = True
            return True

        if not user.is_authenticated or user.is_superuser:
            return True

        # مشتری‌ها می‌توانند منوی هر رستوران را ببینند
        if not getattr(user, "is_staff_role", False):
            return True

        if user.restaurant_id == restaurant.id:
            return True

        # مالک Tenant به همه‌ی شعبه‌های خودش دسترسی دارد
        tenant = restaurant.tenant
        return bool(tenant and tenant.owner_id == user.id)

    # ───────────────────────────────────
    #  پچ get_full_path
    # ───────────────────────────────────

    @staticmethod
    def _patch_request_for_tenant(request, script_name):
        _original_get_full_path = request.get_full_path

        def tenant_get_full_path(force_append_slash=False):
            path = _original_get_full_path(force_append_slash)
            return script_name + path

        request.get_full_path = tenant_get_full_path


# ═══════════════════════════════════════
#  Abstract base model
# ═══════════════════════════════════════


class TenantModel(models.Model):
    restaurant = models.ForeignKey(
        "Restaurant",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name="رستوران",
        db_index=True,
    )

    # ترتیب مهم است: اولی manager پیش‌فرض (فرم‌ها و رابطه‌های معکوس) است
    objects = TenantManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.restaurant_id:
            restaurant = get_current_restaurant()
            if restaurant:
                self.restaurant = restaurant
            else:
                raise ValueError(
                    f"{self.__class__.__name__}.save(): restaurant مشخص نشده."
                )
        super().save(*args, **kwargs)


# ═══════════════════════════════════════
#  Admin mixin
# ═══════════════════════════════════════


class TenantAdminMixin:
    """
    ادمین جنگو در /admin/ رستوران فعالی ندارد، پس با TenantManager همه‌چیز
    خالی می‌شود. این mixin ادمین (لیست، dropdownها) را روی all_objects می‌برد.

        @admin.register(Food)
        class FoodAdmin(TenantAdminMixin, admin.ModelAdmin): ...
    """

    def get_queryset(self, request):
        manager = getattr(self.model, "all_objects", None)
        if manager is None:
            return super().get_queryset(request)
        qs = manager.get_queryset()
        ordering = self.get_ordering(request)
        if ordering:
            qs = qs.order_by(*ordering)
        return qs

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        rel_model = db_field.remote_field.model
        if "queryset" not in kwargs and hasattr(rel_model, "all_objects"):
            kwargs["queryset"] = rel_model.all_objects.all()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        rel_model = db_field.remote_field.model
        if "queryset" not in kwargs and hasattr(rel_model, "all_objects"):
            kwargs["queryset"] = rel_model.all_objects.all()
        return super().formfield_for_manytomany(db_field, request, **kwargs)