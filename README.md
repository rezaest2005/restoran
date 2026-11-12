# Business Suite (سامانه جامع کسب‌وکار)

A multi-tenant business management platform for any industry: shops, cafes,
factories and transport fleets. One deployment serves many independent businesses (tenants),
each with its own users, data and enabled modules.

## Modules

- **POS and orders** - cashier screen, order tracking, online/QR orders, receipt printing
- **Inventory** - items, warehouses, stock movements, minimum levels, purchase suggestions
- **Purchasing and sales invoicing** - suppliers, customers, invoices, returns, expenses
- **Production** - formulas (bills of materials) and production orders
- **Accounting** - double-entry ledger with automatic posting and reports
- **Delivery and fleet** - carriers, vehicles, drivers, trips, stops, COD and driver settlement
- **Customer club** - loyalty points and members
- **Feedback** - public feedback form and management
- **Super admin** - tenant and user management across businesses

## Architecture

| Process  | Source        | Role                                                         |
|----------|---------------|--------------------------------------------------------------|
| `api`    | `dashboard/`  | Django REST API (gunicorn)                                   |
| `worker` | `dashboard/`  | `manage.py run_jobs` - background job queue (same image)     |
| `web`    | `web/`        | React SPA served by nginx, which also proxies `/api/`        |
| `db`     | postgres:16   | PostgreSQL                                                   |
| `migrate`| `dashboard/`  | One-shot: migrations and bootstrap users                     |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run with Docker Compose

```bash
cp deploy/.env.example deploy/.env      # fill SECRET_KEY, DB_PASSWORD, bootstrap passwords
docker compose -f deploy/docker-compose.yml up -d --build
```

The app is then available on `http://localhost:8080` (change with `WEB_PORT`).
Health check: `GET /api/health/`. Product info: `GET /api/app/info/`.

CI (tests, build, docker smoke test) runs on every push; CD publishes the images to GHCR and can deploy over SSH.
See [docs/DEPLOY.md](docs/DEPLOY.md).

## Local development

```bash
# backend (needs PostgreSQL; copy .env.example to .env and fill it in)
cd dashboard
python -m venv ../.venv && ../.venv/Scripts/pip install -r requirements.txt "psycopg[binary]"
python manage.py migrate
python manage.py runserver 8000
python manage.py run_jobs            # optional: background worker

# frontend (Vite dev server proxies /api to 127.0.0.1:8000)
cd web
npm ci
npm run dev
```

## Configuration

Environment variables (see `.env.example` and `deploy/.env.example`):

| Variable | Purpose |
|----------|---------|
| `SECRET_KEY` | Django secret (required when `DEBUG=false`) |
| `DEBUG` | `true` / `false` |
| `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` | Comma-separated host/origin lists |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | PostgreSQL connection |
| `COOKIE_SECURE`, `SECURE_SSL_REDIRECT` | Set to `True` behind HTTPS |
| `APP_NAME`, `APP_NAME_FA` | Optional product display name overrides |
| `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_SUPER_USERNAME`, `BOOTSTRAP_SUPER_PASSWORD`, `BOOTSTRAP_SYNC_PASSWORDS` | Initial users created by the `migrate` service |
| `CARD_READER_IP`, `CARD_READER_PORT`, `CARD_READER_TIMEOUT` | Optional card terminal integration |
| `PUBLIC_PASSWORD_RESET_ENABLED` | Enable public password reset (only after OTP is connected) |

Never commit a real `.env` file.

## Tests and checks

```bash
cd dashboard
DB_NAME=bizsuite_test python manage.py test tests --noinput
python manage.py check --deploy

cd web
npx vite build
npx eslint src --quiet
```
