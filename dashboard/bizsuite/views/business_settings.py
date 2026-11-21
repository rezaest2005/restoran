"""Business settings the owner manages himself.

  GET /api/business/subscription/   countdown data
(The business slug is NOT editable here; only the super admin changes it, in the tenant editor.)
"""
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated

from ..utils import api_error, api_success
from .common import StaffAuth, staff_business


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([IsAuthenticated])
def business_subscription(request):
    """The countdown data of this business (the dashboard polls it, so a renewal shows up without signing in again)."""
    from ..subscription import payload
    biz = staff_business(request)
    if biz is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    return api_success(data=payload(biz))
