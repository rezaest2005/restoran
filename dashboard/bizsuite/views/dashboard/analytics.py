"""
Dashboard — API تحلیلی داشبورد
"""
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ..common import resolve_business_or_first
from .inventory_section import build_inventory_section
from .periods import date_windows
from .pos_section import build_pos_section


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_analytics(request):
    business = resolve_business_or_first(request)
    if not business:
        return JsonResponse({"error": "کسب‌وکار یافت نشد"}, status=400)

    is_demo = request.session.get('show_demo', False)
    w = date_windows()

    return JsonResponse({
        "success": True,
        "is_demo": is_demo,
        # ── صندوق ──
        **build_pos_section(business, w),
        # ── انبار ──
        **build_inventory_section(business, w),
    })
