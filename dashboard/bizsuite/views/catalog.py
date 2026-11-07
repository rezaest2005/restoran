"""
Catalog (Definitions) API: categories, products, items, barcodes.

Products are the sellable rows (model ``Food``); items are inventory rows
(model ``RawMaterial``). A product may be linked to an item: its stock is then
the item's stock in the sales warehouse.
"""
import logging
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.db.models.deletion import ProtectedError
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from .. import catalog_services as svc
from ..models import (
    Category, Food, Formula, FormulaLine, InventoryMovement, RawMaterial, UNIT_CHOICES, Warehouse,
)
from ..modules import module_enabled
from ..utils import api_error, api_success
from ..warehouse_access import is_manager_level
from .common import PosPerm, StaffAuth, staff_business
from .decorators import make_service_permission

logger = logging.getLogger(__name__)

MAX_PAGE_SIZE = 1000
UNIT_KEYS = {k for k, _ in UNIT_CHOICES}
MATERIAL_TYPES = {k for k, _ in RawMaterial.MATERIAL_TYPE_CHOICES}
NOT_FOUND = "پیدا نشد."


# ═══════════════════════════════════════
#  Permissions: Definitions need pos/inventory/production live (or core 'dictionary')
# ═══════════════════════════════════════

def _definitions_perm(*codes):
    base = make_service_permission(*codes)

    class _Perm(base):
        def has_permission(self, request, view):
            if not super().has_permission(request, view):
                return False
            business = getattr(request.user, "business", None)
            return any(module_enabled(business, m) for m in ("pos", "inventory", "production"))

    _Perm.__name__ = base.__name__ + "_defs"
    _Perm.__qualname__ = _Perm.__name__
    return _Perm


ProductPerm = _definitions_perm("pos", "dictionary")
ItemPerm = _definitions_perm("inventory", "dictionary")


# ═══════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════

def _num(d):
    d = Decimal(d)
    return int(d) if d == d.to_integral_value() else float(d)


def _bool(v):
    if isinstance(v, str):
        return v.strip().lower() in ("1", "true", "yes", "on")
    return bool(v)


def _blank(v):
    return v is None or (isinstance(v, str) and v.strip().lower() in ("", "null", "none"))


def _decimal(value, field, max_digits=12, places=3):
    try:
        d = Decimal(str(value).strip())
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"«{field}» نامعتبر است.")
    if not d.is_finite() or d < 0:
        raise ValueError(f"«{field}» نامعتبر است.")
    if d >= Decimal(10) ** (max_digits - places):
        raise ValueError(f"«{field}» بیش از حد بزرگ است.")
    if -d.as_tuple().exponent > places:
        raise ValueError(f"«{field}» نامعتبر است.")
    return d


def _money(value, field, max_digits=10):
    d = _decimal(value, field, max_digits=max_digits, places=0)
    return d


def _pagination(request):
    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        size = int(request.query_params.get("page_size", 100))
    except (TypeError, ValueError):
        size = 100
    return page, max(1, min(size, MAX_PAGE_SIZE))


def _paged(request, qs, serializer):
    page, size = _pagination(request)
    total = qs.count()
    rows = list(qs[(page - 1) * size: page * size])
    return Response({
        "success": True, "data": serializer(rows),
        "total": total, "page": page, "page_size": size,
    })


def _no_business():
    return api_error("کسب‌وکاری برای این کاربر تعریف نشده است.")


def _not_found(what="مورد"):
    return api_error(f"{what} {NOT_FOUND}", status_code=404)


def _name(d, existing=None):
    name = str(d.get("name", existing if existing is not None else "") or "").strip()[:200]
    if not name:
        raise ValueError("نام الزامی است.")
    return name


# ═══════════════════════════════════════
#  Categories
# ═══════════════════════════════════════

def _category_data(c, count=None):
    return {
        "id": c.id, "name": c.name, "name_en": c.name_en, "order": c.order,
        "is_active": c.is_active,
        "product_count": count if count is not None else c.foods.count(),
    }


