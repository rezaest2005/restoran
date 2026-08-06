"""
Restaurant — Recipe & Inventory API Views (★ نسخه اصلاح‌شده v3)

★ تغییرات نسبت به نسخه قبل:
  ۱. @csrf_exempt + @require_GET → @api_view(["GET"])
  ۲. suggestion views: بدون permission → IsAuthenticated
  ۳. RecipeViewSet.create: restaurant= اضافه شد
  ۴. RecipeViewSet.create_missing: restaurant= + فیلتر restaurant روی Food
  ۵. تمام viewset‌ها و view‌ها: فیلتر restaurant اضافه شد
  ۶. _resolve_restaurant: مشترک با بقیه view‌ها
  ۷. inventory_analytics_view: restaurant پارامتر اضافه شد
  ۸. produce_semi_finished_view: restaurant پارامتر اضافه شد
  ۹. drf_permission_classes → permission_classes (DRF decorator)
"""

import logging
from decimal import Decimal, InvalidOperation

from django.http import JsonResponse
from django.db import transaction

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import (
    Recipe, RecipeIngredient, RecipePackagingItem,
    InventoryMovement, InventoryUsageLog,
    RawMaterial, SemiFinished, Food, Order,
)
from ..recipe_serializers import (
    RecipeDetailSerializer, RecipeCreateSerializer,
    InventoryMovementSerializer,
)
from ..utils import api_success, api_error
from ..recipe_services import (
    calculate_recipe_cost,
    recalculate_all_food_costs, validate_recipe_inventory,
    validate_order_inventory, deduct_inventory_for_order,
    get_inventory_analytics,
    produce_semi_finished_enhanced,
)
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
#  ★★★ Recipe ViewSet ★★★
# ═══════════════════════════════════════

