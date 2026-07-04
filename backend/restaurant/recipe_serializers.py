"""
Restaurant — Recipe & Inventory Serializers
"""
from rest_framework import serializers
from .models import (
    Recipe, RecipeIngredient, RecipeSemiFinished,
    InventoryMovement,  
)


# ══════════════════════════════════════════════════════════════════════════════
#  RECIPE
# ══════════════════════════════════════════════════════════════════════════════

class RecipeIngredientSerializer(serializers.ModelSerializer):
    raw_material_name = serializers.CharField(source='raw_material.name', read_only=True)
    raw_material_unit = serializers.CharField(source='raw_material.get_unit_display', read_only=True)
    effective_quantity = serializers.FloatField(read_only=True)
    ingredient_cost = serializers.SerializerMethodField()

    class Meta:
        model = RecipeIngredient
        fields = [
            'id', 'raw_material', 'raw_material_name', 'raw_material_unit',
            'quantity', 'unit', 'wastage_percent', 'effective_quantity',
            'optional', 'notes', 'ingredient_cost',
        ]

    def get_ingredient_cost(self, obj):
        return obj.total_cost


class RecipeSemiFinishedSerializer(serializers.ModelSerializer):
    semi_finished_name = serializers.CharField(source='semi_finished.name', read_only=True)
    item_cost = serializers.SerializerMethodField()

    class Meta:
        model = RecipeSemiFinished
        fields = [
            'id', 'semi_finished', 'semi_finished_name',
            'quantity', 'unit', 'item_cost',
        ]

    def get_item_cost(self, obj):
        return obj.total_cost


class RecipeListSerializer(serializers.ModelSerializer):
    food_name = serializers.CharField(source='food.name', read_only=True)
    food_price = serializers.IntegerField(source='food.price', read_only=True)
    profit_margin = serializers.FloatField(read_only=True)

    class Meta:
        model = Recipe
        fields = [
            'id', 'food', 'food_name', 'food_price',
            'yield_quantity', 'version', 'is_active',
            'total_cost', 'cost_per_serving', 'suggested_price',
            'profit_margin', 'estimated_preparation_time',
            'created_at',
        ]


class RecipeDetailSerializer(serializers.ModelSerializer):
    food_name = serializers.CharField(source='food.name', read_only=True)
    food_price = serializers.IntegerField(source='food.price', read_only=True)
    ingredients = RecipeIngredientSerializer(many=True, read_only=True)
    semi_finished_items = RecipeSemiFinishedSerializer(many=True, read_only=True)
    profit_margin = serializers.FloatField(read_only=True)

    class Meta:
        model = Recipe
        fields = [
            'id', 'food', 'food_name', 'food_price',
            'yield_quantity', 'instructions', 'estimated_preparation_time',
            'notes', 'version', 'is_active',
            'total_raw_material_cost', 'total_semi_finished_cost',
            'total_cost', 'cost_per_serving', 'suggested_price',
            'profit_margin',
            'ingredients', 'semi_finished_items',
            'created_at', 'updated_at',
        ]


class RecipeCreateSerializer(serializers.ModelSerializer):
    ingredients = RecipeIngredientSerializer(many=True)
    semi_finished_items = RecipeSemiFinishedSerializer(many=True)

    class Meta:
        model = Recipe
        fields = [
            'food', 'yield_quantity', 'instructions',
            'estimated_preparation_time', 'notes',
            'ingredients', 'semi_finished_items',
        ]

    def create(self, validated_data):
        ingredients_data = validated_data.pop('ingredients', [])
        semi_data = validated_data.pop('semi_finished_items', [])

        recipe = Recipe.objects.create(**validated_data)

        for ing in ingredients_data:
            RecipeIngredient.objects.create(recipe=recipe, **ing)

        for semi in semi_data:
            RecipeSemiFinished.objects.create(recipe=recipe, **semi)

        recipe.recalculate_cost()
        return recipe

    def update(self, instance, validated_data):
        ingredients_data = validated_data.pop('ingredients', None)
        semi_data = validated_data.pop('semi_finished_items', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if ingredients_data is not None:
            instance.ingredients.all().delete()
            for ing in ingredients_data:
                RecipeIngredient.objects.create(recipe=instance, **ing)

        if semi_data is not None:
            instance.semi_finished_items.all().delete()
            for semi in semi_data:
                RecipeSemiFinished.objects.create(recipe=instance, **semi)

        instance.version += 1
        instance.save(update_fields=['version'])
        instance.recalculate_cost()
        return instance


# ══════════════════════════════════════════════════════════════════════════════
#  INVENTORY MOVEMENTS
# ══════════════════════════════════════════════════════════════════════════════

class InventoryMovementSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source='raw_material.name', read_only=True)
    type_display = serializers.CharField(source='get_movement_type_display', read_only=True)

    class Meta:
        model = InventoryMovement
        fields = [
            'id', 'material_name', 'movement_type', 'type_display',
            'quantity', 'previous_stock', 'new_stock',
            'reference_type', 'reference_id', 'notes',
            'created_at',
        ]


# ══════════════════════════════════════════════════════════════════════════════
#  LOW STOCK ALERTS
# ══════════════════════════════════════════════════════════════════════════════

class LowStockAlertSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source='raw_material.name', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)


