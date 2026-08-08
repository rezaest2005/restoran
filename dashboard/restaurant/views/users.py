"""
User management API (★ نسخه v9 — کامل اصلاح شده)

★ v9 تغییرات:
  - user_delete: فیلتر رستوران اضافه شد (رفع باگ امنیتی)
  - create_user_api: بررسی تکرار شماره تلفن قبل از ساخت
  - approve_user_api: بررسی دسترسی اضافه شد
  - سایر endpoint‌ها: بدون تغییر
"""

import logging

from django.contrib.auth import get_user_model
from django.db.models import Q

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from ..roles import (
    ROLE_CHOICES, get_user_role, get_user_permissions,
    get_role_display, has_permission, ROLE_OWNER, ROLE_MANAGER,
)
from ..permissions import IsOwnerOrManager, IsOwner
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)
from .decorators import make_service_permission

AuthUser = get_user_model()
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  Permission
# ═══════════════════════════════════════

UsersPerm = make_service_permission('users')


# ═══════════════════════════════════════
#  resolve restaurant
# ═══════════════════════════════════════

def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    return None


def _get_restaurant_users_qs(user):
    restaurant = getattr(user, 'restaurant', None)
    if restaurant:
        return AuthUser.objects.filter(
            Q(restaurant=restaurant) | Q(restaurant__isnull=True, is_superuser=False),
        )
    elif user.is_superuser:
        return AuthUser.objects.all()
    else:
        return AuthUser.objects.none()


def _apply_prefix(username, restaurant):
    if not restaurant:
        return username

    prefix = getattr(restaurant, 'username_prefix', '') or ''
    if not prefix:
        return username

    if username.startswith(prefix):
        return username

    return prefix + username


