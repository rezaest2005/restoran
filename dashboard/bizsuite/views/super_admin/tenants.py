"""
سوپر ادمین — کسب‌وکارها (tenant) و آمار
"""
import logging
import re

from django.db import transaction

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import Business, Tenant, User
from .auth import IsSuperAdmin
from ..common import server_error

logger = logging.getLogger(__name__)


_SLUG_RE = re.compile(r'^[a-zA-Z0-9_-]+$')


def _validate_slug(slug, exclude_business_id=None):
    if not slug:
        return False, 'شناسه URL (slug) الزامی است'
    slug = slug.strip()
    if len(slug) < 1 or len(slug) > 50:
        return False, 'طول slug باید بین ۱ تا ۵۰ کاراکتر باشد'
    if not _SLUG_RE.match(slug):
        return False, 'slug فقط می‌تواند شامل حروف، اعداد، خط تیره و زیرخط باشد'
    qs = Business.objects.filter(slug=slug)
    if exclude_business_id:
        qs = qs.exclude(pk=exclude_business_id)
    if qs.exists():
        return False, f'شناسه «{slug}» قبلاً استفاده شده'
    return True, slug


def _clean_phone(val):
    v = (val or '').strip()
    return v if v else None


# ★ helper: آبجکت کامل tenant + business برای response
def _tenant_to_dict(tenant, business=None):
    if business is None:
        business = Business.objects.filter(tenant=tenant).first()
    return {
        'id': tenant.id,
        'name': tenant.name,
        'slug': business.slug if business else '',
        'dashboard_url': f'/{business.slug}/dashboard/app/' if business else '',
        'owner_id': tenant.owner_id,
        'owner_name': (
            (tenant.owner.get_full_name() or tenant.owner.username)
            if tenant.owner else '?'
        ),
        'phone': tenant.phone or '',
        'address': tenant.address or '',
        'is_active': tenant.is_active,
        'username_prefix': (
            business.username_prefix if business else ''
        ) or '',
        # ★★★ فیلد جدید — تب‌های مجاز کسب‌وکار ★★★
        'dashboard_permissions': (
            list(business.dashboard_permissions) if business else []
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
#  API: CRUD کسب‌وکارها
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
            business = Business.objects.filter(tenant=t).first()
            data.append(_tenant_to_dict(t, business))

        return Response({'tenants': data})

    # POST — ساخت کسب‌وکار جدید
    data = request.data
    owner_username = (data.get('owner_username') or '').strip()
    tenant_name = (data.get('name') or '').strip()
    slug = (data.get('slug') or '').strip()

    if not owner_username:
        return Response({'error': 'نام کاربری مالک الزامی است'}, status=status.HTTP_400_BAD_REQUEST)
    if not tenant_name:
        return Response({'error': 'نام کسب‌وکار الزامی است'}, status=status.HTTP_400_BAD_REQUEST)

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

            business = Business.objects.create(
                tenant=tenant,
                name=tenant_name,
                slug=slug,
                phone=data.get('phone', ''),
                address=data.get('address', ''),
                # ★★★ ذخیره تب‌های مجاز هنگام ساخت ★★★
                dashboard_permissions=data.get('dashboard_permissions', []),
            )

            if not owner.business:
                owner.business = business
                owner.save(update_fields=['business'])

        return Response({
            'ok': True,
            'tenant_id': tenant.id,
            'slug': slug,
            'dashboard_url': f'/{slug}/dashboard/app/',
            'msg': f'کسب‌وکار «{tenant.name}» با شناسه «{slug}» ساخته شد',
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        logger.exception('Error creating tenant')
        return server_error(e)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsSuperAdmin])
def super_tenant_detail_api(request, pk):
    try:
        tenant = Tenant.objects.select_related('owner').get(pk=pk)
    except Tenant.DoesNotExist:
        return Response({'error': 'کسب‌وکار پیدا نشد'}, status=status.HTTP_404_NOT_FOUND)

    business = Business.objects.filter(tenant=tenant).first()

    if request.method == "GET":
        # ★ استفاده از helper — شامل dashboard_permissions
        return Response(_tenant_to_dict(tenant, business))

    elif request.method == "PUT":
        data = request.data

        for field in ('name', 'phone', 'address'):
            if field in data:
                setattr(tenant, field, data[field])
        if 'is_active' in data:
            tenant.is_active = bool(data['is_active'])
        tenant.save()

        if business:
            # ★ ذخیره تب‌های مجاز
            if 'dashboard_permissions' in data:
                business.dashboard_permissions = data['dashboard_permissions']
                business.save(update_fields=['dashboard_permissions'])

            # ★ ذخیره username_prefix
            if 'username_prefix' in data:
                business.username_prefix = (data['username_prefix'] or '').strip()
                business.save(update_fields=['username_prefix'])

            # ★ تغییر slug
            if 'slug' in data:
                new_slug = (data['slug'] or '').strip()
                if new_slug != business.slug:
                    valid, msg = _validate_slug(new_slug, exclude_business_id=business.pk)
                    if not valid:
                        return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)
                    business.slug = new_slug
                    business.save(update_fields=['slug'])

        return Response({
            'ok': True,
            'msg': f'کسب‌وکار «{tenant.name}» بروزرسانی شد',
            'dashboard_permissions': (
                list(business.dashboard_permissions) if business else []
            ),
        })

    elif request.method == "DELETE":
        name = tenant.name
        with transaction.atomic():
            Business.objects.filter(tenant=tenant).delete()
            tenant.delete()
        return Response({'ok': True, 'msg': f'کسب‌وکار «{name}» حذف شد'})
