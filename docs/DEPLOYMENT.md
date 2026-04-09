# دليل الـ Deployment

## GitHub Secrets المطلوبة

في GitHub → Settings → Secrets and variables → Actions، أضف:

| Secret | القيمة |
|--------|--------|
| `VPS_HOST` | عنوان IP الخاص بالسيرفر |
| `VPS_USER` | اسم المستخدم (مثال: `root`) |
| `VPS_SSH_KEY` | محتوى ملف `~/.ssh/id_rsa` الخاص |
| `DATABASE_URL` | `postgresql://erpuser:PASSWORD@localhost:5432/erp` |

## إعداد SSH Key للـ GitHub Actions

على السيرفر:
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy
```
انسخ المحتوى في GitHub Secret باسم `VPS_SSH_KEY`.

## تشغيل Docker محلياً

```bash
cp .env.example .env
# عدّل .env بالقيم الصحيحة

docker-compose up -d

docker-compose logs -f api

docker-compose down
```

## CI/CD Pipeline

يوجد workflow-ان في `.github/workflows/`:

### `ci.yml` — يشتغل عند كل push أو PR
- `test-backend` — يشغّل 38 test للـ backend
- `test-frontend` — يشغّل 4 tests للـ frontend
- `lint` — ESLint + TypeScript type-check للـ packages الاثنين
- `build` — يبني frontend + backend ويرفع الـ artifacts

### `deploy.yml` — يشتغل عند push على `main` فقط
- يتصل بالـ VPS عبر SSH
- يسحب آخر كود من `main`
- يبني frontend + backend
- يعيد تشغيل `pm2` للـ API
- يتحقق من health check

## هيكل الـ Docker

```
Dockerfile (multi-stage):
  Stage 1 (builder) — تثبيت deps + بناء dist/
  Stage 2 (production) — node:22-alpine، non-root user، HEALTHCHECK

docker-compose.yml:
  postgres  — PostgreSQL 16 Alpine + healthcheck
  api       — Backend API على port 8080
  nginx     — Reverse proxy + SSL termination
```

## متغيرات البيئة

انظر `.env.example` للقائمة الكاملة.

| متغير | الوصف | مطلوب |
|-------|-------|--------|
| `DATABASE_URL` | رابط قاعدة البيانات PostgreSQL | نعم |
| `JWT_SECRET` | مفتاح التشفير للـ JWT (32+ حرف) | نعم |
| `JWT_REFRESH_SECRET` | مفتاح refresh tokens | لا (يُستنتج من JWT_SECRET) |
| `TOTP_ENCRYPTION_KEY` | مفتاح AES-256 للـ TOTP (32 حرف بالضبط) | نعم |
| `PORT` | منفذ الـ API (افتراضي: 8080) | لا |
| `NODE_ENV` | `production` أو `development` | لا |
| `BACKUP_DIR` | مسار حفظ الـ backups | لا |
| `SUPER_ADMIN_IPS` | IPs مسموح لها بالـ super admin (فارغ = الكل) | لا |
