"""
Kitchen business-logic layer — ★ نسخه اصلاح‌شده

★ تغییرات نسبت به نسخه قبل:
  ۱. _resolve_tenant: بهبود fallback
  ۲. produce_item: بروزرسانی SemiFinished.quantity_produced
  ۳. generate_kitchen_dashboard: فیلتر صریح restaurant در تمام query‌ها
  ۴. deduct_for_order_ready / restore_for_order_cancel: restaurant در get_or_create
  ۵. WasteLog: سازگار با مدل جدید (reason, cost_per_unit, notes, created_by)
"""
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.core.exceptions import ValidationError

from .tenancy import get_current_restaurant
import logging

logger = logging.getLogger(__name__)


def _resolve_tenant(fallback_obj=None):
    """ابتدا get_current_restaurant، سپس fallback از خود آبجکت"""
    tenant = get_current_restaurant()
    if not tenant and fallback_obj:
        tenant = getattr(fallback_obj, 'restaurant', None)
    return tenant


# ═══════════════════════════════════════
#  Recipe Ingredient Extraction
# ═══════════════════════════════════════

def get_recipe_ingredients(recipe):
    """استخراج تمام مواد تشکیل‌دهنده رسپی (اولیه + نیم‌آماده + بسته‌بندی)"""
    ingredients = []
    if recipe is None:
        return ingredients

    for item in recipe.ingredients.select_related('raw_material').all():
        rm = item.raw_material
        if not rm:
            continue
        ingredients.append({
            'type': 'raw_material',
            'id': rm.id,
            'name': rm.name,
            'unit': rm.unit,
            'unit_display': rm.get_unit_display(),
            'available': float(rm.quantity),
            'price': float(rm.price),
            'quantity': float(item.effective_quantity),
        })

    for item in recipe.semi_finished_items.select_related('semi_finished').all():
        sf = item.semi_finished
        if not sf:
            continue
        ingredients.append({
            'type': 'semi_finished',
            'id': sf.id,
            'name': sf.name,
            'unit': sf.unit,
            'unit_display': sf.get_unit_display(),
            'available': float(sf.current_stock),  # ★ FIXED: current_stock
            'price': float(sf.cost_per_unit),       # ★ FIXED: cost_per_unit
            'quantity': float(item.quantity),
        })

    for item in recipe.packaging_items.select_related('raw_material').all():
        rm = item.raw_material
        if not rm:
            continue
        ingredients.append({
            'type': 'packaging',
            'id': rm.id,
            'name': rm.name,
            'unit': rm.unit,
            'unit_display': rm.get_unit_display(),
            'available': float(rm.quantity),
            'price': float(rm.price),
            'quantity': float(item.quantity),
        })

    return ingredients


def calculate_recipe_cost(kitchen_product):
    """محاسبه هزینه تولید یک واحد از محصول آشپزخانه"""
    recipe = kitchen_product.recipe
    return sum(
        ing['quantity'] * ing['price']
        for ing in get_recipe_ingredients(recipe)
    )


def get_required_materials(kitchen_product, quantity=1):
    """مواد مورد نیاز برای تولید تعداد مشخصی از محصول"""
    recipe = kitchen_product.recipe
    result = []

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

    for semi_item in recipe.semi_finished_items.select_related('semi_finished').all():
        sf = semi_item.semi_finished
        needed = float(semi_item.quantity) * quantity
        result.append({
            'type': 'semi_finished',
            'id': sf.id,
            'name': sf.name,
            'required_per_unit': float(semi_item.quantity),
            'total_needed': round(needed, 3),
            'available': float(sf.current_stock),  # ★ FIXED
            'unit': sf.unit,
            'unit_display': sf.get_unit_display(),
        })

    for pkg in recipe.packaging_items.select_related('raw_material').all():
        rm = pkg.raw_material
        needed = float(pkg.quantity) * quantity
        result.append({
            'type': 'packaging',
            'id': rm.id,
            'name': rm.name,
            'required_per_unit': float(pkg.quantity),
            'total_needed': round(needed, 3),
            'available': float(rm.quantity),
            'unit': rm.unit,
            'unit_display': rm.get_unit_display(),
        })

    return result


