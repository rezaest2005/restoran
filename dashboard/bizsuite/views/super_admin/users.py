"""
سوپر ادمین — مشتریان (کاربران پنل ادمین)

Every user made here is a CUSTOMER: the person who bought an account, i.e. the business owner. Creating one builds the
whole account (user + tenant + business) in one transaction, so the customer can always sign in and see a dashboard.
The "access" list is what the customer bought: it drives the business's modules and ``disabled_features``.
"""
import logging

from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from ...features import access_of, apply_access, clean_access, sellable_keys
from ...models import Tenant, User
from ...modules import ModuleDependencyError
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from ... import password_vault, pricing, subscription as sub
from ...activity import log as activity_log
from ...subscription import apply_dates, dates_of
from .auth import IsSuperAdmin
from .tenants import _clean_phone, create_customer_account, delete_tenant_cascade

logger = logging.getLogger(__name__)

MIN_PASSWORD = 4


class _Abort(Exception):
    """Roll the transaction back and answer with ``response``."""

    def __init__(self, response):
        super().__init__("aborted")
        self.response = response


def _err(msg, code=status.HTTP_400_BAD_REQUEST):
    return Response({'error': msg}, status=code)


def _customers():
    return User.objects.select_related('business').filter(role='owner', is_superuser=False)


def _row(u):
    b = u.business
    return {
        'id': u.id,
        'username': u.username,
        'first_name': u.first_name or '',
        'last_name': u.last_name or '',
        'phone_number': u.phone_number or '',
        'is_active': u.is_active,
        'business_id': u.business_id,
        'business_name': b.name if b else '',
        'slug': b.slug if b else '',
        'date_joined': u.date_joined.strftime('%Y/%m/%d'),
        'subscription': sub.payload(b) if b else None,
        'price': b.subscription_price if b else None,
    }


def _detail(u):
    b = u.business
    return {
        **_row(u),
        'is_approved': u.is_approved,
        'access': access_of(b),
        'sellable': sellable_keys(),
        'quote': pricing.quote(access_of(b)) if b else None,
        **(dates_of(b) if b else {'start_date': '', 'end_date': ''}),
    }


