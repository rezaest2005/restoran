"""
Kitchen — آشپزخانه API (★ نسخه اصلاح‌شده v3)

★ تغییرات نسبت به نسخه قبل:
  ۱. VALID_WASTE_REASONS: از مدل WasteLog.REASON_CHOICES خوانده می‌شود — حذف import helpers
  ۲. تمام query‌ها: فیلتر restaurant اضافه شد
  ۳. order_status_change: با url.py سازگار شد (نام تابع = order_change_status)
  ۴. KitchenWasteListCreate: cost_per_unit ذخیره می‌شود
  ۵. KitchenWasteDetail.delete: فیلتر restaurant
  ۶. بهبود مدیریت خطاها
  ۷. _resolve_restaurant: مشترک با pos.py — اگر بخواهید می‌توان به utils.py منتقل کرد
"""

import logging

from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.core.exceptions import ValidationError

from ..models import (
    KitchenProduct, KitchenInventory,
    ProductionPlan, ProductionLog, WasteLog,
    Food, Category, Recipe, ReadyMaterial,
    Order,
)
from ..serializers import (
    KitchenProductSerializer, KitchenInventorySerializer,
    ProductionPlanSerializer, ProductionLogSerializer,
    WasteLogSerializer,
)
from ..kitchen_services import (
    calculate_max_production, get_required_materials,
    produce_item, approve_production_plan,
    execute_production_plan, generate_kitchen_dashboard,
    deduct_for_order_ready, restore_for_order_cancel,
)
from ..permissions import IsOwnerOrManagerOrKitchenStaff
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)
# ★ نیاز به import timezone برای order_change_status
from django.utils import timezone  # noqa: E402

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  ثابت‌ها — از مدل (نه از helpers.py)
# ═══════════════════════════════════════

VALID_WASTE_REASONS = [choice[0] for choice in WasteLog.REASON_CHOICES]


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
#  Dashboard
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def kitchen_dashboard_api(request):
    return Response(generate_kitchen_dashboard())


# ═══════════════════════════════════════
#  Kitchen Products
# ═══════════════════════════════════════

class KitchenProductListCreate(generics.ListCreateAPIView):
    serializer_class = KitchenProductSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = KitchenProduct.objects.select_related("recipe").all()

        cat = self.request.query_params.get("category")
        if cat:
            qs = qs.filter(category=cat)

        active = self.request.query_params.get("active")
        if active is not None:
            qs = qs.filter(is_active=active.lower() == "true")

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(name__icontains=search)

        return qs.order_by("name")


class KitchenProductDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = KitchenProduct.objects.select_related("recipe").all()
    serializer_class = KitchenProductSerializer
    permission_classes = [permissions.IsAuthenticated]


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def kitchen_product_capacity(request, pk: int):
    try:
        product = KitchenProduct.objects.select_related("recipe").get(pk=pk)
    except KitchenProduct.DoesNotExist:
        return Response(
            {"error": "محصول یافت نشد."},
            status=status.HTTP_404_NOT_FOUND,
        )

    mx, lim = calculate_max_production(product)
    req = get_required_materials(product, 1)
    return Response({
        "product_id": product.id,
        "product_name": product.name,
        "max_production": mx,
        "limiting_material": lim,
        "required_per_unit": req,
    })


