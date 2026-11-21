"""
GET /api/dashboard/summary/ — main dashboard KPIs, alerts and onboarding checklist for the signed-in user.

Only blocks of modules the business has (and the user may see) are in the payload; see ``dashboard_summary``.
"""
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated

from ...dashboard_summary import build_summary
from ...utils import api_error, api_success
from ..common import StaffAuth, staff_business


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    biz = staff_business(request)
    if biz is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    return api_success(data=build_summary(biz, request.user))
