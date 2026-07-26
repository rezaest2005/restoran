"""
پنل مدیریت کلان — ویوها (فقط API)
"""
import json
from functools import wraps
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods

from ..models import Service, Tenant, TenantService, User

LOGIN_URL = '/dashboard/'


def superuser_required(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect(LOGIN_URL)
        if not request.user.is_superuser:
            return redirect('dashboard_app')
        return view_func(request, *args, **kwargs)
    return wrapper


# ═══════════════════════════════════════════
#  API: آمار کلی
# ═══════════════════════════════════════════

@superuser_required
def super_stats_api(request):
    tenants = Tenant.objects.all()
    total = tenants.count()
    active = tenants.filter(is_active=True).count()
    total_services = TenantService.objects.filter(is_enabled=True).count()
    total_revenue = sum(t.monthly_revenue for t in tenants)
    expiring_soon = TenantService.objects.filter(
        is_enabled=True,
        expires_at__lte=timezone.now() + timezone.timedelta(days=7),
        expires_at__gt=timezone.now(),
    ).count()

    return JsonResponse({
        'total_tenants': total,
        'active_tenants': active,
        'total_active_services': total_services,
        'total_monthly_revenue': total_revenue,
        'expiring_soon': expiring_soon,
    })


# ═══════════════════════════════════════════
#  API: لیست سرویس‌ها (همه)
# ═══════════════════════════════════════════

@superuser_required
def super_services_list_api(request):
    _ensure_services_exist()
    services = list(Service.objects.values(
        'id', 'code', 'label', 'description', 'icon', 'default_price', 'is_active', 'order'
    ))
    return JsonResponse({'services': services})


# ═══════════════════════════════════════════
#  API: CRUD رستوران‌ها
# ═══════════════════════════════════════════

@superuser_required
def super_tenants_api(request):
    if request.method == 'GET':
        tenants = Tenant.objects.select_related('owner').all()
        data = []
        for t in tenants:
            data.append({
                'id': t.id,
                'name': t.name,
                'owner_id': t.owner_id,
                'owner_name': t.owner.get_full_name() or t.owner.username,
                'phone': t.phone,
                'address': t.address,
                'is_active': t.is_active,
                'active_services': t.active_services_count,
                'monthly_revenue': t.monthly_revenue,
                'created_at': t.created_at.strftime('%Y/%m/%d'),
            })
        return JsonResponse({'tenants': data})

    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON نامعتبر'}, status=400)

        owner_username = body.get('owner_username', '').strip()
        if not owner_username:
            return JsonResponse({'error': 'نام کاربری مالک الزامی است'}, status=400)

        owner, created = User.objects.get_or_create(
            username=owner_username,
            defaults={
                'first_name': body.get('owner_name', ''),
                'phone_number': body.get('owner_phone', ''),
                'is_approved': True,
            }
        )
        if created:
            owner.set_password(body.get('owner_password', 'changeme123'))
            owner.save()

        tenant = Tenant.objects.create(
            name=body.get('name', ''),
            owner=owner,
            phone=body.get('phone', ''),
            address=body.get('address', ''),
            is_active=body.get('is_active', True),
        )

        _ensure_services_exist()
        for svc in Service.objects.all():
            TenantService.objects.create(
                tenant=tenant, service=svc,
                is_enabled=False, price=svc.default_price,
            )

        return JsonResponse({'ok': True, 'tenant_id': tenant.id})

    return JsonResponse({'error': 'method not allowed'}, status=405)


@superuser_required
@csrf_protect
def super_tenant_detail_api(request, pk):
    try:
        tenant = Tenant.objects.select_related('owner').get(pk=pk)
    except Tenant.DoesNotExist:
        return JsonResponse({'error': 'رستوران پیدا نشد'}, status=404)

    if request.method == 'GET':
        return JsonResponse({
            'id': tenant.id,
            'name': tenant.name,
            'owner_id': tenant.owner_id,
            'owner_name': tenant.owner.get_full_name() or tenant.owner.username,
            'phone': tenant.phone,
            'address': tenant.address,
            'is_active': tenant.is_active,
        })

    elif request.method == 'PUT':
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON نامعتبر'}, status=400)

        tenant.name = body.get('name', tenant.name)
        tenant.phone = body.get('phone', tenant.phone)
        tenant.address = body.get('address', tenant.address)
        if 'is_active' in body:
            tenant.is_active = body['is_active']
        tenant.save()
        return JsonResponse({'ok': True})

    elif request.method == 'DELETE':
        tenant.delete()
        return JsonResponse({'ok': True})

    return JsonResponse({'error': 'method not allowed'}, status=405)


# ═══════════════════════════════════════════
#  API: مدیریت سرویس‌های یک رستوران
# ═══════════════════════════════════════════

@superuser_required
@csrf_protect
def super_tenant_services_api(request, pk):
    try:
        tenant = Tenant.objects.get(pk=pk)
    except Tenant.DoesNotExist:
        return JsonResponse({'error': 'رستوران پیدا نشد'}, status=404)

    _ensure_services_exist()

    if request.method == 'GET':
        services = []
        for svc in Service.objects.filter(is_active=True):
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
                'expires_at': ts.expires_at.isoformat() if ts and ts.expires_at else None,
            })
        return JsonResponse({'tenant_id': tenant.id, 'tenant_name': tenant.name, 'services': services})

    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON نامعتبر'}, status=400)

        services_data = body.get('services', [])
        updated = 0
        for item in services_data:
            svc_id = item.get('service_id')
            ts, _ = TenantService.objects.get_or_create(tenant=tenant, service_id=svc_id)
            ts.is_enabled = item.get('is_enabled', False)
            ts.price = item.get('price', 0)
            if ts.is_enabled and not ts.activated_at:
                ts.activated_at = timezone.now()
            if not ts.is_enabled:
                ts.activated_at = None
            ts.save()
            updated += 1

        return JsonResponse({'ok': True, 'updated': updated})

    return JsonResponse({'error': 'method not allowed'}, status=405)


