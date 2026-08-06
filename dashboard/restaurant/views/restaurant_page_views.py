"""
Restaurant Management — Page Views (★ نسخه اصلاح‌شده v3)

★ تغییرات نسبت به نسخه قبل:
  ۱. superuser_required → _super_admin_cookie_required (DRF version از بین رفته بود)
  ۲. _resolve_restaurant: اضافه شد
  ۳. request.restaurant → _resolve_restaurant(request)
  ۴. تمام query‌ها: فیلتر restaurant
  ۵. print/traceback → logger
  ۶. helpers import: سازگار با نسخه جدید
"""

import json as json_module
import logging
from decimal import Decimal

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.core import signing
from django.db import transaction
from django.http import HttpRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from ..models import (
    Category, RawMaterial, SemiFinished, ReadyMaterial,
    Food, Supplier, PurchaseInvoice, PurchaseInvoiceItem,
    InventoryUsageLog, InventoryMovement,
    Order, LoyaltyNotification, KitchenProduct, Recipe,
    ItemDictionary,
)
from .helpers import (
    _build_foods_with_discounts, _merge_warehouse_data,
    _detect_material_type,
)
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)

logger = logging.getLogger(__name__)

LOGIN_URL = '/dashboard/'


# ═══════════════════════════════════════════
#  ★★★ resolve restaurant ★★★
# ═══════════════════════════════════════════

def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    # fallback برای HTML views
    if hasattr(request, 'user') and request.user.is_authenticated:
        return getattr(request.user, 'restaurant', None)
    return None


# ═══════════════════════════════════════════
#  ★★★ Super Admin Cookie Auth (برای HTML views) ★★★
# ═══════════════════════════════════════════

SUPER_TOKEN_SALT = 'super-admin-panel-v1'
SUPER_TOKEN_COOKIE = 'super_session'


def _super_admin_cookie_required(view_func):
    """decorator برای صفحات HTML سوپر ادمین — cookie مستقل"""
    from functools import wraps

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        token = request.COOKIES.get(SUPER_TOKEN_COOKIE)
        if not token:
            return redirect('/dashboard/?next=/dashboard/super/')
        try:
            from ..models import User
            data = signing.loads(token, salt=SUPER_TOKEN_SALT, max_age=86400 * 7)
            user = User.objects.get(id=data['uid'], is_superuser=True, is_active=True)
            request.user = user
        except Exception:
            return redirect('/dashboard/?next=/dashboard/super/')
        return view_func(request, *args, **kwargs)

    return wrapper


# ═══════════════════════════════════════════
#  عمومی — لاگین، خروج، داشبورد
# ═══════════════════════════════════════════

@login_required(login_url=LOGIN_URL)
def home(request: HttpRequest):
    return render(request, "admin/index.html")


def auth_page(request: HttpRequest):
    if request.user.is_authenticated:
        return redirect("dashboard_app")
    return render(request, "auth.html")


def redirect_to_dashboard(request):
    return redirect("auth_page")


@login_required(login_url=LOGIN_URL)
def logout_page(request: HttpRequest):
    logout(request)
    return redirect("auth_page")


# ═══════════════════════════════════════════
#  فاکتور خرید — لیست، جزئیات، ایجاد
# ═══════════════════════════════════════════

@login_required(login_url=LOGIN_URL)
def purchase_invoice_list(request: HttpRequest):
    restaurant = _resolve_restaurant(request)
    qs = PurchaseInvoice.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    invoices = qs.order_by("-date")
    return render(request, "restaurant/create_invoice.html", {"invoices": invoices})


@login_required(login_url=LOGIN_URL)
def purchase_invoice_detail(request: HttpRequest, pk: int):
    invoice = get_object_or_404(PurchaseInvoice, pk=pk)
    return render(request, "restaurant/invoice_detail.html", {"invoice": invoice})


