"""
Restaurant — Authentication Services

★ تغییرات نسبت به نسخه قبل:
  ۱. register_user: اعتبارسنجی رمز عبور قبل از ایجاد کاربر
  ۲. register_user: بررسی تکراری بودن username و phone_number
  ۳. reset_password: اعتبارسنجی رمز عبور جدید
  ۴. change_password: اعتبارسنجی رمز عبور جدید
  ۵. اضافه شدن __all__
  ۶. type hints کامل‌تر
"""

from typing import Dict, Any

from django.contrib.auth import get_user_model
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Restaurant

User = get_user_model()

__all__ = [
    'register_user', 'get_tokens_for_user',
    'change_password', 'reset_password',
]


def register_user(data: dict) -> Dict[str, Any]:
    """
    ثبت‌نام کاربر جدید.

    خروجی:
        {'success': True, 'message': ..., 'user': ..., 'tokens': ...}
        یا
        {'success': False, 'error': ...}
    """
    username = data.get('username', '').strip()
    phone = data.get('phone_number')
    password = data.get('password')

    # ★ FIXED: بررسی تکراری بودن
    if User.objects.filter(username=username).exists():
        return {'success': False, 'error': 'این نام کاربری قبلاً وجود دارد.'}

    if phone and User.objects.filter(phone_number=phone).exists():
        return {'success': False, 'error': 'این شماره موبایل قبلاً ثبت شده.'}

    # ★ FIXED: اعتبارسنجی رمز عبور قبل از create
    try:
        password_validation.validate_password(password)
    except DjangoValidationError as e:
        return {'success': False, 'error': ' '.join(e.messages)}

    with transaction.atomic():
        user = User.objects.create_user(
            username=username,
            phone_number=phone,
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
            email=data.get('email', ''),
            password=password,
            role=data.get('role', User.Role.CUSTOMER),
            restaurant=data.get('restaurant'),
        )

        tokens = get_tokens_for_user(user)

        return {
            'success': True,
            'message': 'ثبت‌نام با موفقیت انجام شد.',
            'user': user,
            'tokens': tokens,
        }


def get_tokens_for_user(user) -> Dict[str, str]:
    """ساخت JWT tokens برای کاربر"""
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }


def change_password(user, old_password: str, new_password: str) -> Dict[str, Any]:
    """
    تغییر رمز عبور — نیاز به رمز فعلی.

    خروجی:
        {'success': True, 'message': ...}
        یا
        {'success': False, 'error': ...}
    """
    if not user.check_password(old_password):
        return {'success': False, 'error': 'رمز عبور فعلی اشتباه است.'}

    # ★ FIXED: اعتبارسنجی رمز عبور جدید
    try:
        password_validation.validate_password(new_password, user=user)
    except DjangoValidationError as e:
        return {'success': False, 'error': ' '.join(e.messages)}

    user.set_password(new_password)
    user.save(update_fields=['password'])
    return {'success': True, 'message': 'رمز عبور با موفقیت تغییر کرد.'}


def reset_password(phone_number: str, new_password: str) -> Dict[str, Any]:
    """
    بازنشانی رمز عبور — فقط با شماره موبایل.

    خروجی:
        {'success': True, 'message': ...}
        یا
        {'success': False, 'error': ...}
    """
    user = User.objects.filter(phone_number=phone_number).first()
    if not user:
        return {'success': False, 'error': 'کاربری با این شماره یافت نشد.'}

    # ★ FIXED: اعتبارسنجی رمز عبور جدید
    try:
        password_validation.validate_password(new_password, user=user)
    except DjangoValidationError as e:
        return {'success': False, 'error': ' '.join(e.messages)}

    user.set_password(new_password)
    user.save(update_fields=['password'])
    return {'success': True, 'message': 'رمز عبور با موفقیت تغییر کرد.'}