def _apply_category(business, c, d):
    if "name" in d or c.pk is None:
        c.name = _name(d)
    if "name_en" in d:
        c.name_en = str(d.get("name_en") or "").strip()[:200]
    if "order" in d:
        try:
            c.order = int(d.get("order") or 0)
        except (TypeError, ValueError):
            raise ValueError("ترتیب نامعتبر است.")
    if "is_active" in d:
        c.is_active = _bool(d.get("is_active"))
    clash = Category.all_objects.filter(business=business, name=c.name).exclude(pk=c.pk)
    if clash.exists():
        raise ValueError("دسته‌بندی با این نام وجود دارد.")


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductPerm])
def categories(request):
    business = staff_business(request)
    if business is None:
        return _no_business()
    if request.method == "GET":
        qs = Category.all_objects.filter(business=business).annotate(
            _n=Count("foods")).order_by("order", "name")
        return api_success(data=[_category_data(c, c._n) for c in qs])
    c = Category(business=business)
    try:
        _apply_category(business, c, request.data)
        c.save()
    except (ValueError, IntegrityError) as exc:
        return api_error(str(exc) if isinstance(exc, ValueError) else "دسته‌بندی با این نام وجود دارد.")
    return api_success(data=_category_data(c, 0), message="دسته‌بندی ایجاد شد.", status_code=201)


@api_view(["PUT", "DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([ProductPerm])
def category_detail(request, pk):
    business = staff_business(request)
    if business is None:
        return _no_business()
    c = Category.all_objects.filter(business=business, pk=pk).first()
    if c is None:
        return _not_found("دسته‌بندی")
    if request.method == "DELETE":
        n = Food.all_objects.filter(business=business, category=c).count()
        if n:
            return api_error(f"این دسته‌بندی {n} محصول دارد؛ ابتدا محصولات را جابه‌جا یا حذف کنید.")
        c.delete()
        return api_success(message="دسته‌بندی حذف شد.")
    try:
        _apply_category(business, c, request.data)
        c.save()
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=_category_data(c), message="ذخیره شد.")


# ═══════════════════════════════════════
#  Products
# ═══════════════════════════════════════

def _item_summary(item, wh_stock=None):
    if item is None:
        return None
    return {
        "id": item.id, "name": item.name, "unit": item.unit,
        "material_type": item.material_type, "barcode": item.barcode,
        "total_stock": _num(item.quantity),
        "sales_stock": _num(wh_stock) if wh_stock is not None else None,
    }


def _products_data(business, foods):
    """Serialize products with batched stock and formula lookups."""
    foods = list(foods)
    item_ids = {f.item_id for f in foods if f.item_id}
    stock = svc.sales_stock_map(business, item_ids) if item_ids else {}
    with_formula = set(
        Formula.all_objects.filter(business=business, output_material_id__in=item_ids)
        .values_list("output_material_id", flat=True)
    ) if item_ids else set()
    out = []
    for f in foods:
        if f.item_id:
            eff = stock.get(f.item_id, Decimal("0"))
        else:
            eff = Decimal(f.stock or 0)
        out.append({
            "id": f.id, "name": f.name, "name_en": f.name_en,
            "category_id": f.category_id,
            "category": f.category.name if f.category_id else "",
            "price": _num(f.price), "final_price": _num(f.final_price),
            "is_available": f.is_available,
            "image": f.image.url if f.image else "",
            "barcode": f.barcode, "item_id": f.item_id,
            "description": f.description, "order": f.order,
            "stock": _num(eff),
            "linked": bool(f.item_id),
            "item": _item_summary(f.item, stock.get(f.item_id, Decimal("0"))) if f.item_id else None,
            "has_formula": f.item_id in with_formula if f.item_id else False,
        })
    return out


def _product_one(business, food):
    return _products_data(business, [food])[0]


def _get_product(business, pk):
    return Food.all_objects.filter(business=business, pk=pk).select_related("category", "item").first()


def _apply_product(business, f, d, files):
    creating = f.pk is None
    if creating or "name" in d:
        f.name = _name(d, f.name)
    if creating or "category_id" in d or "category" in d:
        cid = d.get("category_id", d.get("category"))
        cat = None
        try:
            cat = Category.all_objects.filter(business=business, pk=int(cid)).first()
        except (TypeError, ValueError):
            pass
        if cat is None:
            raise ValueError("دسته‌بندی انتخاب‌شده معتبر نیست.")
        f.category = cat
    if "name_en" in d:
        f.name_en = str(d.get("name_en") or "").strip()[:200]
    if "description" in d:
        f.description = str(d.get("description") or "")[:5000]
    if "order" in d:
        try:
            f.order = int(d.get("order") or 0)
        except (TypeError, ValueError):
            raise ValueError("ترتیب نامعتبر است.")
    if "is_available" in d:
        f.is_available = _bool(d.get("is_available"))
    if "price" in d or creating:
        f.price = _money(d.get("price", 0) or 0, "قیمت")
    if "final_price" in d:
        f.final_price = _money(d.get("final_price") or 0, "قیمت نهایی")
    elif "price" in d:
        f.final_price = f.price
    if f.final_price and f.price and f.final_price > f.price:
        raise ValueError("قیمت نهایی نمی‌تواند از قیمت اصلی بیشتر باشد.")
    if "item_id" in d:
        svc.set_product_item(f, d.get("item_id"))
    if "stock" in d and not f.item_id:
        try:
            stock = int(d.get("stock") or 0)
        except (TypeError, ValueError):
            raise ValueError("موجودی نامعتبر است.")
        if stock < 0:
            raise ValueError("موجودی نمی‌تواند منفی باشد.")
        f.stock = stock
    if "barcode" in d:
        f.barcode = svc.prepare_barcode(business, d.get("barcode"), exclude=("product", f.pk))
    clash = Food.all_objects.filter(business=business, name=f.name).exclude(pk=f.pk)
    if clash.exists():
        raise ValueError("محصولی با این نام وجود دارد.")
    upload = files.get("image") if files else None
    if upload is not None:
        svc.store_product_image(f, upload)
    elif _bool(d.get("remove_image", False)) and f.image:
        f.image = ""


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductPerm])
def products(request):
    business = staff_business(request)
    if business is None:
        return _no_business()
    if request.method == "GET":
        qs = Food.all_objects.filter(business=business).select_related("category", "item")
        p = request.query_params
        q = (p.get("q") or "").strip()
        if q:
            code = svc.normalize_barcode(q)
            qs = qs.filter(Q(name__icontains=q) | Q(name_en__icontains=q) | Q(barcode=code))
        if p.get("category"):
            try:
                qs = qs.filter(category_id=int(p["category"]))
            except ValueError:
                return api_error("دسته‌بندی نامعتبر است.")
        if p.get("active") not in (None, ""):
            qs = qs.filter(is_available=_bool(p["active"]))
        if p.get("linked") not in (None, ""):
            qs = qs.filter(item__isnull=not _bool(p["linked"]))
        return _paged(request, qs.order_by("category__order", "order", "name"),
                      lambda rows: _products_data(business, rows))
    f = Food(business=business)
    try:
        with transaction.atomic():
            _apply_product(business, f, request.data, request.FILES)
            f.save()
    except ValueError as exc:
        return api_error(str(exc))
    except IntegrityError:
        return api_error("نام یا بارکد تکراری است.")
    return api_success(data=_product_one(business, f), message="محصول ایجاد شد.", status_code=201)


