"""
Warehouse, Raw Materials, Suppliers, Semi-Finished, Ready Materials API.
"""
import json as json_module
import logging
from decimal import Decimal

from django.contrib.admin.views.decorators import staff_member_required
from django.db import transaction
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST

from ..models import (
    RawMaterial, Supplier, SemiFinished, SemiFinishedIngredient,
    ReadyMaterial, InventoryMovement, InventoryUsageLog,
)
from .helpers import (
    _read_file_rows, _extract_items_from_rows,
    _get_or_sync_ingredients, _merge_warehouse_data,
)

logger = logging.getLogger(__name__)


# ═══ Raw Materials ═══

@csrf_protect
@require_POST
def raw_material_save(request: HttpRequest):
    try:
        pk = request.POST.get("id")
        name = request.POST.get("name", "").strip()
        label = request.POST.get("label", "").strip()
        price = int(float(request.POST.get("price", 0)))
        unit = request.POST.get("unit", "unit")
        quantity = int(float(request.POST.get("quantity", 0)))

        if not name:
            return JsonResponse({"success": False, "error": "نام کالا الزامی است."})
        if price < 0:
            return JsonResponse({"success": False, "error": "قیمت نمی‌تواند منفی باشد."})
        if quantity < 0:
            return JsonResponse({"success": False, "error": "تعداد نمی‌تواند منفی باشد."})

        if pk:
            mat = get_object_or_404(RawMaterial, pk=pk)
            mat.name = name
            mat.label = label
            mat.price = price
            mat.unit = unit
            mat.quantity = quantity
            mat.save()
            msg = "ویرایش شد."
        else:
            mat = RawMaterial.objects.create(name=name, label=label, price=price, unit=unit, quantity=quantity)
            msg = "اضافه شد."

        return JsonResponse({
            "success": True, "msg": msg,
            "item": {
                "id": mat.pk, "name": mat.name, "label": mat.label,
                "price": int(mat.price), "unit": mat.unit,
                "unit_display": mat.get_unit_display(),
                "quantity": int(mat.quantity), "total": int(mat.total_price),
            },
        })
    except Exception as exc:
        logger.exception("Error saving raw material")
        return JsonResponse({"success": False, "error": str(exc)})


@csrf_protect
@require_POST
def raw_material_delete(request: HttpRequest):
    try:
        mat = get_object_or_404(RawMaterial, pk=request.POST.get("id"))
        name = mat.name
        mat.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting raw material")
        return JsonResponse({"success": False, "error": str(exc)})


def raw_material_suggestions(request: HttpRequest):
    query = request.GET.get("q", "").strip()
    if not query:
        return JsonResponse([], safe=False)
    materials = (
        RawMaterial.objects.filter(name__icontains=query)
        .values("name", "unit", "price").order_by("name")[:10]
    )
    return JsonResponse([{"name": m["name"], "unit": m["unit"], "price": int(m["price"])} for m in materials], safe=False)


# ═══ Suppliers ═══

@staff_member_required
def supplier_list(request: HttpRequest):
    suppliers = Supplier.objects.all().values("id", "name", "phone", "address", "contact_person")
    return JsonResponse(list(suppliers), safe=False)


def supplier_suggestions(request: HttpRequest):
    query = request.GET.get("q", "").strip()
    if not query:
        return JsonResponse([], safe=False)
    results = [{"id": s.id, "name": s.name, "phone": s.phone or "", "address": s.address or "", "contact_person": s.contact_person or ""} for s in Supplier.objects.filter(name__icontains=query)[:10]]
    return JsonResponse(results, safe=False)


@csrf_protect
@require_POST
@staff_member_required
def supplier_save(request: HttpRequest):
    try:
        sup_id = request.POST.get("id", "").strip()
        name = request.POST.get("name", "").strip()
        if not name:
            return JsonResponse({"success": False, "error": "نام شرکت الزامی است."})
        if sup_id:
            supplier = get_object_or_404(Supplier, pk=sup_id)
        else:
            supplier = Supplier()
        supplier.name = name
        supplier.phone = request.POST.get("phone", "").strip()
        supplier.address = request.POST.get("address", "").strip()
        supplier.contact_person = request.POST.get("contact_person", "").strip()
        supplier.description = request.POST.get("description", "").strip()
        supplier.save()
        return JsonResponse({"id": supplier.pk, "name": supplier.name, "phone": supplier.phone or "", "address": supplier.address or "", "contact_person": supplier.contact_person or "", "msg": "تأمین‌کننده ذخیره شد."})
    except Exception as exc:
        logger.exception("Error saving supplier")
        return JsonResponse({"success": False, "error": str(exc)})


