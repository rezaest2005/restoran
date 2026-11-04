"""
Storefront (no-code public website) API.

Public
  GET  /api/storefront/<slug>/                  published data only
  GET  /api/storefront/<slug>/preview/?token=   draft, signed short-lived token

Staff (dashboard tab ``storefront``)
  GET/PUT /api/storefront/mine/
  POST    /api/storefront/mine/publish/ | unpublish/ | apply-template/ | preview-token/
  GET     /api/storefront/mine/revisions/
  POST    /api/storefront/mine/revisions/<id>/restore/
  GET/POST /api/storefront/mine/assets/
  GET     /api/storefront/templates/

Super admin
  GET/POST /api/super/storefront/templates/
  GET/PUT/DELETE /api/super/storefront/templates/<id>/
  POST    /api/super/storefront/business/<id>/template/
"""

from django.core.exceptions import ValidationError
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .. import storefront_services as svc
from ..models import Business, Storefront, StorefrontAsset, StorefrontRevision, StorefrontTemplate
from ..modules import module_enabled
from ..utils import api_error, api_success
from .common import StaffAuth, no_business_response, staff_business
from .decorators import make_service_permission
from .super_admin.auth import IsSuperAdmin

StorefrontPerm = make_service_permission("storefront")


def _msg(exc):
    return "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)


def _template_data(tpl, full=False):
    d = {
        "id": tpl.id, "key": tpl.key, "name_fa": tpl.name_fa, "name_en": tpl.name_en,
        "thumbnail": tpl.thumbnail, "default_theme": tpl.default_theme,
        "is_active": tpl.is_active,
    }
    if full:
        d["section_schema"] = tpl.section_schema
        d["default_sections"] = tpl.default_sections
    return d


def _draft_data(sf):
    schema = svc.schema_for(sf.template)
    return {
        "slug": sf.slug,
        "template": sf.template.key if sf.template else None,
        "content_language": sf.content_language,
        "is_published": sf.is_published,
        "published_at": sf.published_at.isoformat() if sf.published_at else None,
        "updated_at": sf.updated_at.isoformat(),
        "theme": sf.theme,
        "sections": sf.sections,
        "warnings": svc.contrast_warnings(sf.theme),
        "section_types": schema.get("allowed", []),
        "section_fields": schema.get("fields", {}),
        "fonts": svc.FONTS,
        "menu_available": module_enabled(sf.business, "pos"),
        "business_slug": sf.business.slug,
        "addresses": svc.storefront_addresses(sf),
    }


def _public_response(sf, data):
    menu_ok = module_enabled(sf.business, "pos")
    payload = svc.public_payload(sf, data, menu_allowed=menu_ok)
    if payload["has_menu"]:
        payload["menu_slug"] = sf.business.slug
    payload.pop("has_menu")
    payload["dashboard_url"] = svc.dashboard_url(sf.business)
    payload["club_join"] = module_enabled(sf.business, "club")
    return payload


# --- public ------------------------------------------------------------

@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def storefront_public(request, slug):
    sf = (Storefront.all_objects.select_related("business")
          .filter(slug=slug, is_published=True, business__is_active=True).first())
    if sf is None or not module_enabled(sf.business, "storefront"):
        return api_error("not found", 404)
    resp = Response(_public_response(sf, sf.published_data))
    resp["Cache-Control"] = "public, max-age=60"
    return resp


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def storefront_preview(request, slug):
    pk = svc.read_preview_token(request.GET.get("token", ""))
    sf = (Storefront.all_objects.select_related("business")
          .filter(pk=pk, slug=slug).first()) if pk else None
    if sf is None:
        return api_error("not found", 404)
    resp = Response(_public_response(sf, {
        "theme": sf.theme, "sections": sf.sections,
        "content_language": sf.content_language}))
    resp["Cache-Control"] = "no-store"
    return resp


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def storefront_by_host(request):
    """Served at ``/`` for a mapped custom domain (see StorefrontDomainMiddleware)."""
    sf = getattr(request._request, "storefront_domain", None)
    if sf is None or not sf.is_published or not module_enabled(sf.business, "storefront"):
        return api_error("not found", 404)
    resp = Response(_public_response(sf, sf.published_data))
    resp["Cache-Control"] = "public, max-age=60"
    return resp


