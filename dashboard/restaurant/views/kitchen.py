"""
Kitchen management API.
"""
import json as json_module
import logging

from django.db.models import F
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST

from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.contrib.admin.views.decorators import staff_member_required
from django.core.exceptions import ValidationError

from ..models import (
    KitchenProduct, KitchenInventory, KitchenDiscount,
    ProductionPlan, ProductionLog, WasteLog,
    Food, Category, Recipe, ReadyMaterial,
)
from ..serializers import (
    KitchenProductSerializer, KitchenInventorySerializer,
    KitchenDiscountSerializer, ProductionPlanSerializer,
    ProductionLogSerializer,
)
from ..kitchen_services import (
    calculate_max_production, get_required_materials,
    produce_item, approve_production_plan,
    execute_production_plan, generate_kitchen_dashboard,
)
from ..permissions import IsOwnerOrManagerOrKitchenStaff
from .helpers import _build_foods_with_discounts, _get_food_discount_info, VALID_WASTE_REASONS

import json as json_lib

logger = logging.getLogger(__name__)


@staff_member_required
def kitchen_dashboard_api(request):
    from rest_framework.decorators import api_view
    return JsonResponse(generate_kitchen_dashboard(), safe=False)


class KitchenProductListCreate(generics.ListCreateAPIView):
    serializer_class = KitchenProductSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = KitchenProduct.objects.select_related("recipe").prefetch_related("discounts").all()
        cat = self.request.query_params.get("category")
        if cat:
            qs = qs.filter(category=cat)
        active = self.request.query_params.get("active")
        if active is not None:
            qs = qs.filter(is_active=active.lower() == "true")
        return qs


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
        return Response({"error": "محصول یافت نشد."}, status=status.HTTP_404_NOT_FOUND)
    mx, lim = calculate_max_production(product)
    req = get_required_materials(product, 1)
    return Response({
        "product_id": product.id, "product_name": product.name,
        "max_production": mx, "limiting_material": lim, "required_per_unit": req,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def kitchen_product_produce(request, pk: int):
    try:
        product = KitchenProduct.objects.select_related("recipe").get(pk=pk)
    except KitchenProduct.DoesNotExist:
        return Response({"error": "محصول یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

    try:
        quantity = int(request.data.get("quantity", 0))
    except (TypeError, ValueError):
        return Response({"error": "تعداد نامعتبر است."}, status=status.HTTP_400_BAD_REQUEST)

    notes = request.data.get("notes", "")
    if quantity <= 0:
        return Response({"error": "تعداد باید بیشتر از صفر باشد."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        batch = produce_item(kitchen_product=product, quantity=quantity, user=request.user, notes=notes)
        return Response({
            "success": True, "msg": f'{quantity} واحد از «{product.name}» تولید شد.',
            "batch_id": batch.id, "production_cost": batch.production_cost,
        })
    except ValidationError as e:
        msgs = e.messages if hasattr(e, "messages") else [str(e)]
        return Response({"error": msgs}, status=status.HTTP_400_BAD_REQUEST)


class KitchenInventoryList(generics.ListAPIView):
    queryset = KitchenInventory.objects.select_related("kitchen_product").all()
    serializer_class = KitchenInventorySerializer
    permission_classes = [permissions.IsAuthenticated]


class ProductionPlanListCreate(generics.ListCreateAPIView):
    serializer_class = ProductionPlanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ProductionPlan.objects.prefetch_related("items__kitchen_product").select_related("created_by").order_by("-date", "-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ProductionPlanDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ProductionPlan.objects.prefetch_related("items__kitchen_product").all()
    serializer_class = ProductionPlanSerializer
    permission_classes = [permissions.IsAuthenticated]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def kitchen_calculate_materials(request):
    items = request.data.get("items", [])
    if not items:
        return Response({"error": "آیتمی ارسال نشده."}, status=status.HTTP_400_BAD_REQUEST)

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
                    "name": r["name"], "type": r["type"],
                    "required": 0, "available": r["available"], "unit": r["unit_display"],
                }
            materials_map[key]["required"] += r["total_needed"]

    raw_materials = []
    semi_materials = []
    shortage_count = 0

    for m in materials_map.values():
        m["required"] = round(m["required"], 2)
        if m["available"] < m["required"]:
            shortage_count += 1
        entry = {"name": m["name"], "required": m["required"], "available": round(m["available"], 2), "unit": m["unit"]}
        if m["type"] == "raw_material":
            raw_materials.append(entry)
        else:
            semi_materials.append(entry)

    return Response({
        "products": products_summary,
        "raw_materials": raw_materials,
        "semi_materials": semi_materials,
        "shortage_count": shortage_count,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def production_plan_approve(request, pk: int):
    try:
        plan = ProductionPlan.objects.get(pk=pk)
    except ProductionPlan.DoesNotExist:
        return Response({"error": "برنامه یافت نشد."}, status=status.HTTP_404_NOT_FOUND)
    try:
        approve_production_plan(plan, user=request.user)
        return Response({"success": True, "msg": "برنامه تأیید شد."})
    except ValidationError as e:
        msgs = e.messages if hasattr(e, "messages") else [str(e)]
        return Response({"error": msgs}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.exception("Error approving plan %s", pk)
        return Response({"error": f"خطای سرور: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([IsOwnerOrManagerOrKitchenStaff])
def production_plan_execute(request, pk: int):
    try:
        plan = ProductionPlan.objects.prefetch_related("items__kitchen_product").get(pk=pk)
    except ProductionPlan.DoesNotExist:
        return Response({"error": "برنامه یافت نشد."}, status=status.HTTP_404_NOT_FOUND)
    try:
        batches = execute_production_plan(plan, user=request.user)
        return Response({"success": True, "msg": f"برنامه اجرا شد — {len(batches)} محصول تولید شد.", "batch_ids": [b.id for b in batches]})
    except ValidationError as e:
        msgs = e.messages if hasattr(e, "messages") else [str(e)]
        return Response({"error": msgs}, status=status.HTTP_400_BAD_REQUEST)


class KitchenDiscountListCreate(generics.ListCreateAPIView):
    serializer_class = KitchenDiscountSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = KitchenDiscount.objects.select_related("kitchen_product").all()
        active = self.request.query_params.get("active")
        if active is not None:
            qs = qs.filter(is_active=active.lower() == "true")
        return qs


class KitchenDiscountDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = KitchenDiscount.objects.select_related("kitchen_product").all()
    serializer_class = KitchenDiscountSerializer
    permission_classes = [permissions.IsAuthenticated]


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


# ═══ Kitchen Waste ═══

class KitchenWasteListCreate(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        logs = WasteLog.objects.select_related('kitchen_product').order_by('-created_at')
        data = [{
            'id': w.id, 'kitchen_product': w.kitchen_product_id,
            'kitchen_product_name': w.kitchen_product.name if w.kitchen_product else '?',
            'quantity': w.quantity, 'reason': getattr(w, 'reason', '') or '',
            'created_at': w.created_at.isoformat() if hasattr(w, 'created_at') else '',
        } for w in logs]
        return Response(data)

    def post(self, request):
        d = request.data
        kp_id = d.get('kitchen_product')
        qty = d.get('quantity', 0)
        reason = d.get('reason')

        if not kp_id:
            return Response({'error': 'محصول مشخص نشده'}, status=400)
        if not isinstance(qty, (int, float)) or qty <= 0:
            return Response({'error': 'تعداد باید بزرگتر از صفر باشد'}, status=400)
        if not reason:
            return Response({'error': 'دلیل ضایعات الزامی است'}, status=400)
        if reason not in VALID_WASTE_REASONS:
            return Response({'error': f'دلیل نامعتبر: {reason}'}, status=400)

        try:
            kp = KitchenProduct.objects.get(id=kp_id)
        except KitchenProduct.DoesNotExist:
            return Response({'error': 'محصول یافت نشد'}, status=404)

        inv = kp.get_inventory()
        actual_qty = min(qty, inv.quantity)
        if actual_qty <= 0:
            return Response({'error': 'موجودی صفر است'}, status=400)

        waste = WasteLog.objects.create(kitchen_product=kp, quantity=actual_qty, reason=reason)
        inv.quantity -= actual_qty
        if inv.quantity < 0:
            inv.quantity = 0
        inv.save(update_fields=['quantity', 'updated_at'])

        return Response({
            'id': waste.id, 'kitchen_product': kp.id,
            'quantity': actual_qty, 'reason': reason,
        }, status=201)


class KitchenWasteDetail(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            w = WasteLog.objects.get(id=pk)
        except WasteLog.DoesNotExist:
            return Response({'error': 'یافت نشد'}, status=404)
        inv = w.kitchen_product.get_inventory()
        inv.quantity += w.quantity
        inv.save(update_fields=['quantity', 'updated_at'])
        w.delete()
        return Response({'success': True})