"""
Django settings for core project.
"""

from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured
import os

BASE_DIR = Path(__file__).resolve().parent.parent

PROJECT_ROOT = BASE_DIR.parent
load_dotenv(PROJECT_ROOT / '.env')

DEBUG = os.getenv('DEBUG', 'True') == 'True'

# ---------- امنیت: SECRET_KEY اجباری در حالت production ----------
_secret = os.getenv('SECRET_KEY')
if not _secret:
    if DEBUG:
        _secret = 'django-insecure-dev-only-do-not-use-in-production'
    else:
        raise ImproperlyConfigured(
            'SECRET_KEY must be set in .env when DEBUG=False'
        )
SECRET_KEY = _secret

CSRF_TRUSTED_ORIGINS = os.getenv(
    'CSRF_TRUSTED_ORIGINS',
    'http://localhost:8000,http://127.0.0.1:8000,https://est.rysh.ir'
).split(',')

if DEBUG:
    ALLOWED_HOSTS = ['*']
else:
    ALLOWED_HOSTS = os.getenv(
        'ALLOWED_HOSTS', 'localhost,127.0.0.1,est.rysh.ir'
    ).split(',')

AUTH_USER_MODEL = 'restaurant.User'

CARD_READER_IP = os.getenv('CARD_READER_IP', '192.168.1.100')
CARD_READER_PORT = int(os.getenv('CARD_READER_PORT', '8080'))
# timeout کوتاه برای تماس با کارتخوان تا worker گیر نکند
CARD_READER_TIMEOUT = int(os.getenv('CARD_READER_TIMEOUT', '10'))

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',  # لازم برای BLACKLIST_AFTER_ROTATION
    'restaurant',
    'django.contrib.humanize',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'restaurant.middleware.TenantJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'restaurant.utils.custom_exception_handler',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'TOKEN_OBTAIN_SERIALIZER': 'restaurant.serializers.CustomTokenObtainSerializer',
}

# ---------- CORS: فقط origin های مشخص (نه همه) ----------
CORS_ALLOWED_ORIGINS = os.getenv(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:8000,http://127.0.0.1:8000,https://est.rysh.ir'
).split(',')
CORS_ALLOW_CREDENTIALS = True

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'restaurant.middleware.JWTFromCookieMiddleware',
    'restaurant.middleware.TenantMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'restaurant' / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'restaurant.context_processors.user_permissions_context',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "restaurant"),
        "USER": os.getenv("DB_USER", "restaurant"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5433"),
        # اتصال‌ها ۵ دقیقه زنده می‌مانند (به‌جای بسته‌شدن بعد از هر درخواست)
        "CONN_MAX_AGE": 300,
        "OPTIONS": {
            "connect_timeout": 5,
        },
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Tehran'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [
    BASE_DIR / 'restaurant' / 'static',
]

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

JAZZMIN_UI_TWEAKS = {
    "theme": "flatly",
    "dark_mode_theme": "darkly",
    "navbar": "navbar-dark",
    "sidebar": "sidebar-dark-warning",
    "navbar_fixed": True,
    "sidebar_fixed": True,
}

CSRF_COOKIE_HTTPONLY = False
SESSION_COOKIE_HTTPONLY = False

SESSION_EXPIRE_AT_BROWSER_CLOSE = True
# هر درخواست = یک نوشتن در دیتابیس؛ فقط در صورت نیاز واقعی True کنید
SESSION_SAVE_EVERY_REQUEST = False
SESSION_COOKIE_AGE = 86400 * 7

LOGIN_URL = '/dashboard/'
LOGIN_REDIRECT_URL = '/dashboard/app/'

TENANT_NON_SLUGS = {"accounts", "login", "logout"}
TENANT_CACHE_TTL = 30

# Proxy / Cloudflare SSL
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = False