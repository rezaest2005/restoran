"""
پنل مدیریت کلان — ویوها (★ نسخه v14 — subscription dates + login block)

★ v14 تغییرات:
  - TenantService: start_date / end_date در GET و POST سرویس‌ها
  - is_tenant_subscription_valid(): بررسی اشتراک بر اساس end_date
  - restaurant_login(): ویوی لاگین رستوران با بلاک انقضا
  - check_subscription_api(): API بررسی وضعیت اشتراک
  - super_tenants_api GET: اضافه شدن is_expired
"""

import json
import logging
import re
from datetime import date
from functools import wraps

from django.contrib.auth import (
    authenticate, login as auth_login, logout as auth_logout,
)
from django.core import signing
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework import status

from ..models import Restaurant, Service, Tenant, TenantService, User

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════
#  تنظیمات امنیتی
# ═══════════════════════════════════════════

SUPER_TOKEN_SALT = 'super-admin-panel-v1'
SUPER_TOKEN_COOKIE = 'super_admin_token'
SUPER_TOKEN_MAX_AGE = 86400 * 7  # 7 روز

_SLUG_RE = re.compile(r'^[a-zA-Z0-9_-]+$')


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
    if request.user.is_authenticated and request.user.is_superuser:
        return True
    user = _verify_super_token(request)
    if user:
        auth_login(request, user)  
        return True
    return False


