"""
مدیریت کاربران — تب‌های دسترسی
"""
import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from ..common import UsersPerm
from .base import AuthUser, _get_restaurant_users_qs

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  Permission
# ═══════════════════════════════════════

# ═══════════════════════════════════════
#  ★ همه کلیدهای مجاز تب‌ها
# ═══════════════════════════════════════

ALL_TAB_KEYS = [
    "home",
    "pos", "pos_report", "pos_settings", "orders",
    "inventory_invoice", "inventory_sales", "inventory_warehouse",
    "inventory_receiving", "inventory_purchase_list", "inventory_reports",
    "dictionary_items", "dictionary_menu", "dictionary_recipe",
    "dictionary_suppliers", "dictionary_warehouses", "dictionary_customers",
    "dictionary_users",
    "feedback", "club",
]


def _get_normalized_tabs(user):
    """
    ★ فیکس تیک خودکار:
      همه کلیدهای ALL_TAB_KEYS رو برمیگردونه
      هر کلیدی که ذخیره نشده = False (خودکار True نمیشه!)
    """
    raw = getattr(user, "tabs", None)

    # حالت ۱: tabs ذخیره شده → نرمال کن
    if raw and isinstance(raw, dict) and len(raw) > 0:
        return {k: bool(raw.get(k, False)) for k in ALL_TAB_KEYS}

    # حالت ۲: tabs خالیه → از dashboard_permissions بساز
    perms = set(user.dashboard_permissions or [])
    return {k: (k in perms) for k in ALL_TAB_KEYS}


# ═══════════════════════════════════════
#  ★ مدیریت تب‌ها — v11 (فیکس تیک خودکار)
# ═══════════════════════════════════════

@api_view(["GET", "POST"])
@permission_classes([UsersPerm])
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
        target = _get_restaurant_users_qs(request.user).get(id=user_id)
    except AuthUser.DoesNotExist:
        return Response(
            {"success": False, "error": "کاربر یافت نشد"},
            status=404,
        )

    # ★ فیکس — نرمال‌سازی: همه کلیدها explicit ذخیره بشن
    normalized = {k: bool((tabs or {}).get(k, False)) for k in ALL_TAB_KEYS}

    target.tabs = normalized
    target.dashboard_permissions = [k for k, v in normalized.items() if v]
    target.save(update_fields=["tabs", "dashboard_permissions"])

    return Response({
        "success": True,
        "msg": f"تب‌های «{target.username}» بروزرسانی شد",
        "dashboard_permissions": target.dashboard_permissions,
        "tabs": _get_normalized_tabs(target),      # ★ فیکس — نرمال‌شده
    })
