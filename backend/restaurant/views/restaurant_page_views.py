"""
Restaurant Management — Page Views
تمام رندرهای HTML اینجا — هر صفحه extends base template
"""
import json as json_module
import logging

from django.conf import settings
from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth.decorators import login_required
from django.http import HttpRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import csrf_protect

from ..models import (
    Category, RawMaterial, SemiFinished, ReadyMaterial,
    Food, Supplier, PurchaseInvoice, InventoryUsageLog,
    Order, LoyaltyNotification, KitchenProduct, Recipe,
)
from .helpers import (
    _build_foods_with_discounts, _merge_warehouse_data,
    _build_invoice_from_post, _attach_invoice_items,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════
#  عمومی — لاگین، خروج، داشبورد
# ═══════════════════════════════════════════

@login_required
def home(request: HttpRequest):
    return render(request, "admin/index.html")


def auth_page(request: HttpRequest):
    if request.user.is_authenticated:
        return redirect("home")
    return render(request, "auth.html")


@login_required
def logout_page(request: HttpRequest):
    from django.contrib.auth import logout
    logout(request)
    return redirect("auth_page")


# ═══════════════════════════════════════════
#  فاکتور خرید — لیست، جزئیات، ایجاد
# ═══════════════════════════════════════════

@staff_member_required
def purchase_invoice_list(request: HttpRequest):
    invoices = PurchaseInvoice.objects.all().order_by("-date")
    return render(request, "restaurant/invoice_list.html", {"invoices": invoices})


@staff_member_required
def purchase_invoice_detail(request: HttpRequest, pk: int):
    invoice = get_object_or_404(PurchaseInvoice, pk=pk)
    return render(request, "restaurant/invoice_detail.html", {"invoice": invoice})


@csrf_protect
@staff_member_required
def create_purchase_invoice(request: HttpRequest):
    if request.method == "POST":
        try:
            invoice = _build_invoice_from_post(request)
            created = _attach_invoice_items(invoice, request.POST)
            messages.success(request, f"فاکتور خرید با {created} قلم کالا ثبت شد.")
            return redirect("/admin/restaurant/purchaseinvoice/")
        except ValueError as exc:
            messages.error(request, str(exc))
        except Exception as exc:
            logger.exception("Error creating purchase invoice")
            messages.error(request, f"خطا در ثبت فاکتور: {exc}")
    categories = Category.objects.filter(is_active=True).order_by('order')
    categories_json = json_module.dumps(
        [{'id': c.id, 'name': c.name} for c in categories], ensure_ascii=False
    )
    return render(request, "restaurant/create_invoice.html", {
        "unit_choices": RawMaterial.UNIT_CHOICES,
        "categories_json": categories_json,
    })


@staff_member_required
def create_invoice_view(request: HttpRequest):
    categories = Category.objects.filter(is_active=True).order_by('order')
    categories_json = json_module.dumps(
        [{'id': c.id, 'name': c.name} for c in categories], ensure_ascii=False
    )
    return render(request, "restaurant/create_invoice.html", {
        "unit_choices": RawMaterial.UNIT_CHOICES,
        "categories_json": categories_json,
    })


# ═══════════════════════════════════════════
#  انبار — مواد اولیه، نیم‌آماده، مصرف
# ═══════════════════════════════════════════

@staff_member_required
def raw_materials_view(request: HttpRequest):
    return render(request, "restaurant/raw_materials.html", {
        "materials": RawMaterial.objects.all().order_by("name"),
        "unit_choices": RawMaterial.UNIT_CHOICES,
    })


@staff_member_required
def semi_finished_view(request: HttpRequest):
    semi_finished_list = SemiFinished.objects.prefetch_related("ingredients__raw_material").all()
    raw_materials = RawMaterial.objects.all()
    merged = _merge_warehouse_data()
    raw_materials_json = json_module.dumps(
        sorted(merged.values(), key=lambda x: x["name"]), ensure_ascii=False,
    )
    return render(request, "restaurant/semi_finished.html", {
        "semi_finished_list": semi_finished_list,
        "raw_materials": raw_materials,
        "raw_materials_json": raw_materials_json,
    })


@staff_member_required
def usage_log_view(request: HttpRequest):
    semi_finished_list = SemiFinished.objects.prefetch_related(
        "ingredients__raw_material"
    ).all().order_by("name")
    total_logs = InventoryUsageLog.objects.count()
    by_type = {}
    for choice_val, choice_label in InventoryUsageLog.USAGE_TYPE_CHOICES:
        by_type[choice_val] = {
            "label": choice_label,
            "count": InventoryUsageLog.objects.filter(usage_type=choice_val).count(),
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
    suppliers = Supplier.objects.all().order_by("name")
    return render(request, "restaurant/usage_log.html", {
        "semi_finished_list": semi_finished_list,
        "semi_finished_json": json_module.dumps(semi_finished_data, ensure_ascii=False),
        "total_logs": total_logs,
        "by_type": by_type,
        "type_choices": InventoryUsageLog.USAGE_TYPE_CHOICES,
        "suppliers": suppliers,
        "order_stats": {"total_orders": 0, "total_revenue": 0, "top_foods": []},
    })


@staff_member_required
def ready_materials_page(request: HttpRequest):
    return render(request, 'restaurant/ready_materials.html', {
        'ready_materials': ReadyMaterial.objects.select_related('supplier', 'category').all(),
        'suppliers': Supplier.objects.all(),
        'unit_choices': ReadyMaterial.UNIT_CHOICES,
        'raw_materials': RawMaterial.objects.all().order_by('name'),
        'categories': Category.objects.filter(is_active=True).order_by('order'),
    })


# ═══════════════════════════════════════════
#  آشپزخانه — داشبورد تولید
# ═══════════════════════════════════════════

@staff_member_required
def kitchen_page(request: HttpRequest):
    from django.db.models import F
    recipes = list(Recipe.objects.values("id").annotate(name=F("food__name")))
    categories = list(KitchenProduct.CATEGORY_CHOICES)

    foods_list = []
    for f in Food.objects.select_related('category').all().order_by('category__order', 'name'):
        foods_list.append({
            'id': f.id, 'name': f.name, 'category_id': f.category_id,
            'category_name': f.category.name, 'final_price': int(f.final_price),
            'image': f.image.url if f.image else '',
            'is_ready': False, 'purchase_price': 0,
        })

    food_cats = list(
        Category.objects.filter(is_active=True).order_by('order').values('id', 'name')
    )
    existing_names = {c['name'] for c in food_cats}

    ready_materials = ReadyMaterial.objects.filter(
        quantity__gt=0
    ).exclude(category__isnull=True).select_related('category')
    for rm in ready_materials:
        foods_list.append({
            'id': f'ready_{rm.id}', 'name': rm.name,
            'category_id': rm.category_id, 'category_name': rm.category.name,
            'final_price': int(rm.selling_price or 0), 'image': '',
            'is_ready': True, 'purchase_price': int(rm.purchase_price or 0),
        })
        if rm.category.name not in existing_names:
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

@staff_member_required
def pos_page(request: HttpRequest):
    foods_data, cats_data = _build_foods_with_discounts()
    existing_names = {c['name']: c['id'] for c in cats_data}

    for food_item in foods_data:
        if food_item.get('is_ready'):
            continue
        stock = 0
        kp = KitchenProduct.objects.filter(name=food_item['name']).first()
        if kp:
            try:
                inv = kp.get_inventory()
                if inv:
                    stock = inv.available_quantity or 0
            except Exception:
                stock = 0
        food_item['stock'] = stock

    ready_materials = ReadyMaterial.objects.filter(quantity__gt=0).select_related('category')
    for rm in ready_materials:
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

    if any(not rm.category for rm in ready_materials) and 'سایر' not in existing_names:
        cats_data.append({'id': -99, 'name': 'سایر'})

    return render(request, 'restaurant/pos.html', {
        'foods_json': json_module.dumps(foods_data, ensure_ascii=False),
        'categories_json': json_module.dumps(cats_data, ensure_ascii=False),
    })


@staff_member_required
def pos_receipt(request: HttpRequest, pk: int):
    order = get_object_or_404(Order, pk=pk)
    items = []
    for item in order.items.select_related("food").all():
        price = int(item.price)
        qty = item.quantity
        items.append({
            "food_name": item.food.name if item.food else "—",
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


# ═══════════════════════════════════════════
#  مدیریت غذا و سفارشات
# ═══════════════════════════════════════════

@staff_member_required
def food_management_page(request: HttpRequest):
    foods_data, categories_data = _build_foods_with_discounts()
    return render(request, "restaurant/food_management.html", {
        "foods_json": json_module.dumps(foods_data, ensure_ascii=False),
        "categories_json": json_module.dumps(categories_data, ensure_ascii=False),
    })


@staff_member_required
def orders_dashboard(request):
    orders = Order.objects.prefetch_related('items__food').order_by('-created_at')
    pending = preparing = ready = 0
    for o in orders:
        if o.status == 'pending':
            pending += 1
        elif o.status == 'preparing':
            preparing += 1
        elif o.status == 'ready':
            ready += 1
    return render(request, 'restaurant/orders_dashboard.html', {
        'orders': orders, 'pending_count': pending,
        'preparing_count': preparing, 'ready_count': ready,
    })


# ═══════════════════════════════════════════
#  رسپی — مدیریت دستورات
# ═══════════════════════════════════════════

@staff_member_required
def recipe_manager_page(request):
    return render(request, 'recipes/recipe_manager.html')


# ═══════════════════════════════════════════
#  باشگاه مشتریان — داشبورد و صفحات
# ═══════════════════════════════════════════

@staff_member_required
def loyalty_dashboard_page(request: HttpRequest):
    from ..services import get_loyalty_dashboard
    return render(request, "loyalty/dashboard.html", {"stats": get_loyalty_dashboard()})


@staff_member_required
def loyalty_customers_page(request: HttpRequest):
    return render(request, "loyalty/customers.html")


@staff_member_required
def loyalty_customer_detail_page(request: HttpRequest, pk: int):
    return render(request, "loyalty/customer_detail.html")


@staff_member_required
def loyalty_coupons_page(request: HttpRequest):
    return render(request, "loyalty/coupons.html")


@staff_member_required
def loyalty_rewards_page(request: HttpRequest):
    return render(request, "loyalty/rewards.html")


@staff_member_required
def loyalty_notifications_page(request: HttpRequest):
    return render(request, "loyalty/notifications.html", {
        "unread_notifications": LoyaltyNotification.objects.filter(is_read=False).count(),
    })


@staff_member_required
def loyalty_register_page(request: HttpRequest):
    return render(request, "loyalty/register.html")


# ═══════════════════════════════════════════
#  مدیریت کاربران — نقش‌ها و مجوزها
# ═══════════════════════════════════════════

@staff_member_required
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
        {"value": "waiter", "label": "پیشخدمت", "permissions": [
            "foods.view", "orders.view", "orders.create",
        ]},
    ]
    return render(request, "restaurant/user_management.html", {
        "roles_json": json_module.dumps(roles, ensure_ascii=False),
        "current_user_id": request.user.id,
    })


# ═══════════════════════════════════════════
#  دیکشنری — مدیریت اسامی
# ═══════════════════════════════════════════

@login_required
def dictionary_page(request):
    return render(request, 'restaurant/dictionary.html')