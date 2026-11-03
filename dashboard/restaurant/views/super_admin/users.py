"""
سوپر ادمین — مدیریت کاربران
"""
import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import Restaurant, User
from .auth import IsSuperAdmin
from .tenants import _clean_phone

logger = logging.getLogger(__name__)


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
