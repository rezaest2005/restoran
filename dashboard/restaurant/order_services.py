"""سرویس‌های مشترک سفارش."""

from django.db.models import F

from .models import Food, OrderItem


def restore_order_stock(order):
    """
    بازگرداندن موجودی محصولات یک سفارش لغوشده.
    موجودی هنگام ثبت سفارش کم می‌شود؛ با لغو/رد باید برگردد.
    """
    items = OrderItem.all_objects.filter(order_id=order.pk, food__isnull=False)
    for item in items:
        Food.all_objects.filter(pk=item.food_id).update(stock=F("stock") + item.quantity)
