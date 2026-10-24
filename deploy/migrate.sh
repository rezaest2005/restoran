#!/bin/sh
set -e

echo "==> [migrate] Applying database migrations..."
python manage.py migrate --no-input

echo "==> [migrate] Collecting static files..."
python manage.py collectstatic --noinput || echo "WARN: [migrate] collectstatic failed (non-fatal)"

echo "==> [migrate] Creating/syncing default users..."
python manage.py shell <<'PY'
import os
from django.contrib.auth import get_user_model

User = get_user_model()
sync = os.environ.get('BOOTSTRAP_SYNC_PASSWORDS', '0') == '1'

# --- admin ---
admin_pass = os.environ.get('BOOTSTRAP_ADMIN_PASSWORD')
if not admin_pass:
    print('WARN: BOOTSTRAP_ADMIN_PASSWORD not set -> skipping admin user')
else:
    admin = User.objects.filter(username='admin').first()
    if admin is None:
        admin = User.objects.create_user(
            username='admin', password=admin_pass,
            role='owner', first_name='Manager',
        )
        admin.is_staff = True
        admin.is_approved = True
        admin.is_superuser = False
        admin.save()
        print('OK: admin created')
    elif sync:
        admin.set_password(admin_pass)
        admin.is_staff = True
        admin.is_approved = True
        admin.save(update_fields=['password', 'is_staff', 'is_approved'])
        print('OK: admin password synced')

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
PY

echo "==> [migrate] Done."