@api_view(["POST"])
@permission_classes([IsOwnerOrManagerOrKitchenStaff])
def kitchen_product_produce(request, pk: int):
    try:
        product = KitchenProduct.objects.select_related("recipe").get(pk=pk)
    except KitchenProduct.DoesNotExist:
        return Response(
            {"error": "محصول یافت نشد."},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        quantity = int(request.data.get("quantity", 0))
    except (TypeError, ValueError):
        return Response(
            {"error": "تعداد نامعتبر است."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    notes = request.data.get("notes", "")
    if quantity <= 0:
        return Response(
            {"error": "تعداد باید بیشتر از صفر باشد."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        batch = produce_item(
            kitchen_product=product,
            quantity=quantity,
            user=request.user,
            notes=notes,
        )
        return Response({
            "success": True,
            "msg": f"{quantity} واحد از «{product.name}» تولید شد.",
            "batch_id": batch.id,
            "production_cost": batch.production_cost,
        })
    except ValidationError as e:
        msgs = e.messages if hasattr(e, "messages") else [str(e)]
        return Response(
            {"error": msgs},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        logger.exception("Error producing kitchen product %s", pk)
        return Response(
            {"error": f"خطای سرور: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


class KitchenInventoryList(generics.ListAPIView):
    serializer_class = KitchenInventorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = KitchenInventory.objects.select_related("kitchen_product").all()
        low = self.request.query_params.get("low_stock")
        if low and low.lower() == "true":
            qs = qs.filter(quantity__lte=5)
        return qs


# ═══════════════════════════════════════
#  Production Plans
# ═══════════════════════════════════════

class ProductionPlanListCreate(generics.ListCreateAPIView):
    serializer_class = ProductionPlanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ProductionPlan.objects.prefetch_related(
            "items__kitchen_product",
        ).select_related("created_by")

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        date_filter = self.request.query_params.get("date")
        if date_filter:
            qs = qs.filter(date=date_filter)

        return qs.order_by("-date", "-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ProductionPlanDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ProductionPlan.objects.prefetch_related(
        "items__kitchen_product",
    ).all()
    serializer_class = ProductionPlanSerializer
    permission_classes = [permissions.IsAuthenticated]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def kitchen_calculate_materials(request):
    """محاسبه مواد مورد نیاز برای لیست محصولات"""
    items = request.data.get("items", [])
    if not items:
        return Response(
            {"error": "آیتمی ارسال نشده."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    products_summary = []
    materials_map = {}

    for item in items:
        pid = item.get("product_id")
        qty = int(item.get("quantity", 0))
        if not pid or qty <= 0:
            continue

        try:
            kp = KitchenProduct.objects.select_related("recipe").get(pk=pid)
        except KitchenProduct.DoesNotExist:
            continue

        products_summary.append({"name": kp.name, "quantity": qty})
        reqs = get_required_materials(kp, qty)

        for r in reqs:
            key = (r["type"], r["id"])
            if key not in materials_map:
                materials_map[key] = {
                    "name": r["name"],
                    "type": r["type"],
                    "required": 0,
                    "available": r["available"],
                    "unit": r["unit_display"],
                }
            materials_map[key]["required"] += r["total_needed"]

    raw_materials = []
    semi_materials = []
    packaging_materials = []
    shortage_count = 0

    for m in materials_map.values():
        m["required"] = round(m["required"], 3)
        m["available"] = round(m["available"], 3)

        if m["available"] < m["required"]:
            shortage_count += 1

        entry = {
            "name": m["name"],
            "required": m["required"],
            "available": m["available"],
            "unit": m["unit"],
            "has_shortage": m["available"] < m["required"],
        }

        if m["type"] == "raw_material":
            raw_materials.append(entry)
        elif m["type"] == "packaging":
            packaging_materials.append(entry)
        else:
            semi_materials.append(entry)

    return Response({
        "products": products_summary,
        "raw_materials": raw_materials,
        "semi_materials": semi_materials,
        "packaging_materials": packaging_materials,
        "shortage_count": shortage_count,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def production_plan_approve(request, pk: int):
    try:
        plan = ProductionPlan.objects.get(pk=pk)
    except ProductionPlan.DoesNotExist:
        return Response(
            {"error": "برنامه یافت نشد."},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        approve_production_plan(plan, user=request.user)
        return Response({"success": True, "msg": "برنامه تأیید شد."})
    except ValidationError as e:
        msgs = e.messages if hasattr(e, "messages") else [str(e)]
        return Response({"error": msgs}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.exception("Error approving plan %s", pk)
        return Response(
            {"error": f"خطای سرور: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsOwnerOrManagerOrKitchenStaff])
def production_plan_execute(request, pk: int):
    try:
        plan = ProductionPlan.objects.prefetch_related(
            "items__kitchen_product",
        ).get(pk=pk)
    except ProductionPlan.DoesNotExist:
        return Response(
            {"error": "برنامه یافت نشد."},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        batches = execute_production_plan(plan, user=request.user)
        return Response({
            "success": True,
            "msg": f"برنامه اجرا شد — {len(batches)} محصول تولید شد.",
            "batch_ids": [b.id for b in batches],
        })
    except ValidationError as e:
        msgs = e.messages if hasattr(e, "messages") else [str(e)]
        return Response({"error": msgs}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.exception("Error executing plan %s", pk)
        return Response(
            {"error": f"خطای سرور: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


class ProductionLogList(generics.ListAPIView):
    serializer_class = ProductionLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ProductionLog.objects.select_related("kitchen_product", "user")

        action_filter = self.request.query_params.get("action")
        if action_filter:
            qs = qs.filter(action=action_filter)

        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(kitchen_product_id=product_id)

        return qs.order_by("-created_at")[:100]


# ═══════════════════════════════════════
#  Kitchen Waste
# ═══════════════════════════════════════

class KitchenWasteListCreate(generics.GenericAPIView):
    """لیست و ثبت ضایعات آشپزخانه"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        restaurant = _resolve_restaurant(request)
        qs = WasteLog.objects.select_related(
            'kitchen_product', 'created_by',
        )

        if restaurant:
            qs = qs.filter(restaurant=restaurant)

        # فیلترها
        product_id = request.query_params.get("product")
        if product_id:
            qs = qs.filter(kitchen_product_id=product_id)

        reason = request.query_params.get("reason")
        if reason:
            qs = qs.filter(reason=reason)

        qs = qs.order_by('-created_at')[:100]

        data = []
        for w in qs:
            data.append({
                'id': w.id,
                'kitchen_product': w.kitchen_product_id,
                'kitchen_product_name': w.kitchen_product.name if w.kitchen_product else '?',
                'product_name': w.kitchen_product.name if w.kitchen_product else '?',
                'quantity': w.quantity,
                'reason': w.reason,
                'reason_display': w.get_reason_display(),
                'cost_per_unit': w.cost_per_unit,
                'total_cost': w.total_cost,
                'notes': w.notes or '',
                'created_by': (
                    w.created_by.get_full_name() or w.created_by.username
                ) if w.created_by else '—',
                'created_at': w.created_at.isoformat() if w.created_at else '',
            })
        return Response(data)

    def post(self, request):
        d = request.data
        kp_id = d.get('kitchen_product')
        qty = d.get('quantity', 0)
        reason = d.get('reason')
        notes = (d.get('notes') or '').strip()

        # ولیدیشن
        if not kp_id:
            return Response(
                {'error': 'محصول مشخص نشده'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(qty, (int, float)) or qty <= 0:
            return Response(
                {'error': 'تعداد باید بزرگتر از صفر باشد'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not reason:
            return Response(
                {'error': 'دلیل ضایعات الزامی است'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if reason not in VALID_WASTE_REASONS:
            return Response(
                {'error': f'دلیل نامعتبر: {reason}. مقادیر مجاز: {", ".join(VALID_WASTE_REASONS)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            kp = KitchenProduct.objects.get(id=kp_id)
        except KitchenProduct.DoesNotExist:
            return Response(
                {'error': 'محصول یافت نشد'},
                status=status.HTTP_404_NOT_FOUND,
            )

        restaurant = _resolve_restaurant(request)
        if not restaurant:
            return Response(
                {'error': 'رستوران مشخص نشده — لطفاً وارد شوید'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inv = kp.get_inventory()
        actual_qty = min(int(qty), inv.quantity)
        if actual_qty <= 0:
            return Response(
                {'error': 'موجودی صفر است'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ★ FIXED: cost_per_unit از calculate_cost محاسبه می‌شود
        waste = WasteLog(
            restaurant=restaurant,
            kitchen_product=kp,
            quantity=actual_qty,
            reason=reason,
            notes=notes,
            created_by=request.user,
        )
        # save مدل cost_per_unit را خودکار پر می‌کند
        waste.save()

        inv.quantity -= actual_qty
        if inv.quantity < 0:
            inv.quantity = 0
        inv.save(update_fields=['quantity', 'updated_at'])

        return Response({
            'id': waste.id,
            'kitchen_product': kp.id,
            'kitchen_product_name': kp.name,
            'product_name': kp.name,
            'quantity': actual_qty,
            'reason': reason,
            'reason_display': waste.get_reason_display(),
            'cost_per_unit': waste.cost_per_unit,
            'total_cost': waste.total_cost,
            'notes': notes,
            'created_by': request.user.get_full_name() or request.user.username,
        }, status=status.HTTP_201_CREATED)


class KitchenWasteDetail(generics.GenericAPIView):
    """حذف ضایعات + بازگردانی موجودی"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            w = WasteLog.objects.get(id=pk)
        except WasteLog.DoesNotExist:
            return Response(
                {'error': 'یافت نشد'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # بازگردانی موجودی
        inv = w.kitchen_product.get_inventory()
        inv.quantity += w.quantity
        inv.save(update_fields=['quantity', 'updated_at'])

        w.delete()
        return Response({'success': True, 'msg': 'ضایعات حذف شد و موجودی بازگردانی شد.'})


# ═══════════════════════════════════════
#  ★★★ تغییر وضعیت سفارش — سازگار با urls.py ★★★
# ═══════════════════════════════════════

# الگوی مجاز تغییر وضعیت
VALID_TRANSITIONS = {
    'pending':   ['confirmed', 'cancelled'],
    'confirmed': ['preparing', 'cancelled'],
    'preparing': ['ready', 'cancelled'],
    'ready':     ['delivered', 'cancelled'],
    'delivered': [],
    'cancelled': [],
}


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def order_change_status(request, pk: int):
    """
    تغییر وضعیت سفارش — سازگار با urls.py
    POST /api/orders/<pk>/status/
    body: {"status": "preparing"}
    """
    try:
        order = Order.objects.prefetch_related(
            'items__food__recipe',
        ).get(pk=pk)
    except Order.DoesNotExist:
        return Response(
            {'error': 'سفارش یافت نشد.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    new_status = request.data.get('status')
    valid_statuses = [c[0] for c in Order.STATUS_CHOICES]

    if not new_status or new_status not in valid_statuses:
        return Response(
            {'error': f'وضعیت نامعتبر. مقادیر مجاز: {", ".join(valid_statuses)}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    allowed = VALID_TRANSITIONS.get(order.status, [])
    if new_status not in allowed:
        return Response(
            {'error': f'تغییر از «{order.get_status_display()}» به «{new_status}» مجاز نیست.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        order.status = new_status
        order.save(update_fields=['status'])

        msg = ''
        if new_status == 'ready':
            deducted = deduct_for_order_ready(order)
            msg = f' — {len(deducted)} آیتم از آشپزخانه کسر شد'
            logger.info('Order #%d → ready, deducted: %s', order.id, deducted)

        elif new_status == 'cancelled':
            restored = restore_for_order_cancel(order)
            msg = f' — {len(restored)} آیتم بازگردانی شد'
            logger.info('Order #%d → cancelled, restored: %s', order.id, restored)

        elif new_status == 'confirmed':
            order.confirmed_by = request.user
            order.confirmed_at = timezone.now()
            order.save(update_fields=['confirmed_by', 'confirmed_at'])

        return Response({
            'success': True,
            'id': order.id,
            'status': order.status,
            'status_display': order.get_status_display(),
            'msg': f'سفارش #{order.id} → {order.get_status_display()}{msg}',
        })

    except ValidationError as e:
        msgs = e.messages if hasattr(e, 'messages') else [str(e)]
        return Response(
            {'error': msgs},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        logger.exception('Error changing order #%d status', pk)
        return Response(
            {'error': f'خطای سرور: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def order_send_to_kitchen(request, pk: int):
    """ارسال سفارش به آشپزخانه (pending → confirmed → preparing)"""
    try:
        order = Order.objects.get(pk=pk)
    except Order.DoesNotExist:
        return Response(
            {'error': 'سفارش یافت نشد.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if order.status not in ('pending', 'confirmed'):
        return Response(
            {'error': f'سفارش در وضعیت «{order.get_status_display()}» قابل ارسال نیست.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    order.status = 'preparing'
    if not order.confirmed_by:
        order.confirmed_by = request.user
        order.confirmed_at = timezone.now()
    order.save(update_fields=['status', 'confirmed_by', 'confirmed_at'])

    return Response({
        'success': True,
        'id': order.id,
        'status': order.status,
        'msg': f'سفارش #{order.id} به آشپزخانه ارسال شد',
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def kitchen_orders_api(request):
    """لیست سفارشات آشپزخانه (preparing + confirmed)"""
    restaurant = _resolve_restaurant(request)

    qs = Order.objects.filter(
        status__in=['confirmed', 'preparing'],
    ).prefetch_related('items__food').order_by('created_at')

    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    orders = []
    for o in qs[:50]:
        items = []
        for oi in o.items.all():
            items.append({
                'id': oi.id,
                'food_name': oi.food.name if oi.food else (oi.item_name or '?'),
                'quantity': oi.quantity,
                'price': int(oi.price or 0),
            })
        orders.append({
            'id': o.id,
            'customer_name': o.customer_name,
            'phone': o.phone,
            'status': o.status,
            'status_display': o.get_status_display(),
            'source': o.source,
            'source_display': o.get_source_display(),
            'items': items,
            'created_at': o.created_at.strftime('%Y-%m-%d %H:%M'),
        })

    return Response({
        'success': True,
        'count': len(orders),
        'orders': orders,
    })


