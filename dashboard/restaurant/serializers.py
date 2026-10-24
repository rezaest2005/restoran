
from rest_framework import serializers
from django.utils import timezone
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth import password_validation
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    Category,
    Food,
    Order,
    OrderItem,
    RawMaterial,
    InventoryMovement,
    Supplier,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    Restaurant,
    Warehouse,
    StockItem,
)

User = get_user_model()


# ══════════════════════════════════════════════════════════════════════════════
#  1. FOOD & CATEGORY
# ══════════════════════════════════════════════════════════════════════════════


class FoodSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_name_en = serializers.CharField(
        source="category.name_en", read_only=True, default=""
    )

    class Meta:
        model = Food
        fields = [
            "id",
            "name",
            "name_en",
            "image",
            "price",
            "final_price",
            "category",
            "category_name",
            "category_name_en",
            "is_available",
            "stock",
        ]


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = [
            "id", "name", "name_en", "image", "is_active", "order",
            # ★ کم بود:
            "discount", "discount_type",
        ]

# ══════════════════════════════════════════════════════════════════════════════
#  1.5 RAW MATERIALS — ★ جدید
# ══════════════════════════════════════════════════════════════════════════════


class RawMaterialSerializer(serializers.ModelSerializer):
    total_price = serializers.SerializerMethodField()
    unit_display = serializers.CharField(source="get_unit_display", read_only=True)
    material_type_display = serializers.CharField(
        source="get_material_type_display", read_only=True
    )

    class Meta:
        model = RawMaterial
        fields = [
            "id",
            "name",
            "label",
            "price",
            "unit",
            "unit_display",
            "quantity",
            "material_type",
            "material_type_display",
            "total_price",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_total_price(self, obj):
        try:
            return int(obj.total_price)
        except (TypeError, ValueError):
            return 0


# ══════════════════════════════════════════════════════════════════════════════
#  RECIPE ENGINE SERIALIZERS
# ══════════════════════════════════════════════════════════════════════════════


# [COMMENTED] class RecipeIngredientSerializer(serializers.ModelSerializer):
# [COMMENTED]     raw_material_name = serializers.SerializerMethodField()
# [COMMENTED]     raw_material_id = serializers.PrimaryKeyRelatedField(
# [COMMENTED]         queryset=RawMaterial.objects.all(),
# [COMMENTED]         source="raw_material",
# [COMMENTED]         write_only=True,
# [COMMENTED]     )
# [COMMENTED]     raw_material = serializers.SerializerMethodField()
# [COMMENTED]     unit_display = serializers.SerializerMethodField()
# [COMMENTED]     effective_quantity = serializers.SerializerMethodField()
# [COMMENTED]     total_cost = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = RecipeIngredient
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "raw_material",
# [COMMENTED]             "raw_material_id",
# [COMMENTED]             "raw_material_name",
# [COMMENTED]             "quantity",
# [COMMENTED]             "unit",
# [COMMENTED]             "unit_display",
# [COMMENTED]             "wastage_percent",
# [COMMENTED]             "optional",
# [COMMENTED]             "notes",
# [COMMENTED]             "effective_quantity",
# [COMMENTED]             "total_cost",
# [COMMENTED]         ]
# [COMMENTED] 
# [COMMENTED]     def get_raw_material(self, obj):
# [COMMENTED]         if obj.raw_material:
# [COMMENTED]             return {
# [COMMENTED]                 "id": obj.raw_material.id,
# [COMMENTED]                 "name": obj.raw_material.name,
# [COMMENTED]                 "unit": obj.raw_material.unit,
# [COMMENTED]                 "price": int(obj.raw_material.price or 0),
# [COMMENTED]                 "quantity": float(obj.raw_material.quantity or 0),
# [COMMENTED]             }
# [COMMENTED]         return None
# [COMMENTED] 
# [COMMENTED]     def get_raw_material_name(self, obj):
# [COMMENTED]         return obj.raw_material.name if obj.raw_material else ""
# [COMMENTED] 
# [COMMENTED]     def get_unit_display(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.get_unit_display() or ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return obj.unit or ""
# [COMMENTED] 
# [COMMENTED]     def get_effective_quantity(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return round(obj.effective_quantity, 3)
# [COMMENTED]         except Exception:
# [COMMENTED]             return float(obj.quantity)
# [COMMENTED] 
# [COMMENTED]     def get_total_cost(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return int(obj.total_cost)
# [COMMENTED]         except (TypeError, ValueError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class RecipeSemiFinishedSerializer(serializers.ModelSerializer):
# [COMMENTED]     semi_finished_name = serializers.SerializerMethodField()
# [COMMENTED]     semi_finished_id = serializers.PrimaryKeyRelatedField(
# [X] # [COMMENTED]         queryset=SemiFinished.objects.all(),
# [COMMENTED]         source="semi_finished",
# [COMMENTED]         write_only=True,
# [COMMENTED]     )
# [COMMENTED]     semi_finished = serializers.SerializerMethodField()
# [COMMENTED]     unit_display = serializers.SerializerMethodField()
# [COMMENTED]     total_cost = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = RecipeSemiFinished
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "semi_finished",
# [COMMENTED]             "semi_finished_id",
# [COMMENTED]             "semi_finished_name",
# [COMMENTED]             "quantity",
# [COMMENTED]             "unit",
# [COMMENTED]             "unit_display",
# [COMMENTED]             "total_cost",
# [COMMENTED]         ]
# [COMMENTED] 
# [COMMENTED]     def get_semi_finished(self, obj):
# [COMMENTED]         if obj.semi_finished:
# [COMMENTED]             return {
# [COMMENTED]                 "id": obj.semi_finished.id,
# [COMMENTED]                 "name": obj.semi_finished.name,
# [COMMENTED]                 "unit": obj.semi_finished.unit,
# [COMMENTED]                 "cost_per_unit": int(obj.semi_finished.cost_per_unit or 0),
# [COMMENTED]             }
# [COMMENTED]         return None
# [COMMENTED] 
# [COMMENTED]     def get_semi_finished_name(self, obj):
# [COMMENTED]         return obj.semi_finished.name if obj.semi_finished else ""
# [COMMENTED] 
# [COMMENTED]     def get_unit_display(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.get_unit_display() or ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return obj.unit or ""
# [COMMENTED] 
# [COMMENTED]     def get_total_cost(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return int(obj.total_cost)
# [COMMENTED]         except (TypeError, ValueError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class RecipePackagingItemSerializer(serializers.ModelSerializer):
# [COMMENTED]     raw_material_name = serializers.SerializerMethodField()
# [COMMENTED]     raw_material_id = serializers.PrimaryKeyRelatedField(
# [COMMENTED]         queryset=RawMaterial.objects.all(),
# [COMMENTED]         source="raw_material",
# [COMMENTED]         write_only=True,
# [COMMENTED]     )
# [COMMENTED]     raw_material = serializers.SerializerMethodField()
# [COMMENTED]     unit_display = serializers.SerializerMethodField()
# [COMMENTED]     total_cost = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = RecipePackagingItem
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "raw_material",
# [COMMENTED]             "raw_material_id",
# [COMMENTED]             "raw_material_name",
# [COMMENTED]             "quantity",
# [COMMENTED]             "unit",
# [COMMENTED]             "unit_display",
# [COMMENTED]             "notes",
# [COMMENTED]             "total_cost",
# [COMMENTED]         ]
# [COMMENTED] 
# [COMMENTED]     def get_raw_material(self, obj):
# [COMMENTED]         if obj.raw_material:
# [COMMENTED]             return {
# [COMMENTED]                 "id": obj.raw_material.id,
# [COMMENTED]                 "name": obj.raw_material.name,
# [COMMENTED]                 "unit": obj.raw_material.unit,
# [COMMENTED]                 "price": int(obj.raw_material.price or 0),
# [COMMENTED]                 "quantity": float(obj.raw_material.quantity or 0),
# [COMMENTED]             }
# [COMMENTED]         return None
# [COMMENTED] 
# [COMMENTED]     def get_raw_material_name(self, obj):
# [COMMENTED]         return obj.raw_material.name if obj.raw_material else ""
# [COMMENTED] 
# [COMMENTED]     def get_unit_display(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.get_unit_display() or ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return obj.unit or ""
# [COMMENTED] 
# [COMMENTED]     def get_total_cost(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return int(obj.total_cost)
# [COMMENTED]         except (TypeError, ValueError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class RecipeSerializer(serializers.ModelSerializer):
# [COMMENTED]     food_name = serializers.CharField(source="food.name", read_only=True)
# [COMMENTED]     ingredients = RecipeIngredientSerializer(many=True, required=False)
# [COMMENTED]     semi_finished_items = RecipeSemiFinishedSerializer(many=True, required=False)
# [COMMENTED]     packaging_items = RecipePackagingItemSerializer(many=True, required=False)
# [COMMENTED]     profit_margin = serializers.FloatField(read_only=True)
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = Recipe
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "food",
# [COMMENTED]             "food_name",
# [COMMENTED]             "yield_quantity",
# [COMMENTED]             "instructions",
# [COMMENTED]             "estimated_preparation_time",
# [COMMENTED]             "notes",
# [COMMENTED]             "version",
# [COMMENTED]             "is_active",
# [COMMENTED]             "ingredients",
# [COMMENTED]             "semi_finished_items",
# [COMMENTED]             "packaging_items",
# [COMMENTED]             "total_raw_material_cost",
# [COMMENTED]             "total_semi_finished_cost",
# [COMMENTED]             "total_packaging_cost",
# [COMMENTED]             "total_cost",
# [COMMENTED]             "cost_per_serving",
# [COMMENTED]             "suggested_price",
# [COMMENTED]             "profit_margin",
# [COMMENTED]             "created_at",
# [COMMENTED]             "updated_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = [
# [COMMENTED]             "total_raw_material_cost",
# [COMMENTED]             "total_semi_finished_cost",
# [COMMENTED]             "total_packaging_cost",
# [COMMENTED]             "total_cost",
# [COMMENTED]             "cost_per_serving",
# [COMMENTED]             "suggested_price",
# [COMMENTED]             "version",
# [COMMENTED]             "created_at",
# [COMMENTED]             "updated_at",
# [COMMENTED]         ]
# [COMMENTED] 
# [COMMENTED]     def create(self, validated_data):
# [COMMENTED]         ingredients_data = validated_data.pop("ingredients", [])
# [COMMENTED]         semi_items_data = validated_data.pop("semi_finished_items", [])
# [COMMENTED]         packaging_items_data = validated_data.pop("packaging_items", [])
# [COMMENTED]         food = validated_data.pop("food", None)
# [COMMENTED] 
# [COMMENTED]         if food:
# [X] # [COMMENTED]             recipe, created = Recipe.objects.update_or_create(
# [COMMENTED]                 food=food,
# [COMMENTED]                 defaults=validated_data,
# [COMMENTED]             )
# [COMMENTED]             if not created:
# [COMMENTED]                 recipe.ingredients.all().delete()
# [COMMENTED]                 recipe.semi_finished_items.all().delete()
# [COMMENTED]                 recipe.packaging_items.all().delete()
# [COMMENTED]         else:
# [COMMENTED]             raise serializers.ValidationError(
# [COMMENTED]                 {"food": "انتخاب غذا برای رسپی الزامی است."}
# [COMMENTED]             )
# [COMMENTED] 
# [COMMENTED]         for ing_data in ingredients_data:
# [X] # [COMMENTED]             RecipeIngredient.objects.create(recipe=recipe, **ing_data)
# [COMMENTED] 
# [COMMENTED]         for sf_data in semi_items_data:
# [X] # [COMMENTED]             RecipeSemiFinished.objects.create(recipe=recipe, **sf_data)
# [COMMENTED] 
# [COMMENTED]         for pk_data in packaging_items_data:
# [X] # [COMMENTED]             RecipePackagingItem.objects.create(recipe=recipe, **pk_data)
# [COMMENTED] 
# [COMMENTED]         recipe.recalculate_cost()
# [COMMENTED]         return recipe
# [COMMENTED] 
# [COMMENTED]     def update(self, instance, validated_data):
# [COMMENTED]         ingredients_data = validated_data.pop("ingredients", None)
# [COMMENTED]         semi_items_data = validated_data.pop("semi_finished_items", None)
# [COMMENTED]         packaging_items_data = validated_data.pop("packaging_items", None)
# [COMMENTED] 
# [COMMENTED]         for attr, value in validated_data.items():
# [COMMENTED]             setattr(instance, attr, value)
# [COMMENTED]         instance.save()
# [COMMENTED] 
# [COMMENTED]         if ingredients_data is not None:
# [COMMENTED]             instance.ingredients.all().delete()
# [COMMENTED]             for ing_data in ingredients_data:
# [X] # [COMMENTED]                 RecipeIngredient.objects.create(recipe=instance, **ing_data)
# [COMMENTED] 
# [COMMENTED]         if semi_items_data is not None:
# [COMMENTED]             instance.semi_finished_items.all().delete()
# [COMMENTED]             for sf_data in semi_items_data:
# [X] # [COMMENTED]                 RecipeSemiFinished.objects.create(recipe=instance, **sf_data)
# [COMMENTED] 
# [COMMENTED]         if packaging_items_data is not None:
# [COMMENTED]             instance.packaging_items.all().delete()
# [COMMENTED]             for pk_data in packaging_items_data:
# [X] # [COMMENTED]                 RecipePackagingItem.objects.create(recipe=instance, **pk_data)
# [COMMENTED] 
# [COMMENTED]         instance.recalculate_cost()
# [COMMENTED]         return instance
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] #  2. TABLES & RESERVATIONS
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class TableSerializer(serializers.ModelSerializer):
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = Table
# [COMMENTED]         fields = "__all__"
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class ReservationSerializer(serializers.ModelSerializer):
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = Reservation
# [COMMENTED]         fields = "__all__"
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] #  3. ORDERS — ★ اصلاح‌شده
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
class OrderItemSerializer(serializers.ModelSerializer):
    # ★ FIXED: فیلدهای جدید
    food_name = serializers.CharField(source="food.name", read_only=True, default="")
    display_name = serializers.CharField(read_only=True)
    display_name_en = serializers.CharField(read_only=True)
    category = serializers.SerializerMethodField()
    category_en = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "food",
            "food_name",
            "item_name",
            "display_name",
            "display_name_en",
            "category", 
            "category_en",  
            "quantity",
            "price",
            "line_total",
        ]

    def get_line_total(self, obj):
        if obj.price and obj.quantity:
            return int(obj.price * obj.quantity)
        return 0
    def get_category(self, obj):
        if obj.food_id and obj.food and obj.food.category:
            return obj.food.category.name
        return ""

    # ★ جدید
    def get_category_en(self, obj):
        if obj.food_id and obj.food and obj.food.category:
            return obj.food.category.name_en or ""
        return ""


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    # ★ FIXED: فیلدهای جدید
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    payment_status_display = serializers.CharField(
        source="get_payment_status_display", read_only=True
    )
    payment_method_display = serializers.CharField(
        source="get_payment_method_display", read_only=True
    )
    confirmed_by_name = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "customer_name",
            "phone",
            "table",
            "status",
            "status_display",
            "customer_name_en",
            "source",
            "source_display",
            "payment_status",
            "payment_status_display",
            "payment_method",
            "payment_method_display",
            "confirmed_by",
            "confirmed_by_name",
            "confirmed_at",
            "total_price",
            "items_count",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "total_price",
            "created_at",
            "updated_at",
            "confirmed_at",
        ]

    def get_confirmed_by_name(self, obj):
        try:
            return obj.confirmed_by.get_full_name() if obj.confirmed_by else ""
        except Exception:
            return ""

    def get_items_count(self, obj):
        return obj.items.count()


