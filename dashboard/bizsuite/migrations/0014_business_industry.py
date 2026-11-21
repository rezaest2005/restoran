"""Business type (industry) + first-run setup state.

Existing businesses become ``restaurant`` with setup already completed, so they keep today's behaviour;
new businesses start with an empty industry and go through the setup wizard.
"""
from django.db import migrations, models
from django.utils import timezone


def mark_existing_as_set_up(apps, schema_editor):
    Business = apps.get_model("bizsuite", "Business")
    now = timezone.now()
    for b in Business.objects.filter(setup_completed_at__isnull=True).only("pk", "created_at"):
        Business.objects.filter(pk=b.pk).update(setup_completed_at=b.created_at or now, industry="restaurant")


class Migration(migrations.Migration):

    dependencies = [
        ("bizsuite", "0013_business_subscription"),
    ]

    operations = [
        migrations.AddField(
            model_name="business",
            name="industry",
            field=models.CharField(
                blank=True, db_index=True, default="", max_length=30, verbose_name="نوع کسب‌وکار",
                help_text="restaurant / retail / manufacturing / distribution / services / pharmacy / other",
            ),
        ),
        migrations.AddField(
            model_name="business",
            name="industry_options",
            field=models.JSONField(blank=True, default=dict, verbose_name="تنظیمات صنف"),
        ),
        migrations.AddField(
            model_name="business",
            name="setup_completed_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="پایان راه‌اندازی اولیه"),
        ),
        migrations.RunPython(mark_existing_as_set_up, migrations.RunPython.noop),
    ]