def _apply_business_fields(user, data):
    """Access + subscription dates from the form (only what was sent); raises _Abort on a bad value."""
    business = user.business
    if 'access' in data:
        keys, err = clean_access(data.get('access'))
        if err:
            raise _Abort(_err(err))
        try:
            apply_access(business, keys)
        except ModuleDependencyError as exc:
            raise _Abort(_err(str(exc), status.HTTP_409_CONFLICT))
    plan = data.get('subscription')
    if isinstance(plan, dict) and plan.get('plan'):
        mode = plan.get('mode') or 'set'
        if mode not in ('set', 'extend'):
            raise _Abort(_err('mode must be set or extend'))
        if plan['plan'] not in (*pricing.PERIODS, sub.UNLIMITED):
            raise _Abort(_err('اشتراک باید دائمی، ماهانه، ۳ ماهه، ۶ ماهه یا سالانه باشد.'))
        before = business.subscription_ends_at.isoformat() if business.subscription_ends_at else None
        try:
            sub.apply(business, plan['plan'], mode)
        except ValueError as exc:
            raise _Abort(_err(str(exc)))
        after = sub.payload(business)
        activity_log(business, 'system', 'subscription.set',
                     f"اشتراک: {after['plan_display']}" + (f" — پایان {after['ends_at']}" if after['ends_at'] else ' — دائمی'),
                     details={'plan': plan['plan'], 'mode': mode, 'from': before, 'to': after['ends_at']})
    elif 'start_date' in data or 'end_date' in data:
        current = dates_of(business)
        try:
            apply_dates(business, data.get('start_date', current['start_date']), data.get('end_date', current['end_date']))
        except ValueError as exc:
            raise _Abort(_err(str(exc)))
    if business.subscription_plan == sub.UNLIMITED and business.subscription_price is not None:
        # permanent has no period price
        business.subscription_price = None
        business.save(update_fields=['subscription_price'])
    elif ('access' in data or plan) and business.subscription_plan in pricing.PERIODS:
        # snapshot of what this combination costs for the period now in force
        business.subscription_price = pricing.total_for(access_of(business), business.subscription_plan)
        business.save(update_fields=['subscription_price'])


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

    qs = _customers().order_by('-date_joined')
    search = request.GET.get('search', '').strip()
    if search:
        qs = qs.filter(
            Q(username__icontains=search) | Q(first_name__icontains=search)
            | Q(last_name__icontains=search) | Q(phone_number__icontains=search)
            | Q(business__name__icontains=search),
        )
    total = qs.count()
    start = (page - 1) * page_size
    return Response({
        'users': [_row(u) for u in qs[start:start + page_size]],
        'total': total, 'page': page, 'page_size': page_size,
        'pages': (total + page_size - 1) // page_size,
    })


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def super_user_create_api(request):
    """Create a customer: user (owner) + tenant + business, atomically."""
    data = request.data
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return _err('نام کاربری و رمز عبور الزامی است')
    if len(password) < MIN_PASSWORD:
        return _err('رمز عبور باید حداقل ۴ کاراکتر باشد')
    if User.objects.filter(username=username).exists():
        return _err('این نام کاربری قبلاً ثبت شده')
    if data.get('access') is not None:
        _, err = clean_access(data.get('access'))
        if err:
            return _err(err)

    try:
        with transaction.atomic():
            user = User.objects.create_user(username=username, password=password)
            user.first_name = (data.get('first_name') or '').strip()
            user.last_name = (data.get('last_name') or '').strip()
            user.phone_number = _clean_phone(data.get('phone_number'))
            user.role = 'owner'
            user.is_approved = True
            user.is_active = True
            user.save()
            create_customer_account(user)
            _apply_business_fields(user, data)
            password_vault.store(user, password)
    except _Abort as stop:
        return stop.response
    return Response({
        'ok': True, 'user_id': user.id, 'business_id': user.business_id, 'slug': user.business.slug,
        'msg': f'مشتری «{user.username}» ساخته شد',
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsSuperAdmin])
def super_user_detail_api(request, pk):
    try:
        user = User.objects.select_related('business').get(pk=pk)
    except User.DoesNotExist:
        return _err('کاربر پیدا نشد', status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(_detail(user))

    if user.is_superuser:
        return _err('مدیر کل از اینجا قابل ویرایش یا حذف نیست', status.HTTP_403_FORBIDDEN)

    if request.method == "PUT":
        data = request.data
        new_password = data.get('password') or ''
        if new_password and len(new_password) < MIN_PASSWORD:
            return _err('رمز عبور باید حداقل ۴ کاراکتر باشد')
        fields = []
        for field in ('first_name', 'last_name'):
            if field in data:
                setattr(user, field, (data[field] or '').strip())
                fields.append(field)
        if 'phone_number' in data:
            user.phone_number = _clean_phone(data.get('phone_number'))
            fields.append('phone_number')
        if 'is_active' in data:
            user.is_active = bool(data['is_active'])
            fields.append('is_active')
        if new_password:
            user.set_password(new_password)
            fields.append('password')
        try:
            with transaction.atomic():
                if user.business_id is None:
                    # an owner without a business could never sign in: build the account now
                    user.role, user.is_approved = 'owner', True
                    fields += ['role', 'is_approved']
                if fields:
                    user.save(update_fields=fields)
                if new_password:
                    password_vault.store(user, new_password)
                if user.business_id is None:
                    create_customer_account(user)
                _apply_business_fields(user, data)
        except _Abort as stop:
            return stop.response
        user.refresh_from_db()
        return Response({'ok': True, 'msg': f'مشتری «{user.username}» بروزرسانی شد', **_detail(user)})

    # DELETE: the whole account goes (business, tenant, staff), not just the login
    username = user.username
    tenants = {t.pk: t for t in Tenant.objects.filter(owner=user)}
    if user.business and user.business.tenant_id:
        tenants.setdefault(user.business.tenant_id, user.business.tenant)
    with transaction.atomic():
        for tenant in tenants.values():
            delete_tenant_cascade(tenant)
        User.objects.filter(pk=user.pk).delete()
    return Response({'ok': True, 'msg': f'مشتری «{username}» حذف شد'})


@api_view(["GET", "PUT"])
@permission_classes([IsSuperAdmin])
def super_section_prices_api(request):
    """The global price list (Toman): {section: {monthly, quarterly, semiannual, yearly}}. Product owner only."""
    from ...models import SectionPriceList
    if request.method == "PUT":
        prices, err = pricing.clean_prices(request.data.get('prices'))
        if err:
            return _err(err)
        SectionPriceList.objects.update_or_create(pk=1, defaults={'prices': prices})
    return Response({'periods': list(pricing.PERIODS), 'sections': list(pricing.SECTIONS), 'prices': pricing.load_prices()})


PASSWORD_REVEALS_PER_MINUTE = 20


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_user_password_api(request, pk):
    """The customer's current password when the panel still holds a valid encrypted copy, else {password: null}.

    Super admin only, never cached, rate limited, and every call leaves one activity-log line (never the password)."""
    from django.core.cache import cache
    from ...activity import log

    key = f'pwreveal:{request.user.pk}'
    cache.add(key, 0, 60)
    try:
        count = cache.incr(key)
    except ValueError:
        count = 1
    if count > PASSWORD_REVEALS_PER_MINUTE:
        resp = _err('درخواست‌های زیاد؛ کمی بعد دوباره تلاش کنید.', status.HTTP_429_TOO_MANY_REQUESTS)
        resp['Cache-Control'] = 'no-store'
        return resp
    try:
        user = User.objects.select_related('business').get(pk=pk, is_superuser=False)
    except User.DoesNotExist:
        resp = _err('کاربر پیدا نشد', status.HTTP_404_NOT_FOUND)
        resp['Cache-Control'] = 'no-store'
        return resp
    password = password_vault.reveal(user)
    log(user.business, 'system', 'password.revealed', 'password revealed',
        actor=request.user if getattr(request.user, 'is_authenticated', False) else None,
        target=user, details={'username': user.username, 'had_copy': password is not None}, request=request)
    logger.info('password revealed for user %s by %s', user.pk, request.user.pk)
    resp = Response({'password': password})
    resp['Cache-Control'] = 'no-store'
    return resp
