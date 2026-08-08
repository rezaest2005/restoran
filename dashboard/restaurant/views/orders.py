"""
Orders API — سفارشات (★ نسخه v5 — اصلاح شده)

★ v5 تغییرات:
  - order_change_status: فیلتر restaurant + atomic
  - order_send_to_kitchen: فیلتر restaurant + F() + select_for_update
  - kitchen_orders_api: فیلتر restaurant + status گسترده‌تر
  - order_list_api: فیلتر restaurant
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, F
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ..models import (
    Order, OrderItem, Recipe, RawMaterial, SemiFinished,
    InventoryMovement, InventoryUsageLog,
)
from ..kitchen_services import (
    deduct_for_order_ready,
    restore_for_order_cancel,
)
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)
from .decorators import make_service_permission

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  Permissions
# ═══════════════════════════════════════

PosPerm = make_service_permission('pos')
KitchenPerm = make_service_permission('kitchen')


# ═══════════════════════════════════════
#  resolve restaurant
# ═══════════════════════════════════════

def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    return None


# ═══════════════════════════════════════
#  الگوی مجاز تغییر وضعیت
# ═══════════════════════════════════════

VALID_TRANSITIONS = {
    'pending':   ['confirmed', 'cancelled'],
    'confirmed': ['preparing', 'cancelled'],
    'preparing': ['ready', 'cancelled'],
    'ready':     ['delivered', 'cancelled'],
    'delivered': [],
    'cancelled': [],
}


# ═══════════════════════════════════════
#  تغییر وضعیت سفارش
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([PosPerm])
def order_change_status(request, pk):
    """
    تغییر وضعیت سفارش.
    POST /api/orders/<pk>/status/
    body: {"status": "preparing"}
    """
    restaurant = _resolve_restaurant(request)

    # ★ FIXED: فیلتر restaurant
    try:
        qs = Order.objects.prefetch_related(
            'items__food__recipe__ingredients__raw_material',
        ).all()
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        order = qs.get(pk=pk)
    except Order.DoesNotExist:
        return JsonResponse(
            {"success": False, "error": "سفارش یافت نشد."},
            status=404,
        )

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
        # ★ FIXED: atomic — تغییر وضعیت + side effects
        with transaction.atomic():
            order.status = new_status
            order.save(update_fields=['status'])

            msg = ''
            if new_status == 'ready':
                deducted = deduct_for_order_ready(order)
                msg = f' — {len(deducted)} آیتم از آشپزخانه کسر شد'
                logger.info(
                    'Order #%d: %s → ready, deducted %d',
                    order.id, old_status, len(deducted),
                )

            elif new_status == 'cancelled':
                restored = restore_for_order_cancel(order)
                msg = f' — {len(restored)} آیتم بازگردانی شد'
                logger.info(
                    'Order #%d: %s → cancelled, restored %d',
                    order.id, old_status, len(restored),
                )

            elif new_status == 'confirmed':
                order.confirmed_by = request.user
                order.confirmed_at = timezone.now()
                order.save(update_fields=['confirmed_by', 'confirmed_at'])

        return JsonResponse({
            "success": True,
            "id": order.id,
            "status": order.status,
            "status_display": order.get_status_display(),
            "msg": f"سفارش #{order.id} → {order.get_status_display()}{msg}",
        })

    except Exception as e:
        logger.exception('Error changing order #%d status', pk)
        return JsonResponse(
            {"success": False, "error": f"خطای سرور: {str(e)}"},
            status=500,
        )


# ═══════════════════════════════════════
#  ارسال سفارش به آشپزخانه
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([PosPerm])
def order_send_to_kitchen(request, pk):
    """
    ارسال سفارش به آشپزخانه — کسر موجودی مواد اولیه.
    POST /api/orders/<pk>/send-to-kitchen/
    """
    restaurant = _resolve_restaurant(request)

    # ★ FIXED: فیلتر restaurant
    try:
        qs = Order.objects.prefetch_related(
            'items__food__recipe__ingredients__raw_material',
            'items__food__recipe__semi_finished_items__semi_finished__ingredients__raw_material',
        ).all()
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        order = qs.get(pk=pk)
    except Order.DoesNotExist:
        return JsonResponse(
            {"success": False, "error": "سفارش یافت نشد."},
            status=404,
        )

    if order.status not in ('pending', 'confirmed'):
        return JsonResponse(
            {"success": False, "error": f"سفارش در وضعیت «{order.get_status_display()}» قابل ارسال نیست."},
            status=400,
        )

    errors = []
    materials_used = []

    with transaction.atomic():
        # مرحله ۱: بررسی موجودی — ★ FIXED: select_for_update
        all_needed = {}  # {raw_material_id: Decimal}
        all_sf_needed = {}  # {semi_finished_id: Decimal}

        for item in order.items.all():
            food = item.food
            if not food:
                continue
            qty = item.quantity

            try:
                recipe = food.recipe
            except Recipe.DoesNotExist:
                errors.append(f"«{food.name}» رسپی ندارد")
                continue

            for ri in recipe.ingredients.all():
                rm_id = ri.raw_material_id
                needed = Decimal(str(ri.effective_quantity)) * qty
                all_needed[rm_id] = all_needed.get(rm_id, Decimal('0')) + needed

            for rsf in recipe.semi_finished_items.all():
                sf_id = rsf.semi_finished_id
                needed_sf = Decimal(str(rsf.quantity)) * qty
                all_sf_needed[sf_id] = all_sf_needed.get(sf_id, Decimal('0')) + needed_sf

        if errors:
            return JsonResponse({"success": False, "error": errors}, status=400)

        # قفل و بررسی مواد اولیه
        if all_needed:
            locked_materials = {
                rm.id: rm
                for rm in RawMaterial.objects.select_for_update().filter(
                    id__in=all_needed.keys(),
                )
            }
            for rm_id, needed in all_needed.items():
                rm = locked_materials.get(rm_id)
                if not rm:
                    errors.append(f"ماده اولیه #{rm_id} یافت نشد")
                elif rm.quantity < needed:
                    errors.append(
                        f"«{rm.name}» کم است "
                        f"(نیاز: {needed}، موجود: {rm.quantity})"
                    )

        # قفل و بررسی نیم‌آماده‌ها
        if all_sf_needed and not errors:
            locked_sf = {
                sf.id: sf
                for sf in SemiFinished.objects.select_for_update().filter(
                    id__in=all_sf_needed.keys(),
                )
            }
            for sf_id, needed_sf in all_sf_needed.items():
                sf = locked_sf.get(sf_id)
                if not sf:
                    errors.append(f"نیم‌آماده #{sf_id} یافت نشد")
                elif sf.current_stock < needed_sf:
                    errors.append(
                        f"نیم‌آماده «{sf.name}» کم است "
                        f"(نیاز: {needed_sf}، موجود: {sf.current_stock})"
                    )

        if errors:
            return JsonResponse({"success": False, "error": errors}, status=400)

        # مرحله ۲: کسر مواد اولیه — ★ FIXED: F()
        for rm_id, needed in all_needed.items():
            rm = locked_materials[rm_id]
            prev_stock = float(rm.quantity)
            RawMaterial.objects.filter(pk=rm_id).update(
                quantity=F('quantity') - needed,
            )
            rm.refresh_from_db()

            InventoryMovement.objects.create(
                restaurant=restaurant,
                raw_material=rm,
                movement_type='order_usage',
                quantity=float(needed),
                previous_stock=prev_stock,
                new_stock=float(rm.quantity),
                reference_type='order',
                reference_id=order.id,
                notes=f'سفارش #{order.id}',
                created_by=request.user,
            )
            InventoryUsageLog.objects.create(
                restaurant=restaurant,
                raw_material=rm,
                usage_type='order',
                quantity_used=float(needed),
                reference=f'سفارش #{order.id}',
                note=f'سفارش #{order.id}',
            )
            materials_used.append({
                'name': rm.name,
                'quantity': float(needed),
                'unit': rm.get_unit_display(),
                'type': 'direct',
            })

        # کسر نیم‌آماده‌ها
        for sf_id, needed_sf in all_sf_needed.items():
            sf = locked_sf[sf_id]
            SemiFinished.objects.filter(pk=sf_id).update(
                current_stock=F('current_stock') - needed_sf,
            )

        # مرحله ۳: تغییر وضعیت
        order.status = 'preparing'
        order.confirmed_by = order.confirmed_by or request.user
        order.confirmed_at = order.confirmed_at or timezone.now()
        order.save(update_fields=['status', 'confirmed_by', 'confirmed_at'])

    return JsonResponse({
        "success": True,
        "msg": f"سفارش #{order.id} به آشپزخانه ارسال شد.",
        "id": order.id,
        "status": order.status,
        "status_display": order.get_status_display(),
        "materials_used": materials_used,
    })


# ═══════════════════════════════════════
#  لیست سفارشات آشپزخانه
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([KitchenPerm])
def kitchen_orders_api(request):
    """
    لیست سفارشات آشپزخانه.
    GET /api/orders/kitchen/?status=preparing
    """
    status_filter = request.GET.get("status", "preparing")
    restaurant = _resolve_restaurant(request)

    # ★ FIXED: اگه status نیست، confirmed/preparing/ready
    if status_filter == 'all':
        qs = Order.objects.prefetch_related('items__food').filter(
            status__in=['confirmed', 'preparing', 'ready'],
        ).order_by('created_at')
    else:
        qs = Order.objects.prefetch_related('items__food').filter(
            status=status_filter,
        ).order_by('created_at')

    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    orders = qs[:50]

    data = []
    for order in orders:
        items = [
            {
                "id": item.id,
                "food_name": item.food.name if item.food else (item.item_name or "—"),
                "quantity": item.quantity,
                "price": int(item.price or 0),
            }
            for item in order.items.all()
        ]
        data.append({
            "id": order.id,
            "status": order.status,
            "status_display": order.get_status_display(),
            "source": order.source,
            "source_display": order.get_source_display(),
            "customer_name": order.customer_name or "—",
            "phone": order.phone or "",
            "items": items,
            "total_price": int(order.total_price),
            "created_at": order.created_at.strftime("%H:%M"),
            "created_at_full": order.created_at.strftime("%Y-%m-%d %H:%M"),
        })

    return JsonResponse({
        "success": True,
        "count": len(data),
        "orders": data,
    })


# ═══════════════════════════════════════
#  لیست کلی سفارشات
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([PosPerm])
def order_list_api(request):
    """
    لیست سفارشات — با فیلتر وضعیت، منبع، تاریخ.
    GET /api/orders/list/?status=pending&source=pos&date=2024-01-01
    """
    restaurant = _resolve_restaurant(request)
    qs = Order.objects.prefetch_related('items__food').all()

    # ★ FIXED: فیلتر restaurant
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

    # ★ FIXED: اعتبارسنجی page/page_size
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
                "food_name": oi.food.name if oi.food else (oi.item_name or "—"),
                "quantity": oi.quantity,
                "price": int(oi.price or 0),
            }
            for oi in o.items.all()
        ]
        data.append({
            "id": o.id,
            "customer_name": o.customer_name or "—",
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
            "created_at": o.created_at.strftime("%Y-%m-%d %H:%M"),
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