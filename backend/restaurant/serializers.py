"""
Restaurant Management System — Serializers (اصلاح‌شده)
تغییرات مشخص شده با ★FIX
"""

from rest_framework import serializers
from django.utils import timezone
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth import password_validation
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    Category, Food, Table, Reservation, Order, OrderItem,
    ReadyMaterial,
    SemiFinished, SemiFinishedIngredient,
    Restaurant,
    Recipe,
    MembershipLevel, CustomerProfile,
    LoyaltyTransaction,
    LoyaltyWallet, WalletTransaction,
    Coupon, CustomerCoupon,
    Reward, RewardRedemption,
    Referral, LoyaltyNotification,
    KitchenProduct, KitchenInventory, ProductionPlan,
    ProductionPlanItem, ProductionBatch, KitchenDiscount,
    CapacityAnalysis, ProductionLog,
)

User = get_user_model()


# ══════════════════════════════════════════════════════════════════════════════
#  1. FOOD & CATEGORY
# ══════════════════════════════════════════════════════════════════════════════

class FoodSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Food
        fields = [
            'id', 'name', 'image', 'price', 'final_price',
            'category', 'category_name', 'is_available',
        ]


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'image', 'is_active', 'order']


# ★FIX: Race condition در upsert — حالا از update_or_create استفاده می‌کنه
class RecipeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recipe
        fields = '__all__'

    def create(self, validated_data):
        food = validated_data.get('food')
        if food:
            recipe, created = Recipe.objects.update_or_create(
                food=food,
                defaults=validated_data,
            )
            return recipe
        return super().create(validated_data)


# ══════════════════════════════════════════════════════════════════════════════
#  2. TABLES & RESERVATIONS
# ══════════════════════════════════════════════════════════════════════════════

class TableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Table
        fields = '__all__'


class ReservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reservation
        fields = '__all__'


# ══════════════════════════════════════════════════════════════════════════════
#  3. ORDERS
# ══════════════════════════════════════════════════════════════════════════════

class OrderItemSerializer(serializers.ModelSerializer):
    food_name = serializers.CharField(source='food.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'food', 'food_name', 'quantity', 'price']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'customer_name', 'phone', 'table',
            'status', 'total_price', 'created_at', 'items',
        ]
        read_only_fields = ['id', 'created_at']


# ══════════════════════════════════════════════════════════════════════════════
#  4. SEMI-FINISHED PRODUCTS
# ══════════════════════════════════════════════════════════════════════════════

# ★FIX: null-safe بودن raw_material
class SemiFinishedIngredientSerializer(serializers.ModelSerializer):
    raw_material_name = serializers.SerializerMethodField()
    raw_material_id = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    stock = serializers.SerializerMethodField()

    class Meta:
        model = SemiFinishedIngredient
        fields = [
            'id', 'raw_material', 'raw_material_id',
            'raw_material_name', 'quantity', 'unit', 'price', 'stock',
        ]

    def get_raw_material_name(self, obj):
        return obj.raw_material.name if obj.raw_material else ''

    def get_raw_material_id(self, obj):
        return obj.raw_material.id if obj.raw_material else None

    def get_unit(self, obj):
        return obj.raw_material.unit if obj.raw_material else ''

    def get_price(self, obj):
        return int(obj.raw_material.price) if obj.raw_material else 0

    def get_stock(self, obj):
        if obj.raw_material:
            return float(obj.raw_material.quantity)
        return 0


# ★FIX: null-safe بودن property ها + جلوگیری از TypeError
class SemiFinishedSerializer(serializers.ModelSerializer):
    ingredients = SemiFinishedIngredientSerializer(many=True, read_only=True)
    total_cost = serializers.SerializerMethodField()
    cost_per_unit = serializers.SerializerMethodField()
    suggested_price = serializers.SerializerMethodField()
    can_produce = serializers.SerializerMethodField()

    class Meta:
        model = SemiFinished
        fields = '__all__'

    def get_total_cost(self, obj):
        try:
            return int(obj.total_cost)
        except (TypeError, ValueError):
            return 0

    def get_cost_per_unit(self, obj):
        try:
            return int(obj.cost_per_unit)
        except (TypeError, ValueError):
            return 0

    def get_suggested_price(self, obj):
        try:
            return int(obj.suggested_price)
        except (TypeError, ValueError):
            return 0

    def get_can_produce(self, obj):
        try:
            return obj.can_produce
        except Exception:
            return False


