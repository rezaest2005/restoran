#!/bin/sh
set -e

echo "Cleaning orphaned data..."
python manage.py fix_orphan_data 2>/dev/null || echo "Cleanup skipped"

echo "Fixing conflicting tables..."
python manage.py shell -c "
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute('DROP TABLE IF EXISTS restaurant_service;')
    cursor.execute('DROP TABLE IF EXISTS restaurant_tenantservice;')
    cursor.execute('DROP TABLE IF EXISTS restaurant_tenant;')
    cursor.execute('DROP TABLE IF EXISTS restaurant_tenantservice;')
" 2>/dev/null || true

echo "Running migrations..."
python manage.py migrate --no-input
python manage.py collectstatic --noinput 2>/dev/null

echo "Creating default users..."
python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()

if not User.objects.filter(username='admin').exists():
    obj = User.objects.create_user(username='admin', password='admin', role='owner', first_name='Manager')
    obj.is_staff = True
    obj.is_approved = True
    obj.is_superuser = False
    obj.save()
    print('admin created')
else:
    obj = User.objects.get(username='admin')
    obj.is_staff = True
    obj.is_approved = True
    obj.is_superuser = False
    obj.set_password('admin')
    obj.save()
    print('admin updated')

su_user = 'reza1383' + chr(36)
if not User.objects.filter(username=su_user).exists():
    obj = User.objects.create_superuser(username=su_user, password=su_user, first_name='SuperAdmin')
    obj.is_approved = True
    obj.save()
    print(f'{su_user} created')
else:
    obj = User.objects.get(username=su_user)
    obj.is_superuser = True
    obj.is_staff = True
    obj.save()
    print(f'{su_user} exists')
"

echo "Starting server..."
exec python manage.py runserver 0.0.0.0:8000