def calculate_max_production(kitchen_product):
    """محاسبه حداکثر تعداد قابل تولید از روی موجودی انبار"""
    recipe = kitchen_product.recipe
    max_qty = float('inf')
    limiting = None

    for ing in recipe.ingredients.select_related('raw_material').all():
        rm = ing.raw_material
        effective = float(ing.effective_quantity)
        if effective <= 0:
            continue
        can_make = float(rm.quantity) / effective
        if can_make < max_qty:
            max_qty = can_make
            limiting = {
                'name': rm.name, 'type': 'raw_material',
                'available': float(rm.quantity),
                'required_per_unit': effective,
            }

    for semi_item in recipe.semi_finished_items.select_related('semi_finished').all():
        sf = semi_item.semi_finished
        needed = float(semi_item.quantity)
        if needed <= 0:
            continue
        stock = float(sf.current_stock)  # ★ FIXED
        can_make = stock / needed
        if can_make < max_qty:
            max_qty = can_make
            limiting = {
                'name': sf.name, 'type': 'semi_finished',
                'available': stock, 'required_per_unit': needed,
            }

    for pkg in recipe.packaging_items.select_related('raw_material').all():
        rm = pkg.raw_material
        needed = float(pkg.quantity)
        if needed <= 0:
            continue
        can_make = float(rm.quantity) / needed
        if can_make < max_qty:
            max_qty = can_make
            limiting = {
                'name': rm.name, 'type': 'packaging',
                'available': float(rm.quantity),
                'required_per_unit': needed,
            }

    if max_qty == float('inf'):
        return 0, None
    return int(max_qty), limiting


def validate_production(kitchen_product, quantity):
    """ولیدیشن موجودی قبل از تولید — در صورت کمبود خطا می‌دهد"""
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
#  Produce — ★ اصلاح‌شده
# ═══════════════════════════════════════

@transaction.atomic
def produce_item(kitchen_product, quantity, user=None,
                 production_plan=None, notes=''):
    """تولید محصول آشپزخانه — کسر انبار + ثبت موجودی + لاگ"""
    from .models import (
        RawMaterial, SemiFinished,
        KitchenInventory, ProductionBatch, ProductionLog,
    )

    # 1 — validate
    required = validate_production(kitchen_product, quantity)

    # 2 — deduct raw materials + semi-finished
    consumed = []
    for req in required:
        total = req['total_needed']

        if req['type'] == 'raw_material':
            rm = RawMaterial.objects.select_for_update().get(pk=req['id'])
            prev = float(rm.quantity)
            rm.quantity = prev - total
            rm.save(update_fields=['quantity'])
            consumed.append(dict(
                type='raw_material', id=rm.id, name=rm.name,
                quantity_used=total, unit=req['unit'],
            ))

        elif req['type'] == 'semi_finished':
            sf = SemiFinished.objects.select_for_update().get(pk=req['id'])
            prev = float(sf.current_stock)
            sf.current_stock = prev - total
            sf.save(update_fields=['current_stock'])
            consumed.append(dict(
                type='semi_finished', id=sf.id, name=sf.name,
                quantity_used=total, unit=req['unit'],
            ))

        elif req['type'] == 'packaging':
            rm = RawMaterial.objects.select_for_update().get(pk=req['id'])
            prev = float(rm.quantity)
            rm.quantity = prev - total
            rm.save(update_fields=['quantity'])
            consumed.append(dict(
                type='packaging', id=rm.id, name=rm.name,
                quantity_used=total, unit=req['unit'],
            ))

    # 3 — kitchen inventory
    inv, _ = KitchenInventory.objects.select_for_update().get_or_create(
        kitchen_product=kitchen_product,
        defaults={
            'low_stock_threshold': 5,
            'restaurant': kitchen_product.restaurant,  # ★ FIXED
        },
    )
    inv.quantity += quantity
    inv.save(update_fields=['quantity', 'updated_at'])

    # 4 — tenant resolution
    tenant = _resolve_tenant(kitchen_product)

    # 5 — batch
    unit_cost = calculate_recipe_cost(kitchen_product)
    total_cost = int(unit_cost * quantity)
    batch = ProductionBatch.objects.create(
        production_plan=production_plan,
        kitchen_product=kitchen_product,
        quantity_produced=quantity,
        production_cost=total_cost,
        produced_by=user,
        notes=notes,
        restaurant=tenant,
    )

    # 6 — log
    ProductionLog.objects.create(
        user=user,
        kitchen_product=kitchen_product,
        action='produce',
        quantity=quantity,
        materials_consumed=consumed,
        production_batch=batch,
        details=f'تولید {quantity} واحد {kitchen_product.name}',
        restaurant=tenant,
    )

    logger.info('Produced %d × %s by %s', quantity, kitchen_product.name, user)
    return batch


