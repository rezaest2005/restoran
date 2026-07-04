"""
Restaurant — Loyalty System Services
=====================================
هر تابع یک عملیات کامل:
  - ولیدیشن
  - اجرای منطق
  - ثبت تراکنش / نوتیفیکیشن
  - برگشت نتیجه
"""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Sum, Count, F
from django.utils import timezone

from .models import (
    CustomerProfile,
    MembershipLevel,
    LoyaltyTransaction,
    LoyaltyWallet,
    WalletTransaction,
    Coupon,
    CustomerCoupon,
    Reward,
    RewardRedemption,
    Referral,
    LoyaltyNotification,
    Order,
    LOYALTY_POINTS_PER_TOMAN,
    LOYALTY_POINTS_PER_ORDER_BONUS,
    LOYALTY_BIRTHDAY_BONUS,
    LOYALTY_REFERRAL_BONUS,
    LOYALTY_MAX_WALLET,
)


# ══════════════════════════════════════════════════════════════════════════════
#  1. CUSTOMER REGISTRATION & AUTH
# ══════════════════════════════════════════════════════════════════════════════

def register_customer(
    phone: str,
    first_name: str = '',
    last_name: str = '',
    email: str = '',
    birth_date=None,
    referral_code: str = '',
) -> dict:
    """ثبت‌نام مشتری جدید."""
    existing = CustomerProfile.objects.filter(phone=phone).first()
    if existing:
        return {
            'success': False,
            'error': 'این شماره قبلاً ثبت‌نام کرده است.',
            'customer': existing,
        }

    with db_transaction.atomic():
        customer = CustomerProfile.objects.create(
            phone=phone,
            first_name=first_name,
            last_name=last_name,
            email=email,
            birth_date=birth_date,
        )

        LoyaltyWallet.objects.create(customer=customer, balance=0)

        default_level = MembershipLevel.objects.filter(name='bronze').first()
        if default_level:
            customer.membership_level = default_level
            customer.save(update_fields=['membership_level'])

        referral_result = None
        if referral_code:
            referral_result = _process_referral(customer, referral_code)

        _create_notification(
            customer=customer,
            notification_type='welcome',
            title='خوش آمدید!',
            message=f'{customer.full_name or "مشتری عزیز"}، به باشگاه مشتریان خوش آمدید!',
            channel='in_app',
        )

    return {
        'success': True,
        'customer': customer,
        'referral': referral_result,
    }


def get_or_create_customer(phone: str) -> tuple:
    """دریافت مشتری موجود یا ایجاد خودکار."""
    customer, created = CustomerProfile.objects.get_or_create(
        phone=phone,
        defaults={'first_name': ''},
    )
    if created:
        LoyaltyWallet.objects.create(customer=customer, balance=0)
        default_level = MembershipLevel.objects.filter(name='bronze').first()
        if default_level:
            customer.membership_level = default_level
            customer.save(update_fields=['membership_level'])
    return customer, created


# ══════════════════════════════════════════════════════════════════════════════
#  2. EARN POINTS
# ══════════════════════════════════════════════════════════════════════════════