class RecipeViewSet(viewsets.ModelViewSet):
    """مدیریت رسپی‌ها — CRUD + actions"""
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Recipe.objects.select_related('food').prefetch_related(
            'ingredients__raw_material',
            'semi_finished_items__semi_finished',
            'packaging_items__raw_material',
        )

        # ★ FIXED: فیلتر restaurant
        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)

        # فقط فعال‌ها مگر درخواست همه باشد
        show_all = self.request.query_params.get('all')
        if not show_all or show_all.lower() != 'true':
            qs = qs.filter(is_active=True)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(food__name__icontains=search)

        return qs.order_by('food__name')

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return RecipeCreateSerializer
        return RecipeDetailSerializer

    def create(self, request, *args, **kwargs):
        """ایجاد یا بروزرسانی رسپی برای یک غذا"""
        food_id = request.data.get('food')
        restaurant = _resolve_restaurant(request)

        if food_id:
            # اگر رسپی برای این غذا وجود دارد → بروزرسانی
            qs = Recipe.objects.filter(food_id=food_id)
            if restaurant:
                qs = qs.filter(restaurant=restaurant)
            existing = qs.first()

            if existing:
                serializer = self.get_serializer(existing, data=request.data, partial=True)
                serializer.is_valid(raise_exception=True)
                serializer.save()
                data = serializer.data
                data['id'] = existing.id
                data['pk'] = existing.id
                return Response(data, status=status.HTTP_200_OK)

        # ایجاد جدید
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # ★ FIXED: restaurant ست شود
        kwargs_save = {}
        if restaurant:
            kwargs_save['restaurant'] = restaurant
        serializer.save(**kwargs_save)

        data = serializer.data
        data['id'] = serializer.instance.id
        data['pk'] = serializer.instance.id
        headers = self.get_success_headers(data)
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        items = page if page is not None else queryset

        results = []
        for recipe in items:
            serializer = self.get_serializer(recipe)
            data = serializer.data
            try:
                cost_data = calculate_recipe_cost(recipe)
                data['total_cost'] = str(cost_data.get('total_cost', 0))
                data['cost_per_serving'] = str(cost_data.get('cost_per_serving', 0))
            except Exception:
                data['total_cost'] = '0'
                data['cost_per_serving'] = '0'
            results.append(data)

        if page is not None:
            return self.get_paginated_response(results)
        return Response(results)

    @action(detail=False, methods=['post'], url_path='create-missing')
    def create_missing(self, request):
        """ساخت رسپی برای غذاهایی که رسپی ندارند"""
        restaurant = _resolve_restaurant(request)

        foods_with_recipes = set(
            Recipe.objects.filter(is_active=True).values_list('food_id', flat=True)
        )

        # ★ FIXED: فیلتر restaurant روی Food
        all_foods = Food.objects.all()
        if restaurant:
            all_foods = all_foods.filter(restaurant=restaurant)

        created = 0
        with transaction.atomic():
            for food in all_foods:
                if food.id not in foods_with_recipes:
                    Recipe.objects.create(
                        restaurant=restaurant,
                        food=food,
                        yield_quantity=1,
                        estimated_preparation_time=0,
                        instructions='',
                        is_active=True,
                    )
                    created += 1

        return Response({
            'success': True,
            'created': created,
            'message': f'{created} رسپی جدید ساخته شد',
        })

    @action(detail=True, methods=['post'], url_path='calculate-cost')
    def calculate_cost(self, request, pk=None):
        """محاسبه هزینه یک رسپی"""
        try:
            return Response(calculate_recipe_cost(self.get_object()))
        except Exception as e:
            logger.exception("Error calculating cost for recipe %s", pk)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='validate-inventory')
    def validate_inventory(self, request, pk=None):
        """بررسی موجودی برای تولید"""
        try:
            quantity = float(request.data.get('quantity', 1))
            return Response(validate_recipe_inventory(self.get_object(), quantity))
        except (ValueError, TypeError):
            return Response(
                {'error': 'مقدار نامعتبر است.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=['get'], url_path='cost-breakdown')
    def cost_breakdown(self, request, pk=None):
        """تفکیک هزینه رسپی"""
        try:
            return Response(calculate_recipe_cost(self.get_object()))
        except Exception as e:
            logger.exception("Error in cost breakdown for recipe %s", pk)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ═══════════════════════════════════════
#  ★★★ Inventory Movement ViewSet ★★★
# ═══════════════════════════════════════

class InventoryMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """لیست تحرکات انبار — فقط خواندن"""
    serializer_class = InventoryMovementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = InventoryMovement.objects.select_related('raw_material')

        # ★ FIXED: فیلتر restaurant
        restaurant = _resolve_restaurant(self.request)
        if restaurant:
            qs = qs.filter(restaurant=restaurant)

        material = self.request.query_params.get('material')
        if material:
            qs = qs.filter(raw_material_id=material)

        mtype = self.request.query_params.get('type')
        if mtype:
            qs = qs.filter(movement_type=mtype)

        return qs.order_by('-created_at')


# ═══════════════════════════════════════
#  ★★★ Function-Based API Views ★★★
# ═══════════════════════════════════════

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def validate_order_inventory_view(request):
    """بررسی موجودی برای سفارش"""
    items = request.data.get('items', [])
    if not items:
        return api_error('آیتمی ارسال نشد.')

    result = validate_order_inventory(items)
    if result['success']:
        return api_success(data=result, message=result['message'])
    return api_error(result['message'], errors=result.get('insufficient'))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def deduct_inventory_view(request):
    """کسر موجودی برای سفارش"""
    order_id = request.data.get('order_id')
    if not order_id:
        return api_error('شناسه سفارش الزامی است.')

    try:
        order = Order.objects.prefetch_related(
            'items__food__recipe__ingredients__raw_material',
        ).get(id=order_id)
    except Order.DoesNotExist:
        return api_error('سفارش یافت نشد.', status_code=404)

    result = deduct_inventory_for_order(
        order,
        created_by=request.user,
    )

    if result.get('success'):
        return api_success(data=result, message=result['message'])
    return api_error(result.get('error', result.get('message', 'خطا')))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recalculate_costs_view(request):
    """محاسبه مجدد هزینه تمام غذاها"""
    restaurant = _resolve_restaurant(request)
    result = recalculate_all_food_costs(restaurant=restaurant)
    return api_success(
        data=result,
        message=f'{result["count"]} رسپی محاسبه شد.',
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_analytics_view(request):
    """تحلیل موجودی انبار"""
    restaurant = _resolve_restaurant(request)
    return api_success(data=get_inventory_analytics(restaurant=restaurant))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def produce_semi_finished_view(request):
    """تولید ماده نیم‌آماده"""
    sf_id = request.data.get('semi_finished_id')
    quantity = request.data.get('quantity', 1)
    notes = request.data.get('notes', '')

    if not sf_id:
        return api_error('شناسه ماده نیم‌آماده الزامی است.')

    try:
        quantity = float(quantity)
    except (ValueError, TypeError):
        return api_error('مقدار نامعتبر است.')

    if quantity <= 0:
        return api_error('مقدار باید بیشتر از صفر باشد.')

    restaurant = _resolve_restaurant(request)

    result = produce_semi_finished_enhanced(
        semi_finished_id=sf_id,
        quantity=quantity,
        created_by=request.user,
        restaurant=restaurant,
        notes=notes,
    )

    if result['success']:
        return api_success(data=result, message=result['message'])
    return api_error(result.get('error', 'خطا'), errors=result.get('insufficient'))


# ═══════════════════════════════════════
#  ★★★ Suggestion APIs ★★★
# ═══════════════════════════════════════

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def food_suggestions_view(request):
    """جستجوی غذا — autocomplete"""
    query = request.GET.get('q', '').strip()
    restaurant = _resolve_restaurant(request)

    qs = Food.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    if query:
        qs = qs.filter(name__icontains=query)

    foods = qs.values('id', 'name', 'final_price', 'price')[:15]
    data = [{
        'id': f['id'],
        'name': f['name'],
        'price': int(f['final_price'] or f['price'] or 0),
    } for f in foods]
    return JsonResponse(data, safe=False)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def raw_material_suggestions_api(request):
    """جستجوی ماده اولیه — autocomplete"""
    query = request.GET.get('q', '').strip()
    mat_type = request.GET.get('type', '').strip()  # raw یا packaging
    restaurant = _resolve_restaurant(request)

    qs = RawMaterial.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    if mat_type:
        qs = qs.filter(material_type=mat_type)

    if query:
        qs = qs.filter(name__icontains=query)

    materials = qs.values('id', 'name', 'unit', 'price', 'quantity')[:100]

    unit_map = dict(RawMaterial.UNIT_CHOICES)
    data = [{
        'id': m['id'],
        'name': m['name'],
        'unit': m['unit'],
        'price': int(m['price'] or 0),
        'quantity': int(m['quantity'] or 0),
        'unit_display': unit_map.get(m['unit'], m['unit']),
    } for m in materials]
    return JsonResponse(data, safe=False)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def semi_finished_suggestions_api(request):
    """جستجوی ماده نیم‌آماده — autocomplete"""
    query = request.GET.get('q', '').strip()
    restaurant = _resolve_restaurant(request)

    qs = SemiFinished.objects.all()
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    if query:
        qs = qs.filter(name__icontains=query)

    items = qs[:50]

    unit_map = dict(RawMaterial.UNIT_CHOICES)
    data = [{
        'id': s.id,
        'name': s.name,
        'unit': s.unit,
        'cost_per_unit': int(s.cost_per_unit or 0),
        'unit_display': unit_map.get(s.unit, s.unit),
        'category': s.category,
    } for s in items]
    return JsonResponse(data, safe=False)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recipe_materials_api(request, pk):
    """مواد مورد نیاز یک رسپی"""
    try:
        recipe = Recipe.objects.prefetch_related(
            'ingredients__raw_material',
            'semi_finished_items__semi_finished',
            'packaging_items__raw_material',
        ).get(pk=pk)
    except Recipe.DoesNotExist:
        return JsonResponse({'error': 'رسپی یافت نشد'}, status=404)

    ingredients = []
    for ing in recipe.ingredients.all():
        ingredients.append({
            'id': ing.id,
            'raw_material_id': ing.raw_material_id,
            'raw_material_name': ing.raw_material.name if ing.raw_material else '?',
            'quantity': str(ing.quantity),
            'unit': ing.raw_material.get_unit_display() if ing.raw_material else '',
        })

    semi_finished = []
    for sf in recipe.semi_finished_items.all():
        semi_finished.append({
            'id': sf.id,
            'semi_finished_id': sf.semi_finished_id,
            'semi_finished_name': sf.semi_finished.name if sf.semi_finished else '?',
            'quantity': str(sf.quantity),
        })

    packaging = []
    for pkg in recipe.packaging_items.all():
        packaging.append({
            'id': pkg.id,
            'raw_material_id': pkg.raw_material_id,
            'raw_material_name': pkg.raw_material.name if pkg.raw_material else '?',
            'quantity': str(pkg.quantity),
        })

    return JsonResponse({
        'recipe_id': recipe.id,
        'food_name': recipe.food.name if recipe.food else '?',
        'ingredients': ingredients,
        'semi_finished': semi_finished,
        'packaging': packaging,
    })