"""
Order management API.
"""
import json as json_module
import logging
from decimal import Decimal

from django.contrib.admin.views.decorators import staff_member_required
from django.db import transaction
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ..models import (
    Order, OrderItem, Recipe, RawMaterial, SemiFinished,
    InventoryMovement, InventoryUsageLog,
)

logger = logging.getLogger(__name__)


@api_view(["POST"])
@staff_member_required
def order_change_status(request, pk):
    try:
        order = Order.objects.get(pk=pk)
    except Order.DoesNotExist:
        return JsonResponse({"error": "سفارش یافت نشد."}, status=404)
    new_status = request.data.get("status")
    valid = ['pending', 'preparing', 'ready', 'delivered', 'cancelled']
    if new_status not in valid:
        return JsonResponse({"error": "وضعیت نامعتبر."}, status=400)
    order.status = new_status
    order.save(update_fields=['status'])
    return JsonResponse({"success": True, "id": order.id, "status": new_status})


@api_view(["POST"])
@staff_member_required
def order_send_to_kitchen(request, pk):
    try:
        order = Order.objects.prefetch_related(
            'items__food__recipe__ingredients__raw_material',
            'items__food__recipe__semi_finished_items__semi_finished__ingredients__raw_material',
        ).get(pk=pk)
    except Order.DoesNotExist:
        return JsonResponse({"error": "سفارش یافت نشد."}, status=404)

    if order.status not in ('pending', 'confirmed'):
        return JsonResponse({"error": "فقط سفارشات «در انتظار» یا «تأیید شده» قابل ارسال هستند."}, status=400)

    errors = []
    materials_used = []

    with transaction.atomic():
        # مرحله ۱: بررسی موجودی
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
                needed = Decimal(str(ri.effective_quantity)) * qty
                if ri.raw_material.quantity < needed:
                    errors.append(f"«{food.name}»: {ri.raw_material.name} کم است (نیاز: {needed}، موجود: {ri.raw_material.quantity})")

            for rsf in recipe.semi_finished_items.all():
                sf = rsf.semi_finished
                needed_sf = Decimal(str(rsf.quantity)) * qty
                if sf.current_stock < needed_sf:
                    errors.append(f"«{food.name}»: نیم‌آماده «{sf.name}» کم است (نیاز: {needed_sf}، موجود: {sf.current_stock})")
                    continue
                for sfi in sf.ingredients.all():
                    needed_raw = sfi.quantity * needed_sf
                    if sfi.raw_material.quantity < needed_raw:
                        errors.append(f"«{food.name}» ← «{sf.name}»: {sfi.raw_material.name} کم است (نیاز: {needed_raw}، موجود: {sfi.raw_material.quantity})")

        if errors:
            return JsonResponse({"error": errors}, status=400)

        # مرحله ۲: کسر مواد اولیه
        for item in order.items.all():
            food = item.food
            if not food:
                continue
            qty = item.quantity
            recipe = food.recipe

            for ri in recipe.ingredients.all():
                needed = Decimal(str(ri.effective_quantity)) * qty
                rm = ri.raw_material
                prev_stock = rm.quantity
                rm.quantity -= needed
                rm.save(update_fields=['quantity'])
                InventoryMovement.objects.create(
                    raw_material=rm, movement_type='order_usage',
                    quantity=needed, previous_stock=prev_stock,
                    new_stock=rm.quantity, reference_type='order',
                    reference_id=order.id, notes=f'سفارش #{order.id} — {food.name} ×{qty}',
                    created_by=request.user,
                )
                InventoryUsageLog.objects.create(
                    raw_material=rm, usage_type='order',
                    quantity_used=needed, reference=f'سفارش #{order.id}',
                    note=f'{food.name} ×{qty}',
                )
                materials_used.append({'name': rm.name, 'quantity': float(needed), 'unit': rm.get_unit_display(), 'type': 'direct'})

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
                        raw_material=rm, movement_type='order_usage',
                        quantity=needed_raw, previous_stock=prev_stock,
                        new_stock=rm.quantity, reference_type='order',
                        reference_id=order.id, notes=f'سفارش #{order.id} — {sf.name} ← {food.name} ×{qty}',
                        created_by=request.user,
                    )
                    InventoryUsageLog.objects.create(
                        raw_material=rm, usage_type='order',
                        quantity_used=needed_raw, reference=f'سفارش #{order.id}',
                        note=f'{sf.name} ← {food.name} ×{qty}',
                    )
                    materials_used.append({'name': rm.name, 'quantity': float(needed_raw), 'unit': rm.get_unit_display(), 'type': f'semi:{sf.name}'})

        # مرحله ۳: تغییر وضعیت
        order.status = 'preparing'
        order.save(update_fields=['status'])

    return JsonResponse({"success": True, "msg": f"سفارش #{order.id} به آشپزخانه ارسال شد.", "materials_used": materials_used})


@api_view(["GET"])
@staff_member_required
def kitchen_orders_api(request):
    status_filter = request.GET.get("status", "preparing")
    orders = Order.objects.prefetch_related('items__food').filter(status=status_filter).order_by('created_at')[:50]
    data = []
    for order in orders:
        items = [{"food_name": item.food.name if item.food else "—", "quantity": item.quantity} for item in order.items.all()]
        data.append({
            "id": order.id, "status": order.status,
            "customer_name": order.customer_name or "—",
            "items": items, "total_price": int(order.total_price),
            "created_at": order.created_at.strftime("%H:%M"),
        })
    return JsonResponse({"orders": data}, safe=False)