def earn_points_for_order(customer: CustomerProfile, order_id: int, order_amount: Decimal) -> dict:
    """اعطای امتیاز بابت سفارش تکمیل‌شده."""
    if order_amount <= 0:
        return {'success': False, 'error': 'مبلغ سفارش نامعتبر است.'}

    with db_transaction.atomic():
        multiplier = Decimal('1')
        if customer.membership_level:
            multiplier = customer.membership_level.points_multiplier

        base_points = (order_amount / Decimal('1000')) * LOYALTY_POINTS_PER_TOMAN
        bonus = Decimal(str(LOYALTY_POINTS_PER_ORDER_BONUS))
        total_earned = int((base_points * multiplier) + bonus)

        customer.total_points = F('total_points') + total_earned
        customer.available_points = F('available_points') + total_earned
        customer.total_spending = F('total_spending') + order_amount
        customer.total_orders = F('total_orders') + 1
        customer.save(update_fields=[
            'total_points', 'available_points', 'total_spending', 'total_orders',
        ])
        customer.refresh_from_db()

        LoyaltyTransaction.objects.create(
            customer=customer,
            transaction_type='earn',
            points=total_earned,
            balance_after=customer.available_points,
            description=f'کسب امتیاز از سفارش #{order_id}',
            order_id=order_id,
        )

        level_result = check_level_upgrade(customer)

        _create_notification(
            customer=customer,
            notification_type='points_earned',
            title='امتیاز کسب کردید!',
            message=f'{total_earned} امتیاز از سفارش #{order_id} کسب کردید.',
            data={'order_id': order_id, 'points': total_earned},
        )

    return {
        'success': True,
        'points_earned': total_earned,
        'total_points': customer.total_points,
        'available_points': customer.available_points,
        'level_upgraded': level_result.get('upgraded', False),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  3. REDEEM POINTS
# ══════════════════════════════════════════════════════════════════════════════

def redeem_points(customer: CustomerProfile, points: int, order_id: int = None) -> dict:
    """استفاده از امتیاز. هر ۱۰۰ امتیاز = ۱۰,۰۰۰ تومان."""
    if points <= 0:
        return {'success': False, 'error': 'مقدار امتیاز نامعتبر است.'}

    if customer.available_points < points:
        return {
            'success': False,
            'error': f'امتیاز کافی نیست. موجودی: {customer.available_points}',
        }

    REDEMPTION_RATE = Decimal('100')
    REDEMPTION_VALUE = Decimal('10000')

    with db_transaction.atomic():
        discount_amount = int((Decimal(str(points)) / REDEMPTION_RATE) * REDEMPTION_VALUE)

        customer.available_points = F('available_points') - points
        customer.save(update_fields=['available_points'])
        customer.refresh_from_db()

        LoyaltyTransaction.objects.create(
            customer=customer,
            transaction_type='redeem',
            points=points,
            balance_after=customer.available_points,
            description=f'استفاده {points} امتیاز ({discount_amount:,} تومان تخفیف)',
            order_id=order_id,
        )

        _create_notification(
            customer=customer,
            notification_type='points_redeemed',
            title='امتیاز استفاده شد!',
            message=f'{points} امتیاز معادل {discount_amount:,} تومان تخفیف اعمال شد.',
            data={'points': points, 'discount': discount_amount},
        )

    return {
        'success': True,
        'points_used': points,
        'discount_amount': discount_amount,
        'remaining_points': customer.available_points,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  4. WALLET OPERATIONS
# ══════════════════════════════════════════════════════════════════════════════

def wallet_deposit(customer: CustomerProfile, amount: Decimal, description: str = '') -> dict:
    """شارژ کیف پول."""
    if amount <= 0:
        return {'success': False, 'error': 'مبلغ نامعتبر است.'}

    with db_transaction.atomic():
        wallet, _ = LoyaltyWallet.objects.get_or_create(customer=customer, defaults={'balance': 0})

        new_balance = wallet.balance + amount
        if new_balance > LOYALTY_MAX_WALLET:
            return {
                'success': False,
                'error': f'سقف موجودی کیف پول {LOYALTY_MAX_WALLET:,} تومان است.',
            }

        wallet.balance = F('balance') + amount
        wallet.save(update_fields=['balance'])
        wallet.refresh_from_db()

        WalletTransaction.objects.create(
            wallet=wallet,
            transaction_type='deposit',
            amount=amount,
            balance_after=wallet.balance,
            description=description or f'شارژ کیف پول — {amount:,} تومان',
        )

        _create_notification(
            customer=customer,
            notification_type='wallet',
            title='کیف پول شارژ شد',
            message=f'{amount:,} تومان اضافه شد. موجودی: {wallet.balance:,} تومان',
            data={'amount': str(amount), 'balance': str(wallet.balance)},
        )

    return {'success': True, 'amount': amount, 'new_balance': wallet.balance}


def wallet_debit(customer: CustomerProfile, amount: Decimal, description: str = '', order_id: int = None) -> dict:
    """برداشت از کیف پول."""
    if amount <= 0:
        return {'success': False, 'error': 'مبلغ نامعتبر است.'}

    with db_transaction.atomic():
        wallet = LoyaltyWallet.objects.filter(customer=customer).first()
        if not wallet:
            return {'success': False, 'error': 'کیف پول یافت نشد.'}

        if wallet.balance < amount:
            return {
                'success': False,
                'error': f'موجودی کافی نیست. موجودی: {wallet.balance:,} تومان',
            }

        wallet.balance = F('balance') - amount
        wallet.save(update_fields=['balance'])
        wallet.refresh_from_db()

        WalletTransaction.objects.create(
            wallet=wallet,
            transaction_type='purchase',
            amount=amount,
            balance_after=wallet.balance,
            description=description or f'پرداخت از کیف پول — {amount:,} تومان',
            order_id=order_id,
        )

    return {'success': True, 'amount': amount, 'new_balance': wallet.balance}


def add_cashback(customer: CustomerProfile, order_amount: Decimal, order_id: int = None) -> dict:
    """کش‌بک بر اساس سطح مشتری — با رعایت سقف کیف پول."""
    if not customer.membership_level:
        return {'success': False, 'error': 'سطح عضویت تعیین نشده.'}

    rate = customer.membership_level.cashback_rate
    if rate <= 0:
        return {'success': True, 'cashback': 0, 'message': 'کش‌بک فعال نیست.'}

    cashback_amount = int(order_amount * rate)

    with db_transaction.atomic():
        wallet, _ = LoyaltyWallet.objects.get_or_create(customer=customer, defaults={'balance': 0})

        # ★ فیکس: بررسی سقف کیف پول قبل از واریز کش‌بک
        if wallet.balance + cashback_amount > LOYALTY_MAX_WALLET:
            cashback_amount = max(0, LOYALTY_MAX_WALLET - wallet.balance)
            if cashback_amount <= 0:
                return {
                    'success': True,
                    'cashback': 0,
                    'message': 'کیف پول پر است. کش‌بک اعمال نشد.',
                    'new_balance': int(wallet.balance),
                }

        wallet.balance = F('balance') + cashback_amount
        wallet.save(update_fields=['balance'])
        wallet.refresh_from_db()

        WalletTransaction.objects.create(
            wallet=wallet,
            transaction_type='cashback',
            amount=cashback_amount,
            balance_after=wallet.balance,
            description=f'کش‌بک سفارش #{order_id} — نرخ {rate * 100}%',
            order_id=order_id,
        )

    return {'success': True, 'cashback': cashback_amount, 'new_balance': wallet.balance}


# ══════════════════════════════════════════════════════════════════════════════
#  5. COUPON SYSTEM
# ══════════════════════════════════════════════════════════════════════════════

def validate_coupon(code: str, customer: CustomerProfile, order_amount: Decimal) -> dict:
    """اعتبارسنجی کوپن — فقط ولیدیشن، تخفیف محاسبه میشه."""
    coupon = Coupon.objects.filter(code__iexact=code).first()
    if not coupon:
        return {'valid': False, 'error': 'کد کوپن نامعتبر است.'}

    if not coupon.is_valid:
        return {'valid': False, 'error': 'این کوپن منقضی شده یا غیرفعال است.'}

    if order_amount < coupon.min_order_amount:
        return {
            'valid': False,
            'error': f'حداقل مبلغ سفارش {coupon.min_order_amount:,} تومان است.',
        }

    if coupon.applicable_levels.exists():
        if not customer.membership_level or customer.membership_level not in coupon.applicable_levels.all():
            return {'valid': False, 'error': 'سطح عضویت شما برای این کوپن مجاز نیست.'}

    usage = CustomerCoupon.objects.filter(customer=customer, coupon=coupon).first()
    if usage and usage.used_count >= coupon.max_uses_per_customer:
        return {'valid': False, 'error': 'شما قبلاً از این کوپن استفاده کرده‌اید.'}

    discount = coupon.calculate_discount(order_amount)

    return {
        'valid': True,
        'coupon': coupon,
        'discount': int(discount),
        'coupon_type': coupon.coupon_type,
        'discount_type': coupon.discount_type,
    }


def apply_coupon(code: str, customer: CustomerProfile, order_amount: Decimal, order_id: int = None) -> dict:
    """اعمال کوپن — فقط ثبت استفاده، تخفیف از validate میاد."""
    validation = validate_coupon(code, customer, order_amount)
    if not validation['valid']:
        return {'success': False, 'error': validation['error']}

    coupon = validation['coupon']
    discount = validation['discount']

    with db_transaction.atomic():
        coupon.used_count = F('used_count') + 1
        coupon.save(update_fields=['used_count'])

        usage, created = CustomerCoupon.objects.get_or_create(customer=customer, coupon=coupon)
        usage.used_count = F('used_count') + 1
        if not usage.first_used_at:
            usage.first_used_at = timezone.now()
        usage.last_used_at = timezone.now()
        usage.save()

        _create_notification(
            customer=customer,
            notification_type='coupon',
            title='کوپن اعمال شد!',
            message=f'کوپن "{coupon.name}" — تخفیف {discount:,} تومان.',
            data={'coupon_code': coupon.code, 'discount': discount},
        )

    return {
        'success': True,
        'coupon_code': coupon.code,
        'discount': discount,
        'final_amount': max(0, int(order_amount) - discount),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  6. REWARDS
# ══════════════════════════════════════════════════════════════════════════════

def redeem_reward(customer: CustomerProfile, reward_id: int) -> dict:
    """معاوضه جایزه با امتیاز."""
    reward = Reward.objects.filter(id=reward_id, is_active=True).first()
    if not reward:
        return {'success': False, 'error': 'جایزه یافت نشد یا غیرفعال است.'}

    if not reward.is_available:
        return {'success': False, 'error': 'این جایزه موجود نیست.'}

    if customer.available_points < reward.points_required:
        return {
            'success': False,
            'error': f'امتیاز کافی نیست. نیاز: {reward.points_required}, موجود: {customer.available_points}',
        }

    if reward.min_membership_level:
        level_order = {'bronze': 0, 'silver': 1, 'gold': 2, 'vip': 3}
        customer_rank = level_order.get(customer.membership_level.name, 0) if customer.membership_level else 0
        required_rank = level_order.get(reward.min_membership_level.name, 0)
        if customer_rank < required_rank:
            return {
                'success': False,
                'error': f'حداقل سطح مورد نیاز: {reward.min_membership_level.title}',
            }

    with db_transaction.atomic():
        customer.available_points = F('available_points') - reward.points_required
        customer.save(update_fields=['available_points'])
        customer.refresh_from_db()

        redemption = RewardRedemption.objects.create(
            customer=customer,
            reward=reward,
            points_spent=reward.points_required,
            status='approved',
        )

        if reward.quantity_available > 0:
            reward.quantity_available = F('quantity_available') - 1
            reward.save(update_fields=['quantity_available'])

        LoyaltyTransaction.objects.create(
            customer=customer,
            transaction_type='redeem',
            points=reward.points_required,
            balance_after=customer.available_points,
            description=f'معاوضه جایزه: {reward.name}',
        )

        _create_notification(
            customer=customer,
            notification_type='points_redeemed',
            title='جایزه دریافت شد!',
            message=f'جایزه "{reward.name}" با موفقیت دریافت شد.',
            data={'reward_id': reward.id, 'points_spent': str(reward.points_required)},
        )

    return {
        'success': True,
        'redemption_id': redemption.id,
        'reward_name': reward.name,
        'points_spent': reward.points_required,
        'remaining_points': customer.available_points,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  7. LEVEL UPGRADE
# ══════════════════════════════════════════════════════════════════════════════

def check_level_upgrade(customer: CustomerProfile) -> dict:
    """بررسی و ارتقاء خودکار سطح مشتری."""
    levels = MembershipLevel.objects.order_by('-order')
    current_level = customer.membership_level
    upgraded = False
    new_level = None

    for level in levels:
        meets_spending = customer.total_spending >= level.min_spending
        meets_points = customer.total_points >= level.min_points

        if meets_spending and meets_points:
            # ★ فقط اگه سطح جدید بالاتر از فعلی باشه
            if not current_level or level.order > current_level.order:
                customer.membership_level = level
                customer.save(update_fields=['membership_level'])
                new_level = level
                upgraded = True

                _create_notification(
                    customer=customer,
                    notification_type='level_up',
                    title='ارتقاء سطح!',
                    message=f'تبریک! سطح شما به «{level.title}» ارتقاء یافت!',
                    data={
                        'old_level': current_level.name if current_level else None,
                        'new_level': level.name,
                        'benefits': {
                            'discount': level.discount_percent,
                            'multiplier': float(level.points_multiplier),
                            'free_delivery': level.free_delivery,
                        },
                    },
                )
            break  # بالاترین سطح واجد شرط پیدا شد

    return {
        'upgraded': upgraded,
        'new_level': new_level,
        'current_level': customer.membership_level,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  8. REFERRAL SYSTEM
# ══════════════════════════════════════════════════════════════════════════════

def _process_referral(new_customer: CustomerProfile, referral_code: str) -> dict:
    """پردازش کد دعوت."""
    referrer = CustomerProfile.objects.filter(
        referral_code__iexact=referral_code,
        is_active=True,
    ).first()

    if not referrer:
        return {'success': False, 'error': 'کد دعوت نامعتبر است.'}

    if referrer.id == new_customer.id:
        return {'success': False, 'error': 'نمی‌توانید از کد خودتان استفاده کنید.'}

    with db_transaction.atomic():
        bonus = Decimal(str(LOYALTY_REFERRAL_BONUS))

        referral = Referral.objects.create(
            referrer=referrer,
            referred=new_customer,
            referral_code=referral_code,
            bonus_points=bonus,
            is_rewarded=True,
            rewarded_at=timezone.now(),
        )

        new_customer.referred_by = referrer
        new_customer.save(update_fields=['referred_by'])

        # امتیاز به دعوت‌کننده
        referrer.total_points = F('total_points') + bonus
        referrer.available_points = F('available_points') + bonus
        referrer.save(update_fields=['total_points', 'available_points'])
        referrer.refresh_from_db()

        LoyaltyTransaction.objects.create(
            customer=referrer,
            transaction_type='referral',
            points=bonus,
            balance_after=referrer.available_points,
            description=f'جایزه دعوت — {new_customer.full_name or new_customer.phone}',
        )

        # امتیاز به مشتری جدید
        new_customer.total_points = F('total_points') + bonus
        new_customer.available_points = F('available_points') + bonus
        new_customer.save(update_fields=['total_points', 'available_points'])
        new_customer.refresh_from_db()

        LoyaltyTransaction.objects.create(
            customer=new_customer,
            transaction_type='referral',
            points=bonus,
            balance_after=new_customer.available_points,
            description=f'جایزه ثبت‌نام با کد دعوت {referral_code}',
        )

        _create_notification(
            customer=referrer,
            notification_type='referral',
            title='دعوت موفق!',
            message=f'{new_customer.full_name or "مشتری جدید"} با کد شما ثبت‌نام کرد. {bonus} امتیاز!',
            data={'referred_phone': new_customer.phone},
        )

    return {'success': True, 'referral_id': referral.id, 'bonus': int(bonus)}


# ══════════════════════════════════════════════════════════════════════════════
#  9. BIRTHDAY BONUS
# ══════════════════════════════════════════════════════════════════════════════

def check_and_grant_birthday_bonus(customer: CustomerProfile) -> dict:
    """بررسی تولد و اعطای امتیاز هدیه."""
    if not customer.is_birthday_today:
        return {'success': False, 'message': 'امروز تولد این مشتری نیست.'}

    today = timezone.now().date()
    already_received = LoyaltyTransaction.objects.filter(
        customer=customer,
        transaction_type='birthday',
        created_at__date=today,
    ).exists()

    if already_received:
        return {'success': False, 'message': 'هدیه تولد امروز قبلاً دریافت شده.'}

    bonus = Decimal(str(LOYALTY_BIRTHDAY_BONUS))

    with db_transaction.atomic():
        customer.total_points = F('total_points') + bonus
        customer.available_points = F('available_points') + bonus
        customer.save(update_fields=['total_points', 'available_points'])
        customer.refresh_from_db()

        LoyaltyTransaction.objects.create(
            customer=customer,
            transaction_type='birthday',
            points=bonus,
            balance_after=customer.available_points,
            description='هدیه تولد',
        )

        _create_notification(
            customer=customer,
            notification_type='birthday',
            title='تولدت مبارک!',
            message=f'{bonus} امتیاز هدیه تولد به حساب شما اضافه شد!',
            data={'bonus': str(bonus)},
        )

    return {'success': True, 'bonus': int(bonus), 'remaining_points': customer.available_points}


def run_birthday_check_all() -> int:
    """بررسی تولد تمام مشتریان — برای cron job."""
    today = timezone.now().date()
    birthday_customers = CustomerProfile.objects.filter(
        is_active=True,
        birth_date__month=today.month,
        birth_date__day=today.day,
    )
    count = 0
    for customer in birthday_customers:
        result = check_and_grant_birthday_bonus(customer)
        if result['success']:
            count += 1
    return count


# ══════════════════════════════════════════════════════════════════════════════
#  10. ★ FULL ORDER PROCESSING — فیکس اصلی
# ══════════════════════════════════════════════════════════════════════════════

def process_order_loyalty(
    phone: str,
    order_id: int,
    order_amount: Decimal,
    coupon_code: str = '',
    use_wallet: Decimal = Decimal('0'),
    redeem_points_count: int = 0,
) -> dict:
    """
    ★ پردازش کامل باشگاه مشتریان — در یک تراکنش اتمیک

    ترتیب: ولیدیشن → کوپن → امتیاز → کیف پول → ثبت نهایی → کسب امتیاز → کش‌بک
    """
    customer, created = get_or_create_customer(phone)

    result = {
        'customer_id': customer.id,
        'created_new': created,
        'coupon': None,
        'wallet': None,
        'points_redeemed': None,
        'points_earned': None,
        'cashback': None,
        'level_up': None,
        'final_amount': int(order_amount),
        'errors': [],
    }

    # ★ فیکس: کل عملیات در یک تراکنش اتمیک
    try:
        with db_transaction.atomic():
            remaining = order_amount

            # ── ۱. اعمال کوپن
            if coupon_code:
                coupon_result = apply_coupon(coupon_code, customer, remaining, order_id)
                if coupon_result['success']:
                    result['coupon'] = {
                        'code': coupon_result['coupon_code'],
                        'discount': coupon_result['discount'],
                    }
                    remaining = Decimal(str(coupon_result['final_amount']))
                else:
                    result['errors'].append(f"کوپن: {coupon_result['error']}")

            # ── ۲. استفاده از امتیاز
            if redeem_points_count > 0:
                points_result = redeem_points(customer, redeem_points_count, order_id)
                if points_result['success']:
                    result['points_redeemed'] = {
                        'points': redeem_points_count,
                        'discount': points_result['discount_amount'],
                    }
                    remaining = max(Decimal('0'), remaining - Decimal(str(points_result['discount_amount'])))
                else:
                    result['errors'].append(f"امتیاز: {points_result['error']}")

            # ── ۳. استفاده از کیف پول
            if use_wallet > 0:
                wallet_amount = min(use_wallet, remaining)
                if wallet_amount > 0:
                    wallet_result = wallet_debit(customer, wallet_amount, f'پرداخت سفارش #{order_id}', order_id)
                    if wallet_result['success']:
                        result['wallet'] = {
                            'amount': int(wallet_amount),
                            'new_balance': int(wallet_result['new_balance']),
                        }
                        remaining -= wallet_amount
                    else:
                        result['errors'].append(f"کیف پول: {wallet_result['error']}")

            result['final_amount'] = max(0, int(remaining))

            # ── ۴. کسب امتیاز (از مبلغ نهایی)
            # ★ فیکس: فقط اگه مبلغی پرداخت شده امتیاز بده
            if remaining > 0:
                points_result = earn_points_for_order(customer, order_id, remaining)
                if points_result['success']:
                    result['points_earned'] = {
                        'points': points_result['points_earned'],
                        'total': int(points_result['total_points']),
                    }
                    result['level_up'] = points_result.get('level_upgraded', False)

            # ── ۵. کش‌بک
            if remaining > 0:
                cashback_result = add_cashback(customer, remaining, order_id)
                if cashback_result.get('cashback', 0) > 0:
                    result['cashback'] = {
                        'amount': cashback_result['cashback'],
                        'new_balance': int(cashback_result['new_balance']),
                    }

    except Exception as e:
        # ★ فیکس: اگه خطای غیرمنتظره بود، کل تراکنش rollback میشه
        result['errors'].append(f'خطای غیرمنتظره: {str(e)}')

    return result


# ══════════════════════════════════════════════════════════════════════════════
#  11. DASHBOARD & ANALYTICS
# ══════════════════════════════════════════════════════════════════════════════

def get_loyalty_dashboard() -> dict:
    """آمار کلی باشگاه مشتریان."""
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_customers = CustomerProfile.objects.filter(is_active=True).count()
    new_this_month = CustomerProfile.objects.filter(joined_at__gte=month_start).count()

    total_points_issued = LoyaltyTransaction.objects.filter(
        transaction_type__in=['earn', 'referral', 'birthday', 'cashback', 'bonus']
    ).aggregate(total=Sum('points'))['total'] or 0

    total_points_redeemed = LoyaltyTransaction.objects.filter(
        transaction_type='redeem'
    ).aggregate(total=Sum('points'))['total'] or 0

    level_distribution = list(
        MembershipLevel.objects
        .annotate(customer_count=Count('customers'))
        .values('name', 'title', 'customer_count')
        .order_by('order')
    )

    wallet_total = LoyaltyWallet.objects.aggregate(total=Sum('balance'))['total'] or 0

    top_customers = list(
        CustomerProfile.objects
        .filter(is_active=True)
        .order_by('-total_spending')[:10]
        .values('phone', 'first_name', 'last_name', 'total_spending', 'total_points', 'membership_level__title')
    )

    return {
        'total_customers': total_customers,
        'new_this_month': new_this_month,
        'total_points_issued': int(total_points_issued),
        'total_points_redeemed': int(total_points_redeemed),
        'points_outstanding': int(total_points_issued - total_points_redeemed),
        'level_distribution': level_distribution,
        'wallet_total_balance': int(wallet_total),
        'top_customers': top_customers,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  12. HELPER — Notification
# ══════════════════════════════════════════════════════════════════════════════

def _create_notification(
    customer: CustomerProfile,
    notification_type: str,
    title: str,
    message: str,
    channel: str = 'in_app',
    data: dict = None,
) -> LoyaltyNotification:
    """ایجاد اعلان داخلی."""
    return LoyaltyNotification.objects.create(
        customer=customer,
        channel=channel,
        notification_type=notification_type,
        title=title,
        message=message,
        data=data or {},
    )


# ══════════════════════════════════════════════════════════════════════════════
#  13. SEED DATA
# ══════════════════════════════════════════════════════════════════════════════

def seed_membership_levels():
    """ساخت/بروزرسانی ۴ سطح عضویت پیش‌فرض."""
    levels = [
        {
            'name': 'bronze', 'title': 'برنز', 'icon': '🥉', 'color': '#CD7F32',
            'min_spending': 0, 'min_points': 0,
            'discount_percent': 0, 'points_multiplier': Decimal('1.00'),
            'free_delivery': False, 'cashback_rate': Decimal('0.02'),
            'priority_support': False, 'order': 1,
            'description': 'سطح پایه — شروع سفر باشگاه',
        },
        {
            'name': 'silver', 'title': 'نقره‌ای', 'icon': '🥈', 'color': '#C0C0C0',
            'min_spending': 5000000, 'min_points': 500,
            'discount_percent': 5, 'points_multiplier': Decimal('1.25'),
            'free_delivery': False, 'cashback_rate': Decimal('0.03'),
            'priority_support': False, 'order': 2,
            'description': 'با ۵ میلیون خرید — ۵٪ تخفیف',
        },
        {
            'name': 'gold', 'title': 'طلایی', 'icon': '🥇', 'color': '#FFD700',
            'min_spending': 15000000, 'min_points': 1500,
            'discount_percent': 10, 'points_multiplier': Decimal('1.50'),
            'free_delivery': True, 'cashback_rate': Decimal('0.05'),
            'priority_support': False, 'order': 3,
            'description': 'با ۱۵ میلیون خرید — ۱۰٪ تخفیف + ارسال رایگان',
        },
        {
            'name': 'vip', 'title': 'VIP', 'icon': '👑', 'color': '#9B59B6',
            'min_spending': 50000000, 'min_points': 5000,
            'discount_percent': 15, 'points_multiplier': Decimal('2.00'),
            'free_delivery': True, 'cashback_rate': Decimal('0.08'),
            'priority_support': True, 'order': 4,
            'description': 'بالاترین سطح — ۱۵٪ تخفیف + ارسال رایگان + پشتیبانی ویژه',
        },
    ]

    for data in levels:
        MembershipLevel.objects.update_or_create(
            name=data['name'],
            defaults=data,
        )

    return f"{len(levels)} سطح عضویت ساخته/بروزرسانی شد."