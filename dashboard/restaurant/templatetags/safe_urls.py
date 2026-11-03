"""وسم قالب برای لینک‌هایی که ممکن است مسیرشان دیگر وجود نداشته باشد (واجهه‌ی قدیمی Django)."""

from django import template
from django.urls import NoReverseMatch, reverse

register = template.Library()


@register.simple_tag
def safe_url(view_name, *args, **kwargs):
    """مثل {% url %} اما اگر مسیر پیدا نشد به‌جای خطای ۵۰۰، '#' برمی‌گرداند."""
    try:
        return reverse(view_name, args=args, kwargs=kwargs)
    except NoReverseMatch:
        return "#"
