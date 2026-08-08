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
    MembershipLevel, CustomerProfile, Coupon, Reward, Referral,
    LoyaltyNotification, LoyaltyTransaction, LoyaltyWallet,
    RewardRedemption,
)
from ..serializers import (
    CategorySerializer, FoodSerializer, TableSerializer,
    ReservationSerializer, OrderSerializer,
    SemiFinishedSerializer, ReadyMaterialSerializer,
    MembershipLevelSerializer,
    CustomerListSerializer, CustomerCreateSerializer,
    CustomerDetailSerializer, CustomerUpdateSerializer,
    CouponListSerializer, CouponCreateSerializer, CouponDetailSerializer,
    CouponValidateSerializer, CouponApplySerializer,
    RewardListSerializer, RewardCreateSerializer, RewardDetailSerializer,
    ReferralSerializer, NotificationSerializer,
    NotificationMarkReadSerializer,
    LoyaltyTransactionSerializer, RewardRedemptionSerializer,
    EarnPointsSerializer, RedeemPointsSerializer,
    WalletSerializer, WalletTransactionSerializer,
    WalletDepositSerializer, WalletDebitSerializer,
)
from ..services import (
    register_customer, earn_points_for_order, redeem_points,
    wallet_deposit, wallet_debit, validate_coupon, apply_coupon,
    check_and_grant_birthday_bonus, check_level_upgrade,
    seed_membership_levels, redeem_reward,
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


# ═══════════════════════════════════════════════════════════════════
#  5. MEMBERSHIP LEVEL — ★ FIXED: فیلتر restaurant
# ═══════════════════════════════════════════════════════════════════

class MembershipLevelViewSet(viewsets.ModelViewSet):
    serializer_class = MembershipLevelSerializer
    permission_classes = [IsAuthenticated]

    # ★ FIXED: queryset مستقیم → get_queryset با فیلتر
    def get_queryset(self):
        qs = MembershipLevel.objects.all()
        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)
        return qs

    @action(detail=False, methods=["post"], url_path="seed")
    def seed(self, request):
        restaurant = _resolve_restaurant(request)
        result = seed_membership_levels(restaurant=restaurant)
        return Response({"message": result})


# ═══════════════════════════════════════════════════════════════════
#  6. CUSTOMER PROFILE
# ═══════════════════════════════════════════════════════════════════

