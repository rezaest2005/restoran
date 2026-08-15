"""
All DRF ModelViewSets (★ نسخه v4 — اصلاح شده)

★ v4 تغییرات:
  ۱. تمام ViewSet‌ها فیلتر restaurant دارن
  ۲. RewardViewSet.redeem_action: از self.get_object() استفاده میکنه
  ۳. OrderViewSet.create: final_price = 0 درست هندل میشه
"""

import logging

from django.db import transaction
from django.db.models import Q

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import (
    Category, Food, Table, Reservation, Order, OrderItem,
    SemiFinished, ReadyMaterial,
)
from ..serializers import (
    CategorySerializer, FoodSerializer, TableSerializer,
    ReservationSerializer, OrderSerializer,
    SemiFinishedSerializer, ReadyMaterialSerializer,
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


# ═══════════════════════════════════════════════════════════════════
#  1. FOOD & CATEGORY
# ═══════════════════════════════════════════════════════════════════

class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Category.objects.all()

        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)

        active = self.request.query_params.get("active")
        if active is not None:
            qs = qs.filter(is_active=active.lower() == "true")
        else:
            qs = qs.filter(is_active=True)

        return qs.order_by("order")


class FoodViewSet(viewsets.ModelViewSet):
    serializer_class = FoodSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Food.objects.select_related("category").all()

        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)

        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)

        available = self.request.query_params.get("available")
        if available is not None:
            qs = qs.filter(is_available=available.lower() == "true")

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(name__icontains=search)

        return qs.order_by("category__order", "name")


# ═══════════════════════════════════════════════════════════════════
#  2. TABLES & RESERVATIONS
# ═══════════════════════════════════════════════════════════════════

class TableViewSet(viewsets.ModelViewSet):
    serializer_class = TableSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Table.objects.all()
        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        return qs


class ReservationViewSet(viewsets.ModelViewSet):
    serializer_class = ReservationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Reservation.objects.all()
        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        return qs.order_by("-date", "-time")


# ═══════════════════════════════════════════════════════════════════
#  3. ORDERS
# ═══════════════════════════════════════════════════════════════════

class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Order.objects.prefetch_related('items__food').all()
        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        source = self.request.query_params.get("source")
        if source:
            qs = qs.filter(source=source)

        return qs.order_by("-created_at")

    def create(self, request):
        restaurant = _resolve_restaurant(request)
        if not restaurant:
            return Response(
                {"error": "رستوران مشخص نشده."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items_data = request.data.get("items", [])
        if not items_data:
            return Response(
                {"error": "آیتمی ارسال نشد."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for field in ("customer_name", "phone"):
            if field not in request.data or not str(request.data[field]).strip():
                return Response(
                    {"error": f"فیلد «{field}» الزامی است."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # قیمت از دیتابیس — نه از کلاینت
        food_ids = [item.get("food") for item in items_data if item.get("food")]
        foods_map = {
            f.id: f for f in Food.objects.filter(id__in=food_ids, restaurant=restaurant)
        }

        for item in items_data:
            fid = item.get("food")
            if not fid or fid not in foods_map:
                return Response(
                    {"error": f"غذا با شناسه {fid} یافت نشد."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qty = item.get("quantity", 0)
            if not qty or int(qty) < 1:
                return Response(
                    {"error": f"تعداد غذا با شناسه {fid} نامعتبر است."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            total_price = 0
            order = Order.objects.create(
                restaurant=restaurant,
                customer_name=request.data["customer_name"],
                phone=request.data["phone"],
                table_id=request.data.get("table"),
                total_price=0,
                source=request.data.get("source", "pos"),
                payment_method=request.data.get("payment_method", "cash"),
            )

            for item in items_data:
                food = foods_map[item["food"]]
                qty = int(item["quantity"])
                # ★ FIXED: final_price = 0 درست هندل میشه
                fp = getattr(food, "final_price", None)
                price = int(fp if fp is not None else food.price)
                total_price += price * qty
                OrderItem.objects.create(
                    restaurant=restaurant,
                    order=order, food=food,
                    quantity=qty, price=price,
                )

            order.total_price = total_price
            order.save(update_fields=["total_price"])

        return Response(
            OrderSerializer(order).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        order = self.get_object()
        new_status = request.data.get("status")

        if new_status:
            valid = [c[0] for c in Order.STATUS_CHOICES]
            if new_status not in valid:
                return Response(
                    {"error": f"وضعیت نامعتبر. مقادیر مجاز: {', '.join(valid)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            order.status = new_status
            order.save(update_fields=["status"])
        else:
            update_fields = []
            for field in ("customer_name", "phone", "notes"):
                if field in request.data:
                    setattr(order, field, request.data[field])
                    update_fields.append(field)
            if update_fields:
                order.save(update_fields=update_fields)
            else:
                return Response(
                    {"error": "فیلدی برای بروزرسانی ارسال نشد."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        return Response(OrderSerializer(order).data)


# ═══════════════════════════════════════════════════════════════════
#  4. INVENTORY
# ═══════════════════════════════════════════════════════════════════

class SemiFinishedViewSet(viewsets.ModelViewSet):
    serializer_class = SemiFinishedSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = SemiFinished.objects.all()
        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        return qs


class ReadyMaterialViewSet(viewsets.ModelViewSet):
    serializer_class = ReadyMaterialSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ReadyMaterial.objects.select_related("supplier").all()

        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(barcode__icontains=search),
            )

        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category_id=category)

        return qs.order_by("name")
