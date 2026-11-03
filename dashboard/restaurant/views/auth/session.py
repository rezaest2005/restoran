"""
Auth — ورود، refresh، خروج و سشن
"""
import logging
from django.contrib.auth import login as django_login
from django.core.cache import cache

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken

from ...serializers import CustomTokenObtainSerializer, UserDetailSerializer
from ...utils import api_error, api_success

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  ★ helper: تب‌های مجاز رستوران
# ═══════════════════════════════════════

def _get_restaurant_tabs(user):
    """تب‌های مجاز رستوران کاربر — از Restaurant.dashboard_permissions"""
    rest = getattr(user, 'restaurant', None)
    if rest:
        return list(rest.dashboard_permissions or [])
    return []


# ═══════════════════════════════════════
#  Login — JWT + Django session
# ═══════════════════════════════════════

class LoginView(TokenObtainPairView):
    """JWT + Django session — authenticate فقط یکبار"""
    serializer_class = CustomTokenObtainSerializer

    def post(self, request, *args, **kwargs):
        # ★ Rate limit: حداکثر 5 تلاش در 5 دقیقه از هر IP
        ip = self._get_client_ip(request)
        cache_key = f"login_attempts:{ip}"
        attempts = cache.get(cache_key, 0)
        if attempts >= 5:
            return Response(
                {"error": "تلاش‌های زیاد. ۵ دقیقه صبر کنید."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        cache.set(cache_key, attempts + 1, 300)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.user

        # Django session بساز
        django_login(
            request, user,
            backend='django.contrib.auth.backends.ModelBackend',
        )

        # ★★★ مدیریت شمارنده دمو ★★★
        if user.demo_logins_remaining > 0:
            request.session['show_demo'] = True
            user.demo_logins_remaining -= 1
            user.save(update_fields=['demo_logins_remaining'])
        else:
            request.session['show_demo'] = False

        # JWT بساز
        refresh = RefreshToken.for_user(user)

        # ★ ریست شمارنده بعد از لاگین موفق
        cache.delete(cache_key)

        # ★★★ tabs + restaurant_tabs به response ★★★
        user_data = UserDetailSerializer(user).data
        user_data['tabs'] = getattr(user, 'tabs', {}) or {}
        user_data['restaurant_tabs'] = _get_restaurant_tabs(user)   # ★ جدید

        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": user_data,
        }, status=status.HTTP_200_OK)

    @staticmethod
    def _get_client_ip(request):
        x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded:
            return x_forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "unknown")


class RefreshView(TokenRefreshView):
    pass


# ═══════════════════════════════════════
#  Session Check
# ═══════════════════════════════════════

class SessionCheckView(APIView):
    """
    ★ فرانت قبل از render هر صفحه‌ای صدا میزنه
      اگه session/token نامعتبر باشه → 401 → فرانت بره صفحه لاگین
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            "success": True,
            "session_alive": True,
            "user_id": user.id,
            "username": user.username,
            "role": getattr(user, "role", ""),
            "tabs": getattr(user, "tabs", {}) or {},
            "is_superuser": user.is_superuser,
            "restaurant_tabs": _get_restaurant_tabs(user),          # ★ جدید
        })


# ═══════════════════════════════════════
#  Logout
# ═══════════════════════════════════════

class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.contrib.auth import logout as django_logout

        try:
            refresh_token = request.data.get("refresh")
            if refresh_token:
                try:
                    RefreshToken(refresh_token).blacklist()
                except Exception:
                    pass
        except Exception:
            pass

        django_logout(request)
        request.session.flush()

        response = api_success(message="خروج موفقیت‌آمیز بود.")

        response.delete_cookie('super_admin_token', path='/')
        response.delete_cookie('sessionid', path='/')
        response.delete_cookie('csrftoken', path='/')

        response['Cache-Control'] = 'no-store, no-cache, must-revalidate'
        response['Pragma'] = 'no-cache'

        return response


# ═══════════════════════════════════════
#  Set Session
# ═══════════════════════════════════════

class SetSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if not user.is_active:
            return api_error("حساب کاربری غیرفعال است.")

        if hasattr(user, 'is_approved') and not user.is_approved:
            return api_error("حساب شما هنوز تأیید نشده است.")

        django_login(
            request, user,
            backend='django.contrib.auth.backends.ModelBackend',
        )
        return api_success(data={
            'user_id': user.pk,
            'username': user.username,
            'role': getattr(user, 'role', ''),
            'tabs': getattr(user, 'tabs', {}) or {},
            'restaurant_tabs': _get_restaurant_tabs(user),    # ★ جدید
        })