class OrderCreateSerializer(serializers.ModelSerializer):
    """سریالایزر برای ایجاد سفارش — آیتم‌ها به‌صورت جداگانه اضافه می‌شوند"""

    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "customer_name",
            "phone",
            "table",
            "status",
            "source",
            "payment_method",
            "total_price",
            "items",
            "created_at",
        ]
        read_only_fields = ["id", "total_price", "created_at"]


# ══════════════════════════════════════════════════════════════════════════════
#  3.5 SUPPLIERS & PURCHASE INVOICES — ★ جدید
# ══════════════════════════════════════════════════════════════════════════════


class SupplierSerializer(serializers.ModelSerializer):
    invoices_count = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "phone",
            "address",
            "contact_person",
            "description",
            "invoices_count",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def get_invoices_count(self, obj):
        return obj.invoices.count()


class PurchaseInvoiceItemSerializer(serializers.ModelSerializer):
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseInvoiceItem
        fields = [
            "id",
            "item_name",
            "quantity",
            "unit",
            "unit_price",
            "category",
            "raw_material",
            "line_total",
        ]

    def get_line_total(self, obj):
        try:
            return int(obj.line_total)
        except (TypeError, ValueError):
            return 0


class PurchaseInvoiceSerializer(serializers.ModelSerializer):
    items = PurchaseInvoiceItemSerializer(many=True, read_only=True)
    total_amount = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    supplier_detail = SupplierSerializer(source="supplier", read_only=True)

    class Meta:
        model = PurchaseInvoice
        fields = [
            "id",
            "supplier",
            "supplier_detail",
            "supplier_name",
            "invoice_number",
            "date",
            "description",
            "file",
            "items",
            "total_amount",
            "item_count",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def get_total_amount(self, obj):
        try:
            return int(obj.total_amount)
        except (TypeError, ValueError):
            return 0

    def get_item_count(self, obj):
        return obj.items.count()


# ══════════════════════════════════════════════════════════════════════════════
#  3.6 INVENTORY TRACKING — ★ جدید
# ══════════════════════════════════════════════════════════════════════════════


class InventoryMovementSerializer(serializers.ModelSerializer):
    raw_material_name = serializers.CharField(
        source="raw_material.name", read_only=True
    )
    warehouse_name = serializers.CharField(
        source="warehouse.name", read_only=True, default=""
    )
    movement_type_display = serializers.CharField(
        source="get_movement_type_display", read_only=True
    )
    waste_reason_display = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = InventoryMovement
        fields = [
            "id",
            "raw_material",
            "raw_material_name",
            "movement_type",
            "movement_type_display",
            "quantity",
            "previous_stock",
            "new_stock",
            "reference_type",
            "reference_id",
            "notes",
            "created_by",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def get_waste_reason_display(self, obj):
        if obj.waste_reason:
            return dict(InventoryMovement._meta.get_field("waste_reason").choices).get(
                obj.waste_reason, ""
            )
        return ""

    def get_created_by_name(self, obj):
        try:
            return obj.created_by.get_full_name() if obj.created_by else ""
        except Exception:
            return ""


# [COMMENTED] class InventoryUsageLogSerializer(serializers.ModelSerializer):
# [COMMENTED]     raw_material_name = serializers.CharField(
# [COMMENTED]         source="raw_material.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     usage_type_display = serializers.CharField(
# [COMMENTED]         source="get_usage_type_display", read_only=True
# [COMMENTED]     )
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = InventoryUsageLog
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "raw_material",
# [COMMENTED]             "raw_material_name",
# [COMMENTED]             "usage_type",
# [COMMENTED]             "usage_type_display",
# [COMMENTED]             "quantity_used",
# [COMMENTED]             "reference",
# [COMMENTED]             "note",
# [COMMENTED]             "used_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["used_at"]
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] #  4. SEMI-FINISHED PRODUCTS
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class SemiFinishedIngredientSerializer(serializers.ModelSerializer):
# [COMMENTED]     raw_material_name = serializers.SerializerMethodField()
# [COMMENTED]     raw_material_id = serializers.SerializerMethodField()
# [COMMENTED]     unit = serializers.SerializerMethodField()
# [COMMENTED]     price = serializers.SerializerMethodField()
# [COMMENTED]     stock = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = SemiFinishedIngredient
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "raw_material",
# [COMMENTED]             "raw_material_id",
# [COMMENTED]             "raw_material_name",
# [COMMENTED]             "quantity",
# [COMMENTED]             "unit",
# [COMMENTED]             "price",
# [COMMENTED]             "stock",
# [COMMENTED]         ]
# [COMMENTED] 
# [COMMENTED]     def get_raw_material_name(self, obj):
# [COMMENTED]         return obj.raw_material.name if obj.raw_material else ""
# [COMMENTED] 
# [COMMENTED]     def get_raw_material_id(self, obj):
# [COMMENTED]         return obj.raw_material.id if obj.raw_material else None
# [COMMENTED] 
# [COMMENTED]     def get_unit(self, obj):
# [COMMENTED]         return obj.raw_material.unit if obj.raw_material else ""
# [COMMENTED] 
# [COMMENTED]     def get_price(self, obj):
# [COMMENTED]         return (
# [COMMENTED]             int(obj.raw_material.price)
# [COMMENTED]             if obj.raw_material and obj.raw_material.price
# [COMMENTED]             else 0
# [COMMENTED]         )
# [COMMENTED] 
# [COMMENTED]     def get_stock(self, obj):
# [COMMENTED]         if obj.raw_material:
# [COMMENTED]             return float(obj.raw_material.quantity or 0)
# [COMMENTED]         return 0
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class SemiFinishedSerializer(serializers.ModelSerializer):
# [COMMENTED]     ingredients = SemiFinishedIngredientSerializer(many=True, read_only=True)
# [COMMENTED]     total_cost = serializers.SerializerMethodField()
# [COMMENTED]     cost_per_unit = serializers.SerializerMethodField()
# [COMMENTED]     suggested_price = serializers.SerializerMethodField()
# [COMMENTED]     can_produce = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = SemiFinished
# [COMMENTED]         fields = "__all__"
# [COMMENTED] 
# [COMMENTED]     def get_total_cost(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return int(obj.total_cost)
# [COMMENTED]         except (TypeError, ValueError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_cost_per_unit(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return int(obj.cost_per_unit)
# [COMMENTED]         except (TypeError, ValueError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_suggested_price(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return int(obj.suggested_price)
# [COMMENTED]         except (TypeError, ValueError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_can_produce(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.can_produce
# [COMMENTED]         except Exception:
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] #  5. READY MATERIALS
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class ReadyMaterialSerializer(serializers.ModelSerializer):
# [COMMENTED]     total_value = serializers.SerializerMethodField()
# [COMMENTED]     stock_status = serializers.SerializerMethodField()
# [COMMENTED]     unit_display = serializers.CharField(source="get_unit_display", read_only=True)
# [COMMENTED]     supplier_name = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = ReadyMaterial
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "name",
# [COMMENTED]             "description",
# [COMMENTED]             "unit",
# [COMMENTED]             "unit_display",
# [COMMENTED]             "quantity",
# [COMMENTED]             "purchase_price",
# [COMMENTED]             "selling_price",
# [COMMENTED]             "minimum_stock",
# [COMMENTED]             "supplier",
# [COMMENTED]             "supplier_name",
# [COMMENTED]             "barcode",
# [COMMENTED]             "is_active",
# [COMMENTED]             "total_value",
# [COMMENTED]             "stock_status",
# [COMMENTED]             "created_at",
# [COMMENTED]             "updated_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["created_at", "updated_at"]
# [COMMENTED] 
# [COMMENTED]     def get_total_value(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return (
# [COMMENTED]                 int(obj.total_value)
# [COMMENTED]                 if hasattr(obj, "total_value")
# [COMMENTED]                 else (
# [COMMENTED]                     int(obj.quantity * obj.purchase_price) if obj.purchase_price else 0
# [COMMENTED]                 )
# [COMMENTED]             )
# [COMMENTED]         except (TypeError, AttributeError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_stock_status(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             if hasattr(obj, "stock_status"):
# [COMMENTED]                 return obj.stock_status
# [COMMENTED]             if obj.quantity <= 0:
# [COMMENTED]                 return "out"
# [COMMENTED]             if obj.minimum_stock and obj.quantity <= obj.minimum_stock:
# [COMMENTED]                 return "low"
# [COMMENTED]             return "ok"
# [COMMENTED]         except (TypeError, AttributeError):
# [COMMENTED]             return "unknown"
# [COMMENTED] 
# [COMMENTED]     def get_supplier_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.supplier.name if obj.supplier else ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return ""
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] #  6. KITCHEN MANAGEMENT
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class KitchenProductSerializer(serializers.ModelSerializer):
# [COMMENTED]     recipe_name = serializers.SerializerMethodField()
# [COMMENTED]     category_display = serializers.CharField(
# [COMMENTED]         source="get_category_display", read_only=True
# [COMMENTED]     )
# [COMMENTED]     cost = serializers.SerializerMethodField()
# [COMMENTED]     profit = serializers.SerializerMethodField()
# [COMMENTED]     max_production = serializers.SerializerMethodField()
# [COMMENTED]     limiting_material = serializers.SerializerMethodField()
# [COMMENTED]     current_stock = serializers.SerializerMethodField()
# [COMMENTED]     available_stock = serializers.SerializerMethodField()
# [COMMENTED]     is_low_stock = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = KitchenProduct
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "name",
# [COMMENTED]             "recipe",
# [COMMENTED]             "recipe_name",
# [COMMENTED]             "category",
# [COMMENTED]             "category_display",
# [COMMENTED]             "description",
# [COMMENTED]             "image",
# [COMMENTED]             "selling_price",
# [COMMENTED]             "min_stock",
# [COMMENTED]             "is_active",
# [COMMENTED]             "cost",
# [COMMENTED]             "profit",
# [COMMENTED]             "max_production",
# [COMMENTED]             "limiting_material",
# [COMMENTED]             "current_stock",
# [COMMENTED]             "available_stock",
# [COMMENTED]             "is_low_stock",
# [COMMENTED]             "created_at",
# [COMMENTED]             "updated_at",
# [COMMENTED]         ]
# [COMMENTED] 
# [COMMENTED]     def get_recipe_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             if obj.recipe and hasattr(obj.recipe, "food") and obj.recipe.food:
# [COMMENTED]                 return obj.recipe.food.name
# [COMMENTED]         except Exception:
# [COMMENTED]             pass
# [COMMENTED]         return ""
# [COMMENTED] 
# [COMMENTED]     def get_cost(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             c = obj.calculate_cost()
# [COMMENTED]             return int(c) if c is not None else 0
# [COMMENTED]         except Exception:
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_profit(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             p = obj.calculate_profit()
# [COMMENTED]             return int(p) if p is not None else 0
# [COMMENTED]         except Exception:
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_max_production(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             result = obj.calculate_max_production()
# [COMMENTED]             if isinstance(result, (tuple, list)) and len(result) >= 1:
# [COMMENTED]                 return result[0]
# [COMMENTED]             return result
# [COMMENTED]         except Exception:
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_limiting_material(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             result = obj.calculate_max_production()
# [COMMENTED]             if isinstance(result, (tuple, list)) and len(result) >= 2:
# [COMMENTED]                 return result[1]
# [COMMENTED]             return None
# [COMMENTED]         except Exception:
# [COMMENTED]             return None
# [COMMENTED] 
# [COMMENTED]     def get_current_stock(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             inv = obj.get_inventory()
# [COMMENTED]             return inv.quantity if inv else 0
# [COMMENTED]         except Exception:
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_available_stock(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             inv = obj.get_inventory()
# [COMMENTED]             return inv.available_quantity if inv else 0
# [COMMENTED]         except Exception:
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_is_low_stock(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             inv = obj.get_inventory()
# [COMMENTED]             return inv.is_low_stock if inv else False
# [COMMENTED]         except Exception:
# [COMMENTED]             return False
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class KitchenInventorySerializer(serializers.ModelSerializer):
# [COMMENTED]     product_name = serializers.CharField(source="kitchen_product.name", read_only=True)
# [COMMENTED]     available = serializers.IntegerField(source="available_quantity", read_only=True)
# [COMMENTED]     is_low = serializers.BooleanField(source="is_low_stock", read_only=True)
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = KitchenInventory
# [COMMENTED]         fields = "__all__"
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class ProductionPlanItemSerializer(serializers.ModelSerializer):
# [COMMENTED]     product_name = serializers.CharField(source="kitchen_product.name", read_only=True)
# [COMMENTED]     required_materials = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = ProductionPlanItem
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "kitchen_product",
# [COMMENTED]             "product_name",
# [COMMENTED]             "quantity",
# [COMMENTED]             "required_materials",
# [COMMENTED]         ]
# [COMMENTED] 
# [COMMENTED]     def get_required_materials(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.required_materials()
# [COMMENTED]         except Exception:
# [COMMENTED]             return []
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class ProductionPlanSerializer(serializers.ModelSerializer):
# [COMMENTED]     items = ProductionPlanItemSerializer(many=True, read_only=True)
# [COMMENTED]     status_display = serializers.CharField(source="get_status_display", read_only=True)
# [COMMENTED]     created_by_name = serializers.SerializerMethodField()
# [COMMENTED]     items_data = serializers.ListField(
# [COMMENTED]         child=serializers.DictField(),
# [COMMENTED]         write_only=True,
# [COMMENTED]         required=False,
# [COMMENTED]     )
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = ProductionPlan
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "date",
# [COMMENTED]             "status",
# [COMMENTED]             "status_display",
# [COMMENTED]             "created_by",
# [COMMENTED]             "created_by_name",
# [COMMENTED]             "notes",
# [COMMENTED]             "items",
# [COMMENTED]             "items_data",
# [COMMENTED]             "created_at",
# [COMMENTED]             "updated_at",
# [COMMENTED]         ]
# [COMMENTED] 
# [COMMENTED]     def get_created_by_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.created_by.get_full_name() if obj.created_by else ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return ""
# [COMMENTED] 
# [COMMENTED]     def create(self, validated_data):
# [COMMENTED]         items = validated_data.pop("items_data", [])
# [X] # [COMMENTED]         plan = ProductionPlan.objects.create(**validated_data)
# [COMMENTED]         for d in items:
# [X] # [COMMENTED]             ProductionPlanItem.objects.create(
# [COMMENTED]                 production_plan=plan,
# [COMMENTED]                 kitchen_product_id=(
# [COMMENTED]                     d.get("kitchen_product_id") or d.get("kitchen_product")
# [COMMENTED]                 ),
# [COMMENTED]                 quantity=d.get("quantity", 0),
# [COMMENTED]             )
# [COMMENTED]         return plan
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class ProductionBatchSerializer(serializers.ModelSerializer):
# [COMMENTED]     product_name = serializers.CharField(source="kitchen_product.name", read_only=True)
# [COMMENTED]     produced_by_name = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = ProductionBatch
# [COMMENTED]         fields = "__all__"
# [COMMENTED] 
# [COMMENTED]     def get_produced_by_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.produced_by.get_full_name() if obj.produced_by else ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return ""
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class ProductionLogSerializer(serializers.ModelSerializer):
# [COMMENTED]     user_name = serializers.SerializerMethodField()
# [COMMENTED]     product_name = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = ProductionLog
# [COMMENTED]         fields = "__all__"
# [COMMENTED] 
# [COMMENTED]     def get_user_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.user.get_full_name() if obj.user else "—"
# [COMMENTED]         except Exception:
# [COMMENTED]             return "—"
# [COMMENTED] 
# [COMMENTED]     def get_product_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.kitchen_product.name if obj.kitchen_product else "—"
# [COMMENTED]         except Exception:
# [COMMENTED]             return "—"
# [COMMENTED] 
# [COMMENTED] 
class ProduceSerializer(serializers.Serializer):
    quantity = serializers.FloatField(min_value=0.01, max_value=10000, default=1)

    def validate_quantity(self, value):
        if value != round(value, 2):
            raise serializers.ValidationError("حداکثر ۲ رقم اعشار مجاز است.")
        return value


# ══════════════════════════════════════════════════════════════════════════════
#  6.5 WASTE LOG — ★ جدید
# ══════════════════════════════════════════════════════════════════════════════


# [COMMENTED] class WasteLogSerializer(serializers.ModelSerializer):
# [COMMENTED]     product_name = serializers.CharField(source="kitchen_product.name", read_only=True)
# [COMMENTED]     reason_display = serializers.CharField(source="get_reason_display", read_only=True)
# [COMMENTED]     total_cost = serializers.SerializerMethodField()
# [COMMENTED]     created_by_name = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = WasteLog
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "kitchen_product",
# [COMMENTED]             "product_name",
# [COMMENTED]             "quantity",
# [COMMENTED]             "reason",
# [COMMENTED]             "reason_display",
# [COMMENTED]             "cost_per_unit",
# [COMMENTED]             "total_cost",
# [COMMENTED]             "notes",
# [COMMENTED]             "created_by",
# [COMMENTED]             "created_by_name",
# [COMMENTED]             "created_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["created_at", "cost_per_unit"]
# [COMMENTED] 
# [COMMENTED]     def get_total_cost(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.total_cost
# [COMMENTED]         except (TypeError, AttributeError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_created_by_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.created_by.get_full_name() if obj.created_by else ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return ""
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] #  6.6 ONLINE ORDER SETTINGS — ★ جدید
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class OnlineOrderSettingsSerializer(serializers.ModelSerializer):
# [COMMENTED]     status_text = serializers.CharField(read_only=True)
# [COMMENTED]     restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = OnlineOrderSettings
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "restaurant",
# [COMMENTED]             "restaurant_name",
# [COMMENTED]             "is_open",
# [COMMENTED]             "status_text",
# [COMMENTED]             "closed_message",
# [COMMENTED]             "updated_at",
# [COMMENTED]             "updated_by",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["updated_at", "updated_by"]
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] #  POS SETTINGS — ★ جدید
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class PosSettingsSerializer(serializers.ModelSerializer):
# [COMMENTED]     restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = PosSettings
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "restaurant",
# [COMMENTED]             "restaurant_name",
# [COMMENTED]             "use_dictionary",
# [COMMENTED]             "allow_price_edit",
# [COMMENTED]             "show_stock",
# [COMMENTED]             "default_payment",
# [COMMENTED]             "require_customer",
# [COMMENTED]             "updated_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["id", "restaurant", "updated_at"]
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] #  6.7 DAY CLOSE — ★ جدید
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class DayCloseReportSerializer(serializers.ModelSerializer):
# [COMMENTED]     closed_by_name = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = DayCloseReport
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "date",
# [COMMENTED]             "total_sales",
# [COMMENTED]             "total_cost",
# [COMMENTED]             "total_profit",
# [COMMENTED]             "order_count",
# [COMMENTED]             "delivered_count",
# [COMMENTED]             "waste_count",
# [COMMENTED]             "waste_value",
# [COMMENTED]             "discount_total",
# [COMMENTED]             "inventory_snapshot",
# [COMMENTED]             "items_detail",
# [COMMENTED]             "top_items",
# [COMMENTED]             "closed_by",
# [COMMENTED]             "closed_by_name",
# [COMMENTED]             "closed_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["closed_at"]
# [COMMENTED] 
# [COMMENTED]     def get_closed_by_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.closed_by.get_full_name() if obj.closed_by else ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return ""
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class DayCloseLogSerializer(serializers.ModelSerializer):
# [COMMENTED]     user_name = serializers.SerializerMethodField()
# [COMMENTED]     action_display = serializers.CharField(source="get_action_display", read_only=True)
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = DayCloseLog
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "date",
# [COMMENTED]             "action",
# [COMMENTED]             "action_display",
# [COMMENTED]             "user",
# [COMMENTED]             "user_name",
# [COMMENTED]             "details",
# [COMMENTED]             "created_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["created_at"]
# [COMMENTED] 
# [COMMENTED]     def get_user_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.user.get_full_name() if obj.user else ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return ""
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] #  15. POINTS — EARN & REDEEM — ★ اصلاح‌شده
# [COMMENTED] # ══════════════════════════════════════════════════════════════════════════════
# [COMMENTED] 
# [COMMENTED] 
class EarnPointsSerializer(serializers.Serializer):
    # ★ FIXED: order_id — view باید به Order instance تبدیل کند
    order_id = serializers.IntegerField()
    order_amount = serializers.DecimalField(max_digits=14, decimal_places=0)

    def validate_order_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("مبلغ سفارش نامعتبر است.")
        return value


class RedeemPointsSerializer(serializers.Serializer):
    points = serializers.IntegerField(min_value=1)
    # ★ FIXED: order_id — view باید به Order instance تبدیل کند
    order_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_points(self, value):
        if value < 100:
            raise serializers.ValidationError("حداقل ۱۰۰ امتیاز قابل استفاده است.")
        return value


# ══════════════════════════════════════════════════════════════════════════════
#  16. FULL ORDER PROCESSING — ★ اصلاح‌شده
# ══════════════════════════════════════════════════════════════════════════════


class ProcessOrderLoyaltySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=11)
    # ★ FIXED: order_id — view باید به Order instance تبدیل کند و به service بدهد
    order_id = serializers.IntegerField()
    order_amount = serializers.DecimalField(max_digits=14, decimal_places=0)
    coupon_code = serializers.CharField(max_length=30, required=False, default="")
    use_wallet = serializers.DecimalField(
        max_digits=14, decimal_places=0, required=False, default=0
    )
    redeem_points = serializers.IntegerField(required=False, default=0)

    def validate_phone(self, value):
        if not value.isdigit() or len(value) != 11:
            raise serializers.ValidationError("شماره موبایل نامعتبر است.")
        return value

    def validate_order_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("مبلغ سفارش نامعتبر است.")
        return value


