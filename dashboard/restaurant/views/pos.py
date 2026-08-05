"""
POS — صندوق فروش API. ★ نسخه اصلاحی نهایی

تغییرات:
  ۱. @staff_member_required → @api_view + @permission_classes
  ۲. pos_create_order → F() + lookup اصلاح‌شده
  ۳. ★ حذف _get_food_discount_info (مدل حذف شده)
  ۴. ★ food_id validation → 400
  ۵. ★ restaurant= برای همه create ها
  ۶. ★ resolve_restaurant fallback اگه context خالی بود
  ۷. ★ باز/بستن سفارش آنلاین
  ۸. ★ public_menu_api — آینه صندوق برای منو آنلاین
  ۹. ★ pos_update_food_price — ویرایش قیمت از صندوق
  ۱۰. ★ رفع crash قیمت‌های خراب (NaN) با try/except
"""
import json
import datetime
import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import F, Sum
from django.http import HttpRequest, JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response as DRFResponse

from ..models import (
    Order, OrderItem, Food, KitchenProduct, KitchenInventory,
    ReadyMaterial, Coupon, Category, WasteLog,
    DayCloseReport, DayCloseLog,
    OnlineOrderSettings,
)
from ..tenancy import get_current_restaurant, set_current_restaurant, get_restaurant_from_request

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  ★★★ resolve restaurant — fallback ★★★
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
#  ★★★ پیدا کردن KitchenProduct برای یک Food ★★★
# ═══════════════════════════════════════

def _find_kp_for_food(food):
    kp = KitchenProduct.objects.filter(recipe__food=food).first()
    if kp:
        return kp
    kp = KitchenProduct.objects.filter(name=food.name).first()
    if kp:
        return kp
    kp = KitchenProduct.all_objects.filter(recipe__food=food).first()
    return kp


# ═══════════════════════════════════════
#  ★★★ ایجاد سفارش ★★★
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pos_create_order(request: HttpRequest):
    try:
        data = request.data
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

            if is_ready or (isinstance(raw_id, str) and str(raw_id).startswith("ready_")):
                rm_id = int(str(raw_id).replace("ready_", ""))
                rm = ReadyMaterial.objects.filter(id=rm_id).first()
                if not rm:
                    return JsonResponse({"success": False, "error": f"کالای آماده {rm_id} پیدا نشد"})
                if qty > int(rm.quantity):
                    stock_errors.append(f"{rm.name}: سفارش {qty} ولی موجودی {int(rm.quantity)}")
                    continue
                validated_items.append({
                    "type": "ready", "obj": rm, "qty": qty,
                    "price": int(rm.selling_price),
                })
            else:
                food_id = int(raw_id) if raw_id else 0
                food = Food.objects.filter(id=food_id).first() if food_id > 0 else None
                if not food:
                    return JsonResponse(
                        {"success": False, "error": f"غذا با شناسه {raw_id} پیدا نشد"},
                        status=400,
                    )
                try:
                    db_price = int(food.final_price)
                except (ValueError, TypeError, InvalidOperation):
                    db_price = int(food.price or 0)

                kp = _find_kp_for_food(food)
                if kp:
                    try:
                        inv = KitchenInventory.objects.get(kitchen_product=kp)
                        available = inv.available_quantity
                    except KitchenInventory.DoesNotExist:
                        available = 0
                    if qty > available:
                        stock_errors.append(f"{food.name}: سفارش {qty} ولی موجودی {available}")
                        continue

                validated_items.append({
                    "type": "food", "obj": food,
                    "kp_id": kp.id if kp else None,
                    "qty": qty, "price": db_price,
                })

        if stock_errors:
            return JsonResponse({
                "success": False,
                "error": "موجودی کافی نیست: " + " | ".join(stock_errors),
            })
        if not validated_items:
            return JsonResponse({"success": False, "error": "هیچ آیتم معتبری وجود ندارد"})

        with transaction.atomic():
            restaurant = _resolve_restaurant(request)
            if not restaurant:
                return JsonResponse(
                    {"success": False, "error": "رستوران مشخص نشده — لطفاً وارد شوید"},
                    status=400,
                )

            order = Order.objects.create(
                customer_name=customer_name or "مشتری",
                phone=phone, status="pending", total_price=0,
                restaurant=restaurant,
            )
            total = 0
            order_items = []

            for vi in validated_items:
                qty = vi["qty"]
                price = vi["price"]
                line_total = price * qty
                total += line_total

                if vi["type"] == "ready":
                    rm = vi["obj"]
                    updated = ReadyMaterial.objects.filter(
                        id=rm.id, quantity__gte=qty,
                    ).update(quantity=F('quantity') - qty)
                    if updated == 0:
                        raise ValueError(f"موجودی {rm.name} کافی نیست")

                    OrderItem.objects.create(
                        order=order, food=None, quantity=qty, price=price,
                        restaurant=restaurant,
                    )
                    order_items.append({
                        "name": rm.name, "quantity": qty,
                        "price": price, "line_total": line_total,
                    })
                else:
                    food = vi["obj"]
                    kp_id = vi["kp_id"]
                    if kp_id:
                        updated = KitchenInventory.objects.filter(
                            kitchen_product_id=kp_id,
                            quantity__gte=qty,
                        ).update(quantity=F('quantity') - qty)
                        if updated == 0:
                            raise ValueError(f"موجودی {food.name} کافی نیست")

                    OrderItem.objects.create(
                        order=order, food=food, quantity=qty, price=price,
                        restaurant=restaurant,
                    )
                    order_items.append({
                        "name": food.name, "quantity": qty,
                        "price": price, "line_total": line_total,
                    })

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


