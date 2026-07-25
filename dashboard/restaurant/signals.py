"""
Restaurant — Signals for Recipe Engine
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Order, Recipe


@receiver(post_save, sender=Order)
def order_status_changed(sender, instance, created, **kwargs):
    """وقتی وضعیت سفارش completed شد → کسر خودکار انبار"""
    if not created and instance.status == 'completed':
        from .recipe_services import deduct_inventory_for_order
        try:
            deduct_inventory_for_order(instance)
        except Exception as e:
            print(f'خطا در کسر انبار سفارش #{instance.id}: {e}')


@receiver(post_save, sender=Recipe)
def recipe_saved(sender, instance, created, **kwargs):
    """وقتی ریسیپت ذخیره شد → محاسبه مجدد هزینه"""
    if not created:
        try:
            instance.recalculate_cost()
        except Exception as e:
            print(f'خطا در محاسبه هزینه ریسیپت #{instance.id}: {e}')
