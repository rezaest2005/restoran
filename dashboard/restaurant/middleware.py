from django.contrib.auth import get_user_model
from rest_framework_simplejwt.authentication import JWTAuthentication

from .tenancy import clear_current_restaurant, set_current_restaurant

User = get_user_model()


def _restaurant_of(user):
    """رستوران فعال کاربر، یا None."""
    if not user or not user.is_authenticated:
        return None
    restaurant = getattr(user, "restaurant", None)
    if restaurant is not None and restaurant.is_active:
        return restaurant
    return None


class TenantMiddleware:
    """
    رستوران فعلی را از روی کاربر لاگین‌کرده ست می‌کند (نه از روی URL).
    باید بعد از AuthenticationMiddleware و JWTFromCookieMiddleware بیاید.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        clear_current_restaurant()  # هیچ tenant قدیمی‌ای نباید نشت کند
        try:
            restaurant = _restaurant_of(getattr(request, "user", None))
            if restaurant:
                set_current_restaurant(restaurant)
            return self.get_response(request)
        finally:
            clear_current_restaurant()  # حتی اگر view خطا بدهد


class JWTFromCookieMiddleware:
    """اگر session کار نکرد، JWT از cookie بخونه"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.user.is_authenticated:
            jwt_token = request.COOKIES.get("access_token")
            if jwt_token:
                try:
                    from rest_framework_simplejwt.tokens import AccessToken

                    token = AccessToken(jwt_token)
                    user_id = token["user_id"]
                    user = User.objects.get(id=user_id, is_active=True)
                    request.user = user
                except Exception:
                    pass
        return self.get_response(request)


class TenantJWTAuthentication(JWTAuthentication):
    """
    توکن در هدر Authorization: Bearer داخل DRF بررسی می‌شود، یعنی بعد از
    middleware. این کلاس بعد از احراز هویت، رستوران کاربر را ست می‌کند تا
    TenantManager در ViewSetها خالی برنگردد.
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            restaurant = _restaurant_of(result[0])
            if restaurant:
                set_current_restaurant(restaurant)
        return result