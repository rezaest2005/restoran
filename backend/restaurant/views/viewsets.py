"""
All DRF ModelViewSets.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
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
    ProfileSerializer,
)
from ..services import (
    register_customer, earn_points_for_order, redeem_points,
    wallet_deposit, wallet_debit, validate_coupon, apply_coupon,
    check_and_grant_birthday_bonus, check_level_upgrade,
    seed_membership_levels, redeem_reward,
)

from django.db import transaction
from django.db.models import Q


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer


class FoodViewSet(viewsets.ModelViewSet):
    queryset = Food.objects.all()
    serializer_class = FoodSerializer

    def get_queryset(self):
        qs = Food.objects.all()
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return qs


class TableViewSet(viewsets.ModelViewSet):
    queryset = Table.objects.all()
    serializer_class = TableSerializer


class ReservationViewSet(viewsets.ModelViewSet):
    queryset = Reservation.objects.all()
    serializer_class = ReservationSerializer


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().prefetch_related('items__food')
    serializer_class = OrderSerializer
    permission_classes = []
    authentication_classes = []

    def create(self, request):
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
        with transaction.atomic():
            total_price = sum(
                item["price"] * item["quantity"] for item in items_data
            )
            order = Order.objects.create(
                customer_name=request.data["customer_name"],
                phone=request.data["phone"],
                table_id=request.data.get("table"),
                total_price=total_price,
            )
            for item in items_data:
                OrderItem.objects.create(
                    order=order, food_id=item["food"],
                    quantity=item["quantity"], price=item["price"],
                )
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        order = self.get_object()
        new_status = request.data.get("status")
        valid = ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"]
        if new_status and new_status in valid:
            order.status = new_status
            order.save()
            return Response(OrderSerializer(order).data)
        return Response({"error": "وضعیت نامعتبر"}, status=status.HTTP_400_BAD_REQUEST)


class SemiFinishedViewSet(viewsets.ModelViewSet):
    queryset = SemiFinished.objects.all()
    serializer_class = SemiFinishedSerializer


class ReadyMaterialViewSet(viewsets.ModelViewSet):
    queryset = ReadyMaterial.objects.all()
    serializer_class = ReadyMaterialSerializer

    def get_queryset(self):
        qs = ReadyMaterial.objects.select_related("supplier").all()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(barcode__icontains=search))
        return qs


class MembershipLevelViewSet(viewsets.ModelViewSet):
    queryset = MembershipLevel.objects.all()
    serializer_class = MembershipLevelSerializer

    @action(detail=False, methods=["post"], url_path="seed")
    def seed(self, request):
        return Response({"message": seed_membership_levels()})


class CustomerViewSet(viewsets.ModelViewSet):

    def get_queryset(self):
        qs = CustomerProfile.objects.select_related("membership_level").all()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(phone__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        level = self.request.query_params.get("level")
        if level:
            qs = qs.filter(membership_level__name=level)
        is_active = self.request.query_params.get("active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs

    def get_serializer_class(self):
        match self.action:
            case "list": return CustomerListSerializer
            case "create": return CustomerCreateSerializer
            case "update" | "partial_update": return CustomerUpdateSerializer
            case _: return CustomerDetailSerializer

    def create(self, request, *args, **kwargs):
        ser = CustomerCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = register_customer(**ser.validated_data)
        if not result["success"]:
            return Response({"error": result["error"]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            CustomerDetailSerializer(result["customer"], context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="earn-points")
    def earn_points(self, request, pk=None):
        ser = EarnPointsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = earn_points_for_order(customer=self.get_object(), **ser.validated_data)
        return Response(result, status=(status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST))

    @action(detail=True, methods=["post"], url_path="redeem-points")
    def redeem_points_action(self, request, pk=None):
        ser = RedeemPointsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = redeem_points(customer=self.get_object(), points=ser.validated_data["points"], order_id=ser.validated_data.get("order_id"))
        return Response(result, status=(status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST))

    @action(detail=True, methods=["get"], url_path="wallet")
    def wallet(self, request, pk=None):
        wallet_obj = LoyaltyWallet.objects.filter(customer=self.get_object()).first()
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
        result = wallet_deposit(customer=self.get_object(), amount=ser.validated_data["amount"], description=ser.validated_data.get("description", ""))
        return Response(result, status=(status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST))

    @action(detail=True, methods=["post"], url_path="wallet/debit")
    def wallet_debit_action(self, request, pk=None):
        ser = WalletDebitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = wallet_debit(customer=self.get_object(), amount=ser.validated_data["amount"], description=ser.validated_data.get("description", ""), order_id=ser.validated_data.get("order_id"))
        return Response(result, status=(status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST))

    @action(detail=True, methods=["post"], url_path="validate-coupon")
    def validate_coupon_action(self, request, pk=None):
        ser = CouponValidateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = validate_coupon(code=ser.validated_data["code"], customer=self.get_object(), order_amount=ser.validated_data["order_amount"])
        if result.get("coupon"):
            result["coupon"] = CouponDetailSerializer(result["coupon"]).data
        return Response(result)

    @action(detail=True, methods=["post"], url_path="apply-coupon")
    def apply_coupon_action(self, request, pk=None):
        ser = CouponApplySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = apply_coupon(code=ser.validated_data["code"], customer=self.get_object(), order_amount=ser.validated_data["order_amount"], order_id=ser.validated_data.get("order_id"))
        return Response(result, status=(status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST))

    @action(detail=True, methods=["get"], url_path="redemptions")
    def redemptions(self, request, pk=None):
        qs = self.get_object().reward_redemptions.select_related("reward").all()[:20]
        return Response(RewardRedemptionSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"], url_path="transactions")
    def transactions(self, request, pk=None):
        return Response(LoyaltyTransactionSerializer(self.get_object().loyalty_transactions.all()[:50], many=True).data)

    @action(detail=True, methods=["get"], url_path="notifications")
    def notifications(self, request, pk=None):
        customer = self.get_object()
        return Response({
            "notifications": NotificationSerializer(customer.notifications.all()[:30], many=True).data,
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
            "new_level": MembershipLevelSerializer(result["new_level"]).data if result["new_level"] else None,
            "current_level": MembershipLevelSerializer(result["current_level"]).data if result["current_level"] else None,
        })


class CouponViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        qs = Coupon.objects.prefetch_related("applicable_levels").all()
        is_active = self.request.query_params.get("active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        coupon_type = self.request.query_params.get("type")
        if coupon_type:
            qs = qs.filter(coupon_type=coupon_type)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search))
        return qs

    def get_serializer_class(self):
        match self.action:
            case "list": return CouponListSerializer
            case "create" | "update" | "partial_update": return CouponCreateSerializer
            case _: return CouponDetailSerializer

    @action(detail=True, methods=["post"], url_path="toggle-active")
    def toggle_active(self, request, pk=None):
        coupon = self.get_object()
        coupon.is_active = not coupon.is_active
        coupon.save(update_fields=["is_active"])
        return Response({"is_active": coupon.is_active})


class RewardViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        qs = Reward.objects.select_related("min_membership_level").all()
        is_active = self.request.query_params.get("active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return qs

    def get_serializer_class(self):
        match self.action:
            case "list": return RewardListSerializer
            case "create" | "update" | "partial_update": return RewardCreateSerializer
            case _: return RewardDetailSerializer

    @action(detail=True, methods=["post"], url_path="redeem")
    def redeem_action(self, request, pk=None):
        phone = request.data.get("phone") or request.headers.get("X-Customer-Phone")
        if not phone:
            return Response({"error": "شماره موبایل لازم است."}, status=status.HTTP_400_BAD_REQUEST)
        customer = CustomerProfile.objects.filter(phone=phone).first()
        if not customer:
            return Response({"error": "مشتری یافت نشد."}, status=status.HTTP_404_NOT_FOUND)
        result = redeem_reward(customer=customer, reward_id=pk)
        return Response(result, status=(status.HTTP_200_OK if result["success"] else status.HTTP_400_BAD_REQUEST))


class ReferralViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Referral.objects.select_related("referrer", "referred").all()
    serializer_class = ReferralSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        phone = self.request.query_params.get("phone")
        if phone:
            qs = qs.filter(Q(referrer__phone=phone) | Q(referred__phone=phone))
        return qs


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        qs = LoyaltyNotification.objects.all()
        phone = self.request.query_params.get("phone")
        if phone:
            qs = qs.filter(customer__phone=phone)
        is_read = self.request.query_params.get("read")
        if is_read is not None:
            qs = qs.filter(is_read=is_read.lower() == "true")
        ntype = self.request.query_params.get("type")
        if ntype:
            qs = qs.filter(notification_type=ntype)
        return qs

    @action(detail=False, methods=["post"], url_path="mark-read")
    def mark_read(self, request):
        ser = NotificationMarkReadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        phone = request.data.get("phone") or request.headers.get("X-Customer-Phone")
        qs = LoyaltyNotification.objects.filter(is_read=False)
        if phone:
            qs = qs.filter(customer__phone=phone)
        if ser.validated_data.get("mark_all"):
            count = qs.update(is_read=True)
        else:
            count = qs.filter(id__in=ser.validated_data["notification_ids"]).update(is_read=True)
        return Response({"marked_read": count})


class LoyaltyTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LoyaltyTransactionSerializer

    def get_queryset(self):
        qs = LoyaltyTransaction.objects.select_related("customer").all()
        phone = self.request.query_params.get("phone")
        if phone:
            qs = qs.filter(customer__phone=phone)
        ttype = self.request.query_params.get("type")
        if ttype:
            qs = qs.filter(transaction_type=ttype)
        return qs


class RewardRedemptionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RewardRedemptionSerializer

    def get_queryset(self):
        qs = RewardRedemption.objects.select_related("customer", "reward").all()
        phone = self.request.query_params.get("phone")
        if phone:
            qs = qs.filter(customer__phone=phone)
        return qs