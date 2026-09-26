#!/bin/sh
set -e

echo "Running migrations..."
python manage.py migrate --no-input

echo "Collecting static files..."
python manage.py collectstatic --noinput 2>/dev/null || true

echo "Creating/syncing default users..."
python manage.py shell -c "
import os
from django.contrib.auth import get_user_model
User = get_user_model()

admin_pass = os.environ.get('BOOTSTRAP_ADMIN_PASSWORD', 'admin')
sync = os.environ.get('BOOTSTRAP_SYNC_PASSWORDS', '0') == '1'

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
    print('admin created')
elif sync:
    admin.set_password(admin_pass)
    admin.is_staff = True
    admin.is_approved = True
    admin.save(update_fields=['password', 'is_staff', 'is_approved'])
    print('admin password synced')

su_user = 'reza1383' + chr(36)
su_pass = os.environ.get('BOOTSTRAP_SUPER_PASSWORD', su_user)
su = User.objects.filter(username=su_user).first()
if su is None:
    su = User.objects.create_superuser(
        username=su_user, password=su_pass, first_name='SuperAdmin',
    )
    su.is_approved = True
    su.save()
    print(f'{su_user} created')
elif sync:
    su.set_password(su_pass)
    su.is_approved = True
    su.save(update_fields=['password', 'is_approved'])
    print(f'{su_user} password synced')
" 2>/dev/null || true

echo "Starting server with gunicorn..."
exec gunicorn core.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 2 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