# ═══════════════════════════════════════
#  گزارش روزانه
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pos_daily_report(request: HttpRequest):
    try:
        date_str = request.GET.get('date', '')
        if date_str:
            target_date = datetime.date.fromisoformat(date_str)
        else:
            target_date = timezone.localdate()

        start = timezone.make_aware(
            timezone.datetime.combine(target_date, timezone.datetime.min.time()))
        end = timezone.make_aware(
            timezone.datetime.combine(target_date, timezone.datetime.max.time()))

        orders = Order.objects.filter(
            created_at__range=(start, end)).prefetch_related('items__food')
        order_count = orders.count()
        total_sales = sum(o.total_price for o in orders)

        top_items = (
            OrderItem.objects.filter(order__in=orders, food__isnull=False)
            .values('food__name')
            .annotate(qty=Sum('quantity'), total=Sum('price'))
            .order_by('-qty')[:10]
        )
        top_list = [{
            'name': t['food__name'], 'qty': t['qty'],
            'total': int(t['total'] or 0),
        } for t in top_items]

        orders_list = [{
            'id': o.id, 'customer': o.customer_name,
            'items_count': o.items.count(), 'total': int(o.total_price),
            'time': o.created_at.strftime('%H:%M'),
        } for o in orders.order_by('-created_at')]

        waste_logs = WasteLog.objects.filter(created_at__range=(start, end))
        waste_total = sum(w.quantity for w in waste_logs)

        discount_total = 0

        return JsonResponse({
            'success': True,
            'total_sales': int(total_sales),
            'order_count': order_count,
            'discount_total': discount_total,
            'waste_total': waste_total,
            'top_items': top_list,
            'orders': orders_list,
        })
    except Exception as exc:
        logger.exception("Error in daily report")
        return JsonResponse({'success': False, 'error': str(exc)})


