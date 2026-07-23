"""
POS — صندوق فروش API.
"""
import json as json_module
import json
import datetime
import logging
from decimal import Decimal

from django.conf import settings
from django.contrib.admin.views.decorators import staff_member_required
from django.db import transaction
from django.db.models import Sum
from django.http import HttpRequest, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required

from ..models import (
    Order, OrderItem, Food, KitchenProduct, ReadyMaterial,
    Coupon, Category, WasteLog, DayCloseReport, DayCloseLog,
)
from .helpers import _build_foods_with_discounts, _get_food_discount_info

logger = logging.getLogger(__name__)


@csrf_protect
@require_POST
@staff_member_required
def pos_create_order(request: HttpRequest):
    """ثبت سفارش از صفحه صندوق — شامل نوشیدنی‌های آماده + بررسی موجودی."""
    try:
        data = json_module.loads(request.body)
        customer_name = data.get("customer_name", "").strip()
        phone = data.get("phone", "").strip()
        items = data.get("items", [])

        if not items:
            return JsonResponse({"success": False, "error": "هیچ غذایی انتخاب نشده"})

        validated_items = []
        stock_errors = []

        for item in items:
            qty = int(item.get("quantity", 1))
            if qty <= 0:
                continue
            raw_id = item.get("food_id") or item.get("id")
            is_ready = item.get("is_ready", False)

            if is_ready or (isinstance(raw_id, str) and raw_id.startswith("ready_")):
                rm_id = int(str(raw_id).replace("ready_", ""))
                rm = ReadyMaterial.objects.filter(id=rm_id).first()
                if not rm:
                    return JsonResponse({"success": False, "error": f"کالای آماده با شناسه {rm_id} پیدا نشد"})
                if qty > int(rm.quantity):
                    stock_errors.append(f"{rm.name}: سفارش {qty} ولی موجودی {int(rm.quantity)}")
                    continue
                validated_items.append({"type": "ready", "obj": rm, "qty": qty, "price": int(rm.selling_price)})
            else:
                food = Food.objects.filter(id=int(raw_id)).first()
                if not food:
                    return JsonResponse({"success": False, "error": f"غذا با شناسه {raw_id} پیدا نشد"})
                db_price = int(food.final_price)
                kp = None
                if hasattr(food, "recipe") and food.recipe:
                    kp = food.recipe.kitchen_products.first()
                if not kp:
                    kp = KitchenProduct.objects.filter(name=food.name).first()
                if kp:
                    inv = kp.get_inventory()
                    available = inv.available_quantity if inv else 0
                    if qty > available:
                        stock_errors.append(f"{food.name}: سفارش {qty} ولی موجودی {available}")
                        continue
                validated_items.append({"type": "food", "obj": food, "kp": kp, "qty": qty, "price": db_price})

        if stock_errors:
            return JsonResponse({"success": False, "error": "موجودی کافی نیست: " + " | ".join(stock_errors)})
        if not validated_items:
            return JsonResponse({"success": False, "error": "هیچ آیتم معتبری وجود ندارد"})

        with transaction.atomic():
            order = Order.objects.create(customer_name=customer_name or "مشتری", phone=phone, status="pending", total_price=0)
            total = 0
            order_items = []

            for vi in validated_items:
                qty = vi["qty"]
                price = vi["price"]
                line_total = price * qty
                total += line_total

                if vi["type"] == "ready":
                    rm = vi["obj"]
                    rm.quantity -= qty
                    rm.save(update_fields=["quantity"])
                    OrderItem.objects.create(order=order, food=None, quantity=qty, price=price)
                    order_items.append({"name": rm.name, "quantity": qty, "price": price, "line_total": line_total})
                else:
                    food = vi["obj"]
                    kp = vi["kp"]
                    if kp:
                        inv = kp.get_inventory()
                        if inv:
                            inv.quantity -= qty
                            inv.save(update_fields=["quantity", "updated_at"])
                    OrderItem.objects.create(order=order, food=food, quantity=qty, price=price)
                    order_items.append({"name": food.name, "quantity": qty, "price": price, "line_total": line_total})

            order.total_price = total
            order.save()

        return JsonResponse({
            "success": True, "order_id": order.id,
            "customer_name": order.customer_name, "total_price": total,
            "items": order_items,
            "created_at": order.created_at.strftime("%Y-%m-%d %H:%M"),
            "msg": f"سفارش #{order.id} ثبت شد",
        })
    except Exception as exc:
        logger.exception("Error creating POS order")
        return JsonResponse({"success": False, "error": str(exc)})


