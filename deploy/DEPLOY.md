# VPS Deployment Guide — Arabic ERP SaaS System

## Requirements

- Ubuntu 22.04 LTS (or similar)
- Node.js 20+ (`nvm install 20`)
- PostgreSQL 15+
- Nginx
- PM2 (`npm install -g pm2`)
- Certbot (for SSL)

---

## A) How to Run the Backend on VPS

### 1. Clone and install dependencies

```bash
git clone <your-repo> /var/www/erp
cd /var/www/erp
npm install -g pnpm
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
nano .env   # Fill in DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS
```

Generate a secure `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Set up the database

```bash
# Create PostgreSQL database
sudo -u postgres psql -c "CREATE USER erp_user WITH PASSWORD 'strongpassword';"
sudo -u postgres psql -c "CREATE DATABASE erp_db OWNER erp_user;"

# Push schema (Drizzle ORM)
source .env && pnpm --filter @workspace/db run db:push
```

### 4. Build the backend

```bash
pnpm --filter @workspace/api-server run build
```

Output: `artifacts/api-server/dist/index.mjs`

### 5. Start with PM2

```bash
mkdir -p logs

# Copy your .env values into the ecosystem file or use dotenv
pm2 start ecosystem.config.cjs --env production \
  --update-env \
  -- \
  DATABASE_URL="postgresql://erp_user:pass@localhost:5432/erp_db" \
  JWT_SECRET="your_secret_here" \
  PORT=3000 \
  ALLOWED_ORIGINS="https://yourdomain.com"

# Better approach: load .env automatically
pm2 start ecosystem.config.cjs --env production

pm2 save
pm2 startup   # Follow the output instructions to auto-start on reboot
```

> **Tip:** Set environment variables directly in the `ecosystem.config.cjs` `env_production` block, or use a `.env` file loaded by your shell before running PM2.

---

## B) How to Build and Serve the Frontend

The frontend is a React (Vite) SPA. After building, Express serves it automatically when `NODE_ENV=production`.

### Build the frontend

```bash
PORT=3000 BASE_PATH=/ NODE_ENV=production \
  pnpm --filter @workspace/erp-system run build
```

Output: `artifacts/erp-system/dist/public/`

The Express backend automatically serves these files in production mode. No separate frontend server needed.

### Verify static files are in place

```bash
ls artifacts/erp-system/dist/public/
# Should see: index.html, assets/, favicon.ico, etc.
```

---

## C) Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | Secret for signing JWT tokens (min 32 chars, use 64) |
| `PORT` | Yes | Port for the Node.js server (default: `8080`, use `3000` in production) |
| `NODE_ENV` | Yes | Set to `production` |
| `ALLOWED_ORIGINS` | Recommended | Comma-separated allowed CORS origins (e.g., `https://yourdomain.com`) |
| `LOG_LEVEL` | No | Pino log level — `info` (default), `warn`, `error` |
| `FRONTEND_DIST` | No | Override path to frontend build (default: relative to backend dist) |

---

## D) Recommended Server Specs

| Tier | Users | Specs |
|---|---|---|
| Starter | ≤25 | 2 vCPU, 2 GB RAM, 20 GB SSD |
| Standard | ≤100 | 4 vCPU, 4 GB RAM, 40 GB SSD |
| Growth | ≤500 | 8 vCPU, 8 GB RAM, 80 GB SSD + read replica |

**Cloud options:** DigitalOcean Droplet, Hetzner CX21, AWS t3.small, Vultr

---

## E) Ports Used

| Service | Port | Notes |
|---|---|---|
| Node.js (API + frontend) | `3000` | Internal, not exposed directly |
| Nginx (HTTP) | `80` | Redirects to HTTPS |
| Nginx (HTTPS) | `443` | Public-facing |
| PostgreSQL | `5432` | Local only — never expose publicly |

---

## F) Remaining Risks and Notes

### Known Risks

1. **Accounts table unique constraint** — `accounts.code` has a global unique constraint. For multi-tenant use, it should be unique per company. This is low risk currently (each new company gets their own account codes), but worth monitoring as user count grows.

2. **company_id filtering incomplete** — Routes for `accounts`, `journal_entries`, `vouchers` (receipt/deposit/payment/treasury), `transactions` ledger, `customer_ledger`, and `suppliers` still default to company_id=1 for legacy data. New registrations are isolated, but these routes should be fully filtered for complete tenant isolation.

3. **Default admin user** — On first startup with an empty database, `seedDefaults` creates `admin` / PIN `123456`. This is only triggered on an empty database. For production, change the PIN immediately after first login.

4. **Super admin credentials** — Seed manually with:
   ```sql
   INSERT INTO erp_users (name, username, email, password_hash, role, active)
   VALUES ('Super Admin', 'superadmin', 'super@yourdomain.com', '<bcrypt_hash>', 'super_admin', true);
   ```
   Or use the existing seeded credentials and change the password via the API.

5. **Backup scheduler** — The built-in backup scheduler runs in development. Review `src/lib/backup-scheduler.ts` to ensure its behavior is appropriate for your VPS storage.

6. **Rate limits** — Login is limited to 10 req/min per IP. General API is 100 req/min. Adjust in `app.ts` if needed.

### Security Checklist

- [ ] `JWT_SECRET` is at least 64 random hex characters
- [ ] `DATABASE_URL` uses a non-superuser PostgreSQL role
- [ ] PostgreSQL port 5432 is firewalled (not publicly accessible)
- [ ] `ALLOWED_ORIGINS` is set to your exact domain
- [ ] SSL certificate is installed (Certbot / Let's Encrypt)
- [ ] PM2 is configured to auto-restart on reboot (`pm2 startup`)
- [ ] Default admin PIN changed after first login
- [ ] Logs directory has appropriate permissions

### Complete Build + Deploy Sequence

```bash
# 1. Pull latest code
git pull

# 2. Install dependencies
pnpm install

# 3. Push any schema changes
pnpm --filter @workspace/db run db:push

# 4. Build backend
pnpm --filter @workspace/api-server run build

# 5. Build frontend
PORT=3000 BASE_PATH=/ NODE_ENV=production \
  pnpm --filter @workspace/erp-system run build

# 6. Restart backend
pm2 restart erp-api

# 7. Reload Nginx (if config changed)
sudo nginx -t && sudo nginx -s reload
```
