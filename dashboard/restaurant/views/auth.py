"""
Authentication views.

★ تغییرات نسبت به نسخه قبل:
  ۱. SetSessionView: حذف import داخلی — استفاده از AuthUser
  ۲. RegisterView: بررسی دقیق‌تر خروجی register_user
  ۳. UserListView: مدیریت کاربر بدون restaurant
  ۴. بهبود خطاهای validation و پیام‌ها
  ۵. اضافه شدن امنیت به SetSessionView (فقط superuser)
"""

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.contrib.auth import login, get_user_model

from ..serializers import (
    CustomTokenObtainSerializer, RegisterSerializer,
    UserDetailSerializer, UserListSerializer,
    ProfileSerializer, ChangePasswordSerializer, ResetPasswordSerializer,
)
from ..auth_services import change_password, register_user, reset_password
from ..utils import api_error, api_success

AuthUser = get_user_model()


class LoginView(TokenObtainPairView):
    """JWT + Django session — هر دو ساخته می‌شه"""
    serializer_class = CustomTokenObtainSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            user = serializer.user
            from django.contrib.auth import login as django_login
            django_login(request, user, backend='django.contrib.auth.backends.ModelBackend')
        return response
    
class RefreshView(TokenRefreshView):
    pass


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


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return api_error("refresh token الزامی است.")
            from rest_framework_simplejwt.tokens import RefreshToken
            RefreshToken(refresh_token).blacklist()
            return api_success(message="خروج موفقیت‌آمیز بود.")
        except Exception:
            return api_error("توکن نامعتبر است.")


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return api_success(data=UserDetailSerializer(request.user).data)

    def patch(self, request):
        ser = ProfileSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return api_success(data=ser.data, message="پروفایل بروزرسانی شد.")


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        result = change_password(
            request.user,
            ser.validated_data["old_password"],
            ser.validated_data["new_password"],
        )
        if result["success"]:
            return api_success(message=result["message"])
        return api_error(result["error"])


class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        ser = ResetPasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = reset_password(
            ser.validated_data["phone_number"],
            ser.validated_data["new_password"],
        )
        if result["success"]:
            return api_success(message=result["message"])
        return api_error(result["error"])


class UserListView(generics.ListAPIView):
    serializer_class = UserListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = AuthUser.objects.all()

        # ★ FIXED: بررسی وجود restaurant قبل از فیلتر
        restaurant = getattr(self.request.user, 'restaurant', None)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        elif not self.request.user.is_superuser:
            # کاربر عادی بدون رستوران = هیچ‌چیز نبیند
            return qs.none()

        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)

        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(phone_number__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        return qs.order_by("-created_at")


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


class SetSessionView(APIView):
    """
    ★ FIXED: فقط superuser می‌تواند session بسازد.
    برای سناریوهای خاص مثل SSO یا پنل مدیریت.
    """
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        user_id = request.data.get('user_id')
        if not user_id:
            return api_error('user_id الزامی است.')
        try:
            user = AuthUser.objects.get(pk=user_id, is_active=True)
            login(request, user, backend='django.contrib.auth.backends.ModelBackend')
            return api_success(data={
                'user_id': user.pk,
                'username': user.username,
                'role': user.role,
            })
        except AuthUser.DoesNotExist:
            return api_error('کاربر یافت نشد.', status_code=404)