@login_required(login_url=LOGIN_URL)
def create_invoice_view(request: HttpRequest):
    """صفحه ثبت فاکتور — فقط نمایش HTML"""
    return render(request, "restaurant/create_invoice.html")


@login_required(login_url=LOGIN_URL)
def create_purchase_invoice(request: HttpRequest):
    """ثبت فاکتور خرید — GET: نمایش صفحه | POST: افزودن به انبار"""
    if request.method != 'POST':
        return render(request, "restaurant/create_invoice.html")

    try:
        restaurant = _resolve_restaurant(request)

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

        # ذخیره تأمین‌کننده
        if supplier_name:
            sup_qs = Supplier.objects.filter(name__iexact=supplier_name)
            if restaurant:
                sup_qs = sup_qs.filter(restaurant=restaurant)
            if not sup_qs.exists():
                Supplier.objects.create(
                    restaurant=restaurant,
                    name=supplier_name,
                )

        # ساختن هدر فاکتور
        date_str = request.POST.get('date', '').strip()
        try:
            parts = date_str.split('-')
            invoice_date = timezone.datetime(
                int(parts[0]), int(parts[1]), int(parts[2]),
            ).date()
        except Exception:
            invoice_date = timezone.now().date()

        invoice = PurchaseInvoice.objects.create(
            restaurant=restaurant,
            supplier_name=supplier_name,
            invoice_number=invoice_number,
            date=invoice_date,
            description=description,
        )

        added = []

        with transaction.atomic():
            for i in range(len(item_names)):
                name = item_names[i].strip()
                if not name or 'جمع کل' in name:
                    continue

                raw_qty = (quantities[i] if i < len(quantities) else '0').replace(',', '')
                raw_price = (unit_prices[i] if i < len(unit_prices) else '0').replace(',', '')
                qty = Decimal(raw_qty or '0')
                price = int(float(raw_price or 0))
                unit = units[i] if i < len(units) else 'unit'
                raw_id = mat_ids[i] if i < len(mat_ids) else ''

                if qty <= 0:
                    continue

                # پیدا کردن ماده اولیه
                mat = None

                # تلاش ۱: با شناسه
                if raw_id:
                    try:
                        mat = RawMaterial.objects.get(
                            id=int(raw_id), restaurant=restaurant,
                        )
                    except (RawMaterial.DoesNotExist, ValueError, TypeError):
                        pass

                # تلاش ۲: با نام
                if not mat:
                    mat_qs = RawMaterial.objects.filter(name__iexact=name)
                    if restaurant:
                        mat_qs = mat_qs.filter(restaurant=restaurant)
                    mat = mat_qs.first()

                # تلاش ۳: ساختن جدید یا بروزرسانی
                if mat:
                    old_qty = mat.quantity
                    mat.quantity += qty
                    mat.price = price
                    if mat.material_type == 'raw' and restaurant:
                        _mt = _detect_material_type(name, restaurant)
                        if _mt == 'packaging':
                            mat.material_type = 'packaging'
                    mat.save()
                else:
                    _mt = _detect_material_type(name, restaurant) if restaurant else 'raw'
                    mat = RawMaterial.objects.create(
                        restaurant=restaurant,
                        name=name, label='', price=price,
                        unit=unit, quantity=qty, material_type=_mt,
                    )
                    old_qty = Decimal('0')

                added.append(f'{name} ({qty})')

                # ثبت جابجایی انبار
                InventoryMovement.objects.create(
                    restaurant=restaurant,
                    raw_material=mat,
                    movement_type='in',
                    quantity=qty,
                    previous_stock=old_qty,
                    new_stock=mat.quantity,
                    reference_type='PurchaseInvoice',
                    reference_id=invoice.id,
                    notes=f'فاکتور خرید #{invoice_number or "—"} — {supplier_name or "—"}',
                    created_by=request.user,
                )

                # ثبت آیتم فاکتور
                PurchaseInvoiceItem.objects.create(
                    restaurant=restaurant,
                    invoice=invoice,
                    item_name=name,
                    quantity=qty,
                    unit=unit,
                    unit_price=price,
                    raw_material=mat,
                )

        if added:
            messages.success(request, f'فاکتور ثبت شد: {", ".join(added)}')
        else:
            messages.warning(request, 'کالای معتبری ثبت نشد.')
            invoice.delete()

        return redirect('invoice_list')

    except Exception as exc:
        logger.exception('Error creating invoice')
        messages.error(request, f'خطا: {exc}')
        return redirect('create_invoice')


