"""
Restaurant Management — Page Views (★ نسخه v13 — Django auth بازگشت)
★ فقط import ها اصلاح شد
"""

import json as json_module
import logging
from decimal import Decimal

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import F
from django.http import HttpRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from ..models import (
    RawMaterial,
    Food, Supplier, PurchaseInvoice, PurchaseInvoiceItem,
    InventoryMovement,
    Order,
)
from .helpers import (
    _merge_warehouse_data,
)
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)
from .decorators import require_service

logger = logging.getLogger(__name__)

LOGIN_URL = '/dashboard/'


# ═══════════════════════════════════════════
#  resolve restaurant
# ═══════════════════════════════════════════

def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    if hasattr(request, 'user') and request.user.is_authenticated:
        return getattr(request.user, 'restaurant', None)
    return None


def _get_restaurant_object_or_404(model, pk, restaurant):
    qs = model.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    obj = qs.filter(pk=pk).first()
    if obj is None:
        from django.http import Http404
        raise Http404
    return obj


def _detect_material_type(name, restaurant=None):
    """تشخیص نوع ماده — بدون ItemDictionary"""
    return "raw"


# ═══════════════════════════════════════════
#  عمومی — ریشه، لاگین، خروج، داشبورد
# ═══════════════════════════════════════════

def root_redirect(request: HttpRequest):
    if request.user.is_authenticated:
        return redirect("dashboard_app")
    return redirect("auth_page")


@login_required(login_url='auth_page')
def home(request: HttpRequest):
    return render(request, "admin/index.html")


def auth_page(request: HttpRequest):
    if request.GET.get('logout') == '1':
        logout(request)
    if request.user.is_authenticated:
        return redirect("dashboard_app")
    return render(request, "auth.html")


def redirect_to_dashboard(request):
    return redirect("auth_page")


@login_required(login_url='auth_page')
def logout_page(request: HttpRequest):
    logout(request)
    return redirect("auth_page")


# ═══════════════════════════════════════════
#  فاکتور خرید
# ═══════════════════════════════════════════

@require_service('inventory')
def purchase_invoice_list(request: HttpRequest):
    restaurant = _resolve_restaurant(request)
    qs = PurchaseInvoice.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    invoices = qs.order_by("-date")
    return render(request, "restaurant/create_invoice.html", {"invoices": invoices})


@require_service('inventory')
def purchase_invoice_detail(request: HttpRequest, pk: int):
    restaurant = _resolve_restaurant(request)
    invoice = _get_restaurant_object_or_404(PurchaseInvoice, pk, restaurant)
    return render(request, "restaurant/invoice_detail.html", {"invoice": invoice})


@require_service('inventory')
def create_invoice_view(request: HttpRequest):
    return render(request, "restaurant/create_invoice.html")


@require_service('inventory')
def create_purchase_invoice(request: HttpRequest):
    if request.method != 'POST':
        return render(request, "restaurant/create_invoice.html")

    try:
        restaurant = _resolve_restaurant(request)
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
    restaurant = _resolve_restaurant(request)
    qs = RawMaterial.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    return render(request, "restaurant/raw_materials.html", {
        "materials": qs.order_by("name"),
        "unit_choices": RawMaterial.UNIT_CHOICES,
    })


# ═══════════════════════════════════════════
#  صندوق فروش
# ═══════════════════════════════════════════

@require_service('pos')
def pos_receipt(request: HttpRequest, pk: int):
    restaurant = _resolve_restaurant(request)
    order = _get_restaurant_object_or_404(Order, pk, restaurant)

    items = []
    for item in order.items.select_related("food").all():
        price = int(item.price or 0)
        qty = item.quantity
        items.append({
            "food_name": (
                item.food.name if item.food else (item.item_name or "—")
            ),
            "quantity": qty,
            "price": price,
            "line_total": price * qty,
        })

    discount_amount = (
        int(order.discount_amount)
        if hasattr(order, "discount_amount") and order.discount_amount
        else 0
    )
    final_amount = int(order.total_price) - discount_amount

    return render(request, "restaurant/receipt.html", {
        "order": order, "items": items,
        "discount_amount": discount_amount if discount_amount > 0 else None,
        "final_amount": final_amount,
        "payment_method": getattr(order, "payment_method", None),
        "trace_number": getattr(order, "trace_number", None),
        "restaurant_name": getattr(
            settings, "RESTAURANT_NAME", "رستوران",
        ),
        "restaurant_phone": getattr(settings, "RESTAURANT_PHONE", ""),
        "restaurant_address": getattr(settings, "RESTAURANT_ADDRESS", ""),
    })


@require_service('pos')
def orders_dashboard(request):
    restaurant = _resolve_restaurant(request)
    qs = Order.objects.prefetch_related('items__food').all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    orders = qs.order_by('-created_at')
    pending = orders.filter(status='pending').count()
    preparing = orders.filter(status='preparing').count()
    ready_count = orders.filter(status='ready').count()

    return render(request, 'restaurant/orders_dashboard.html', {
        'orders': orders,
        'pending_count': pending,
        'preparing_count': preparing,
        'ready_count': ready_count,
    })


# ═══════════════════════════════════════════
#  رسپی
# ═══════════════════════════════════════════

@require_service('foods')
def recipe_manager_page(request):
    restaurant = _resolve_restaurant(request)
    return render(request, 'restaurant/recipe_manager.html', {
        'restaurant': restaurant,
    })


# ═══════════════════════════════════════════
#  مدیریت کاربران
# ═══════════════════════════════════════════

@require_service('users')
def user_management_page(request: HttpRequest):
    roles = [
        {"value": "owner", "label": "مالک", "permissions": [
            "kitchen", "pos", "orders", "recipes",
            "raw_materials", "ready_materials", "invoices",
            "usage_log", "dictionary", "users",
        ]},
        {"value": "manager", "label": "مدیر", "permissions": [
            "kitchen", "pos", "orders", "recipes",
            "raw_materials", "ready_materials", "invoices",
            "usage_log", "dictionary",
        ]},
        {"value": "cashier", "label": "صندوقدار", "permissions": [
            "pos", "orders",
        ]},
        {"value": "kitchen", "label": "آشپز", "permissions": [
            "kitchen", "recipes",
        ]},
        {"value": "warehouse", "label": "انباردار", "permissions": [
            "raw_materials", "ready_materials", "invoices",
            "usage_log", "dictionary",
        ]},
    ]
    return render(request, "restaurant/user_management.html", {
        "roles_json": json_module.dumps(roles, ensure_ascii=False),
        "current_user_id": request.user.id,
    })


# ═══════════════════════════════════════════
#  دیکشنری
# ═══════════════════════════════════════════

@require_service('dictionary')
def dictionary_page(request):
    return render(request, 'restaurant/dictionary.html')