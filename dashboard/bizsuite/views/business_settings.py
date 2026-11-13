"""Business settings the owner manages himself.

  GET /api/business/slug/   current slug + the addresses built from it
  PUT /api/business/slug/   {slug}  (owner only; the old addresses stop working, so the UI warns first)
"""
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated

from ..slugs import RESERVED_SLUGS, validate_slug
from ..utils import api_error, api_success
from .common import StaffAuth, staff_business
from ..activity import audit


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


def _payload(biz):
    return {"slug": biz.slug, "reserved": sorted(RESERVED_SLUGS)}


@api_view(["GET", "PUT"])
@authentication_classes(StaffAuth)
@permission_classes([IsAuthenticated])
@audit("users", "slug", "تغییر آدرس کسب‌وکار")
def business_slug(request):
    biz = staff_business(request)
    if biz is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    if request.method == "GET":
        return api_success(data=_payload(biz))
    if not (request.user.is_superuser or request.user.role == "owner"):
        return api_error("فقط مالک کسب‌وکار می‌تواند آدرس را عوض کند.", status_code=403)
    ok, value = validate_slug(request.data.get("slug"), exclude_business_id=biz.pk)
    if not ok:
        return api_error(value)
    if value != biz.slug:
        biz.slug = value
        biz.save(update_fields=["slug"])
    return api_success(data=_payload(biz))
