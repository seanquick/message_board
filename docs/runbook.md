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


Final cutover checklist (add to your docs/runbook.md)

Lock MongoDB access

Replace “Allow from anywhere” with Render egress IP(s) in Atlas Network Access.

Re-enable “Require TLS/SSL” (Atlas → Database → Security).

Confirm database user is least-privileged (RW on your DB only).

Secrets review

Rotate any temporary secrets used during testing.

Ensure Render env vars are set (not in repo):
MONGO_URI, JWT_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ADMIN_EMAILS (comma-sep if multiple), APP_BASE_URL, SEND_REPORT_EMAILS=1 (optional).

Health/uptime monitoring

Point UptimeRobot (or similar) at /api/healthz (1-min interval, alert if non-200 or ok:false).

See code snippet below if you don’t have /api/healthz yet.

Backups & restore drill

Verify Atlas automated backups are enabled.

Perform a test restore to a new staging database, point a local .env to it, run npm run smoke, then discard.

Roll-back plan

Document Render rollback: Render → Service → Deploys → Roll back to previous deploy.

Tag each release (npm version patch|minor|major) so deploys are traceable.

Log visibility

Confirm Render logs show app output, and you can filter by level (info/warn/error).

Decide retention (download important logs post-incident).

Security posture

Confirm CSP is strict (we already removed inline scripts; fonts are local).

Ensure rate limits are active (they are).

Confirm CSRF is enabled (we added double-submit).

Confirm cookie flags: httpOnly, sameSite=lax, secure in prod (done).

Admin access & recovery

Have at least two admin accounts with different emails.

Verify “ban user”, “pin/lock/delete/restore”, report resolution all work in prod.

Email delivery

Send a test mail (password reset/report notice) on prod; check it lands in inbox (adjust SPF/DKIM if you use a custom domain).

Smoke tests on prod

From your machine:

node scripts/smoke.mjs https://your-render-url.onrender.com


(You can pass a base URL to that script; it will hit /, /login.html, /api/threads.)

Analytics/robots (optional)

If you add analytics, update CSP and privacy notice.

Add robots.txt if needed.

Post-launch watch

For the first week, check logs + reports queue daily, track 500s, and triage.