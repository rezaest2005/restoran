#!/bin/sh
# Run on the server (CD calls it over SSH). Pulls the published images and restarts the stack.
# Needs in the environment: IMAGE_OWNER, IMAGE_TAG; optional GHCR_USER + GHCR_TOKEN for private images.
set -eu

: "${IMAGE_OWNER:?IMAGE_OWNER is required}"
export IMAGE_OWNER IMAGE_TAG="${IMAGE_TAG:-latest}"
cd "$(dirname "$0")"

[ -f .env ] || { echo "deploy: .env is missing next to docker-compose.yml (copy .env.example and fill it in)"; exit 1; }

if [ -n "${GHCR_TOKEN:-}" ]; then
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-token}" --password-stdin
fi

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
echo "==> deploy: pulling ${IMAGE_OWNER} ${IMAGE_TAG}"
$COMPOSE pull
echo "==> deploy: starting (migrations run first, then api/worker/web)"
$COMPOSE up -d --remove-orphans --wait --wait-timeout 300
docker image prune -f >/dev/null 2>&1 || true
echo "==> deploy: done"
$COMPOSE ps
