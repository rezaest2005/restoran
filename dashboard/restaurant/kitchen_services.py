"""
Kitchen business-logic layer.
Every calculation flows through here — models never hardcode ingredients.
"""

from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
import logging

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  Recipe Ingredient Extraction
# ═══════════════════════════════════════
#  This is the SINGLE function to adjust if your Recipe model
#  uses a different related-name or field structure.

def get_recipe_ingredients(recipe):
    """
    Return a flat list of ingredient dicts from a Recipe instance.
    """
    ingredients = []

    # [FIX] اگه recipe نباشه، لیست خالی برگردون
    if recipe is None:
        return ingredients

    qs = recipe.ingredients.all()

    for item in qs:
        entry = {'quantity': float(item.quantity)}

        if getattr(item, 'raw_material_id', None) and item.raw_material:
            rm = item.raw_material
            entry.update(
                type='raw_material',
                id=rm.id,
                name=rm.name,
                unit=rm.unit,
                unit_display=rm.get_unit_display(),
                available=float(rm.quantity),
                price=float(rm.price),
            )
            ingredients.append(entry)

        elif getattr(item, 'semi_finished_id', None) and item.semi_finished:
            sf = item.semi_finished
            sf_stock = float(getattr(sf, 'current_stock', 0))
            sf_qty   = float(getattr(sf, 'quantity_produced', 1)) or 1
            sf_cost  = float(getattr(sf, 'total_cost', 0))
            entry.update(
                type='semi_finished',
                id=sf.id,
                name=sf.name,
                unit=sf.unit,
                unit_display=sf.get_unit_display(),
                available=sf_stock,
                price=sf_cost / sf_qty,
            )
            ingredients.append(entry)

    return ingredients


# ═══════════════════════════════════════
#  Cost
# ═══════════════════════════════════════

def calculate_recipe_cost(kitchen_product):
    """Production cost for ONE unit (float, Toman)."""
    return sum(
        ing['quantity'] * ing['price']
        for ing in get_recipe_ingredients(kitchen_product.recipe)
    )


# ═══════════════════════════════════════
#  Required Materials
# ═══════════════════════════════════════

def get_required_materials(kitchen_product, quantity=1):
    """لیست مواد مورد نیاز برای تولید — اولیه + نیمه‌آماده."""
    recipe = kitchen_product.recipe
    result = []

    # ── مواد اولیه ──
    for ing in recipe.ingredients.select_related('raw_material').all():
        rm = ing.raw_material
        effective = float(ing.effective_quantity) * quantity
        result.append({
            'type': 'raw_material',
            'id': rm.id,
            'name': rm.name,
            'required_per_unit': float(ing.effective_quantity),
            'total_needed': round(effective, 3),
            'available': float(rm.quantity),
            'unit': rm.unit,
            'unit_display': rm.get_unit_display(),
        })

    # ── مواد نیمه‌آماده ──
    for semi_item in recipe.semi_finished_items.select_related('semi_finished').all():
        sf = semi_item.semi_finished
        needed = float(semi_item.quantity) * quantity
        current_stock = float(getattr(sf, 'current_stock', 0))
        result.append({
            'type': 'semi_finished',
            'id': sf.id,
            'name': sf.name,
            'required_per_unit': float(semi_item.quantity),
            'total_needed': round(needed, 3),
            'available': current_stock,
            'unit': sf.unit,
            'unit_display': sf.get_unit_display(),
        })

    return result


# ═══════════════════════════════════════
#  Capacity
# ═══════════════════════════════════════