@api_view(["GET", "PUT", "DELETE"])
@authentication_classes(StaffAuth)
@permission_classes([ProductPerm])
def product_detail(request, pk):
    business = staff_business(request)
    if business is None:
        return _no_business()
    f = _get_product(business, pk)
    if f is None:
        return _not_found("محصول")
    if request.method == "GET":
        return api_success(data=_product_one(business, f))
    if request.method == "DELETE":
        f.delete()
        return api_success(message="محصول حذف شد.")
    try:
        with transaction.atomic():
            _apply_product(business, f, request.data, request.FILES)
            f.save()
    except ValueError as exc:
        return api_error(str(exc))
    except IntegrityError:
        return api_error("نام یا بارکد تکراری است.")
    f = _get_product(business, pk)
    return api_success(data=_product_one(business, f), message="ذخیره شد.")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ProductPerm])
def product_link_item(request, pk):
    business = staff_business(request)
    if business is None:
        return _no_business()
    f = _get_product(business, pk)
    if f is None:
        return _not_found("محصول")
    try:
        svc.set_product_item(f, request.data.get("item_id"))
    except ValueError as exc:
        return api_error(str(exc), status_code=400)
    f.save(update_fields=["item"])
    f = _get_product(business, pk)
    return api_success(data=_product_one(business, f), message="اتصال ذخیره شد.")


# ═══════════════════════════════════════
#  Items (RawMaterial)
# ═══════════════════════════════════════

