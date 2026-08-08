from .models import Service


def user_permissions_context(request):
    if not hasattr(request, 'user') or not request.user.is_authenticated:
        return {}

    user = request.user

    # سوپر ادمین → همه چیز
    if user.is_superuser:
        return {'user_perms': [], 'perms_active': False}

    # مالک → همه چیز
    if getattr(user, 'role', '') == 'owner':
        return {'user_perms': [], 'perms_active': False}

    # کاربر عادی
    if hasattr(user, 'get_permissions'):
        perms = user.get_permissions()
        if perms:
            return {
                'user_perms': perms,
                'perms_active': True,
            }

    # fallback → همه چیز نمایش
    return {'user_perms': [], 'perms_active': False}