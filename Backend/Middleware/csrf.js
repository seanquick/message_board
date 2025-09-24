// Backend/Middleware/csrf.js
/**
 * CSRF protection middleware (double-submit + same-origin check).
 *
 * - Sets a non-HttpOnly SameSite=Lax cookie `csrfToken` on GET/HEAD/OPTIONS
 * - Requires header "x-csrf-token" on POST/PUT/PATCH/DELETE to match cookie
 * - Also validates Origin/Referer to be same-origin (defense-in-depth)
 * - Allows toggling a fallback via env CSRF_ORIGIN_FALLBACK=1 (accepts same-origin
 *   requests even if header missing — not recommended; leave unset for strict mode)
 */

const crypto = require('crypto');

function isProd() {
  return process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1';
}

function baseCookieOpts() {
  return {
    path: '/',
    sameSite: 'lax',
    secure: !!isProd(),
    httpOnly: false, // must be readable by JS to send in header
    // You can add `maxAge` (e.g. 1 day) if you want, but session-length is fine.
  };
}

function genToken() {
  // URL-safe random token
  return crypto.randomBytes(32).toString('base64url');
}

function sameOrigin(req) {
  // Compare Origin/Referer host to req.get('host')
  const host = (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
  const origin = (req.get('origin') || '').toLowerCase();
  const referer = (req.get('referer') || '').toLowerCase();

  const match = (url) => {
    try {
      if (!url) return false;
      const h = new URL(url).host.toLowerCase();
      return h === host;
    } catch { return false; }
  };

  // If Origin is present, prefer it. Otherwise fall back to Referer.
  if (origin) return match(origin);
  if (referer) return match(referer);
  // If neither header is present (non-browser / same-origin fetch may omit),
  // treat as unknown (not positively same-origin).
  return false;
}

module.exports = function csrf(options = {}) {
  const cookieName = options.cookieName || 'csrfToken';
  const headerName = (options.headerName || 'x-csrf-token').toLowerCase();
  const ignored = new Set(['GET', 'HEAD', 'OPTIONS']);
  const originFallback = process.env.CSRF_ORIGIN_FALLBACK === '1';

  return function csrfMiddleware(req, res, next) {
    const method = req.method.toUpperCase();

    // Always ensure a token cookie exists for safe methods
    if (ignored.has(method)) {
      if (!req.cookies?.[cookieName]) {
        const token = genToken();
        res.cookie(cookieName, token, baseCookieOpts());
        req.csrfToken = token;
      } else {
        req.csrfToken = req.cookies[cookieName];
      }
      return next();
    }

    // For mutating methods, validate token and same-origin
    const cookieToken = req.cookies?.[cookieName];
    const headerToken = (req.get(headerName) || '').trim();

    // origin / referer check (defense-in-depth)
    const isSameOrigin = sameOrigin(req);

    // Strict mode: must be same-origin AND tokens must match
    const tokenOk = cookieToken && headerToken && cookieToken === headerToken;

    if (tokenOk && isSameOrigin) return next();

    // Optional fallback: allow if same-origin even without token (set CSRF_ORIGIN_FALLBACK=1)
    if (!tokenOk && isSameOrigin && originFallback) return next();

    return res.status(403).json({ error: 'CSRF token invalid or missing' });
  };
};
