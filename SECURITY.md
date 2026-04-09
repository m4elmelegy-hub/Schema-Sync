# Security Policy — Halal Tech ERP

## Security Features

| Layer | Mechanism |
|-------|-----------|
| Authentication | JWT (4h access token + 7d refresh token) |
| PIN hashing | bcrypt (12 rounds) |
| 2FA | TOTP (Google Authenticator / Authy) for Super Admin |
| TOTP storage | AES-256-CBC encrypted in DB (key from `TOTP_ENCRYPTION_KEY` env) |
| Rate limiting | 100 req/min general · 10 req/min auth · 5 attempts/15min for 2FA |
| Login lockout | 5 failed attempts → 15-minute lockout per userId |
| Session management | JWT blacklist on logout (in-memory, TTL-expiring) |
| Multi-tenant isolation | All DB queries filtered by `company_id` |
| Input validation | Zod schemas on all routes |
| XSS protection | `xss` sanitizer applied to all request bodies |
| HTTP Parameter Pollution | `hpp` middleware |
| Security headers | Helmet + `X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff` + `Cache-Control: no-store` |
| SQL injection | Drizzle ORM parameterized queries only |
| CSRF | SameSite cookie policy + Bearer token (not cookie-based auth) |
| Audit logging | Sensitive operations logged with `company_id` + user |
| DB backups | Automated daily at 03:00 AM (pg_dump + gzip, 30 rotations) |
| Health monitoring | DB ping every 60s, PM2 crash recovery |
| IP restriction | `SUPER_ADMIN_IPS` env var restricts Super Admin dashboard access |
| Sensitive log redaction | PIN, password, tokens redacted from all logs |
| DB query timeout | 30s statement + query timeout |
| Request size limit | 10MB max body size |

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `JWT_SECRET` | Signs access tokens | ✅ |
| `JWT_REFRESH_SECRET` | Signs refresh tokens (falls back to `JWT_SECRET + "_refresh"`) | Optional |
| `TOTP_ENCRYPTION_KEY` | 32-char AES key for TOTP secrets (derived from JWT_SECRET if absent) | Recommended |
| `SUPER_ADMIN_IPS` | Comma-separated IP allowlist for `/api/super/*` routes | Optional |
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `ALLOWED_ORIGINS` | CORS allowlist | Optional |

## Reporting a Vulnerability

Please report security issues to: **[security@halal-tech.com]**

Do not open public GitHub issues for security vulnerabilities.
