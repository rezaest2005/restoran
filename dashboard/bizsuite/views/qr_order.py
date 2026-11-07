"""
سفارش با QR — مشتری از روی میز QR را اسکن می‌کند، سفارش می‌دهد و سفارش
در صندوق (سفارش‌های ورودی) نمایش داده می‌شود.

نکات امنیتی:
  - endpoint عمومی است (بدون ورود)؛ فقط با slug کسب‌وکار فعال کار می‌کند.
  - قیمت‌ها هرگز از کلاینت خوانده نمی‌شود؛ از دیتابیس می‌آید.
  - محدودیت تعداد درخواست برای هر IP + honeypot ضد ربات.
"""

import logging
import re
from decimal import InvalidOperation

from django.core.cache import cache
from django.db import transaction
from rest_framework import status as http
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny

from ..catalog_services import product_available_stock
from ..models import Food, Order, OrderItem, Business
from ..order_services import reserve_product_stock
from ..modules import module_enabled
from ..utils import api_error, api_success
from .common import client_ip

logger = logging.getLogger(__name__)

MAX_LINES = 30
MAX_QTY = 50
RATE_LIMIT = 10          # حداکثر سفارش
RATE_WINDOW = 600        # در هر ۱۰ دقیقه برای هر IP
_TABLE_RE = re.compile(r"^[\w\-؀-ۿ ]{1,20}$")


def _unit_price(food):
    """قیمت نهایی از دیتابیس (با تخفیف)."""
    for raw in (food.final_price, food.price):
        try:
            value = int(raw or 0)
        except (ValueError, TypeError, InvalidOperation):
            value = 0
        if value > 0:
            return value
    return 0


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def qr_order_submit(request):
    data = request.data

    # honeypot — ربات‌ها این فیلد مخفی را پر می‌کنند
    if (data.get("website") or "").strip():
        return api_success(message="سفارش ثبت شد.")

    ip = client_ip(request)
    cache_key = f"qr_order:{ip}"
    count = cache.get(cache_key, 0)
    if count >= RATE_LIMIT:
        return api_error(
            "تعداد سفارش‌ها زیاد است. چند دقیقه بعد دوباره تلاش کنید.",
            status_code=http.HTTP_429_TOO_MANY_REQUESTS,
        )

    slug = (data.get("business_slug") or "").strip()
    business = Business.objects.filter(slug=slug, is_active=True).first() if slug else None
    if not business:
        return api_error("کسب‌وکار پیدا نشد.", status_code=http.HTTP_404_NOT_FOUND)
    if not module_enabled(business, "pos"):
        # ordering needs the point-of-sale module (the cashier receives the order)
        return api_error("سفارش آنلاین برای این کسب‌وکار فعال نیست.",
                         status_code=http.HTTP_404_NOT_FOUND)

    table = str(data.get("table") or "").strip()
    if table and not _TABLE_RE.match(table):
        return api_error("شماره میز نامعتبر است.")

    customer_name = str(data.get("customer_name") or "").strip()[:200]
    phone = str(data.get("phone") or "").strip()[:20]
    note = str(data.get("note") or "").strip()[:300]

    raw_items = data.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        return api_error("هیچ محصولی انتخاب نشده است.")
    if len(raw_items) > MAX_LINES:
        return api_error("تعداد اقلام سفارش زیاد است.")

    # تجمیع آیتم‌های تکراری + اعتبارسنجی
    wanted = {}
    for item in raw_items:
        try:
            food_id = int(item.get("food_id"))
            qty = int(item.get("quantity", 1))
        except (AttributeError, TypeError, ValueError):
            return api_error("اطلاعات اقلام نامعتبر است.")
        if food_id <= 0 or qty <= 0 or qty > MAX_QTY:
            return api_error("تعداد یا شناسه‌ی محصول نامعتبر است.")
        wanted[food_id] = wanted.get(food_id, 0) + qty

    foods = {
        f.id: f
        for f in Food.all_objects.filter(
            id__in=wanted.keys(), business=business, is_available=True
        )
    }
    missing = [fid for fid in wanted if fid not in foods]
    if missing:
        return api_error("یکی از محصولات انتخاب‌شده موجود نیست.")

    lines = []
    for fid, qty in wanted.items():
        food = foods[fid]
        price = _unit_price(food)
        if price <= 0:
            return api_error(f"قیمت «{food.name}» تعریف نشده است.")
        if qty > product_available_stock(food):
            return api_error(f"موجودی «{food.name}» کافی نیست.")
        lines.append((food, qty, price))

    try:
        with transaction.atomic():
            order = Order.objects.create(
                business=business,
                customer_name=customer_name or "مشتری",
                phone=phone,
                table_number=table,
                customer_note=note,
                status="pending",
                source="qr",
                payment_method="cash",
                payment_status="pending",
                total_price=0,
            )
            for food, qty, price in lines:
                OrderItem.objects.create(
                    business=business,
                    order=order,
                    food=food,
                    item_name=food.name,
                    item_name_en=food.name_en or "",
                    quantity=qty,
                    price=price,
                )
            reserve_product_stock([(f, q) for f, q, _p in lines], order=order)
            order.recalculate_total()
    except ValueError as exc:
        return api_error(str(exc))
    except Exception:
        logger.exception("QR order failed")
        return api_error("ثبت سفارش ناموفق بود. دوباره تلاش کنید.",
                         status_code=http.HTTP_500_INTERNAL_SERVER_ERROR)

    cache.set(cache_key, count + 1, RATE_WINDOW)
    return api_success(
        data={
            "order_id": order.id,
            "table": table,
            "total_price": int(order.total_price),
        },
        message="سفارش شما ثبت شد و برای صندوق ارسال شد.",
        status_code=http.HTTP_201_CREATED,
    )
