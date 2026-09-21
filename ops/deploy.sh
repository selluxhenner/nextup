#!/usr/bin/env bash
# Deploy on the Hetzner box. Run it from the repo root over SSH:
#     ssh <box> 'cd /srv/nextup && ops/deploy.sh'
#
# Migrations are not a separate step: compose runs `prisma migrate deploy` as a one-shot service
# and the app waits for it to finish, so a deploy cannot land code ahead of its schema.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env here. Copy .env.example to .env and fill it in first." >&2
  exit 1
fi

echo "==> pulling"
git pull --ff-only

echo "==> building"
docker compose build app migrate

echo "==> starting"
docker compose up -d

echo "==> waiting for the app to report healthy"
for _ in $(seq 1 30); do
  status="$(docker compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null | awk '$1=="app"{print $2}')"
  [ "$status" = "healthy" ] && { echo "app is healthy"; break; }
  sleep 2
done

docker compose ps
echo
echo "Logs:    docker compose logs -f app"
echo "Rollback: git checkout <previous-sha> && ops/deploy.sh"