@csrf_protect
@require_POST
@staff_member_required
def supplier_delete(request: HttpRequest):
    try:
        pk = request.POST.get("id")
        if not pk:
            return JsonResponse({"success": False, "error": "شناسه ارسال نشد."})
        sup = get_object_or_404(Supplier, pk=pk)
        name = sup.name
        sup.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting supplier")
        return JsonResponse({"success": False, "error": str(exc)})


# ═══ Warehouse ═══

@staff_member_required
def warehouse_json(request: HttpRequest):
    materials = list(RawMaterial.objects.all().values("id", "name", "quantity", "unit", "price"))
    for m in materials:
        m["quantity"] = float(m["quantity"])
        m["price"] = int(m["price"])
    return JsonResponse(materials, safe=False)


@csrf_protect
@require_POST
def parse_excel_file(request: HttpRequest):
    uploaded_file = request.FILES.get("file")
    if not uploaded_file:
        return JsonResponse({"success": False, "error": "فایلی ارسال نشد."})
    try:
        rows = _read_file_rows(uploaded_file)
        items, supplier_name = _extract_items_from_rows(rows)
        if not items:
            return JsonResponse({"success": False, "error": "هیچ کالایی در فایل یافت نشد."})
        supplier_id = None
        if supplier_name:
            sup = Supplier.objects.filter(name__icontains=supplier_name).first()
            if sup:
                supplier_id = sup.id
        return JsonResponse({"success": True, "items": items, "count": len(items), "supplier_name": supplier_name, "supplier_id": supplier_id})
    except Exception as exc:
        logger.exception("Error parsing excel file")
        return JsonResponse({"success": False, "error": f"خطا: {exc}"})


# ═══ Semi-Finished ═══

@csrf_protect
@require_POST
def semi_finished_save(request: HttpRequest):
    try:
        data = json_module.loads(request.body)
        name = data.get("name", "").strip()
        if not name:
            return JsonResponse({"success": False, "error": "نام الزامی است."})

        sf = SemiFinished.objects.create(
            name=name, unit=data.get("unit", "kg"),
            category=data.get("category", "other"),
            description=data.get("description", ""),
            quantity_produced=float(data.get("quantity_produced", 1)),
            profit_percentage=float(data.get("profit_percentage", 0)),
        )

        for ing in data.get("ingredients", []):
            raw_id = ing.get("raw_material_id")
            qty = float(ing["quantity"])
            ing_name = ing.get("name", "").strip()

            if not raw_id or raw_id == 0:
                if ing_name:
                    mat = RawMaterial.objects.filter(name__iexact=ing_name).first()
                    if not mat:
                        mat = RawMaterial.objects.create(
                            name=ing_name, label=ing.get("label", ""),
                            price=int(float(ing.get("price", 0))),
                            unit=ing.get("unit", "kg"), quantity=0,
                        )
                    raw_id = mat.id
                else:
                    continue

            SemiFinishedIngredient.objects.create(semi_finished=sf, raw_material_id=raw_id, quantity=qty)

            try:
                raw_mat = RawMaterial.objects.get(id=raw_id)
                raw_mat.quantity = max(0, raw_mat.quantity - Decimal(str(qty)))
                raw_mat.save()
                InventoryUsageLog.objects.create(
                    raw_material=raw_mat, usage_type="semi_finished",
                    quantity_used=qty, reference=f"ساخت: {name}",
                    note=f"ماده نیمه‌آماده «{name}» — {qty} {raw_mat.get_unit_display()}",
                )
            except RawMaterial.DoesNotExist:
                pass

        return JsonResponse({"success": True, "msg": "ذخیره شد.", "id": sf.pk})
    except Exception as exc:
        logger.exception("Error saving semi-finished product")
        return JsonResponse({"success": False, "error": str(exc)})


