from .tenancy import set_current_restaurant, clear_current_restaurant
from django.contrib.auth import get_user_model

User = get_user_model()


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


class JWTFromCookieMiddleware:
    """اگر session کار نکرد، JWT از cookie بخونه"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.user.is_authenticated:
            jwt_token = request.COOKIES.get('access_token')
            if jwt_token:
                try:
                    from rest_framework_simplejwt.tokens import AccessToken
                    token = AccessToken(jwt_token)
                    user_id = token['user_id']
                    user = User.objects.get(id=user_id, is_active=True)
                    request.user = user
                except Exception:
                    pass
        return self.get_response(request)