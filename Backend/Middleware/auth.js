// Backend/Middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../Models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-change-me';

function isProd() {
  return process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1';
}

function cookieOptsBase() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!isProd(),
    path: '/',
  };
}

function setAuthCookie(res, token, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  res.cookie('token', token, {
    ...cookieOptsBase(),
    maxAge: maxAgeMs,
  });
}

function clearAuthCookie(res) {
  res.clearCookie('token', cookieOptsBase());
}

/* ------------------------------------------------------- *
 *  TRY AUTH — attaches req.user if token is valid
 * ------------------------------------------------------- */
async function tryAuth(req, _res, next) {
  try {
    const raw = req.cookies?.token;
    if (!raw) {
      console.log('[tryAuth] No token cookie present');
      return next();
    }

    let payload;
    try {
      payload = jwt.verify(raw, JWT_SECRET);
    } catch (err) {
      console.warn('[tryAuth] JWT verify failed:', err.message);
      return next();
    }

    const uid = payload?.uid;
    if (!uid) {
      console.warn('[tryAuth] Missing uid in payload');
      return next();
    }

    const user = await User.findById(uid).select('name email role isBanned tokenVersion').lean();
    if (!user) {
      console.warn('[tryAuth] User not found for id:', uid);
      return next();
    }
    if (user.isBanned) {
      console.warn('[tryAuth] User banned:', user.email);
      return next();
    }

    const tokenVersion = Number(payload?.tv ?? 0);
    const currentTV = Number(user.tokenVersion ?? 0);
    if (tokenVersion !== currentTV) {
      console.warn('[tryAuth] Token version mismatch:', { tokenVersion, currentTV });
      return next();
    }

    req.user = {
      uid: String(uid),
      role: user.role || 'user',
      name: user.name || '',
      email: user.email || '',
      tokenVersion: currentTV,
      cookie: { set: setAuthCookie, clear: clearAuthCookie },
    };

    console.log('[tryAuth] Authenticated user:', req.user.email, 'role:', req.user.role);
    next();
  } catch (err) {
    console.error('[tryAuth] Unexpected error:', err);
    next();
  }
}

/* ------------------------------------------------------- *
 *  REQUIRE AUTH — must have valid token
 * ------------------------------------------------------- */
async function requireAuth(req, res, next) {
  console.log('[requireAuth] Checking authentication for', req.originalUrl);
  try {
    const raw = req.cookies?.token;
    if (!raw) {
      console.warn('[requireAuth] No token cookie found');
      return sendAuthFailure(req, res);
    }

    let payload;
    try {
      payload = jwt.verify(raw, JWT_SECRET);
    } catch (err) {
      console.warn('[requireAuth] JWT verification failed:', err.message);
      return sendAuthFailure(req, res);
    }

    const uid = payload?.uid;
    if (!uid) {
      console.warn('[requireAuth] Missing uid in payload');
      return sendAuthFailure(req, res);
    }

    const user = await User.findById(uid).select('name email role isBanned tokenVersion').lean();
    if (!user) {
      console.warn('[requireAuth] No user found for id:', uid);
      return sendAuthFailure(req, res);
    }
    if (user.isBanned) {
      console.warn('[requireAuth] User banned:', user.email);
      return res.status(403).json({ error: 'Account banned' });
    }

    const tokenVersion = Number(payload?.tv ?? 0);
    const currentTV = Number(user.tokenVersion ?? 0);
    if (tokenVersion !== currentTV) {
      console.warn('[requireAuth] Token version mismatch:', { tokenVersion, currentTV });
      return sendAuthFailure(req, res);
    }

    req.user = {
      uid: String(uid),
      role: user.role || 'user',
      name: user.name || '',
      email: user.email || '',
      tokenVersion: currentTV,
      cookie: { set: setAuthCookie, clear: clearAuthCookie },
    };

    console.log('[requireAuth] Authenticated user:', req.user.email, 'role:', req.user.role);
    next();
  } catch (e) {
    console.error('[requireAuth] Exception:', e);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

/* ------------------------------------------------------- *
 *  REQUIRE ADMIN — must be logged in + admin role
 * ------------------------------------------------------- */
async function requireAdmin(req, res, next) {
  console.log('─────────────────────────────');
  console.log('[requireAdmin] URL:', req.originalUrl);
  console.log('[requireAdmin] Cookies:', Object.keys(req.cookies || {}));

  return requireAuth(req, res, () => {
    console.log('[requireAdmin] User after requireAuth:', req.user);
    if ((req.user?.role || 'user') !== 'admin') {
      console.warn('[requireAdmin] Admin check failed:', req.user);
      return sendAuthFailure(req, res, true);
    }
    console.log('[requireAdmin] ✅ Admin verified:', req.user.email);
    next();
  });
}

/* ------------------------------------------------------- *
 *  SEND AUTH FAILURE — 401 JSON for API / redirect otherwise
 * ------------------------------------------------------- */
function sendAuthFailure(req, res, isAdmin = false) {
  const isApi = req.originalUrl.startsWith('/api/');
  const message = isAdmin ? 'Admin only' : 'Not authenticated';
  console.warn(`[sendAuthFailure] ${message} for ${req.originalUrl}`);

  if (isApi) {
    return res.status(401).json({ error: message });
  } else {
    return res.redirect('/login.html');
  }
}

module.exports = {
  tryAuth,
  requireAuth,
  requireAdmin,
  setAuthCookie,
  clearAuthCookie,
};
