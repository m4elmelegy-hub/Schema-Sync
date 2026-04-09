#!/bin/bash
set -e
echo "🚀 بدء الـ Deploy..."

cd /root/Schema-Sync

git stash 2>/dev/null || true
git pull origin main
git stash pop 2>/dev/null || true

pnpm install

cd /root/Schema-Sync/lib/db
DATABASE_URL="postgresql://erpuser:123456@localhost:5432/erp" pnpm run push

cd /root/Schema-Sync/artifacts/erp-system
PORT=8080 BASE_PATH=/ VITE_API_URL="" pnpm run build

cd /root/Schema-Sync/artifacts/api-server
pnpm run build

pm2 restart halaltech-api

# تأكد إن الـ monitor script موجود ومُفعَّل
if [ ! -f /root/monitor.sh ]; then
  echo "⚠️  Monitor script غير موجود — انسخه من deploy/monitor.sh يدوياً"
fi

# تأكد من وجود مجلد الـ backups
mkdir -p /root/db-backups
echo "📁 Backup directory: /root/db-backups"

echo "✅ Deploy خلص! الموقع اتحدث."
echo "🌐 halaltec.com جاهز"