# ═══════════════════════════════════════════
#  API: لیست کاربران (برای انتخاب مالک)
# ═══════════════════════════════════════════

@superuser_required
def super_users_api(request):
    users = list(User.objects.values('id', 'username', 'first_name', 'last_name', 'phone_number')[:100])
    return JsonResponse({'users': users})


# ═══════════════════════════════════════════
#  API: بررسی سرویس‌های فعال کاربر
# ═══════════════════════════════════════════

def get_user_enabled_services(user):
    """لیست کدهای سرویس‌های فعال کاربر — برای sidebar و منو"""
    if user.is_superuser:
        return list(Service.objects.filter(is_active=True).values_list('code', flat=True))
    tenant = Tenant.objects.filter(owner=user, is_active=True).first()
    if not tenant:
        return []
    return list(
        TenantService.objects.filter(
            tenant=tenant, is_enabled=True,
            service__is_active=True,
        ).values_list('service__code', flat=True)
    )


# ═══════════════════════════════════════════
#  تابع کمکی: اطمینان از وجود سرویس‌ها
# ═══════════════════════════════════════════

DEFAULT_SERVICES = [
    {'code': 'dictionary', 'label': 'دیکشنری',           'icon': '📖', 'default_price': 500_000,   'order': 1},
    {'code': 'foods',      'label': 'غذا و منو',          'icon': '🍽️', 'default_price': 800_000,   'order': 2},
    {'code': 'pos',        'label': 'صندوق فروش',         'icon': '💰', 'default_price': 1_200_000, 'order': 3},
    {'code': 'kitchen',    'label': 'آشپزخانه',           'icon': '👨‍🍳', 'default_price': 1_000_000, 'order': 4},
    {'code': 'inventory',  'label': 'انبار',              'icon': '📦', 'default_price': 900_000,   'order': 5},
    {'code': 'loyalty',    'label': 'باشگاه مشتریان',     'icon': '🏆', 'default_price': 700_000,   'order': 6},
    {'code': 'reports',    'label': 'گزارش‌گیری',          'icon': '📊', 'default_price': 600_000,   'order': 7},
    {'code': 'users',      'label': 'مدیریت کاربران',     'icon': '👥', 'default_price': 400_000,   'order': 8},
]


def _ensure_services_exist():
    for svc_data in DEFAULT_SERVICES:
        Service.objects.get_or_create(
            code=svc_data['code'],
            defaults=svc_data,
        )