# ═══════════════════════════════════════
#  اعتبارسنجی کوپن
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pos_validate_coupon(request):
    try:
        data = request.data
        code = (data.get('code') or '').strip().upper()
        subtotal = int(data.get('subtotal') or 0)
    except (ValueError, TypeError):
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
        return JsonResponse({
            'success': False,
            'error': 'حداقل مبلغ سفارش: ' + str(coupon.min_order_amount) + ' تومان',
        })

    discount = coupon.calculate_discount(Decimal(str(subtotal)))
    desc = coupon.description or (
        (str(coupon.discount_value) + '% تخفیف') if coupon.discount_type == 'percentage'
        else (str(coupon.discount_value) + ' تومان تخفیف')
    )

    return JsonResponse({
        'success': True, 'discount_type': coupon.discount_type,
        'value': int(discount), 'description': desc,
    })


# ═══════════════════════════════════════
#  بستن روز — خلاصه
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pos_close_summary(request):
    today = timezone.localdate()
    orders = Order.objects.filter(created_at__date=today)

    total_sales = orders.aggregate(s=Sum('total_price'))['s'] or 0
    order_count = orders.count()
    delivered = orders.filter(status='delivered').count()
    pending = orders.exclude(status='delivered').count()

    pending_orders = [{
        'id': o.id, 'customer': o.customer_name or 'بدون نام',
        'total': o.total_price,
        'items': [{'name': oi.food.name if oi.food else '?', 'qty': oi.quantity}
                  for oi in o.items.all()],
    } for o in orders.exclude(status='delivered')]

    kitchen_items = []
    for kp in KitchenProduct.objects.filter(is_active=True):
        inv = kp.get_inventory()
        kitchen_items.append({
            'id': kp.id, 'name': kp.name,
            'stock': inv.quantity, 'category': kp.category,
        })

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
        items_detail.append({
            'name': name, 'qty': stats['qty'], 'revenue': stats['revenue'],
        })

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


