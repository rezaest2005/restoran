
from rest_framework import serializers
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
    Business,
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


class ProduceSerializer(serializers.Serializer):
    quantity = serializers.FloatField(min_value=0.01, max_value=10000, default=1)

    def validate_quantity(self, value):
        if value != round(value, 2):
            raise serializers.ValidationError("حداکثر ۲ رقم اعشار مجاز است.")
        return value


# ══════════════════════════════════════════════════════════════════════════════
#  6.5 WASTE LOG — ★ جدید
# ══════════════════════════════════════════════════════════════════════════════


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
        token["business_id"] = user.business_id
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
    business_name = serializers.CharField(
        source="business.name", read_only=True, default=None
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
            "business",
            "business_name",
            "profile_image",
            "is_verified",
            "is_active",
            "tabs",                          # ★ اضافه شد
            "created_at",
            "updated_at",
            "demo_logins_remaining",
        ]
        read_only_fields = [
            "id",
            "username",
            "role",
            "is_verified",
            "tabs",                          # ★ اضافه شد
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


class BusinessAuthSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Business
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


BusinessSerializer = BusinessAuthSerializer


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

# ══════════════════════════════════════════════════════════════════════════════
#  UPDATE USER TABS
# ══════════════════════════════════════════════════════════════════════════════


class UpdateUserTabsSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    tabs = serializers.DictField(child=serializers.BooleanField())