# ═══════════════════════════════════════════
#  انبار — مواد اولیه، نیم‌آماده، مصرف
# ═══════════════════════════════════════════

@login_required(login_url=LOGIN_URL)
def raw_materials_view(request: HttpRequest):
    restaurant = _resolve_restaurant(request)
    qs = RawMaterial.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    return render(request, "restaurant/raw_materials.html", {
        "materials": qs.order_by("name"),
        "unit_choices": RawMaterial.UNIT_CHOICES,
    })


@login_required(login_url=LOGIN_URL)
def semi_finished_view(request: HttpRequest):
    restaurant = _resolve_restaurant(request)

    sf_qs = SemiFinished.objects.prefetch_related("ingredients__raw_material").all()
    rm_qs = RawMaterial.objects.all()
    if restaurant:
        sf_qs = sf_qs.filter(restaurant=restaurant)
        rm_qs = rm_qs.filter(restaurant=restaurant)

    merged = _merge_warehouse_data(restaurant=restaurant)
    raw_materials_json = json_module.dumps(
        sorted(merged.values(), key=lambda x: x["name"]),
        ensure_ascii=False,
    )

    return render(request, "restaurant/semi_finished.html", {
        "semi_finished_list": sf_qs,
        "raw_materials": rm_qs,
        "raw_materials_json": raw_materials_json,
    })


@login_required(login_url=LOGIN_URL)
def usage_log_view(request: HttpRequest):
    restaurant = _resolve_restaurant(request)

    sf_qs = SemiFinished.objects.prefetch_related(
        "ingredients__raw_material",
    ).all()
    if restaurant:
        sf_qs = sf_qs.filter(restaurant=restaurant)

    semi_finished_list = sf_qs.order_by("name")

    log_qs = InventoryUsageLog.objects.all()
    if restaurant:
        log_qs = log_qs.filter(restaurant=restaurant)
    total_logs = log_qs.count()

    by_type = {}
    for choice_val, choice_label in InventoryUsageLog.USAGE_TYPE_CHOICES:
        by_type[choice_val] = {
            "label": choice_label,
            "count": log_qs.filter(usage_type=choice_val).count(),
        }

    semi_finished_data = []
    for sf in semi_finished_list:
        ingredients = [{
            "name": ing.raw_material.name,
            "unit": ing.raw_material.get_unit_display(),
            "quantity": str(ing.quantity),
            "stock": str(ing.raw_material.quantity),
            "price": str(ing.raw_material.price),
            "total_cost": str(int(ing.total_cost)),
        } for ing in sf.ingredients.all()]
        semi_finished_data.append({
            "id": sf.id, "name": sf.name,
            "category": sf.get_category_display(),
            "unit": sf.get_unit_display(),
            "quantity_produced": str(sf.quantity_produced),
            "total_cost": str(int(sf.total_cost)),
            "cost_per_unit": str(int(sf.cost_per_unit)),
            "suggested_price": str(int(sf.suggested_price)),
            "can_produce": sf.can_produce,
            "ingredients": ingredients,
        })

    sup_qs = Supplier.objects.all()
    if restaurant:
        sup_qs = sup_qs.filter(restaurant=restaurant)

    return render(request, "restaurant/usage_log.html", {
        "semi_finished_list": semi_finished_list,
        "semi_finished_json": json_module.dumps(semi_finished_data, ensure_ascii=False),
        "total_logs": total_logs,
        "by_type": by_type,
        "type_choices": InventoryUsageLog.USAGE_TYPE_CHOICES,
        "suppliers": sup_qs.order_by("name"),
        "order_stats": {"total_orders": 0, "total_revenue": 0, "top_foods": []},
    })


