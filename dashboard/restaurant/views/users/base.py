"""
مدیریت کاربران — ابزارهای مشترک
"""
import logging

from django.contrib.auth import get_user_model
from django.db.models import Q


logger = logging.getLogger(__name__)


AuthUser = get_user_model()


# ═══════════════════════════════════════
#  resolve restaurant
# ═══════════════════════════════════════

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
