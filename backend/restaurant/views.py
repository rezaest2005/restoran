from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Category, Food, Table, Reservation, Order, OrderItem
from .serializers import (
    CategorySerializer,
    FoodSerializer,
    TableSerializer,
    ReservationSerializer,
    OrderSerializer,
)

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer

class FoodViewSet(viewsets.ModelViewSet):
    queryset = Food.objects.filter(is_available=True)
    serializer_class = FoodSerializer

    def get_queryset(self):
        queryset = Food.objects.filter(is_available=True)
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        return queryset

class TableViewSet(viewsets.ModelViewSet):
    queryset = Table.objects.all()
    serializer_class = TableSerializer

class ReservationViewSet(viewsets.ModelViewSet):
    queryset = Reservation.objects.all()
    serializer_class = ReservationSerializer

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer

    def create(self, request):
        items_data = request.data.get('items', [])
        total_price = sum(
            item['price'] * item['quantity'] 
            for item in items_data
        )
        
        order = Order.objects.create(
            customer_name=request.data['customer_name'],
            phone=request.data['phone'],
            table_id=request.data.get('table'),
            total_price=total_price,
        )

        for item in items_data:
            OrderItem.objects.create(
                order=order,
                food_id=item['food'],
                quantity=item['quantity'],
                price=item['price'],
            )

        return Response(
            OrderSerializer(order).data,
            status=status.HTTP_201_CREATED
        )