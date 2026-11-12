"""Public QR redirect: GET /q/<code>/ -> 302 to wherever the super admin pointed that code."""
from django.db.models import F
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone

from ..models import QrLink
from ..qr_services import resolve_target

_GONE = ("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
         "<title>QR</title><body style='font-family:sans-serif;text-align:center;padding:4rem 1rem'>"
         "<h2>این لینک فعال نیست</h2><p>This link is not active.</p></body>")


def qr_redirect(request, code):
    link = QrLink.all_objects.select_related("business").filter(code=code.lower(), is_active=True).first()
    target = resolve_target(link) if (link and link.business.is_active) else None
    if target is None:
        return HttpResponse(_GONE, status=404, content_type="text/html; charset=utf-8")
    if request.method == "GET":
        QrLink.all_objects.filter(pk=link.pk).update(scans=F("scans") + 1, last_scan_at=timezone.now())
    resp = HttpResponseRedirect(target)
    resp["Cache-Control"] = "no-store"          # the target can change at any time
    resp["Referrer-Policy"] = "no-referrer"
    return resp
