"""
User management API.
"""
import json
import logging

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.views.decorators.http import require_POST

from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..roles import (
    ROLE_CHOICES, get_user_role, get_user_permissions,
    get_role_display, has_permission, ROLE_OWNER, ROLE_MANAGER,
)

AuthUser = get_user_model()
logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_management_api(request):
    if not has_permission(request.user, "users.view"):
        return Response({"error": "دسترسی ندارید."}, status=403)
    users = AuthUser.objects.filter(
        Q(restaurant=request.user.restaurant) | Q(restaurant__isnull=True)
    ).order_by("-date_joined")
    data = []
    for u in users:
        data.append({
            "id": u.id, "username": u.username,
            "phone_number": getattr(u, "phone_number", "") or "",
            "first_name": getattr(u, "first_name", "") or "",
            "last_name": getattr(u, "last_name", "") or "",
            "is_approved": getattr(u, "is_approved", True),
            "role": getattr(u, "role", "cashier") or "cashier",
            "role_display": get_role_display(u),
            "is_active": u.is_active, "is_staff": u.is_staff,
            "date_joined": u.date_joined.strftime("%Y/%m/%d %H:%M") if u.date_joined else "—",
            "last_login": u.last_login.strftime("%Y/%m/%d %H:%M") if u.last_login else "هرگز",
            "permissions": get_user_permissions(u),
        })
    return Response({"success": True, "users": data})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_user_api(request):
    if not has_permission(request.user, "users.create"):
        return Response({"success": False, "error": "دسترسی ندارید."}, status=403)
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "")
    phone = request.data.get("phone_number", "").strip()
    role = request.data.get("role", "cashier")
    if not username:
        return Response({"success": False, "error": "نام کاربری الزامی است."}, status=400)
    if not password or len(password) < 4:
        return Response({"success": False, "error": "رمز باید حداقل 4 کاراکتر باشد."}, status=400)
    if AuthUser.objects.filter(username=username).exists():
        return Response({"success": False, "error": "این نام کاربری قبلاً ثبت شده."}, status=400)
    try:
        user = AuthUser.objects.create_user(username=username, password=password)
        if hasattr(user, "role"):
            user.role = role
        if hasattr(user, "phone_number"):
            user.phone_number = phone
        if hasattr(user, "restaurant"):
            user.restaurant = request.user.restaurant
        user.is_staff = True
        user.is_superuser = False
        user.is_approved = False
        user.save()
        return Response({"success": True, "user_id": user.id, "username": user.username, "msg": f"کاربر «{username}» ایجاد شد."})
    except Exception as e:
        return Response({"success": False, "error": str(e)}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def user_update_role(request):
    if not has_permission(request.user, "users.edit"):
        return Response({"error": "دسترسی ندارید."}, status=403)
    user_id = request.data.get("user_id")
    new_role = request.data.get("role")
    if not user_id or not new_role:
        return Response({"error": "شناسه کاربر و نقش الزامی است."}, status=400)
    valid_roles = [r[0] for r in ROLE_CHOICES]
    if new_role not in valid_roles:
        return Response({"error": "نقش نامعتبر."}, status=400)
    if int(user_id) == request.user.id:
        return Response({"error": "نمی‌توانید نقش خودتان را تغییر دهید."}, status=400)
    if new_role == ROLE_OWNER and get_user_role(request.user) != ROLE_OWNER:
        return Response({"error": "فقط مالک می‌تواند مالک تعیین کند."}, status=403)
    try:
        target = AuthUser.objects.get(id=user_id, restaurant=request.user.restaurant)
    except AuthUser.DoesNotExist:
        return Response({"error": "کاربر یافت نشد."}, status=404)
    old_role = getattr(target, "role", "")
    target.role = new_role
    target.is_staff = new_role in (ROLE_OWNER, ROLE_MANAGER)
    target.save(update_fields=["role", "is_staff"])
    role_names = dict(ROLE_CHOICES)
    return Response({
        "success": True,
        "msg": f"نقش «{target.username}» از «{role_names.get(old_role, 'نامشخص')}» به «{role_names.get(new_role, 'نامشخص')}» تغییر کرد.",
        "user": {"id": target.id, "username": target.username, "role": new_role, "role_display": get_role_display(target)},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def user_toggle_active(request):
    if not has_permission(request.user, "users.edit"):
        return Response({"error": "دسترسی ندارید."}, status=403)
    user_id = request.data.get("user_id")
    if not user_id:
        return Response({"error": "شناسه کاربر الزامی."}, status=400)
    if int(user_id) == request.user.id:
        return Response({"error": "نمی‌توانید خودتان را غیرفعال کنید."}, status=400)
    try:
        target = AuthUser.objects.get(id=user_id, restaurant=request.user.restaurant)
    except AuthUser.DoesNotExist:
        return Response({"error": "کاربر یافت نشد."}, status=404)
    target.is_active = not target.is_active
    target.save(update_fields=["is_active"])
    return Response({"success": True, "is_active": target.is_active, "msg": f"کاربر «{target.username}» {'فعال' if target.is_active else 'غیرفعال'} شد."})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_reset_password(request):
    if not has_permission(request.user, "users.edit"):
        return Response({"error": "دسترسی ندارید."}, status=403)
    user_id = request.data.get("user_id")
    new_password = request.data.get("new_password")
    if not user_id or not new_password:
        return Response({"error": "شناسه کاربر و رمز جدید الزامی است."}, status=400)
    if len(new_password) < 4:
        return Response({"error": "رمز عبور باید حداقل 4 کاراکتر باشد."}, status=400)
    if int(user_id) == request.user.id:
        return Response({"error": "برای تغییر رمز خودتان از بخش تغییر رمز استفاده کنید."}, status=400)
    try:
        target = AuthUser.objects.get(id=user_id, restaurant=request.user.restaurant)
    except AuthUser.DoesNotExist:
        return Response({"error": "کاربر یافت نشد."}, status=404)
    target.set_password(new_password)
    target.save(update_fields=["password"])
    return Response({"success": True, "msg": f"رمز «{target.username}» تغییر کرد."})


@csrf_protect
@require_POST
def approve_user_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({"success": False, "error": "غیرمجاز"}, status=403)
    try:
        data = json.loads(request.body)
        user_id = data.get("user_id")
        role = data.get("role", "customer")
        if not user_id:
            return JsonResponse({"success": False, "error": "شناسه کاربر ارسال نشد."})
        from ..models import User
        user = User.objects.get(id=user_id)
        user.is_approved = True
        user.role = role
        user.is_staff = role in ("owner", "manager", "cashier", "kitchen")
        if hasattr(user, "restaurant"):
            user.restaurant = request.user.restaurant
        user.save()
        return JsonResponse({"success": True, "msg": f"کاربر «{user.username}» تأیید شد."})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})


@csrf_protect
@require_POST
def reject_user_api(request):
    try:
        data = json.loads(request.body)
        user_id = data.get("user_id")
        if not user_id:
            return JsonResponse({"success": False, "error": "شناسه کاربر ارسال نشد."})
        from ..models import User
        user = User.objects.get(id=user_id)
        if user.is_approved:
            return JsonResponse({"success": False, "error": "این کاربر قبلاً تأیید شده."})
        username = user.username
        user.delete()
        return JsonResponse({"success": True, "msg": f"درخواست «{username}» رد شد و حذف گردید."})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})


@csrf_exempt
def user_delete(request):
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'error': 'غیرمجاز'}, status=403)
    if not (request.user.is_superuser or getattr(request.user, 'role', '') == 'owner'):
        return JsonResponse({'success': False, 'error': 'دسترسی غیرمجاز'}, status=403)
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'درخواست نامعتبر'}, status=405)
    try:
        data = json.loads(request.body)
    except Exception:
        return JsonResponse({'success': False, 'error': 'داده نامعتبر'}, status=400)
    user_id = data.get('user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'شناسه کاربر الزامی است.'}, status=400)
    try:
        from ..models import User
        target = User.objects.get(id=user_id)
    except Exception:
        return JsonResponse({'success': False, 'error': 'کاربر یافت نشد.'}, status=400)
    if target.id == request.user.id:
        return JsonResponse({'success': False, 'error': 'نمی‌توانید خودتان را حذف کنید.'}, status=400)
    target.delete()
    return JsonResponse({'success': True})