@csrf_protect
@require_POST
@staff_member_required
def semi_finished_delete(request: HttpRequest):
    try:
        data = json_module.loads(request.body)
        sf_id = data.get("id")
        if not sf_id:
            return JsonResponse({"success": False, "error": "شناسه ارسال نشد."})
        sf = SemiFinished.objects.get(id=sf_id)
        sf_name = sf.name
        for ing in sf.ingredients.all():
            raw_mat = ing.raw_material
            raw_mat.quantity += ing.quantity
            raw_mat.save()
        InventoryUsageLog.objects.filter(reference=f"ساخت: {sf_name}").delete()
        sf.delete()
        return JsonResponse({"success": True, "msg": f"«{sf_name}» حذف شد و موجودی انبار بازگردانی شد."})
    except SemiFinished.DoesNotExist:
        return JsonResponse({"success": False, "error": "ماده نیمه‌آماده پیدا نشد."})
    except Exception as exc:
        logger.exception("Error deleting semi-finished product")
        return JsonResponse({"success": False, "error": str(exc)})


@staff_member_required
def semi_finished_produce(request: HttpRequest):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "POST only"})
    try:
        data = json_module.loads(request.body)
        sf_id = data.get("semi_finished_id")
        quantity = float(data.get("quantity", 0))
        if not sf_id:
            return JsonResponse({"success": False, "error": "شناسه ارسال نشد."})
        if quantity <= 0:
            return JsonResponse({"success": False, "error": "تعداد باید بیشتر از صفر باشد."})

        sf = SemiFinished.objects.prefetch_related("ingredients__raw_material").get(id=sf_id)
        ingredients = sf.ingredients.all()
        if not ingredients.exists():
            return JsonResponse({"success": False, "error": f"هیچ ماده اولیه‌ای برای «{sf.name}» تعریف نشده."})

        shortages = []
        for ing in ingredients:
            needed = ing.quantity * Decimal(str(quantity))
            if ing.raw_material.quantity < needed:
                shortages.append(f"«{ing.raw_material.name}»: نیاز {needed} — موجودی {ing.raw_material.quantity}")
        if shortages:
            return JsonResponse({"success": False, "error": "موجودی کافی نیست:\n" + "\n".join(shortages)})

        with transaction.atomic():
            for ing in ingredients:
                needed = ing.quantity * Decimal(str(quantity))
                raw_mat = ing.raw_material
                raw_mat.quantity -= needed
                raw_mat.save()
                InventoryUsageLog.objects.create(
                    raw_material=raw_mat, usage_type="semi_finished",
                    quantity_used=float(needed), reference=f"تولید: {sf.name} × {quantity}",
                    note=f"تولید {quantity} واحد «{sf.name}»",
                )
            produced_amount = float(sf.quantity_produced) * quantity
            sf.current_stock += Decimal(str(produced_amount))
            sf.save(update_fields=['current_stock'])

        return JsonResponse({
            "success": True,
            "msg": f"{int(quantity)} واحد «{sf.name}» تولید شد. ({produced_amount} {sf.get_unit_display()} به موجودی اضافه شد. موجودی فعلی: {sf.current_stock})",
        })
    except SemiFinished.DoesNotExist:
        return JsonResponse({"success": False, "error": "ماده نیمه‌آماده پیدا نشد."})
    except Exception as exc:
        logger.exception("Error producing semi-finished")
        return JsonResponse({"success": False, "error": str(exc)})


@staff_member_required
def semi_finished_produce_detail(request: HttpRequest, pk: int):
    sf = get_object_or_404(SemiFinished, pk=pk)
    ingredients = _get_or_sync_ingredients(sf)
    return JsonResponse({
        "id": sf.id, "name": sf.name, "category": sf.category,
        "description": sf.description or "", "unit": sf.unit,
        "quantity_produced": float(sf.quantity_produced or 1),
        "profit_percentage": float(sf.profit_percentage or 0),
        "cost_per_unit": int(sf.cost_per_unit or 0),
        "suggested_price": int(sf.suggested_price or 0),
        "ingredients": ingredients,
    })


# ═══ Ready Materials ═══

