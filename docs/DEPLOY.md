# Docker, CI and CD

## What runs

Five containers from two images (see `deploy/docker-compose.yml`):

| Service   | Image            | Job                                                     |
|-----------|------------------|---------------------------------------------------------|
| `db`      | `postgres:16`    | database (volume `pgdata`)                              |
| `migrate` | `bizsuite-api`   | one-shot: migrations + bootstrap users, then exits      |
| `api`     | `bizsuite-api`   | gunicorn (Django REST)                                  |
| `worker`  | `bizsuite-api`   | `manage.py run_jobs` (background queue)                 |
| `web`     | `bizsuite-web`   | nginx: the React app, `/static/`, `/media/`, proxies `/api/`, `/admin/`, `/q/` |

Start order is enforced: `db` healthy → `migrate` finished → `api` / `worker` → `web`.

## On a server, by hand

```bash
cp deploy/.env.example deploy/.env      # fill every value; never commit this file
docker compose -f deploy/docker-compose.yml up -d --build
```

## CI (`.github/workflows/ci.yml`) — every push and pull request

1. **Backend**: `manage.py check`, `makemigrations --check` (fails if a model change has no migration), the full Django test suite against a real PostgreSQL 16.
2. **Frontend**: translation-key check (`npm run check:i18n`), production build. Lint runs too but is informational for now (older findings exist).
3. **Docker smoke test**: builds both images, starts the whole stack with throw-away secrets, and checks `/api/health/`, the app page and the QR redirect through nginx.

Nothing is published by CI.

## CD (`.github/workflows/cd.yml`)

Runs after CI is green on `main`, on a version tag (`v1.2.0`), or manually.

1. **Publish**: builds `bizsuite-api` and `bizsuite-web` and pushes them to GitHub Container Registry
   (`ghcr.io/<owner>/bizsuite-api|web`), tagged `sha-<12 chars>` (or the version tag) and `latest`.
2. **Deploy** (optional, **off by default**): copies the compose files to your server over SSH and runs `deploy/deploy.sh`,
   which pulls the new images and restarts the stack (migrations run before the API starts).

### Turning deployment on

On the server (once):

```bash
mkdir -p /opt/bizsuite && cd /opt/bizsuite
# put your filled-in .env here (copy of deploy/.env.example). The CD job never touches it.
```

In GitHub → Settings:

* **Variables**: `DEPLOY_ENABLED = true`
* **Secrets** (preferably on an *Environment* named `production` with required reviewers, so each release needs your approval):

| Secret              | Value                                                        |
|---------------------|--------------------------------------------------------------|
| `DEPLOY_HOST`       | server address                                               |
| `DEPLOY_USER`       | SSH user (must be allowed to run `docker`)                   |
| `DEPLOY_PATH`       | `/opt/bizsuite`                                              |
| `DEPLOY_PORT`       | optional, default 22                                         |
| `DEPLOY_SSH_KEY`    | private key of a **deploy-only** key pair                    |
| `DEPLOY_KNOWN_HOSTS`| output of `ssh-keyscan -p 22 <host>` (pins the server key)   |
| `GHCR_PULL_TOKEN`   | a token with `read:packages` (only if the images are private)|

### Rolling back

Every image is kept under its `sha-…` / version tag. On the server:

```bash
cd /opt/bizsuite
IMAGE_OWNER=<owner> IMAGE_TAG=<older tag> sh deploy.sh
```

## Production checklist

* Serve over HTTPS (put Caddy, Traefik or a cloud load balancer in front of `web`) and set `COOKIE_SECURE=True`, `SECURE_SSL_REDIRECT=True` in `.env`.
* `SECRET_KEY` and `DB_PASSWORD` must be long random values that exist only in the server's `.env`.
* Back up the `pgdata` volume (for example a nightly `pg_dump`) and the `media_data` volume.
* The bootstrap passwords in `.env` create the first accounts; change them in the app afterwards.

## One domain shared with other applications

Normally the app owns the whole domain. If the domain is shared (for example `est.rysh.ir` also serves other apps
and their `/api/` paths), give this app its own path, for example `/biz`:

1. In `deploy/.env` set `URL_PREFIX=/biz` and pick a free `WEB_PORT` (for example `8200`). Also set
   `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS=https://<domain>`, `CORS_ALLOWED_ORIGINS=https://<domain>` and
   `PLATFORM_PUBLIC_URL=https://<domain>/biz`.
2. Rebuild (the prefix is baked into the web image): `docker compose -p bizsuite up -d --build`.
3. In the reverse proxy, send `/biz/*` to this app **with the prefix stripped**. With Caddy:

```
handle_path /biz/* {
        request_body { max_size 60MB }
        reverse_proxy 127.0.0.1:8200 {
                header_up Host <domain>
                header_up X-Forwarded-Proto https
                transport http { read_timeout 300s }
        }
}
```

The app is then at `https://<domain>/biz/dashboard/login`, couriers use `https://<domain>/biz/<slug>/driver`, QR links
and tracking links carry the prefix automatically. Session and CSRF cookies are limited to `/biz/` so they are not
shared with the other apps. Images published to GHCR are built for the domain root; this mode builds on the server.
