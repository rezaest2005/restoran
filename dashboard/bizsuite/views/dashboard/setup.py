"""
First-run setup wizard + business type (industry).

  GET  /api/business/industries/        presets for the wizard (any signed-in staff)
  GET  /api/business/setup/             current type, setup state, modules (live / suggested), profile, terms
  PUT  /api/business/setup/             {industry, used_modules, name, phone, address, terms, coa_template}
                                        owner / superuser only; finishes the wizard
  POST /api/business/setup/checklist/   {dismissed: bool}  hide / show the onboarding checklist (owner / manager)

The wizard never changes licensing: modules the owner ticks but has not bought are stored as
``requested_modules`` (the super admin sees them); live ones the owner does not tick are only hidden from the
dashboard (``used_modules``), they stay licensed.
"""
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated

from ... import industries
from ...dashboard_summary import checklist
from ...modules import CATALOG, enabled_modules
from ...utils import api_error, api_success
from ..common import StaffAuth, staff_business

MODULE_CODES = [m["code"] for m in CATALOG]


def _is_owner(user):
    return bool(getattr(user, "is_superuser", False) or getattr(user, "role", "") == "owner")


def setup_payload(biz, user=None):
    live = enabled_modules(biz)
    live = set(MODULE_CODES) if live is None else live
    ind = industries.get_industry(biz)
    opts = biz.industry_options or {}
    return {
        "industry": biz.industry or "",
        "industry_resolved": ind.key,
        "setup_required": industries.is_setup_required(biz),
        "setup_completed_at": biz.setup_completed_at.isoformat() if biz.setup_completed_at else None,
        "can_edit": _is_owner(user) if user is not None else False,
        "industries": industries.catalog(),
        "modules": [{
            "code": m["code"], "name_fa": m["name_fa"], "name_en": m["name_en"],
            "requires": list(m["requires"]), "live": m["code"] in live,
            "suggested": m["code"] in ind.modules,
        } for m in CATALOG],
        "used_modules": list(opts.get("used_modules") or []),
        "requested_modules": list(opts.get("requested_modules") or []),
        "profile": {"name": biz.name, "phone": biz.phone or "", "address": biz.address or "",
                    "has_logo": bool(biz.logo)},
        "coa_template": industries.chart_template_for(biz),
        "units": list(ind.units),
        "terms": industries.terms_for(biz),
    }


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([IsAuthenticated])
def industry_catalog(request):
    return api_success(data={"industries": industries.catalog()})


def _seed_chart(biz, key):
    """Ask the accounting module for the starter chart (only when it offers a template hook; never fails setup)."""
    try:
        from ... import accounting_services as acc
        from ...models import Account
        if Account.all_objects.filter(business=biz).exists():
            return
        hook = getattr(acc, "seed_chart_template", None)
        if callable(hook):
            hook(biz, key)
    except Exception:  # pragma: no cover - accounting templates are optional
        pass


@api_view(["GET", "PUT"])
@authentication_classes(StaffAuth)
@permission_classes([IsAuthenticated])
def business_setup(request):
    biz = staff_business(request)
    if biz is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    if request.method == "GET":
        return api_success(data=setup_payload(biz, request.user))
    if not _is_owner(request.user):
        return api_error("فقط مالک کسب‌وکار می‌تواند راه‌اندازی را انجام دهد.", status_code=403)

    data = request.data or {}
    raw = (data.get("industry") or biz.industry or "").strip().lower()
    key = industries.ALIASES.get(raw, raw)
    if key not in industries.INDUSTRY_BY_KEY:
        return api_error("نوع کسب‌وکار نامعتبر است.")

    opts = dict(biz.industry_options or {})
    if "used_modules" in data:
        wanted = data.get("used_modules") or []
        if not isinstance(wanted, list):
            return api_error("فهرست ماژول‌ها نامعتبر است.")
        bad = [c for c in wanted if c not in MODULE_CODES]
        if bad:
            return api_error("ماژول نامعتبر: " + "، ".join(map(str, bad)))
        live = enabled_modules(biz)
        live = set(MODULE_CODES) if live is None else live
        opts["used_modules"] = [c for c in MODULE_CODES if c in wanted and c in live]
        opts["requested_modules"] = [c for c in MODULE_CODES if c in wanted and c not in live]
    if isinstance(data.get("terms"), dict):
        opts["terms"] = {k: v for k, v in data["terms"].items()
                         if k in industries.GENERIC_TERMS and isinstance(v, dict)}
    coa = (data.get("coa_template") or "").strip()
    opts["coa_template"] = coa or industries.get_industry(key).coa_template

    changed_industry = key != biz.industry
    with transaction.atomic():
        biz.industry = key
        biz.industry_options = opts
        for f, limit in (("name", 200), ("phone", 20), ("address", 1000)):
            if f in data and data.get(f) is not None:
                val = str(data.get(f)).strip()[:limit]
                if f == "name" and not val:
                    return api_error("نام کسب‌وکار نمی‌تواند خالی باشد.")
                setattr(biz, f, val)
        if data.get("complete", True) and biz.setup_completed_at is None:
            biz.setup_completed_at = timezone.now()
        biz.save()
        if biz.tenant_id and "name" in data and data.get("name"):
            type(biz.tenant).objects.filter(pk=biz.tenant_id).update(name=biz.name)

    live = enabled_modules(biz)
    if live is None or "accounting" in live:
        _seed_chart(biz, industries.chart_template_for(biz))
    try:
        from ...activity import log
        ind = industries.get_industry(biz)
        log(biz, "users", "setup", f"راه‌اندازی کسب‌وکار: {ind.name_fa}" if changed_industry else "به‌روزرسانی راه‌اندازی",
            actor=request.user, request=request, details={"industry": key})
    except Exception:  # pragma: no cover
        pass
    return api_success(data=setup_payload(biz, request.user), message="راه‌اندازی ذخیره شد.")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([IsAuthenticated])
def business_checklist(request):
    biz = staff_business(request)
    if biz is None:
        return api_error("کسب‌وکار پیدا نشد.", 400)
    if not (_is_owner(request.user) or getattr(request.user, "role", "") == "manager"):
        return api_error("دسترسی ندارید.", status_code=403)
    opts = dict(biz.industry_options or {})
    opts["checklist_dismissed"] = bool((request.data or {}).get("dismissed", True))
    biz.industry_options = opts
    biz.save(update_fields=["industry_options"])
    return api_success(data={"checklist_dismissed": opts["checklist_dismissed"],
                             "checklist": checklist(biz, request.user)})