@staff_member_required
def pos_daily_report(request: HttpRequest):
    try:
        date_str = request.GET.get('date', '')
        if date_str:
            target_date = datetime.date.fromisoformat(date_str)
        else:
            target_date = timezone.localdate()

        start = timezone.make_aware(timezone.datetime.combine(target_date, timezone.datetime.min.time()))
        end = timezone.make_aware(timezone.datetime.combine(target_date, timezone.datetime.max.time()))

        orders = Order.objects.filter(created_at__range=(start, end)).prefetch_related('items__food')
        order_count = orders.count()
        total_sales = sum(o.total_price for o in orders)

        top_items = (
            OrderItem.objects.filter(order__in=orders, food__isnull=False)
            .values('food__name').annotate(qty=Sum('quantity'), total=Sum('price')).order_by('-qty')[:10]
        )
        top_list = [{'name': t['food__name'], 'qty': t['qty'], 'total': int(t['total'] or 0)} for t in top_items]

        orders_list = [{
            'id': o.id, 'customer': o.customer_name,
            'items_count': o.items.count(), 'total': int(o.total_price),
            'time': o.created_at.strftime('%H:%M'),
        } for o in orders.order_by('-created_at')]

        waste_logs = WasteLog.objects.filter(created_at__range=(start, end))
        waste_total = sum(w.quantity for w in waste_logs)

        discount_total = 0
        for o in orders:
            for item in o.items.select_related('food').all():
                if item.food:
                    kp = None
                    if hasattr(item.food, 'recipe') and item.food.recipe:
                        kp = item.food.recipe.kitchen_products.first()
                    if not kp:
                        kp = KitchenProduct.objects.filter(name=item.food.name).first()
                    if kp:
                        kitchen_price = int(kp.selling_price)
                        di = _get_food_discount_info(kp)
                        if di:
                            discount_total += (kitchen_price - int(di['discounted_price'])) * item.quantity

        return JsonResponse({
            'success': True, 'total_sales': int(total_sales), 'order_count': order_count,
            'discount_total': discount_total, 'waste_total': waste_total,
            'top_items': top_list, 'orders': orders_list,
        })
    except Exception as exc:
        logger.exception("Error in daily report")
        return JsonResponse({'success': False, 'error': str(exc)})


@csrf_protect
@require_POST
def pos_validate_coupon(request):
    try:
        data = json.loads(request.body)
        code = (data.get('code') or '').strip().upper()
        subtotal = int(data.get('subtotal') or 0)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'success': False, 'error': 'داده نامعتبر'})
    if not code:
        return JsonResponse({'success': False, 'error': 'کد تخفیف وارد نشده'})
    try:
        coupon = Coupon.objects.get(code__iexact=code)
    except Coupon.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'کد تخفیف نامعتبر است'})
    if not coupon.is_valid:
        return JsonResponse({'success': False, 'error': 'این کد منقضی شده یا غیرفعال است'})
    if coupon.min_order_amount and subtotal < coupon.min_order_amount:
        return JsonResponse({'success': False, 'error': 'حداقل مبلغ سفارش برای این کد: ' + str(coupon.min_order_amount) + ' تومان'})

    discount = coupon.calculate_discount(Decimal(str(subtotal)))
    if coupon.description:
        desc = coupon.description
    elif coupon.discount_type == 'percentage':
        desc = str(coupon.discount_value) + '% تخفیف'
        if coupon.max_discount_amount:
            desc += ' (سقف ' + str(coupon.max_discount_amount) + ' تومان)'
    else:
        desc = str(coupon.discount_value) + ' تومان تخفیف'

    return JsonResponse({
        'success': True, 'discount_type': coupon.discount_type,
        'value': int(discount), 'description': desc,
    })


# ═══ بستن روز ═══