def calculate_max_production(kitchen_product):
    """حداکثر تعداد قابل تولید — اولیه + نیمه‌آماده."""
    recipe = kitchen_product.recipe
    max_qty = float('inf')
    limiting = None

    # ── مواد اولیه ──
    for ing in recipe.ingredients.select_related('raw_material').all():
        rm = ing.raw_material
        effective = float(ing.effective_quantity)
        if effective <= 0:
            continue
        can_make = float(rm.quantity) / effective
        if can_make < max_qty:
            max_qty = can_make
            limiting = {
                'name': rm.name,
                'type': 'raw_material',
                'available': float(rm.quantity),
                'required_per_unit': effective,
            }

    # ── مواد نیمه‌آماده ──
    for semi_item in recipe.semi_finished_items.select_related('semi_finished').all():
        sf = semi_item.semi_finished
        needed = float(semi_item.quantity)
        if needed <= 0:
            continue
        stock = float(getattr(sf, 'current_stock', 0))
        can_make = stock / needed
        if can_make < max_qty:
            max_qty = can_make
            limiting = {
                'name': sf.name,
                'type': 'semi_finished',
                'available': stock,
                'required_per_unit': needed,
            }

    if max_qty == float('inf'):
        return 0, None

    return int(max_qty), limiting
# ═══════════════════════════════════════
#  Validation
# ═══════════════════════════════════════
def validate_production(kitchen_product, quantity):
    """بررسی امکان تولید — مواد اولیه + نیمه‌آماده."""
    required = get_required_materials(kitchen_product, quantity)
    errors = []

    for req in required:
        if req['available'] < req['total_needed']:
            errors.append(
                f"«{req['name']}»: نیاز {req['total_needed']} {req['unit_display']} — "
                f"موجودی {req['available']}"
            )

    if errors:
        raise ValidationError("موجودی کافی نیست:\n" + "\n".join(errors))

    return required

# ═══════════════════════════════════════
#  Produce
# ═══════════════════════════════════════

@transaction.atomic
def produce_item(kitchen_product, quantity, user=None,
                 production_plan=None, notes=''):
    """
    1. Validate materials
    2. Deduct RawMaterial / SemiFinished stock (SELECT FOR UPDATE)
    3. Increase KitchenInventory
    4. Create ProductionBatch
    5. Create ProductionLog
    6. Refresh CapacityAnalysis
    """
    from .models import (
        RawMaterial, SemiFinished,
        KitchenInventory, ProductionBatch, ProductionLog, CapacityAnalysis,
    )

    # 1 — validate
    required = validate_production(kitchen_product, quantity)

    # 2 — deduct
    consumed = []
    for req in required:
        total = req['total_needed']

        if req['type'] == 'raw_material':
            rm = RawMaterial.objects.select_for_update().get(pk=req['id'])
            rm.quantity = float(rm.quantity) - total
            rm.save(update_fields=['quantity'])
            consumed.append(dict(
                type='raw_material', id=rm.id, name=rm.name,
                quantity_used=total, unit=req['unit'],
            ))

        elif req['type'] == 'semi_finished':
            sf = SemiFinished.objects.select_for_update().get(pk=req['id'])
            # ★ حالا current_stock فیلد واقعی هست
            sf.current_stock = float(sf.current_stock) - total
            sf.save(update_fields=['current_stock'])
            consumed.append(dict(
                type='semi_finished', id=sf.id, name=sf.name,
                quantity_used=total, unit=req['unit'],
            ))

    # 3 — kitchen inventory
    inv, _ = KitchenInventory.objects.select_for_update().get_or_create(
        kitchen_product=kitchen_product,
        defaults={'low_stock_threshold': 5},
    )
    inv.quantity += quantity
    inv.save(update_fields=['quantity', 'updated_at'])

    # 4 — batch
    unit_cost  = calculate_recipe_cost(kitchen_product)
    total_cost = int(unit_cost * quantity)
    batch = ProductionBatch.objects.create(
        production_plan=production_plan,
        kitchen_product=kitchen_product,
        quantity_produced=quantity,
        production_cost=total_cost,
        produced_by=user,
        notes=notes,
    )

    # 5 — log
    ProductionLog.objects.create(
        user=user,
        kitchen_product=kitchen_product,
        action='produce',
        quantity=quantity,
        materials_consumed=consumed,
        production_batch=batch,
        details=f'تولید {quantity} واحد {kitchen_product.name}',
    )

    # 6 — refresh capacity snapshot
    max_q, lim = calculate_max_production(kitchen_product)
    if lim:
        CapacityAnalysis.objects.create(
            kitchen_product=kitchen_product,
            max_production_quantity=max_q,
            limiting_material_name=lim['name'],
            limiting_material_type=lim['type'],
        )

    logger.info('Produced %d × %s by %s', quantity, kitchen_product.name, user)
    return batch

