from django.db import migrations, models


def number_existing_drivers(apps, schema_editor):
    """Existing couriers get 1, 2, 3 ... per business, in creation order."""
    Driver = apps.get_model("bizsuite", "Driver")
    counters = {}
    for d in Driver.objects.order_by("business_id", "id"):
        counters[d.business_id] = counters.get(d.business_id, 0) + 1
        d.number = counters[d.business_id]
        d.save(update_fields=["number"])


class Migration(migrations.Migration):

    dependencies = [
        ("bizsuite", "0009_accounting_autopilot_and_dispatch_links"),
    ]

    operations = [
        migrations.AddField(
            model_name="driver",
            name="number",
            field=models.PositiveIntegerField(
                blank=True, null=True, verbose_name="شماره‌ی پیک",
                help_text="1, 2, 3 ... در هر کسب‌وکار؛ بخشی از آدرس /<slug>/driver/<number>"),
        ),
        migrations.RunPython(number_existing_drivers, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="driver",
            constraint=models.UniqueConstraint(
                condition=models.Q(("number__isnull", False)), fields=("business", "number"),
                name="rms_driver_number_unique"),
        ),
    ]
