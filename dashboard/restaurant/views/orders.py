"""
Orders API — سفارشات (★ نسخه اصلاح‌شده v3)

★ تغییرات نسبت به نسخه قبل:
  ۱. order_change_status: بررسی valid transitions (مثل kitchen.py)
  ۲. order_change_status: confirmed_by / confirmed_at ست می‌شود
  ۳. order_send_to_kitchen: restaurant فیلتر + InventoryMovement.restaurant
  ۴. kitchen_orders_api: فیلتر restaurant + status_display + source
  ۵. _resolve_restaurant اضافه شد
  ۶. مدیریت خطاها بهبود یافت
  ۷. ★ توجه: این فایل و kitchen.py هر دو order_change_status دارند
     → urls.py باید فقط از یکی import کند (پیشنهاد: از این فایل)
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework import status as http_status

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

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  resolve restaurant — fallback
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
#  ★★★ تغییر وضعیت سفارش ★★★
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def order_change_status(request, pk):
    """
    تغییر وضعیت سفارش با بررسی transition مجاز.
    POST /api/orders/<pk>/status/
    body: {"status": "preparing"}
    """
    try:
        order = Order.objects.prefetch_related(
            'items__food__recipe__ingredients__raw_material',
        ).get(pk=pk)
    except Order.DoesNotExist:
        return JsonResponse(
            {"success": False, "error": "سفارش یافت نشد."},
            status=404,
        )

    new_status = request.data.get("status")
    valid_statuses = [c[0] for c in Order.STATUS_CHOICES]

    if not new_status or new_status not in valid_statuses:
        return JsonResponse(
            {
                "success": False,
                "error": f"وضعیت نامعتبر. مقادیر مجاز: {', '.join(valid_statuses)}",
            },
            status=400,
        )

    # ★ FIXED: بررسی transition مجاز
    old_status = order.status
    allowed = VALID_TRANSITIONS.get(old_status, [])
    if new_status not in allowed:
        return JsonResponse(
            {
                "success": False,
                "error": f"تغییر از «{order.get_status_display()}» به «{new_status}» مجاز نیست.",
            },
            status=400,
        )

    try:
        order.status = new_status
        order.save(update_fields=['status'])

        msg = ''

        if new_status == 'ready':
            deducted = deduct_for_order_ready(order)
            msg = f' — {len(deducted)} آیتم از آشپزخانه کسر شد'
            logger.info(
                'Order #%d: %s → ready, deducted %d kitchen items',
                order.id, old_status, len(deducted),
            )

        elif new_status == 'cancelled':
            restored = restore_for_order_cancel(order)
            msg = f' — {len(restored)} آیتم بازگردانی شد'
            logger.info(
                'Order #%d: %s → cancelled, restored %d kitchen items',
                order.id, old_status, len(restored),
            )

        elif new_status == 'confirmed':
            # ★ FIXED: ست کردن تأییدکننده
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
#  ★★★ ارسال سفارش به آشپزخانه ★★★
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def order_send_to_kitchen(request, pk):
    """
    ارسال سفارش به آشپزخانه — کسر موجودی مواد اولیه.
    POST /api/orders/<pk>/send-to-kitchen/
    ★ فقط pending یا confirmed
    """
    try:
        order = Order.objects.prefetch_related(
            'items__food__recipe__ingredients__raw_material',
            'items__food__recipe__semi_finished_items__semi_finished__ingredients__raw_material',
        ).get(pk=pk)
    except Order.DoesNotExist:
        return JsonResponse(
            {"success": False, "error": "سفارش یافت نشد."},
            status=404,
        )

    if order.status not in ('pending', 'confirmed'):
        return JsonResponse(
            {
                "success": False,
                "error": f"سفارش در وضعیت «{order.get_status_display()}» قابل ارسال نیست. فقط «در انتظار» یا «تأیید شده».",
            },
            status=400,
        )

    restaurant = _resolve_restaurant(request)
    errors = []
    materials_used = []

    with transaction.atomic():
        # ── مرحله ۱: بررسی موجودی ──
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

            # مواد اولیه مستقیم
            for ri in recipe.ingredients.all():
                needed = Decimal(str(ri.effective_quantity)) * qty
                if ri.raw_material.quantity < needed:
                    errors.append(
                        f"«{food.name}»: {ri.raw_material.name} کم است "
                        f"(نیاز: {needed}، موجود: {ri.raw_material.quantity})"
                    )

            # نیم‌آماده‌ها
            for rsf in recipe.semi_finished_items.all():
                sf = rsf.semi_finished
                needed_sf = Decimal(str(rsf.quantity)) * qty
                if sf.current_stock < needed_sf:
                    errors.append(
                        f"«{food.name}»: نیم‌آماده «{sf.name}» کم است "
                        f"(نیاز: {needed_sf}، موجود: {sf.current_stock})"
                    )
                    continue
                for sfi in sf.ingredients.all():
                    needed_raw = sfi.quantity * needed_sf
                    if sfi.raw_material.quantity < needed_raw:
                        errors.append(
                            f"«{food.name}» ← «{sf.name}»: {sfi.raw_material.name} کم است "
                            f"(نیاز: {needed_raw}، موجود: {sfi.raw_material.quantity})"
                        )

        if errors:
            return JsonResponse(
                {"success": False, "error": errors},
                status=400,
            )

        # ── مرحله ۲: کسر مواد اولیه ──
        for item in order.items.all():
            food = item.food
            if not food:
                continue
            qty = item.quantity
            recipe = food.recipe

            # مواد اولیه مستقیم
            for ri in recipe.ingredients.all():
                needed = Decimal(str(ri.effective_quantity)) * qty
                rm = ri.raw_material
                prev_stock = rm.quantity
                rm.quantity -= needed
                rm.save(update_fields=['quantity'])

                # ★ FIXED: restaurant= اضافه شد
                InventoryMovement.objects.create(
                    restaurant=restaurant,
                    raw_material=rm,
                    movement_type='order_usage',
                    quantity=needed,
                    previous_stock=prev_stock,
                    new_stock=rm.quantity,
                    reference_type='order',
                    reference_id=order.id,
                    notes=f'سفارش #{order.id} — {food.name} ×{qty}',
                    created_by=request.user,
                )
                InventoryUsageLog.objects.create(
                    restaurant=restaurant,
                    raw_material=rm,
                    usage_type='order',
                    quantity_used=needed,
                    reference=f'سفارش #{order.id}',
                    note=f'{food.name} ×{qty}',
                )
                materials_used.append({
                    'name': rm.name,
                    'quantity': float(needed),
                    'unit': rm.get_unit_display(),
                    'type': 'direct',
                })

            # نیم‌آماده‌ها
            for rsf in recipe.semi_finished_items.all():
                sf = rsf.semi_finished
                needed_sf = Decimal(str(rsf.quantity)) * qty
                sf.current_stock -= needed_sf
                sf.save(update_fields=['current_stock'])

                for sfi in sf.ingredients.all():
                    needed_raw = sfi.quantity * needed_sf
                    rm = sfi.raw_material
                    prev_stock = rm.quantity
                    rm.quantity -= needed_raw
                    rm.save(update_fields=['quantity'])

                    InventoryMovement.objects.create(
                        restaurant=restaurant,
                        raw_material=rm,
                        movement_type='order_usage',
                        quantity=needed_raw,
                        previous_stock=prev_stock,
                        new_stock=rm.quantity,
                        reference_type='order',
                        reference_id=order.id,
                        notes=f'سفارش #{order.id} — {sf.name} ← {food.name} ×{qty}',
                        created_by=request.user,
                    )
                    InventoryUsageLog.objects.create(
                        restaurant=restaurant,
                        raw_material=rm,
                        usage_type='order',
                        quantity_used=needed_raw,
                        reference=f'سفارش #{order.id}',
                        note=f'{sf.name} ← {food.name} ×{qty}',
                    )
                    materials_used.append({
                        'name': rm.name,
                        'quantity': float(needed_raw),
                        'unit': rm.get_unit_display(),
                        'type': f'semi:{sf.name}',
                    })

        # ── مرحله ۳: تغییر وضعیت ──
        order.status = 'preparing'
        order.confirmed_by = order.confirmed_by or request.user
        order.confirmed_at = order.confirmed_at or timezone.now()
        order.save(update_fields=[
            'status', 'confirmed_by', 'confirmed_at',
        ])

    return JsonResponse({
        "success": True,
        "msg": f"سفارش #{order.id} به آشپزخانه ارسال شد.",
        "id": order.id,
        "status": order.status,
        "status_display": order.get_status_display(),
        "materials_used": materials_used,
    })


# ═══════════════════════════════════════
#  ★★★ لیست سفارشات آشپزخانه ★★★
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def kitchen_orders_api(request):
    """
    لیست سفارشات آشپزخانه — فیلتر بر اساس وضعیت.
    GET /api/kitchen/orders/?status=preparing
    """
    status_filter = request.GET.get("status", "preparing")
    restaurant = _resolve_restaurant(request)

    qs = Order.objects.prefetch_related(
        'items__food',
    ).filter(
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
#  ★★★ لیست کلی سفارشات ★★★
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def order_list_api(request):
    """
    لیست سفارشات — با فیلتر وضعیت، منبع، تاریخ.
    GET /api/orders/?status=pending&source=pos&date=2024-01-01
    """
    restaurant = _resolve_restaurant(request)
    qs = Order.objects.prefetch_related('items__food').all()

    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    # فیلترها
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
        from django.db.models import Q
        qs = qs.filter(
            Q(customer_name__icontains=search)
            | Q(phone__icontains=search)
            | Q(id__icontains=search),
        )

    # صفحه‌بندی
    page = int(request.GET.get("page", 1))
    page_size = int(request.GET.get("page_size", 20))
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
            "confirmed_by": o.confirmed_by.get_full_name() or o.confirmed_by.username if o.confirmed_by else None,
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