# ═══════════════════════════════════════
#  Production Plans
# ═══════════════════════════════════════

@transaction.atomic
def create_production_plan(date, items_data, user=None, notes=''):
    from .models import ProductionPlan, ProductionPlanItem, KitchenProduct, ProductionLog

    plan = ProductionPlan.objects.create(date=date, created_by=user, notes=notes)
    for d in items_data:
        product = KitchenProduct.objects.get(pk=d['kitchen_product_id'])
        ProductionPlanItem.objects.create(
            production_plan=plan,
            kitchen_product=product,
            quantity=d['quantity'],
        )
    ProductionLog.objects.create(
        user=user, action='plan_create', quantity=len(items_data),
        details=f'ایجاد برنامه تولید {date}',
    )
    return plan



@transaction.atomic
def approve_production_plan(plan, user=None):
    from .models import ProductionLog
    if plan.status != 'draft':
        raise ValidationError('فقط برنامه‌های پیش‌نویس قابل تأیید هستند.')

    errors = []
    for item in plan.items.select_related('kitchen_product').all():
        try:
            validate_production(item.kitchen_product, item.quantity)
        except ValidationError as e:
            errors.append(str(e))
        # [FIX] هر خطای دیگه‌ای هم گرفته بشه
        except Exception as e:
            errors.append(f'{item.kitchen_product.name}: خطای غیرمنتظره — {str(e)}')

    if errors:
        raise ValidationError('\n'.join(errors))

    plan.status = 'approved'
    plan.save(update_fields=['status', 'updated_at'])

    ProductionLog.objects.create(
        user=user, action='plan_approve',
        details=f'تأیید برنامه {plan.date}',
    )
    return plan


@transaction.atomic
def execute_production_plan(plan, user=None):
    from .models import ProductionLog
    if plan.status != 'approved':
        raise ValidationError('فقط برنامه‌های تأیید شده قابل اجرا هستند.')

    batches = []
    for item in plan.items.select_related('kitchen_product').all():
        b = produce_item(
            kitchen_product=item.kitchen_product,
            quantity=item.quantity,
            user=user,
            production_plan=plan,
        )
        batches.append(b)

    plan.status = 'completed'
    plan.save(update_fields=['status', 'updated_at'])

    ProductionLog.objects.create(
        user=user, action='plan_execute', quantity=len(batches),
        details=f'اجرای برنامه {plan.date} — {len(batches)} محصول',
    )
    return batches


# ═══════════════════════════════════════
#  Discount Engine
# ═══════════════════════════════════════

def apply_discount(discount, original_price, quantity=1, current_stock=0):
    if not discount.is_active:
        return int(original_price)

    now = timezone.now().time()

    # scope guards
    if discount.scope == 'happy_hour':
        if discount.start_time and discount.end_time:
            if not (discount.start_time <= now <= discount.end_time):
                return int(original_price)

    if discount.scope == 'inventory_based':
        if discount.minimum_stock and current_stock < discount.minimum_stock:
            return int(original_price)

    if discount.scope == 'first_n_items':
        if discount.max_quantity and quantity > discount.max_quantity:
            return int(original_price)

    # apply
    if discount.discount_type == 'percentage':
        off = original_price * float(discount.value) / 100
        return max(0, int(original_price - off))
    elif discount.discount_type == 'fixed_amount':
        return max(0, int(original_price - float(discount.value)))

    return int(original_price)


