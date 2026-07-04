"""
Restaurant — Recipe Engine Services
محاسبه هزینه، کسر انبار، ولیدیشن
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from .models import (
    Recipe, RecipeIngredient, RecipeSemiFinished,
    RawMaterial, SemiFinished, Food,
    InventoryMovement, InventoryUsageLog,
)


# ══════════════════════════════════════════════════════════════════════════════
#  1. RECIPE COST CALCULATION
# ══════════════════════════════════════════════════════════════════════════════

def calculate_recipe_cost(recipe: Recipe) -> dict:
    """محاسبه کامل هزینه ریسیپت"""

    # ── مواد اولیه
    raw_cost = 0
    raw_details = []
    for ing in recipe.ingredients.select_related('raw_material').all():
        cost = ing.total_cost
        raw_cost += cost
        raw_details.append({
            'name': ing.raw_material.name,
            'quantity': float(ing.quantity),
            'wastage_percent': float(ing.wastage_percent),
            'effective_quantity': ing.effective_quantity,
            'unit_price': int(ing.raw_material.price),
            'cost': cost,
        })

    # ── مواد نیم‌آماده
    semi_cost = 0
    semi_details = []
    for item in recipe.semi_finished_items.select_related('semi_finished').all():
        cost = item.total_cost
        semi_cost += cost
        semi_details.append({
            'name': item.semi_finished.name,
            'quantity': float(item.quantity),
            'unit_cost': int(item.semi_finished.cost_per_unit),
            'cost': cost,
        })

    total = raw_cost + semi_cost
    cost_per_serving = int(total / recipe.yield_quantity) if recipe.yield_quantity else total

    # قیمت پیشنهادی (۶۰٪ سود)
    suggested = int(cost_per_serving * 1.6)

    # ذخیره
    recipe.total_raw_material_cost = raw_cost
    recipe.total_semi_finished_cost = semi_cost
    recipe.total_cost = total
    recipe.cost_per_serving = cost_per_serving
    recipe.suggested_price = suggested
    recipe.save(update_fields=[
        'total_raw_material_cost', 'total_semi_finished_cost',
        'total_cost', 'cost_per_serving', 'suggested_price',
    ])

    # بروزرسانی قیمت غذا — فیلد cost_price در مدل Food وجود ندارد
    # فعلاً فقط محاسبه انجام میشه و نتیجه برمیگرده

    food = recipe.food
    food_price = int(food.final_price) if food.final_price else 0

    return {
        'success': True,
        'recipe_id': recipe.id,
        'food_name': recipe.food.name,
        'raw_material_cost': raw_cost,
        'semi_finished_cost': semi_cost,
        'total_cost': total,
        'cost_per_serving': cost_per_serving,
        'suggested_price': suggested,
        'food_price': food_price,
        'profit_margin': recipe.profit_margin,
        'raw_details': raw_details,
        'semi_details': semi_details,
    }


def calculate_food_profit_margin(food_id: int) -> dict:
    """محاسبه حاشیه سود یک غذا"""
    try:
        food = Food.objects.get(id=food_id)
    except Food.DoesNotExist:
        return {'success': False, 'error': 'غذا یافت نشد.'}

    recipe = getattr(food, 'recipe', None)
    if not recipe:
        return {'success': False, 'error': 'دستور پخت برای این غذا ثبت نشده.'}

    result = calculate_recipe_cost(recipe)
    food_price = int(food.final_price) if food.final_price else 0
    result['food_price'] = food_price
    result['profit_amount'] = food_price - result['cost_per_serving']
    result['profit_margin'] = recipe.profit_margin
    return result


def recalculate_all_food_costs(restaurant=None) -> dict:
    """محاسبه مجدد هزینه تمام غذاها"""
    qs = Recipe.objects.filter(is_active=True)
    if restaurant:
        qs = qs.filter(restaurant=restaurant)

    results = []
    for recipe in qs.select_related('food').all():
        result = calculate_recipe_cost(recipe)
        results.append(result)

    return {
        'success': True,
        'count': len(results),
        'results': results,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  2. INVENTORY VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

def validate_recipe_inventory(recipe: Recipe, quantity: float = 1) -> dict:
    """بررسی موجودی کافی برای یک ریسیپت"""
    insufficient = []

    # ── مواد اولیه
    for ing in recipe.ingredients.select_related('raw_material').filter(optional=False):
        needed = ing.effective_quantity * quantity
        available = float(ing.raw_material.quantity)
        if available < needed:
            insufficient.append({
                'type': 'raw_material',
                'name': ing.raw_material.name,
                'needed': needed,
                'available': available,
                'unit': ing.raw_material.get_unit_display(),
                'shortage': needed - available,
            })

    # ── مواد نیم‌آماده
    for item in recipe.semi_finished_items.select_related('semi_finished'):
        needed = float(item.quantity) * quantity
        available = float(item.semi_finished.quantity_produced)
        if available < needed:
            insufficient.append({
                'type': 'semi_finished',
                'name': item.semi_finished.name,
                'needed': needed,
                'available': available,
                'unit': item.semi_finished.get_unit_display(),
                'shortage': needed - available,
            })

    return {
        'success': len(insufficient) == 0,
        'insufficient': insufficient,
        'message': 'موجودی کافی است.' if not insufficient else f'{len(insufficient)} ماده کمبود دارد.',
    }


def validate_order_inventory(order_items: list) -> dict:
    """بررسی موجودی کافی برای تمام آیتم‌های سفارش"""
    all_insufficient = []

    for item in order_items:
        food_id = item.get('food_id') or item.get('food')
        quantity = item.get('quantity', 1)

        try:
            food = Food.objects.get(id=food_id)
        except Food.DoesNotExist:
            continue

        recipe = getattr(food, 'recipe', None)
        if not recipe:
            continue

        result = validate_recipe_inventory(recipe, quantity)
        if not result['success']:
            for ins in result['insufficient']:
                ins['food_name'] = food.name
                ins['order_quantity'] = quantity
                all_insufficient.append(ins)

    return {
        'success': len(all_insufficient) == 0,
        'insufficient': all_insufficient,
        'message': 'موجودی تمام آیتم‌ها کافی است.' if not all_insufficient
                   else f'کمبود موجودی در {len(all_insufficient)} مورد.',
    }


# ══════════════════════════════════════════════════════════════════════════════
#  3. AUTOMATIC INVENTORY DEDUCTION
# ══════════════════════════════════════════════════════════════════════════════

@transaction.atomic
def deduct_inventory_for_order(order, created_by=None) -> dict:
    """کسر خودکار انبار برای سفارش تکمیل‌شده"""

    deductions = []
    errors = []

    for order_item in order.items.select_related('food').all():
        food = order_item.food
        recipe = getattr(food, 'recipe', None)

        if not recipe:
            continue

        qty = order_item.quantity

        # ── کسر مواد اولیه
        for ing in recipe.ingredients.select_related('raw_material').all():
            needed = Decimal(str(ing.effective_quantity)) * qty
            raw_mat = ing.raw_material

            previous_stock = raw_mat.quantity
            new_stock = max(Decimal('0'), previous_stock - needed)
            raw_mat.quantity = new_stock
            raw_mat.save(update_fields=['quantity'])

            # ثبت جابجایی انبار
            InventoryMovement.objects.create(
                restaurant=getattr(order, 'restaurant', None),
                raw_material=raw_mat,
                movement_type=InventoryMovement.MovementType.ORDER_USAGE,
                quantity=needed,
                previous_stock=previous_stock,
                new_stock=new_stock,
                reference_type='order',
                reference_id=order.id,
                notes=f'سفارش #{order.id} — {food.name} × {qty}',
                created_by=created_by,
            )

            # ثبت تاریخچه مصرف
            InventoryUsageLog.objects.create(
                raw_material=raw_mat,
                usage_type='order',
                quantity_used=float(needed),
                reference=f'سفارش #{order.id} — {food.name}',
                note=f'{qty} عدد {food.name}',
            )

            deductions.append({
                'material': raw_mat.name,
                'quantity': float(needed),
                'previous_stock': float(previous_stock),
                'new_stock': float(new_stock),
            })

        # ── کسر مواد نیم‌آماده
        for semi_item in recipe.semi_finished_items.select_related('semi_finished'):
            needed = Decimal(str(semi_item.quantity)) * qty
            sf = semi_item.semi_finished

            sf.quantity_produced = max(Decimal('0'), sf.quantity_produced - needed)
            sf.save(update_fields=['quantity_produced'])

            deductions.append({
                'material': f'{sf.name} (نیم‌آماده)',
                'quantity': float(needed),
                'previous_stock': float(sf.quantity_produced + needed),
                'new_stock': float(sf.quantity_produced),
            })

    return {
        'success': True,
        'message': f'{len(deductions)} ماده از انبار کسر شد.',
        'deductions': deductions,
        'errors': errors,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  6. SEMI-FINISHED PRODUCTION (Enhanced)
# ══════════════════════════════════════════════════════════════════════════════

@transaction.atomic
def produce_semi_finished_enhanced(semi_finished_id: int, quantity: float,
                                    created_by=None, restaurant=None) -> dict:
    """تولید ماده نیم‌آماده با کسر انبار + لاگ جابجایی"""
    try:
        sf = SemiFinished.objects.get(id=semi_finished_id)
    except SemiFinished.DoesNotExist:
        return {'success': False, 'error': 'ماده نیم‌آماده یافت نشد.'}

    # بررسی موجودی
    insufficient = []
    for ing in sf.ingredients.select_related('raw_material').all():
        needed = Decimal(str(ing.quantity)) * Decimal(str(quantity))
        if ing.raw_material.quantity < needed:
            insufficient.append({
                'name': ing.raw_material.name,
                'needed': float(needed),
                'available': float(ing.raw_material.quantity),
            })

    if insufficient:
        return {
            'success': False,
            'error': 'موجودی کافی نیست.',
            'insufficient': insufficient,
        }

    # کسر مواد اولیه
    movements = []
    for ing in sf.ingredients.select_related('raw_material').all():
        needed = Decimal(str(ing.quantity)) * Decimal(str(quantity))
        raw_mat = ing.raw_material
        previous_stock = raw_mat.quantity
        raw_mat.quantity -= needed
        raw_mat.save(update_fields=['quantity'])

        InventoryMovement.objects.create(
            restaurant=restaurant,
            raw_material=raw_mat,
            movement_type=InventoryMovement.MovementType.PRODUCTION,
            quantity=needed,
            previous_stock=previous_stock,
            new_stock=raw_mat.quantity,
            reference_type='semi_finished',
            reference_id=sf.id,
            notes=f'تولید {quantity} واحد {sf.name}',
            created_by=created_by,
        )

        InventoryUsageLog.objects.create(
            raw_material=raw_mat,
            usage_type='semi_finished',
            quantity_used=float(needed),
            reference=f'تولید: {sf.name}',
            note=f'{quantity} واحد {sf.name}',
        )

        movements.append({
            'material': raw_mat.name,
            'used': float(needed),
            'remaining': float(raw_mat.quantity),
        })

    # افزایش موجودی نیم‌آماده
    sf.quantity_produced += Decimal(str(quantity))
    sf.save(update_fields=['quantity_produced'])

    return {
        'success': True,
        'message': f'{quantity} واحد «{sf.name}» تولید شد.',
        'total_cost': int(sf.total_cost),
        'movements': movements,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  8. ANALYTICS
# ══════════════════════════════════════════════════════════════════════════════

def get_inventory_analytics(restaurant=None) -> dict:
    """آمار و تحلیل انبار"""

    raw_qs = RawMaterial.objects.all()
    recipe_qs = Recipe.objects.filter(is_active=True)

    # ارزش کل انبار
    total_value = sum(int(m.total_price) for m in raw_qs)

    # گران‌ترین ریسیپت‌ها
    expensive_recipes = recipe_qs.order_by('-cost_per_serving')[:5]
    top_recipes = [{
        'name': r.food.name,
        'cost': int(r.cost_per_serving),
        'price': int(r.food.final_price) if r.food.final_price else 0,
        'margin': round(r.profit_margin, 1),
    } for r in expensive_recipes]

    # پر مصرف‌ترین مواد
    from django.db.models import Sum
    top_materials = (
        InventoryUsageLog.objects
        .values('raw_material__name')
        .annotate(total_used=Sum('quantity_used'))
        .order_by('-total_used')[:5]
    )

    return {
        'total_inventory_value': total_value,
        'active_recipes': recipe_qs.count(),
        'top_expensive_recipes': top_recipes,
        'top_used_materials': [
            {'name': m['raw_material__name'], 'total_used': float(m['total_used'])}
            for m in top_materials
        ],
    }
