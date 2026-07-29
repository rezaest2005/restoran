"""
Dictionary Views — API مدیریت دیکشنری اسامی + گروه‌ها
"""

import json
import traceback
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.contrib.auth.decorators import login_required
from django.db.models import Q

from ..models import ItemDictionary, DictionaryGroup
from ..serializers import ItemDictionarySerializer


# ═══════════════════════════════════════════════════════════
#  ★ جدید — API فاکتور خرید (تب‌ها + آیتم‌ها)
# ═══════════════════════════════════════════════════════════
@login_required
@require_GET
def raw_materials_api(request):
    restaurant = getattr(request.user, 'restaurant', None)
    if not restaurant:
        return JsonResponse({'tabs': [], 'items': []})

    # ── تب‌های فعال فاکتور ──
    groups = (
        DictionaryGroup.objects
        .filter(restaurant=restaurant, is_active=True, usage_invoice=True)
        .order_by('sort_order', 'name')
    )

    tabs = []
    for g in groups:
        tabs.append({
            'id':    g.id,
            'slug':  g.slug,
            'name':  g.name,
            'icon':  g.icon,
            'color': g.color,
        })

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

    items_data = []
    for item in items_qs:
        g = item.group
        items_data.append({
            'id':            item.id,
            'name':          item.name,
            'unit':          item.unit,
            'description':   item.description or '',
            'dict_category': item.dict_category or '',
            'material_type': getattr(item, 'material_type', 'raw') or 'raw',
            'group':         item.group_id,
            'group_slug':    g.slug,
            'group_name':    g.name,
            'group_color':   g.color,
            'group_icon':    g.icon,
        })

    return JsonResponse({
        'tabs':  tabs,
        'items': items_data,
    })

# ═══════════════════════════════════════════════════════════
#  Dictionary Group — CRUD
# ═══════════════════════════════════════════════════════════

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


@require_GET
def dictionary_group_list(request):
    qs = DictionaryGroup.objects.filter(is_active=True).order_by('sort_order', 'name')
    groups = [_serialize_group(g) for g in qs]
    return JsonResponse({'groups': groups})


@require_POST
def dictionary_group_save(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'داده نامعتبر'}, status=400)

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

    restaurant = request.user.restaurant

    if group_id:
        try:
            g = DictionaryGroup.objects.get(id=group_id, restaurant=restaurant)
        except DictionaryGroup.DoesNotExist:
            return JsonResponse({'error': 'گروه یافت نشد'}, status=404)

        if g.is_system:
            g.usage_recipes = usage_recipes
            g.usage_warehouse = usage_warehouse
            g.usage_pos = usage_pos
            g.usage_invoice = usage_invoice
            g.usage_kitchen = usage_kitchen
            g.save()
            return JsonResponse({'group': _serialize_group(g), 'message': 'تنظیمات گروه سیستمی بروزرسانی شد'})

        g.name = name
        g.icon = icon
        g.color = color
        g.sort_order = sort_order
        g.usage_recipes = usage_recipes
        g.usage_warehouse = usage_warehouse
        g.usage_pos = usage_pos
        g.usage_invoice = usage_invoice
        g.usage_kitchen = usage_kitchen
        g.save()
        return JsonResponse({'group': _serialize_group(g), 'message': 'گروه ویرایش شد'})

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
    return JsonResponse({'group': _serialize_group(g), 'message': 'گروه جدید ساخته شد'})


@require_POST
def dictionary_group_delete(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'داده نامعتبر'}, status=400)

    group_id = data.get('id')
    if not group_id:
        return JsonResponse({'error': 'شناسه گروه الزامی است'}, status=400)

    restaurant = request.user.restaurant

    try:
        g = DictionaryGroup.objects.get(id=group_id, restaurant=restaurant)
    except DictionaryGroup.DoesNotExist:
        return JsonResponse({'error': 'گروه یافت نشد'}, status=404)

    if g.is_system:
        return JsonResponse({'error': 'گروه سیستمی قابل حذف نیست'}, status=400)

    ItemDictionary.objects.filter(group=g).update(group=None)
    name = g.name
    g.delete()
    return JsonResponse({'message': f'گروه «{name}» حذف شد'})


