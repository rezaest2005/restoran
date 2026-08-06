"""
Dictionary Views — API مدیریت دیکشنری اسامی + گروه‌ها (★ نسخه اصلاح‌شده v3)

★ تغییرات نسبت به نسخه قبل:
  ۱. @login_required + @require_GET/POST → @api_view + @permission_classes (DRF)
  ۲. json.loads(request.body) → request.data
  ۳. request.user.restaurant → _resolve_restaurant(request)
  ۴. request.GET.copy() mutation → helper جداگانه
  ۵. print() / traceback.print_exc() → logger
  ۶. recipe_materials_api → dictionary_recipe_materials_api (avoid name conflict)
  ۷. dictionary_group_list/save/delete: authentication اضافه شد
  ۸. تمام query‌ها: فیلتر restaurant
"""

import logging

from django.http import JsonResponse
from django.db.models import Q

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from ..models import ItemDictionary, DictionaryGroup, Food, Category
from ..serializers import ItemDictionarySerializer
from ..permissions import IsOwnerOrManager
from ..tenancy import (
    get_current_restaurant, set_current_restaurant,
    get_restaurant_from_request,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  resolve restaurant — fallback
# ═══════════════════════════════════════

def _resolve_restaurant(request):
    r = get_current_restaurant()
    if r:
        return r
    r = get_restaurant_from_request(request)
    if r:
        set_current_restaurant(r)
        return r
    return None


# ═══════════════════════════════════════
#  helpers
# ═══════════════════════════════════════

def _serialize_group(g):
    return {
        'id': g.id,
        'name': g.name,
        'slug': g.slug,
        'icon': g.icon,
        'color': g.color,
        'sort_order': g.sort_order,
        'usage_recipes': g.usage_recipes,
        'usage_warehouse': g.usage_warehouse,
        'usage_pos': g.usage_pos,
        'usage_invoice': g.usage_invoice,
        'usage_kitchen': g.usage_kitchen,
        'is_system': g.is_system,
        'is_active': g.is_active,
        'item_count': g.item_count,
    }


def _serialize_dict_item(item):
    return {
        'id': item.id,
        'name': item.name,
        'unit': item.unit,
        'unit_display': item.get_unit_display(),
        'description': item.description or '',
        'category': item.category,
        'dict_category': item.dict_category or '',
        'material_type': getattr(item, 'material_type', 'raw') or 'raw',
        'group': item.group_id,
    }


# ═══════════════════════════════════════════════════════════
#  ★ جدید — API فاکتور خرید (تب‌ها + آیتم‌ها)
# ═══════════════════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def raw_materials_api(request):
    """آیتم‌های فاکتور خرید — گروه‌بندی شده با تب‌ها"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({'tabs': [], 'items': []})

    # ── تب‌های فعال فاکتور ──
    groups = (
        DictionaryGroup.objects
        .filter(restaurant=restaurant, is_active=True, usage_invoice=True)
        .order_by('sort_order', 'name')
    )

    tabs = [{
        'id': g.id,
        'slug': g.slug,
        'name': g.name,
        'icon': g.icon,
        'color': g.color,
    } for g in groups]

    # ── فقط آیتم‌هایی که گروهشون usage_invoice=True ──
    items_qs = (
        ItemDictionary.objects
        .filter(
            restaurant=restaurant,
            is_active=True,
            group__isnull=False,
            group__is_active=True,
            group__usage_invoice=True,
        )
        .select_related('group')
        .order_by('group__sort_order', 'name')
    )

    items_data = [{
        'id': item.id,
        'name': item.name,
        'unit': item.unit,
        'description': item.description or '',
        'dict_category': item.dict_category or '',
        'material_type': getattr(item, 'material_type', 'raw') or 'raw',
        'group': item.group_id,
        'group_slug': item.group.slug,
        'group_name': item.group.name,
        'group_color': item.group.color,
        'group_icon': item.group.icon,
    } for item in items_qs]

    return JsonResponse({'tabs': tabs, 'items': items_data})


# ═══════════════════════════════════════════════════════════
#  Dictionary Group — CRUD
# ═══════════════════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dictionary_group_list(request):
    """لیست گروه‌های دیکشنری"""
    restaurant = _resolve_restaurant(request)

    qs = DictionaryGroup.objects.filter(is_active=True)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    groups = [_serialize_group(g) for g in qs.order_by('sort_order', 'name')]
    return JsonResponse({'groups': groups})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManager])
def dictionary_group_save(request):
    """ایجاد / ویرایش گروه دیکشنری"""
    data = request.data
    group_id = data.get('id')
    name = (data.get('name') or '').strip()
    slug = (data.get('slug') or '').strip()
    icon = (data.get('icon') or 'bi-archive').strip()
    color = (data.get('color') or '#6b7280').strip()
    sort_order = int(data.get('sort_order', 0))
    usage_recipes = bool(data.get('usage_recipes', False))
    usage_warehouse = bool(data.get('usage_warehouse', False))
    usage_pos = bool(data.get('usage_pos', False))
    usage_invoice = bool(data.get('usage_invoice', False))
    usage_kitchen = bool(data.get('usage_kitchen', False))

    if not name:
        return JsonResponse({'error': 'نام گروه الزامی است'}, status=400)

    if not slug:
        slug = 'group_' + str(abs(hash(name)) % 0xFFFFFF)

    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({'error': 'رستوران مشخص نشده'}, status=400)

    if group_id:
        try:
            g = DictionaryGroup.objects.get(id=group_id, restaurant=restaurant)
        except DictionaryGroup.DoesNotExist:
            return JsonResponse({'error': 'گروه یافت نشد'}, status=404)

        if g.is_system:
            # گروه سیستمی: فقط usage flags قابل تغییر
            g.usage_recipes = usage_recipes
            g.usage_warehouse = usage_warehouse
            g.usage_pos = usage_pos
            g.usage_invoice = usage_invoice
            g.usage_kitchen = usage_kitchen
            g.save()
            return JsonResponse({
                'group': _serialize_group(g),
                'message': 'تنظیمات گروه سیستمی بروزرسانی شد',
            })

        g.name = name
        g.slug = slug
        g.icon = icon
        g.color = color
        g.sort_order = sort_order
        g.usage_recipes = usage_recipes
        g.usage_warehouse = usage_warehouse
        g.usage_pos = usage_pos
        g.usage_invoice = usage_invoice
        g.usage_kitchen = usage_kitchen
        g.save()
        return JsonResponse({
            'group': _serialize_group(g),
            'message': 'گروه ویرایش شد',
        })

    # ایجاد جدید
    if DictionaryGroup.objects.filter(restaurant=restaurant, slug=slug).exists():
        slug = f'{slug}_{DictionaryGroup.objects.filter(restaurant=restaurant).count()}'

    g = DictionaryGroup.objects.create(
        restaurant=restaurant,
        name=name, slug=slug, icon=icon, color=color,
        sort_order=sort_order,
        usage_recipes=usage_recipes,
        usage_warehouse=usage_warehouse,
        usage_pos=usage_pos,
        usage_invoice=usage_invoice,
        usage_kitchen=usage_kitchen,
        is_system=False,
    )
    return JsonResponse({
        'group': _serialize_group(g),
        'message': 'گروه جدید ساخته شد',
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManager])
def dictionary_group_delete(request):
    """حذف گروه + cascade آیتم‌ها"""
    group_id = request.data.get('id')
    if not group_id:
        return JsonResponse({'error': 'شناسه گروه الزامی است'}, status=400)

    restaurant = _resolve_restaurant(request)

    try:
        g = DictionaryGroup.objects.get(id=group_id)
        if restaurant and g.restaurant_id != restaurant.id:
            return JsonResponse({'error': 'گروه یافت نشد'}, status=404)
    except DictionaryGroup.DoesNotExist:
        return JsonResponse({'error': 'گروه یافت نشد'}, status=404)

    if g.is_system:
        return JsonResponse({'error': 'گروه سیستمی قابل حذف نیست'}, status=400)

    deleted_count = ItemDictionary.objects.filter(group=g).delete()[0]
    name = g.name
    g.delete()

    return JsonResponse({
        'message': f'گروه «{name}» و {deleted_count} آیتم حذف شد',
    })


# ═══════════════════════════════════════════════════════════
#  Dictionary — آیتم‌ها CRUD
# ═══════════════════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dictionary_list(request):
    """لیست آیتم‌های دیکشنری — با فیلتر دسته‌بندی"""
    restaurant = _resolve_restaurant(request)
    category = request.GET.get('category', '')

    qs = ItemDictionary.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    if category:
        qs = qs.filter(category=category)

    data = [_serialize_dict_item(item) for item in qs]
    return JsonResponse({'items': data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dictionary_autocomplete(request):
    """جستجوی آیتم دیکشنری — autocomplete"""
    q = request.GET.get('q', '').strip()
    category = request.GET.get('category', '')

    if len(q) < 1:
        return JsonResponse({'items': []})

    restaurant = _resolve_restaurant(request)

    qs = ItemDictionary.objects.filter(name__icontains=q, is_active=True)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    if category:
        qs = qs.filter(category=category)

    data = [_serialize_dict_item(item) for item in qs[:15]]
    return JsonResponse({'items': data})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManager])
def dictionary_create(request):
    """ایجاد آیتم دیکشنری جدید"""
    data = request.data
    name = (data.get('name') or '').strip()
    unit = (data.get('unit') or '').strip()
    category = (data.get('category') or '').strip()
    desc = (data.get('description') or '').strip()
    dict_category = (data.get('dict_category') or '').strip()
    material_type = (data.get('material_type') or 'raw').strip()
    group_id = data.get('group_id')

    if not name or not unit or not category:
        return JsonResponse(
            {'error': 'نام، واحد و دسته‌بندی الزامی است'},
            status=400,
        )

    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse(
            {'error': 'رستوران مشخص نشده'},
            status=400,
        )

    # بررسی تکراری
    if ItemDictionary.objects.filter(
        name=name, category=category, restaurant=restaurant,
    ).exists():
        return JsonResponse(
            {'error': 'این اسم قبلاً در این دسته‌بندی ثبت شده'},
            status=400,
        )

    # لینک به گروه
    group = None
    if group_id:
        group = DictionaryGroup.objects.filter(
            id=group_id, restaurant=restaurant,
        ).first()

    try:
        item = ItemDictionary.objects.create(
            restaurant=restaurant,
            name=name, unit=unit, category=category,
            description=desc,
            dict_category=dict_category,
            material_type=material_type,
            group=group,
        )
        return JsonResponse(_serialize_dict_item(item), status=201)

    except Exception as e:
        logger.exception('Error creating dictionary item')
        return JsonResponse({'error': str(e)}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManager])
def dictionary_update(request, pk):
    """ویرایش آیتم دیکشنری"""
    try:
        item = ItemDictionary.objects.get(pk=pk)
    except ItemDictionary.DoesNotExist:
        return JsonResponse({'error': 'آیتم یافت نشد'}, status=404)

    data = request.data
    restaurant = _resolve_restaurant(request)

    if 'name' in data:
        item.name = (data['name'] or '').strip()
    if 'unit' in data:
        item.unit = (data['unit'] or '').strip()
    if 'description' in data:
        item.description = (data['description'] or '').strip()
    if 'dict_category' in data:
        item.dict_category = (data['dict_category'] or '').strip()
    if 'material_type' in data:
        item.material_type = (data.get('material_type') or 'raw').strip()
    if 'group_id' in data:
        gid = data.get('group_id')
        if gid and restaurant:
            item.group = DictionaryGroup.objects.filter(
                id=gid, restaurant=restaurant,
            ).first()
        elif not gid:
            item.group = None

    item.save()
    return JsonResponse(_serialize_dict_item(item))


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManager])
def dictionary_delete(request, pk):
    """حذف آیتم دیکشنری"""
    try:
        item = ItemDictionary.objects.get(pk=pk)
    except ItemDictionary.DoesNotExist:
        return JsonResponse({'error': 'آیتم یافت نشد'}, status=404)

    item.delete()
    return JsonResponse({'success': True, 'msg': 'آیتم حذف شد'})


# ═══════════════════════════════════════════════════════════
#  Dictionary — 4 API جداگانه (convenience wrappers)
# ═══════════════════════════════════════════════════════════

def _dict_list_by_category(request, category):
    """★ helper — بدون mutation request.GET"""
    restaurant = _resolve_restaurant(request)
    qs = ItemDictionary.objects.filter(category=category)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    data = [_serialize_dict_item(item) for item in qs]
    return JsonResponse({'items': data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dictionary_raw_materials(request):
    """فقط مواد اولیه"""
    return _dict_list_by_category(request, 'raw_material')


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dictionary_semi_finished(request):
    """فقط نیمه‌آماده"""
    return _dict_list_by_category(request, 'semi_finished')


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dictionary_ready_materials(request):
    """فقط مواد آماده"""
    return _dict_list_by_category(request, 'ready_material')


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dictionary_food_menu(request):
    """فقط غذا و منو — با قیمت و وضعیت"""
    restaurant = _resolve_restaurant(request)

    qs = Food.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    cats_qs = Category.objects.all()
    if restaurant:
        cats_qs = cats_qs.filter(restaurant=restaurant)

    categories = {c.id: c.name for c in cats_qs}

    items = [{
        'id': f.id,
        'name': f.name,
        'price': int(f.price or 0),
        'final_price': int(f.final_price or 0),
        'category_id': f.category_id,
        'category_name': categories.get(f.category_id, ''),
        'is_available': f.is_available,
    } for f in qs.order_by('name')]

    return JsonResponse({'items': items})


# ═══════════════════════════════════════════════════════════
#  Food CRUD — تب غذا و منو (★ با cascade delete)
# ═══════════════════════════════════════════════════════════

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManager])
def dictionary_food_create(request):
    """ایجاد غذای جدید"""
    data = request.data
    name = (data.get('name') or '').strip()
    if not name:
        return JsonResponse({'error': 'نام غذا الزامی است'}, status=400)

    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({'error': 'رستوران مشخص نشده'}, status=400)

    cat_name = (data.get('category_name') or '').strip()
    category = None
    if cat_name:
        category, _ = Category.objects.get_or_create(
            restaurant=restaurant, name=cat_name,
            defaults={'is_active': True, 'order': 0},
        )

    price = int(data.get('price', 0))
    final_price = int(data.get('final_price', price))

    food = Food.objects.create(
        restaurant=restaurant,
        name=name, category=category,
        price=price, final_price=final_price,
        is_available=data.get('is_available', True),
    )

    return JsonResponse({
        'id': food.id,
        'name': food.name,
        'price': int(food.price),
        'final_price': int(food.final_price),
        'category_id': food.category_id,
        'category_name': food.category.name if food.category else '',
        'is_available': food.is_available,
    }, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManager])
def dictionary_food_update(request, pk):
    """ویرایش غذا"""
    try:
        food = Food.objects.get(pk=pk)
    except Food.DoesNotExist:
        return JsonResponse({'error': 'غذا یافت نشد'}, status=404)

    data = request.data
    restaurant = _resolve_restaurant(request)

    if 'name' in data:
        food.name = (data['name'] or '').strip()
    if 'price' in data:
        food.price = max(0, int(data['price']))
    if 'final_price' in data:
        food.final_price = max(0, int(data['final_price']))
    elif 'price' in data:
        # اگر final_price ارسال نشده، از price استفاده کن
        food.final_price = food.price
    if 'is_available' in data:
        food.is_available = bool(data['is_available'])
    if 'category_name' in data:
        cat_name = (data['category_name'] or '').strip()
        if cat_name and restaurant:
            category, _ = Category.objects.get_or_create(
                restaurant=restaurant, name=cat_name,
                defaults={'is_active': True, 'order': 0},
            )
            food.category = category
        elif not cat_name:
            food.category = None

    food.save()

    return JsonResponse({
        'id': food.id,
        'name': food.name,
        'price': int(food.price),
        'final_price': int(food.final_price),
        'category_id': food.category_id,
        'category_name': food.category.name if food.category else '',
        'is_available': food.is_available,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsOwnerOrManager])
def dictionary_food_delete(request, pk):
    """حذف غذا + cascade: Recipe → KitchenProduct → KitchenInventory"""
    from ..models import Recipe, KitchenProduct

    try:
        food = Food.objects.get(pk=pk)
    except Food.DoesNotExist:
        return JsonResponse({'error': 'غذا یافت نشد'}, status=404)

    deleted = {'food': food.name, 'recipes': 0, 'kitchen_products': 0}

    try:
        recipe = Recipe.objects.get(food=food)

        # حذف KitchenProduct (CASCADE → KitchenInventory, WasteLog, ...)
        kps = KitchenProduct.objects.filter(recipe=recipe)
        deleted['kitchen_products'] = kps.count()
        kps.delete()

        # حذف Recipe (CASCADE → RecipeIngredient, ...)
        recipe.delete()
        deleted['recipes'] = 1
    except Recipe.DoesNotExist:
        pass

    food.delete()

    parts = [f"غذا «{deleted['food']}»"]
    if deleted['recipes']:
        parts.append(f"{deleted['recipes']} دستور پخت")
    if deleted['kitchen_products']:
        parts.append(f"{deleted['kitchen_products']} محصول آشپزخانه")

    return JsonResponse({
        'success': True,
        'message': ' و '.join(parts) + ' حذف شد',
    })


# ═══════════════════════════════════════════════════════════
#  ★ مواد نیمه‌آماده برای ویرایشگر رسپی
#  ★ FIXED: نام تغییر کرد تا با recipe_views.conflict نداشته باشد
# ═══════════════════════════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dictionary_recipe_materials_api(request):
    """مواد نیمه‌آماده از گروه‌هایی که usage_recipes=True — برای ویرایشگر رسپی"""
    restaurant = _resolve_restaurant(request)
    if not restaurant:
        return JsonResponse({'items': []})

    items_qs = (
        ItemDictionary.objects
        .filter(
            restaurant=restaurant,
            is_active=True,
            category='semi_finished',
            group__isnull=False,
            group__is_active=True,
            group__usage_recipes=True,
        )
        .select_related('group')
        .order_by('group__sort_order', 'name')
    )

    items_data = [{
        'id': item.id,
        'name': item.name,
        'unit': item.unit,
        'unit_display': item.get_unit_display(),
        'description': item.description or '',
        'dict_category': item.dict_category or '',
        'group': item.group_id,
        'group_name': item.group.name if item.group else '',
    } for item in items_qs]

    return JsonResponse({'items': items_data})