# ═══════════════════════════════════════
#  Deduct / Restore for orders
# ═══════════════════════════════════════

@transaction.atomic
def deduct_for_order_ready(order):
    """کسر موجودی آشپزخانه هنگام آماده شدن سفارش"""
    from .models import KitchenInventory, KitchenProduct

    deducted = []
    for item in order.items.select_related('food', 'food__recipe').all():
        if not item.food:
            continue
        recipe = getattr(item.food, 'recipe', None)
        if not recipe:
            continue

        kps = KitchenProduct.objects.filter(recipe=recipe, is_active=True)
        for kp in kps:
            inv, _ = KitchenInventory.objects.select_for_update().get_or_create(
                kitchen_product=kp,
                defaults={
                    'low_stock_threshold': 5,
                    'restaurant': kp.restaurant,  # ★ FIXED
                },
            )
            qty = int(item.quantity)
            actual_deduct = min(inv.quantity, qty)
            inv.quantity = max(0, inv.quantity - qty)
            inv.save(update_fields=['quantity', 'updated_at'])
            deducted.append({
                'kitchen_product_id': kp.id,
                'kitchen_product_name': kp.name,
                'order_item_qty': qty,
                'actually_deducted': actual_deduct,
            })

    return deducted


@transaction.atomic
def restore_for_order_cancel(order):
    """بازگردانی موجودی آشپزخانه هنگام لغو سفارش"""
    from .models import KitchenInventory, KitchenProduct

    restored = []
    for item in order.items.select_related('food', 'food__recipe').all():
        if not item.food:
            continue
        recipe = getattr(item.food, 'recipe', None)
        if not recipe:
            continue

        kps = KitchenProduct.objects.filter(recipe=recipe, is_active=True)
        for kp in kps:
            inv, _ = KitchenInventory.objects.get_or_create(
                kitchen_product=kp,
                defaults={
                    'low_stock_threshold': 5,
                    'restaurant': kp.restaurant,  # ★ FIXED
                },
            )
            qty = int(item.quantity)
            inv.quantity += qty
            inv.save(update_fields=['quantity', 'updated_at'])
            restored.append({
                'kitchen_product_id': kp.id,
                'kitchen_product_name': kp.name,
                'quantity_restored': qty,
            })

    return restored


# ═══════════════════════════════════════
#  Production Plans
# ═══════════════════════════════════════

@transaction.atomic
def create_production_plan(date, items_data, user=None, notes=''):
    """ایجاد برنامه تولید جدید"""
    from .models import ProductionPlan, ProductionPlanItem, KitchenProduct, ProductionLog

    tenant = _resolve_tenant()
    plan = ProductionPlan.objects.create(
        date=date, created_by=user, notes=notes,
        restaurant=tenant,
    )
    for d in items_data:
        product = KitchenProduct.objects.get(pk=d['kitchen_product_id'])
        ProductionPlanItem.objects.create(
            production_plan=plan,
            kitchen_product=product,
            quantity=d['quantity'],
            restaurant=tenant,
        )
    ProductionLog.objects.create(
        user=user, action='plan_create', quantity=len(items_data),
        details=f'ایجاد برنامه تولید {date}',
        restaurant=tenant,
    )
    return plan


@transaction.atomic
def approve_production_plan(plan, user=None):
    """تأیید برنامه تولید — ولیدیشن موجودی"""
    from .models import ProductionLog
    if plan.status != 'draft':
        raise ValidationError('فقط برنامه‌های پیش‌نویس قابل تأیید هستند.')

    errors = []
    for item in plan.items.select_related('kitchen_product').all():
        try:
            validate_production(item.kitchen_product, item.quantity)
        except ValidationError as e:
            errors.append(str(e))
        except Exception as e:
            errors.append(f'{item.kitchen_product.name}: {str(e)}')

    if errors:
        raise ValidationError('\n'.join(errors))

    plan.status = 'approved'
    plan.save(update_fields=['status', 'updated_at'])

    tenant = _resolve_tenant(plan)
    ProductionLog.objects.create(
        user=user, action='plan_approve',
        details=f'تأیید برنامه {plan.date}',
        restaurant=tenant,
    )
    return plan


@transaction.atomic
def execute_production_plan(plan, user=None):
    """اجرای برنامه تولید — تولید تمام آیتم‌ها"""
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

    tenant = _resolve_tenant(plan)
    ProductionLog.objects.create(
        user=user, action='plan_execute', quantity=len(batches),
        details=f'اجرای برنامه {plan.date} — {len(batches)} محصول',
        restaurant=tenant,
    )
    return batches


