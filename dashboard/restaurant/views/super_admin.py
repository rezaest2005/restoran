"""
پنل مدیریت کلان — ویوها (★ نسخه v16 — cleanup)
"""

import json
import logging
import re
from functools import wraps

from django.contrib.auth import (
    authenticate, login as auth_login, logout as auth_logout,
)
from django.core import signing
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.conf import settings

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework import status

from ..models import Restaurant, Tenant, User

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════
#  تنظیمات امنیتی
# ═══════════════════════════════════════════

SUPER_TOKEN_SALT = 'super-admin-panel-v1'
SUPER_TOKEN_COOKIE = 'super_admin_token'
SUPER_TOKEN_MAX_AGE = 3600 * 5

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
    data = _json_body(request)
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


# ═══════════════════════════════════════════
#  API: آمار کلی سیستم
# ═══════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_stats_api(request):
    tenants = Tenant.objects.all()
    total = tenants.count()
    active = tenants.filter(is_active=True).count()
    total_users = User.objects.filter(is_active=True).count()

    return Response({
        'total_tenants': total,
        'active_tenants': active,
        'total_users': total_users,
    })


# ═══════════════════════════════════════════
#  API: CRUD رستوران‌ها
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
            tenants = tenants.filter(is_active=is_active.lower() == 'true')

        data = []
        for t in tenants:
            restaurant = Restaurant.objects.filter(tenant=t).first()
            slug = restaurant.slug if restaurant else ''

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
        return Response({'error': 'نام کاربری مالک الزامی است'}, status=status.HTTP_400_BAD_REQUEST)
    if not tenant_name:
        return Response({'error': 'نام رستوران الزامی است'}, status=status.HTTP_400_BAD_REQUEST)

    valid, msg = _validate_slug(slug)
    if not valid:
        return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)

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
                owner.set_password(data.get('owner_password', 'changeme123'))
                owner.save()

            tenant = Tenant.objects.create(
                name=tenant_name,
                owner=owner,
                phone=data.get('phone', ''),
                address=data.get('address', ''),
                is_active=data.get('is_active', True),
            )

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

        return Response({
            'ok': True,
            'tenant_id': tenant.id,
            'slug': slug,
            'dashboard_url': f'/{slug}/dashboard/app/',
            'msg': f'رستوران «{tenant.name}» با شناسه «{slug}» ساخته شد',
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        logger.exception('Error creating tenant')
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsSuperAdmin])
def super_tenant_detail_api(request, pk):
    try:
        tenant = Tenant.objects.select_related('owner').get(pk=pk)
    except Tenant.DoesNotExist:
        return Response({'error': 'رستوران پیدا نشد'}, status=status.HTTP_404_NOT_FOUND)

    restaurant = Restaurant.objects.filter(tenant=tenant).first()

    if request.method == "GET":
        return Response({
            'id': tenant.id,
            'name': tenant.name,
            'slug': restaurant.slug if restaurant else '',
            'dashboard_url': f'/{restaurant.slug}/dashboard/app/' if restaurant else '',
            'owner_id': tenant.owner_id,
            'owner_name': (
                (tenant.owner.get_full_name() or tenant.owner.username)
                if tenant.owner else '?'
            ),
            'phone': tenant.phone or '',
            'address': tenant.address or '',
            'is_active': tenant.is_active,
            'username_prefix': getattr(tenant, 'username_prefix', '') or '',
            'created_at': tenant.created_at.strftime('%Y/%m/%d'),
        })

    elif request.method == "PUT":
        data = request.data
        for field in ('name', 'phone', 'address'):
            if field in data:
                setattr(tenant, field, data[field])
        if 'is_active' in data:
            tenant.is_active = bool(data['is_active'])
        tenant.save()

        if 'slug' in data and restaurant:
            new_slug = (data['slug'] or '').strip()
            if new_slug != restaurant.slug:
                valid, msg = _validate_slug(new_slug, exclude_restaurant_id=restaurant.pk)
                if not valid:
                    return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)
                restaurant.slug = new_slug
                restaurant.save(update_fields=['slug'])

        return Response({'ok': True, 'msg': f'رستوران «{tenant.name}» بروزرسانی شد'})

    elif request.method == "DELETE":
        name = tenant.name
        with transaction.atomic():
            Restaurant.objects.filter(tenant=tenant).delete()
            tenant.delete()
        return Response({'ok': True, 'msg': f'رستوران «{name}» حذف شد'})


# ═══════════════════════════════════════════
#  API: لیست / ساخت / ویرایش / حذف کاربران
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

    qs = User.objects.select_related('restaurant').all().order_by('-date_joined')

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


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def super_user_create_api(request):
    data = request.data
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    role = (data.get('role') or '').strip()
    restaurant_id = data.get('restaurant_id')

    if not username or not password:
        return Response({'error': 'نام کاربری و رمز عبور الزامی است'}, status=status.HTTP_400_BAD_REQUEST)
    if not role:
        return Response({'error': 'نقش کاربر الزامی است'}, status=status.HTTP_400_BAD_REQUEST)
    if not restaurant_id:
        return Response({'error': 'رستوران الزامی است'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username=username).exists():
        return Response({'error': 'این نام کاربری قبلاً ثبت شده'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        restaurant = Restaurant.objects.get(pk=restaurant_id)
    except Restaurant.DoesNotExist:
        return Response({'error': 'رستوران پیدا نشد'}, status=status.HTTP_404_NOT_FOUND)

    user = User.objects.create_user(username=username, password=password)
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
        'ok': True, 'user_id': user.id,
        'msg': f'کاربر «{user.username}» ساخته شد',
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsSuperAdmin])
def super_user_detail_api(request, pk):
    try:
        user = User.objects.select_related('restaurant').get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'کاربر پیدا نشد'}, status=status.HTTP_404_NOT_FOUND)

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
            'restaurant_name': user.restaurant.name if user.restaurant else '',
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
                user.restaurant = Restaurant.objects.get(pk=data['restaurant_id'])
                update_fields.append('restaurant')
            except Restaurant.DoesNotExist:
                return Response({'error': 'رستوران پیدا نشد'}, status=status.HTTP_404_NOT_FOUND)
        if 'dashboard_permissions' in data:
            user.dashboard_permissions = data['dashboard_permissions']
            update_fields.append('dashboard_permissions')

        new_password = data.get('password')
        if new_password:
            user.set_password(new_password)
            update_fields.append('password')

        if update_fields:
            user.save(update_fields=update_fields)

        return Response({'ok': True, 'msg': f'کاربر «{user.username}» بروزرسانی شد'})

    elif request.method == "DELETE":
        if user.is_superuser:
            return Response({'error': 'نمی‌توان مدیر کل را حذف کرد'}, status=status.HTTP_403_FORBIDDEN)
        username = user.username
        user.delete()
        return Response({'ok': True, 'msg': f'کاربر «{username}» حذف شد'})


@api_view(["PUT"])
@permission_classes([IsSuperAdmin])
def super_user_permissions_api(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'کاربر پیدا نشد'}, status=status.HTTP_404_NOT_FOUND)

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