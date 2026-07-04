from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('restaurant', '0004_add_drink_category'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaseinvoiceitem',
            name='category',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to='restaurant.category',
                verbose_name='دسته\u200cبندی',
            ),
        ),
    ]
