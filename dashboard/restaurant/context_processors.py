from .tenancy import get_tenant_slug_from_request
from .models import TenantService, Restaurant


def user_permissions_context(request):
    # ★ tenant_slug همیشه ست بشه (حتی بدون لاگین)
    context = {
        'tenant_slug': getattr(request, '_tenant_slug', None),
    }

    # ★ خدمات فعال این رستوران
    enabled_services = []
    tenant_slug = getattr(request, '_tenant_slug', None)
    if tenant_slug:
        try:
            restaurant = Restaurant.objects.filter(slug=tenant_slug).first()
            if restaurant:
                tenant = getattr(restaurant, 'tenant', None)
                if tenant:
                    enabled_services = list(
                        TenantService.objects.filter(
                            tenant=tenant, is_enabled=True,
                        ).values_list('service__code', flat=True)
                    )
        except Exception:
            pass
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