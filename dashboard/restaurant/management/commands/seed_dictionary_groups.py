"""
python manage.py seed_dictionary_groups
"""
from django.core.management.base import BaseCommand
from restaurant.models import DictionaryGroup, Restaurant


DEFAULT_GROUPS = [
    {
        'slug': 'raw_material',
        'name': 'مواد اولیه',
        'icon': 'bi-archive',
        'color': '#ff6b35',
        'sort_order': 0,
        'is_system': True,
        'usage_recipes': True,
        'usage_warehouse': True,
        'usage_invoice': True,
    },
    {
        'slug': 'semi_finished',
        'name': 'نیمه‌آماده',
        'icon': 'bi-layers',
        'color': '#8b5cf6',
        'sort_order': 1,
        'is_system': True,
        'usage_recipes': True,
        'usage_warehouse': True,
    },
    {
        'slug': 'ready_material',
        'name': 'مواد آماده',
        'icon': 'bi-box2',
        'color': '#10b981',
        'sort_order': 2,
        'is_system': True,
        'usage_warehouse': True,
        'usage_pos': True,
    },
    {
        'slug': 'packaging',
        'name': 'بسته‌بندی و جعبه',
        'icon': 'bi-box-seam',
        'color': '#f59e0b',
        'sort_order': 3,
        'is_system': True,
        'usage_recipes': True,
        'usage_warehouse': True,
        'usage_invoice': True,
    },
]


class Command(BaseCommand):
    help = 'ساخت گروه‌های پیش‌فرض دیکشنری برای همه رستوران‌ها'

    def handle(self, *args, **options):
        restaurants = Restaurant.objects.filter(is_active=True)
        created_total = 0

        for restaurant in restaurants:
            for g in DEFAULT_GROUPS:
                obj, created = DictionaryGroup.objects.get_or_create(
                    restaurant=restaurant,
                    slug=g['slug'],
                    defaults={
                        'name': g['name'],
                        'icon': g['icon'],
                        'color': g['color'],
                        'sort_order': g['sort_order'],
                        'is_system': g['is_system'],
                        'usage_recipes': g.get('usage_recipes', False),
                        'usage_warehouse': g.get('usage_warehouse', False),
                        'usage_pos': g.get('usage_pos', False),
                        'usage_invoice': g.get('usage_invoice', False),
                        'usage_kitchen': g.get('usage_kitchen', False),
                    },
                )
                if created:
                    created_total += 1
                    self.stdout.write(f'  + {restaurant.name}: {g["name"]}')

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. {created_total} groups created for {restaurants.count()} restaurants.'
        ))