# Build from the repository root:
#   docker build --target api .
#   docker build --target web .

# ── Stage 1: React SPA ───────────────────────────────
FROM node:20-alpine AS web-build
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
# Mount path when the app shares a domain with other apps (empty = domain root). Example: --build-arg APP_BASE_PATH=/biz
ARG APP_BASE_PATH=
RUN B="${APP_BASE_PATH%/}"; VITE_BASE="${B}/" npm run build

# ── Stage 2: Django API image (used by api, worker and migrate) ──
FROM python:3.12-slim AS api
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY dashboard/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY dashboard/ .
COPY docker/entrypoint.sh docker/migrate.sh /app/
RUN sed -i 's/\r$//' /app/entrypoint.sh /app/migrate.sh \
    && chmod +x /app/entrypoint.sh /app/migrate.sh \
    && SECRET_KEY=build-only-not-a-secret DEBUG=True python manage.py collectstatic --noinput \
    && useradd --system --uid 1001 app \
    && mkdir -p /app/media \
    && chown -R app:app /app/media /app/staticfiles
USER app
EXPOSE 8000
CMD ["/app/entrypoint.sh"]

# ── Stage 3: nginx serving the SPA + static, proxying /api/ ──
FROM nginx:alpine AS web
COPY --from=web-build /app/dist /usr/share/nginx/html
COPY --from=api /app/staticfiles /usr/share/nginx/static
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
