"""
Dashboard — API تحلیلی داشبورد
"""
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ...dashboard_summary import allowed_blocks
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
    # only sections of modules this business has and this user may see (same gate as /api/dashboard/summary/)
    blocks = allowed_blocks(business, request.user)

    return JsonResponse({
        "success": True,
        "is_demo": is_demo,
        "sections": sorted(blocks & {"pos", "inventory"}),
        # ── صندوق ──
        **(build_pos_section(business, w) if "pos" in blocks else {}),
        # ── انبار ──
        **(build_inventory_section(business, w) if "inventory" in blocks else {}),
    })