JOIN_RATE_LIMIT = 5
JOIN_RATE_WINDOW = 600
JOIN_MESSAGE = "Thanks! Your membership request was received."


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def storefront_club_join(request, slug):
    from django.core.cache import cache

    from ..club_services import get_or_create_member, get_settings
    from .common import client_ip

    sf = (Storefront.all_objects.select_related("business")
          .filter(slug=slug, is_published=True, business__is_active=True).first())
    if (sf is None or not module_enabled(sf.business, "storefront")
            or not module_enabled(sf.business, "club")):
        return api_error("not found", 404)
    data = request.data
    if (str(data.get("website") or "")).strip():  # honeypot
        return api_success(None, JOIN_MESSAGE)
    key = f"storefront_join:{client_ip(request)}"
    count = cache.get(key, 0)
    if count >= JOIN_RATE_LIMIT:
        return api_error("too many requests, try later", 429)
    cache.set(key, count + 1, JOIN_RATE_WINDOW)
    name = str(data.get("name") or "").strip()[:200]
    if not name:
        return api_error("name is required", 400)
    if not get_settings(sf.business).is_active:
        return api_error("not found", 404)
    try:
        get_or_create_member(sf.business, data.get("phone"), name)
    except ValueError:
        return api_error("invalid phone number", 400)
    # same answer for new and existing phones: no account enumeration
    return api_success(None, JOIN_MESSAGE)


# --- staff -------------------------------------------------------------

def _mine(request):
    business = staff_business(request)
    if business is None:
        return None
    return svc.get_or_create_storefront(business)


@api_view(["GET", "PUT"])
@authentication_classes(StaffAuth)
@permission_classes([StorefrontPerm])
def storefront_mine(request):
    sf = _mine(request)
    if sf is None:
        return no_business_response()
    if request.method == "GET":
        return api_success(_draft_data(sf))
    body = request.data
    try:
        if "custom_domain" in body:
            if request.user.role != "owner" and not request.user.is_superuser:
                return api_error("only the owner can change the custom domain", 403)
            sf.custom_domain = svc.validate_domain(body.get("custom_domain"), sf.pk)
        svc.save_draft(
            sf, theme=body.get("theme"), sections=body.get("sections"),
            content_language=body.get("content_language"), slug=body.get("slug"),
        )
    except ValidationError as exc:
        return api_error(_msg(exc), 400)
    return api_success(_draft_data(sf), "saved")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([StorefrontPerm])
def storefront_publish(request):
    sf = _mine(request)
    if sf is None:
        return no_business_response()
    try:
        svc.publish(sf, request.user)
    except ValidationError as exc:
        return api_error(_msg(exc), 400)
    return api_success(_draft_data(sf), "published")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([StorefrontPerm])
def storefront_unpublish(request):
    sf = _mine(request)
    if sf is None:
        return no_business_response()
    svc.unpublish(sf)
    return api_success(_draft_data(sf), "unpublished")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([StorefrontPerm])
def storefront_apply_template(request):
    sf = _mine(request)
    if sf is None:
        return no_business_response()
    svc.ensure_presets()
    tpl = StorefrontTemplate.objects.filter(
        key=request.data.get("template"), is_active=True).first()
    if tpl is None:
        return api_error("template not found", 404)
    svc.apply_template(sf, tpl)
    return api_success(_draft_data(sf), "template applied")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([StorefrontPerm])
def storefront_preview_token(request):
    sf = _mine(request)
    if sf is None:
        return no_business_response()
    return api_success({"token": svc.make_preview_token(sf), "slug": sf.slug})


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([StorefrontPerm])
def storefront_revisions(request):
    sf = _mine(request)
    if sf is None:
        return no_business_response()
    rows = StorefrontRevision.all_objects.filter(storefront=sf).select_related("created_by")
    return api_success([{
        "id": r.id, "created_at": r.created_at.isoformat(),
        "by": r.created_by.username if r.created_by else "",
        "sections": len(r.data.get("sections", [])),
    } for r in rows])


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([StorefrontPerm])
def storefront_restore(request, pk):
    sf = _mine(request)
    if sf is None:
        return no_business_response()
    rev = StorefrontRevision.all_objects.filter(storefront=sf, pk=pk).first()
    if rev is None:
        return api_error("not found", 404)
    try:
        svc.restore_revision(sf, rev)
        if request.data.get("publish"):
            svc.publish(sf, request.user)
    except ValidationError as exc:
        return api_error(_msg(exc), 400)
    return api_success(_draft_data(sf), "restored")


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([StorefrontPerm])
def storefront_assets(request):
    business = staff_business(request)
    if business is None:
        return no_business_response()
    if request.method == "GET":
        rows = StorefrontAsset.all_objects.filter(business=business)[:100]
        return api_success([{"id": a.id, "url": a.file.url, "width": a.width,
                             "height": a.height} for a in rows])
    upload = request.FILES.get("file")
    if upload is None:
        return api_error("file is required", 400)
    try:
        asset = svc.store_image(business, upload)
    except ValidationError as exc:
        return api_error(_msg(exc), 400)
    return api_success({"id": asset.id, "url": asset.file.url, "width": asset.width,
                        "height": asset.height}, "uploaded", 201)


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([StorefrontPerm])
def storefront_templates(request):
    svc.ensure_presets()
    rows = StorefrontTemplate.objects.filter(is_active=True)
    return api_success([_template_data(t) for t in rows])


