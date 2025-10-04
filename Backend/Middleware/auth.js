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

async function tryAuth(req, _res, next) {
  try {
    const raw = req.cookies?.token;
    if (!raw) return next();

    const payload = jwt.verify(raw, JWT_SECRET);
    const uid = payload?.uid;
    if (!uid) return next();

    const user = await User.findById(uid).select('name email role isBanned tokenVersion').lean();
    if (!user) return next();
    if (user.isBanned) return next();

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
    return next();
  } catch {
    return next();
  }
}

async function requireAuth(req, res, next) {
  try {
    const raw = req.cookies?.token;
    if (!raw) return res.status(401).json({ error: 'Not authenticated' });

    let payload;
    try {
      payload = jwt.verify(raw, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const uid = payload?.uid;
    if (!uid) return res.status(401).json({ error: 'Invalid token payload' });

    const user = await User.findById(uid).select('name email role isBanned tokenVersion').lean();
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.isBanned) return res.status(403).json({ error: 'Account banned' });

    const tokenVersion = Number(payload?.tv ?? 0);
    const currentTV = Number(user.tokenVersion ?? 0);
    if (tokenVersion !== currentTV) {
      return res.status(401).json({ error: 'Session revoked' });
    }

    req.user = {
      uid: String(uid),
      role: user.role || 'user',
      name: user.name || '',
      email: user.email || '',
      tokenVersion: currentTV,
      cookie: { set: setAuthCookie, clear: clearAuthCookie },
    };
    return next();
  } catch (e) {
    console.error('[auth] requireAuth error:', e);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

async function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if ((req.user?.role || 'user') !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  });
}

module.exports = {
  tryAuth,
  requireAuth,
  requireAdmin,
  setAuthCookie,
  clearAuthCookie,
};
