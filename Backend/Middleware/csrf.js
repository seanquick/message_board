// Backend/Middleware/csrf.js
/**
 * CSRF protection middleware (double-submit cookie + same-origin check).
 *
 * Behavior:
 * - Sets a SameSite=Lax, non-HttpOnly cookie `csrf` on GET/HEAD/OPTIONS.
 * - For unsafe methods (POST, PUT, PATCH, DELETE), verifies:
 *     1) Header `x-csrf-token` matches cookie value
 *     2) Origin or Referer matches the current host
 * - Optional fallback (not recommended): CSRF_ORIGIN_FALLBACK=1 to relax header check
 */

const crypto = require('crypto');

function isProd() {
  return process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1';
}

function baseCookieOpts() {
  return {
    path: '/',
    sameSite: 'lax',
    secure: isProd(),
    httpOnly: false, // JS-accessible for double-submit token
  };
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url'); // URL-safe
}

function isSameOrigin(req) {
  const host = (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
  const origin = (req.get('origin') || '').toLowerCase();
  const referer = (req.get('referer') || '').toLowerCase();

  const matchHost = (url) => {
    try {
      return new URL(url).host.toLowerCase() === host;
    } catch {
      return false;
    }
  };

  return matchHost(origin) || matchHost(referer);
}

module.exports = function csrf(options = {}) {
  const cookieName = 'csrf';
  const headerName = (options.headerName || 'x-csrf-token').toLowerCase();
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  const allowOriginFallback = process.env.CSRF_ORIGIN_FALLBACK === '1';

  return function csrfMiddleware(req, res, next) {
    const method = req.method.toUpperCase();

    if (safeMethods.has(method)) {
      const existing = req.cookies?.[cookieName];
      const token = existing || generateToken();
      res.cookie(cookieName, token, baseCookieOpts());
      req.csrfToken = token;
      return next();
    }

    const cookieToken = req.cookies?.[cookieName];
    const headerToken = (req.get(headerName) || '').trim();
    const isValidOrigin = isSameOrigin(req);
    const isTokenMatch = cookieToken && headerToken && cookieToken === headerToken;

    if ((isTokenMatch && isValidOrigin) || (isValidOrigin && allowOriginFallback)) {
      return next();
    }

     console.warn('[csrf] Failed check — cookie:', cookieToken, 'header:', headerToken, 'originOk:', isValidOrigin);
     return res.status(403).json({ error: 'CSRF token invalid or missing' });
  };
};