# --- super admin -------------------------------------------------------

def _clean_template_body(body, instance=None):
    key = body.get("key", instance.key if instance else "")
    name_fa = (body.get("name_fa", instance.name_fa if instance else "") or "").strip()
    name_en = (body.get("name_en", instance.name_en if instance else "") or "").strip()
    if not key or not name_fa or not name_en:
        raise ValidationError("key, name_fa and name_en are required")
    theme, _w = svc.validate_theme(body.get("default_theme", instance.default_theme if instance else {}))
    schema_in = body.get("section_schema", instance.section_schema if instance else {}) or {}
    allowed = schema_in.get("allowed") or svc.SECTION_TYPES
    schema = svc.build_schema(allowed)
    max_sections = schema_in.get("max_sections")
    if isinstance(max_sections, int) and 1 <= max_sections <= svc.MAX_SECTIONS:
        schema["max_sections"] = max_sections
    sections = svc.validate_sections(
        body.get("default_sections", instance.default_sections if instance else []), schema)
    return {
        "key": key, "name_fa": name_fa, "name_en": name_en,
        "thumbnail": str(body.get("thumbnail", instance.thumbnail if instance else ""))[:300],
        "default_theme": theme, "section_schema": schema, "default_sections": sections,
        "is_active": bool(body.get("is_active", instance.is_active if instance else True)),
    }


@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def super_storefront_templates(request):
    svc.ensure_presets()
    if request.method == "GET":
        return api_success([_template_data(t, True) for t in StorefrontTemplate.objects.all()])
    try:
        fields = _clean_template_body(request.data)
        if StorefrontTemplate.objects.filter(key=fields["key"]).exists():
            raise ValidationError("key already exists")
        tpl = StorefrontTemplate.objects.create(**fields)
    except ValidationError as exc:
        return api_error(_msg(exc), 400)
    return api_success(_template_data(tpl, True), "created", 201)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsSuperAdmin])
def super_storefront_template_detail(request, pk):
    tpl = StorefrontTemplate.objects.filter(pk=pk).first()
    if tpl is None:
        return api_error("not found", 404)
    if request.method == "GET":
        return api_success(_template_data(tpl, True))
    if request.method == "DELETE":
        tpl.delete()
        return api_success(None, "deleted")
    try:
        fields = _clean_template_body(request.data, tpl)
        if StorefrontTemplate.objects.filter(key=fields["key"]).exclude(pk=tpl.pk).exists():
            raise ValidationError("key already exists")
    except ValidationError as exc:
        return api_error(_msg(exc), 400)
    for k, v in fields.items():
        setattr(tpl, k, v)
    tpl.save()
    return api_success(_template_data(tpl, True), "updated")


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def super_storefront_set_template(request, business_id):
    business = Business.objects.filter(pk=business_id).first()
    tpl = StorefrontTemplate.objects.filter(pk=request.data.get("template_id")).first()
    if business is None or tpl is None:
        return api_error("not found", 404)
    sf = svc.get_or_create_storefront(business)
    svc.apply_template(sf, tpl)
    return api_success({"slug": sf.slug, "template": tpl.key}, "template applied")


@api_view(["PUT"])
@permission_classes([IsSuperAdmin])
def super_storefront_domain(request, business_id):
    business = Business.objects.filter(pk=business_id).first()
    if business is None:
        return api_error("not found", 404)
    sf = svc.get_or_create_storefront(business)
    try:
        sf.custom_domain = svc.validate_domain(request.data.get("custom_domain"), sf.pk)
    except ValidationError as exc:
        return api_error(_msg(exc), 400)
    sf.save()
    return api_success(svc.storefront_addresses(sf), "saved")