# ═══════════════════════════════════════════════════════════
#  Dictionary — آیتم‌ها CRUD
# ═══════════════════════════════════════════════════════════

@login_required
@require_GET
def dictionary_list(request):
    category = request.GET.get('category', '')
    qs = ItemDictionary.objects.all()

    restaurant = getattr(request.user, 'restaurant', None)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    if category:
        qs = qs.filter(category=category)

    data = [{
        'id': item.id, 'name': item.name, 'unit': item.unit,
        'unit_display': item.get_unit_display(),
        'description': item.description or '', 'category': item.category,
        'dict_category': item.dict_category or '',
        'material_type': getattr(item, 'material_type', 'raw') or 'raw',
    } for item in qs]
    return JsonResponse({'items': data})


@login_required
@require_GET
def dictionary_autocomplete(request):
    q = request.GET.get('q', '').strip()
    category = request.GET.get('category', '')

    if len(q) < 1:
        return JsonResponse({'items': []})

    qs = ItemDictionary.objects.filter(name__icontains=q, is_active=True)

    restaurant = getattr(request.user, 'restaurant', None)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    if category:
        qs = qs.filter(category=category)

    qs = qs[:15]

    data = [{
        'id': item.id, 'name': item.name, 'unit': item.unit,
        'unit_display': item.get_unit_display(),
        'description': item.description or '',
        'dict_category': item.dict_category or '',
        'material_type': getattr(item, 'material_type', 'raw') or 'raw',
    } for item in qs]
    return JsonResponse({'items': data})


@login_required
@require_POST
def dictionary_create(request):
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        data = request.POST

    name          = (data.get('name') or '').strip()
    unit          = (data.get('unit') or '').strip()
    category      = (data.get('category') or '').strip()
    desc          = (data.get('description') or '').strip()
    dict_category = (data.get('dict_category') or '').strip()
    material_type = (data.get('material_type') or 'raw').strip()
    group_id      = data.get('group_id')

    if not name or not unit or not category:
        return JsonResponse({'error': 'نام، واحد و دسته‌بندی الزامی است'}, status=400)

    try:
        restaurant = getattr(request.user, 'restaurant', None)
        if not restaurant:
            return JsonResponse({'error': 'رستورانی برای کاربر تعریف نشده'}, status=400)

        if ItemDictionary.objects.filter(
            name=name, category=category, restaurant=restaurant
        ).exists():
            return JsonResponse({'error': 'این اسم قبلاً در این دسته‌بندی ثبت شده'}, status=400)

        # ★ لینک به گروه
        group = None
        if group_id:
            try:
                group = DictionaryGroup.objects.get(id=group_id, restaurant=restaurant)
            except DictionaryGroup.DoesNotExist:
                pass

        item = ItemDictionary.objects.create(
            name=name, unit=unit, category=category,
            description=desc, restaurant=restaurant,
            dict_category=dict_category,
            material_type=material_type,
            group=group,
        )

        return JsonResponse({
            'id': item.id, 'name': item.name, 'unit': item.unit,
            'unit_display': item.get_unit_display(),
            'description': item.description or '', 'category': item.category,
            'dict_category': item.dict_category or '',
            'material_type': getattr(item, 'material_type', 'raw') or 'raw',
            'group': item.group_id,
        }, status=201)

    except Exception as e:
        print('=== DICTIONARY CREATE ERROR ===')
        traceback.print_exc()
        print('================================')
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def dictionary_update(request, pk):
    try:
        item = ItemDictionary.objects.get(pk=pk)
    except ItemDictionary.DoesNotExist:
        return JsonResponse({'error': 'آیتم یافت نشد'}, status=404)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        data = request.POST

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
        restaurant = getattr(request.user, 'restaurant', None)
        if gid and restaurant:
            try:
                item.group = DictionaryGroup.objects.get(id=gid, restaurant=restaurant)
            except DictionaryGroup.DoesNotExist:
                pass
        elif gid is None or gid == '':
            item.group = None

    item.save()

    return JsonResponse({
        'id': item.id, 'name': item.name, 'unit': item.unit,
        'unit_display': item.get_unit_display(),
        'description': item.description or '',
        'dict_category': item.dict_category or '',
        'material_type': getattr(item, 'material_type', 'raw') or 'raw',
        'group': item.group_id,
    })


