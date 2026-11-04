

from core import branding


def user_permissions_context(request):
    # ★ tenant_slug همیشه ست بشه (حتی بدون لاگین)
    context = {
        'tenant_slug': getattr(request, '_tenant_slug', None),
        'app_name': branding.APP_NAME,
        'app_name_fa': branding.APP_NAME_FA,
    }

    # ★ خدمات فعال این کسب‌وکار
    # TenantService حذف شده است؛ تا زمان بازطراحی ماژول‌ها، لیست خالی است
    enabled_services = []
    context['enabled_services'] = enabled_services

    if not hasattr(request, 'user') or not request.user.is_authenticated:
        context.update({'user_perms': [], 'perms_active': False})
        return context

    user = request.user

    # سوپر ادمین → همه چیز
    if user.is_superuser:
        context.update({'user_perms': [], 'perms_active': False, 'enabled_services': []})
        return context

    # مالک → همه چیز
    if getattr(user, 'role', '') == 'owner':
        context.update({'user_perms': [], 'perms_active': False})
        return context

    # کاربر عادی
    if hasattr(user, 'get_permissions'):
        perms = user.get_permissions()
        if perms:
            context.update({
                'user_perms': perms,
                'perms_active': True,
            })
            return context

    # fallback → همه چیز نمایش
    context.update({'user_perms': [], 'perms_active': False})
    return context