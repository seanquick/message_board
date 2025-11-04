// Backend/Middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../Models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-change-me';
const TOKEN_EXPIRY = '7d'; // Set token expiration (adjust as needed)
const LOG_AUTH = process.env.LOG_AUTH === '1'; // Toggle verbose auth logging

function isProd() {
  return process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1';
}

function cookieOptsBase() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd(),
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

// -------------------------------------------------------
// TRY AUTH — optional, attaches req.user if valid
// -------------------------------------------------------
async function tryAuth(req, _res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return next();

    const payload = jwt.verify(token, JWT_SECRET);
    const uid = payload?.uid;
    if (!uid) return next();

    const user = await User.findById(uid).select('name email role isBanned tokenVersion').lean();
    if (!user || user.isBanned) return next();

    const currentTV = Number(user.tokenVersion || 0);
    if (Number(payload.tv || 0) !== currentTV) return next();

    req.user = {
      uid: String(uid),
      role: user.role || 'user',
      name: user.name || '',
      email: user.email || '',
      tokenVersion: currentTV,
      cookie: { set: setAuthCookie, clear: clearAuthCookie },
    };

    if (LOG_AUTH) console.log('[tryAuth] Authenticated:', req.user.email);
  } catch (err) {
    if (LOG_AUTH) console.warn('[tryAuth] Failed:', err.message);
  }
  next();
}

// -------------------------------------------------------
// REQUIRE AUTH — blocks if not logged in
// -------------------------------------------------------
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return sendAuthFailure(req, res);

    const payload = jwt.verify(token, JWT_SECRET);
    const uid = payload?.uid;
    if (!uid) return sendAuthFailure(req, res);

    const user = await User.findById(uid).select('name email role isBanned tokenVersion').lean();
    if (!user) return sendAuthFailure(req, res);
    if (user.isBanned) return res.status(403).json({ error: 'Account banned' });

    const currentTV = Number(user.tokenVersion || 0);
    if (Number(payload.tv || 0) !== currentTV) return sendAuthFailure(req, res);

    req.user = {
      uid: String(uid),
      role: user.role || 'user',
      name: user.name || '',
      email: user.email || '',
      tokenVersion: currentTV,
      cookie: { set: setAuthCookie, clear: clearAuthCookie },
    };

    if (LOG_AUTH) console.log('[requireAuth] Verified:', req.user.email);
    next();
  } catch (err) {
    console.error('[requireAuth] Error:', err);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// -------------------------------------------------------
// REQUIRE ADMIN — must be admin user
// -------------------------------------------------------
async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if ((req.user?.role || 'user') !== 'admin') {
      return sendAuthFailure(req, res, true);
    }
    if (LOG_AUTH) console.log('[requireAdmin] Admin OK:', req.user.email);
    next();
  });
}

// -------------------------------------------------------
// SEND AUTH FAILURE
// -------------------------------------------------------
function sendAuthFailure(req, res, isAdmin = false) {
  const isApi = req.originalUrl.startsWith('/api/');
  const message = isAdmin ? 'Admin only' : 'Not authenticated';
  if (LOG_AUTH) console.warn(`[Auth] ${message} for ${req.originalUrl}`);

  if (isApi) {
    return res.status(401).json({ error: message });
  } else {
    return res.redirect('/login.html');
  }
}

const requireUser = requireAuth; // alias for clarity

module.exports = {
  tryAuth,
  requireAuth,
  requireUser,     // ✅ Now it's exported
  requireAdmin,
  setAuthCookie,
  clearAuthCookie,
};

