#!/bin/sh
set -e

echo "==> [migrate] Applying database migrations..."
python manage.py migrate --no-input

echo "==> [migrate] Collecting static files..."
python manage.py collectstatic --noinput || echo "WARN: [migrate] collectstatic failed (non-fatal)"

echo "==> [migrate] Creating/syncing the default super admin..."
python manage.py shell <<'PY'
import os
from django.contrib.auth import get_user_model

User = get_user_model()
sync = os.environ.get('BOOTSTRAP_SYNC_PASSWORDS', '0') == '1'

# --- superuser ---
su_user = os.environ.get('BOOTSTRAP_SUPER_USERNAME', 'superadmin')
su_pass = os.environ.get('BOOTSTRAP_SUPER_PASSWORD')
if not su_pass:
    print('WARN: BOOTSTRAP_SUPER_PASSWORD not set -> skipping superuser')
else:
    su = User.objects.filter(username=su_user).first()
    if su is None:
        su = User.objects.create_superuser(
            username=su_user, password=su_pass, first_name='SuperAdmin',
        )
        su.is_approved = True
        su.save()
        print(f'OK: {su_user} created')
    elif sync:
        su.set_password(su_pass)
        su.is_approved = True
        su.save(update_fields=['password', 'is_approved'])
        print(f'OK: {su_user} password synced')

    # The same account is also the default customer inside: it owns a default business, so one username and
    # password sign in at the admin panel AND at the dashboard. Skipped with BOOTSTRAP_DEFAULT_BUSINESS=0.
    if su is not None and su.business_id is None and os.environ.get('BOOTSTRAP_DEFAULT_BUSINESS', '1') != '0':
        from django.db import transaction
        from bizsuite.views.super_admin.tenants import create_customer_account
        with transaction.atomic():
            su.role = 'owner'
            su.save(update_fields=['role'])
            _, biz = create_customer_account(su)
        print(f'OK: default business for {su_user}: /{biz.slug}/bizsuite_dashboard/login')
PY

echo "==> [migrate] Done."