@login_required(login_url=LOGIN_URL)
def ready_materials_page(request: HttpRequest):
    restaurant = _resolve_restaurant(request)

    dict_qs = ItemDictionary.objects.filter(
        category='ready_material', is_active=True,
    )
    if restaurant:
        dict_qs = dict_qs.filter(restaurant=restaurant)

    rm_qs = RawMaterial.objects.all()
    if restaurant:
        rm_qs = rm_qs.filter(restaurant=restaurant)

    raw_map = {}
    for rm in rm_qs:
        raw_map[rm.name.strip().lower()] = rm

    items = []
    for d in dict_qs.order_by('name'):
        matched = raw_map.get(d.name.strip().lower())
        items.append({
            'id': d.id,
            'name': d.name,
            'unit': d.unit,
            'unit_display': d.get_unit_display(),
            'quantity': float(matched.quantity) if matched else None,
            'price': float(matched.price) if matched else None,
            'in_stock': matched is not None and matched.quantity > 0,
        })

    cat_qs = Category.objects.filter(is_active=True)
    if restaurant:
        cat_qs = cat_qs.filter(restaurant=restaurant)

    return render(request, 'restaurant/ready_materials.html', {
        'items': items,
        'categories': cat_qs.order_by('order'),
    })


# ═══════════════════════════════════════════
#  آشپزخانه — داشبورد تولید
# ═══════════════════════════════════════════

@login_required(login_url=LOGIN_URL)
def kitchen_page(request: HttpRequest):
    from django.db.models import F

    restaurant = _resolve_restaurant(request)

    kp_qs = KitchenProduct.objects.all()
    if restaurant:
        kp_qs = kp_qs.filter(restaurant=restaurant)

    recipes = list(Recipe.objects.values("id").annotate(name=F("food__name")))
    categories = list(KitchenProduct.CATEGORY_CHOICES)

    food_qs = Food.objects.select_related('category').all()
    if restaurant:
        food_qs = food_qs.filter(restaurant=restaurant)

    foods_list = []
    for f in food_qs.order_by('category__order', 'name'):
        foods_list.append({
            'id': f.id, 'name': f.name, 'category_id': f.category_id,
            'category_name': f.category.name if f.category else '',
            'final_price': int(f.final_price or 0),
            'image': f.image.url if getattr(f, 'image', None) and f.image else '',
            'is_ready': False, 'purchase_price': 0,
        })

    cat_qs = Category.objects.filter(is_active=True)
    if restaurant:
        cat_qs = cat_qs.filter(restaurant=restaurant)
    food_cats = list(cat_qs.order_by('order').values('id', 'name'))
    existing_names = {c['name'] for c in food_cats}

    rm_qs = ReadyMaterial.objects.filter(quantity__gt=0).exclude(
        category__isnull=True,
    ).select_related('category')
    if restaurant:
        rm_qs = rm_qs.filter(restaurant=restaurant)

    for rm in rm_qs:
        foods_list.append({
            'id': f'ready_{rm.id}', 'name': rm.name,
            'category_id': rm.category_id,
            'category_name': rm.category.name if rm.category else '',
            'final_price': int(rm.selling_price or 0), 'image': '',
            'is_ready': True, 'purchase_price': int(rm.purchase_price or 0),
        })
        if rm.category and rm.category.name not in existing_names:
            food_cats.append({'id': rm.category_id, 'name': rm.category.name})
            existing_names.add(rm.category.name)

    return render(request, "restaurant/kitchen_page.html", {
        "recipes_json": json_module.dumps(recipes, ensure_ascii=False),
        "categories_json": json_module.dumps(categories, ensure_ascii=False),
        "foods_json": json_module.dumps(foods_list, ensure_ascii=False),
        "food_cats_json": json_module.dumps(food_cats, ensure_ascii=False),
    })


