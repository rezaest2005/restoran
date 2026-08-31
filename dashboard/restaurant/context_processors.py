from .tenancy import get_tenant_slug_from_request
from .models import TenantService, Restaurant, Service


def user_permissions_context(request):
    context = {
        'tenant_slug': getattr(request, '_tenant_slug', None),
    }

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

    # ★ اینجا فقط slug و services رو چاپ کن
    print(f"[CONTEXT] slug={tenant_slug}, enabled_services={enabled_services}")

    if not hasattr(request, 'user') or not request.user.is_authenticated:
        context.update({'user_perms': [], 'perms_active': False})
        return context

    user = request.user

    # ★ اینجا user تعریف شده، حالا میتونی چاپ کنی
    print(f"[CONTEXT] user={user}, is_superuser={user.is_superuser}, role={getattr(user, 'role', '')}")

    # سوپر ادمین → همه سرویس‌ها
    if user.is_superuser:
        all_services = list(
            Service.objects.filter(is_active=True).values_list('code', flat=True)
        )
        context.update({
            'user_perms': [],
            'perms_active': False,
            'enabled_services': all_services,
        })
        return context

    # مالک → همه سرویس‌های فعال رستوران
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

    context.update({'user_perms': [], 'perms_active': False})
    return context