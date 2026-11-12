import bizsuite.models.delivery
from django.db import migrations, models


def fill_trip_tokens(apps, schema_editor):
    Trip = apps.get_model("bizsuite", "Trip")
    for t in Trip.objects.filter(public_token__isnull=True).iterator():
        t.public_token = bizsuite.models.delivery.new_token()
        t.save(update_fields=["public_token"])


class Migration(migrations.Migration):

    dependencies = [("bizsuite", "0006_feature_licensing")]

    operations = [
        migrations.AddField("order", "order_type", models.CharField(
            blank=True, db_index=True, default="", help_text="hall / takeaway / delivery ...",
            max_length=20, verbose_name="نوع سفارش")),
        migrations.AddField("order", "delivery_address", models.CharField(
            blank=True, default="", max_length=500, verbose_name="آدرس تحویل")),
        migrations.AddField("tripstop", "cargo_description", models.CharField(
            blank=True, default="", max_length=300, verbose_name="شرح بار این توقف")),
        migrations.AddField("trip", "shipper_name", models.CharField(
            blank=True, default="", max_length=200, verbose_name="صاحب بار / فرستنده")),
        migrations.AddField("trip", "shipper_phone", models.CharField(
            blank=True, default="", max_length=20, verbose_name="تلفن صاحب بار")),
        migrations.AddField("trip", "cargo_description", models.CharField(
            blank=True, default="", max_length=500, verbose_name="شرح بار")),
        migrations.AddField("trip", "cargo_weight_kg", models.DecimalField(
            blank=True, decimal_places=2, max_digits=12, null=True, verbose_name="وزن کل بار (کیلو)")),
        migrations.AddField("trip", "destination_name", models.CharField(
            blank=True, default="", max_length=200, verbose_name="مقصد نهایی")),
        migrations.AddField("trip", "expected_arrival", models.DateTimeField(
            blank=True, null=True, verbose_name="زمان پیش‌بینی‌شده‌ی رسیدن")),
        # توکن یکتا: اول بدون یکتایی، پر کردن ردیف‌های موجود، بعد یکتا
        migrations.AddField("trip", "public_token", models.CharField(
            editable=False, max_length=64, null=True)),
        migrations.RunPython(fill_trip_tokens, migrations.RunPython.noop),
        migrations.AlterField("trip", "public_token", models.CharField(
            default=bizsuite.models.delivery.new_token, editable=False, max_length=64, unique=True)),
    ]