def _items_data(business, items):
    items = list(items)
    ids = [i.id for i in items]
    out_ids = set(Formula.all_objects.filter(business=business, output_material_id__in=ids)
                  .values_list("output_material_id", flat=True))
    used = dict(
        FormulaLine.all_objects.filter(business=business, material_id__in=ids)
        .values("material_id").annotate(n=Count("formula_id", distinct=True))
        .values_list("material_id", "n")
    )
    linked = dict(
        Food.all_objects.filter(business=business, item_id__in=ids)
        .values("item_id").annotate(n=Count("id")).values_list("item_id", "n")
    )
    return [{
        "id": i.id, "name": i.name, "name_en": i.name_en,
        "material_type": i.material_type, "unit": i.unit,
        "price": _num(i.price), "minimum_stock": _num(i.minimum_stock),
        "target_stock": _num(i.target_stock), "barcode": i.barcode,
        "description": i.description, "stock": _num(i.quantity),
        "has_formula": i.id in out_ids,
        "used_in_formulas": used.get(i.id, 0),
        "linked_products": linked.get(i.id, 0),
    } for i in items]


def _apply_item(business, it, d):
    creating = it.pk is None
    if creating or "name" in d:
        it.name = _name(d, it.name)
    if "name_en" in d:
        it.name_en = str(d.get("name_en") or "").strip()[:200]
    if "description" in d:
        it.description = str(d.get("description") or "")[:5000]
    if "material_type" in d or creating:
        mt = d.get("material_type", "raw")
        if mt not in MATERIAL_TYPES:
            raise ValueError("نوع کالا نامعتبر است.")
        it.material_type = mt
    if "unit" in d or creating:
        unit = d.get("unit", "unit")
        if unit not in UNIT_KEYS:
            raise ValueError("واحد نامعتبر است.")
        it.unit = unit
    if "price" in d:
        it.price = _decimal(d.get("price") or 0, "قیمت", max_digits=12, places=0)
    for field, label in (("minimum_stock", "حداقل موجودی"), ("target_stock", "موجودی هدف")):
        if field in d:
            setattr(it, field, _decimal(d.get(field) or 0, label))
    if "barcode" in d:
        it.barcode = svc.prepare_barcode(business, d.get("barcode"), exclude=("item", it.pk))


@api_view(["GET", "POST"])
@authentication_classes(StaffAuth)
@permission_classes([ItemPerm])
def items(request):
    business = staff_business(request)
    if business is None:
        return _no_business()
    if request.method == "GET":
        qs = RawMaterial.all_objects.filter(business=business)
        p = request.query_params
        q = (p.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(name_en__icontains=q)
                           | Q(barcode=svc.normalize_barcode(q)))
        if p.get("material_type"):
            qs = qs.filter(material_type=p["material_type"])
        return _paged(request, qs.order_by("name"), lambda rows: _items_data(business, rows))
    it = RawMaterial(business=business)
    try:
        with transaction.atomic():
            _apply_item(business, it, request.data)
            it.save()
    except ValueError as exc:
        return api_error(str(exc))
    except IntegrityError:
        return api_error("بارکد تکراری است.")
    return api_success(data=_items_data(business, [it])[0], message="کالا ایجاد شد.", status_code=201)


@api_view(["PUT", "DELETE", "GET"])
@authentication_classes(StaffAuth)
@permission_classes([ItemPerm])
def item_detail(request, pk):
    business = staff_business(request)
    if business is None:
        return _no_business()
    it = RawMaterial.all_objects.filter(business=business, pk=pk).first()
    if it is None:
        return _not_found("کالا")
    if request.method == "GET":
        return api_success(data=_items_data(business, [it])[0])
    if request.method == "DELETE":
        reasons = []
        if it.quantity != 0:
            reasons.append("موجودی صفر نیست")
        if Formula.all_objects.filter(business=business, output_material=it).exists() or \
                FormulaLine.all_objects.filter(business=business, material=it).exists():
            reasons.append("در فرمول استفاده شده است")
        if InventoryMovement.all_objects.filter(business=business, raw_material=it).exists():
            reasons.append("گردش انبار دارد")
        if Food.all_objects.filter(business=business, item=it).exists():
            reasons.append("به محصول متصل است")
        if reasons:
            return api_error("حذف ممکن نیست: " + "، ".join(reasons) + ".")
        try:
            it.delete()
        except ProtectedError:
            return api_error("حذف ممکن نیست: این کالا در اسناد دیگر استفاده شده است.")
        return api_success(message="کالا حذف شد.")
    try:
        with transaction.atomic():
            _apply_item(business, it, request.data)
            it.save()
    except ValueError as exc:
        return api_error(str(exc))
    except IntegrityError:
        return api_error("بارکد تکراری است.")
    return api_success(data=_items_data(business, [it])[0], message="ذخیره شد.")


