#!/bin/bash
  set -e

  APP_DIR="/root/Schema-Sync"
  cd "$APP_DIR"

  # تحميل متغيرات البيئة
  if [ -f "$APP_DIR/.env" ]; then
    set -a
    source "$APP_DIR/.env"
    set +a
  fi

  echo "--- Reset any conflicts and pull latest ---"
  git fetch origin main
  git reset --hard origin/main
  git clean -fd

  echo "--- pnpm install ---"
  pnpm install

  echo "--- DB push ---"
  cd "$APP_DIR/lib/db"
  pnpm run push

  echo "--- Frontend build ---"
  cd "$APP_DIR/artifacts/erp-system"
  NODE_ENV=production BASE_PATH=/ VITE_API_URL="" pnpm run build

  echo "--- Backend build ---"
  cd "$APP_DIR/artifacts/api-server"
  pnpm run build

  echo "--- pm2 restart ---"
  pm2 restart halaltech-api --update-env

  echo "--- Waiting for API (max 60s) ---"
  MAX=24
  i=0
  until curl -sf http://localhost:8080/api/healthz > /dev/null 2>&1; do
    i=$((i+1))
    if [ "$i" -ge "$MAX" ]; then
      pm2 logs halaltech-api --lines 30 --nostream || true
      exit 1
    fi
    sleep 2.5
  done

  mkdir -p /root/db-backups
  echo "Deploy done! halaltec.com is live."
  pm2 status
  