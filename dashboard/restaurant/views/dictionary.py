"""
Dictionary Views — API مدیریت دیکشنری اسامی + گروه‌ها
"""
import logging
from django.http import JsonResponse
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ..models import Food, Category, Restaurant
from ..tenancy import (
    get_current_restaurant, set_current_restaurant, get_restaurant_from_request
)

logger = logging.getLogger(__name__)
DictionaryPerm = IsAuthenticated

# ★★★ تابع پیدا کردن رستوران با قابلیت Fallback برای سوپرادمین ★★★
def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r

    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r

    if hasattr(request, "user") and request.user.is_authenticated:
        r = getattr(request.user, "restaurant", None)
        if r:
            set_current_restaurant(r)
            return r

    slug = request.headers.get("X-Tenant-Slug", "")
    if slug:
        r = Restaurant.objects.filter(slug=slug, is_active=True).first()
        if r:
            set_current_restaurant(r)
            return r

    # fallback: اولین رستوران فعال سیستم
    r = Restaurant.objects.filter(is_active=True).first()
    if r:
        set_current_restaurant(r)
        return r
        
    return None

def _serialize_group(g):
    return {
        "id": g.id, "name": g.name, "slug": g.slug, "icon": g.icon, "color": g.color,
        "sort_order": g.sort_order, "usage_recipes": g.usage_recipes, "usage_warehouse": g.usage_warehouse,
        "usage_pos": g.usage_pos, "usage_invoice": g.usage_invoice, "usage_kitchen": g.usage_kitchen,
        "is_system": g.is_system, "is_active": g.is_active, "item_count": g.item_count,
    }

def _serialize_dict_item(item):
    return {
        "id": item.id, "name": item.name, "unit": item.unit, "unit_display": item.get_unit_display(),
        "description": item.description or "", "category": item.category, "dict_category": item.dict_category or "",
        "material_type": getattr(item, "material_type", "raw") or "raw", "group": item.group_id,
    }

