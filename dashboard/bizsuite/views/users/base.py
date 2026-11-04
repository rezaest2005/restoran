"""
مدیریت کاربران — ابزارهای مشترک
"""
import logging

from django.contrib.auth import get_user_model
from django.db.models import Q


logger = logging.getLogger(__name__)


AuthUser = get_user_model()


# ═══════════════════════════════════════
#  resolve business
# ═══════════════════════════════════════

def _get_business_users_qs(user):
    business = getattr(user, 'business', None)
    if business:
        return AuthUser.objects.filter(
            Q(business=business) | Q(business__isnull=True, is_superuser=False),
        )
    elif user.is_superuser:
        return AuthUser.objects.all()
    else:
        return AuthUser.objects.none()


def _apply_prefix(username, business):
    if not business:
        return username

    prefix = getattr(business, 'username_prefix', '') or ''
    if not prefix:
        return username

    if username.startswith(prefix):
        return username

    return prefix + username
