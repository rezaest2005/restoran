"""
Authentication views.
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
    serializer_class = CustomTokenObtainSerializer


class RefreshView(TokenRefreshView):
    pass


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = register_user(ser.validated_data)
        if not result["user"].is_approved:
            return api_success(
                data={"pending": True},
                message="ثبت‌نام شما با موفقیت انجام شد. پس از تأیید مدیر می‌توانید وارد شوید.",
                status_code=201,
            )
        return api_success(
            data={
                "user": UserDetailSerializer(result["user"]).data,
                "tokens": result["tokens"],
            },
            message=result["message"],
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
        result = change_password(request.user, ser.validated_data["old_password"], ser.validated_data["new_password"])
        if result["success"]:
            return api_success(message=result["message"])
        return api_error(result["error"])


class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        ser = ResetPasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = reset_password(ser.validated_data["phone_number"], ser.validated_data["new_password"])
        if result["success"]:
            return api_success(message=result["message"])
        return api_error(result["error"])


class UserListView(generics.ListAPIView):
    serializer_class = UserListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = AuthUser.objects.filter(restaurant=self.request.user.restaurant)
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q
            qs = qs.filter(Q(username__icontains=search) | Q(phone_number__icontains=search))
        return qs


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return AuthUser.objects.filter(restaurant=self.request.user.restaurant)


class SetSessionView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        access_token = request.data.get('access_token')
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'success': False}, status=400)
        try:
            from ..models import User
            user = User.objects.get(id=user_id)
            login(request, user, backend='django.contrib.auth.backends.ModelBackend')
            return Response({'success': True})
        except Exception:
            return Response({'success': False, 'error': 'کاربر یافت نشد'}, status=404)