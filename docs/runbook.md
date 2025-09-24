# Go-Live Runbook — Message Board

## 0) Environments & Secrets
**Envs:** DEV, STAGING, PROD

**Required .env keys (PROD):**
- `MONGO_URI=...`
- `PORT=3000`
- `NODE_ENV=production`
- `JWT_SECRET=<long-random-64+>`
- `CSRF_SECRET=<long-random-64+>`
- `RATE_MAX_PER_MIN=120`
- `SMTP_HOST=...` `SMTP_PORT=...` `SMTP_USER=...` `SMTP_PASS=...`
- `SMTP_FROM="Community Team <no-reply@example.com>"`
- `SEND_REPORT_EMAILS=1`
- `ADMIN_EMAILS=admin1@example.com,admin2@example.com`

**Proxy (SSE examples):**
