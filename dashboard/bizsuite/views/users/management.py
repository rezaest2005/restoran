"""
مدیریت کاربران — لیست، ساخت، نقش، فعال/غیرفعال و حذف
"""
import logging

from django.db.models import Q

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from ...roles import (
    ROLE_CHOICES, get_user_role, get_user_permissions,
    get_role_display, has_permission, ROLE_OWNER, ROLE_MANAGER,
)
from ..common import UsersPerm, resolve_business
from .base import (
    AuthUser,
    _apply_prefix,
    _get_business_users_qs,
)
from .tabs import _get_normalized_tabs
from ..common import server_error

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  لیست کاربران
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([UsersPerm])
def user_management_api(request):
    if not has_permission(request.user, "users.view"):
        return Response({"success": False, "error": "دسترسی ندارید."}, status=403)

    users = _get_business_users_qs(request.user).order_by("-date_joined")

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

    business = getattr(request.user, 'business', None)
    prefix = ''
    if business:
        prefix = getattr(business, 'username_prefix', '') or ''

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
            "dashboard_permissions": list(u.dashboard_permissions or []),

            # ★ فیکس — نرمال‌شده، همه کلیدها explicit
            "tabs": _get_normalized_tabs(u),
        })
    return Response({
        "success": True,
        "count": len(data),
        "users": data,
        "prefix": prefix,
    })


# ═══════════════════════════════════════
#  ★ ایجاد کاربر
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

    business = resolve_business(request)
    final_username = _apply_prefix(raw_username, business)

    if AuthUser.objects.filter(username=final_username).exists():
        return Response(
            {"success": False, "error": f"نام کاربری «{final_username}» قبلاً ثبت شده."},
            status=400,
        )

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
        if hasattr(user, "business") and business:
            user.business = business

        user.is_staff = role in (ROLE_OWNER, ROLE_MANAGER)
        user.is_superuser = False
        if hasattr(user, "is_approved"):
            user.is_approved = True

        # ★ کاربر جدید: tabs خالی — بعداً مدیر تعیین میکنه
        if hasattr(user, "tabs"):
            user.tabs = {}

        update_fields = [
            "first_name", "last_name", "is_staff",
            "is_superuser",
        ]
        if hasattr(user, "role"):
            update_fields.append("role")
        if hasattr(user, "phone_number"):
            update_fields.append("phone_number")
        if hasattr(user, "business"):
            update_fields.append("business")
        if hasattr(user, "is_approved"):
            update_fields.append("is_approved")
        if hasattr(user, "tabs"):
            update_fields.append("tabs")

        user.save(update_fields=update_fields)

        prefix = ''
        if business:
            prefix = getattr(business, 'username_prefix', '') or ''

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
        return server_error(e)


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
        target = _get_business_users_qs(request.user).get(id=user_id)
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
        target = _get_business_users_qs(request.user).get(id=user_id)
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
#  ★ حذف کاربر
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([UsersPerm])
def user_delete(request):
    if not has_permission(request.user, "users.delete"):
        return Response({"success": False, "error": "دسترسی ندارید."}, status=403)

    user_id = request.data.get("user_id")

    if not user_id:
        return Response({"success": False, "error": "شناسه کاربر الزامی است."}, status=400)

    try:
        target = _get_business_users_qs(request.user).get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response({"success": False, "error": "کاربر یافت نشد."}, status=404)

    if target.id == request.user.id:
        return Response({"success": False, "error": "نمی‌توانید خودتان را حذف کنید."}, status=400)

    if getattr(target, 'role', '') == ROLE_OWNER:
        return Response({"success": False, "error": "مالک قابل حذف نیست."}, status=400)

    username = target.username
    target.delete()

    return Response({"success": True, "msg": f"کاربر «{username}» حذف شد."})
