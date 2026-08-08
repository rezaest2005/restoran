from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('restaurant', '0034_alter_restaurant_slug'),
    ]

    operations = [
        migrations.CreateModel(
            name='Service',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=50, unique=True)),
                ('label', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True, default='')),
                ('icon', models.CharField(blank=True, default='', max_length=50)),
                ('default_price', models.BigIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('order', models.IntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name='TenantService',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_enabled', models.BooleanField(default=False)),
                ('price', models.BigIntegerField(default=0)),
                ('activated_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('service', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='restaurant.service')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='restaurant.tenant')),
            ],
            options={
                'unique_together': {('tenant', 'service')},
            },
        ),
    ]