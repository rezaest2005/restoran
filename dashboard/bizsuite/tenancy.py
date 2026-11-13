"""
Multi-tenant infrastructure — v13

تغییرات نسبت به v12:
  • threading.local  →  ContextVar (سازگار با ASGI/async)
  • TenantManager: فیلتر خودکار روی business (بدون tenant = هیچ داده‌ای)
  • all_objects: manager بدون فیلتر (ادمین، سیگنال‌ها، Celery، management command)
  • bulk_create: business را خودکار پر می‌کند
  • middleware: چک عضویت کاربر در کسب‌وکار + کش کوتاه‌مدت کسب‌وکار
  • tenant_context(): برای اجرای کد خارج از request (shell، seed، تسک‌ها)
  • TenantAdminMixin: برای اینکه ادمین جنگو با manager فیلترشده خالی نشود

/demo-co/dashboard/app/ → middleware:
  request.path_info         = /dashboard/app/
  request.path              = /dashboard/app/
  request.META[SCRIPT_NAME] = /demo-co
  request._tenant_slug      = "demo-co"
  request.get_full_path()   = /demo-co/dashboard/app/   ← پچ شده
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

_current_business = contextvars.ContextVar("current_business", default=None)

__all__ = [
    "get_current_business",
    "set_current_business",
    "clear_current_business",
    "tenant_context",
    "get_active_business",
    "invalidate_business_cache",
    "get_business_from_request",
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


def get_current_business():
    return _current_business.get()


def set_current_business(business):
    _current_business.set(business)


def clear_current_business():
    _current_business.set(None)


@contextmanager
def tenant_context(business):
    """
    اجرای کد در چارچوب یک کسب‌وکار (خارج از request).

        with tenant_context(business):
            Food.objects.all()          # فقط غذاهای همین کسب‌وکار
            Food.objects.create(...)    # business خودکار پر می‌شود
    """
    token = _current_business.set(business)
    try:
        yield business
    finally:
        _current_business.reset(token)


# ═══════════════════════════════════════
#  Business lookup (با کش کوتاه‌مدت)
# ═══════════════════════════════════════


def _cache_key(slug):
    return f"tenant:business:{slug}"


def _cache_ttl():
    return getattr(settings, "TENANT_CACHE_TTL", 30)


def get_active_business(slug):
    key = _cache_key(slug)
    business = cache.get(key)
    if business is not None:
        return business

    from .models import Business

    try:
        business = Business.objects.select_related("tenant").get(
            slug=slug, is_active=True
        )
    except Business.DoesNotExist:
        return None

    ttl = _cache_ttl()
    if ttl:
        cache.set(key, business, ttl)
    return business


def invalidate_business_cache(slug):
    cache.delete(_cache_key(slug))


# ═══════════════════════════════════════
#  Managers
# ═══════════════════════════════════════


class TenantQuerySet(models.QuerySet):
    def bulk_create(self, objs, *args, **kwargs):
        """bulk_create از save() رد می‌شود؛ business را اینجا پر می‌کنیم."""
        objs = list(objs)
        business = get_current_business()
        for obj in objs:
            if not obj.business_id:
                if business is None:
                    raise ValueError(
                        f"{self.model.__name__}.bulk_create(): business مشخص نشده."
                    )
                obj.business = business
        return super().bulk_create(objs, *args, **kwargs)


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    """
    فقط داده‌های کسب‌وکار فعلی.
    اگر کسب‌وکاری فعال نباشد، queryset خالی برمی‌گردد (امن‌تر از «همه‌ی داده‌ها»).
    """

    def get_queryset(self):
        qs = super().get_queryset()
        business = get_current_business()
        if business is None:
            return qs.none()
        return qs.filter(business_id=business.pk)


class AllObjectsManager(models.Manager.from_queryset(TenantQuerySet)):
    """بدون فیلتر tenant — فقط برای ادمین، سیگنال‌ها و کارهای مدیریتی."""


# ═══════════════════════════════════════
#  Tenant helpers
# ═══════════════════════════════════════


def get_tenant_id_from_request(request):
    business = get_current_business()
    return business.id if business else None


def get_tenant_slug_from_request(request):
    return getattr(request, "_tenant_slug", None)


def get_business_from_request(request):
    business = get_current_business()
    if business:
        return business
    slug = get_tenant_slug_from_request(request)
    if slug:
        return get_active_business(slug)
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

    SKIP_PATHS = ("/static/", "/media/", "/admin/", "/django-admin/", "/favicon.ico")
    NON_TENANT_SLUGS = frozenset({"dashboard", "bizsuite_dashboard", "bizsuite_admin", "api"})

    def __init__(self, get_response):
        self.get_response = get_response
        extra = frozenset(getattr(settings, "TENANT_NON_SLUGS", ()))
        self.non_tenant_slugs = self.NON_TENANT_SLUGS | extra
        self._warned_no_user = False

    def __call__(self, request):
        path = request.path

        if any(path.startswith(p) for p in self.SKIP_PATHS):
            return self.get_response(request)

        token = _current_business.set(None)

        try:
            match = _TENANT_RE.match(path)

            if match and match.group(1) not in self.non_tenant_slugs:
                slug = match.group(1)
                rest_of_path = match.group(2)

                business = get_active_business(slug)
                if business is None:
                    return HttpResponseNotFound(f"کسب‌وکار «{slug}» یافت نشد")

                if not self._user_allowed(request, business):
                    return HttpResponseForbidden("شما به این کسب‌وکار دسترسی ندارید.")

                script_name = f"/{slug}"

                # Rewrite برای URL resolution
                request.path = rest_of_path
                request.path_info = rest_of_path
                request.META["SCRIPT_NAME"] = script_name
                set_script_prefix(script_name)
                self._patch_request_for_tenant(request, script_name)

                request._tenant_slug = slug
                _current_business.set(business)

                return self.get_response(request)

            # بدون tenant — super admin, landing, ...
            request._tenant_slug = None
            request.META["SCRIPT_NAME"] = ""
            set_script_prefix("/")
            return self.get_response(request)

        finally:
            _current_business.reset(token)
            set_script_prefix("/")

    # ───────────────────────────────────
    #  چک عضویت کاربر در کسب‌وکار
    # ───────────────────────────────────

    def _user_allowed(self, request, business):
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

        # مشتری‌ها می‌توانند منوی هر کسب‌وکار را ببینند
        if not getattr(user, "is_staff_role", False):
            return True

        if user.business_id == business.id:
            return True

        # مالک Tenant به همه‌ی شعبه‌های خودش دسترسی دارد
        tenant = business.tenant
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
    business = models.ForeignKey(
        "Business",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name="کسب‌وکار",
        db_index=True,
    )

    # ترتیب مهم است: اولی manager پیش‌فرض (فرم‌ها و رابطه‌های معکوس) است
    objects = TenantManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.business_id:
            business = get_current_business()
            if business:
                self.business = business
            else:
                raise ValueError(
                    f"{self.__class__.__name__}.save(): business مشخص نشده."
                )
        super().save(*args, **kwargs)


# ═══════════════════════════════════════
#  Admin mixin
# ═══════════════════════════════════════


class TenantAdminMixin:
    """
    ادمین جنگو در /admin/ کسب‌وکار فعالی ندارد، پس با TenantManager همه‌چیز
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