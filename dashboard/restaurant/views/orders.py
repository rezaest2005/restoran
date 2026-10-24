"""
Orders API — سفارشات (★ نسخه v6 — cleanup)
"""

import logging

from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes

from ..models import Order
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)
from .decorators import make_service_permission

logger = logging.getLogger(__name__)


PosPerm = make_service_permission('pos')


def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    return None


VALID_TRANSITIONS = {
    'pending':   ['confirmed', 'cancelled'],
    'confirmed': ['preparing', 'cancelled'],
    'preparing': ['ready', 'cancelled'],
    'ready':     ['delivered', 'cancelled'],
    'delivered': [],
    'cancelled': [],
}


@api_view(["POST"])
@permission_classes([PosPerm])
def order_change_status(request, pk):
    """
    تغییر وضعیت سفارش.
    POST /api/orders/<pk>/status/
    """
    restaurant = _resolve_restaurant(request)

    try:
        qs = Order.objects.all()
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        order = qs.get(pk=pk)
    except Order.DoesNotExist:
        return JsonResponse({"success": False, "error": "سفارش یافت نشد."}, status=404)

    new_status = request.data.get("status")
    valid_statuses = [c[0] for c in Order.STATUS_CHOICES]

    if not new_status or new_status not in valid_statuses:
        return JsonResponse(
            {"success": False, "error": f"وضعیت نامعتبر. مقادیر مجاز: {', '.join(valid_statuses)}"},
            status=400,
        )

    old_status = order.status
    allowed = VALID_TRANSITIONS.get(old_status, [])
    if new_status not in allowed:
        return JsonResponse(
            {"success": False, "error": f"تغییر از «{order.get_status_display()}» به «{new_status}» مجاز نیست."},
            status=400,
        )

    try:
        with transaction.atomic():
            order.status = new_status

            if new_status == 'confirmed':
                order.confirmed_by = request.user
                order.confirmed_at = timezone.now()

            order.save(update_fields=['status', 'confirmed_by', 'confirmed_at'])

        return JsonResponse({
            "success": True,
            "id": order.id,
            "status": order.status,
            "status_display": order.get_status_display(),
            "msg": f"سفارش #{order.id} → {order.get_status_display()}",
        })

    except Exception as e:
        logger.exception('Error changing order #%d status', pk)
        return JsonResponse({"success": False, "error": f"خطای سرور: {str(e)}"}, status=500)


@api_view(["GET"])
@permission_classes([PosPerm])
def order_list_api(request):
    """لیست کلی سفارشات"""
    restaurant = _resolve_restaurant(request)
    qs = Order.objects.prefetch_related('items__product__category').all()

    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    status_filter = request.GET.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)

    source_filter = request.GET.get("source")
    if source_filter:
        qs = qs.filter(source=source_filter)

    date_filter = request.GET.get("date")
    if date_filter:
        qs = qs.filter(created_at__date=date_filter)

    search = request.GET.get("search", "").strip()
    if search:
        qs = qs.filter(
            Q(customer_name__icontains=search)
            | Q(phone__icontains=search)
            | Q(id__icontains=search),
        )

    try:
        page = max(1, int(request.GET.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(100, max(1, int(request.GET.get("page_size", 20))))
    except (TypeError, ValueError):
        page_size = 20

    total = qs.count()
    start = (page - 1) * page_size
    orders = qs.order_by('-created_at')[start:start + page_size]

    data = []
    for o in orders:
        items = [
            {
                "product_name": oi.product.name if oi.product else (oi.item_name or "—"),
                "name_en": (
                    oi.product.name_en if oi.product and oi.product.name_en
                    else (oi.item_name_en or "")
                ),
                "category": (
                    oi.product.category.name if oi.product and oi.product.category else ""
                ),
                "quantity": oi.quantity,
                "price": int(oi.price or 0),
            }
            for oi in o.items.all()
        ]
        data.append({
            "id": o.id,
            "customer_name": o.customer_name or "—",
            "customer_name_en": o.customer_name_en or "",
            "phone": o.phone or "",
            "status": o.status,
            "status_display": o.get_status_display(),
            "source": o.source,
            "source_display": o.get_source_display(),
            "payment_status": o.payment_status,
            "payment_method": o.payment_method,
            "total_price": int(o.total_price),
            "items": items,
            "items_count": len(items),
            "created_at": o.created_at.strftime("%H:%M"),
            "confirmed_by": (
                o.confirmed_by.get_full_name() or o.confirmed_by.username
            ) if o.confirmed_by else None,
        })

    return JsonResponse({
        "success": True,
        "count": len(data),
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
        "orders": data,
    })