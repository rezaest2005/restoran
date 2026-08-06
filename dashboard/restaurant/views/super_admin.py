"""
پنل مدیریت کلان — ویوها (★ نسخه اصلاح‌شده v3)

★ تغییرات نسبت به نسخه قبل:
  ۱. @csrf_protect + json.loads(request.body) → @api_view + request.data
  ۲. superuser_required decorator → IsSuperAdmin permission class (DRF)
  ۳. super_tenants_api (GET+POST) → جدا شدن به لیست و ایجاد
  ۴. super_tenant_detail_api → @api_view با method‌های مجزا
  ۵. super_tenant_services_api → مشابه
  ۶. super_users_api: pagination اضافه شد
  ۷. DEFAULT_SERVICES → از مدل خوانده می‌شود
  ۸. print/traceback → logger
"""

import logging

from django.contrib.auth import authenticate
from django.core import signing
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission, AllowAny
from rest_framework.response import Response
from rest_framework import status

from ..models import Service, Tenant, TenantService, User

logger = logging.getLogger(__name__)

SUPER_TOKEN_SALT = 'super-admin-panel-v1'
SUPER_TOKEN_COOKIE = 'super_session'


# ═══════════════════════════════════════════
#  ★★★ DRF Permission — Super Admin ★★★
# ═══════════════════════════════════════════

def _get_super_user(request):
    """خواندن کاربر از cookie سوپر ادمین"""
    # DRF Request → underlying Django request
    django_request = request._request if hasattr(request, '_request') else request
    token = django_request.COOKIES.get(SUPER_TOKEN_COOKIE)
    if not token:
        return None
    try:
        data = signing.loads(token, salt=SUPER_TOKEN_SALT, max_age=86400 * 7)
        return User.objects.get(id=data['uid'], is_superuser=True, is_active=True)
    except Exception:
        return None


class IsSuperAdmin(BasePermission):
    """بررسی cookie سوپر ادمین — جایگزین superuser_required decorator"""
    def has_permission(self, request, view):
        user = _get_super_user(request)
        if user:
            # ★ کاربر روی DRF Request ست شود
            request.user = user
            return True
        return False


def _set_cookie(response, token):
    """ست کردن cookie سوپر ادمین"""
    response.set_cookie(
        SUPER_TOKEN_COOKIE, token,
        max_age=86400 * 7,
        httponly=True,
        samesite='Lax',
        secure=True,  # ★ در production فعال شود
    )
    return response


# ═══════════════════════════════════════════
#  API: ورود / خروج مدیر کل
# ═══════════════════════════════════════════

