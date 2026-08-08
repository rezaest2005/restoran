"""
Authentication views — v7 (★ اصلاح شده)

★ v7 تغییرات:
  1. LoginView: authenticate فقط یکبار
  2. ResetPasswordView: هشدار امنیتی + حداقل بررسی
  3. UserListView: فیلتر is_approved
  4. UserDetailView: بررسی دسترسی حذف
"""

from django.contrib.auth import authenticate, login as django_login, get_user_model
from django.db.models import Q

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken

from ..serializers import (
    CustomTokenObtainSerializer, RegisterSerializer,
    UserDetailSerializer, UserListSerializer,
    ProfileSerializer, ChangePasswordSerializer, ResetPasswordSerializer,
)
from ..auth_services import change_password, register_user, reset_password
from ..roles import get_user_role, ROLE_OWNER, ROLE_MANAGER
from ..utils import api_error, api_success

AuthUser = get_user_model()


# ═══════════════════════════════════════
#  Login — JWT + Django session
# ═══════════════════════════════════════

class LoginView(TokenObtainPairView):
    """JWT + Django session — authenticate فقط یکبار"""
    serializer_class = CustomTokenObtainSerializer

    def post(self, request, *args, **kwargs):
        # ★ FIXED: serializer فقط یکبار صدا زده میشه
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.user

        # Django session بساز
        django_login(
            request, user,
            backend='django.contrib.auth.backends.ModelBackend',
        )

        # JWT بساز
        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserDetailSerializer(user).data,
        }, status=status.HTTP_200_OK)


class RefreshView(TokenRefreshView):
    pass


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
#  Logout
# ═══════════════════════════════════════

class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return api_error("refresh token الزامی است.")
            RefreshToken(refresh_token).blacklist()
            return api_success(message="خروج موفقیت‌آمیز بود.")
        except Exception:
            return api_error("توکن نامعتبر است.")


# ═══════════════════════════════════════
#  Current User
# ═══════════════════════════════════════

class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return api_success(data=UserDetailSerializer(request.user).data)

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
#  ★ هشدار: این endpoint نیاز به OTP دارد
#  ★ فعلاً بدون OTP — باید اضافه شود
# ═══════════════════════════════════════

class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # TODO: ★★★ امنیت بحرانی — این endpoint باید OTP یا تأیید هویت داشته باشد ★★★
        # بدون OTP هر کسی میتونه رمز هر کاربری رو عوض کنه

        ser = ResetPasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        phone = ser.validated_data["phone_number"]

        # حداقل: مطمئن بشیم کاربر وجود داره
        user_exists = AuthUser.objects.filter(
            phone_number=phone,
            is_active=True,
        ).exists()
        if not user_exists:
            # ★ پیام مبهم — نباید فاش بشه که شماره وجود نداره
            return api_success(
                message="اگر این شماره ثبت شده باشد، رمز تغییر خواهد کرد.",
            )

        result = reset_password(
            phone,
            ser.validated_data["new_password"],
        )
        if result["success"]:
            return api_success(message=result["message"])
        return api_error(result["error"])


# ═══════════════════════════════════════
#  User List (API — for management)
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

        # ★ FIXED: فقط کاربران تأیید شده
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

    # ★ FIXED: بررسی دسترسی حذف
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


# ═══════════════════════════════════════
#  Set Session
# ═══════════════════════════════════════

class SetSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        django_login(
            request, request.user,
            backend='django.contrib.auth.backends.ModelBackend',
        )
        return api_success(data={
            'user_id': request.user.pk,
            'username': request.user.username,
            'role': getattr(request.user, 'role', ''),
        })