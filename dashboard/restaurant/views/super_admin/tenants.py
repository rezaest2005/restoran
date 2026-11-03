"""
سوپر ادمین — رستوران‌ها (tenant) و آمار
"""
import logging
import re

from django.db import transaction

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import Restaurant, Tenant, User
from .auth import IsSuperAdmin

logger = logging.getLogger(__name__)


_SLUG_RE = re.compile(r'^[a-zA-Z0-9_-]+$')


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


# ★ helper: آبجکت کامل tenant + restaurant برای response
def _tenant_to_dict(tenant, restaurant=None):
    if restaurant is None:
        restaurant = Restaurant.objects.filter(tenant=tenant).first()
    return {
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
        'username_prefix': (
            restaurant.username_prefix if restaurant else ''
        ) or '',
        # ★★★ فیلد جدید — تب‌های مجاز رستوران ★★★
        'dashboard_permissions': (
            list(restaurant.dashboard_permissions) if restaurant else []
        ),
        'created_at': tenant.created_at.strftime('%Y/%m/%d'),
    }


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
            data.append(_tenant_to_dict(t, restaurant))

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
                # ★★★ ذخیره تب‌های مجاز هنگام ساخت ★★★
                dashboard_permissions=data.get('dashboard_permissions', []),
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
        # ★ استفاده از helper — شامل dashboard_permissions
        return Response(_tenant_to_dict(tenant, restaurant))

    elif request.method == "PUT":
        data = request.data

        for field in ('name', 'phone', 'address'):
            if field in data:
                setattr(tenant, field, data[field])
        if 'is_active' in data:
            tenant.is_active = bool(data['is_active'])
        tenant.save()

        if restaurant:
            # ★ ذخیره تب‌های مجاز
            if 'dashboard_permissions' in data:
                restaurant.dashboard_permissions = data['dashboard_permissions']
                restaurant.save(update_fields=['dashboard_permissions'])

            # ★ ذخیره username_prefix
            if 'username_prefix' in data:
                restaurant.username_prefix = (data['username_prefix'] or '').strip()
                restaurant.save(update_fields=['username_prefix'])

            # ★ تغییر slug
            if 'slug' in data:
                new_slug = (data['slug'] or '').strip()
                if new_slug != restaurant.slug:
                    valid, msg = _validate_slug(new_slug, exclude_restaurant_id=restaurant.pk)
                    if not valid:
                        return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)
                    restaurant.slug = new_slug
                    restaurant.save(update_fields=['slug'])

        return Response({
            'ok': True,
            'msg': f'رستوران «{tenant.name}» بروزرسانی شد',
            'dashboard_permissions': (
                list(restaurant.dashboard_permissions) if restaurant else []
            ),
        })

    elif request.method == "DELETE":
        name = tenant.name
        with transaction.atomic():
            Restaurant.objects.filter(tenant=tenant).delete()
            tenant.delete()
        return Response({'ok': True, 'msg': f'رستوران «{name}» حذف شد'})
