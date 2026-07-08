#!/bin/bash
echo "Running migrations..."
python manage.py migrate --no-input
python manage.py collectstatic --noinput 2>/dev/null

echo "Creating superuser..."
python manage.py shell <<'EOF'
from django.contrib.auth import get_user_model
import os
User = get_user_model()
u = os.environ.get("DJANGO_SUPERUSER_USERNAME", "admin")
p = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "admin")
if not User.objects.filter(username=u).exists():
    obj = User.objects.create_superuser(username=u, password=p)
    obj.is_approved = True
    obj.save()
    print(f"Superuser {u} created")
else:
    obj = User.objects.get(username=u)
    obj.is_approved = True
    obj.is_staff = True
    obj.is_superuser = True
    obj.set_password(p)
    obj.save()
    print(f"Superuser {u} updated")
EOF

echo "Starting server..."
exec python manage.py runserver 0.0.0.0:8000
