from rest_framework import serializers
from .models import Category, Food, Table, Reservation, Order, OrderItem

class FoodSerializer(serializers.ModelSerializer):
    discounted_price = serializers.SerializerMethodField()

    class Meta:
        model = Food
        fields = '__all__'

    def get_discounted_price(self, obj):
        return obj.discounted_price()


class CategorySerializer(serializers.ModelSerializer):
    foods = FoodSerializer(many=True, read_only=True, source='food_set')

    class Meta:
        model = Category
        fields = '__all__'


class TableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Table
        fields = '__all__'


class ReservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reservation
        fields = '__all__'


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = '__all__'


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = '__all__'