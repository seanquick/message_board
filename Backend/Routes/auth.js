// Backend/Routes/auth.js
/**
 * Auth routes — robust + legacy-safe + self-contained validator
 * - Normalizes email
 * - Accepts legacy user.password (plain or bcrypt) and auto-upgrades to passwordHash
 * - Blocks banned users & honors tokenVersion
 * - Sets hardened cookies (httpOnly, sameSite:lax, secure in prod)
 * - Exposes GET /api/auth/csrf to seed CSRF cookie pre-login (for double-submit CSRF)
 */

const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = require('../Models/User');

const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-change-me';

/* ---------------- Minimal self-contained validator ---------------- */
const s = {
  string(opts = {}) {
    return {
      parse(v) {
        v = v == null ? '' : String(v);
        if (opts.trim) v = v.trim();
        if (opts.lowercase) v = v.toLowerCase();
        if (typeof opts.min === 'number' && v.length < opts.min) {
          throw new Error(`Must be at least ${opts.min} characters`);
        }
        if (typeof opts.max === 'number' && v.length > opts.max) {
          v = v.slice(0, opts.max);
        }
        if (opts.email) {
          // simple email sanity check
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('Invalid email');
        }
        if (opts.pattern && !opts.pattern.test(v)) {
          throw new Error('Invalid format');
        }
        return v;
      }
    };
  },
  optional(schema) {
    return { parse: (v) => (v == null ? undefined : schema.parse(v)) };
  },
};

/* ---------------- helpers ---------------- */
function signToken(user) {
  const payload = { uid: String(user._id), role: user.role || 'user', ver: user.tokenVersion || 0 };
  const ttl = process.env.JWT_TTL || '7d';
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttl });
}

function setAuthCookies(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
  });
  // also refresh csrf after login
  const csrf = crypto.randomBytes(16).toString('hex');
  res.cookie('csrf', csrf, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProd,
    path: '/'
  });
  return csrf;
}

function setCsrfCookie(res) {
  const csrf = crypto.randomBytes(16).toString('hex');
  res.cookie('csrf', csrf, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProd,
    path: '/'
  });
  return csrf;
}

function clearAuthCookies(res) {
  res.clearCookie('token', { path: '/' });
  res.clearCookie('csrf',  { path: '/' });
}

async function verifyPassword(user, supplied) {
  const hash = user.passwordHash || user.hash;
  // modern hash
  if (hash && hash.startsWith('$2')) {
    const ok = await bcrypt.compare(supplied, hash);
    if (ok) return { ok: true, upgraded: false };
  }
  // legacy paths
  if (typeof user.password === 'string' && user.password.length > 0) {
    if (user.password.startsWith('$2')) {
      const ok = await bcrypt.compare(supplied, user.password);
      if (ok) return { ok: true, upgraded: true, legacyField: 'password' };
    } else {
      if (supplied === user.password) {
        return { ok: true, upgraded: true, legacyField: 'password', wasPlain: true };
      }
    }
  }
  return { ok: false };
}

async function upgradePasswordHashIfNeeded(user, supplied, meta) {
  if (!meta?.upgraded) return;
  const newHash = await bcrypt.hash(supplied, 12);
  user.passwordHash = newHash;
  if (meta.legacyField && user[meta.legacyField]) {
    try { user[meta.legacyField] = undefined; } catch {}
  }
  await user.save();
}

/* ---------------- routes ---------------- */

// Pre-login CSRF seeding (safe, idempotent)
router.get('/csrf', (req, res) => {
  const token = setCsrfCookie(res);
  res.json({ ok: true, token });
});

// Register
router.post('/register', async (req, res) => {
  try {
    const name = s.string({ trim: true, max: 120 }).parse(req.body?.name || '');
    const email = s.string({ trim: true, lowercase: true, email: true, max: 200 }).parse(req.body?.email || '');
    const password = s.string({ trim: true, min: 8, max: 200 }).parse(req.body?.password || '');

    const exists = await User.findOne({ email }).select('_id').lean();
    if (exists) return res.status(400).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const u = await User.create({ name, email, passwordHash, role: 'user', tokenVersion: 0 });

    const token = signToken(u);
    setAuthCookies(res, token);
    res.json({ ok: true, user: { id: u._id, name: u.name, email: u.email, role: u.role } });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Failed to register' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const email = s.string({ trim: true, lowercase: true, email: true, max: 200 }).parse(req.body?.email || '');
    const password = s.string({ trim: true, min: 1, max: 200 }).parse(req.body?.password || '');

    const user = await User.findOne({ email });
    if (!user) { await new Promise(r => setTimeout(r, 150)); return res.status(401).json({ error: 'Invalid email or password' }); }
    if (user.isBanned) return res.status(403).json({ error: 'This account has been banned.' });

    const check = await verifyPassword(user, password);
    if (!check.ok) return res.status(401).json({ error: 'Invalid email or password' });

    await upgradePasswordHashIfNeeded(user, password, check);

    const token = signToken(user);
    setAuthCookies(res, token);
    res.json({ ok: true, user: { id: user._id, name: user.name, email: user.email, role: user.role || 'user' } });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Failed to login' });
  }
});

// Logout
router.post('/logout', async (_req, res) => { clearAuthCookies(res); res.json({ ok: true }); });

// Me
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.json({ user: null });
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch { return res.json({ user: null }); }
    const user = await User.findById(payload.uid).select('name email role isBanned tokenVersion').lean();
    if (!user || user.isBanned || (user.tokenVersion||0)!==(payload.ver||0)) return res.json({ user: null });
    res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role || 'user' } });
  } catch { res.json({ user: null }); }
});

// Forgot
router.post('/forgot', async (req, res) => {
  try {
    const email = s.string({ trim: true, lowercase: true, email: true, max: 200 }).parse(req.body?.email || '');
    const u = await User.findOne({ email }).select('_id email name').lean();
    if (u) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const tokenExpMins = parseInt(process.env.RESET_TOKEN_MINS || '30', 10);
      await User.updateOne({ _id: u._id }, { $set: { resetTokenHash: tokenHash, resetTokenExp: new Date(Date.now()+tokenExpMins*60_000) } });
      try {
        const { sendMail } = require('../Services/mailer');
        const base = process.env.PUBLIC_ORIGIN || '';
        const link = `${base}/reset.html?token=${encodeURIComponent(token)}`;
        await sendMail({ to: u.email, subject: 'Password reset', text: `Hello${u.name?' '+u.name:''},\n\nReset your password:\n${link}\n\nExpires in ${tokenExpMins} minutes.\n` });
      } catch {}
    }
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

// Reset
router.post('/reset', async (req, res) => {
  try {
    const token = s.string({ trim: true, max: 256 }).parse(req.body?.token || '');
    const password = s.string({ trim: true, min: 8, max: 200 }).parse(req.body?.password || '');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const u = await User.findOne({ resetTokenHash: tokenHash }).select('+resetTokenExp');
    if (!u || !u.resetTokenExp || new Date(u.resetTokenExp).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    u.passwordHash = await bcrypt.hash(password, 12);
    u.resetTokenHash = undefined;
    u.resetTokenExp  = undefined;
    await u.save();
    const jwtToken = signToken(u);
    setAuthCookies(res, jwtToken);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Failed to reset password' });
  }
});

module.exports = router;
