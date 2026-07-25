from .tenancy import set_current_restaurant, clear_current_restaurant


class TenantMiddleware:
    """ست کردن رستوران فعلی بر اساس کاربر لاگین‌کرده"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if hasattr(request, 'user') and request.user.is_authenticated:
            restaurant = getattr(request.user, 'restaurant', None)
            if restaurant:
                set_current_restaurant(restaurant)

        response = self.get_response(request)
        clear_current_restaurant()
        return response