"""Single source of truth for the product identity (backend side)."""

import os

APP_NAME = os.getenv("APP_NAME", "Business Suite")
APP_NAME_FA = os.getenv("APP_NAME_FA", "سامانه جامع کسب‌وکار")
APP_SLUG = "business-suite"
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")