# ══════════════════════════════════════════════════════════════════════════════
#  6. KITCHEN MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

# ★FIX: null-safe + int() یکنواخت + حذف side-effect از active_discounts
class KitchenProductSerializer(serializers.ModelSerializer):
    recipe_name = serializers.CharField(source='recipe.food.name', read_only=True, default='')
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    cost = serializers.SerializerMethodField()
    profit = serializers.SerializerMethodField()
    max_production = serializers.SerializerMethodField()
    limiting_material = serializers.SerializerMethodField()
    current_stock = serializers.SerializerMethodField()
    available_stock = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()
    active_discounts = serializers.SerializerMethodField()

    class Meta:
        model = KitchenProduct
        fields = [
            'id', 'name', 'recipe', 'recipe_name',
            'category', 'category_display', 'description', 'image',
            'selling_price', 'is_active',
            'cost', 'profit', 'max_production', 'limiting_material',
            'current_stock', 'available_stock', 'is_low_stock',
            'active_discounts',
            'created_at', 'updated_at',
        ]

    # ★FIX: try/except + None safety
    def get_cost(self, obj):
        try:
            c = obj.calculate_cost()
            return int(c) if c is not None else 0
        except Exception:
            return 0

    # ★FIX: int() مثل get_cost برای سازگاری
    def get_profit(self, obj):
        try:
            p = obj.calculate_profit()
            return int(p) if p is not None else 0
        except Exception:
            return 0

    # ★FIX: tuple unpacking ایمن
    def get_max_production(self, obj):
        try:
            result = obj.calculate_max_production()
            if isinstance(result, (tuple, list)) and len(result) >= 1:
                return result[0]
            return result
        except Exception:
            return 0

    def get_limiting_material(self, obj):
        try:
            result = obj.calculate_max_production()
            if isinstance(result, (tuple, list)) and len(result) >= 2:
                return result[1]
            return None
        except Exception:
            return None

    # ★FIX: get_inventory ممکنه side-effect داشته باشه — ایمن‌تر
    def get_current_stock(self, obj):
        try:
            inv = obj.get_inventory()
            return inv.quantity if inv else 0
        except Exception:
            return 0

    def get_available_stock(self, obj):
        try:
            inv = obj.get_inventory()
            return inv.available_quantity if inv else 0
        except Exception:
            return 0

    def get_is_low_stock(self, obj):
        try:
            inv = obj.get_inventory()
            return inv.is_low_stock if inv else False
        except Exception:
            return False

    # ★FIX بحرانی: قبلاً KitchenDiscountSerializer فراخوانی می‌شد
    # که side-effect داشت (غیرفعال‌سازی تخفیف‌های منقضی).
    # حالا فقط داده خام برمی‌گردونه بدون side-effect.
    def get_active_discounts(self, obj):
        qs = obj.discounts.filter(is_active=True, expires_at__gt=timezone.now())
        return [
            {
                'id': d.id,
                'name': d.name,
                'discount_type': d.discount_type,
                'value': int(d.value),
                'scope': d.scope,
                'max_quantity': d.max_quantity,
                'start_time': str(d.start_time) if d.start_time else None,
                'end_time': str(d.end_time) if d.end_time else None,
                'expires_at': d.expires_at.isoformat() if d.expires_at else None,
            }
            for d in qs
        ]


class KitchenInventorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='kitchen_product.name', read_only=True)
    available = serializers.IntegerField(source='available_quantity', read_only=True)
    is_low = serializers.BooleanField(source='is_low_stock', read_only=True)

    class Meta:
        model = KitchenInventory
        fields = '__all__'


class ProductionPlanItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='kitchen_product.name', read_only=True)
    required_materials = serializers.SerializerMethodField()

    class Meta:
        model = ProductionPlanItem
        fields = ['id', 'kitchen_product', 'product_name', 'quantity', 'required_materials']

    def get_required_materials(self, obj):
        try:
            return obj.required_materials()
        except Exception:
            return []


class ProductionPlanSerializer(serializers.ModelSerializer):
    items = ProductionPlanItemSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    items_data = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = ProductionPlan
        fields = [
            'id', 'date', 'status', 'status_display',
            'created_by', 'created_by_name', 'notes',
            'items', 'items_data',
            'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        try:
            return obj.created_by.get_full_name() if obj.created_by else ''
        except Exception:
            return ''

    def create(self, validated_data):
        items = validated_data.pop('items_data', [])
        plan = ProductionPlan.objects.create(**validated_data)
        for d in items:
            ProductionPlanItem.objects.create(
                production_plan=plan,
                kitchen_product_id=d.get('kitchen_product_id') or d.get('kitchen_product'),
                quantity=d.get('quantity', 0),
            )
        return plan


class ProductionBatchSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='kitchen_product.name', read_only=True)
    produced_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ProductionBatch
        fields = '__all__'

    def get_produced_by_name(self, obj):
        try:
            return obj.produced_by.get_full_name() if obj.produced_by else ''
        except Exception:
            return ''


# ★FIX بحرانی: حذف side-effect از to_representation + اضافه کردن validation
class KitchenDiscountSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    discount_type_display = serializers.CharField(source='get_discount_type_display', read_only=True)
    scope_display = serializers.CharField(source='get_scope_display', read_only=True)

    class Meta:
        model = KitchenDiscount
        fields = [
            'id', 'name', 'kitchen_product', 'product_name',
            'discount_type', 'discount_type_display',
            'scope', 'scope_display',
            'value', 'max_quantity', 'minimum_stock',
            'start_time', 'end_time',
            'is_active', 'expires_at',
            'created_at',
        ]
        read_only_fields = ['created_at']

    def get_product_name(self, obj):
        try:
            return obj.kitchen_product.name if obj.kitchen_product else 'همه محصولات'
        except Exception:
            return ''

    # ★FIX: حذف side-effect — غیرفعال‌سازی باید در View یا Cron Job انجام بشه
    # نه در serializer چون READ نباید WRITE انجام بده
    #
    # قبلاً اینجا بود:
    # def to_representation(self, instance):
    #     if instance.expires_at and instance.expires_at <= timezone.now() and instance.is_active:
    #         instance.is_active = False
    #         instance.save(update_fields=['is_active'])
    #     return super().to_representation(instance)

    # ★FIX: اضافه کردن validation
    def validate_value(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError('مقدار تخفیف نمی‌تواند منفی باشد.')
        return value

    def validate(self, data):
        discount_type = data.get('discount_type') or getattr(self.instance, 'discount_type', None)
        value = data.get('value')

        # تخفیف درصدی نباید بالای ۱۰۰ باشد
        if discount_type == 'percentage' and value is not None:
            if value > 100:
                raise serializers.ValidationError({'value': 'درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد.'})

        # تخفیف مبلغی نباید منفی باشد
        if discount_type == 'fixed_amount' and value is not None:
            if value < 0:
                raise serializers.ValidationError({'value': 'مبلغ تخفیف نمی‌تواند منفی باشد.'})

        # ساعت خوش باید start_time و end_time داشته باشد
        scope = data.get('scope') or getattr(self.instance, 'scope', None)
        if scope == 'happy_hour':
            start = data.get('start_time') or getattr(self.instance, 'start_time', None)
            end = data.get('end_time') or getattr(self.instance, 'end_time', None)
            if not start or not end:
                raise serializers.ValidationError(
                    'برای ساعت خوش، ساعت شروع و پایان الزامی است.'
                )

        # تاریخ انقضا باید در آینده باشد
        expires_at = data.get('expires_at')
        if expires_at and expires_at <= timezone.now():
            raise serializers.ValidationError(
                {'expires_at': 'تاریخ انقضا باید در آینده باشد.'}
            )

        return data


class CapacityAnalysisSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='kitchen_product.name', read_only=True)

    class Meta:
        model = CapacityAnalysis
        fields = '__all__'


class ProductionLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()

    class Meta:
        model = ProductionLog
        fields = '__all__'

    def get_user_name(self, obj):
        try:
            return obj.user.get_full_name() if obj.user else '—'
        except Exception:
            return '—'

    def get_product_name(self, obj):
        try:
            return obj.kitchen_product.name if obj.kitchen_product else '—'
        except Exception:
            return '—'


# ══════════════════════════════════════════════════════════════════════════════
#  7. MEMBERSHIP LEVEL
# ══════════════════════════════════════════════════════════════════════════════

class MembershipLevelSerializer(serializers.ModelSerializer):
    customer_count = serializers.SerializerMethodField()

    class Meta:
        model = MembershipLevel
        fields = [
            'id', 'name', 'title', 'icon', 'color',
            'min_spending', 'min_points',
            'discount_percent', 'points_multiplier',
            'free_delivery', 'cashback_rate', 'priority_support',
            'description', 'order',
            'customer_count',
        ]

    def get_customer_count(self, obj):
        return obj.customers.filter(is_active=True).count()


# ══════════════════════════════════════════════════════════════════════════════
#  8. CUSTOMER PROFILE
# ══════════════════════════════════════════════════════════════════════════════

class CustomerListSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    membership_title = serializers.CharField(source='membership_level.title', default='', read_only=True)
    membership_icon = serializers.CharField(source='membership_level.icon', default='', read_only=True)
    membership_color = serializers.CharField(source='membership_level.color', default='', read_only=True)
    wallet_balance = serializers.ReadOnlyField()

    class Meta:
        model = CustomerProfile
        fields = [
            'id', 'phone', 'full_name', 'first_name', 'last_name',
            'membership_title', 'membership_icon', 'membership_color',
            'total_points', 'available_points', 'total_spending', 'total_orders',
            'wallet_balance', 'is_active', 'joined_at',
        ]


class CustomerDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    wallet_balance = serializers.ReadOnlyField()
    is_birthday_today = serializers.ReadOnlyField()
    membership_benefits = serializers.ReadOnlyField()
    membership_level = MembershipLevelSerializer(read_only=True)
    referral_link = serializers.SerializerMethodField()
    recent_transactions = serializers.SerializerMethodField()
    recent_coupons = serializers.SerializerMethodField()

    class Meta:
        model = CustomerProfile
        fields = [
            'id', 'phone', 'email', 'first_name', 'last_name', 'full_name',
            'birth_date', 'profile_image',
            'membership_level', 'membership_benefits',
            'total_points', 'available_points', 'total_spending', 'total_orders',
            'wallet_balance', 'is_birthday_today',
            'referral_code', 'referral_link', 'referred_by',
            'notes', 'is_active', 'joined_at', 'updated_at',
            'recent_transactions', 'recent_coupons',
        ]
        read_only_fields = [
            'total_points', 'available_points', 'total_spending', 'total_orders',
            'referral_code', 'joined_at', 'updated_at',
        ]

    def get_referral_link(self, obj):
        request = self.context.get('request')
        if request and obj.referral_code:
            return f"{request.build_absolute_uri('/').rstrip('/')}/loyalty/register?ref={obj.referral_code}"
        return None

    def get_recent_transactions(self, obj):
        txns = obj.loyalty_transactions.all()[:10]
        return LoyaltyTransactionSerializer(txns, many=True).data

    def get_recent_coupons(self, obj):
        usages = obj.customer_coupons.select_related('coupon').order_by('-last_used_at')[:5]
        return CustomerCouponSerializer(usages, many=True).data


class CustomerCreateSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=11)
    first_name = serializers.CharField(max_length=100, required=False, default='')
    last_name = serializers.CharField(max_length=100, required=False, default='')
    email = serializers.EmailField(required=False, default='')
    birth_date = serializers.DateField(required=False, allow_null=True)
    referral_code = serializers.CharField(max_length=12, required=False, default='')

    def validate_phone(self, value):
        if not value.isdigit() or len(value) != 11:
            raise serializers.ValidationError('شماره موبایل باید ۱۱ رقم باشد.')
        if not value.startswith('09'):
            raise serializers.ValidationError('شماره موبایل باید با ۰۹ شروع شود.')
        return value


class CustomerUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerProfile
        fields = ['first_name', 'last_name', 'email', 'birth_date', 'profile_image', 'notes']


# ══════════════════════════════════════════════════════════════════════════════
#  9. LOYALTY TRANSACTION
# ══════════════════════════════════════════════════════════════════════════════

class LoyaltyTransactionSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    sign = serializers.SerializerMethodField()

    class Meta:
        model = LoyaltyTransaction
        fields = [
            'id', 'transaction_type', 'type_display', 'sign',
            'points', 'balance_after', 'description',
            'order_id', 'created_at',
        ]

    def get_sign(self, obj):
        return '+' if obj.transaction_type in ('earn', 'referral', 'birthday', 'cashback', 'bonus') else '-'


# ══════════════════════════════════════════════════════════════════════════════
#  10. COUPONS
# ══════════════════════════════════════════════════════════════════════════════

class CouponListSerializer(serializers.ModelSerializer):
    is_valid_now = serializers.BooleanField(source='is_valid', read_only=True)
    discount_label = serializers.SerializerMethodField()
    remaining_uses = serializers.SerializerMethodField()

    class Meta:
        model = Coupon
        fields = [
            'id', 'code', 'name', 'coupon_type',
            'discount_type', 'discount_value', 'discount_label',
            'max_discount_amount', 'min_order_amount',
            'max_uses', 'used_count', 'remaining_uses',
            'valid_from', 'valid_until', 'is_active', 'is_valid_now',
            'created_at',
        ]

    def get_discount_label(self, obj):
        if obj.discount_type == 'percentage':
            label = f"{obj.discount_value}%"
            if obj.max_discount_amount:
                label += f" (تا {obj.max_discount_amount:,} تومان)"
            return label
        return f"{obj.discount_value:,} تومان"

    def get_remaining_uses(self, obj):
        return max(0, obj.max_uses - obj.used_count)


class CouponDetailSerializer(CouponListSerializer):
    applicable_levels = MembershipLevelSerializer(many=True, read_only=True)
    usage_stats = serializers.SerializerMethodField()

    class Meta(CouponListSerializer.Meta):
        fields = CouponListSerializer.Meta.fields + [
            'description', 'applicable_levels', 'max_uses_per_customer',
            'usage_stats', 'updated_at',
        ]

    def get_usage_stats(self, obj):
        usages = obj.customer_coupons.all()
        return {
            'unique_customers': usages.count(),
            'total_uses': sum(u.used_count for u in usages),
        }


class CouponCreateSerializer(serializers.ModelSerializer):
    applicable_level_ids = serializers.PrimaryKeyRelatedField(
        queryset=MembershipLevel.objects.all(),
        many=True, required=False, write_only=True,
    )

    class Meta:
        model = Coupon
        fields = [
            'code', 'name', 'description', 'coupon_type',
            'discount_type', 'discount_value',
            'max_discount_amount', 'min_order_amount',
            'max_uses', 'max_uses_per_customer',
            'valid_from', 'valid_until', 'is_active',
            'applicable_level_ids',
        ]

    def validate(self, data):
        if data.get('valid_from') and data.get('valid_until'):
            if data['valid_from'] >= data['valid_until']:
                raise serializers.ValidationError({'valid_until': 'تاریخ پایان باید بعد از شروع باشد.'})
        return data

    def create(self, validated_data):
        level_ids = validated_data.pop('applicable_level_ids', [])
        coupon = Coupon.objects.create(**validated_data)
        if level_ids:
            coupon.applicable_levels.set(level_ids)
        return coupon


class CouponValidateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=30)
    order_amount = serializers.DecimalField(max_digits=12, decimal_places=0)


class CouponApplySerializer(serializers.Serializer):
    code = serializers.CharField(max_length=30)
    order_amount = serializers.DecimalField(max_digits=12, decimal_places=0)
    order_id = serializers.IntegerField(required=False, allow_null=True)


class CustomerCouponSerializer(serializers.ModelSerializer):
    coupon_code = serializers.CharField(source='coupon.code', read_only=True)
    coupon_name = serializers.CharField(source='coupon.name', read_only=True)
    discount_type = serializers.CharField(source='coupon.discount_type', read_only=True)
    discount_value = serializers.DecimalField(
        source='coupon.discount_value', max_digits=12, decimal_places=0, read_only=True,
    )

    class Meta:
        model = CustomerCoupon
        fields = [
            'id', 'coupon_code', 'coupon_name', 'discount_type', 'discount_value',
            'used_count', 'first_used_at', 'last_used_at',
        ]


# ══════════════════════════════════════════════════════════════════════════════
#  11. WALLET
# ══════════════════════════════════════════════════════════════════════════════

class WalletSerializer(serializers.ModelSerializer):
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)

    class Meta:
        model = LoyaltyWallet
        fields = ['id', 'customer_phone', 'customer_name', 'balance', 'updated_at']


class WalletTransactionSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    sign = serializers.SerializerMethodField()

    class Meta:
        model = WalletTransaction
        fields = [
            'id', 'transaction_type', 'type_display', 'sign',
            'amount', 'balance_after', 'description',
            'order_id', 'created_at',
        ]

    def get_sign(self, obj):
        return '+' if obj.transaction_type in ('deposit', 'cashback', 'refund', 'reward') else '-'


class WalletDepositSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=0)
    description = serializers.CharField(max_length=300, required=False, default='')

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('مبلغ باید بزرگ‌تر از صفر باشد.')
        return value


class WalletDebitSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=0)
    description = serializers.CharField(max_length=300, required=False, default='')
    order_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('مبلغ باید بزرگ‌تر از صفر باشد.')
        return value


# ══════════════════════════════════════════════════════════════════════════════
#  12. REWARDS
# ══════════════════════════════════════════════════════════════════════════════

