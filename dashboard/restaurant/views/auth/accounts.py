"""
Auth — ثبت‌نام، پروفایل، رمز عبور و لیست کاربران
"""
import logging
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.core.cache import cache

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ...serializers import (
    RegisterSerializer,
    UserDetailSerializer,
    UserListSerializer,
    ProfileSerializer,
    ChangePasswordSerializer,
    ResetPasswordSerializer,
)
from ...auth_services import change_password, register_user, reset_password
from ...roles import get_user_role, ROLE_OWNER, ROLE_MANAGER
from ...utils import api_error, api_success
from .session import _get_restaurant_tabs

logger = logging.getLogger(__name__)


AuthUser = get_user_model()


# ═══════════════════════════════════════
#  Register
# ═══════════════════════════════════════

class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = register_user(ser.validated_data)

        user = result.get("user")
        if not user:
            return api_error(result.get("error", "خطا در ثبت‌نام."))

        if not user.is_approved:
            return api_success(
                data={"pending": True},
                message="ثبت‌نام شما با موفقیت انجام شد. پس از تأیید مدیر می‌توانید وارد شوید.",
                status_code=201,
            )

        return api_success(
            data={
                "user": UserDetailSerializer(user).data,
                "tokens": result.get("tokens"),
            },
            message=result.get("message", "ثبت‌نام موفقیت‌آمیز بود."),
            status_code=201,
        )


# ═══════════════════════════════════════
#  Current User
# ═══════════════════════════════════════

class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        data = UserDetailSerializer(request.user).data
        data['tabs'] = getattr(request.user, 'tabs', {}) or {}
        data['restaurant_tabs'] = _get_restaurant_tabs(request.user)  # ★ جدید
        return api_success(data=data)

    def patch(self, request):
        ser = ProfileSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return api_success(data=ser.data, message="پروفایل بروزرسانی شد.")


# ═══════════════════════════════════════
#  Change Password
# ═══════════════════════════════════════

class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ser = ChangePasswordSerializer(
            data=request.data,
            context={"request": request},
        )
        ser.is_valid(raise_exception=True)
        result = change_password(
            request.user,
            ser.validated_data["old_password"],
            ser.validated_data["new_password"],
        )
        if result["success"]:
            return api_success(message=result["message"])
        return api_error(result["error"])


# ═══════════════════════════════════════
#  Reset Password
# ═══════════════════════════════════════

class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # ★ امنیت: بازنشانی عمومی با شماره موبایل بدون OTP، حمله‌ی تصاحب حساب است.
        # تا زمان اتصال پیامک/OTP، فقط با تنظیم PUBLIC_PASSWORD_RESET_ENABLED فعال می‌شود.
        if not getattr(settings, "PUBLIC_PASSWORD_RESET_ENABLED", False):
            return Response(
                {"error": "بازنشانی رمز فعلاً در دسترس نیست. با مدیر سیستم تماس بگیرید."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        ip = request.META.get("REMOTE_ADDR", "unknown")
        cache_key = f"reset_attempts:{ip}"
        attempts = cache.get(cache_key, 0)
        if attempts >= 3:
            return Response(
                {"error": "تلاش‌های زیاد. ۱۰ دقیقه صبر کنید."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        cache.set(cache_key, attempts + 1, 600)

        ser = ResetPasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        phone = ser.validated_data["phone_number"]
        generic_msg = "اگر این شماره ثبت شده باشد، رمز تغییر خواهد کرد."

        user_exists = AuthUser.objects.filter(
            phone_number=phone,
            is_active=True,
        ).exists()

        if not user_exists:
            return api_success(message=generic_msg)

        result = reset_password(
            phone,
            ser.validated_data["new_password"],
        )
        return api_success(message=generic_msg)


# ═══════════════════════════════════════
#  User List
# ═══════════════════════════════════════

class UserListView(generics.ListAPIView):
    serializer_class = UserListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = AuthUser.objects.all()

        restaurant = getattr(self.request.user, 'restaurant', None)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        elif not self.request.user.is_superuser:
            return qs.none()

        qs = qs.filter(is_approved=True)

        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(phone_number__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        return qs.order_by("-date_joined")


# ═══════════════════════════════════════
#  User Detail
# ═══════════════════════════════════════

class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = AuthUser.objects.all()
        restaurant = getattr(self.request.user, 'restaurant', None)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        elif not self.request.user.is_superuser:
            return qs.none()
        return qs

    def perform_destroy(self, instance):
        if instance.id == self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("نمی‌توانید خودتان را حذف کنید.")

        user_role = get_user_role(self.request.user)
        if user_role not in (ROLE_OWNER, ROLE_MANAGER):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("فقط مدیر و مالک می‌توانند کاربر حذف کنند.")

        if getattr(instance, 'role', '') == ROLE_OWNER:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("مالک قابل حذف نیست.")

        instance.delete()