class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = CustomerProfile.objects.select_related("membership_level").all()

        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(phone__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search),
            )

        level = self.request.query_params.get("level")
        if level:
            qs = qs.filter(membership_level__name=level)

        is_active = self.request.query_params.get("active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")

        return qs.order_by("-created_at")

    def get_serializer_class(self):
        match self.action:
            case "list":
                return CustomerListSerializer
            case "create":
                return CustomerCreateSerializer
            case "update" | "partial_update":
                return CustomerUpdateSerializer
            case _:
                return CustomerDetailSerializer

    def create(self, request, *args, **kwargs):
        restaurant = _resolve_restaurant(request)
        ser = CustomerCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        result = register_customer(
            restaurant=restaurant,
            **ser.validated_data,
        )

        if not result["success"]:
            return Response(
                {"error": result["error"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            CustomerDetailSerializer(
                result["customer"],
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="earn-points")
    def earn_points(self, request, pk=None):
        ser = EarnPointsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = earn_points_for_order(
            customer=self.get_object(), **ser.validated_data,
        )
        return Response(
            result,
            status=(
                status.HTTP_200_OK if result["success"]
                else status.HTTP_400_BAD_REQUEST
            ),
        )

    @action(detail=True, methods=["post"], url_path="redeem-points")
    def redeem_points_action(self, request, pk=None):
        ser = RedeemPointsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = redeem_points(
            customer=self.get_object(),
            points=ser.validated_data["points"],
            order_id=ser.validated_data.get("order_id"),
        )
        return Response(
            result,
            status=(
                status.HTTP_200_OK if result["success"]
                else status.HTTP_400_BAD_REQUEST
            ),
        )

    @action(detail=True, methods=["get"], url_path="wallet")
    def wallet(self, request, pk=None):
        wallet_obj = LoyaltyWallet.objects.filter(
            customer=self.get_object(),
        ).first()
        if not wallet_obj:
            return Response({"balance": 0, "transactions": []})
        txns = wallet_obj.transactions.all()[:20]
        return Response({
            "wallet": WalletSerializer(wallet_obj).data,
            "transactions": WalletTransactionSerializer(txns, many=True).data,
        })

    @action(detail=True, methods=["post"], url_path="wallet/deposit")
    def wallet_deposit_action(self, request, pk=None):
        ser = WalletDepositSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = wallet_deposit(
            customer=self.get_object(),
            amount=ser.validated_data["amount"],
            description=ser.validated_data.get("description", ""),
        )
        return Response(
            result,
            status=(
                status.HTTP_200_OK if result["success"]
                else status.HTTP_400_BAD_REQUEST
            ),
        )

    @action(detail=True, methods=["post"], url_path="wallet/debit")
    def wallet_debit_action(self, request, pk=None):
        ser = WalletDebitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = wallet_debit(
            customer=self.get_object(),
            amount=ser.validated_data["amount"],
            description=ser.validated_data.get("description", ""),
            order_id=ser.validated_data.get("order_id"),
        )
        return Response(
            result,
            status=(
                status.HTTP_200_OK if result["success"]
                else status.HTTP_400_BAD_REQUEST
            ),
        )

    @action(detail=True, methods=["post"], url_path="validate-coupon")
    def validate_coupon_action(self, request, pk=None):
        ser = CouponValidateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = validate_coupon(
            code=ser.validated_data["code"],
            customer=self.get_object(),
            order_amount=ser.validated_data["order_amount"],
        )
        if result.get("coupon"):
            result["coupon"] = CouponDetailSerializer(result["coupon"]).data
        return Response(result)

    @action(detail=True, methods=["post"], url_path="apply-coupon")
    def apply_coupon_action(self, request, pk=None):
        ser = CouponApplySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = apply_coupon(
            code=ser.validated_data["code"],
            customer=self.get_object(),
            order_amount=ser.validated_data["order_amount"],
            order_id=ser.validated_data.get("order_id"),
        )
        return Response(
            result,
            status=(
                status.HTTP_200_OK if result["success"]
                else status.HTTP_400_BAD_REQUEST
            ),
        )

    @action(detail=True, methods=["get"], url_path="redemptions")
    def redemptions(self, request, pk=None):
        qs = (
            self.get_object()
            .reward_redemptions.select_related("reward")
            .all()[:20]
        )
        return Response(RewardRedemptionSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"], url_path="transactions")
    def transactions(self, request, pk=None):
        return Response(
            LoyaltyTransactionSerializer(
                self.get_object().loyalty_transactions.all()[:50],
                many=True,
            ).data,
        )

    @action(detail=True, methods=["get"], url_path="notifications")
    def notifications(self, request, pk=None):
        customer = self.get_object()
        return Response({
            "notifications": NotificationSerializer(
                customer.notifications.all()[:30], many=True,
            ).data,
            "unread_count": customer.notifications.filter(is_read=False).count(),
        })

    @action(detail=True, methods=["post"], url_path="check-birthday")
    def check_birthday(self, request, pk=None):
        return Response(check_and_grant_birthday_bonus(self.get_object()))

    @action(detail=True, methods=["post"], url_path="check-level")
    def check_level(self, request, pk=None):
        result = check_level_upgrade(self.get_object())
        return Response({
            "upgraded": result["upgraded"],
            "new_level": (
                MembershipLevelSerializer(result["new_level"]).data
                if result.get("new_level") else None
            ),
            "current_level": (
                MembershipLevelSerializer(result["current_level"]).data
                if result.get("current_level") else None
            ),
        })


# ═══════════════════════════════════════════════════════════════════
#  7. COUPONS
# ═══════════════════════════════════════════════════════════════════

class CouponViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Coupon.objects.prefetch_related("applicable_levels").all()

        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)

        is_active = self.request.query_params.get("active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")

        coupon_type = self.request.query_params.get("type")
        if coupon_type:
            qs = qs.filter(coupon_type=coupon_type)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(code__icontains=search) | Q(name__icontains=search),
            )

        return qs

    def get_serializer_class(self):
        match self.action:
            case "list":
                return CouponListSerializer
            case "create" | "update" | "partial_update":
                return CouponCreateSerializer
            case _:
                return CouponDetailSerializer

    @action(detail=True, methods=["post"], url_path="toggle-active")
    def toggle_active(self, request, pk=None):
        coupon = self.get_object()
        coupon.is_active = not coupon.is_active
        coupon.save(update_fields=["is_active"])
        return Response({"is_active": coupon.is_active})


# ═══════════════════════════════════════════════════════════════════
#  8. REWARDS — ★ FIXED: redeem_action از self.get_object()
# ═══════════════════════════════════════════════════════════════════

class RewardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Reward.objects.select_related("min_membership_level").all()

        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)

        is_active = self.request.query_params.get("active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")

        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)

        return qs

    def get_serializer_class(self):
        match self.action:
            case "list":
                return RewardListSerializer
            case "create" | "update" | "partial_update":
                return RewardCreateSerializer
            case _:
                return RewardDetailSerializer

    @action(detail=True, methods=["post"], url_path="redeem")
    def redeem_action(self, request, pk=None):
        # ★ FIXED: از self.get_object() استفاده میکنه (فیلتر restaurant اعمال میشه)
        try:
            reward_obj = self.get_object()
        except Exception:
            return Response(
                {"error": "جایزه یافت نشد."},
                status=status.HTTP_404_NOT_FOUND,
            )

        phone = (
            request.data.get("phone")
            or request.headers.get("X-Customer-Phone")
        )
        if not phone:
            return Response(
                {"error": "شماره موبایل لازم است."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        restaurant = _resolve_restaurant(request)
        customer_qs = CustomerProfile.objects.filter(phone=phone)
        if restaurant:
            customer_qs = customer_qs.filter(restaurant=restaurant)

        customer = customer_qs.first()
        if not customer:
            return Response(
                {"error": "مشتری یافت نشد."},
                status=status.HTTP_404_NOT_FOUND,
            )

        result = redeem_reward(customer=customer, reward_id=pk)
        return Response(
            result,
            status=(
                status.HTTP_200_OK if result["success"]
                else status.HTTP_400_BAD_REQUEST
            ),
        )


# ═══════════════════════════════════════════════════════════════════
#  9. REFERRALS — ★ FIXED: فیلتر restaurant
# ═══════════════════════════════════════════════════════════════════

class ReferralViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ReferralSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Referral.objects.select_related("referrer", "referred").all()

        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(
                Q(referrer__restaurant=restaurant) |
                Q(referred__restaurant=restaurant),
            )

        phone = self.request.query_params.get("phone")
        if phone:
            qs = qs.filter(
                Q(referrer__phone=phone) | Q(referred__phone=phone),
            )

        return qs


# ═══════════════════════════════════════════════════════════════════
#  10. NOTIFICATIONS — ★ FIXED: فیلتر restaurant
# ═══════════════════════════════════════════════════════════════════

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = LoyaltyNotification.objects.all()

        # ★ FIXED: فیلتر restaurant
        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(customer__restaurant=restaurant)

        phone = self.request.query_params.get("phone")
        if phone:
            qs = qs.filter(customer__phone=phone)

        is_read = self.request.query_params.get("read")
        if is_read is not None:
            qs = qs.filter(is_read=is_read.lower() == "true")

        ntype = self.request.query_params.get("type")
        if ntype:
            qs = qs.filter(notification_type=ntype)

        return qs.order_by("-created_at")

    @action(detail=False, methods=["post"], url_path="mark-read")
    def mark_read(self, request):
        ser = NotificationMarkReadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        phone = (
            request.data.get("phone")
            or request.headers.get("X-Customer-Phone")
        )

        # ★ FIXED: فیلتر restaurant در mark-read هم
        qs = LoyaltyNotification.objects.filter(is_read=False)
        restaurant = _resolve_restaurant(request)
        if restaurant:
            qs = qs.filter(customer__restaurant=restaurant)
        if phone:
            qs = qs.filter(customer__phone=phone)

        if ser.validated_data.get("mark_all"):
            count = qs.update(is_read=True)
        else:
            ids = ser.validated_data.get("notification_ids", [])
            if not ids:
                return Response(
                    {"error": "شناسه اعلان یا mark_all لازم است."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            count = qs.filter(id__in=ids).update(is_read=True)

        return Response({"marked_read": count})


# ═══════════════════════════════════════════════════════════════════
#  11. LOYALTY TRANSACTIONS & REDEMPTIONS — ★ FIXED: فیلتر restaurant
# ═══════════════════════════════════════════════════════════════════

class LoyaltyTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LoyaltyTransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = LoyaltyTransaction.objects.select_related("customer").all()

        # ★ FIXED: فیلتر restaurant
        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(customer__restaurant=restaurant)

        phone = self.request.query_params.get("phone")
        if phone:
            qs = qs.filter(customer__phone=phone)

        ttype = self.request.query_params.get("type")
        if ttype:
            qs = qs.filter(transaction_type=ttype)

        return qs.order_by("-created_at")


class RewardRedemptionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RewardRedemptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = RewardRedemption.objects.select_related(
            "customer", "reward",
        ).all()

        # ★ FIXED: فیلتر restaurant
        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(customer__restaurant=restaurant)

        phone = self.request.query_params.get("phone")
        if phone:
            qs = qs.filter(customer__phone=phone)

        return qs.order_by("-created_at")