class RewardListSerializer(serializers.ModelSerializer):
    is_available_now = serializers.BooleanField(source='is_available', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    min_level_title = serializers.CharField(source='min_membership_level.title', default=None, read_only=True)
    min_level_icon = serializers.CharField(source='min_membership_level.icon', default=None, read_only=True)

    class Meta:
        model = Reward
        fields = [
            'id', 'name', 'description', 'category', 'category_display',
            'image', 'points_required', 'value',
            'quantity_available', 'is_available_now',
            'min_level_title', 'min_level_icon',
            'is_active',
        ]


class RewardDetailSerializer(RewardListSerializer):
    can_afford = serializers.SerializerMethodField()

    class Meta(RewardListSerializer.Meta):
        fields = RewardListSerializer.Meta.fields + ['can_afford', 'created_at']

    def get_can_afford(self, obj):
        request = self.context.get('request')
        if request:
            phone = request.query_params.get('phone') or request.headers.get('X-Customer-Phone')
            if phone:
                customer = CustomerProfile.objects.filter(phone=phone).first()
                if customer:
                    return customer.available_points >= obj.points_required
        return None


class RewardCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reward
        fields = [
            'name', 'description', 'category', 'image',
            'points_required', 'value', 'quantity_available',
            'min_membership_level', 'is_active',
        ]


class RewardRedeemSerializer(serializers.Serializer):
    reward_id = serializers.IntegerField()


class RewardRedemptionSerializer(serializers.ModelSerializer):
    reward_name = serializers.CharField(source='reward.name', read_only=True)
    reward_category = serializers.CharField(source='reward.category', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = RewardRedemption
        fields = [
            'id', 'reward_name', 'reward_category',
            'points_spent', 'status', 'status_display',
            'redeemed_at',
        ]


# ══════════════════════════════════════════════════════════════════════════════
#  13. REFERRALS
# ══════════════════════════════════════════════════════════════════════════════

class ReferralSerializer(serializers.ModelSerializer):
    referrer_name = serializers.CharField(source='referrer.full_name', read_only=True)
    referrer_phone = serializers.CharField(source='referrer.phone', read_only=True)
    referred_name = serializers.CharField(source='referred.full_name', read_only=True)
    referred_phone = serializers.CharField(source='referred.phone', read_only=True)

    class Meta:
        model = Referral
        fields = [
            'id', 'referrer_name', 'referrer_phone',
            'referred_name', 'referred_phone',
            'referral_code', 'bonus_points',
            'is_rewarded', 'rewarded_at', 'created_at',
        ]


# ══════════════════════════════════════════════════════════════════════════════
#  14. NOTIFICATIONS
# ══════════════════════════════════════════════════════════════════════════════

class NotificationSerializer(serializers.ModelSerializer):
    channel_display = serializers.CharField(source='get_channel_display', read_only=True)
    type_display = serializers.CharField(source='get_notification_type_display', read_only=True)

    class Meta:
        model = LoyaltyNotification
        fields = [
            'id', 'channel', 'channel_display',
            'notification_type', 'type_display',
            'title', 'message', 'data',
            'is_read', 'is_sent', 'sent_at', 'created_at',
        ]


class NotificationMarkReadSerializer(serializers.Serializer):
    notification_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    mark_all = serializers.BooleanField(required=False, default=False)

    def validate(self, data):
        if not data.get('mark_all') and not data.get('notification_ids'):
            raise serializers.ValidationError('حداقل یکی از notification_ids یا mark_all لازم است.')
        return data


# ══════════════════════════════════════════════════════════════════════════════
#  15. POINTS — EARN & REDEEM
# ══════════════════════════════════════════════════════════════════════════════

class EarnPointsSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    order_amount = serializers.DecimalField(max_digits=14, decimal_places=0)

    def validate_order_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('مبلغ سفارش نامعتبر است.')
        return value


class RedeemPointsSerializer(serializers.Serializer):
    points = serializers.IntegerField(min_value=1)
    order_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_points(self, value):
        if value < 100:
            raise serializers.ValidationError('حداقل ۱۰۰ امتیاز قابل استفاده است.')
        return value


# ══════════════════════════════════════════════════════════════════════════════
#  16. FULL ORDER PROCESSING
# ══════════════════════════════════════════════════════════════════════════════

class ProcessOrderLoyaltySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=11)
    order_id = serializers.IntegerField()
    order_amount = serializers.DecimalField(max_digits=14, decimal_places=0)
    coupon_code = serializers.CharField(max_length=30, required=False, default='')
    use_wallet = serializers.DecimalField(max_digits=14, decimal_places=0, required=False, default=0)
    redeem_points = serializers.IntegerField(required=False, default=0)

    def validate_phone(self, value):
        if not value.isdigit() or len(value) != 11:
            raise serializers.ValidationError('شماره موبایل نامعتبر است.')
        return value

    def validate_order_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('مبلغ سفارش نامعتبر است.')
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
        self.fields['phone_number'] = serializers.CharField(required=False)
        self.fields['password'] = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username = attrs.get('username')
        phone = attrs.get('phone_number')
        password = attrs.get('password')

        if not username and not phone:
            raise serializers.ValidationError({'error': 'نام کاربری یا شماره موبایل الزامی است.'})

        user = None
        if phone:
            user = User.objects.filter(phone_number=phone).first()
            if user:
                attrs['username'] = user.username
        elif username:
            user = User.objects.filter(username=username).first()

        if not user or not user.check_password(password):
            raise serializers.ValidationError({'error': 'نام کاربری یا رمز عبور اشتباه است.'})

        if not user.is_active:
            raise serializers.ValidationError({'error': 'حساب کاربری غیرفعال است.'})

        if not user.is_approved:    # ← جدید
            raise serializers.ValidationError({    # ← جدید
                'error': 'حساب شما هنوز توسط مدیر تأیید نشده است.',    # ← جدید
                'pending': True,    # ← جدید
            })    # ← جدید

        data = super().validate(attrs)
        data['user'] = UserDetailSerializer(user).data
        data['message'] = 'ورود موفقیت‌آمیز بود.'
        data['success'] = True
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['username'] = user.username
        token['restaurant_id'] = user.restaurant_id
        return token

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'phone_number', 'first_name', 'last_name', 'email', 'password', 'password_confirm', 'role']

    def validate_phone_number(self, value):
        if value and User.objects.filter(phone_number=value).exists():
            raise serializers.ValidationError('این شماره موبایل قبلاً ثبت شده.')
        return value

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('این نام کاربری قبلاً وجود دارد.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'رمزهای عبور مطابقت ندارند.'})
        password_validation.validate_password(attrs['password'])
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True, default=None)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'phone_number', 'first_name', 'last_name',
            'full_name', 'email', 'role', 'role_display', 'restaurant',
            'restaurant_name', 'profile_image', 'is_verified', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'username', 'role', 'is_verified', 'created_at', 'updated_at']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class UserListSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'phone_number', 'full_name', 'role', 'role_display', 'is_active', 'created_at']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'phone_number', 'first_name', 'last_name', 'email', 'profile_image']
        read_only_fields = ['id', 'username']


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('رمز عبور فعلی اشتباه است.')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'رمزهای عبور جدید مطابقت ندارند.'})
        password_validation.validate_password(attrs['new_password'])
        return attrs


