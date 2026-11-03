"""
صفحات HTML — فاکتور خرید و مواد اولیه
"""
import logging
from decimal import Decimal

from django.contrib import messages
from django.db import transaction
from django.db.models import F
from django.http import HttpRequest
from django.shortcuts import redirect, render
from django.utils import timezone

from ...models import (
    RawMaterial,
    Supplier,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    InventoryMovement,
)
from ..decorators import require_service
from ..common import get_restaurant_object_or_404, resolve_restaurant

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════
#  resolve restaurant
# ═══════════════════════════════════════════

def _detect_material_type(name, restaurant=None):
    """تشخیص نوع ماده — بدون ItemDictionary"""
    return "raw"


# ═══════════════════════════════════════════
#  فاکتور خرید
# ═══════════════════════════════════════════

@require_service('inventory')
def purchase_invoice_list(request: HttpRequest):
    restaurant = resolve_restaurant(request)
    qs = PurchaseInvoice.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    invoices = qs.order_by("-date")
    return render(request, "restaurant/create_invoice.html", {"invoices": invoices})


@require_service('inventory')
def purchase_invoice_detail(request: HttpRequest, pk: int):
    restaurant = resolve_restaurant(request)
    invoice = get_restaurant_object_or_404(PurchaseInvoice, pk, restaurant)
    return render(request, "restaurant/invoice_detail.html", {"invoice": invoice})


@require_service('inventory')
def create_invoice_view(request: HttpRequest):
    return render(request, "restaurant/create_invoice.html")


@require_service('inventory')
def create_purchase_invoice(request: HttpRequest):
    if request.method != 'POST':
        return render(request, "restaurant/create_invoice.html")

    try:
        restaurant = resolve_restaurant(request)
        if not restaurant:
            messages.error(request, 'رستوران مشخص نشده.')
            return redirect('create_invoice')

        supplier_name = request.POST.get('supplier_name', '').strip()
        invoice_number = request.POST.get('invoice_number', '').strip()
        description = request.POST.get('description', '').strip()

        item_names = request.POST.getlist('item_name')
        quantities = request.POST.getlist('quantity')
        unit_prices = request.POST.getlist('unit_price')
        units = request.POST.getlist('unit')
        dict_cats = request.POST.getlist('dict_category')
        mat_ids = request.POST.getlist('raw_material_id')

        if not item_names:
            messages.error(request, 'هیچ کالایی وارد نشده.')
            return redirect('create_invoice')

        date_str = request.POST.get('date', '').strip()
        try:
            parts = date_str.split('-')
            invoice_date = timezone.datetime(
                int(parts[0]), int(parts[1]), int(parts[2]),
            ).date()
        except Exception:
            invoice_date = timezone.now().date()

        with transaction.atomic():
            if supplier_name:
                sup_qs = Supplier.objects.filter(name__iexact=supplier_name)
                if restaurant:
                    sup_qs = sup_qs.filter(restaurant=restaurant)
                if not sup_qs.exists():
                    Supplier.objects.create(
                        restaurant=restaurant,
                        name=supplier_name,
                    )

            invoice = PurchaseInvoice.objects.create(
                restaurant=restaurant,
                supplier_name=supplier_name,
                invoice_number=invoice_number,
                date=invoice_date,
                description=description,
            )

            added = []

            for i in range(len(item_names)):
                name = item_names[i].strip()
                if not name or 'جمع کل' in name:
                    continue

                raw_qty = (
                    quantities[i] if i < len(quantities) else '0'
                ).replace(',', '')
                raw_price = (
                    unit_prices[i] if i < len(unit_prices) else '0'
                ).replace(',', '')
                qty = Decimal(raw_qty or '0')
                price = int(float(raw_price or 0))
                unit = units[i] if i < len(units) else 'unit'
                raw_id = mat_ids[i] if i < len(mat_ids) else ''

                if qty <= 0:
                    continue

                mat = None

                if raw_id:
                    try:
                        mat = RawMaterial.objects.get(
                            id=int(raw_id), restaurant=restaurant,
                        )
                    except (RawMaterial.DoesNotExist, ValueError, TypeError):
                        pass

                if not mat:
                    mat_qs = RawMaterial.objects.filter(name__iexact=name)
                    if restaurant:
                        mat_qs = mat_qs.filter(restaurant=restaurant)
                    mat = mat_qs.first()

                if mat:
                    mat = RawMaterial.objects.select_for_update().get(pk=mat.pk)
                    old_qty = mat.quantity

                    RawMaterial.objects.filter(pk=mat.pk).update(
                        quantity=F('quantity') + qty,
                        price=price,
                    )
                    mat.refresh_from_db()
                else:
                    mat = RawMaterial.objects.create(
                        restaurant=restaurant,
                        name=name, label='', price=price,
                        unit=unit, quantity=qty, material_type='raw',
                    )
                    old_qty = Decimal('0')

                added.append(f'{name} ({qty})')

                InventoryMovement.objects.create(
                    restaurant=restaurant,
                    raw_material=mat,
                    movement_type='in',
                    quantity=qty,
                    previous_stock=old_qty,
                    new_stock=mat.quantity,
                    reference_type='PurchaseInvoice',
                    reference_id=invoice.id,
                    notes=(
                        f'فاکتور خرید #{invoice_number or "—"}'
                        f' — {supplier_name or "—"}'
                    ),
                    created_by=request.user,
                )

                PurchaseInvoiceItem.objects.create(
                    invoice=invoice,
                    item_name=name,
                    quantity=qty,
                    unit=unit,
                    unit_price=price,
                    raw_material=mat,
                )

        if added:
            messages.success(
                request, f'فاکتور ثبت شد: {", ".join(added)}',
            )
        else:
            messages.warning(request, 'کالای معتبری ثبت نشد.')
            invoice.delete()

        return redirect('invoice_list')

    except Exception as exc:
        logger.exception('Error creating invoice')
        messages.error(request, f'خطا: {exc}')
        return redirect('create_invoice')


# ═══════════════════════════════════════════
#  انبار
# ═══════════════════════════════════════════

@require_service('inventory')
def raw_materials_view(request: HttpRequest):
    restaurant = resolve_restaurant(request)
    qs = RawMaterial.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    return render(request, "restaurant/raw_materials.html", {
        "materials": qs.order_by("name"),
        "unit_choices": RawMaterial.UNIT_CHOICES,
    })