@api_view(["GET"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def raw_materials_api(request):
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [COMMENTED]     if not restaurant: return JsonResponse({"tabs": [], "items": []})
# [X] # [COMMENTED]     groups = DictionaryGroup.objects.filter(restaurant=restaurant, is_active=True, usage_invoice=True).order_by("sort_order", "name")
# [COMMENTED]     tabs = [{"id": g.id, "slug": g.slug, "name": g.name, "icon": g.icon, "color": g.color} for g in groups]
# [X] # [COMMENTED]     items_qs = ItemDictionary.objects.filter(restaurant=restaurant, is_active=True, group__isnull=False, group__is_active=True, group__usage_invoice=True).select_related("group").order_by("group__sort_order", "name")
# [COMMENTED]     items_data = [{"id": item.id, "name": item.name, "unit": item.unit, "description": item.description or "", "dict_category": item.dict_category or "", "material_type": getattr(item, "material_type", "raw") or "raw", "group": item.group_id, "group_slug": item.group.slug, "group_name": item.group.name, "group_color": item.group.color, "group_icon": item.group.icon} for item in items_qs]
# [COMMENTED]     return JsonResponse({"tabs": tabs, "items": items_data})
# [COMMENTED] 
@api_view(["GET"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def dictionary_group_list(request):
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [X] # [COMMENTED]     qs = DictionaryGroup.objects.filter(is_active=True)
# [COMMENTED]     if restaurant: qs = qs.filter(restaurant=restaurant)
# [COMMENTED]     groups = [_serialize_group(g) for g in qs.order_by("sort_order", "name")]
# [COMMENTED]     return JsonResponse({"groups": groups})
# [COMMENTED] 
@api_view(["POST"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def dictionary_group_save(request):
# [COMMENTED]     data = request.data
# [COMMENTED]     group_id = data.get("id"); name = (data.get("name") or "").strip(); slug = (data.get("slug") or "").strip()
# [COMMENTED]     icon = (data.get("icon") or "bi-archive").strip(); color = (data.get("color") or "#6b7280").strip()
# [COMMENTED]     sort_order = int(data.get("sort_order", 0))
# [COMMENTED]     usage_recipes = bool(data.get("usage_recipes", False)); usage_warehouse = bool(data.get("usage_warehouse", False))
# [COMMENTED]     usage_pos = bool(data.get("usage_pos", False)); usage_invoice = bool(data.get("usage_invoice", False)); usage_kitchen = bool(data.get("usage_kitchen", False))
# [COMMENTED]     if not name: return JsonResponse({"error": "نام گروه الزامی است"}, status=400)
# [COMMENTED]     if not slug: slug = "group_" + str(abs(hash(name)) % 0xFFFFFF)
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [COMMENTED]     if not restaurant: return JsonResponse({"error": "رستوران مشخص نشده"}, status=400)
# [COMMENTED]     if group_id:
# [X] # [COMMENTED]         try: g = DictionaryGroup.objects.get(id=group_id, restaurant=restaurant)
# [X] # [COMMENTED]         except DictionaryGroup.DoesNotExist: return JsonResponse({"error": "گروه یافت نشد"}, status=404)
# [COMMENTED]         if g.is_system:
# [COMMENTED]             g.usage_recipes = usage_recipes; g.usage_warehouse = usage_warehouse; g.usage_pos = usage_pos; g.usage_invoice = usage_invoice; g.usage_kitchen = usage_kitchen
# [COMMENTED]             g.save()
# [COMMENTED]             return JsonResponse({"group": _serialize_group(g), "message": "تنظیمات گروه سیستمی بروزرسانی شد"})
# [COMMENTED]         g.name = name; g.slug = slug; g.icon = icon; g.color = color; g.sort_order = sort_order
# [COMMENTED]         g.usage_recipes = usage_recipes; g.usage_warehouse = usage_warehouse; g.usage_pos = usage_pos; g.usage_invoice = usage_invoice; g.usage_kitchen = usage_kitchen
# [COMMENTED]         g.save()
# [COMMENTED]         return JsonResponse({"group": _serialize_group(g), "message": "گروه ویرایش شد"})
# [X] # [COMMENTED]     if DictionaryGroup.objects.filter(restaurant=restaurant, slug=slug).exists():
# [X] # [COMMENTED]         slug = f"{slug}_{DictionaryGroup.objects.filter(restaurant=restaurant).count()}"
# [X] # [COMMENTED]     g = DictionaryGroup.objects.create(restaurant=restaurant, name=name, slug=slug, icon=icon, color=color, sort_order=sort_order, usage_recipes=usage_recipes, usage_warehouse=usage_warehouse, usage_pos=usage_pos, usage_invoice=usage_invoice, usage_kitchen=usage_kitchen, is_system=False)
# [COMMENTED]     return JsonResponse({"group": _serialize_group(g), "message": "گروه جدید ساخته شد"})
# [COMMENTED] 
@api_view(["POST"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def dictionary_group_delete(request):
# [COMMENTED]     group_id = request.data.get("id")
# [COMMENTED]     if not group_id: return JsonResponse({"error": "شناسه گروه الزامی است"}, status=400)
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [COMMENTED]     try:
# [X] # [COMMENTED]         g = DictionaryGroup.objects.get(id=group_id)
# [COMMENTED]         if restaurant and g.restaurant_id != restaurant.id: return JsonResponse({"error": "گروه یافت نشد"}, status=404)
# [X] # [COMMENTED]     except DictionaryGroup.DoesNotExist: return JsonResponse({"error": "گروه یافت نشد"}, status=404)
# [COMMENTED]     if g.is_system: return JsonResponse({"error": "گروه سیستمی قابل حذف نیست"}, status=400)
# [X] # [COMMENTED]     deleted_count = ItemDictionary.objects.filter(group=g).count()
# [COMMENTED]     group_name = g.name
# [COMMENTED]     logger.info("Deleting group '%s' (id=%s) with %s items by user %s", group_name, g.id, deleted_count, request.user.username)
# [X] # [COMMENTED]     ItemDictionary.objects.filter(group=g).delete()
# [COMMENTED]     g.delete()
# [COMMENTED]     return JsonResponse({"message": f"گروه «{group_name}» و {deleted_count} آیتم حذف شد"})
# [COMMENTED] 
@api_view(["GET"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def dictionary_list(request):
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [COMMENTED]     category = request.GET.get("category", "")
# [X] # [COMMENTED]     qs = ItemDictionary.objects.filter(is_active=True)
# [COMMENTED]     if restaurant: qs = qs.filter(restaurant=restaurant)
# [COMMENTED]     if category: qs = qs.filter(category=category)
# [COMMENTED]     data = [_serialize_dict_item(item) for item in qs]
# [COMMENTED]     return JsonResponse({"items": data})
# [COMMENTED] 
@api_view(["GET"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def dictionary_autocomplete(request):
# [COMMENTED]     q = request.GET.get("q", "").strip()
# [COMMENTED]     category = request.GET.get("category", "")
# [COMMENTED]     if len(q) < 1: return JsonResponse({"items": []})
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [X] # [COMMENTED]     qs = ItemDictionary.objects.filter(name__icontains=q, is_active=True)
# [COMMENTED]     if restaurant: qs = qs.filter(restaurant=restaurant)
# [COMMENTED]     if category: qs = qs.filter(category=category)
# [COMMENTED]     data = [_serialize_dict_item(item) for item in qs[:15]]
# [COMMENTED]     return JsonResponse({"items": data})
# [COMMENTED] 
@api_view(["POST"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def dictionary_create(request):
# [COMMENTED]     data = request.data
# [COMMENTED]     name = (data.get("name") or "").strip(); unit = (data.get("unit") or "").strip()
# [COMMENTED]     category = (data.get("category") or "").strip(); desc = (data.get("description") or "").strip()
# [COMMENTED]     dict_category = (data.get("dict_category") or "").strip(); material_type = (data.get("material_type") or "raw").strip()
# [COMMENTED]     group_id = data.get("group_id")
# [COMMENTED]     if not name or not unit or not category: return JsonResponse({"error": "نام، واحد و دسته‌بندی الزامی است"}, status=400)
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [COMMENTED]     if not restaurant: return JsonResponse({"error": "رستوران مشخص نشده"}, status=400)
# [X] # [COMMENTED]     if ItemDictionary.objects.filter(name=name, category=category, restaurant=restaurant).exists():
# [COMMENTED]         return JsonResponse({"error": "این اسم قبلاً در این دسته‌بندی ثبت شده"}, status=400)
# [COMMENTED]     group = None
# [X] # [COMMENTED]     if group_id: group = DictionaryGroup.objects.filter(id=group_id, restaurant=restaurant).first()
# [COMMENTED]     try:
# [X] # [COMMENTED]         item = ItemDictionary.objects.create(restaurant=restaurant, name=name, unit=unit, category=category, description=desc, dict_category=dict_category, material_type=material_type, group=group)
# [COMMENTED]         return JsonResponse(_serialize_dict_item(item), status=201)
# [COMMENTED]     except Exception as e:
# [COMMENTED]         logger.exception("Error creating dictionary item")
# [COMMENTED]         return JsonResponse({"error": str(e)}, status=500)
# [COMMENTED] 
@api_view(["POST"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def dictionary_update(request, pk):
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [COMMENTED]     try:
# [X] # [COMMENTED]         qs = ItemDictionary.objects.all()
# [COMMENTED]         if restaurant: qs = qs.filter(restaurant=restaurant)
# [COMMENTED]         item = qs.get(pk=pk)
# [X] # [COMMENTED]     except ItemDictionary.DoesNotExist: return JsonResponse({"error": "آیتم یافت نشد"}, status=404)
# [COMMENTED]     data = request.data
# [COMMENTED]     if "name" in data: item.name = (data["name"] or "").strip()
# [COMMENTED]     if "unit" in data: item.unit = (data["unit"] or "").strip()
# [COMMENTED]     if "description" in data: item.description = (data["description"] or "").strip()
# [COMMENTED]     if "dict_category" in data: item.dict_category = (data["dict_category"] or "").strip()
# [COMMENTED]     if "material_type" in data: item.material_type = (data.get("material_type") or "raw").strip()
# [COMMENTED]     if "group_id" in data:
# [COMMENTED]         gid = data.get("group_id")
# [X] # [COMMENTED]         if gid and restaurant: item.group = DictionaryGroup.objects.filter(id=gid, restaurant=restaurant).first()
# [COMMENTED]         elif not gid: item.group = None
# [COMMENTED]     item.save()
# [COMMENTED]     return JsonResponse(_serialize_dict_item(item))
# [COMMENTED] 
@api_view(["POST"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def dictionary_delete(request, pk):
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [COMMENTED]     try:
# [X] # [COMMENTED]         qs = ItemDictionary.objects.all()
# [COMMENTED]         if restaurant: qs = qs.filter(restaurant=restaurant)
# [COMMENTED]         item = qs.get(pk=pk)
# [X] # [COMMENTED]     except ItemDictionary.DoesNotExist: return JsonResponse({"error": "آیتم یافت نشد"}, status=404)
# [COMMENTED]     name = item.name
# [COMMENTED]     item.delete()
# [COMMENTED]     return JsonResponse({"success": True, "msg": f"آیتم «{name}» حذف شد"})
# [COMMENTED] 
# [COMMENTED] def _dict_list_by_category(request, category):
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [X] # [COMMENTED]     qs = ItemDictionary.objects.filter(category=category, is_active=True)
# [COMMENTED]     if restaurant: qs = qs.filter(restaurant=restaurant)
# [COMMENTED]     data = [_serialize_dict_item(item) for item in qs]
# [COMMENTED]     return JsonResponse({"items": data})
# [COMMENTED] 
@api_view(["GET"])
@permission_classes([DictionaryPerm])
def dictionary_raw_materials(request): return _dict_list_by_category(request, "raw_material")

@api_view(["GET"])
@permission_classes([DictionaryPerm])
def dictionary_semi_finished(request): return _dict_list_by_category(request, "semi_finished")

@api_view(["GET"])
@permission_classes([DictionaryPerm])
def dictionary_ready_materials(request): return _dict_list_by_category(request, "ready_material")

@api_view(["GET"])
@permission_classes([DictionaryPerm])
def dictionary_food_menu(request):
    restaurant = _resolve_restaurant(request)
    qs = Food.objects.all()
    if restaurant: qs = qs.filter(restaurant=restaurant)
    cats_qs = Category.objects.all()
    if restaurant: cats_qs = cats_qs.filter(restaurant=restaurant)
    categories = {c.id: c.name for c in cats_qs}
    categories_en = {c.id: (c.name_en or "") for c in cats_qs}
    items = [{"id": f.id, "name": f.name, "name_en": f.name_en or "", "price": int(f.price or 0), "final_price": int(f.final_price or 0), "category_id": f.category_id, "category_name": categories.get(f.category_id, ""), "category_name_en": categories_en.get(f.category_id, ""), "is_available": f.is_available, "stock": f.stock} for f in qs.order_by("name")]
    return JsonResponse({"items": items})

@api_view(["POST"])
@permission_classes([DictionaryPerm])
def dictionary_food_create(request):
    data = request.data
    name = (data.get("name") or "").strip()
    if not name: return JsonResponse({"error": "نام غذا الزامی است"}, status=400)
    restaurant = _resolve_restaurant(request)
    if not restaurant: return JsonResponse({"error": "رستوران مشخص نشده"}, status=400)
    cat_name = (data.get("category_name") or "").strip()
    cat_name_en = (data.get("category_name_en") or "").strip()
    category = None
    if cat_name:
        category, created = Category.objects.get_or_create(restaurant=restaurant, name=cat_name, defaults={"is_active": True, "order": 0, "name_en": cat_name_en})
        if not created and cat_name_en:
            category.name_en = cat_name_en
            category.save(update_fields=["name_en"])
    price = int(data.get("price", 0))
    final_price = int(data.get("final_price", price))
    stock = int(data.get("stock", 0))
    food_name_en = (data.get("name_en") or "").strip()
    food = Food.objects.create(restaurant=restaurant, name=name, name_en=food_name_en, category=category, price=price, final_price=final_price, stock=stock, is_available=data.get("is_available", True))
    return JsonResponse({"id": food.id, "name": food.name, "name_en": food.name_en or "", "price": int(food.price), "final_price": int(food.final_price), "category_id": food.category_id, "category_name": food.category.name if food.category else "", "category_name_en": food.category.name_en if food.category else "", "is_available": food.is_available, "stock": food.stock}, status=201)

@api_view(["POST"])
@permission_classes([DictionaryPerm])
def dictionary_food_update(request, pk):
    restaurant = _resolve_restaurant(request)
    try:
        qs = Food.objects.all()
        if restaurant: qs = qs.filter(restaurant=restaurant)
        food = qs.get(pk=pk)
    except Food.DoesNotExist: return JsonResponse({"error": "غذا یافت نشد"}, status=404)
    data = request.data
    if "name" in data: food.name = (data["name"] or "").strip()
    if "name_en" in data: food.name_en = (data["name_en"] or "").strip()
    if "price" in data: food.price = max(0, int(data["price"]))
    if "final_price" in data: food.final_price = max(0, int(data["final_price"]))
    elif "price" in data: food.final_price = food.price
    if "is_available" in data: food.is_available = bool(data["is_available"])
    if "stock" in data: food.stock = max(0, int(data["stock"]))
    if "category_name" in data:
        cat_name = (data["category_name"] or "").strip()
        cat_name_en = (data.get("category_name_en") or "").strip()
        if cat_name and restaurant:
            category, created = Category.objects.get_or_create(restaurant=restaurant, name=cat_name, defaults={"is_active": True, "order": 0, "name_en": cat_name_en})
            if not created and cat_name_en:
                category.name_en = cat_name_en
                category.save(update_fields=["name_en"])
            food.category = category
        elif not cat_name: food.category = None
    food.save()
    return JsonResponse({"id": food.id, "name": food.name, "name_en": food.name_en or "", "price": int(food.price), "final_price": int(food.final_price), "category_id": food.category_id, "category_name": food.category.name if food.category else "", "category_name_en": food.category.name_en if food.category else "", "is_available": food.is_available, "stock": food.stock})

@api_view(["POST"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def dictionary_food_delete(request, pk):
# [COMMENTED]     from ..models import   # removed
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [COMMENTED]     try:
# [COMMENTED]         qs = Food.objects.all()
# [COMMENTED]         if restaurant: qs = qs.filter(restaurant=restaurant)
# [COMMENTED]         food = qs.get(pk=pk)
# [COMMENTED]     except Food.DoesNotExist: return JsonResponse({"error": "غذا یافت نشد"}, status=404)
# [COMMENTED]     deleted = {"food": food.name, "recipes": 0, "kitchen_products": 0}
# [COMMENTED]     try:
# [X] # [COMMENTED]         recipe = Recipe.objects.get(food=food)
# [X] # [COMMENTED]         kps = KitchenProduct.objects.filter(recipe=recipe)
# [COMMENTED]         deleted["kitchen_products"] = kps.count()
# [COMMENTED]         kps.delete()
# [COMMENTED]         recipe.delete()
# [COMMENTED]         deleted["recipes"] = 1
# [X] # [COMMENTED]     except Recipe.DoesNotExist: pass
# [COMMENTED]     logger.info("Deleting food '%s' (id=%s) by user %s: %s recipes, %s kitchen products", food.name, pk, request.user.username, deleted["recipes"], deleted["kitchen_products"])
# [COMMENTED]     food.delete()
# [COMMENTED]     parts = [f"غذا «{deleted['food']}»"]
# [COMMENTED]     if deleted["recipes"]: parts.append(f"{deleted['recipes']} دستور پخت")
# [COMMENTED]     if deleted["kitchen_products"]: parts.append(f"{deleted['kitchen_products']} محصول آشپزخانه")
# [COMMENTED]     return JsonResponse({"success": True, "message": " و ".join(parts) + " حذف شد"})
# [COMMENTED] 
@api_view(["GET"])
@permission_classes([DictionaryPerm])
# [COMMENTED] def dictionary_recipe_materials_api(request):
# [COMMENTED]     restaurant = _resolve_restaurant(request)
# [COMMENTED]     if not restaurant: return JsonResponse({"items": []})
# [X] # [COMMENTED]     items_qs = ItemDictionary.objects.filter(restaurant=restaurant, is_active=True, category="semi_finished", group__isnull=False, group__is_active=True, group__usage_recipes=True).select_related("group").order_by("group__sort_order", "name")
# [COMMENTED]     items_data = [{"id": item.id, "name": item.name, "unit": item.unit, "unit_display": item.get_unit_display(), "description": item.description or "", "dict_category": item.dict_category or "", "group": item.group_id, "group_name": item.group.name if item.group else ""} for item in items_qs]
# [COMMENTED]     return JsonResponse({"items": items_data})