# ═══════════════════════════════════════
#  Barcodes
# ═══════════════════════════════════════

def _id_list(raw):
    if raw in (None, ""):
        return None
    if isinstance(raw, str):
        raw = raw.split(",")
    if not isinstance(raw, (list, tuple)):
        raise ValueError("ids نامعتبر است.")
    try:
        return [int(x) for x in raw if str(x).strip() != ""]
    except (TypeError, ValueError):
        raise ValueError("ids نامعتبر است.")


@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([_definitions_perm("pos", "inventory", "dictionary")])
def barcodes_generate(request):
    business = staff_business(request)
    if business is None:
        return _no_business()
    d = request.data
    try:
        ids = _id_list(d.get("ids"))
        result = svc.generate_barcodes(
            business, d.get("target"), ids=ids,
            only_missing=_bool(d.get("only_missing", True)), count=d.get("count"),
        )
    except ValueError as exc:
        return api_error(str(exc))
    return api_success(data=result, message=f"{len(result['codes'])} بارکد تولید شد.")


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([_definitions_perm("pos", "inventory", "dictionary")])
def barcodes_labels(request):
    business = staff_business(request)
    if business is None:
        return _no_business()
    p = request.query_params
    target = p.get("target")
    if target not in ("product", "item"):
        return api_error("target باید product یا item باشد.")
    try:
        ids = _id_list(p.get("ids"))
        copies = max(1, int(p.get("copies", 1) or 1))
    except ValueError:
        return api_error("پارامتر نامعتبر است.")
    model = Food if target == "product" else RawMaterial
    qs = model.all_objects.filter(business=business)
    if ids is not None:
        qs = qs.filter(pk__in=ids)
    rows, missing = [], []
    for obj in qs.order_by("pk")[:svc.MAX_BARCODES_PER_REQUEST]:
        if not obj.barcode:
            missing.append(obj.pk)
            continue
        price = obj.final_price if target == "product" else obj.price
        rows.append({"id": obj.pk, "name": obj.name, "price": _num(price),
                     "barcode": obj.barcode, "format": svc.barcode_format(obj.barcode)})
    if len(rows) * copies > svc.MAX_BARCODES_PER_REQUEST:
        return api_error(f"حداکثر {svc.MAX_BARCODES_PER_REQUEST} برچسب در هر درخواست.")
    return Response({"success": True, "data": [r for r in rows for _ in range(copies)],
                     "missing": missing})


@api_view(["GET"])
@authentication_classes(StaffAuth)
@permission_classes([PosPerm])
def pos_barcode_lookup(request, code):
    business = staff_business(request)
    if business is None:
        return _no_business()
    code = svc.normalize_barcode(code)
    food = Food.all_objects.filter(business=business, barcode=code).select_related("category", "item").first()
    matched = "product"
    if food is None and code:
        item = RawMaterial.all_objects.filter(business=business, barcode=code).first()
        if item is not None:
            food = Food.all_objects.filter(business=business, item=item).select_related(
                "category", "item").order_by("pk").first()
            matched = "item"
    if food is None:
        return api_error("بارکد پیدا نشد.", status_code=404)
    data = _product_one(business, food)
    data["matched"] = matched
    return api_success(data=data)


# ═══════════════════════════════════════
#  Sales warehouse flag
# ═══════════════════════════════════════

@api_view(["POST"])
@authentication_classes(StaffAuth)
@permission_classes([ItemPerm])
def warehouse_sales_default(request, pk):
    business = staff_business(request)
    if business is None:
        return _no_business()
    wh = Warehouse.all_objects.filter(business=business, pk=pk).first()
    if wh is None:
        return _not_found("انبار")
    if not is_manager_level(request.user):
        return api_error("فقط مالک یا مدیر می‌تواند انبار فروش را تعیین کند.", status_code=403)
    wh.is_sales_default = _bool(request.data.get("value", True))
    wh.save()
    return api_success(data={"id": wh.id, "is_sales_default": wh.is_sales_default,
                             "sales_warehouse_id": svc.get_sales_warehouse(business).id})
