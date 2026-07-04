"""
Restaurant — Recipe & Inventory Views
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes as drf_permission_classes
from rest_framework.response import Response
from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET

from .models import (
    Recipe, RecipeIngredient, RecipeSemiFinished,
    InventoryMovement,
    RawMaterial, SemiFinished, Food,
)
from .recipe_serializers import (
    RecipeListSerializer, RecipeDetailSerializer, RecipeCreateSerializer,
    InventoryMovementSerializer,
)
from .permissions import IsOwner, IsOwnerOrWarehouse, IsStaffRole
from .utils import api_success, api_error
from .recipe_services import (
    calculate_recipe_cost, calculate_food_profit_margin,
    recalculate_all_food_costs, validate_recipe_inventory,
    validate_order_inventory, deduct_inventory_for_order,
    get_inventory_analytics,
    produce_semi_finished_enhanced,
)


# ══════════════════════════════════════════════════════════════════════════════
#  RECIPE VIEWSET
# ══════════════════════════════════════════════════════════════════════════════
class RecipeViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Recipe.objects.select_related('food').prefetch_related(
            'ingredients__raw_material', 'semi_finished_items__semi_finished',
        ).filter(is_active=True)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(food__name__icontains=search)
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return RecipeCreateSerializer
        return RecipeDetailSerializer

    # ★FIX: هم recipe موجود آپدیت میشه، هم recipe جدید id برمی‌گردونه
    def create(self, request, *args, **kwargs):
        food_id = request.data.get('food')
        if food_id:
            existing = Recipe.objects.filter(food_id=food_id).first()
            if existing:
                serializer = self.get_serializer(existing, data=request.data, partial=True)
                serializer.is_valid(raise_exception=True)
                serializer.save()
                data = serializer.data
                data['id'] = existing.id
                data['pk'] = existing.id
                return Response(data, status=status.HTTP_200_OK)
        # ★FIX: recipe جدید هم id برمی‌گردونه
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
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
                pass
            results.append(data)

        if page is not None:
            return self.get_paginated_response(results)
        return Response(results)

    @action(detail=False, methods=['post'], url_path='create-missing')
    def create_missing(self, request):
        foods_with_recipes = set(
            Recipe.objects.filter(is_active=True).values_list('food_id', flat=True)
        )
        all_foods = Food.objects.all()
        created = 0
        for food in all_foods:
            if food.id not in foods_with_recipes:
                Recipe.objects.create(
                    food=food,
                    yield_quantity=1,
                    estimated_preparation_time=0,
                    instructions='',
                    is_active=True,
                )
                created += 1
        return Response({'success': True, 'created': created, 'message': f'{created} رسپی جدید ساخته شد'})

    @action(detail=True, methods=['post'], url_path='calculate-cost')
    def calculate_cost(self, request, pk=None):
        recipe = self.get_object()
        result = calculate_recipe_cost(recipe)
        return Response(result)

    @action(detail=True, methods=['post'], url_path='validate-inventory')
    def validate_inventory(self, request, pk=None):
        recipe = self.get_object()
        quantity = float(request.data.get('quantity', 1))
        result = validate_recipe_inventory(recipe, quantity)
        return Response(result)

    @action(detail=True, methods=['get'], url_path='cost-breakdown')
    def cost_breakdown(self, request, pk=None):
        recipe = self.get_object()
        result = calculate_recipe_cost(recipe)
        return Response(result)

# ══════════════════════════════════════════════════════════════════════════════
#  INVENTORY MOVEMENT VIEWSET
# ══════════════════════════════════════════════════════════════════════════════


class InventoryMovementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = InventoryMovementSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = InventoryMovement.objects.select_related('raw_material').all()
        material = self.request.query_params.get('material')
        if material:
            qs = qs.filter(raw_material_id=material)
        mtype = self.request.query_params.get('type')
        if mtype:
            qs = qs.filter(movement_type=mtype)
        return qs


# ══════════════════════════════════════════════════════════════════════════════
#  RECIPE — FUNCTION-BASED API VIEWS
# ══════════════════════════════════════════════════════════════════════════════


@api_view(['POST'])
@drf_permission_classes([permissions.IsAuthenticated])
def validate_order_inventory_view(request):
    """POST /api/recipes/validate-inventory/ — بررسی موجودی قبل از ثبت سفارش"""
    items = request.data.get('items', [])
    if not items:
        return api_error('آیتمی ارسال نشد.')
    result = validate_order_inventory(items)
    if result['success']:
        return api_success(data=result, message=result['message'])
    return api_error(result['message'], errors=result['insufficient'])


@api_view(['POST'])
@drf_permission_classes([permissions.IsAuthenticated])
def deduct_inventory_view(request):
    """POST /api/recipes/deduct-inventory/ — کسر انبار برای سفارش"""
    from .models import Order
    order_id = request.data.get('order_id')
    if not order_id:
        return api_error('شناسه سفارش الزامی است.')
    try:
        order = Order.objects.prefetch_related(
            'items__food__recipe__ingredients__raw_material'
        ).get(id=order_id)
    except Order.DoesNotExist:
        return api_error('سفارش یافت نشد.')
    result = deduct_inventory_for_order(
        order,
        created_by=request.user if request.user.is_authenticated else None,
    )
    return api_success(data=result, message=result['message'])


@api_view(['POST'])
@drf_permission_classes([permissions.IsAuthenticated])
def recalculate_costs_view(request):
    """POST /api/recipes/recalculate-all/ — محاسبه مجدد هزینه تمام رسپی‌ها"""
    result = recalculate_all_food_costs()
    return api_success(data=result, message=f'{result["count"]} رسپی محاسبه شد.')


@api_view(['GET'])
@drf_permission_classes([permissions.IsAuthenticated])
def inventory_analytics_view(request):
    """GET /api/recipes/analytics/ — آمار و تحلیل انبار"""
    data = get_inventory_analytics()
    return api_success(data=data)


@api_view(['POST'])
@drf_permission_classes([permissions.IsAuthenticated])
def produce_semi_finished_view(request):
    """POST /api/recipes/produce-semi/ — تولید ماده نیم‌آماده"""
    sf_id = request.data.get('semi_finished_id')
    quantity = request.data.get('quantity', 1)
    if not sf_id:
        return api_error('شناسه ماده نیم‌آماده الزامی است.')
    result = produce_semi_finished_enhanced(
        semi_finished_id=sf_id,
        quantity=float(quantity),
        created_by=request.user if request.user.is_authenticated else None,
    )
    if result['success']:
        return api_success(data=result, message=result['message'])
    return api_error(result.get('error', 'خطا'), errors=result.get('insufficient'))


# ══════════════════════════════════════════════════════════════════════════════
#  SUGGESTION APIs — Plain Django views
# ══════════════════════════════════════════════════════════════════════════════


@csrf_exempt
@require_GET
def food_suggestions_view(request):
    """GET /api/recipes/foods/suggest/?q=..."""
    query = request.GET.get('q', '').strip()
    if not query:
        return JsonResponse([], safe=False)
    foods = Food.objects.filter(
        name__icontains=query
    ).values('id', 'name', 'final_price')[:15]
    data = []
    for f in foods:
        data.append({
            'id': f['id'],
            'name': f['name'],
            'price': int(f['final_price']) if f['final_price'] else 0,
        })
    return JsonResponse(data, safe=False)


@csrf_exempt
@require_GET
def raw_material_suggestions_api(request):
    """GET /api/recipes/raw-materials/suggest/?q=..."""
    query = request.GET.get('q', '').strip()
    if not query:
        materials = RawMaterial.objects.all().values(
            'id', 'name', 'unit', 'price', 'quantity'
        )[:50]
    else:
        materials = RawMaterial.objects.filter(
            name__icontains=query
        ).values('id', 'name', 'unit', 'price', 'quantity')[:15]
    data = []
    for m in materials:
        data.append({
            'id': m['id'],
            'name': m['name'],
            'unit': m['unit'],
            'price': int(m['price']) if m['price'] else 0,
            'quantity': int(m['quantity']) if m['quantity'] else 0,
            'unit_display': dict(RawMaterial.UNIT_CHOICES).get(m['unit'], m['unit']),
        })
    return JsonResponse(data, safe=False)


@csrf_exempt
@require_GET
def semi_finished_suggestions_api(request):
    """GET /api/recipes/semi-finished/suggest/?q=..."""
    query = request.GET.get('q', '').strip()
    if not query:
        items = SemiFinished.objects.all()[:50]
    else:
        items = SemiFinished.objects.filter(name__icontains=query)[:15]
    data = []
    for s in items:
        data.append({
            'id': s.id,
            'name': s.name,
            'unit': s.unit,
            'cost_per_unit': int(s.cost_per_unit) if s.cost_per_unit else 0,
            'unit_display': dict(RawMaterial.UNIT_CHOICES).get(s.unit, s.unit),
            'category': s.category,
        })
    return JsonResponse(data, safe=False)


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE VIEWS (HTML)
# ══════════════════════════════════════════════════════════════════════════════


@staff_member_required
def recipes_page(request):
    """GET /recipes/ — صفحه لیست رسپی‌ها"""
    try:
        return render(request, 'recipes/recipes.html')
    except Exception:
        return render(request, 'recipes/recipe_manager.html')


@staff_member_required
def recipe_manager_page(request):
    """GET /recipes/manager/ — صفحه مدیریت رسپی"""
    return render(request, 'recipes/recipe_manager.html')