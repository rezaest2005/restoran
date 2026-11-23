"""Signal hooks that feed the change log. They only observe; they never alter the saved objects."""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from ..models import Category, Customer, Food, InventoryMovement, Order, OrderItem
from . import changelog as log


@receiver(post_save, sender=Category, dispatch_uid="sync_category_save")
def _category_saved(sender, instance, raw=False, **kw):
    if not raw:
        log.touch(instance.business_id, "category", instance.pk)


@receiver(post_delete, sender=Category, dispatch_uid="sync_category_del")
def _category_deleted(sender, instance, **kw):
    log.tombstone(instance.business_id, "category", instance.pk)


@receiver(post_save, sender=Food, dispatch_uid="sync_food_save")
def _food_saved(sender, instance, raw=False, **kw):
    if not raw:
        log.touch(instance.business_id, "product", instance.pk)


@receiver(post_delete, sender=Food, dispatch_uid="sync_food_del")
def _food_deleted(sender, instance, **kw):
    log.tombstone(instance.business_id, "product", instance.pk)


@receiver(post_save, sender=Customer, dispatch_uid="sync_customer_save")
def _customer_saved(sender, instance, raw=False, **kw):
    if not raw:
        log.touch(instance.business_id, "customer", instance.pk)


@receiver(post_delete, sender=Customer, dispatch_uid="sync_customer_del")
def _customer_deleted(sender, instance, **kw):
    log.tombstone(instance.business_id, "customer", instance.pk)


@receiver(post_save, sender=Order, dispatch_uid="sync_order_save")
def _order_saved(sender, instance, raw=False, created=False, **kw):
    if raw:
        return
    log.touch(instance.business_id, "order", instance.pk)
    if not created and instance.status == "cancelled":           # its stock went back
        for fid in OrderItem.all_objects.filter(order_id=instance.pk, food__isnull=False).values_list("food_id", flat=True):
            log.touch(instance.business_id, "product", fid)


@receiver(post_delete, sender=Order, dispatch_uid="sync_order_del")
def _order_deleted(sender, instance, **kw):
    log.tombstone(instance.business_id, "order", instance.pk)


@receiver(post_save, sender=OrderItem, dispatch_uid="sync_orderitem_save")
def _item_saved(sender, instance, raw=False, created=False, **kw):
    if raw:
        return
    log.touch(instance.business_id, "order", instance.order_id)
    if created and instance.food_id:
        log.touch(instance.business_id, "product", instance.food_id)    # a sale lowers its stock


@receiver(post_save, sender=InventoryMovement, dispatch_uid="sync_movement_save")
def _movement_saved(sender, instance, raw=False, created=False, **kw):
    if not raw and created:
        log.touch_products_of_items(instance.business_id, [instance.raw_material_id])
