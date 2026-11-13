"""
Activity history API (read only — events are never edited or deleted).

  GET /api/activity/                 filter: category, driver_id, actor_id, q, from, to ; paged with before_id
  GET /api/activity/meta/            categories and the people who appear in the log (for the filter bar)
"""
import datetime

from django.db.models import Count
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes

from ..models import ActivityLog, Driver, User
from ..utils import api_error, api_success
from .common import StaffAuth, make_service_permission, staff_business

ActivityPerm = make_service_permission("activity")
PAGE = 50


def _row(a):
    return {
        "id": a.id, "category": a.category, "action": a.action, "summary": a.summary,
        "actor": a.actor_name, "actor_role": a.actor_role, "actor_id": a.actor_id,
        "driver_id": a.driver_id, "target_type": a.target_type, "target_id": a.target_id,
        "details": a.details or {}, "ip": a.ip,
        "at": timezone.localtime(a.created_at).isoformat(),
    }


def _day(value):
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([ActivityPerm])
def activity_list(request):
    biz = staff_business(request)
    if biz is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    qp = request.query_params
    qs = ActivityLog.all_objects.filter(business=biz)
    if qp.get("category") in dict(ActivityLog.Category.choices):
        qs = qs.filter(category=qp["category"])
    if qp.get("action"):
        qs = qs.filter(action__startswith=qp["action"][:60])
    if str(qp.get("driver_id", "")).isdigit():
        qs = qs.filter(driver_id=int(qp["driver_id"]))
    if str(qp.get("actor_id", "")).isdigit():
        qs = qs.filter(actor_id=int(qp["actor_id"]))
    if qp.get("q"):
        qs = qs.filter(summary__icontains=qp["q"][:100])
    d_from, d_to = _day(qp.get("from")), _day(qp.get("to"))
    if d_from:
        qs = qs.filter(created_at__date__gte=d_from)
    if d_to:
        qs = qs.filter(created_at__date__lte=d_to)
    if str(qp.get("before_id", "")).isdigit():
        qs = qs.filter(id__lt=int(qp["before_id"]))
    rows = list(qs.order_by("-id")[:PAGE + 1])
    more = len(rows) > PAGE
    rows = rows[:PAGE]
    return api_success(data={"results": [_row(a) for a in rows], "has_more": more,
                             "next_before_id": rows[-1].id if more and rows else None})


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([ActivityPerm])
def activity_meta(request):
    biz = staff_business(request)
    if biz is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    people = (ActivityLog.all_objects.filter(business=biz).exclude(actor_name="")
              .values("actor_id", "actor_name").annotate(n=Count("id")).order_by("-n")[:50])
    return api_success(data={
        "categories": [{"key": k, "label": label} for k, label in ActivityLog.Category.choices],
        "people": [{"id": p["actor_id"], "name": p["actor_name"], "count": p["n"]} for p in people],
        "drivers": [{"id": d.id, "name": d.name, "number": d.number} for d in Driver.all_objects.filter(business=biz).order_by("number")],
    })
