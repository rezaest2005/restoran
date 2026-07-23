"""
Food & Category management API.
"""
import json as json_module
import logging

from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..models import Category, Food, PurchaseInvoiceItem
from .helpers import _build_foods_with_discounts

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_food_list(request):
    foods = Food.objects.all().select_related('category')
    category_id = request.query_params.get('category')
    if category_id:
        foods = foods.filter(category_id=category_id)
    data = []
    for food in foods:
        data.append({
            'id': food.id, 'name': food.name, 'description': '',
            'price': int(food.final_price), 'final_price': int(food.final_price),
            'image': food.image.url if food.image else '',
            'category': food.category_id,
            'category_name': food.category.name if food.category else '',
        })
    return Response(data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_category_list(request):
    categories = Category.objects.filter(is_active=True).order_by('order', 'name')
    data = []
    for cat in categories:
        data.append({
            'id': cat.id, 'name': cat.name,
            'image': cat.image.url if cat.image else '',
        })
    return Response(data)


@csrf_protect
@require_POST
def food_save(request: HttpRequest):
    try:
        pk = request.POST.get("id")
        name = request.POST.get("name", "").strip()
        category_id = request.POST.get("category")
        final_price = int(float(request.POST.get("final_price", 0)))

        if not name:
            return JsonResponse({"success": False, "error": "نام غذا الزامی است."})
        if not category_id:
            return JsonResponse({"success": False, "error": "دسته‌بندی الزامی است."})
        if final_price < 0:
            return JsonResponse({"success": False, "error": "قیمت نمی‌تواند منفی باشد."})

        if pk:
            food = Food.objects.get(pk=pk)
            food.name = name
            food.category_id = category_id
            food.final_price = final_price
            if "image" in request.FILES:
                food.image = request.FILES["image"]
            food.save()
            msg = "ویرایش شد."
        else:
            food = Food.objects.create(name=name, category_id=category_id, final_price=final_price)
            if "image" in request.FILES:
                food.image = request.FILES["image"]
                food.save()
            msg = "اضافه شد."

        return JsonResponse({
            "success": True, "msg": msg,
            "item": {
                "id": food.pk, "name": food.name,
                "category_id": food.category_id,
                "category_name": food.category.name,
                "final_price": int(food.final_price),
                "image": food.image.url if food.image else "",
            },
        })
    except Exception as exc:
        logger.exception("Error saving food")
        return JsonResponse({"success": False, "error": str(exc)})


@csrf_protect
@require_POST
def food_delete(request: HttpRequest):
    try:
        pk = request.POST.get("id")
        if not pk:
            return JsonResponse({"success": False, "error": "شناسه ارسال نشد."})
        food = Food.objects.get(pk=pk)
        name = food.name
        food.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting food")
        return JsonResponse({"success": False, "error": str(exc)})


def food_management_api(request: HttpRequest):
    foods_data, _ = _build_foods_with_discounts()
    return JsonResponse({"foods": foods_data})


@csrf_protect
@require_POST
def category_save(request: HttpRequest):
    try:
        pk = request.POST.get("id")
        name = request.POST.get("name", "").strip()
        order = int(request.POST.get("order", 0))
        if not name:
            return JsonResponse({"success": False, "error": "نام دسته‌بندی الزامی است."})
        if pk:
            cat = Category.objects.get(pk=pk)
            cat.name = name
            cat.order = order
            if "image" in request.FILES:
                cat.image = request.FILES["image"]
            cat.save()
            msg = "ویرایش شد."
        else:
            cat = Category.objects.create(name=name, order=order)
            if "image" in request.FILES:
                cat.image = request.FILES["image"]
                cat.save()
            msg = "اضافه شد."
        return JsonResponse({
            "success": True, "msg": msg,
            "item": {"id": cat.pk, "name": cat.name, "order": cat.order, "image": cat.image.url if cat.image else ""},
        })
    except Exception as exc:
        logger.exception("Error saving category")
        return JsonResponse({"success": False, "error": str(exc)})


@csrf_protect
@require_POST
def category_delete(request: HttpRequest):
    try:
        pk = request.POST.get("id")
        if not pk:
            return JsonResponse({"success": False, "error": "شناسه ارسال نشد."})
        cat = Category.objects.get(pk=pk)
        if cat.food_set.exists():
            return JsonResponse({"success": False, "error": f"دسته‌بندی «{cat.name}» دارای غذا است و قابل حذف نیست."})
        name = cat.name
        cat.delete()
        return JsonResponse({"success": True, "msg": f"«{name}» حذف شد."})
    except Exception as exc:
        logger.exception("Error deleting category")
        return JsonResponse({"success": False, "error": str(exc)})


def product_category_lookup(request):
    q = request.GET.get('q', '').strip()
    if len(q) < 2:
        return JsonResponse({})
    item = (
        PurchaseInvoiceItem.objects
        .filter(item_name__iexact=q, category__isnull=False)
        .select_related('category')
        .order_by('-invoice__created_at')
        .first()
    )
    if item and item.category:
        return JsonResponse({
            'found': True,
            'category_id': item.category.id,
            'category_name': item.category.name,
        })
    return JsonResponse({'found': False})