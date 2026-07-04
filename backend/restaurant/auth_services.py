"""
Restaurant — Authentication Services
"""
from django.contrib.auth import get_user_model
from django.contrib.auth import password_validation
from django.db import transaction
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Restaurant

User = get_user_model()


def register_user(data: dict) -> dict:
    with transaction.atomic():
        user = User.objects.create_user(
            username=data['username'],
            phone_number=data.get('phone_number'),
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
            email=data.get('email', ''),
            password=data['password'],
            role=data.get('role', User.Role.CUSTOMER),
            restaurant=data.get('restaurant'),
        )
        tokens = get_tokens_for_user(user)
        return {'success': True, 'message': 'ثبت‌نام با موفقیت انجام شد.', 'user': user, 'tokens': tokens}


def get_tokens_for_user(user) -> dict:
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def change_password(user, old_password: str, new_password: str) -> dict:
    if not user.check_password(old_password):
        return {'success': False, 'error': 'رمز عبور فعلی اشتباه است.'}
    user.set_password(new_password)
    user.save(update_fields=['password'])
    return {'success': True, 'message': 'رمز عبور با موفقیت تغییر کرد.'}


def reset_password(phone_number: str, new_password: str) -> dict:
    user = User.objects.filter(phone_number=phone_number).first()
    if not user:
        return {'success': False, 'error': 'کاربری با این شماره یافت نشد.'}
    user.set_password(new_password)
    user.save(update_fields=['password'])
    return {'success': True, 'message': 'رمز عبور با موفقیت تغییر کرد.'}
