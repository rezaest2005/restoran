"""
سوپر ادمین — آمار، فهرست حساب‌ها (برای پنل‌های ماژول/QR/پشتیبانی) و کمک‌های ساخت/حذف حساب مشتری.

A "customer" is the person who bought an account: a user with role ``owner`` + a tenant + a business. The Users page
of the admin panel creates all three in one step through ``create_customer_account``.
"""
import logging

from django.db import transaction

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from ...models import Business, Tenant, User
from ...subscription import apply_dates, dates_of, payload as subscription_payload
from .auth import IsSuperAdmin

logger = logging.getLogger(__name__)


def _clean_phone(val):
    v = (val or '').strip()
    return v if v else None


def customer_label(user):
    """Business name of a new account: the person's full name, else the username."""
    return (user.get_full_name() or '').strip() or user.username


def create_customer_account(user, start_date=None, end_date=None):
    """Give ``user`` (role owner) a tenant and a business so they can sign in and see a dashboard.

    Call inside ``transaction.atomic()``. The slug is generated from the username and made unique.
    Modules are left unmanaged (everything on) — exactly what creating a tenant has always done.
    """
    from ...slugs import unique_slug
    name = customer_label(user)
    tenant = Tenant.objects.create(name=name, owner=user, phone=user.phone_number or '')
    business = Business.objects.create(tenant=tenant, name=name, slug=unique_slug(user.username), phone=user.phone_number or '')
    user.business = business
    user.save(update_fields=['business'])
    if start_date or end_date:
        apply_dates(business, start_date, end_date)
    return tenant, business


def delete_tenant_cascade(tenant):
    """Remove a tenant with its business(es) and every account of that business (never a super admin)."""
    with transaction.atomic():
        # users, business and tenant point at each other with PROTECT: detach the users first, then delete
        businesses = list(Business.objects.filter(tenant=tenant))
        user_qs = User.objects.filter(business__in=businesses)
        account_ids = list(user_qs.filter(is_superuser=False).values_list('pk', flat=True))
        owner_id = tenant.owner_id
        if owner_id and not tenant.owner.is_superuser:
            account_ids.append(owner_id)
        user_qs.update(business=None)
        for b in businesses:
            b.delete()
        tenant.delete()
        User.objects.filter(pk__in=set(account_ids), is_superuser=False).delete()


def _tenant_to_dict(tenant, business=None):
    if business is None:
        business = Business.objects.filter(tenant=tenant).first()
    return {
        'id': tenant.id,
        'name': tenant.name,
        'slug': business.slug if business else '',
        'business_id': business.id if business else None,
        'dashboard_url': f'/{business.slug}/bizsuite_dashboard/app/' if business else '',
        'owner_id': tenant.owner_id,
        'owner_name': (
            (tenant.owner.get_full_name() or tenant.owner.username)
            if tenant.owner else '?'
        ),
        'owner_username': tenant.owner.username if tenant.owner else '',
        'is_active': tenant.is_active,
        'disabled_features': list(business.disabled_features) if business else [],
        'subscription': subscription_payload(business) if business else None,
        'created_at': tenant.created_at.strftime('%Y/%m/%d'),
    }


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_stats_api(request):
    tenants = Tenant.objects.all()
    return Response({
        'total_tenants': tenants.count(),
        'active_tenants': tenants.filter(is_active=True).count(),
        'total_users': User.objects.filter(is_active=True).count(),
    })


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_tenants_api(request):
    """Read-only list of customer accounts (the modules / QR / support panels pick a business from it)."""
    tenants = Tenant.objects.select_related('owner').all()
    search = request.GET.get('search', '').strip()
    if search:
        tenants = tenants.filter(name__icontains=search)
    return Response({'tenants': [_tenant_to_dict(t) for t in tenants]})
