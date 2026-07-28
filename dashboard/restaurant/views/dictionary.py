"""
Dictionary Views — API مدیریت دیکشنری اسامی
"""

import json
import traceback
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.contrib.auth.decorators import login_required

from ..models import ItemDictionary


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

        item = ItemDictionary.objects.create(
            name=name, unit=unit, category=category,
            description=desc, restaurant=restaurant,
            dict_category=dict_category,
                material_type=material_type,              
        )

        return JsonResponse({
            'id': item.id, 'name': item.name, 'unit': item.unit,
            'unit_display': item.get_unit_display(),
            'description': item.description or '', 'category': item.category,
            'dict_category': item.dict_category or '',  
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
        item.material_type = (data.get('material_type') or 'raw').strip()

    item.save()

    return JsonResponse({
        'id': item.id, 'name': item.name, 'unit': item.unit,
        'unit_display': item.get_unit_display(),
        'description': item.description or '',
        'dict_category': item.dict_category or '',      
        'material_type': getattr(item, 'material_type', 'raw') or 'raw',
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