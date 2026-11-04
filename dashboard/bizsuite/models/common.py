"""Shared constants and field factories for the business models."""

from __future__ import annotations

import json
from decimal import Decimal

from django.db import models
import django


# ═══════════════════════════════════════════
#  ثابت‌ها و ابزارهای مشترک
# ═══════════════════════════════════════════

UNIT_CHOICES = [
    ("kg", "کیلوگرم"),
    ("g", "گرم"),
    ("l", "لیتر"),
    ("ml", "میلی‌لیتر"),
    ("unit", "عدد"),
    ("bunch", "دسته"),
    ("pack", "بسته"),
]


UNIT_MAX_LENGTH = 10


def check_constraint(condition, name):
    """CheckConstraint سازگار با Django قبل و بعد از 5.1 (check → condition)."""
    if django.VERSION >= (5, 1):
        return models.CheckConstraint(condition=condition, name=name)
    return models.CheckConstraint(check=condition, name=name)


class DecimalSafeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        if isinstance(obj, models.Model):
            return obj.pk
        return super().default(obj)


# ═══════════════════════════════════════════
#  فیلدهای مشترک
# ═══════════════════════════════════════════


def unit_field(**kwargs):
    defaults = {
        "max_length": UNIT_MAX_LENGTH,
        "choices": UNIT_CHOICES,
        "verbose_name": "واحد",
    }
    defaults.update(kwargs)
    return models.CharField(**defaults)


def name_field(max_length=200, verbose_name="نام", **kwargs):
    defaults = {
        "max_length": max_length,
        "verbose_name": verbose_name,
        "db_index": True,
    }
    defaults.update(kwargs)
    return models.CharField(**defaults)


def price_field(max_digits=12, decimal_places=0, verbose_name="قیمت (تومان)", **kwargs):
    defaults = {
        "max_digits": max_digits,
        "decimal_places": decimal_places,
        "verbose_name": verbose_name,
    }
    defaults.update(kwargs)
    return models.DecimalField(**defaults)


def qty_field(max_digits=10, decimal_places=0, verbose_name="مقدار", **kwargs):
    defaults = {
        "max_digits": max_digits,
        "decimal_places": decimal_places,
        "verbose_name": verbose_name,
    }
    defaults.update(kwargs)
    return models.DecimalField(**defaults)


def phone_field(max_length=20, verbose_name="تلفن", **kwargs):
    defaults = {"max_length": max_length, "verbose_name": verbose_name, "blank": True}
    defaults.update(kwargs)
    return models.CharField(**defaults)


def description_field(verbose_name="توضیحات", **kwargs):
    defaults = {"verbose_name": verbose_name, "blank": True}
    defaults.update(kwargs)
    return models.TextField(**defaults)


def is_active_field(**kwargs):
    defaults = {"default": True, "verbose_name": "فعال"}
    defaults.update(kwargs)
    return models.BooleanField(**defaults)


def created_at_field(**kwargs):
    defaults = {"auto_now_add": True, "verbose_name": "تاریخ ایجاد"}
    defaults.update(kwargs)
    return models.DateTimeField(**defaults)


def updated_at_field(**kwargs):
    defaults = {"auto_now": True, "verbose_name": "تاریخ بروزرسانی"}
    defaults.update(kwargs)
    return models.DateTimeField(**defaults)
