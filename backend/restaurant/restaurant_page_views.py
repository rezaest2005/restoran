"""
Restaurant Management — Page Views
آدرس: /restaurant/dashboard/
هر صفحه extends base_restaurant.html
"""
from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import render


# ──────────────────────────────────────────────────────────────────────────────
#  Dashboard — صفحه اصلی مدیریت رستوران
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def restaurant_dashboard(request):
    """GET /restaurant/dashboard/ — داشبورد مدیریت رستوران"""
    return render(request, 'restaurant/dashboard.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Categories — دسته‌بندی‌ها
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def categories_page(request):
    """GET /restaurant/categories/ — صفحه دسته‌بندی‌ها"""
    return render(request, 'restaurant/categories.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Foods — غذاها و منو
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def foods_page(request):
    """GET /restaurant/foods/ — صفحه غذاها و منو"""
    return render(request, 'restaurant/foods.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Orders — سفارشات
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def orders_page(request):
    """GET /restaurant/orders/ — صفحه سفارشات"""
    return render(request, 'restaurant/orders.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Tables — میزها
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def tables_page(request):
    """GET /restaurant/tables/ — صفحه میزها"""
    return render(request, 'restaurant/tables.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Reservations — رزروها
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def reservations_page(request):
    """GET /restaurant/reservations/ — صفحه رزروها"""
    return render(request, 'restaurant/reservations.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Raw Materials — مواد اولیه
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def materials_page(request):
    """GET /restaurant/materials/ — صفحه مواد اولیه"""
    return render(request, 'restaurant/materials.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Warehouse — گزارش انبار
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def warehouse_page(request):
    """GET /restaurant/warehouse/ — صفحه گزارش انبار"""
    return render(request, 'restaurant/warehouse.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Purchase Invoices — فاکتورهای خرید
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def purchases_page(request):
    """GET /restaurant/purchases/ — صفحه فاکتورهای خرید"""
    return render(request, 'restaurant/purchases.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Semi-Finished — مواد نیم‌آماده
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def semi_finished_page(request):
    """GET /restaurant/semi-finished/ — صفحه مواد نیم‌آماده"""
    return render(request, 'restaurant/semi_finished.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Finished Products — محصولات نهایی
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def finished_products_page(request):
    """GET /restaurant/finished-products/ — صفحه محصولات نهایی"""
    return render(request, 'restaurant/finished_products.html')


# ──────────────────────────────────────────────────────────────────────────────
#  Usage Log — تاریخچه مصرف
# ──────────────────────────────────────────────────────────────────────────────
@staff_member_required
def usage_log_page(request):
    """GET /restaurant/usage-log/ — صفحه تاریخچه مصرف"""
    return render(request, 'restaurant/usage_log.html')
