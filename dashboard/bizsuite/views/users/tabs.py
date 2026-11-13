"""
مدیریت کاربران — تب‌های دسترسی
"""
import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from ..common import UsersPerm
from .base import AuthUser, _get_business_users_qs
from ...activity import audit

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  Permission
# ═══════════════════════════════════════

# ═══════════════════════════════════════
#  ★ همه کلیدهای مجاز تب‌ها
# ═══════════════════════════════════════

from ...features import (
    ALL_FEATURE_KEYS as ALL_TAB_KEYS, licensed_features, user_features, user_ticked,
)


def _get_normalized_tabs(user):
    """همه‌ی کلیدها صریح؛ کلید ناموجود = False. منبع حقیقت: features.user_ticked."""
    ticked = user_ticked(user)
    return {k: (k in ticked) for k in ALL_TAB_KEYS}


# ═══════════════════════════════════════
#  ★ مدیریت تب‌ها — v11 (فیکس تیک خودکار)
# ═══════════════════════════════════════

@api_view(["GET", "POST"])
@permission_classes([UsersPerm])
@audit("users", "user_tabs", "تغییر دسترسی تب‌های کاربر")
def user_tabs_api(request):
    """
    GET  → tabs نرمال‌شده کاربر فعلی
    POST → ذخیره tabs یک کاربر (فقط owner/manager)

    ★ فیکس v11: همه کلیدها explicit ذخیره و برمیگرده
      کلید ناموجود = False (خودکار True نمیشه!)
    """
    if request.method == "GET":
        u = request.user
        return Response({
            "success": True,
            "dashboard_permissions": list(u.dashboard_permissions or []),
            "tabs": _get_normalized_tabs(u),       # ★ فیکس — نرمال‌شده
            # تب‌هایی که این کسب‌وکار اصلاً دارد (UI فقط همین‌ها را برای تیک‌زدن نشان می‌دهد)
            "licensed": sorted(licensed_features(getattr(u, "business", None))),
        })

    # POST — فقط مدیر/مالک
    if not (request.user.is_owner or request.user.is_manager or request.user.is_superuser):
        return Response(
            {"success": False, "error": "فقط مدیر یا مالک"},
            status=403,
        )

    user_id = request.data.get("user_id")
    tabs = request.data.get("tabs", {})

    if not user_id:
        return Response(
            {"success": False, "error": "user_id الزامی است"},
            status=400,
        )

    try:
        target = _get_business_users_qs(request.user).get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response(
            {"success": False, "error": "کاربر یافت نشد"},
            status=404,
        )

    # فقط تب‌هایی داده می‌شود که (۱) کسب‌وکار دارد و (۲) خود دهنده‌ی دسترسی دارد.
    # (سوپرادمین هر چه در مجوز کسب‌وکار هست؛ مالک همه‌ی مجوز؛ مدیر فقط تب‌های خودش)
    biz = getattr(target, "business", None)
    grantable = licensed_features(biz)
    if not request.user.is_superuser:
        grantable &= user_features(request.user)
    wanted = tabs or {}
    normalized = {k: bool(wanted.get(k, False)) and k in grantable for k in ALL_TAB_KEYS}
    normalized["home"] = "home" in grantable

    target.tabs = normalized
    target.dashboard_permissions = [k for k, v in normalized.items() if v]
    target.save(update_fields=["tabs", "dashboard_permissions"])

    return Response({
        "success": True,
        "msg": f"تب‌های «{target.username}» بروزرسانی شد",
        "dashboard_permissions": target.dashboard_permissions,
        "tabs": _get_normalized_tabs(target),      # ★ فیکس — نرمال‌شده
    })
