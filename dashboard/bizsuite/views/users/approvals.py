"""
مدیریت کاربران — ریست رمز، تأیید و رد کاربر
"""
import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from ...roles import ROLE_CHOICES, has_permission, ROLE_OWNER, ROLE_MANAGER
from ..common import UsersPerm, resolve_business
from .base import (
    AuthUser,
    _apply_prefix,
    _get_business_users_qs,
)

logger = logging.getLogger(__name__)


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
        target = _get_business_users_qs(request.user).get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response({"error": "کاربر یافت نشد."}, status=404)

    target.set_password(new_password)
    target.save(update_fields=["password"])

    return Response({"success": True, "msg": f"رمز «{target.username}» تغییر کرد."})


# ═══════════════════════════════════════
#  ★ تأیید / رد کاربر
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([UsersPerm])
def approve_user_api(request):
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

    business = resolve_business(request)

    try:
        user = AuthUser.objects.get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response({"success": False, "error": "کاربر یافت نشد."}, status=404)

    if getattr(user, 'is_approved', False):
        return Response({"success": False, "error": "این کاربر قبلاً تأیید شده."}, status=400)

    if raw_username:
        final_username = _apply_prefix(raw_username, business)
        if AuthUser.objects.filter(username=final_username).exclude(id=user.id).exists():
            return Response(
                {"success": False, "error": f"نام کاربری «{final_username}» قبلاً ثبت شده."},
                status=400,
            )
        user.username = final_username

    user.is_approved = True
    user.role = role
    user.is_staff = role in (ROLE_OWNER, ROLE_MANAGER)

    if business and hasattr(user, "business"):
        user.business = business

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
