"""
super_admin — بسته‌بندی شده؛ همهٔ نام‌ها دوباره export می‌شوند.
"""
from .auth import (
    SUPER_TOKEN_SALT,
    SUPER_TOKEN_COOKIE,
    SUPER_TOKEN_MAX_AGE,
    _verify_super_token,
    _is_super_admin,
    _super_admin_required,
    IsSuperAdmin,
    _make_super_token,
    _set_super_cookie,
    super_admin_auth_page,
    super_admin_page,
    super_admin_login_api,
    super_admin_logout_api,
)
from .tenants import (
    _clean_phone,
    _tenant_to_dict,
    super_stats_api,
    super_tenants_api,
)
from .users import (
    super_users_api,
    super_section_prices_api,
    super_user_create_api,
    super_user_detail_api,
)

__all__ = [
    "SUPER_TOKEN_SALT",
    "SUPER_TOKEN_COOKIE",
    "SUPER_TOKEN_MAX_AGE",
    "_verify_super_token",
    "_is_super_admin",
    "_super_admin_required",
    "IsSuperAdmin",
    "_make_super_token",
    "_set_super_cookie",
    "super_admin_auth_page",
    "super_admin_page",
    "super_admin_login_api",
    "super_admin_logout_api",
    "_clean_phone",
    "_tenant_to_dict",
    "super_stats_api",
    "super_tenants_api",
    "super_users_api",
    "super_section_prices_api",
    "super_user_create_api",
    "super_user_detail_api",
]
