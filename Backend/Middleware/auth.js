// Backend/Middleware/auth.js
console.log('[requireAdmin] req.originalUrl =', req.originalUrl, 'req.user =', req.user);

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

async function tryAuth(req, _res, next) {
  try {
    const raw = req.cookies?.token;
    if (!raw) return next();

    const payload = jwt.verify(raw, JWT_SECRET);
    const uid = payload?.uid;
    if (!uid) return next();

    const user = await User.findById(uid).select('name email role isBanned tokenVersion').lean();
    if (!user || user.isBanned) return next();

    const tokenVersion = Number(payload?.tv ?? 0);
    const currentTV = Number(user.tokenVersion ?? 0);
    if (tokenVersion !== currentTV) return next();

    req.user = {
      uid: String(uid),
      role: user.role || 'user',
      name: user.name || '',
      email: user.email || '',
      tokenVersion: currentTV,
      cookie: { set: setAuthCookie, clear: clearAuthCookie },
    };
    next();
  } catch {
    return next();
  }
}

async function requireAuth(req, res, next) {
  try {
    const raw = req.cookies?.token;
    if (!raw) return sendAuthFailure(req, res);

    let payload;
    try {
      payload = jwt.verify(raw, JWT_SECRET);
    } catch {
      return sendAuthFailure(req, res);
    }

    const uid = payload?.uid;
    if (!uid) return sendAuthFailure(req, res);

    const user = await User.findById(uid).select('name email role isBanned tokenVersion').lean();
    if (!user) return sendAuthFailure(req, res);
    if (user.isBanned) return res.status(403).json({ error: 'Account banned' });

    const tokenVersion = Number(payload?.tv ?? 0);
    const currentTV = Number(user.tokenVersion ?? 0);
    if (tokenVersion !== currentTV) return sendAuthFailure(req, res);

    req.user = {
      uid: String(uid),
      role: user.role || 'user',
      name: user.name || '',
      email: user.email || '',
      tokenVersion: currentTV,
      cookie: { set: setAuthCookie, clear: clearAuthCookie },
    };
    next();
  } catch (e) {
    console.error('[auth] requireAuth error:', e);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

async function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if ((req.user?.role || 'user') !== 'admin') {
      return sendAuthFailure(req, res, true); // true = isAdminCheck
    }
    next();
  });
}

// 🧠 This sends 401 JSON for /api/* and redirects for frontend
function sendAuthFailure(req, res, isAdmin = false) {
  const isApi = req.originalUrl.startsWith('/api/');
  const message = isAdmin ? 'Admin only' : 'Not authenticated';

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