@login_required
@require_POST
def dictionary_delete(request, pk):
    try:
        item = ItemDictionary.objects.get(pk=pk)
    except ItemDictionary.DoesNotExist:
        return JsonResponse({'error': 'آیتم یافت نشد'}, status=404)

    item.delete()
    return JsonResponse({'success': True})


# ═══════════════════════════════════════════════════════════
#  Dictionary — 4 API جداگانه
# ═══════════════════════════════════════════════════════════

@login_required
@require_GET
def dictionary_raw_materials(request):
    """فقط مواد اولیه"""
    request.GET = request.GET.copy()
    request.GET['category'] = 'raw_material'
    return dictionary_list(request)


@login_required
@require_GET
def dictionary_semi_finished(request):
    """فقط نیمه‌آماده"""
    request.GET = request.GET.copy()
    request.GET['category'] = 'semi_finished'
    return dictionary_list(request)


@login_required
@require_GET
def dictionary_ready_materials(request):
    """فقط مواد آماده"""
    request.GET = request.GET.copy()
    request.GET['category'] = 'ready_material'
    return dictionary_list(request)


@login_required
@require_GET
def dictionary_food_menu(request):
    """فقط غذا و منو"""
    from ..models import Food, Category

    restaurant = getattr(request.user, 'restaurant', None)
    qs = Food.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)
    qs = qs.order_by('name')

    categories = {}
    cats_qs = Category.objects.all()
    if restaurant:
        cats_qs = cats_qs.filter(restaurant=restaurant)
    for c in cats_qs:
        categories[c.id] = c.name

    items = []
    for f in qs:
        items.append({
            'id':            f.id,
            'name':          f.name,
            'category_id':   f.category_id,
            'category_name': categories.get(f.category_id, ''),
        })

    return JsonResponse({'items': items})

@login_required
@require_GET
def fix_assign_groups(request):
    """موقت: آیتم‌های بدون گروه رو به گروه‌ها وصل کن"""
    restaurant = getattr(request.user, 'restaurant', None)
    if not restaurant:
        return JsonResponse({'error': 'no restaurant'})

    try:
        raw_group = DictionaryGroup.objects.get(slug='raw_material', restaurant=restaurant)
        pack_group = DictionaryGroup.objects.get(slug='packaging', restaurant=restaurant)
    except DictionaryGroup.DoesNotExist:
        return JsonResponse({'error': 'گروه‌ها پیدا نشد'})

    # آیتم‌های مواد اولیه
    raw_names = ['ارد', 'روغن مایع', 'گوشت چرخ‌کرده', 'گوجه فرنگی',
                 'پنیر پیتزا', 'خمیر پیتز', 'سس مارینارا', 'مایه برگر',
                 'موز', 'پرتقال', 'سس تک‌نفره', 'نوشابه قوطی', 'ماشعیر']
    raw_count = ItemDictionary.objects.filter(
        restaurant=restaurant, name__in=raw_names, group__isnull=True
    ).update(group=raw_group)

    # آیتم‌های بسته‌بندی
    pack_names = ['جعبه پیتزا', 'جعبه پیتزا 5 نفره', 'جعبه اسنک',
                  'جعبه سنیوسه', 'بسته بندی ساندویج فلافل',
                  'ظرف سالاد', 'دستمال کاغذی']
    pack_count = ItemDictionary.objects.filter(
        restaurant=restaurant, name__in=pack_names, group__isnull=True
    ).update(group=pack_group)

    return JsonResponse({
        'raw_assigned': raw_count,
        'pack_assigned': pack_count,
    })