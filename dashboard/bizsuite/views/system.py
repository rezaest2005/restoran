"""Public, unauthenticated system endpoints: app info and health check."""

import logging

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from core import branding

logger = logging.getLogger(__name__)


@require_GET
def app_info(request):
    return JsonResponse({
        "name": branding.APP_NAME,
        "name_fa": branding.APP_NAME_FA,
        "version": branding.APP_VERSION,
    })


@require_GET
def health(request):
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
    except Exception:
        logger.exception("health check: database unreachable")
        return JsonResponse({"status": "error", "database": "down"}, status=503)
    return JsonResponse({"status": "ok", "database": "up"})
