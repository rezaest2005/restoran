"""Remove the business storefront (public website) feature.

DESTRUCTIVE and effectively forward-only: the four storefront tables (templates, sites, revisions,
uploaded-asset rows) are dropped together with all their data, the ``storefront`` module row and its
subscriptions are deleted, and every leftover mention of it (plan module lists, per-user tab lists,
``disabled_features``) is stripped. QR links that pointed at the storefront are switched to the menu
kind so printed codes keep resolving. Reversing recreates empty tables only; the data is not restored.
"""
from django.db import migrations, models

CODE = "storefront"


def strip_storefront(apps, schema_editor):
    Module = apps.get_model("bizsuite", "Module")
    BusinessModule = apps.get_model("bizsuite", "BusinessModule")
    Plan = apps.get_model("bizsuite", "Plan")
    User = apps.get_model("bizsuite", "User")
    Business = apps.get_model("bizsuite", "Business")
    QrLink = apps.get_model("bizsuite", "QrLink")

    BusinessModule.objects.filter(module__code=CODE).delete()
    Module.objects.filter(code=CODE).delete()

    for p in Plan.objects.all():
        if isinstance(p.modules, list) and CODE in p.modules:
            p.modules = [m for m in p.modules if m != CODE]
            p.save(update_fields=["modules"])

    for u in User.objects.iterator():
        changed = []
        if isinstance(u.tabs, dict) and CODE in u.tabs:
            u.tabs = {k: v for k, v in u.tabs.items() if k != CODE}
            changed.append("tabs")
        if isinstance(u.dashboard_permissions, list) and CODE in u.dashboard_permissions:
            u.dashboard_permissions = [k for k in u.dashboard_permissions if k != CODE]
            changed.append("dashboard_permissions")
        if changed:
            u.save(update_fields=changed)

    for b in Business.objects.iterator():
        if isinstance(b.disabled_features, list) and CODE in b.disabled_features:
            b.disabled_features = [k for k in b.disabled_features if k != CODE]
            b.save(update_fields=["disabled_features"])

    QrLink.objects.filter(kind=CODE).update(kind="menu")


class Migration(migrations.Migration):
    dependencies = [("bizsuite", "0020_activity_owner_only")]

    operations = [
        migrations.RunPython(strip_storefront, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="qrlink",
            name="kind",
            field=models.CharField(
                choices=[("menu", "منوی QR داخلی"), ("custom", "آدرس دلخواه")],
                default="menu", max_length=12),
        ),
        migrations.DeleteModel(name="StorefrontRevision"),
        migrations.DeleteModel(name="StorefrontAsset"),
        migrations.DeleteModel(name="Storefront"),
        migrations.DeleteModel(name="StorefrontTemplate"),
    ]
