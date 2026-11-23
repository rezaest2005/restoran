"""Which entities are synced, who may read them, and how a row is serialized for the client."""
import datetime
from dataclasses import dataclass
from decimal import Decimal
from typing import Callable

from django.utils import timezone

from ..catalog_services import sales_stock_map
from ..features import has_feature, service_allowed
from ..models import Category, Customer, Food, Order, OrderItem
from . import config
from .models import SyncReceipt


def _num(d):
    d = Decimal(d or 0)
    return int(d) if d == d.to_integral_value() else float(d)


def ser_categories(business, user, rows):
    return {c.pk: {"id": c.pk, "name": c.name, "name_en": c.name_en, "order": c.order, "is_active": c.is_active}
            for c in rows}


def ser_products(business, user, rows):
    rows = list(rows)
    item_ids = {f.item_id for f in rows if f.item_id}
    stock = sales_stock_map(business, item_ids) if item_ids else {}
    out = {}
    for f in rows:
        eff = stock.get(f.item_id, Decimal("0")) if f.item_id else Decimal(f.stock or 0)
        out[f.pk] = {
            "id": f.pk, "name": f.name, "name_en": f.name_en, "category_id": f.category_id,
            "price": _num(f.price), "final_price": _num(f.final_price), "is_available": f.is_available,
            "image": f.image.url if f.image else "", "barcode": f.barcode, "order": f.order,
            "stock": _num(eff), "linked": bool(f.item_id),
        }
    return out


def ser_customers(business, user, rows):
    # the running debt is accounting data: it stays on the server
    return {c.pk: {"id": c.pk, "name": c.name, "phone": c.phone, "address": c.address, "note": c.note,
                   "is_active": c.is_active} for c in rows}


def ser_orders(business, user, rows):
    rows = list(rows)
    ids = [o.pk for o in rows]
    items = {}
    for it in OrderItem.all_objects.filter(order_id__in=ids).order_by("pk"):
        items.setdefault(it.order_id, []).append({
            "food_id": it.food_id, "name": it.item_name, "name_en": it.item_name_en,
            "quantity": it.quantity, "price": _num(it.price)})
    uuids = dict(SyncReceipt.objects.filter(business=business, kind="order.create", status="ok", server_id__in=ids)
                 .values_list("server_id", "entity_id"))
    return {o.pk: {
        "id": o.pk, "client_uuid": uuids.get(o.pk, ""), "customer_name": o.customer_name,
        "customer_name_en": o.customer_name_en, "phone": o.phone, "total_price": _num(o.total_price),
        "status": o.status, "source": o.source, "payment_method": o.payment_method,
        "payment_status": o.payment_status, "order_type": o.order_type, "delivery_address": o.delivery_address,
        "created_at": timezone.localtime(o.created_at).isoformat(), "items": items.get(o.pk, []),
    } for o in rows}


def order_cutoff(user):
    """Today only, unless the user holds the 'previous days' action permission."""
    if has_feature(user, "pos_past_days"):
        return timezone.now() - datetime.timedelta(days=config.ORDER_WINDOW_DAYS)
    return timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)


@dataclass(frozen=True)
class Entity:
    name: str
    model: type
    services: tuple                # any-of backend service codes (same chain as the tabs)
    serialize: Callable
    select_related: tuple = ()
    windowed: bool = False         # orders: only a recent window is kept on the device


ENTITIES = {e.name: e for e in (
    Entity("category", Category, ("pos", "inventory", "dictionary_menu"), ser_categories),
    Entity("product", Food, ("pos", "inventory", "dictionary_menu"), ser_products),
    Entity("customer", Customer, ("pos", "club", "accounting", "inventory", "dictionary_customers"), ser_customers),
    Entity("order", Order, ("pos",), ser_orders, windowed=True),
)}
ORDER = ["category", "product", "customer", "order"]       # snapshot order (categories before the products using them)


def allowed_entities(user):
    return [n for n in ORDER if service_allowed(user, list(ENTITIES[n].services))]


def base_queryset(entity, business, user):
    e = ENTITIES[entity]
    qs = e.model.all_objects.filter(business=business)
    if e.windowed:
        qs = qs.filter(created_at__gte=order_cutoff(user))
    return qs