def _super_admin_required(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not _is_super_admin(request):
            return redirect('/dashboard/super/auth/')
        return view_func(request, *args, **kwargs)
    return wrapper


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        django_request = (
            request._request if hasattr(request, '_request') else request
        )
        if (
            django_request.user.is_authenticated
            and django_request.user.is_superuser
        ):
            return True
        user = _verify_super_token(django_request)
        if user:
            request.user = user
            return True
        return False


def _make_super_token(user):
    return signing.dumps({'uid': user.id}, salt=SUPER_TOKEN_SALT)


def _set_super_cookie(response, token):
    response.set_cookie(
        SUPER_TOKEN_COOKIE,
        token,
        max_age=SUPER_TOKEN_MAX_AGE,
        httponly=True,
        samesite='Lax',
        secure=False,
        path='/',
    )
    return response


def _json_body(request):
    try:
        return json.loads(request.body.decode('utf-8'))
    except Exception:
        return {}


def _validate_slug(slug, exclude_restaurant_id=None):
    if not slug:
        return False, 'شناسه URL (slug) الزامی است'
    slug = slug.strip()
    if len(slug) < 1 or len(slug) > 50:
        return False, 'طول slug باید بین ۱ تا ۵۰ کاراکتر باشد'
    if not _SLUG_RE.match(slug):
        return False, 'slug فقط می‌تواند شامل حروف، اعداد، خط تیره و زیرخط باشد'
    qs = Restaurant.objects.filter(slug=slug)
    if exclude_restaurant_id:
        qs = qs.exclude(pk=exclude_restaurant_id)
    if qs.exists():
        return False, f'شناسه «{slug}» قبلاً استفاده شده'
    return True, slug


def _clean_phone(val):
    v = (val or '').strip()
    return v if v else None


# ★══════════════════════════════════════════
# ★  تابع بررسی اشتراک
# ★══════════════════════════════════════════

def is_tenant_subscription_valid(tenant):
    """
    بررسی آیا حداقل یک سرویس فعال با تاریخ معتبر وجود دارد.

    منطق:
      - اگر هیچ سرویس فعالی نباشد → False
      - اگر سرویس فعال end_date نداشته باشد → True (همیشه فعال)
      - اگر end_date در آینده باشد → True
      - اگر end_date در گذشته باشد → False
    """
    today = date.today()
    active_services = TenantService.objects.filter(
        tenant=tenant,
        is_enabled=True,
    )

    if not active_services.exists():
        return False

    for svc in active_services:
        if svc.end_date is None:
            # بدون تاریخ انقضا = همیشه فعال
            return True
        elif svc.end_date >= today:
            return True

    return False


def get_tenant_subscription_details(tenant):
    """جزئیات وضعیت اشتراک — برای API"""
    today = date.today()
    services = TenantService.objects.filter(
        tenant=tenant, is_enabled=True,
    ).select_related('service')

    details = []
    has_valid = False

    for ts in services:
        is_expired = ts.end_date is not None and ts.end_date < today
        if not is_expired:
            has_valid = True
        details.append({
            'service': ts.service.label,
            'start_date': str(ts.start_date) if ts.start_date else None,
            'end_date': str(ts.end_date) if ts.end_date else None,
            'is_expired': is_expired,
        })

    return {
        'is_valid': has_valid,
        'services': details,
    }


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


# ★══════════════════════════════════════════
# ★  صفحه لاگین رستوران — با بلاک انقضا
# ★══════════════════════════════════════════

def restaurant_login(request, slug):
    """
    صفحه ورود رستوران.
    اگر اشتراک منقضی شده باشد، فرم غیرفعال و پیام نمایش داده می‌شود.
    """
    restaurant = get_object_or_404(Restaurant, slug=slug)
    tenant = restaurant.tenant

    if not tenant or not tenant.is_active:
        return render(request, 'dashboard/login.html', {
            'tenant': tenant,
            'restaurant': restaurant,
            'slug': slug,
            'error': 'این رستوران غیرفعال است.',
            'expired': True,
        })

    # ★ بررسی اشتراک
    expired = not is_tenant_subscription_valid(tenant)

    error = None

    if request.method == 'POST' and not expired:
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')

        if not username or not password:
            error = 'نام کاربری و رمز عبور الزامی است.'
        else:
            user = authenticate(
                request,
                username=username,
                password=password,
            )

            if user is not None:
                # بررسی تعلق کاربر به این رستوران
                user_restaurant = getattr(user, 'restaurant', None)
                if user_restaurant and user_restaurant.pk == restaurant.pk:
                    if user.is_active and getattr(user, 'is_approved', True):
                        auth_login(request, user)
                        return redirect(f'/{slug}/dashboard/app/')
                    else:
                        error = 'حساب شما غیرفعال یا تأیید نشده است.'
                else:
                    error = 'نام کاربری یا رمز عبور اشتباه است.'
            else:
                error = 'نام کاربری یا رمز عبور اشتباه است.'

    return render(request, 'dashboard/login.html', {
        'tenant': tenant,
        'restaurant': restaurant,
        'slug': slug,
        'error': error,
        'expired': expired,
    })


# ★══════════════════════════════════════════
# ★  API: بررسی وضعیت اشتراک
# ★══════════════════════════════════════════

def check_subscription_api(request, slug):
    """API: بررسی وضعیت اشتراک رستوران"""
    restaurant = get_object_or_404(Restaurant, slug=slug)
    tenant = restaurant.tenant

    if not tenant:
        return JsonResponse({
            'is_valid': False,
            'error': 'رستوران tenant ندارد',
        })

    details = get_tenant_subscription_details(tenant)
    return JsonResponse(details)


# ═══════════════════════════════════════════
#  API: ورود مدیر کل
# ═══════════════════════════════════════════

@csrf_exempt
@require_POST
def super_admin_login_api(request):
    data = _json_body(request)
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    if not username or not password:
        return JsonResponse(
            {'error': 'نام کاربری و رمز عبور الزامی است'},
            status=400,
        )

    user = authenticate(
        request,
        username=username,
        password=password,
        backend='django.contrib.auth.backends.ModelBackend',
    )

    if user is None:
        return JsonResponse(
            {'error': 'نام کاربری یا رمز عبور اشتباه است'},
            status=401,
        )

    if not user.is_superuser:
        return JsonResponse(
            {'error': 'شما مجوز دسترسی به این بخش را ندارید'},
            status=403,
        )

    auth_login(request, user)

    token = _make_super_token(user)
    response = JsonResponse({
        'ok': True,
        'token': token,
        'user': {
            'id': user.id,
            'username': user.username,
            'first_name': user.first_name or '',
            'is_superuser': True,
        },
    })

    _set_super_cookie(response, token)
    return response


# ═══════════════════════════════════════════
#  API: خروج مدیر کل
# ═══════════════════════════════════════════

@require_POST
def super_admin_logout_api(request):
    auth_logout(request)
    response = JsonResponse({'ok': True})
    response.delete_cookie(SUPER_TOKEN_COOKIE, path='/')
    return response


# ═══════════════════════════════════════════
#  API: آمار کلی سیستم
# ═══════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_stats_api(request):
    tenants = Tenant.objects.all()
    total = tenants.count()
    active = tenants.filter(is_active=True).count()

    total_services = TenantService.objects.filter(is_enabled=True).count()
    total_revenue = sum(t.monthly_revenue for t in tenants)

    # ★ انقضا بر اساس end_date
    today = date.today()
    from datetime import timedelta
    week_later = today + timedelta(days=7)
    expiring_soon = TenantService.objects.filter(
        is_enabled=True,
        end_date__isnull=False,
        end_date__lte=week_later,
        end_date__gt=today,
    ).count()

    total_users = User.objects.filter(is_active=True).count()

    return Response({
        'total_tenants': total,
        'active_tenants': active,
        'total_users': total_users,
        'total_active_services': total_services,
        'total_monthly_revenue': total_revenue,
        'expiring_soon': expiring_soon,
    })


# ═══════════════════════════════════════════
#  API: لیست سرویس‌ها
# ═══════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_services_list_api(request):
    _ensure_services_exist()
    services = list(Service.objects.order_by('order').values(
        'id', 'code', 'label', 'description', 'icon',
        'default_price', 'is_active', 'order',
    ))
    return Response({'services': services})


# ═══════════════════════════════════════════
#  API: CRUD رستوران‌ها — ★ v14: is_expired
# ═══════════════════════════════════════════

@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def super_tenants_api(request):
    if request.method == "GET":
        tenants = Tenant.objects.select_related('owner').all()

        search = request.GET.get('search', '').strip()
        if search:
            tenants = tenants.filter(name__icontains=search)

        is_active = request.GET.get('active')
        if is_active is not None:
            tenants = tenants.filter(
                is_active=is_active.lower() == 'true',
            )

        data = []
        for t in tenants:
            restaurant = Restaurant.objects.filter(tenant=t).first()
            slug = restaurant.slug if restaurant else ''

            # ★ بررسی وضعیت اشتراک
            expired = not is_tenant_subscription_valid(t) if t.is_active else True

            data.append({
                'id': t.id,
                'name': t.name,
                'slug': slug,
                'dashboard_url': f'/{slug}/dashboard/app/' if slug else '',
                'owner_id': t.owner_id,
                'owner_name': (
                    (t.owner.get_full_name() or t.owner.username)
                    if t.owner else '?'
                ),
                'phone': t.phone or '',
                'address': t.address or '',
                'is_active': t.is_active,
                'is_expired': expired,  # ★ جدید
                'active_services': t.active_services_count,
                'monthly_revenue': t.monthly_revenue,
                'username_prefix': getattr(t, 'username_prefix', '') or '',
                'created_at': t.created_at.strftime('%Y/%m/%d'),
            })
        return Response({'tenants': data})

    # POST — ساخت رستوران جدید
    data = request.data
    owner_username = (data.get('owner_username') or '').strip()
    tenant_name = (data.get('name') or '').strip()
    slug = (data.get('slug') or '').strip()

    if not owner_username:
        return Response(
            {'error': 'نام کاربری مالک الزامی است'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not tenant_name:
        return Response(
            {'error': 'نام رستوران الزامی است'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    valid, msg = _validate_slug(slug)
    if not valid:
        return Response(
            {'error': msg},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            owner, created = User.objects.get_or_create(
                username=owner_username,
                defaults={
                    'first_name': data.get('owner_name', ''),
                    'is_approved': True,
                    'role': 'owner',
                },
            )
            if created:
                owner.first_name = data.get('owner_name', '')
                owner.phone_number = _clean_phone(data.get('owner_phone'))
                owner.role = 'owner'
                owner.is_approved = True
                owner.set_password(
                    data.get('owner_password', 'changeme123'),
                )
                owner.save()

            tenant = Tenant.objects.create(
                name=tenant_name,
                owner=owner,
                phone=data.get('phone', ''),
                address=data.get('address', ''),
                is_active=data.get('is_active', True),
            )

            if hasattr(tenant, 'username_prefix'):
                tenant.username_prefix = owner_username[0].lower()
                tenant.save(update_fields=['username_prefix'])

            restaurant = Restaurant.objects.create(
                tenant=tenant,
                name=tenant_name,
                slug=slug,
                phone=data.get('phone', ''),
                address=data.get('address', ''),
            )

            if not owner.restaurant:
                owner.restaurant = restaurant
                owner.save(update_fields=['restaurant'])

            _ensure_services_exist()
            for svc in Service.objects.all():
                TenantService.objects.get_or_create(
                    tenant=tenant, service=svc,
                    defaults={
                        'is_enabled': False,
                        'price': svc.default_price,
                    },
                )

        prefix = getattr(tenant, 'username_prefix', '') or ''
        return Response({
            'ok': True,
            'tenant_id': tenant.id,
            'slug': slug,
            'dashboard_url': f'/{slug}/dashboard/app/',
            'username_prefix': prefix,
            'msg': f'رستوران «{tenant.name}» با شناسه «{slug}» ساخته شد',
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        logger.exception('Error creating tenant')
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsSuperAdmin])
def super_tenant_detail_api(request, pk):
    try:
        tenant = Tenant.objects.select_related('owner').get(pk=pk)
    except Tenant.DoesNotExist:
        return Response(
            {'error': 'رستوران پیدا نشد'},
            status=status.HTTP_404_NOT_FOUND,
        )

    restaurant = Restaurant.objects.filter(tenant=tenant).first()

    if request.method == "GET":
        services = []
        for ts in TenantService.objects.filter(
            tenant=tenant,
        ).select_related('service'):
            services.append({
                'service_id': ts.service_id,
                'code': ts.service.code,
                'label': ts.service.label,
                'is_enabled': ts.is_enabled,
                'price': ts.price,
                'start_date': str(ts.start_date) if ts.start_date else None,
                'end_date': str(ts.end_date) if ts.end_date else None,
                'expires_at': (
                    ts.expires_at.isoformat() if ts.expires_at else None
                ),
            })
        return Response({
            'id': tenant.id,
            'name': tenant.name,
            'slug': restaurant.slug if restaurant else '',
            'dashboard_url': (
                f'/{restaurant.slug}/dashboard/app/'
                if restaurant else ''
            ),
            'owner_id': tenant.owner_id,
            'owner_name': (
                (tenant.owner.get_full_name() or tenant.owner.username)
                if tenant.owner else '?'
            ),
            'phone': tenant.phone or '',
            'address': tenant.address or '',
            'is_active': tenant.is_active,
            'is_expired': not is_tenant_subscription_valid(tenant),  # ★
            'username_prefix': (
                getattr(tenant, 'username_prefix', '') or ''
            ),
            'services': services,
            'created_at': tenant.created_at.strftime('%Y/%m/%d'),
        })

    elif request.method == "PUT":
        data = request.data
        if 'name' in data:
            tenant.name = data['name']
        if 'phone' in data:
            tenant.phone = data['phone']
        if 'address' in data:
            tenant.address = data['address']
        if 'is_active' in data:
            tenant.is_active = bool(data['is_active'])
        if (
            'username_prefix' in data
            and hasattr(tenant, 'username_prefix')
        ):
            tenant.username_prefix = (
                data['username_prefix'] or ''
            ).strip().lower()
        tenant.save()

        if 'slug' in data and restaurant:
            new_slug = (data['slug'] or '').strip()
            if new_slug != restaurant.slug:
                valid, msg = _validate_slug(
                    new_slug,
                    exclude_restaurant_id=restaurant.pk,
                )
                if not valid:
                    return Response(
                        {'error': msg},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                restaurant.slug = new_slug
                restaurant.save(update_fields=['slug'])

        if restaurant:
            update_fields = []
            if 'name' in data:
                restaurant.name = data['name']
                update_fields.append('name')
            if 'phone' in data:
                restaurant.phone = data['phone']
                update_fields.append('phone')
            if 'address' in data:
                restaurant.address = data['address']
                update_fields.append('address')
            if update_fields:
                restaurant.save(update_fields=update_fields)

        return Response({
            'ok': True,
            'slug': restaurant.slug if restaurant else '',
            'msg': f'رستوران «{tenant.name}» بروزرسانی شد',
        })

    elif request.method == "DELETE":
        name = tenant.name
        with transaction.atomic():
            TenantService.objects.filter(tenant=tenant).delete()
            Restaurant.objects.filter(tenant=tenant).delete()
            tenant.delete()
        return Response({
            'ok': True,
            'msg': f'رستوران «{name}» و تمام مرتبط‌ها حذف شد',
        })


# ═══════════════════════════════════════════
#  API: مدیریت سرویس‌ها — ★ v14: start_date / end_date
# ═══════════════════════════════════════════

@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def super_tenant_services_api(request, pk):
    try:
        tenant = Tenant.objects.get(pk=pk)
    except Tenant.DoesNotExist:
        return Response(
            {'error': 'رستوران پیدا نشد'},
            status=status.HTTP_404_NOT_FOUND,
        )

    _ensure_services_exist()

    if request.method == "GET":
        services = []
        for svc in Service.objects.filter(
            is_active=True,
        ).order_by('order'):
            ts = TenantService.objects.filter(
                tenant=tenant, service=svc,
            ).first()
            services.append({
                'service_id': svc.id,
                'code': svc.code,
                'label': svc.label,
                'icon': svc.icon,
                'description': svc.description,
                'is_enabled': ts.is_enabled if ts else False,
                'price': ts.price if ts else svc.default_price,
                'default_price': svc.default_price,
                # ★ تاریخ‌ها
                'start_date': str(ts.start_date) if ts and ts.start_date else None,
                'end_date': str(ts.end_date) if ts and ts.end_date else None,
                'activated_at': (
                    ts.activated_at.isoformat()
                    if ts and ts.activated_at else None
                ),
                'expires_at': (
                    ts.expires_at.isoformat()
                    if ts and ts.expires_at else None
                ),
            })
        return Response({
            'tenant_id': tenant.id,
            'tenant_name': tenant.name,
            'services': services,
        })

    elif request.method == "POST":
        data = request.data
        services_data = data.get('services', [])
        if not services_data:
            return Response(
                {'error': 'لیست سرویس‌ها ارسال نشد'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated = 0
        for item in services_data:
            svc_id = item.get('service_id')
            if not svc_id:
                continue
            try:
                ts, created = TenantService.objects.get_or_create(
                    tenant=tenant, service_id=svc_id,
                )
            except Exception:
                continue

            was_enabled = ts.is_enabled
            ts.is_enabled = item.get('is_enabled', False)
            ts.price = item.get('price', ts.price)

            # ★ ذخیره تاریخ شروع و پایان
            start_date = item.get('start_date')
            end_date = item.get('end_date')
            ts.start_date = start_date if start_date else None
            ts.end_date = end_date if end_date else None

            if ts.is_enabled and not was_enabled:
                ts.activated_at = timezone.now()
            elif not ts.is_enabled and was_enabled:
                ts.activated_at = None

            ts.save()
            updated += 1

        return Response({
            'ok': True,
            'updated': updated,
            'msg': f'{updated} سرویس بروزرسانی شد',
        })


# ═══════════════════════════════════════════
#  API: لیست کاربران
# ═══════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_users_api(request):
    try:
        page = max(1, int(request.GET.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(100, max(1, int(request.GET.get('page_size', 20))))
    except (TypeError, ValueError):
        page_size = 20

    search = request.GET.get('search', '').strip()
    restaurant_id = request.GET.get('restaurant_id')

    qs = User.objects.select_related(
        'restaurant',
    ).all().order_by('-date_joined')

    if search:
        from django.db.models import Q
        qs = qs.filter(
            Q(username__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(phone_number__icontains=search),
        )
    if restaurant_id:
        qs = qs.filter(restaurant_id=restaurant_id)

    total = qs.count()
    start = (page - 1) * page_size
    users = qs[start:start + page_size]

    data = [{
        'id': u.id,
        'username': u.username,
        'first_name': u.first_name or '',
        'last_name': u.last_name or '',
        'phone_number': u.phone_number or '',
        'role': u.role,
        'role_display': u.get_role_display(),
        'is_active': u.is_active,
        'is_superuser': u.is_superuser,
        'restaurant_id': u.restaurant_id,
        'restaurant_name': u.restaurant.name if u.restaurant else '',
        'dashboard_permissions': u.dashboard_permissions,
        'effective_permissions': u.get_permissions(),
        'date_joined': u.date_joined.strftime('%Y/%m/%d'),
    } for u in users]

    return Response({
        'users': data, 'total': total, 'page': page,
        'page_size': page_size,
        'pages': (total + page_size - 1) // page_size,
    })


# ═══════════════════════════════════════════
#  API: ساخت کاربر
# ═══════════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def super_user_create_api(request):
    data = request.data
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    role = (data.get('role') or '').strip()
    restaurant_id = data.get('restaurant_id')

    if not username or not password:
        return Response(
            {'error': 'نام کاربری و رمز عبور الزامی است'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not role:
        return Response(
            {'error': 'نقش کاربر الزامی است'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not restaurant_id:
        return Response(
            {'error': 'رستوران الزامی است'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if User.objects.filter(username=username).exists():
        return Response(
            {'error': 'این نام کاربری قبلاً ثبت شده'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        restaurant = Restaurant.objects.get(pk=restaurant_id)
    except Restaurant.DoesNotExist:
        return Response(
            {'error': 'رستوران پیدا نشد'},
            status=status.HTTP_404_NOT_FOUND,
        )

    user = User.objects.create_user(
        username=username, password=password,
    )

    user.first_name = data.get('first_name', '')
    user.last_name = data.get('last_name', '')
    user.phone_number = _clean_phone(data.get('phone_number'))
    user.role = role
    user.restaurant = restaurant
    user.is_approved = True
    user.is_active = True

    custom_perms = data.get('dashboard_permissions')
    if custom_perms is not None:
        user.dashboard_permissions = custom_perms

    user.save()

    return Response({
        'ok': True,
        'user_id': user.id,
        'msg': f'کاربر «{user.username}» ساخته شد',
    }, status=status.HTTP_201_CREATED)


# ═══════════════════════════════════════════
#  API: جزئیات / ویرایش / حذف کاربر
# ═══════════════════════════════════════════

@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsSuperAdmin])
def super_user_detail_api(request, pk):
    try:
        user = User.objects.select_related('restaurant').get(pk=pk)
    except User.DoesNotExist:
        return Response(
            {'error': 'کاربر پیدا نشد'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            'id': user.id, 'username': user.username,
            'first_name': user.first_name or '',
            'last_name': user.last_name or '',
            'phone_number': user.phone_number or '',
            'role': user.role,
            'role_display': user.get_role_display(),
            'is_active': user.is_active,
            'is_approved': user.is_approved,
            'is_superuser': user.is_superuser,
            'restaurant_id': user.restaurant_id,
            'restaurant_name': (
                user.restaurant.name if user.restaurant else ''
            ),
            'dashboard_permissions': user.dashboard_permissions,
            'effective_permissions': user.get_permissions(),
            'date_joined': user.date_joined.strftime('%Y/%m/%d'),
        })

    elif request.method == "PUT":
        data = request.data
        update_fields = []

        for field in ('first_name', 'last_name'):
            if field in data:
                setattr(user, field, data[field] or None)
                update_fields.append(field)

        if 'phone_number' in data:
            user.phone_number = _clean_phone(data.get('phone_number'))
            update_fields.append('phone_number')

        if 'role' in data:
            user.role = data['role']
            update_fields.append('role')
        if 'is_active' in data:
            user.is_active = bool(data['is_active'])
            update_fields.append('is_active')
        if 'is_approved' in data:
            user.is_approved = bool(data['is_approved'])
            update_fields.append('is_approved')
        if 'restaurant_id' in data:
            try:
                restaurant = Restaurant.objects.get(
                    pk=data['restaurant_id'],
                )
                user.restaurant = restaurant
                update_fields.append('restaurant')
            except Restaurant.DoesNotExist:
                return Response(
                    {'error': 'رستوران پیدا نشد'},
                    status=status.HTTP_404_NOT_FOUND,
                )
        if 'dashboard_permissions' in data:
            user.dashboard_permissions = data['dashboard_permissions']
            update_fields.append('dashboard_permissions')

        new_password = data.get('password')
        if new_password:
            user.set_password(new_password)
            update_fields.append('password')

        if update_fields:
            user.save(update_fields=update_fields)

        return Response({
            'ok': True,
            'msg': f'کاربر «{user.username}» بروزرسانی شد',
        })

    elif request.method == "DELETE":
        if user.is_superuser:
            return Response(
                {'error': 'نمی‌توان مدیر کل را حذف کرد'},
                status=status.HTTP_403_FORBIDDEN,
            )
        username = user.username
        user.delete()
        return Response({
            'ok': True,
            'msg': f'کاربر «{username}» حذف شد',
        })


# ═══════════════════════════════════════════
#  API: دسترسی‌های کاربر
# ═══════════════════════════════════════════

@api_view(["PUT"])
@permission_classes([IsSuperAdmin])
def super_user_permissions_api(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response(
            {'error': 'کاربر پیدا نشد'},
            status=status.HTTP_404_NOT_FOUND,
        )

    data = request.data
    permissions = data.get('dashboard_permissions', [])
    valid_codes = [s[0] for s in User.DASHBOARD_SECTIONS]
    cleaned = [p for p in permissions if p in valid_codes]

    user.dashboard_permissions = cleaned
    user.save(update_fields=['dashboard_permissions'])

    return Response({
        'ok': True,
        'dashboard_permissions': user.dashboard_permissions,
        'effective_permissions': user.get_permissions(),
        'msg': 'دسترسی‌ها بروزرسانی شد',
    })


# ═══════════════════════════════════════════
#  توابع کمکی
# ═══════════════════════════════════════════

def get_user_enabled_services(user):
    if user.is_superuser:
        return list(
            Service.objects.filter(
                is_active=True,
            ).values_list('code', flat=True)
        )

    tenant = Tenant.objects.filter(
        owner=user, is_active=True,
    ).first()
    if not tenant:
        restaurant = getattr(user, 'restaurant', None)
        if restaurant:
            tenant = Tenant.objects.filter(
                name=restaurant.name, is_active=True,
            ).first()

    if not tenant:
        return []

    return list(
        TenantService.objects.filter(
            tenant=tenant, is_enabled=True, service__is_active=True,
        ).values_list('service__code', flat=True)
    )


# ═══════════════════════════════════════════
#  سرویس‌های پیش‌فرض
# ═══════════════════════════════════════════

DEFAULT_SERVICES = [
    {'code': 'dictionary', 'label': 'دیکشنری',       'icon': '📖', 'default_price': 500_000,   'order': 1},
    {'code': 'foods',      'label': 'غذا و منو',      'icon': '🍽️', 'default_price': 800_000,   'order': 2},
    {'code': 'pos',        'label': 'صندوق فروش',     'icon': '💰', 'default_price': 1_200_000, 'order': 3},
    {'code': 'kitchen',    'label': 'آشپزخانه',       'icon': '👨‍🍳', 'default_price': 1_000_000, 'order': 4},
    {'code': 'inventory',  'label': 'انبار',          'icon': '📦', 'default_price': 900_000,   'order': 5},
    {'code': 'loyalty',    'label': 'باشگاه مشتریان', 'icon': '🏆', 'default_price': 700_000,   'order': 6},
    {'code': 'reports',    'label': 'گزارش‌گیری',      'icon': '📊', 'default_price': 600_000,   'order': 7},
    {'code': 'users',      'label': 'مدیریت کاربران', 'icon': '👥', 'default_price': 400_000,   'order': 8},
]


def _ensure_services_exist():
    for svc_data in DEFAULT_SERVICES:
        Service.objects.get_or_create(
            code=svc_data['code'], defaults=svc_data,
        )