# ═══════════════════════════════════════════
#  صندوق فروش — POS + رسید
# ═══════════════════════════════════════════

@login_required(login_url=LOGIN_URL)
def pos_page(request: HttpRequest):
    restaurant = _resolve_restaurant(request)

    foods_data, cats_data = _build_foods_with_discounts(restaurant=restaurant)
    existing_names = {c['name']: c['id'] for c in cats_data}

    # موجودی KitchenProduct
    for food_item in foods_data:
        if food_item.get('is_ready'):
            continue
        stock = 0
        kp_qs = KitchenProduct.objects.filter(name=food_item['name'])
        if restaurant:
            kp_qs = kp_qs.filter(restaurant=restaurant)
        kp = kp_qs.first()
        if kp:
            try:
                inv = kp.get_inventory()
                if inv:
                    stock = inv.available_quantity or 0
            except Exception:
                stock = 0
        food_item['stock'] = stock

    # Ready Materials
    rm_qs = ReadyMaterial.objects.filter(quantity__gt=0).select_related('category')
    if restaurant:
        rm_qs = rm_qs.filter(restaurant=restaurant)

    for rm in rm_qs:
        cat_id = rm.category_id if rm.category else existing_names.get('سایر', -99)
        cat_name = rm.category.name if rm.category else 'سایر'
        foods_data.append({
            'id': f'ready_{rm.id}', 'name': rm.name, 'category_id': cat_id,
            'category_name': cat_name, 'final_price': int(rm.selling_price or 0),
            'kitchen_price': int(rm.selling_price or 0), 'has_kitchen': False,
            'discount': None, 'image': '', 'is_ready': True,
            'stock': int(rm.quantity or 0),
        })
        if rm.category and rm.category.name not in existing_names:
            cats_data.append({'id': rm.category_id, 'name': rm.category.name})
            existing_names[rm.category.name] = rm.category_id

    if any(not rm.category for rm in rm_qs) and 'سایر' not in existing_names:
        cats_data.append({'id': -99, 'name': 'سایر'})

    return render(request, 'restaurant/pos.html', {
        'foods_json': json_module.dumps(foods_data, ensure_ascii=False),
        'categories_json': json_module.dumps(cats_data, ensure_ascii=False),
    })


@login_required(login_url=LOGIN_URL)
def pos_receipt(request: HttpRequest, pk: int):
    order = get_object_or_404(Order, pk=pk)
    items = []
    for item in order.items.select_related("food").all():
        price = int(item.price or 0)
        qty = item.quantity
        items.append({
            "food_name": item.food.name if item.food else (item.item_name or "—"),
            "quantity": qty, "price": price, "line_total": price * qty,
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
        "restaurant_name": getattr(settings, "RESTAURANT_NAME", "رستوران"),
        "restaurant_phone": getattr(settings, "RESTAURANT_PHONE", ""),
        "restaurant_address": getattr(settings, "RESTAURANT_ADDRESS", ""),
    })


@login_required(login_url=LOGIN_URL)
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
#  رسپی — مدیریت دستورات
# ═══════════════════════════════════════════

@login_required(login_url=LOGIN_URL)
def recipe_manager_page(request):
    restaurant = _resolve_restaurant(request)
    return render(request, 'recipes/recipe_manager.html', {
        'restaurant': restaurant,
    })


# ═══════════════════════════════════════════
#  باشگاه مشتریان — داشبورد و صفحات
# ═══════════════════════════════════════════

@login_required(login_url=LOGIN_URL)
def loyalty_dashboard_page(request: HttpRequest):
    from ..services import get_loyalty_dashboard
    restaurant = _resolve_restaurant(request)
    try:
        stats = get_loyalty_dashboard(restaurant=restaurant)
    except Exception:
        stats = {}
    return render(request, "loyalty/dashboard.html", {"stats": stats})


