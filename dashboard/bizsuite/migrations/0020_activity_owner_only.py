from django.db import migrations


def strip_activity_tab(apps, schema_editor):
    """The activity history is owner-only now: drop the old tick from every non-owner account."""
    User = apps.get_model("bizsuite", "User")
    for u in User.objects.exclude(role="owner").iterator():
        changed = []
        if isinstance(u.tabs, dict) and "activity" in u.tabs:
            u.tabs = {k: v for k, v in u.tabs.items() if k != "activity"}
            changed.append("tabs")
        if isinstance(u.dashboard_permissions, list) and "activity" in u.dashboard_permissions:
            u.dashboard_permissions = [k for k in u.dashboard_permissions if k != "activity"]
            changed.append("dashboard_permissions")
        if changed:
            u.save(update_fields=changed)


class Migration(migrations.Migration):
    dependencies = [("bizsuite", "0019_accounting_pro_ledger")]
    operations = [migrations.RunPython(strip_activity_tab, migrations.RunPython.noop)]