# ══════════════════════════════════════════════════════════════════════════════
#  17. DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════


class LoyaltyDashboardSerializer(serializers.Serializer):
    total_customers = serializers.IntegerField()
    new_this_month = serializers.IntegerField()
    total_points_issued = serializers.IntegerField()
    total_points_redeemed = serializers.IntegerField()
    points_outstanding = serializers.IntegerField()
    level_distribution = serializers.ListField()
    wallet_total_balance = serializers.IntegerField()
    top_customers = serializers.ListField()


# ══════════════════════════════════════════════════════════════════════════════
#  18. AUTHENTICATION
# ══════════════════════════════════════════════════════════════════════════════


class CustomTokenObtainSerializer(TokenObtainPairSerializer):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["phone_number"] = serializers.CharField(required=False)
        self.fields["password"] = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username = attrs.get("username")
        phone = attrs.get("phone_number")
        password = attrs.get("password")

        if not username and not phone:
            raise serializers.ValidationError(
                {"error": "نام کاربری یا شماره موبایل الزامی است."}
            )

        user = None
        if phone:
            user = User.objects.filter(phone_number=phone).first()
            if user:
                attrs["username"] = user.username
        elif username:
            user = User.objects.filter(username=username).first()

        if not user or not user.check_password(password):
            raise serializers.ValidationError(
                {"error": "نام کاربری یا رمز عبور اشتباه است."}
            )

        if not user.is_active:
            raise serializers.ValidationError({"error": "حساب کاربری غیرفعال است."})

        if not user.is_approved:
            raise serializers.ValidationError(
                {
                    "error": "حساب شما هنوز توسط مدیر تأیید نشده است.",
                    "pending": True,
                }
            )

        data = super().validate(attrs)
        data["user"] = UserDetailSerializer(user).data
        data["message"] = "ورود موفقیت‌آمیز بود."
        data["success"] = True
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        token["restaurant_id"] = user.restaurant_id
        return token


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "username",
            "phone_number",
            "first_name",
            "last_name",
            "email",
            "password",
            "password_confirm",
            "role",
        ]

    def validate_phone_number(self, value):
        if value and User.objects.filter(phone_number=value).exists():
            raise serializers.ValidationError("این شماره موبایل قبلاً ثبت شده.")
        return value

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("این نام کاربری قبلاً وجود دارد.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "رمزهای عبور مطابقت ندارند."}
            )
        password_validation.validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    restaurant_name = serializers.CharField(
        source="restaurant.name", read_only=True, default=None
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "phone_number",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "role",
            "role_display",
            "restaurant",
            "restaurant_name",
            "profile_image",
            "is_verified",
            "is_active",
            "created_at",
            "updated_at",
            "demo_logins_remaining",  
        ]
        read_only_fields = [
            "id",
            "username",
            "role",
            "is_verified",
            "created_at",
            "updated_at",
            "demo_logins_remaining", 
        ]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

class UserListSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "phone_number",
            "full_name",
            "role",
            "role_display",
            "is_active",
            "created_at",
        ]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "phone_number",
            "first_name",
            "last_name",
            "email",
            "profile_image",
        ]
        read_only_fields = ["id", "username"]


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("رمز عبور فعلی اشتباه است.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "رمزهای عبور جدید مطابقت ندارند."}
            )
        password_validation.validate_password(attrs["new_password"])
        return attrs


class ResetPasswordSerializer(serializers.Serializer):
    phone_number = serializers.CharField()
    new_password = serializers.CharField(min_length=8)
    new_password_confirm = serializers.CharField()

    def validate_phone_number(self, value):
        if not User.objects.filter(phone_number=value).exists():
            raise serializers.ValidationError("کاربری با این شماره یافت نشد.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "رمزهای عبور مطابقت ندارند."}
            )
        return attrs


class RestaurantAuthSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Restaurant
        fields = [
            "id",
            "name",
            "phone",
            "address",
            "logo",
            "is_active",
            "user_count",
            "created_at",
        ]

    def get_user_count(self, obj):
        return obj.users.filter(is_active=True).count()


RestaurantSerializer = RestaurantAuthSerializer



class WarehouseSerializer(serializers.ModelSerializer):
    warehouse_type_display = serializers.CharField(
        source="get_warehouse_type_display", read_only=True
    )
    stock_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Warehouse
        fields = [
            "id",
            "name",
            "warehouse_type",
            "warehouse_type_display",
            "is_mother",
            "description",
            "is_active",
            "stock_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class StockItemSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(
        source="raw_material.name", read_only=True
    )
    material_unit = serializers.CharField(
        source="raw_material.unit", read_only=True
    )
    material_unit_display = serializers.SerializerMethodField()
    material_price = serializers.SerializerMethodField()
    warehouse_name = serializers.CharField(
        source="warehouse.name", read_only=True
    )
    total_value = serializers.SerializerMethodField()
    minimum_stock = serializers.SerializerMethodField()
    target_stock = serializers.SerializerMethodField()
    is_low = serializers.SerializerMethodField()

    class Meta:
        model = StockItem
        fields = [
            "id",
            "raw_material",
            "material_name",
            "material_unit",
            "material_unit_display",
            "material_price",
            "warehouse",
            "warehouse_name",
            "quantity",
            "total_value",
            "minimum_stock",
            "target_stock",
            "is_low",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def get_material_unit_display(self, obj):
        try:
            return obj.raw_material.get_unit_display()
        except Exception:
            return obj.raw_material.unit if obj.raw_material else ""

    def get_material_price(self, obj):
        try:
            return int(obj.raw_material.price)
        except (TypeError, ValueError):
            return 0

    def get_total_value(self, obj):
        try:
            return int(obj.total_value)
        except (TypeError, ValueError):
            return 0

    def get_minimum_stock(self, obj):
        try:
            return float(obj.raw_material.minimum_stock or 0)
        except Exception:
            return 0

    def get_target_stock(self, obj):
        try:
            return float(obj.raw_material.target_stock or 0)
        except Exception:
            return 0

    def get_is_low(self, obj):
        try:
            return obj.is_low
        except Exception:
            return False


# [COMMENTED] class StockTransferSerializer(serializers.ModelSerializer):
# [COMMENTED]     source_warehouse_name = serializers.CharField(
# [COMMENTED]         source="source_warehouse.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     destination_warehouse_name = serializers.CharField(
# [COMMENTED]         source="destination_warehouse.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     material_name = serializers.CharField(
# [COMMENTED]         source="raw_material.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     status_display = serializers.CharField(
# [COMMENTED]         source="get_status_display", read_only=True
# [COMMENTED]     )
# [COMMENTED]     created_by_name = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = StockTransfer
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "source_warehouse",
# [COMMENTED]             "source_warehouse_name",
# [COMMENTED]             "destination_warehouse",
# [COMMENTED]             "destination_warehouse_name",
# [COMMENTED]             "raw_material",
# [COMMENTED]             "material_name",
# [COMMENTED]             "quantity",
# [COMMENTED]             "unit",
# [COMMENTED]             "status",
# [COMMENTED]             "status_display",
# [COMMENTED]             "reference",
# [COMMENTED]             "notes",
# [COMMENTED]             "created_by",
# [COMMENTED]             "created_by_name",
# [COMMENTED]             "created_at",
# [COMMENTED]             "completed_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["created_at", "completed_at"]
# [COMMENTED] 
# [COMMENTED]     def get_created_by_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.created_by.get_full_name() if obj.created_by else ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return ""
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class ReceivingItemSerializer(serializers.ModelSerializer):
# [COMMENTED]     material_name = serializers.CharField(
# [COMMENTED]         source="raw_material.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     line_total = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = ReceivingItem
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "raw_material",
# [COMMENTED]             "material_name",
# [COMMENTED]             "quantity_ordered",
# [COMMENTED]             "quantity_received",
# [COMMENTED]             "unit",
# [COMMENTED]             "unit_price",
# [COMMENTED]             "line_total",
# [COMMENTED]         ]
# [COMMENTED] 
# [COMMENTED]     def get_line_total(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return int(obj.line_total)
# [COMMENTED]         except (TypeError, ValueError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class ReceivingSerializer(serializers.ModelSerializer):
# [COMMENTED]     items = ReceivingItemSerializer(many=True, read_only=True)
# [COMMENTED]     warehouse_name = serializers.CharField(
# [COMMENTED]         source="warehouse.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     supplier_name = serializers.CharField(
# [COMMENTED]         source="supplier.name", read_only=True, default=""
# [COMMENTED]     )
# [COMMENTED]     purchase_invoice_number = serializers.CharField(
# [COMMENTED]         source="purchase_invoice.invoice_number", read_only=True, default=""
# [COMMENTED]     )
# [COMMENTED]     status_display = serializers.CharField(
# [COMMENTED]         source="get_status_display", read_only=True
# [COMMENTED]     )
# [COMMENTED]     total_amount = serializers.SerializerMethodField()
# [COMMENTED]     item_count = serializers.SerializerMethodField()
# [COMMENTED]     received_by_name = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = Receiving
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "purchase_invoice",
# [COMMENTED]             "purchase_invoice_number",
# [COMMENTED]             "warehouse",
# [COMMENTED]             "warehouse_name",
# [COMMENTED]             "supplier",
# [COMMENTED]             "supplier_name",
# [COMMENTED]             "status",
# [COMMENTED]             "status_display",
# [COMMENTED]             "items",
# [COMMENTED]             "total_amount",
# [COMMENTED]             "item_count",
# [COMMENTED]             "notes",
# [COMMENTED]             "received_by",
# [COMMENTED]             "received_by_name",
# [COMMENTED]             "received_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["received_at"]
# [COMMENTED] 
# [COMMENTED]     def get_total_amount(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return int(obj.total_amount)
# [COMMENTED]         except (TypeError, ValueError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_item_count(self, obj):
# [COMMENTED]         return obj.items.count()
# [COMMENTED] 
# [COMMENTED]     def get_received_by_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.received_by.get_full_name() if obj.received_by else ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return ""
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class StockLayerSerializer(serializers.ModelSerializer):
# [COMMENTED]     material_name = serializers.CharField(
# [COMMENTED]         source="raw_material.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     warehouse_name = serializers.CharField(
# [COMMENTED]         source="warehouse.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     supplier_name = serializers.CharField(
# [COMMENTED]         source="supplier.name", read_only=True, default=""
# [COMMENTED]     )
# [COMMENTED]     total_cost = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = StockLayer
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "raw_material",
# [COMMENTED]             "material_name",
# [COMMENTED]             "warehouse",
# [COMMENTED]             "warehouse_name",
# [COMMENTED]             "quantity_original",
# [COMMENTED]             "quantity_remaining",
# [COMMENTED]             "unit_cost",
# [COMMENTED]             "total_cost",
# [COMMENTED]             "supplier",
# [COMMENTED]             "supplier_name",
# [COMMENTED]             "reference_type",
# [COMMENTED]             "reference_id",
# [COMMENTED]             "received_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["received_at"]
# [COMMENTED] 
# [COMMENTED]     def get_total_cost(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return int(obj.total_cost)
# [COMMENTED]         except (TypeError, ValueError):
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class StockAdjustmentSerializer(serializers.ModelSerializer):
# [COMMENTED]     material_name = serializers.CharField(
# [COMMENTED]         source="raw_material.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     warehouse_name = serializers.CharField(
# [COMMENTED]         source="warehouse.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     adjustment_type_display = serializers.CharField(
# [COMMENTED]         source="get_adjustment_type_display", read_only=True
# [COMMENTED]     )
# [COMMENTED]     adjusted_by_name = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = StockAdjustment
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "warehouse",
# [COMMENTED]             "warehouse_name",
# [COMMENTED]             "raw_material",
# [COMMENTED]             "material_name",
# [COMMENTED]             "previous_quantity",
# [COMMENTED]             "new_quantity",
# [COMMENTED]             "difference",
# [COMMENTED]             "adjustment_type",
# [COMMENTED]             "adjustment_type_display",
# [COMMENTED]             "reason",
# [COMMENTED]             "notes",
# [COMMENTED]             "adjusted_by",
# [COMMENTED]             "adjusted_by_name",
# [COMMENTED]             "adjusted_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["adjusted_at"]
# [COMMENTED] 
# [COMMENTED]     def get_adjusted_by_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return obj.adjusted_by.get_full_name() if obj.adjusted_by else ""
# [COMMENTED]         except Exception:
# [COMMENTED]             return ""
# [COMMENTED] 
# [COMMENTED] 
# [COMMENTED] class PurchaseListItemSerializer(serializers.ModelSerializer):
# [COMMENTED]     material_name = serializers.CharField(
# [COMMENTED]         source="raw_material.name", read_only=True
# [COMMENTED]     )
# [COMMENTED]     material_unit = serializers.CharField(
# [COMMENTED]         source="raw_material.unit", read_only=True
# [COMMENTED]     )
# [COMMENTED]     current_stock = serializers.SerializerMethodField()
# [COMMENTED]     minimum_stock = serializers.SerializerMethodField()
# [COMMENTED]     target_stock = serializers.SerializerMethodField()
# [COMMENTED]     status_display = serializers.CharField(
# [COMMENTED]         source="get_status_display", read_only=True
# [COMMENTED]     )
# [COMMENTED]     supplier_name = serializers.SerializerMethodField()
# [COMMENTED] 
# [COMMENTED]     class Meta:
# [X] # [COMMENTED]         model = PurchaseListItem
# [COMMENTED]         fields = [
# [COMMENTED]             "id",
# [COMMENTED]             "raw_material",
# [COMMENTED]             "material_name",
# [COMMENTED]             "material_unit",
# [COMMENTED]             "current_stock",
# [COMMENTED]             "minimum_stock",
# [COMMENTED]             "target_stock",
# [COMMENTED]             "suggested_quantity",
# [COMMENTED]             "status",
# [COMMENTED]             "status_display",
# [COMMENTED]             "purchase_invoice",
# [COMMENTED]             "supplier_name",
# [COMMENTED]             "notes",
# [COMMENTED]             "created_at",
# [COMMENTED]             "updated_at",
# [COMMENTED]         ]
# [COMMENTED]         read_only_fields = ["created_at", "updated_at"]
# [COMMENTED] 
# [COMMENTED]     def get_current_stock(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return float(obj.raw_material.quantity or 0)
# [COMMENTED]         except Exception:
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_minimum_stock(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return float(obj.raw_material.minimum_stock or 0)
# [COMMENTED]         except Exception:
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_target_stock(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             return float(obj.raw_material.target_stock or 0)
# [COMMENTED]         except Exception:
# [COMMENTED]             return 0
# [COMMENTED] 
# [COMMENTED]     def get_supplier_name(self, obj):
# [COMMENTED]         try:
# [COMMENTED]             if obj.purchase_invoice and obj.purchase_invoice.supplier:
# [COMMENTED]                 return obj.purchase_invoice.supplier.name
# [COMMENTED]         except Exception:
# [COMMENTED]             pass
# [COMMENTED]         return ""