@csrf_protect
@require_POST
def ready_material_save(request: HttpRequest):
    try:
        pk = request.POST.get('id')
        name = request.POST.get('name', '').strip()
        if not name:
            return JsonResponse({'success': False, 'error': 'نام ماده الزامی است.'})

        description = request.POST.get('description', '').strip()
        unit = request.POST.get('unit', 'unit')
        quantity = Decimal(str(request.POST.get('quantity', 0) or 0))
        consume_quantity = Decimal(str(request.POST.get('consume_quantity', 0) or 0))
        purchase_price = int(float(request.POST.get('purchase_price', 0) or 0))
        selling_price = int(float(request.POST.get('selling_price', 0) or 0))
        minimum_stock = Decimal(str(request.POST.get('minimum_stock', 0) or 0))
        supplier_id = request.POST.get('supplier') or None
        barcode = request.POST.get('barcode', '').strip()
        raw_material_id = request.POST.get('raw_material_id') or None
        consume_quantity = Decimal(str(request.POST.get('consume_quantity', 0) or 0))
        category_id = request.POST.get('category') or None

        if purchase_price < 0:
            return JsonResponse({'success': False, 'error': 'قیمت خرید نمی‌تواند منفی باشد.'})
        if quantity < 0:
            return JsonResponse({'success': False, 'error': 'موجودی نمی‌تواند منفی باشد.'})

        raw_mat = None
        if raw_material_id and consume_quantity > 0:
            raw_mat = RawMaterial.objects.filter(pk=raw_material_id).first()
            if not raw_mat:
                return JsonResponse({'success': False, 'error': 'ماده اولیه یافت نشد.'})
            if raw_mat.quantity < consume_quantity:
                return JsonResponse({'success': False, 'error': f'موجودی «{raw_mat.name}» ({raw_mat.quantity}) کمتر از مقدار مصرف ({consume_quantity}) است.'})

        if pk:
            mat = get_object_or_404(ReadyMaterial, pk=pk)
            old_raw = mat.source_raw_material
            old_consume = mat.consume_quantity or Decimal('0')
            if old_raw and old_consume > 0:
                old_raw.quantity += old_consume
                old_raw.save()
            mat.name = name
            mat.description = description
            mat.unit = unit
            mat.quantity = quantity
            mat.purchase_price = purchase_price
            mat.selling_price = selling_price
            mat.minimum_stock = minimum_stock
            mat.supplier_id = supplier_id
            mat.barcode = barcode
            mat.source_raw_material = raw_mat
            mat.consume_quantity = consume_quantity if raw_mat else Decimal('0')
            mat.category_id = category_id
            mat.save()
            if raw_mat and consume_quantity > 0:
                raw_mat.quantity -= consume_quantity
                raw_mat.save()
            msg = 'ویرایش شد.'
        else:
            mat = ReadyMaterial.objects.create(
                name=name, description=description, unit=unit,
                quantity=consume_quantity if raw_mat and consume_quantity > 0 else quantity,
                purchase_price=purchase_price, selling_price=selling_price,
                minimum_stock=minimum_stock, supplier_id=supplier_id,
                barcode=barcode, source_raw_material=raw_mat,
                consume_quantity=consume_quantity if raw_mat else Decimal('0'),
                category_id=category_id,
            )
            if raw_mat and consume_quantity > 0:
                raw_mat.quantity -= consume_quantity
                raw_mat.save()
            msg = 'اضافه شد.'

        return JsonResponse({
            'success': True, 'msg': msg,
            'item': {
                'id': mat.pk, 'name': mat.name, 'description': mat.description or '',
                'unit': mat.unit, 'unit_display': mat.get_unit_display(),
                'quantity': float(mat.quantity), 'purchase_price': int(mat.purchase_price),
                'selling_price': int(mat.selling_price), 'minimum_stock': float(mat.minimum_stock),
                'supplier_id': mat.supplier_id,
                'supplier_name': mat.supplier.name if mat.supplier else '',
                'barcode': mat.barcode or '', 'category_id': mat.category_id,
                'category_name': mat.category.name if mat.category else '',
                'total_value': int(mat.total_value), 'stock_status': mat.stock_status,
            },
        })
    except Exception as exc:
        logger.exception('Error saving ready material')
        return JsonResponse({'success': False, 'error': str(exc)})


@csrf_protect
@require_POST
def ready_material_delete(request: HttpRequest):
    try:
        pk = request.POST.get("id")
        if not pk:
            return JsonResponse({"success": False, "error": "شناسه ارسال نشد."})
        mat = get_object_or_404(ReadyMaterial, pk=pk)
        name = mat.name
        if mat.source_raw_material and mat.consume_quantity > 0:
            raw = mat.source_raw_material
            raw.quantity += mat.consume_quantity
            raw.save()
        mat.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting ready material")
        return JsonResponse({"success": False, "error": str(exc)})


