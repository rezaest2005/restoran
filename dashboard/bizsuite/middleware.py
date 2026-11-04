from django.contrib.auth import get_user_model
from rest_framework_simplejwt.authentication import JWTAuthentication

from .tenancy import clear_current_business, set_current_business

User = get_user_model()


def _business_of(user):
    """کسب‌وکار فعال کاربر، یا None."""
    if not user or not user.is_authenticated:
        return None
    business = getattr(user, "business", None)
    if business is not None and business.is_active:
        return business
    return None


class TenantMiddleware:
    """
    کسب‌وکار فعلی را از روی کاربر لاگین‌کرده ست می‌کند (نه از روی URL).
    باید بعد از AuthenticationMiddleware و JWTFromCookieMiddleware بیاید.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        clear_current_business()  # هیچ tenant قدیمی‌ای نباید نشت کند
        try:
            business = _business_of(getattr(request, "user", None))
            if business:
                set_current_business(business)
            return self.get_response(request)
        finally:
            clear_current_business()  # حتی اگر view خطا بدهد


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
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            user, validated_token = result
            business = _business_of(user)

            # fallback: خواندن business_id از JWT claim
            if not business:
                try:
                    rid = validated_token.payload.get('business_id')
                    if rid:
                        from .models import Business
                        business = Business.all_objects.filter(
                            pk=rid, is_active=True
                        ).first()
                except Exception:
                    pass

            if business:
                set_current_business(business)
                request.business = business
        return result