# ═══════════════════════════════════════
#  Stock helpers
# ═══════════════════════════════════════

def get_current_stock(kitchen_product):
    from .models import KitchenInventory
    try:
        return KitchenInventory.objects.get(
            kitchen_product=kitchen_product).available_quantity
    except KitchenInventory.DoesNotExist:
        return 0


# ═══════════════════════════════════════
#  Capacity Report
# ═══════════════════════════════════════

def get_capacity_report():
    from .models import KitchenProduct
    report = []
    for p in KitchenProduct.objects.filter(is_active=True).select_related('recipe'):
        mx, lim = calculate_max_production(p)
        report.append(dict(
            product_id=p.id,
            product_name=p.name,
            category=p.category,
            category_display=p.get_category_display(),
            max_production=mx,
            limiting_material=lim,
            current_stock=get_current_stock(p),
            selling_price=p.selling_price,
            cost=calculate_recipe_cost(p),
        ))
    return report


# ═══════════════════════════════════════
#  Dashboard
# ═══════════════════════════════════════

def generate_kitchen_dashboard():
    from .models import (
        KitchenProduct, KitchenInventory, ProductionBatch,
        KitchenDiscount, ProductionLog, ProductionPlan,
        WasteLog,  # ★ اضافه شد
    )
    from django.db.models import Sum

    today = timezone.now().date()

    # ---- products ----
    products = KitchenProduct.objects.select_related('recipe').all()
    products_data = []
    inventory_data = []  # ★ اضافه شد
    low_stock_list = []
    total_inv_value = 0

    for p in products:
        cost = calculate_recipe_cost(p)
        mx, lim = calculate_max_production(p)
        inv  = p.get_inventory()
        stock_val = inv.available_quantity * cost
        total_inv_value += stock_val

        # ★FIX: recipe ممکنه None باشه
        recipe_name = ''
        if p.recipe:
            try:
                recipe_name = p.recipe.food.name
            except Exception:
                recipe_name = ''

        pd = dict(
            id=p.id, name=p.name,
            category=p.category,
            category_display=p.get_category_display(),
            recipe_id=p.recipe_id,
            recipe_name=recipe_name,  # ★FIX
            description=p.description,
            selling_price=p.selling_price,
            cost=int(cost),
            profit=p.selling_price - int(cost),
            max_production=mx,
            limiting_material=lim,
            stock=inv.quantity,
            reserved=inv.reserved_quantity,
            available=inv.available_quantity,
            is_low_stock=inv.is_low_stock,
            low_stock_threshold=inv.low_stock_threshold,
            is_active=p.is_active,
        )
        products_data.append(pd)

        # ★ اضافه شد — inventory باید جداگانه هم باشه
        inventory_data.append(dict(
            id=inv.id,
            kitchen_product=p.id,
            product_name=p.name,
            quantity=inv.quantity,
            reserved_quantity=inv.reserved_quantity,
            available_quantity=inv.available_quantity,
            is_low_stock=inv.is_low_stock,
            low_stock_threshold=inv.low_stock_threshold,
        ))

        if inv.is_low_stock:
            low_stock_list.append(dict(
                id=p.id, name=p.name,
                stock=inv.available_quantity,
                threshold=inv.low_stock_threshold,
            ))

    # ---- today's production ----
    today_qs = ProductionBatch.objects.filter(produced_at__date=today)
    today_agg = today_qs.aggregate(
        total_qty=Sum('quantity_produced'),
        total_cost=Sum('production_cost'),
    )

    # ---- plans (last 20) ----
    plans = ProductionPlan.objects.prefetch_related(
        'items__kitchen_product').order_by('-date', '-created_at')[:20]
    plans_data = []
    for pl in plans:
        items = []
        for it in pl.items.select_related('kitchen_product').all():
            items.append(dict(
                id=it.id,
                product_id=it.kitchen_product_id,
                product_name=it.kitchen_product.name,
                quantity=it.quantity,
                required_materials=it.required_materials(),
            ))
        plans_data.append(dict(
            id=pl.id, date=str(pl.date),
            status=pl.status,
            status_display=pl.get_status_display(),
            created_by=pl.created_by.get_full_name() if pl.created_by else '',
            notes=pl.notes,
            items=items,
            created_at=pl.created_at.strftime('%Y-%m-%d %H:%M'),
        ))

    # ---- batches (last 30) ----
    batches = ProductionBatch.objects.select_related(
        'kitchen_product', 'produced_by').order_by('-produced_at')[:30]
    batches_data = []
    for b in batches:
        batches_data.append(dict(
            id=b.id,
            product_name=b.kitchen_product.name,
            quantity=b.quantity_produced,
            cost=b.production_cost,
            produced_by=b.produced_by.get_full_name() if b.produced_by else '',
            produced_at=b.produced_at.strftime('%Y-%m-%d %H:%M'),
            notes=b.notes,
        ))

    # ---- discounts ----
    discounts = KitchenDiscount.objects.select_related('kitchen_product').all()
    discounts_data = []
    for d in discounts:
        if d.expires_at and d.expires_at <= timezone.now() and d.is_active:
            d.is_active = False
            d.save(update_fields=['is_active'])

        discounts_data.append(dict(
            id=d.id, name=d.name,
            product_id=d.kitchen_product_id,
            product_name=d.kitchen_product.name if d.kitchen_product else 'همه',
            discount_type=d.discount_type,
            discount_type_display=d.get_discount_type_display(),
            scope=d.scope,
            scope_display=d.get_scope_display(),
            value=float(d.value),
            max_quantity=d.max_quantity,
            start_time=str(d.start_time) if d.start_time else None,
            end_time=str(d.end_time) if d.end_time else None,
            minimum_stock=d.minimum_stock,
            is_active=d.is_active,
            expires_at=d.expires_at.isoformat() if d.expires_at else None,
        ))

    # ---- logs (last 20) ----
    logs = ProductionLog.objects.select_related(
        'kitchen_product', 'user').order_by('-created_at')[:20]
    logs_data = []
    for lg in logs:
        logs_data.append(dict(
            id=lg.id,
            user=lg.user.get_full_name() if lg.user else '—',
            product=lg.kitchen_product.name if lg.kitchen_product else '—',
            action=lg.action,
            action_display=lg.get_action_display(),
            quantity=lg.quantity,
            materials=lg.materials_consumed,
            details=lg.details,
            created_at=lg.created_at.strftime('%Y-%m-%d %H:%M'),
        ))

    # ★ اضافه شد — waste
    waste_qs = WasteLog.objects.select_related(
        'kitchen_product').order_by('-created_at')[:50]
    waste_data = []
    for w in waste_qs:
        waste_data.append(dict(
            id=w.id,
            kitchen_product=w.kitchen_product_id,
            kitchen_product_name=w.kitchen_product.name if w.kitchen_product else '',
            quantity=w.quantity,
            reason=getattr(w, 'reason', ''),
            created_at=w.created_at.strftime('%Y-%m-%d %H:%M'),
        ))

    return dict(
        products=products_data,
        inventory=inventory_data,  # ★ اضافه شد
        plans=plans_data,
        batches=batches_data,
        discounts=discounts_data,
        logs=logs_data,
        waste=waste_data,  # ★ اضافه شد
        low_stock=low_stock_list,
        stats=dict(
            total_products=len(products_data),
            inventory_value=int(total_inv_value),
            today_qty=today_agg['total_qty'] or 0,
            today_cost=today_agg['total_cost'] or 0,
            low_stock_count=len(low_stock_list),
            active_discounts=sum(1 for d in discounts_data if d['is_active']),
        ),
    )