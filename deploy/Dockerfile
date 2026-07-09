# ═══════════════════════════════════════════════════════
#  Stage 1: Build فرانت‌اند
# ═══════════════════════════════════════════════════════
FROM docker.arvancloud.ir/library/node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ═══════════════════════════════════════════════════════
#  Stage 2: بک‌اند Django
# ═══════════════════════════════════════════════════════
FROM docker.arvancloud.ir/library/python:3.12-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y dos2unix && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN dos2unix /app/entrypoint.sh && chmod +x /app/entrypoint.sh
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# ═══════════════════════════════════════════════════════
#  Stage 3: Nginx + فرانت‌اند
# ═══════════════════════════════════════════════════════
FROM docker.arvancloud.ir/library/nginx:alpine AS nginx
COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8000
CMD ["nginx", "-g", "daemon off;"]