@csrf_exempt
@login_required
def pos_close_summary(request):
    today = timezone.localdate()
    orders = Order.objects.filter(created_at__date=today)

    total_sales = orders.aggregate(s=Sum('total_price'))['s'] or 0
    order_count = orders.count()
    delivered = orders.filter(status='delivered').count()
    pending = orders.exclude(status='delivered').count()

    pending_orders = [{
        'id': o.id, 'customer': o.customer_name or 'بدون نام', 'total': o.total_price,
        'items': [{'name': oi.food.name if oi.food else '?', 'qty': oi.quantity} for oi in o.items.all()],
    } for o in orders.exclude(status='delivered')]

    kitchen_items = []
    for kp in KitchenProduct.objects.filter(is_active=True):
        inv = kp.get_inventory()
        kitchen_items.append({'id': kp.id, 'name': kp.name, 'stock': inv.quantity, 'category': kp.category})

    waste_logs = WasteLog.objects.filter(created_at__date=today)
    waste_count = waste_logs.aggregate(s=Sum('quantity'))['s'] or 0
    waste_value = 0
    for wl in waste_logs:
        kp = KitchenProduct.objects.filter(id=wl.kitchen_product_id).first()
        if kp:
            waste_value += (kp.selling_price or 0) * wl.quantity

    discount_total = 0
    for o in orders:
        if hasattr(o, 'discount_amount') and o.discount_amount:
            discount_total += o.discount_amount

    items_detail = []
    item_stats = {}
    for oi in OrderItem.objects.filter(order__created_at__date=today):
        name = oi.food.name if oi.food else '?'
        if name not in item_stats:
            item_stats[name] = {'qty': 0, 'revenue': 0}
        item_stats[name]['qty'] += oi.quantity
        item_stats[name]['revenue'] += oi.price * oi.quantity
    for name, stats in item_stats.items():
        items_detail.append({'name': name, 'qty': stats['qty'], 'revenue': stats['revenue']})

    top_items = sorted(items_detail, key=lambda x: x['qty'], reverse=True)[:5]
    total_cost = 0
    total_profit = total_sales - total_cost - waste_value - discount_total
    existing_report = DayCloseReport.objects.filter(date=today).first()

    return JsonResponse({
        'success': True, 'total_sales': total_sales, 'total_cost': total_cost,
        'total_profit': total_profit, 'order_count': order_count,
        'delivered_count': delivered, 'pending_count': pending,
        'pending_orders': pending_orders, 'kitchen_items': kitchen_items,
        'waste_count': waste_count, 'waste_value': waste_value,
        'discount_total': discount_total, 'items_detail': items_detail,
        'top_items': top_items, 'already_closed': existing_report is not None,
        'report_id': existing_report.id if existing_report else None,
    })


