"""
All DRF ModelViewSets (â˜… Ù†Ø³Ø®Ù‡ v4 â€” Ø§ØµÙ„Ø§Ø­ Ø´Ø¯Ù‡)

â˜… v4 ØªØºÛŒÛŒØ±Ø§Øª:
  Û±. ØªÙ…Ø§Ù… ViewSetâ€ŒÙ‡Ø§ ÙÛŒÙ„ØªØ± restaurant Ø¯Ø§Ø±Ù†
  Û². RewardViewSet.redeem_action: Ø§Ø² self.get_object() Ø§Ø³ØªÙØ§Ø¯Ù‡ Ù…ÛŒÚ©Ù†Ù‡
  Û³. OrderViewSet.create: final_price = 0 Ø¯Ø±Ø³Øª Ù‡Ù†Ø¯Ù„ Ù…ÛŒØ´Ù‡
"""

import logging

from django.db import transaction
from django.db.models import Q

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import (
    Category,
    Food,
    Order,
    OrderItem,
)
from ..serializers import (
    CategorySerializer,
    FoodSerializer,
    OrderSerializer,
)

from ..tenancy import (
    get_current_restaurant,
    set_current_restaurant,
    get_restaurant_from_request,
)

logger = logging.getLogger(__name__)


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  resolve restaurant â€” fallback
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    return None


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  1. FOOD & CATEGORY
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


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


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  2. TABLES & RESERVATIONS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


# [COMMENTED] class TableViewSet(viewsets.ModelViewSet):
# [COMMENTED]     serializer_class = TableSerializer
# [COMMENTED]     permission_classes = [IsAuthenticated]
# [COMMENTED] 
# [COMMENTED]     def get_queryset(self):
# [X] # [COMMENTED]         qs = Table.objects.all()
# [COMMENTED]         restaurant = _resolve_restaurant(self.request)
# [COMMENTED]         if restaurant:
# [COMMENTED]             qs = qs.filter(restaurant=restaurant)
# [COMMENTED]         return qs
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class ReservationViewSet(viewsets.ModelViewSet):
# [COMMENTED]     serializer_class = ReservationSerializer
# [COMMENTED]     permission_classes = [IsAuthenticated]
# [COMMENTED] 
# [COMMENTED]     def get_queryset(self):
# [X] # [COMMENTED]         qs = Reservation.objects.all()
# [COMMENTED]         restaurant = _resolve_restaurant(self.request)
# [COMMENTED]         if restaurant:
# [COMMENTED]             qs = qs.filter(restaurant=restaurant)
# [COMMENTED]         return qs.order_by("-date", "-time")
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# [COMMENTED] #  3. ORDERS
# [COMMENTED] # â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# [COMMENTED] 
# [COMMENTED] 
class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Order.objects.prefetch_related("items__food").all()
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
                {"error": "Ø±Ø³ØªÙˆØ±Ø§Ù† Ù…Ø´Ø®Øµ Ù†Ø´Ø¯Ù‡."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items_data = request.data.get("items", [])
        if not items_data:
            return Response(
                {"error": "Ø¢ÛŒØªÙ…ÛŒ Ø§Ø±Ø³Ø§Ù„ Ù†Ø´Ø¯."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for field in ("customer_name", "phone"):
            if field not in request.data or not str(request.data[field]).strip():
                return Response(
                    {"error": f"ÙÛŒÙ„Ø¯ Â«{field}Â» Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Ù‚ÛŒÙ…Øª Ø§Ø² Ø¯ÛŒØªØ§Ø¨ÛŒØ³ â€” Ù†Ù‡ Ø§Ø² Ú©Ù„Ø§ÛŒÙ†Øª
        food_ids = [item.get("food") for item in items_data if item.get("food")]
        foods_map = {
            f.id: f for f in Food.objects.filter(id__in=food_ids, restaurant=restaurant)
        }

        for item in items_data:
            fid = item.get("food")
            if not fid or fid not in foods_map:
                return Response(
                    {"error": f"ØºØ°Ø§ Ø¨Ø§ Ø´Ù†Ø§Ø³Ù‡ {fid} ÛŒØ§ÙØª Ù†Ø´Ø¯."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qty = item.get("quantity", 0)
            if not qty or int(qty) < 1:
                return Response(
                    {"error": f"ØªØ¹Ø¯Ø§Ø¯ ØºØ°Ø§ Ø¨Ø§ Ø´Ù†Ø§Ø³Ù‡ {fid} Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª."},
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
                # â˜… FIXED: final_price = 0 Ø¯Ø±Ø³Øª Ù‡Ù†Ø¯Ù„ Ù…ÛŒØ´Ù‡
                fp = getattr(food, "final_price", None)
                price = int(fp if fp is not None else food.price)
                total_price += price * qty
                OrderItem.objects.create(
                    restaurant=restaurant,
                    order=order,
                    food=food,
                    quantity=qty,
                    price=price,
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
                    {"error": f"ÙˆØ¶Ø¹ÛŒØª Ù†Ø§Ù…Ø¹ØªØ¨Ø±. Ù…Ù‚Ø§Ø¯ÛŒØ± Ù…Ø¬Ø§Ø²: {', '.join(valid)}"},
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
                    {"error": "ÙÛŒÙ„Ø¯ÛŒ Ø¨Ø±Ø§ÛŒ Ø¨Ø±ÙˆØ²Ø±Ø³Ø§Ù†ÛŒ Ø§Ø±Ø³Ø§Ù„ Ù†Ø´Ø¯."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        return Response(OrderSerializer(order).data)


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  4. INVENTORY
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


# [COMMENTED] class SemiFinishedViewSet(viewsets.ModelViewSet):
# [COMMENTED]     serializer_class = SemiFinishedSerializer
# [COMMENTED]     permission_classes = [IsAuthenticated]
# [COMMENTED] 
# [COMMENTED]     def get_queryset(self):
# [X] # [COMMENTED]         qs = SemiFinished.objects.all()
# [COMMENTED]         restaurant = _resolve_restaurant(self.request)
# [COMMENTED]         if restaurant:
# [COMMENTED]             qs = qs.filter(restaurant=restaurant)
# [COMMENTED]         return qs
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class ReadyMaterialViewSet(viewsets.ModelViewSet):
# [COMMENTED]     serializer_class = ReadyMaterialSerializer
# [COMMENTED]     permission_classes = [IsAuthenticated]
# [COMMENTED] 
# [COMMENTED]     def get_queryset(self):
# [X] # [COMMENTED]         qs = ReadyMaterial.objects.select_related("supplier").all()
# [COMMENTED] 
# [COMMENTED]         restaurant = _resolve_restaurant(self.request)
# [COMMENTED]         if restaurant:
# [COMMENTED]             qs = qs.filter(restaurant=restaurant)
# [COMMENTED] 
# [COMMENTED]         search = self.request.query_params.get("search")
# [COMMENTED]         if search:
# [COMMENTED]             qs = qs.filter(
# [COMMENTED]                 Q(name__icontains=search) | Q(barcode__icontains=search),
# [COMMENTED]             )
# [COMMENTED] 
# [COMMENTED]         category = self.request.query_params.get("category")
# [COMMENTED]         if category:
# [COMMENTED]             qs = qs.filter(category_id=category)
# [COMMENTED] 
# [COMMENTED]         return qs.order_by("name")
# [COMMENTED] 
