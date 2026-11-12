"""
Super admin: module catalogue, plans and per-business subscriptions.

  GET/POST  /api/super/modules/                 catalogue (POST: set a module price)
  GET/POST  /api/super/plans/
  GET       /api/super/businesses/<id>/modules/ state + price summary
  PUT       /api/super/businesses/<id>/modules/ {modules: {code: {...}}, auto_requires}
  POST      /api/super/businesses/<id>/plan/    {plan: code}
"""
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view, permission_classes

from ...models import Business, Module, Plan
from ...modules import (
    ModuleDependencyError, apply_modules, apply_plan, business_state, ensure_catalog,
)
from ...utils import api_error, api_success
from .auth import IsSuperAdmin


def _module(m):
    return {"code": m.code, "name_fa": m.name_fa, "name_en": m.name_en,
            "price_monthly": m.price_monthly, "is_core": m.is_core,
            "requires": m.requires, "suggests": m.suggests}


def _plan(p):
    return {"code": p.code, "name_fa": p.name_fa, "name_en": p.name_en,
            "price_monthly": p.price_monthly, "modules": p.modules,
            "is_active": p.is_active}


def _int(v, default=None):
    if isinstance(v, bool):
        return default
    try:
        n = int(v)
        return n if n >= 0 else default
    except (TypeError, ValueError):
        return default


@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def super_modules_api(request):
    ensure_catalog()
    if request.method == "GET":
        return api_success([_module(m) for m in Module.objects.all()])
    m = Module.objects.filter(code=request.data.get("code")).first()
    if m is None:
        return api_error("unknown module", 404)
    price = _int(request.data.get("price_monthly"))
    if price is None:
        return api_error("price_monthly must be a non-negative integer")
    m.price_monthly = price
    m.save(update_fields=["price_monthly"])
    return api_success(_module(m), "updated")


@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def super_plans_api(request):
    ensure_catalog()
    if request.method == "GET":
        return api_success([_plan(p) for p in Plan.objects.all()])
    d = request.data
    code = (d.get("code") or "").strip()
    codes = d.get("modules")
    known = set(Module.objects.values_list("code", flat=True))
    price = _int(d.get("price_monthly"))
    if (not code or price is None or not isinstance(codes, list)
            or not set(codes) <= known or not d.get("name_fa") or not d.get("name_en")):
        return api_error("code, names, price_monthly and valid modules are required")
    p, _ = Plan.objects.update_or_create(code=code, defaults={
        "name_fa": d["name_fa"], "name_en": d["name_en"],
        "price_monthly": price, "modules": codes,
        "is_active": bool(d.get("is_active", True))})
    return api_success(_plan(p), "saved")


def _date(v):
    if v in (None, ""):
        return None
    dt = parse_datetime(str(v))
    if dt is None:
        raise ValueError("invalid date")
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def super_features_api(request):
    """Tab-level catalogue the licence editor shows under each module."""
    from ...features import catalog_for_super_admin
    return api_success(catalog_for_super_admin())


@api_view(["GET", "PUT"])
@permission_classes([IsSuperAdmin])
def super_business_modules_api(request, business_id):
    business = Business.objects.filter(pk=business_id).first()
    if business is None:
        return api_error("not found", 404)
    if request.method == "GET":
        return api_success(business_state(business))
    if "disabled_features" in request.data:
        from ...features import FEATURE_BY_KEY, LOCKED_KEYS
        df = request.data.get("disabled_features")
        if not isinstance(df, list) or any(not isinstance(k, str) for k in df):
            return api_error("disabled_features must be a list of keys")
        unknown = [k for k in df if k not in FEATURE_BY_KEY]
        if unknown:
            return api_error("unknown features", 400, errors={"unknown": unknown})
        business.disabled_features = sorted(set(df) - LOCKED_KEYS)
        business.save(update_fields=["disabled_features"])
        if "modules" not in request.data:
            return api_success(business_state(business), "saved")
    raw = request.data.get("modules")
    if not isinstance(raw, dict):
        return api_error("modules must be an object")
    changes = {}
    try:
        for code, ch in raw.items():
            if not isinstance(ch, dict):
                raise ValueError("invalid change")
            item = {}
            if "is_enabled" in ch:
                item["is_enabled"] = bool(ch["is_enabled"])
            for f in ("starts_at", "expires_at"):
                if f in ch:
                    item[f] = _date(ch[f])
            if "price_override" in ch:
                po = ch["price_override"]
                if po in (None, ""):
                    item["price_override"] = None
                else:
                    item["price_override"] = _int(po)
                    if item["price_override"] is None:
                        raise ValueError("invalid price")
            changes[code] = item
        state = apply_modules(business, changes, bool(request.data.get("auto_requires")))
    except ValueError as exc:
        return api_error(str(exc))
    except ModuleDependencyError as exc:
        return api_error(str(exc), 409, errors=exc.details)
    return api_success(state, "saved")


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def super_business_plan_api(request, business_id):
    ensure_catalog()
    business = Business.objects.filter(pk=business_id).first()
    plan = Plan.objects.filter(code=request.data.get("plan"), is_active=True).first()
    if business is None or plan is None:
        return api_error("not found", 404)
    try:
        return api_success(apply_plan(business, plan), "plan applied")
    except ModuleDependencyError as exc:
        return api_error(str(exc), 409, errors=exc.details)
