"""
Platform support tickets (business -> platform owner), business side.

  GET/POST  /api/support/tickets/                    list / create (subject + first message)
  GET       /api/support/tickets/<id>/               thread
  POST      /api/support/tickets/<id>/messages/      follow-up (reopens answered/resolved)
  POST      /api/support/tickets/<id>/resolve/

Available to any signed-in owner/manager of a business (no module needed).
Everything is scoped to the caller's own business; another business's ticket is a 404.
"""
import logging
import re
from datetime import timedelta

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import BasePermission

from ..models import SupportMessage, SupportTicket
from ..utils import api_error, api_success
from .common import StaffAuth, server_error, staff_business

logger = logging.getLogger(__name__)

MAX_SUBJECT = 200
MAX_BODY = 4000
TICKETS_PER_HOUR = 10
LIST_LIMIT = 200

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean_text(value, multiline=True):
    """Strip control characters (and newlines for single-line fields)."""
    if value is None:
        return ""
    s = _CONTROL.sub("", str(value)).replace("\r\n", "\n").replace("\r", "\n")
    if not multiline:
        s = " ".join(s.split())
    return s.strip()


def validate_body(value):
    """Returns (text, error)."""
    body = clean_text(value)
    if not body:
        return "", "متن پیام را وارد کنید."
    if len(body) > MAX_BODY:
        return "", f"متن پیام نباید بیشتر از {MAX_BODY} کاراکتر باشد."
    return body, None


def author_label(user):
    if user is None:
        return ""
    return user.get_full_name() or user.username


def serialize_message(m, *, show_platform_author=False):
    name = ""
    if m.author_kind == "business":
        name = author_label(m.author)
    elif show_platform_author:
        name = author_label(m.author)
    return {
        "id": m.id,
        "author_kind": m.author_kind,
        "author_name": name,
        "body": m.body,
        "created_at": m.created_at.isoformat(),
    }


def serialize_ticket(t, *, with_business=False):
    data = {
        "id": t.id,
        "subject": t.subject,
        "category": t.category,
        "priority": t.priority,
        "status": t.status,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
        "last_activity_at": t.last_activity_at.isoformat(),
        "message_count": getattr(t, "msg_count", None),
    }
    if with_business:
        b = t.business
        data["business"] = {"id": b.id, "name": b.name, "slug": b.slug}
        data["created_by_name"] = author_label(t.created_by)
    return data


class IsBusinessManager(BasePermission):
    """Signed-in owner/manager that belongs to a business."""

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated and u.business_id):
            return False
        return u.role in ("owner", "manager")


def _own_ticket(request, pk):
    business = staff_business(request)
    if business is None:
        return None
    return (
        SupportTicket.all_objects.filter(business=business, pk=pk)
        .select_related("business", "created_by").first()
    )


def _thread(ticket):
    msgs = ticket.messages.select_related("author").order_by("created_at", "id")
    data = serialize_ticket(ticket)
    data["messages"] = [serialize_message(m) for m in msgs]
    return data


def _touch(ticket, status=None):
    now = timezone.now()
    ticket.last_activity_at = now
    if status:
        ticket.status = status
    ticket.save(update_fields=["last_activity_at", "status", "updated_at"])


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([IsBusinessManager])
def support_tickets(request):
    try:
        business = staff_business(request)
        if business is None:
            return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.", status_code=400)

        if request.method == "GET":
            qs = SupportTicket.all_objects.filter(business=business)
            st = request.query_params.get("status")
            if st in dict(SupportTicket.STATUS_CHOICES):
                qs = qs.filter(status=st)
            qs = qs.annotate(msg_count=Count("messages")).order_by("-last_activity_at", "-id")
            return api_success(data=[serialize_ticket(t) for t in qs[:LIST_LIMIT]])

        d = request.data if isinstance(request.data, dict) else {}
        subject = clean_text(d.get("subject"), multiline=False)
        if not subject:
            return api_error("موضوع را وارد کنید.")
        if len(subject) > MAX_SUBJECT:
            return api_error(f"موضوع نباید بیشتر از {MAX_SUBJECT} کاراکتر باشد.")
        body, err = validate_body(d.get("message"))
        if err:
            return api_error(err)
        category = str(d.get("category") or "question")
        if category not in dict(SupportTicket.CATEGORY_CHOICES):
            return api_error("دسته‌بندی نامعتبر است.")
        priority = str(d.get("priority") or "normal")
        if priority not in dict(SupportTicket.PRIORITY_CHOICES):
            return api_error("اولویت نامعتبر است.")

        since = timezone.now() - timedelta(hours=1)
        recent = SupportTicket.all_objects.filter(business=business, created_at__gte=since).count()
        if recent >= TICKETS_PER_HOUR:
            return api_error("تعداد تیکت‌های ثبت‌شده در یک ساعت گذشته زیاد است. بعداً تلاش کنید.",
                             status_code=429)

        with transaction.atomic():
            ticket = SupportTicket.all_objects.create(
                business=business, created_by=request.user, subject=subject,
                category=category, priority=priority,
            )
            SupportMessage.objects.create(
                ticket=ticket, author_kind="business", author=request.user, body=body,
            )
        ticket = _own_ticket(request, ticket.pk)
        return api_success(data=_thread(ticket), message="تیکت ثبت شد.", status_code=201)
    except Exception as exc:  # noqa: BLE001
        return server_error(exc)


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([IsBusinessManager])
def support_ticket_detail(request, pk):
    try:
        ticket = _own_ticket(request, pk)
        if ticket is None:
            return api_error("تیکت یافت نشد.", status_code=404)
        return api_success(data=_thread(ticket))
    except Exception as exc:  # noqa: BLE001
        return server_error(exc)


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([IsBusinessManager])
def support_ticket_message(request, pk):
    try:
        ticket = _own_ticket(request, pk)
        if ticket is None:
            return api_error("تیکت یافت نشد.", status_code=404)
        d = request.data if isinstance(request.data, dict) else {}
        body, err = validate_body(d.get("message", d.get("body")))
        if err:
            return api_error(err)
        with transaction.atomic():
            SupportMessage.objects.create(
                ticket=ticket, author_kind="business", author=request.user, body=body,
            )
            _touch(ticket, "open" if ticket.status in ("answered", "resolved") else ticket.status)
        return api_success(data=_thread(ticket), message="پیام ثبت شد.", status_code=201)
    except Exception as exc:  # noqa: BLE001
        return server_error(exc)


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([IsBusinessManager])
def support_ticket_resolve(request, pk):
    try:
        ticket = _own_ticket(request, pk)
        if ticket is None:
            return api_error("تیکت یافت نشد.", status_code=404)
        _touch(ticket, "resolved")
        return api_success(data=_thread(ticket), message="تیکت بسته شد.")
    except Exception as exc:  # noqa: BLE001
        return server_error(exc)