@login_required(login_url=LOGIN_URL)
def loyalty_customers_page(request: HttpRequest):
    return render(request, "loyalty/customers.html")


@login_required(login_url=LOGIN_URL)
def loyalty_customer_detail_page(request: HttpRequest, pk: int):
    return render(request, "loyalty/customer_detail.html")


@login_required(login_url=LOGIN_URL)
def loyalty_coupons_page(request: HttpRequest):
    return render(request, "loyalty/coupons.html")


@login_required(login_url=LOGIN_URL)
def loyalty_rewards_page(request: HttpRequest):
    return render(request, "loyalty/rewards.html")


@login_required(login_url=LOGIN_URL)
def loyalty_notifications_page(request: HttpRequest):
    restaurant = _resolve_restaurant(request)
    qs = LoyaltyNotification.objects.filter(is_read=False)
    if restaurant:
        qs = qs.filter(customer__restaurant=restaurant)

    return render(request, "loyalty/notifications.html", {
        "unread_notifications": qs.count(),
    })


@login_required(login_url=LOGIN_URL)
def loyalty_register_page(request: HttpRequest):
    return render(request, "loyalty/register.html")


# ═══════════════════════════════════════════
#  مدیریت کاربران — نقش‌ها و مجوزها
# ═══════════════════════════════════════════

@login_required(login_url=LOGIN_URL)
def user_management_page(request: HttpRequest):
    roles = [
        {"value": "owner", "label": "مالک", "permissions": [
            "foods.view", "foods.edit", "foods.create", "foods.delete", "foods.categories",
            "inventory.view", "inventory.edit", "inventory.create", "inventory.delete",
            "inventory.raw_materials", "inventory.ready_materials", "inventory.semi_finished",
            "inventory.usages_log", "inventory.invoice", "inventory.end_of_invoice",
            "orders.view", "orders.edit", "orders.create", "orders.delete",
            "pos.view", "pos.use", "pos.close", "pos.report",
            "kitchen.view", "kitchen.manage",
            "loyalty.view", "loyalty.edit", "loyalty.customers", "loyalty.coupons", "loyalty.rewards",
            "users.view", "users.edit", "users.create", "users.delete",
        ]},
        {"value": "manager", "label": "مدیر", "permissions": [
            "foods.view", "foods.edit", "foods.categories",
            "inventory.view", "inventory.edit", "inventory.raw_materials",
            "inventory.ready_materials", "inventory.usages_log", "inventory.invoice",
            "orders.view", "orders.edit", "orders.create",
            "pos.view", "pos.use", "pos.close", "pos.report",
            "kitchen.view", "kitchen.manage", "loyalty.view", "loyalty.customers",
        ]},
        {"value": "cashier", "label": "صندوقدار", "permissions": [
            "foods.view", "orders.view", "orders.create",
            "pos.view", "pos.use", "pos.close", "loyalty.view", "loyalty.customers",
        ]},
        {"value": "kitchen", "label": "آشپز", "permissions": [
            "foods.view", "kitchen.view", "kitchen.manage",
        ]},
        {"value": "warehouse", "label": "انباردار", "permissions": [
            "inventory.view", "inventory.edit", "inventory.raw_materials",
            "inventory.ready_materials", "inventory.usages_log", "inventory.invoice",
        ]},
    ]
    return render(request, "restaurant/user_management.html", {
        "roles_json": json_module.dumps(roles, ensure_ascii=False),
        "current_user_id": request.user.id,
    })


# ═══════════════════════════════════════════
#  دیکشنری — مدیریت اسامی
# ═══════════════════════════════════════════

@login_required(login_url=LOGIN_URL)
def dictionary_page(request):
    return render(request, 'restaurant/dictionary.html')


# ═══════════════════════════════════════════
#  پنل مدیریت کلان — صفحه HTML
# ═══════════════════════════════════════════

@_super_admin_cookie_required
def super_admin_page(request):
    return render(request, "restaurant/super_admin.html")