class ResetPasswordSerializer(serializers.Serializer):
    phone_number = serializers.CharField()
    new_password = serializers.CharField(min_length=8)
    new_password_confirm = serializers.CharField()

    def validate_phone_number(self, value):
        if not User.objects.filter(phone_number=value).exists():
            raise serializers.ValidationError('کاربری با این شماره یافت نشد.')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'رمزهای عبور مطابقت ندارند.'})
        return attrs


class RestaurantAuthSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Restaurant
        fields = ['id', 'name', 'phone', 'address', 'logo', 'is_active', 'user_count', 'created_at']

    def get_user_count(self, obj):
        return obj.users.filter(is_active=True).count()


RestaurantSerializer = RestaurantAuthSerializer


class ReadyMaterialSerializer(serializers.ModelSerializer):
    total_value = serializers.SerializerMethodField()
    stock_status = serializers.SerializerMethodField()
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model = ReadyMaterial
        fields = [
            'id', 'name', 'description', 'unit', 'unit_display',
            'quantity', 'purchase_price', 'selling_price',
            'minimum_stock', 'supplier', 'supplier_name',
            'barcode', 'is_active', 'total_value', 'stock_status',
        ]

    # ★FIX: قبلاً فیلدها بدون SerializerMethodField بودن و crash می‌کردن
    def get_total_value(self, obj):
        try:
            return int(obj.total_value) if hasattr(obj, 'total_value') else (
                int(obj.quantity * obj.purchase_price) if obj.purchase_price else 0
            )
        except (TypeError, AttributeError):
            return 0

    def get_stock_status(self, obj):
        try:
            if hasattr(obj, 'stock_status'):
                return obj.stock_status
            if obj.quantity <= 0:
                return 'out_of_stock'
            if obj.minimum_stock and obj.quantity <= obj.minimum_stock:
                return 'low_stock'
            return 'in_stock'
        except (TypeError, AttributeError):
            return 'unknown'

    def get_supplier_name(self, obj):
        try:
            return obj.supplier.name if obj.supplier else ''
        except Exception:
            return ''


# ★FIX: حداکثر مقدار + validate بودن
class ProduceSerializer(serializers.Serializer):
    quantity = serializers.FloatField(min_value=0.01, max_value=10000, default=1)

    def validate_quantity(self, value):
        if value != round(value, 2):
            raise serializers.ValidationError('حداکثر ۲ رقم اعشار مجاز است.')
        return value