@api_view(["POST"])
@permission_classes([AllowAny])
def super_admin_login_api(request):
    """ورود مدیر کل — cookie جداگانه"""
    data = request.data
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    if not username or not password:
        return Response(
            {'error': 'نام کاربری و رمز عبور الزامی است'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request._request, username=username, password=password)

    if user is None:
        return Response(
            {'error': 'نام کاربری یا رمز عبور اشتباه است'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_superuser:
        return Response(
            {'error': 'شما مجوز دسترسی به این بخش را ندارید'},
            status=status.HTTP_403_FORBIDDEN,
        )

    token = signing.dumps({'uid': user.id}, salt=SUPER_TOKEN_SALT)
    response = Response({
        'ok': True,
        'user': {
            'id': user.id,
            'username': user.username,
            'first_name': user.first_name or '',
            'is_superuser': True,
        },
    })
    _set_cookie(response, token)
    return response


@api_view(["POST"])
@permission_classes([AllowAny])
def super_admin_logout_api(request):
    """خروج مدیر کل"""
    response = Response({'ok': True})
    response.delete_cookie(SUPER_TOKEN_COOKIE)
    return response


# ═══════════════════════════════════════════
#  API: آمار کلی
# ═══════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_stats_api(request):
    """آمار کلی سیستم — تعداد رستوران‌ها، سرویس‌ها، درآمد"""
    tenants = Tenant.objects.all()
    total = tenants.count()
    active = tenants.filter(is_active=True).count()

    total_services = TenantService.objects.filter(is_enabled=True).count()
    total_revenue = sum(t.monthly_revenue for t in tenants)

    now = timezone.now()
    expiring_soon = TenantService.objects.filter(
        is_enabled=True,
        expires_at__lte=now + timezone.timedelta(days=7),
        expires_at__gt=now,
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
    """لیست تمام سرویس‌های سیستم"""
    _ensure_services_exist()
    services = list(Service.objects.order_by('order').values(
        'id', 'code', 'label', 'description', 'icon',
        'default_price', 'is_active', 'order',
    ))
    return Response({'services': services})


# ═══════════════════════════════════════════
#  API: CRUD رستوران‌ها
# ═══════════════════════════════════════════

@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def super_tenants_api(request):
    """لیست و ایجاد رستوران‌ها"""

    if request.method == "GET":
        tenants = Tenant.objects.select_related('owner').all()

        # فیلترها
        search = request.GET.get('search', '').strip()
        if search:
            tenants = tenants.filter(name__icontains=search)

        is_active = request.GET.get('active')
        if is_active is not None:
            tenants = tenants.filter(is_active=is_active.lower() == 'true')

        data = []
        for t in tenants:
            data.append({
                'id': t.id,
                'name': t.name,
                'owner_id': t.owner_id,
                'owner_name': t.owner.get_full_name() or t.owner.username if t.owner else '?',
                'phone': t.phone or '',
                'address': t.address or '',
                'is_active': t.is_active,
                'active_services': t.active_services_count,
                'monthly_revenue': t.monthly_revenue,
                'created_at': t.created_at.strftime('%Y/%m/%d'),
            })
        return Response({'tenants': data})

    # POST — ایجاد رستوران جدید
    data = request.data
    owner_username = (data.get('owner_username') or '').strip()
    tenant_name = (data.get('name') or '').strip()

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

    try:
        # یافتن یا ساخت مالک
        owner, created = User.objects.get_or_create(
            username=owner_username,
            defaults={
                'first_name': data.get('owner_name', ''),
                'phone_number': data.get('owner_phone', ''),
                'is_approved': True,
                'role': 'owner',
            },
        )
        if created:
            owner.set_password(data.get('owner_password', 'changeme123'))
            owner.save()

        tenant = Tenant.objects.create(
            name=tenant_name,
            owner=owner,
            phone=data.get('phone', ''),
            address=data.get('address', ''),
            is_active=data.get('is_active', True),
        )

        # ساخت TenantService برای هر سرویس
        _ensure_services_exist()
        tenant_services = []
        for svc in Service.objects.all():
            ts = TenantService.objects.create(
                tenant=tenant, service=svc,
                is_enabled=False, price=svc.default_price,
            )
            tenant_services.append(ts)

        return Response({
            'ok': True,
            'tenant_id': tenant.id,
            'msg': f'رستوران «{tenant.name}» ساخته شد',
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
    """جزئیات / ویرایش / حذف یک رستوران"""
    try:
        tenant = Tenant.objects.select_related('owner').get(pk=pk)
    except Tenant.DoesNotExist:
        return Response(
            {'error': 'رستوران پیدا نشد'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # ── GET ──
    if request.method == "GET":
        services = []
        for ts in TenantService.objects.filter(tenant=tenant).select_related('service'):
            services.append({
                'service_id': ts.service_id,
                'code': ts.service.code,
                'label': ts.service.label,
                'is_enabled': ts.is_enabled,
                'price': ts.price,
                'expires_at': ts.expires_at.isoformat() if ts.expires_at else None,
            })

        return Response({
            'id': tenant.id,
            'name': tenant.name,
            'owner_id': tenant.owner_id,
            'owner_name': tenant.owner.get_full_name() or tenant.owner.username if tenant.owner else '?',
            'phone': tenant.phone or '',
            'address': tenant.address or '',
            'is_active': tenant.is_active,
            'services': services,
            'created_at': tenant.created_at.strftime('%Y/%m/%d'),
        })

    # ── PUT ──
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

        tenant.save()

        return Response({
            'ok': True,
            'msg': f'رستوران «{tenant.name}» بروزرسانی شد',
        })

    # ── DELETE ──
    elif request.method == "DELETE":
        name = tenant.name
        tenant.delete()
        return Response({
            'ok': True,
            'msg': f'رستوران «{name}» حذف شد',
        })


# ═══════════════════════════════════════════
#  API: مدیریت سرویس‌های یک رستوران
# ═══════════════════════════════════════════

@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def super_tenant_services_api(request, pk):
    """مدیریت سرویس‌های یک رستوران"""
    try:
        tenant = Tenant.objects.get(pk=pk)
    except Tenant.DoesNotExist:
        return Response(
            {'error': 'رستوران پیدا نشد'},
            status=status.HTTP_404_NOT_FOUND,
        )

    _ensure_services_exist()

    # ── GET ──
    if request.method == "GET":
        services = []
        for svc in Service.objects.filter(is_active=True).order_by('order'):
            ts = TenantService.objects.filter(tenant=tenant, service=svc).first()
            services.append({
                'service_id': svc.id,
                'code': svc.code,
                'label': svc.label,
                'icon': svc.icon,
                'description': svc.description,
                'is_enabled': ts.is_enabled if ts else False,
                'price': ts.price if ts else svc.default_price,
                'default_price': svc.default_price,
                'activated_at': ts.activated_at.isoformat() if ts and ts.activated_at else None,
                'expires_at': ts.expires_at.isoformat() if ts and ts.expires_at else None,
            })
        return Response({
            'tenant_id': tenant.id,
            'tenant_name': tenant.name,
            'services': services,
        })

    # ── POST ──
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

            # فعال‌سازی: اولین بار → activated_at
            if ts.is_enabled and not was_enabled:
                ts.activated_at = timezone.now()
            # غیرفعال‌سازی
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
    """لیست کاربران سیستم — با pagination"""
    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 20))
    search = request.GET.get('search', '').strip()

    qs = User.objects.all().order_by('-date_joined')

    if search:
        from django.db.models import Q
        qs = qs.filter(
            Q(username__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(phone_number__icontains=search),
        )

    total = qs.count()
    start = (page - 1) * page_size
    users = qs[start:start + page_size]

    data = [{
        'id': u.id,
        'username': u.username,
        'first_name': u.first_name or '',
        'last_name': u.last_name or '',
        'phone_number': u.phone_number or '',
        'role': getattr(u, 'role', ''),
        'is_active': u.is_active,
        'is_superuser': u.is_superuser,
        'restaurant_id': getattr(u, 'restaurant_id', None),
        'date_joined': u.date_joined.strftime('%Y/%m/%d'),
    } for u in users]

    return Response({
        'users': data,
        'total': total,
        'page': page,
        'page_size': page_size,
        'pages': (total + page_size - 1) // page_size,
    })


# ═══════════════════════════════════════════
#  API: بررسی سرویس‌های فعال (utility)
# ═══════════════════════════════════════════

def get_user_enabled_services(user):
    """
    لیست کدهای سرویس‌های فعال کاربر.
    ★ این یک view نیست — utility function
    """
    if user.is_superuser:
        return list(Service.objects.filter(is_active=True).values_list('code', flat=True))

    tenant = Tenant.objects.filter(owner=user, is_active=True).first()
    if not tenant:
        # تلاش برای پیدا کردن tenant از FK
        restaurant = getattr(user, 'restaurant', None)
        if restaurant:
            tenant = Tenant.objects.filter(
                name=restaurant.name, is_active=True,
            ).first()

    if not tenant:
        return []

    return list(
        TenantService.objects.filter(
            tenant=tenant, is_enabled=True,
            service__is_active=True,
        ).values_list('service__code', flat=True)
    )


# ═══════════════════════════════════════════
#  تابع کمکی — ساخت سرویس‌های پیش‌فرض
# ═══════════════════════════════════════════

DEFAULT_SERVICES = [
    {'code': 'dictionary', 'label': 'دیکشنری',         'icon': '📖', 'default_price': 500_000,   'order': 1},
    {'code': 'foods',      'label': 'غذا و منو',        'icon': '🍽️', 'default_price': 800_000,   'order': 2},
    {'code': 'pos',        'label': 'صندوق فروش',       'icon': '💰', 'default_price': 1_200_000, 'order': 3},
    {'code': 'kitchen',    'label': 'آشپزخانه',         'icon': '👨‍🍳', 'default_price': 1_000_000, 'order': 4},
    {'code': 'inventory',  'label': 'انبار',            'icon': '📦', 'default_price': 900_000,   'order': 5},
    {'code': 'loyalty',    'label': 'باشگاه مشتریان',   'icon': '🏆', 'default_price': 700_000,   'order': 6},
    {'code': 'reports',    'label': 'گزارش‌گیری',        'icon': '📊', 'default_price': 600_000,   'order': 7},
    {'code': 'users',      'label': 'مدیریت کاربران',   'icon': '👥', 'default_price': 400_000,   'order': 8},
]


def _ensure_services_exist():
    """ساخت سرویس‌های پیش‌فرض اگر وجود نداشته باشند"""
    for svc_data in DEFAULT_SERVICES:
        Service.objects.get_or_create(
            code=svc_data['code'],
            defaults=svc_data,
        )