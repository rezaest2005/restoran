"""
Dashboard — بسته‌بندی شده؛ نام‌ها دوباره export می‌شوند.
"""
from .analytics import dashboard_analytics
from .setup import business_checklist, business_setup, industry_catalog
from .summary import dashboard_summary

__all__ = ["dashboard_analytics", "dashboard_summary", "business_setup", "business_checklist", "industry_catalog"]