# ═══════════════════════════════════════
#  ثبت ضایعات از صندوق
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pos_register_waste(request):
    try:
        data = request.data
        items = data.get('items', [])
        if not items:
            return JsonResponse({'success': False, 'error': 'آیتمی ارسال نشد'})
        registered = []
        restaurant = _resolve_restaurant(request)
        if not restaurant:
            return JsonResponse(
                {"success": False, "error": "رستوران مشخص نشده"},
                status=400,
            )
        for item in items:
            kp_id = item.get('kitchen_product_id')
            qty = item.get('quantity', 0)
            note = item.get('note', '')
            if qty <= 0:
                return JsonResponse({
                    'success': False,
                    'error': f'تعداد باید بیشتر از صفر باشد ({qty})',
                })
            try:
                kp = KitchenProduct.objects.get(id=kp_id)
            except KitchenProduct.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': f'محصول آشپزخانه {kp_id} پیدا نشد',
                })
            inv = kp.get_inventory()
            actual_qty = min(qty, inv.quantity)
            if actual_qty > 0:
                inv.quantity -= actual_qty
                inv.save(update_fields=['quantity', 'updated_at'])
                WasteLog.objects.create(
                    kitchen_product_id=kp.id,
                    quantity=actual_qty,
                    reason=note,
                    restaurant=restaurant,
                )
                registered.append(f'{kp.name}×{actual_qty}')
        return JsonResponse({
            'success': True,
            'msg': f'ضایعات ثبت شد: {", ".join(registered)}',
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


# ═══════════════════════════════════════
#  بستن سفارشات معلق
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pos_close_all_pending(request):
    today = timezone.localdate()
    pending = Order.objects.filter(
        created_at__date=today).exclude(status='delivered')
    count = pending.count()
    pending.update(status='delivered')
    return JsonResponse({'success': True, 'msg': f'{count} سفارش تحویل شد'})


# ═══════════════════════════════════════
#  ★★★ بستن روز ★★★
# ═══════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pos_close_day(request):
    today = timezone.localdate()
    user = request.user
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse(
            {"success": False, "error": "رستوران مشخص نشده"},
            status=400,
        )

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
        items_detail.append({
            'name': name, 'qty': stats['qty'], 'revenue': stats['revenue'],
        })

    top_items = sorted(items_detail, key=lambda x: x['qty'], reverse=True)[:5]
    total_cost = 0
    total_profit = total_sales - total_cost - waste_value - discount_total

    inventory_snapshot = {}
    for kp in KitchenProduct.objects.filter(is_active=True):
        inv = kp.get_inventory()
        inventory_snapshot[kp.name] = {
            'product_id': kp.id, 'stock': inv.quantity,
            'price': kp.selling_price or 0,
        }

    report = DayCloseReport.objects.create(
        date=today, total_sales=total_sales, total_cost=total_cost,
        total_profit=total_profit, order_count=order_count,
        delivered_count=delivered_count, waste_count=waste_count,
        waste_value=waste_value, discount_total=discount_total,
        inventory_snapshot=inventory_snapshot, items_detail=items_detail,
        top_items=top_items, closed_by=user,
        restaurant=restaurant,
    )

    DayCloseLog.objects.create(
        date=today, action='close', user=user,
        details={
            'report_id': report.id, 'total_sales': total_sales,
            'order_count': order_count, 'waste_count': waste_count,
            'pending_delivered': pending_count,
        },
        restaurant=restaurant,
    )

    return JsonResponse({
        'success': True, 'report_id': report.id,
        'msg': (f'روز بسته شد — {order_count} سفارش / '
                f'{total_sales:,} تومان فروش / {total_profit:,} سود'),
    })


# ═══════════════════════════════════════
#  تاریخچه بستن
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
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
            'inventory_snapshot': r.inventory_snapshot,
            'items_detail': r.items_detail, 'top_items': r.top_items,
            'closed_by': r.closed_by.username if r.closed_by else '?',
            'closed_at': r.closed_at.strftime('%Y-%m-%d %H:%M'),
        },
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
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


# ═══════════════════════════════════════════════
#  ★★★ ویرایش قیمت غذا از صندوق ★★★
# ═══════════════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pos_update_food_price(request):
    """
    صندوقدار قیمت غذا رو ویرایش می‌کنه
    POST /api/pos/update-food-price/
    body: { "food_id": 7, "price": 300000, "final_price": 250000 }
           final_price اختیاری — اگه نباشه از price میاد
    """
    try:
        data = request.data
        food_id = data.get("food_id")
        price = data.get("price")
        final_price = data.get("final_price")

        if not food_id:
            return JsonResponse({"success": False, "error": "food_id الزامی است"}, status=400)

        food = Food.objects.filter(id=food_id).first()
        if not food:
            return JsonResponse({"success": False, "error": "غذا پیدا نشد"}, status=404)

        # ★ بروزرسانی قیمت
        if price is not None:
            food.price = max(0, int(price))

        if final_price is not None:
            food.final_price = max(0, int(final_price))
        elif price is not None:
            # اگه final_price ارسال نشده، از price استفاده کن
            food.final_price = food.price

        # اگه final_price بیشتر از price بود → بدون تخفیف
        if food.final_price > food.price and food.price > 0:
            food.final_price = food.price

        food.save(update_fields=["price", "final_price"])

        return JsonResponse({
            "success": True,
            "food_id": food.id,
            "name": food.name,
            "price": int(food.price),
            "final_price": int(food.final_price),
            "msg": f"قیمت {food.name} بروزرسانی شد",
        })

    except Exception as exc:
        logger.exception("Error updating food price")
        return JsonResponse({"success": False, "error": str(exc)})


# ═══════════════════════════════════════════════════════
#  ★★★ Public Menu API — آینه صندوق (بدون لاگین) ★★★
# ═══════════════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([AllowAny])
def public_menu_api(request):
    """
    API عمومی منو — آینه صندوق
    از Food model می‌خونه (همون منبع صندوق)
    + بررسی باز/بسته بودن سایت
    """

    # ── ۱. بررسی باز/بسته بودن ──
    restaurant = _resolve_restaurant(request)
    is_open = True
    closed_message = ""

    if restaurant:
        try:
            settings_obj, _ = OnlineOrderSettings.objects.get_or_create(
                restaurant=restaurant,
                defaults={"is_open": True},
            )
            is_open = settings_obj.is_open
            closed_message = settings_obj.closed_message if not settings_obj.is_open else ""
        except Exception:
            pass

    # ── ۲. خواندن غذاها از POS (Food model — همون منبع صندوق) ──
    qs = Food.objects.select_related("category").all()

    cat = request.GET.get("category")
    if cat:
        qs = qs.filter(category_id=cat)

    search = request.GET.get("search")
    if search:
        qs = qs.filter(name__icontains=search)

    foods = qs.order_by("category__name", "name")

    # ── ۳. صفحه‌بندی ──
    page_size = int(request.GET.get("page_size", 100))
    page = int(request.GET.get("page", 1))
    start = (page - 1) * page_size
    total = foods.count()
    items = foods[start:start + page_size]

    # ── ۴. ساخت خروجی ──
    data = []
    for food in items:
        # ★ try/except برای قیمت‌های خراب (NaN, None, ...)
        try:
            raw_price = int(food.price or 0)
        except (ValueError, TypeError, InvalidOperation):
            raw_price = 0

        try:
            raw_final = int(food.final_price or 0)
        except (ValueError, TypeError, InvalidOperation):
            raw_final = 0

        # قیمت نهایی
        if raw_price > 0:
            price = raw_price
            final = raw_final if raw_final > 0 else raw_price
        elif raw_final > 0:
            price = raw_final
            final = raw_final
        else:
            price = 0
            final = 0

        # تخفیف
        discount_info = None
        if final < price and price > 0:
            diff = price - final
            pct = round(diff / price * 100)
            discount_info = {
                "type": "percentage",
                "value": pct,
                "label": f"{pct}% تخفیف",
            }

        # وقتی سایت بسته‌ست، همه ناموجود
        available = is_open and getattr(food, "is_available", True)

        # تصویر: اول Food، بعد KitchenProduct
        image_url = None
        if getattr(food, "image", None) and food.image:
            image_url = food.image.url
        else:
            kp = _find_kp_for_food(food)
            if kp and getattr(kp, "image", None) and kp.image:
                image_url = kp.image.url

        data.append({
            "id": food.id,
            "name": food.name,
            "description": getattr(food, "description", "") or "",
            "category_id": food.category_id,
            "category_name": food.category.name if food.category else "",
            "price": price,
            "final_price": final,
            "image": image_url,
            "discount": discount_info,
            "is_available": available,
        })

    return DRFResponse({
        "is_open": is_open,
        "closed_message": closed_message,
        "count": len(data),
        "results": data,
        "next": f"?page={page + 1}&page_size={page_size}" if start + page_size < total else None,
    })


# ═══════════════════════════════════════════════
#  ★★★ فروش آنلاین — تب جدید صندوق ★★★
# ═══════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pos_online_orders(request):
    status_filter = request.GET.get("status", "pending")
    since_id = request.GET.get("since")

    qs = Order.objects.filter(source="online").prefetch_related("items__food")

    if status_filter != "all":
        qs = qs.filter(status=status_filter)

    if since_id:
        qs = qs.filter(id__gt=int(since_id))

    orders = qs.order_by("-created_at")[:50]

    data = []
    for o in orders:
        items = []
        for oi in o.items.all():
            items.append({
                "id": oi.id,
                "food_name": oi.food.name if oi.food else "کالای آماده",
                "quantity": oi.quantity,
                "price": int(oi.price or 0),
            })
        data.append({
            "id": o.id,
            "customer_name": o.customer_name,
            "phone": o.phone,
            "status": o.status,
            "payment_status": o.payment_status,
            "payment_method": o.payment_method,
            "total_price": int(o.total_price),
            "items": items,
            "created_at": o.created_at.strftime("%Y-%m-%d %H:%M"),
            "created_at_ts": int(o.created_at.timestamp()),
        })

    return JsonResponse({"success": True, "orders": data})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pos_confirm_online_order(request, order_id):
    try:
        order = Order.objects.prefetch_related("items__food").get(
            id=order_id, source="online",
        )
    except Order.DoesNotExist:
        return JsonResponse(
            {"success": False, "error": "سفارش پیدا نشد"},
            status=404,
        )

    if order.status != "pending":
        return JsonResponse(
            {"success": False, "error": f"سفارش قبلاً {order.get_status_display()} شده"},
            status=400,
        )

    try:
        with transaction.atomic():
            order.status = "confirmed"
            order.payment_status = "paid"
            order.payment_method = request.data.get("payment_method", "online")
            order.confirmed_by = request.user
            order.confirmed_at = timezone.now()
            order.save(update_fields=[
                "status", "payment_status", "payment_method",
                "confirmed_by", "confirmed_at",
            ])

            for item in order.items.all():
                if item.food_id:
                    kp = _find_kp_for_food(item.food)
                    if kp:
                        KitchenInventory.objects.filter(
                            kitchen_product_id=kp.id,
                            quantity__gte=item.quantity,
                        ).update(quantity=F("quantity") - item.quantity)

        return JsonResponse({
            "success": True,
            "msg": f"سفارش #{order.id} تأیید شد",
            "order_id": order.id,
        })

    except Exception as exc:
        logger.exception("Error confirming online order %s", order_id)
        return JsonResponse({"success": False, "error": str(exc)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pos_reject_online_order(request, order_id):
    try:
        order = Order.objects.get(id=order_id, source="online")
    except Order.DoesNotExist:
        return JsonResponse(
            {"success": False, "error": "سفارش پیدا نشد"},
            status=404,
        )

    if order.status != "pending":
        return JsonResponse(
            {"success": False, "error": f"سفارش قبلاً {order.get_status_display()} شده"},
            status=400,
        )

    order.status = "cancelled"
    order.confirmed_by = request.user
    order.confirmed_at = timezone.now()
    order.save(update_fields=["status", "confirmed_by", "confirmed_at"])

    return JsonResponse({
        "success": True,
        "msg": f"سفارش #{order.id} رد شد",
        "order_id": order.id,
    })


# ═══════════════════════════════════════════════════════
#  ★★★ باز/بستن سفارش آنلاین از صندوق ★★★
# ═══════════════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def online_orders_status(request):
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"error": "رستوران یافت نشد"}, status=400)

    settings_obj, _ = OnlineOrderSettings.objects.get_or_create(
        restaurant=restaurant,
        defaults={"is_open": True},
    )
    return JsonResponse({
        "is_open": settings_obj.is_open,
        "closed_message": settings_obj.closed_message,
        "updated_at": settings_obj.updated_at.isoformat() if settings_obj.updated_at else None,
        "updated_by": settings_obj.updated_by.username if settings_obj.updated_by else None,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_online_orders(request):
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({"error": "رستوران یافت نشد"}, status=400)

    settings_obj, _ = OnlineOrderSettings.objects.get_or_create(
        restaurant=restaurant,
        defaults={"is_open": True},
    )

    new_state = request.data.get("is_open")
    if new_state is None:
        settings_obj.is_open = not settings_obj.is_open
    else:
        settings_obj.is_open = bool(new_state)

    msg = request.data.get("closed_message")
    if msg is not None:
        settings_obj.closed_message = msg

    settings_obj.updated_by = request.user
    settings_obj.save()

    status_text = "باز شد" if settings_obj.is_open else "بسته شد"
    return JsonResponse({
        "success": True,
        "is_open": settings_obj.is_open,
        "msg": f"سفارش آنلاین {status_text}",
        "closed_message": settings_obj.closed_message,
    })