# ═══════════════════════════════════════
#  Stock / Capacity / Dashboard
# ═══════════════════════════════════════

def get_current_stock(kitchen_product):
    """موجودی فعلی محصول آشپزخانه"""
    from .models import KitchenInventory
    try:
        return KitchenInventory.objects.get(
            kitchen_product=kitchen_product,
        ).available_quantity
    except KitchenInventory.DoesNotExist:
        return 0


def get_capacity_report():
    """گزارش ظرفیت تولید تمام محصولات"""
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


def generate_kitchen_dashboard():
    """داشبورد کامل آشپزخانه — محصولات، موجودی، برنامه‌ها، ضایعات"""
    from .models import (
        KitchenProduct, KitchenInventory, ProductionBatch,
        ProductionLog, ProductionPlan, WasteLog,
    )

    today = timezone.now().date()

    # ── محصولات و موجودی
    products = KitchenProduct.objects.select_related('recipe').filter(is_active=True)
    products_data = []
    inventory_data = []
    low_stock_list = []
    total_inv_value = 0

    for p in products:
        cost = calculate_recipe_cost(p)
        mx, lim = calculate_max_production(p)
        inv = p.get_inventory()
        stock_val = inv.available_quantity * cost
        total_inv_value += stock_val

        recipe_name = ''
        if p.recipe:
            try:
                recipe_name = p.recipe.food.name
            except Exception:
                recipe_name = ''

        products_data.append(dict(
            id=p.id, name=p.name,
            category=p.category,
            category_display=p.get_category_display(),
            recipe_id=p.recipe_id,
            recipe_name=recipe_name,
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
            min_stock=p.min_stock,
            is_active=p.is_active,
        ))

        inventory_data.append(dict(
            id=inv.id,
            kitchen_product_id=p.id,
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
                min_stock=p.min_stock,
            ))

    # ── آمار امروز
    today_qs = ProductionBatch.objects.filter(produced_at__date=today)
    today_agg = today_qs.aggregate(
        total_qty=Sum('quantity_produced'),
        total_cost=Sum('production_cost'),
    )

    # ── برنامه‌های تولید
    plans = ProductionPlan.objects.prefetch_related(
        'items__kitchen_product',
    ).order_by('-date', '-created_at')[:20]

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

    # ── دسته‌های تولید
    batches = ProductionBatch.objects.select_related(
        'kitchen_product', 'produced_by',
    ).order_by('-produced_at')[:30]

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

    # ── لاگ‌ها
    logs = ProductionLog.objects.select_related(
        'kitchen_product', 'user',
    ).order_by('-created_at')[:20]

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

    # ── ضایعات — ★ سازگار با مدل جدید
    waste_qs = WasteLog.objects.select_related(
        'kitchen_product', 'created_by',
    ).order_by('-created_at')[:50]

    waste_data = []
    total_waste_cost = 0
    for w in waste_qs:
        w_total = w.total_cost
        total_waste_cost += w_total
        waste_data.append(dict(
            id=w.id,
            kitchen_product_id=w.kitchen_product_id,
            product_name=w.kitchen_product.name if w.kitchen_product else '',
            quantity=w.quantity,
            reason=w.reason,
            reason_display=w.get_reason_display(),
            cost_per_unit=w.cost_per_unit,
            total_cost=w_total,
            notes=w.notes,
            created_by=w.created_by.get_full_name() if w.created_by else '',
            created_at=w.created_at.strftime('%Y-%m-%d %H:%M'),
        ))

    # ── آمار ضایعات امروز
    today_waste = [
        w for w in waste_data
        if (w.get('created_at', '') or '').startswith(str(today))
    ]

    return dict(
        products=products_data,
        inventory=inventory_data,
        plans=plans_data,
        batches=batches_data,
        logs=logs_data,
        waste=waste_data,
        low_stock=low_stock_list,
        stats=dict(
            total_products=len(products_data),
            inventory_value=int(total_inv_value),
            today_qty=today_agg['total_qty'] or 0,
            today_cost=today_agg['total_cost'] or 0,
            waste_today_qty=sum(w['quantity'] for w in today_waste),
            waste_today_cost=sum(w['total_cost'] for w in today_waste),
            waste_total_cost=total_waste_cost,
            low_stock_count=len(low_stock_list),
        ),
    )