@csrf_protect
@require_POST
def convert_to_ready_material(request: HttpRequest):
    try:
        raw_id = request.POST.get("raw_material_id")
        qty = float(request.POST.get("quantity", 0))
        selling_price = int(float(request.POST.get("selling_price", 0)))
        supplier_id = request.POST.get("supplier") or None

        if not raw_id:
            return JsonResponse({"success": False, "error": "ماده اولیه انتخاب نشده."})
        if qty <= 0:
            return JsonResponse({"success": False, "error": "مقدار باید بیشتر از صفر باشد."})

        raw_mat = get_object_or_404(RawMaterial, pk=raw_id)
        if qty > float(raw_mat.quantity):
            return JsonResponse({"success": False, "error": f"موجودی کافی نیست. حداکثر: {int(raw_mat.quantity)}"})

        raw_mat.quantity -= Decimal(str(qty))
        raw_mat.save(update_fields=["quantity"])

        ready = ReadyMaterial.objects.create(
            name=raw_mat.name, description="تبدیل شده از ماده اولیه",
            unit=raw_mat.unit, quantity=qty, purchase_price=int(raw_mat.price),
            selling_price=selling_price, minimum_stock=0, supplier_id=supplier_id,
        )

        return JsonResponse({
            "success": True, "msg": f"«{raw_mat.name}» به مواد آماده اضافه شد.",
            "item": {
                "id": ready.pk, "name": ready.name, "description": ready.description or "",
                "unit": ready.unit, "unit_display": ready.get_unit_display(),
                "quantity": float(ready.quantity), "purchase_price": int(ready.purchase_price),
                "selling_price": int(ready.selling_price), "minimum_stock": float(ready.minimum_stock),
                "supplier_id": ready.supplier_id,
                "supplier_name": ready.supplier.name if ready.supplier else "",
                "barcode": ready.barcode or "", "total_value": int(ready.total_value),
                "stock_status": ready.stock_status,
            },
        })
    except Exception as exc:
        logger.exception("Error converting to ready material")
        return JsonResponse({"success": False, "error": str(exc)})


@csrf_protect
@require_POST
@staff_member_required
def ready_material_update_price(request: HttpRequest):
    try:
        data = json_module.loads(request.body)
        rm_id = data.get('id')
        selling_price = int(data.get('selling_price', 0))
        if not rm_id:
            return JsonResponse({'success': False, 'error': 'شناسه ارسال نشد.'})
        if selling_price < 0:
            return JsonResponse({'success': False, 'error': 'قیمت نمی‌تواند منفی باشد.'})
        rm = get_object_or_404(ReadyMaterial, pk=rm_id)
        rm.selling_price = selling_price
        rm.save(update_fields=['selling_price'])
        return JsonResponse({
            'success': True, 'msg': f'قیمت «{rm.name}» بروزرسانی شد.',
            'item': {'id': rm.pk, 'name': rm.name, 'selling_price': int(rm.selling_price), 'purchase_price': int(rm.purchase_price)},
        })
    except Exception as exc:
        logger.exception('Error updating ready material price')
        return JsonResponse({'success': False, 'error': str(exc)})


# ═══ Usage Log API ═══

@staff_member_required
def usage_log_json(request: HttpRequest):
    logs = InventoryUsageLog.objects.select_related("raw_material").all().order_by("-used_at")[:200]
    data = [{
        "id": log.id, "material": log.raw_material.name,
        "unit": log.raw_material.get_unit_display(),
        "quantity": str(log.quantity_used), "type": log.get_usage_type_display(),
        "type_key": log.usage_type, "reference": log.reference or "—",
        "note": log.note or "", "date": log.used_at.strftime("%Y/%m/%d %H:%M"),
    } for log in logs]
    return JsonResponse({"logs": data})


@staff_member_required
def usage_log_detail_json(request: HttpRequest):
    material_id = request.GET.get("material_id", "")
    if not material_id:
        return JsonResponse({"logs": [], "material": None})
    logs = InventoryUsageLog.objects.filter(raw_material_id=material_id).select_related("raw_material").order_by("-used_at")
    material = logs.first().raw_material if logs.exists() else None
    data = [{
        "id": log.id, "quantity": str(log.quantity_used),
        "type": log.get_usage_type_display(), "type_key": log.usage_type,
        "reference": log.reference or "—", "note": log.note or "",
        "date": log.used_at.strftime("%Y/%m/%d %H:%M"),
    } for log in logs]
    total = sum(float(d["quantity"]) for d in data)
    return JsonResponse({
        "logs": data, "total_consumed": str(total),
        "material": {"name": material.name, "unit": material.get_unit_display(), "stock": str(material.quantity)} if material else None,
    })