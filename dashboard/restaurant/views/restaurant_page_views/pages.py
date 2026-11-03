"""
صفحات HTML — ورود، خانه، داشبورد، کاربران، دیکشنری، رسید
"""
import json as json_module
import logging

from django.conf import settings
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.http import HttpRequest
from django.shortcuts import redirect, render

from ...models import Order
from ..decorators import require_service
from ..common import get_restaurant_object_or_404, resolve_restaurant

logger = logging.getLogger(__name__)


LOGIN_URL = '/dashboard/'


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
#  صندوق فروش
# ═══════════════════════════════════════════

@require_service('pos')
def pos_receipt(request: HttpRequest, pk: int):
    restaurant = resolve_restaurant(request)
    order = get_restaurant_object_or_404(Order, pk, restaurant)

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
            settings, "RESTAURANT_NAME", "کسب‌وکار",
        ),
        "restaurant_phone": getattr(settings, "RESTAURANT_PHONE", ""),
        "restaurant_address": getattr(settings, "RESTAURANT_ADDRESS", ""),
    })


@require_service('pos')
def orders_dashboard(request):
    restaurant = resolve_restaurant(request)
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
    restaurant = resolve_restaurant(request)
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
