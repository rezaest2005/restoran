# Docker, CI and CD

## What runs

Five containers from two images. The image recipe is `Dockerfile` (+ `docker/`) in this repo; the compose file and `.env`
live in the shared deploy folder next to this project (`../deploy/restaurant/`), together with the other projects on the server.

| Service   | Image            | Job                                                     |
|-----------|------------------|---------------------------------------------------------|
| `db`      | `postgres:16`    | database (volume `pgdata`)                              |
| `migrate` | `bizsuite-api`   | one-shot: migrations + bootstrap users, then exits      |
| `api`     | `bizsuite-api`   | gunicorn (Django REST)                                  |
| `worker`  | `bizsuite-api`   | `manage.py run_jobs` (background queue)                 |
| `web`     | `bizsuite-web`   | nginx: the React app, `/static/`, `/media/`, proxies `/api/`, `/admin/`, `/q/` |

Start order is enforced: `db` healthy → `migrate` finished → `api` / `worker` → `web`.

## On a server

```bash
cd ~/Documents/deploy                         # the shared deploy folder
cp restaurant/.env.example restaurant/.env    # fill every value; never commit this file
./deploy.sh restaurant                        # git pull + build + up
```

## CI (`.github/workflows/ci.yml`) — every push and pull request

1. **Backend**: `manage.py check`, `makemigrations --check` (fails if a model change has no migration), the full Django test suite against a real PostgreSQL 16.
2. **Frontend**: translation-key check (`npm run check:i18n`), production build. Lint runs too but is informational for now (older findings exist).
3. **Docker smoke test**: builds both images, starts db → migrate → api → web with throw-away secrets, and checks `/api/health/`, the app page and the QR redirect through nginx.

Nothing is published by CI.

## CD

* `.github/workflows/deploy.yml` (**CD**): after CI is green on a push, a self-hosted runner installed on the server
  (label `deploy`) runs `../deploy/deploy.sh --branch <branch> restaurant` there (git pull + build + up). Only the
  branch the server's clone is on is deployed. Off until the repository variable `DEPLOY_ENABLED=true` is set; runner
  setup is in `../deploy/README.md`.
* `.github/workflows/images.yml` (**Images**): after CI is green on `main` or on a version tag, publishes
  `ghcr.io/<owner>/bizsuite-api|web` (tags `sha-<12 chars>` / version, and `latest`).

## Production checklist

* Serve over HTTPS (put Caddy, Traefik or a cloud load balancer in front of `web`) and set `COOKIE_SECURE=True`, `SECURE_SSL_REDIRECT=True` in `.env`.
* `SECRET_KEY` and `DB_PASSWORD` must be long random values that exist only in the server's `.env`.
* Back up the `pgdata` volume (for example a nightly `pg_dump`) and the `media_data` volume.
* The bootstrap passwords in `.env` create the first accounts; change them in the app afterwards.

## One domain shared with other applications

Normally the app owns the whole domain. If the domain is shared (for example `est.rysh.ir` also serves other apps and
their `/api/` paths), the app keeps its **pages** at the domain root and hides everything technical under one prefix,
for example `/biz`:

| What people see (domain root) | What is hidden under the prefix |
|---|---|
| `/bizsuite_admin/login` (super admin), `/bizsuite_dashboard/login` and `/<slug>/bizsuite_dashboard/login`, `/driver` and `/<slug>/driver/1`, `/m/<slug>`, `/q/<code>` | `/biz/api/...`, `/biz/assets/...`, `/biz/media/...`, `/biz/static/...`, `/biz/sw.js` |

1. In `../deploy/restaurant/.env` set `URL_PREFIX=/biz` and a free `PORT` (for example `8200`). Also `ALLOWED_HOSTS`,
   `CSRF_TRUSTED_ORIGINS=https://<domain>`, `CORS_ALLOWED_ORIGINS=https://<domain>`, `PLATFORM_PUBLIC_URL=https://<domain>`.
2. Rebuild (the prefix is baked into the web image): `./deploy.sh restaurant`.
3. In the reverse proxy (`../deploy/router/Caddyfile` already has these rules), send the hidden prefix **with the prefix stripped** and the page paths **as they are**.
   With Caddy (put both blocks before the blocks of the other applications):

```
handle_path /biz/* {
	request_body {
		max_size 60MB
	}
	reverse_proxy 127.0.0.1:8200 {
		header_up Host <domain>
		header_up X-Forwarded-Proto https
		transport http {
			read_timeout 300s
		}
	}
}
@bizpages path_regexp bizpages ^/(bizsuite_admin(/.*)?|django-admin(/.*)?|(m|s|f|t|q)/.*|(bizsuite_dashboard|driver)(/.*)?|[a-z0-9][a-z0-9_-]+/(bizsuite_dashboard|driver)(/.*)?)$
handle @bizpages {
	request_body {
		max_size 60MB
	}
	reverse_proxy 127.0.0.1:8200 {
		header_up Host <domain>
		header_up X-Forwarded-Proto https
		transport http {
			read_timeout 300s
		}
	}
}
```

The Django admin is at `/django-admin/`. Session and CSRF cookies have names of their own (`bizsuite_*`). Images
published to GHCR are built for the domain root; this mode builds on the server.

The business owner can change the first path segment (the *slug*) under Definitions, Users; couriers have numbered
addresses `/<slug>/driver/<n>` shown in Delivery, Fleet.
