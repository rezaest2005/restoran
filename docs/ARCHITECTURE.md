# Architecture

Business Suite is a modular system deployed as a few processes built from two codebases.

## Processes

- **api** - `dashboard/` Django project (`core/` settings, `bizsuite/` application). Runs under gunicorn.
- **worker** - same image as `api`, command `python manage.py run_jobs`. Processes the `BackgroundJob` table.
- **web** - `web/` React SPA, built to static files and served by nginx. nginx serves `/static/` and
  `/media/` directly from disk and reverse-proxies `/api/`, `/admin/` and `/{tenant-slug}/api/` to `api`.
- **db** - PostgreSQL 16.
- **migrate** - one-shot container that applies migrations and creates the bootstrap users.

The SPA calls the API with relative URLs (same origin), so it works behind nginx and with the Vite dev
proxy without any configured host.

## Branding

The product name is defined once per side: `dashboard/core/branding.py` (overridable via `APP_NAME`,
`APP_NAME_FA`) and `web/src/shared/branding.js`. The backend exposes it at `GET /api/app/info/` and to
templates as `app_name` / `app_name_fa`.

## Background jobs

`bizsuite.models.BackgroundJob` (kind, payload JSON, status, attempts, max_attempts, last_error,
created_at, run_after, locked_at). `bizsuite/jobs.py` holds the registry (`@register(kind)`) and
`enqueue()`. A worker claims one due job inside a transaction with
`select_for_update(skip_locked=True)`, marks it `running`, commits, then runs the handler outside
the transaction. Failures are retried with exponential backoff (30 s doubling, capped at 1 h) until
`max_attempts`, then marked `failed` with the traceback in `last_error`. A `running` job whose lock is
older than 10 minutes (dead worker) is reclaimed.

Registered job: `post_accounting` - when an automatic accounting posting fails inside a request,
`safe_post` enqueues a retry; the posting itself is idempotent per source document.

## Health

`GET /api/health/` is public and returns 200 when the database answers `SELECT 1`, otherwise 503.

## Internal package name

The Django application package and app label are `bizsuite` (`dashboard/bizsuite/`). The tenant model is
`Business`; foreign keys to it are named `business`.

Rename note (one-time): the package, app label and tenant model were previously named after a single
industry. They were renamed to neutral names and, because all data at that time was test data, the
migration history was replaced by a single fresh `0001_initial`. The old history remains in git history only.

## Storefront (no-code public page)

`StorefrontTemplate` (global presets), `Storefront` (one per business: draft `theme`/`sections`, published
snapshot in `published_data`), `StorefrontRevision`, `StorefrontAsset`. All content is validated JSON
(`bizsuite/storefront_services.py`); nothing from a business is executed or rendered as HTML.

- Public page: `{PLATFORM_PUBLIC_URL}/s/<slug>`; API `GET /api/storefront/<slug>/` returns published data only.
- Custom domain: `Storefront.custom_domain` (unique hostname). `StorefrontDomainMiddleware` (first in the chain)
  maps an exact Host match of a *published* storefront to it and serves the storefront payload at `/`
  (`/api/storefront/by-host/`). Other hosts are untouched; platform hosts cannot be claimed.
- The preset converted from the former sample page lives in `storefront-template/` (reference only) and as the
  `restaurant_classic` template data (display name "Classic").
- Club sign-up from the page: `POST /api/storefront/<slug>/club/join/` (needs published page + club module).

## Modules and subscriptions

`Module` catalogue (pos, club, inventory, production, accounting, delivery, feedback, storefront) with hard
`requires` edges, `BusinessModule` per business (enabled, starts_at, expires_at, price_override) and optional
`Plan`. A business with no `BusinessModule` rows is unmanaged: every module is on (legacy behaviour).
`bizsuite.modules.module_enabled(business, code)` is used by the service permission check
(`views/decorators.py`), by accounting auto-posting and by the club points hook.
