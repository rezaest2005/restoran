#!/bin/sh
set -e

echo "Running migrations..."
python manage.py migrate --no-input

echo "Collecting static files..."
python manage.py collectstatic --noinput 2>/dev/null || true

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

su_user = 'reza1383' + chr(36)
if not User.objects.filter(username=su_user).exists():
    obj = User.objects.create_superuser(username=su_user, password=su_user, first_name='SuperAdmin')
    obj.is_approved = True
    obj.save()
    print(f'{su_user} created')
" 2>/dev/null || true

echo "Starting server with gunicorn..."
exec gunicorn core.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 2 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -