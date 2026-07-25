from django.db import migrations


def add_drink_category(apps, schema_editor):
    Category = apps.get_model('restaurant', 'Category')
    if not Category.objects.filter(name='نوشیدنی').exists():
        last = Category.objects.order_by('-order').values_list('order', flat=True).first()
        next_order = (last or 0) + 1
        Category.objects.create(name='نوشیدنی', is_active=True, order=next_order)
        print('Done: drink category added')
    else:
        print('Info: drink category already exists')


def reverse(apps, schema_editor):
    Category = apps.get_model('restaurant', 'Category')
    Category.objects.filter(name='نوشیدنی').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('restaurant', '0003_readymaterial_category'),
    ]

    operations = [
        migrations.RunPython(add_drink_category, reverse),
    ]
