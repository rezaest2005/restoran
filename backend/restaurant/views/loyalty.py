"""
Loyalty program API.
"""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..serializers import (
    ProcessOrderLoyaltySerializer, LoyaltyDashboardSerializer,
)
from ..services import (
    process_order_loyalty, get_loyalty_dashboard,
    run_birthday_check_all, seed_membership_levels,
)


@api_view(["POST"])
def process_order_loyalty_view(request):
    ser = ProcessOrderLoyaltySerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    return Response(process_order_loyalty(**ser.validated_data))


@api_view(["GET"])
def loyalty_dashboard_view(request):
    return Response(LoyaltyDashboardSerializer(get_loyalty_dashboard()).data)


@api_view(["POST"])
def birthday_check_view(request):
    return Response({"birthday_granted": run_birthday_check_all()})


@api_view(["POST"])
def seed_levels_view(request):
    return Response({"message": seed_membership_levels()})