@csrf_exempt
@login_required
def pos_register_waste(request):
    try:
        data = json_module.loads(request.body)
        items = data.get('items', [])
        if not items:
            return JsonResponse({'success': False, 'error': 'آیتمی ارسال نشد'})
        registered = []
        for item in items:
            kp_id = item.get('kitchen_product_id')
            qty = item.get('quantity', 0)
            note = item.get('note', '')
            if qty <= 0:
                return JsonResponse({'success': False, 'error': f'تعداد باید بیشتر از صفر باشد (مقدار: {qty})'})
            try:
                kp = KitchenProduct.objects.get(id=kp_id)
            except KitchenProduct.DoesNotExist:
                return JsonResponse({'success': False, 'error': f'محصول آشپزخانه با شناسه {kp_id} پیدا نشد'})
            inv = kp.get_inventory()
            actual_qty = min(qty, inv.quantity)
            if actual_qty > 0:
                inv.quantity -= actual_qty
                inv.save(update_fields=['quantity', 'updated_at'])
                WasteLog.objects.create(kitchen_product_id=kp.id, quantity=actual_qty, reason=note)
                registered.append(f'{kp.name}×{actual_qty}')
        return JsonResponse({'success': True, 'msg': f'ضایعات ثبت شد: {", ".join(registered)}'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
@login_required
def pos_close_all_pending(request):
    today = timezone.localdate()
    pending = Order.objects.filter(created_at__date=today).exclude(status='delivered')
    count = pending.count()
    pending.update(status='delivered')
    return JsonResponse({'success': True, 'msg': f'{count} سفارش تحویل شد'})


@csrf_exempt
@login_required
def pos_close_day(request):
    today = timezone.localdate()
    user = request.user if request.user.is_authenticated else None

    orders = Order.objects.filter(created_at__date=today)
    pending = orders.exclude(status='delivered')
    pending_count = pending.count()
    pending.update(status='delivered')

    total_sales = orders.aggregate(s=Sum('total_price'))['s'] or 0
    order_count = orders.count()
    delivered_count = orders.filter(status='delivered').count()

    waste_logs = WasteLog.objects.filter(created_at__date=today)
    waste_count = waste_logs.aggregate(s=Sum('quantity'))['s'] or 0
    waste_value = 0
    for wl in waste_logs:
        kp = KitchenProduct.objects.filter(id=wl.kitchen_product_id).first()
        if kp:
            waste_value += (kp.selling_price or 0) * wl.quantity

    discount_total = 0
    for o in orders:
        if hasattr(o, 'discount_amount') and o.discount_amount:
            discount_total += o.discount_amount

    items_detail = []
    item_stats = {}
    for oi in OrderItem.objects.filter(order__created_at__date=today):
        name = oi.food.name if oi.food else '?'
        if name not in item_stats:
            item_stats[name] = {'qty': 0, 'revenue': 0}
        item_stats[name]['qty'] += oi.quantity
        item_stats[name]['revenue'] += oi.price * oi.quantity
    for name, stats in item_stats.items():
        items_detail.append({'name': name, 'qty': stats['qty'], 'revenue': stats['revenue']})

    top_items = sorted(items_detail, key=lambda x: x['qty'], reverse=True)[:5]
    total_cost = 0
    total_profit = total_sales - total_cost - waste_value - discount_total

    inventory_snapshot = {}
    for kp in KitchenProduct.objects.filter(is_active=True):
        inv = kp.get_inventory()
        inventory_snapshot[kp.name] = {'product_id': kp.id, 'stock': inv.quantity, 'price': kp.selling_price or 0}

    report = DayCloseReport.objects.create(
        date=today, total_sales=total_sales, total_cost=total_cost,
        total_profit=total_profit, order_count=order_count,
        delivered_count=delivered_count, waste_count=waste_count,
        waste_value=waste_value, discount_total=discount_total,
        inventory_snapshot=inventory_snapshot, items_detail=items_detail,
        top_items=top_items, closed_by=user,
    )

    DayCloseLog.objects.create(
        date=today, action='close', user=user,
        details={'report_id': report.id, 'total_sales': total_sales, 'order_count': order_count, 'waste_count': waste_count, 'pending_delivered': pending_count},
    )

    return JsonResponse({
        'success': True, 'report_id': report.id,
        'msg': f'روز بسته شد — {order_count} سفارش / {total_sales:,} تومان فروش / {total_profit:,} تومان سود / {delivered_count} تحویل / {waste_count} ضایعات',
    })


@login_required
def pos_close_history(request):
    limit = int(request.GET.get('limit', 30))
    reports = DayCloseReport.objects.all()[:limit]
    data = [{
        'id': r.id, 'date': str(r.date), 'total_sales': r.total_sales,
        'total_cost': r.total_cost, 'total_profit': r.total_profit,
        'order_count': r.order_count, 'delivered_count': r.delivered_count,
        'waste_count': r.waste_count, 'waste_value': r.waste_value,
        'discount_total': r.discount_total,
        'closed_by': r.closed_by.username if r.closed_by else '?',
        'closed_at': r.closed_at.strftime('%Y-%m-%d %H:%M'),
    } for r in reports]
    return JsonResponse({'success': True, 'reports': data})


@login_required
def pos_close_report_detail(request, report_id):
    try:
        r = DayCloseReport.objects.get(id=report_id)
    except DayCloseReport.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'گزارش پیدا نشد'})
    return JsonResponse({
        'success': True,
        'report': {
            'id': r.id, 'date': str(r.date), 'total_sales': r.total_sales,
            'total_cost': r.total_cost, 'total_profit': r.total_profit,
            'order_count': r.order_count, 'delivered_count': r.delivered_count,
            'waste_count': r.waste_count, 'waste_value': r.waste_value,
            'discount_total': r.discount_total,
            'inventory_snapshot': r.inventory_snapshot, 'items_detail': r.items_detail,
            'top_items': r.top_items,
            'closed_by': r.closed_by.username if r.closed_by else '?',
            'closed_at': r.closed_at.strftime('%Y-%m-%d %H:%M'),
        },
    })


@login_required
def pos_close_logs(request):
    limit = int(request.GET.get('limit', 50))
    logs = DayCloseLog.objects.select_related('user').all()[:limit]
    data = [{
        'id': log.id, 'date': str(log.date), 'action': log.action,
        'action_display': log.get_action_display(),
        'user': log.user.username if log.user else '?',
        'details': log.details,
        'created_at': log.created_at.strftime('%Y-%m-%d %H:%M:%S'),
    } for log in logs]
    return JsonResponse({'success': True, 'logs': data})