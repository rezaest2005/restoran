"""
Dictionary Views — مدیریت دیکشنری اسامی
"""

import json
import traceback
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from .models import ItemDictionary


@login_required
@require_GET
def dictionary_list(request):
    """لیست همه آیتم‌های دیکشنری"""
    category = request.GET.get('category', '')
    qs = ItemDictionary.objects.all()

    restaurant = getattr(request.user, 'restaurant', None)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    if category:
        qs = qs.filter(category=category)

    data = [
        {
            'id': item.id,
            'name': item.name,
            'unit': item.unit,
            'unit_display': item.get_unit_display(),
            'description': item.description or '',
            'category': item.category,
        }
        for item in qs
    ]
    return JsonResponse({'items': data})


@login_required
@require_GET
def dictionary_autocomplete(request):
    """جستجوی سریع برای autocomplete"""
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

    data = [
        {
            'id': item.id,
            'name': item.name,
            'unit': item.unit,
            'unit_display': item.get_unit_display(),
            'description': item.description or '',
        }
        for item in qs
    ]
    return JsonResponse({'items': data})


@login_required
@require_POST
def dictionary_create(request):
    """ساخت آیتم جدید"""
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        data = request.POST

    name     = (data.get('name') or '').strip()
    unit     = (data.get('unit') or '').strip()
    category = (data.get('category') or '').strip()
    desc     = (data.get('description') or '').strip()

    if not name or not unit or not category:
        return JsonResponse({'error': 'نام، واحد و دسته‌بندی الزامی است'}, status=400)

    try:
        restaurant = getattr(request.user, 'restaurant', None)

        if not restaurant:
            return JsonResponse({'error': 'رستورانی برای کاربر تعریف نشده'}, status=400)

        # بررسی تکراری
        if ItemDictionary.objects.filter(
            name=name, category=category, restaurant=restaurant
        ).exists():
            return JsonResponse({'error': 'این اسم قبلاً در این دسته‌بندی ثبت شده'}, status=400)

        # ساخت آیتم
        item = ItemDictionary.objects.create(
            name=name,
            unit=unit,
            category=category,
            description=desc,
            restaurant=restaurant,
        )

        return JsonResponse({
            'id': item.id,
            'name': item.name,
            'unit': item.unit,
            'unit_display': item.get_unit_display(),
            'description': item.description or '',
            'category': item.category,
        }, status=201)

    except Exception as e:
        print('=== DICTIONARY CREATE ERROR ===')
        traceback.print_exc()
        print('================================')
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def dictionary_update(request, pk):
    """ویرایش آیتم"""
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

    item.save()

    return JsonResponse({
        'id': item.id,
        'name': item.name,
        'unit': item.unit,
        'unit_display': item.get_unit_display(),
        'description': item.description or '',
    })


@login_required
@require_POST
def dictionary_delete(request, pk):
    """حذف آیتم"""
    try:
        item = ItemDictionary.objects.get(pk=pk)
    except ItemDictionary.DoesNotExist:
        return JsonResponse({'error': 'آیتم یافت نشد'}, status=404)

    item.delete()
    return JsonResponse({'success': True})


@login_required
def dictionary_page(request):
    """صفحه مدیریت دیکشنری اسامی"""
    return render(request, 'restaurant/dictionary.html')