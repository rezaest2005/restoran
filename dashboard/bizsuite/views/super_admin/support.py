"""
Super admin: platform support inbox.

  GET   /api/super/support/tickets/?status=&business=&category=&q=&page=
  GET   /api/super/support/tickets/<id>/
  POST  /api/super/support/tickets/<id>/reply/    {message}  -> status "answered"
  POST  /api/super/support/tickets/<id>/status/   {status}
  GET   /api/super/support/summary/               counts per status + waiting for a platform reply
"""
import math

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes

from ...models import SupportMessage, SupportTicket
from ...utils import api_error, api_success
from ..common import parse_int, server_error
from ..support import clean_text, serialize_message, serialize_ticket, validate_body
from .auth import IsSuperAdmin

PAGE_SIZE = 20
WAITING = ("open", "in_progress")


def _detail(t):
    data = serialize_ticket(t, with_business=True)
    data["messages"] = [
        serialize_message(m, show_platform_author=True)
        for m in t.messages.select_related("author").order_by("created_at", "id")
    ]
    return data


def _get(pk):
    return (SupportTicket.all_objects.select_related("business", "created_by")
            .filter(pk=pk).first())


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_support_tickets(request):
    try:
        qs = SupportTicket.all_objects.select_related("business", "created_by")
        p = request.query_params
        if p.get("status") in dict(SupportTicket.STATUS_CHOICES):
            qs = qs.filter(status=p["status"])
        if p.get("category") in dict(SupportTicket.CATEGORY_CHOICES):
            qs = qs.filter(category=p["category"])
        biz = clean_text(p.get("business"), multiline=False)
        if biz:
            if biz.isdigit():
                qs = qs.filter(business_id=int(biz))
            else:
                qs = qs.filter(Q(business__slug__iexact=biz) | Q(business__name__icontains=biz))
        q = clean_text(p.get("q"), multiline=False)[:100]
        if q:
            qs = qs.filter(Q(subject__icontains=q) | Q(messages__body__icontains=q)).distinct()

        total = qs.count()
        size = parse_int(p.get("page_size"), default=PAGE_SIZE, minimum=1, maximum=100)
        pages = max(1, math.ceil(total / size))
        page = parse_int(p.get("page"), default=1, minimum=1, maximum=pages)
        qs = qs.annotate(msg_count=Count("messages", distinct=True)).order_by("-last_activity_at", "-id")
        rows = qs[(page - 1) * size: page * size]
        return api_success(data={
            "results": [serialize_ticket(t, with_business=True) for t in rows],
            "count": total, "page": page, "pages": pages, "page_size": size,
        })
    except Exception as exc:  # noqa: BLE001
        return server_error(exc)


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_support_ticket_detail(request, pk):
    try:
        t = _get(pk)
        if t is None:
            return api_error("تیکت یافت نشد.", status_code=404)
        return api_success(data=_detail(t))
    except Exception as exc:  # noqa: BLE001
        return server_error(exc)


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def super_support_reply(request, pk):
    try:
        t = _get(pk)
        if t is None:
            return api_error("تیکت یافت نشد.", status_code=404)
        d = request.data if isinstance(request.data, dict) else {}
        body, err = validate_body(d.get("message", d.get("body")))
        if err:
            return api_error(err)
        with transaction.atomic():
            SupportMessage.objects.create(
                ticket=t, author_kind="platform", author=request.user, body=body,
            )
            t.status = "answered"
            t.last_activity_at = timezone.now()
            t.save(update_fields=["status", "last_activity_at", "updated_at"])
        return api_success(data=_detail(t), message="پاسخ ثبت شد.", status_code=201)
    except Exception as exc:  # noqa: BLE001
        return server_error(exc)


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def super_support_status(request, pk):
    try:
        t = _get(pk)
        if t is None:
            return api_error("تیکت یافت نشد.", status_code=404)
        d = request.data if isinstance(request.data, dict) else {}
        st = d.get("status")
        if st not in dict(SupportTicket.STATUS_CHOICES):
            return api_error("وضعیت نامعتبر است.")
        t.status = st
        t.save(update_fields=["status", "updated_at"])
        return api_success(data=_detail(t), message="وضعیت تغییر کرد.")
    except Exception as exc:  # noqa: BLE001
        return server_error(exc)


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_support_summary(request):
    try:
        counts = {code: 0 for code, _ in SupportTicket.STATUS_CHOICES}
        rows = SupportTicket.all_objects.values("status").annotate(n=Count("id"))
        for r in rows:
            counts[r["status"]] = r["n"]
        return api_success(data={
            "counts": counts,
            "total": sum(counts.values()),
            "waiting": sum(counts[s] for s in WAITING),
        })
    except Exception as exc:  # noqa: BLE001
        return server_error(exc)