# ═══════════════════════════════════════
#  لیست کاربران
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([UsersPerm])
def user_management_api(request):
    if not has_permission(request.user, "users.view"):
        return Response({"success": False, "error": "دسترسی ندارید."}, status=403)

    users = _get_restaurant_users_qs(request.user).order_by("-date_joined")

    role_filter = request.GET.get("role")
    if role_filter:
        users = users.filter(role=role_filter)

    search = request.GET.get("search", "").strip()
    if search:
        users = users.filter(
            Q(username__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(phone_number__icontains=search),
        )

    restaurant = getattr(request.user, 'restaurant', None)
    prefix = ''
    if restaurant:
        prefix = getattr(restaurant, 'username_prefix', '') or ''

    data = []
    for u in users:
        data.append({
            "id": u.id,
            "username": u.username,
            "phone_number": getattr(u, "phone_number", "") or "",
            "first_name": getattr(u, "first_name", "") or "",
            "last_name": getattr(u, "last_name", "") or "",
            "is_approved": getattr(u, "is_approved", True),
            "role": getattr(u, "role", "cashier") or "cashier",
            "role_display": get_role_display(u),
            "is_active": u.is_active,
            "is_staff": u.is_staff,
            "date_joined": (
                u.date_joined.strftime("%Y/%m/%d %H:%M") if u.date_joined else "—"
            ),
            "last_login": (
                u.last_login.strftime("%Y/%m/%d %H:%M") if u.last_login else "هرگز"
            ),
            "permissions": get_user_permissions(u),
        })

    return Response({
        "success": True,
        "count": len(data),
        "users": data,
        "prefix": prefix,
    })


# ═══════════════════════════════════════
#  ★ ایجاد کاربر — v9
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([UsersPerm])
def create_user_api(request):
    if not has_permission(request.user, "users.create"):
        return Response({"success": False, "error": "دسترسی ندارید."}, status=403)

    data = request.data
    raw_username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    phone = (data.get("phone_number") or "").strip()
    role = data.get("role", "cashier")
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()

    if not raw_username:
        return Response({"success": False, "error": "نام کاربری الزامی است."}, status=400)
    if not password or len(password) < 4:
        return Response({"success": False, "error": "رمز باید حداقل 4 کاراکتر باشد."}, status=400)

    restaurant = _resolve_restaurant(request)
    final_username = _apply_prefix(raw_username, restaurant)

    if AuthUser.objects.filter(username=final_username).exists():
        return Response(
            {"success": False, "error": f"نام کاربری «{final_username}» قبلاً ثبت شده."},
            status=400,
        )

    # ★ v9: بررسی تکرار شماره تلفن قبل از ساخت کاربر
    if phone and AuthUser.objects.filter(phone_number=phone).exists():
        return Response(
            {"success": False, "error": f"شماره «{phone}» قبلاً ثبت شده."},
            status=400,
        )

    valid_roles = [r[0] for r in ROLE_CHOICES]
    if role not in valid_roles:
        return Response(
            {"success": False, "error": f"نقش نامعتبر. مقادیر مجاز: {', '.join(valid_roles)}"},
            status=400,
        )

    if role == ROLE_OWNER and get_user_role(request.user) != ROLE_OWNER:
        return Response({"success": False, "error": "فقط مالک می‌تواند مالک تعیین کند."}, status=403)

    try:
        user = AuthUser.objects.create_user(
            username=final_username,
            password=password,
        )

        if first_name:
            user.first_name = first_name
        if last_name:
            user.last_name = last_name
        if hasattr(user, "role"):
            user.role = role
        if hasattr(user, "phone_number") and phone:
            user.phone_number = phone
        if hasattr(user, "restaurant") and restaurant:
            user.restaurant = restaurant

        user.is_staff = role in (ROLE_OWNER, ROLE_MANAGER)
        user.is_superuser = False
        if hasattr(user, "is_approved"):
            user.is_approved = True

        update_fields = [
            "first_name", "last_name", "is_staff",
            "is_superuser",
        ]
        if hasattr(user, "role"):
            update_fields.append("role")
        if hasattr(user, "phone_number"):
            update_fields.append("phone_number")
        if hasattr(user, "restaurant"):
            update_fields.append("restaurant")
        if hasattr(user, "is_approved"):
            update_fields.append("is_approved")

        user.save(update_fields=update_fields)

        prefix = ''
        if restaurant:
            prefix = getattr(restaurant, 'username_prefix', '') or ''

        return Response({
            "success": True,
            "user_id": user.id,
            "username": user.username,
            "raw_username": raw_username,
            "prefix": prefix,
            "role": role,
            "msg": f"کاربر «{final_username}» ایجاد شد.",
        })

    except Exception as e:
        logger.exception("Error creating user")
        return Response({"success": False, "error": str(e)}, status=500)


# ═══════════════════════════════════════
#  ویرایش نقش
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([UsersPerm])
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
        target = _get_restaurant_users_qs(request.user).get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response({"error": "کاربر یافت نشد."}, status=404)

    old_role = getattr(target, "role", "")
    role_names = dict(ROLE_CHOICES)

    target.role = new_role
    target.is_staff = new_role in (ROLE_OWNER, ROLE_MANAGER)
    target.save(update_fields=["role", "is_staff"])

    return Response({
        "success": True,
        "msg": (
            f"نقش «{target.username}» از "
            f"«{role_names.get(old_role, 'نامشخص')}» به "
            f"«{role_names.get(new_role, 'نامشخص')}» تغییر کرد."
        ),
        "user": {
            "id": target.id,
            "username": target.username,
            "role": new_role,
            "role_display": get_role_display(target),
        },
    })


# ═══════════════════════════════════════
#  فعال/غیرفعال
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([UsersPerm])
def user_toggle_active(request):
    if not has_permission(request.user, "users.edit"):
        return Response({"error": "دسترسی ندارید."}, status=403)

    user_id = request.data.get("user_id")
    if not user_id:
        return Response({"error": "شناسه کاربر الزامی."}, status=400)

    if int(user_id) == request.user.id:
        return Response({"error": "نمی‌توانید خودتان را غیرفعال کنید."}, status=400)

    try:
        target = _get_restaurant_users_qs(request.user).get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response({"error": "کاربر یافت نشد."}, status=404)

    target.is_active = not target.is_active
    target.save(update_fields=["is_active"])

    status_text = "فعال" if target.is_active else "غیرفعال"
    return Response({
        "success": True,
        "is_active": target.is_active,
        "msg": f"کاربر «{target.username}» {status_text} شد.",
    })


# ═══════════════════════════════════════
#  بازنشانی رمز عبور
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([UsersPerm])
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
        target = _get_restaurant_users_qs(request.user).get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response({"error": "کاربر یافت نشد."}, status=404)

    target.set_password(new_password)
    target.save(update_fields=["password"])

    return Response({"success": True, "msg": f"رمز «{target.username}» تغییر کرد."})


# ═══════════════════════════════════════
#  ★ تأیید / رد کاربر — v9
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([UsersPerm])
def approve_user_api(request):
    # ★ v9: بررسی دسترسی
    if not has_permission(request.user, "users.edit"):
        return Response({"success": False, "error": "دسترسی ندارید."}, status=403)

    data = request.data
    user_id = data.get("user_id")
    role = data.get("role", "customer")
    raw_username = (data.get("username") or "").strip()

    if not user_id:
        return Response({"success": False, "error": "شناسه کاربر ارسال نشد."}, status=400)

    valid_roles = [r[0] for r in ROLE_CHOICES]
    if role not in valid_roles:
        return Response({"success": False, "error": f"نقش نامعتبر: {role}"}, status=400)

    restaurant = _resolve_restaurant(request)

    try:
        user = AuthUser.objects.get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response({"success": False, "error": "کاربر یافت نشد."}, status=404)

    if getattr(user, 'is_approved', False):
        return Response({"success": False, "error": "این کاربر قبلاً تأیید شده."}, status=400)

    if raw_username:
        final_username = _apply_prefix(raw_username, restaurant)
        if AuthUser.objects.filter(username=final_username).exclude(id=user.id).exists():
            return Response(
                {"success": False, "error": f"نام کاربری «{final_username}» قبلاً ثبت شده."},
                status=400,
            )
        user.username = final_username

    user.is_approved = True
    user.role = role
    user.is_staff = role in (ROLE_OWNER, ROLE_MANAGER)

    if restaurant and hasattr(user, "restaurant"):
        user.restaurant = restaurant

    user.save()

    return Response({
        "success": True,
        "username": user.username,
        "msg": f"کاربر «{user.username}» تأیید شد.",
        "user": {"id": user.id, "username": user.username, "role": role},
    })


@api_view(["POST"])
@permission_classes([UsersPerm])
def reject_user_api(request):
    # ★ v9: بررسی دسترسی
    if not has_permission(request.user, "users.edit"):
        return Response({"success": False, "error": "دسترسی ندارید."}, status=403)

    user_id = request.data.get("user_id")

    if not user_id:
        return Response({"success": False, "error": "شناسه کاربر ارسال نشد."}, status=400)

    try:
        user = AuthUser.objects.get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response({"success": False, "error": "کاربر یافت نشد."}, status=404)

    if getattr(user, 'is_approved', False):
        return Response({"success": False, "error": "این کاربر قبلاً تأیید شده و قابل حذف نیست."}, status=400)

    username = user.username
    user.delete()

    return Response({"success": True, "msg": f"درخواست «{username}» رد شد و حذف گردید."})


# ═══════════════════════════════════════
#  ★ حذف کاربر — v9
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([UsersPerm])
def user_delete(request):
    # ★ v9: بررسی دسترسی
    if not has_permission(request.user, "users.delete"):
        return Response({"success": False, "error": "دسترسی ندارید."}, status=403)

    user_id = request.data.get("user_id")

    if not user_id:
        return Response({"success": False, "error": "شناسه کاربر الزامی است."}, status=400)

    # ★ v9: فیلتر رستوران — جلوگیری از حذف کاربر رستوران دیگر
    try:
        target = _get_restaurant_users_qs(request.user).get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response({"success": False, "error": "کاربر یافت نشد."}, status=404)

    if target.id == request.user.id:
        return Response({"success": False, "error": "نمی‌توانید خودتان را حذف کنید."}, status=400)

    if getattr(target, 'role', '') == ROLE_OWNER:
        return Response({"success": False, "error": "مالک قابل حذف نیست."}, status=400)

    username = target.username
    target.delete()

    return Response({"success": True, "msg": f"کاربر «{username}» حذف شد."})