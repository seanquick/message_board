// Backend/Routes/auth.js
/**
 * Auth routes — robust + legacy-safe + self-contained validator
 * - Normalizes email
 * - Accepts legacy user.password (plain or bcrypt) and auto-upgrades to passwordHash
 * - Blocks banned users & honors tokenVersion
 * - Sets hardened cookies (httpOnly, sameSite:lax, secure in prod)
 * - Exposes GET /api/auth/csrf to seed CSRF cookie pre-login (for double-submit CSRF)
 * - Adds POST /api/auth/refresh to reissue token with correct role/tokenVersion
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
  // Note: use "tv" (tokenVersion) so it matches requireAuth’s logic
  const payload = {
    uid: String(user._id),
    role: user.role || 'user',
    tv: user.tokenVersion ?? 0
  };
  const ttl = process.env.JWT_TTL || '7d';
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttl });
}

function setAuthCookies(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/'
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
  if (hash && hash.startsWith('$2')) {
    const ok = await bcrypt.compare(supplied, hash);
    if (ok) return { ok: true, upgraded: false };
  }
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

// Register (with email verification)
router.post('/register', async (req, res) => {
  try {
    const name = s.string({ trim: true, max: 120 }).parse(req.body?.name || '');
    const email = s.string({ trim: true, lowercase: true, email: true, max: 200 }).parse(req.body?.email || '');
    const password = s.string({ trim: true, min: 8, max: 200 }).parse(req.body?.password || '');

    const exists = await User.findOne({ email }).select('_id').lean();
    if (exists) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const token = crypto.randomBytes(32).toString('hex');
    console.log('[auth:register] raw verify token for', email, '=', token);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    console.log('[auth:register] storing tokenHash for', email, '=', tokenHash);


    const u = await User.create({
      name,
      email,
      passwordHash,
      role: 'user',
      tokenVersion: 0,
      emailVerified: false,
      emailVerifyToken: tokenHash,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    
    console.log('[auth:register] user created:', u._id.toString(), u.email);
    console.log('[register] Created user:', u.email, 'raw token:', token);

    // Build full link
    const base = process.env.PUBLIC_ORIGIN || process.env.SITE_URL || 'https://board.quickclickswebsites.com';
    const verifyLink = `${base}/verify-email.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

    try {
      const { sendMail } = require('../Services/mailer');
      await sendMail({
        to: u.email,
        subject: 'Verify your email address',
        text: `Welcome ${name}!\n\nPlease verify your email by clicking the link:\n${verifyLink}\n\nThe link is valid for 24 hours.`
      });
      console.log('[register] Mail sent to:', u.email);
    } catch (e) {
      console.error('[auth] failed to send verification email:', e.message);
    }

    return res.json({
      ok: true,
      message: 'Registration successful! Check your email for a verification link.'
    });
  } catch (e) {
    console.error('[register] Error:', e);
    return res.status(400).json({ error: e?.message || 'Failed to register' });
  }
});



// Login
router.post('/login', async (req, res) => {
  try {
    const email = s.string({ trim: true, lowercase: true, email: true, max: 200 })
      .parse(req.body?.email || '');
    const password = s.string({ trim: true, min: 1, max: 200 })
      .parse(req.body?.password || '');

    const user = await User.findOne({ email });
    if (!user) {
      await new Promise(r => setTimeout(r, 150));
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been banned.' });
    }

    // ✅ Require email verification
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.' });
    }

    const check = await verifyPassword(user, password);
    if (!check.ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await upgradePasswordHashIfNeeded(user, password, check);

    const token = signToken(user);
    setAuthCookies(res, token);

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'user'
      }
    });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Failed to login' });
  }
});



  // Verify email
  // In auth.js
  router.post('/verify-email', async (req, res) => {
    const { token, email } = req.body || {};
    console.log('[verify-email] start for token:', token, 'email:', email);

    if (!token || !email) {
      return res.status(400).json({ error: 'Missing token or email' });
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const user = await User.findOne({
        email: String(email).toLowerCase(),
        emailVerifyToken: tokenHash,
        emailVerifyExpires: { $gt: new Date() }
      });
      console.log('[verify-email] user found:', user ? user.email : null);

      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired verification token' });
      }

      user.emailVerified = true;
      user.emailVerifyToken = undefined;
      user.emailVerifyExpires = undefined;
      await user.save();

      console.log('[verify-email] ✅ Verified user:', user.email);
      return res.json({ ok: true, message: 'Email verified successfully!' });

    } catch (err) {
      console.error('[verify-email] error:', err);
      return res.status(500).json({ error: 'Server error verifying email' });
    }
  });




// Resend verification email (unauthenticated)
router.post('/resend-verification', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.warn('[resend-verification] Invalid email input:', req.body?.email);
      return res.status(400).json({ error: 'Invalid email' });
    }

    const user = await User.findOne({ email }).lean();
    if (!user) {
      console.info(`[resend-verification] No user found for email ${email} — masking response`);
      return res.json({ message: 'If that email exists, a verification link will be sent.' });
    }

    if (user.emailVerified) {
      console.info(`[resend-verification] Email already verified for userId ${user._id}, email ${email}`);
      return res.json({ message: 'Email already verified.' });
    }

    // generate token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires   = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await User.updateOne(
      { _id: user._id },
      { emailVerifyToken: tokenHash, emailVerifyExpires: expires }
    );

    const { sendMail } = require('../Services/mailer');
    const base = process.env.PUBLIC_ORIGIN || '';
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const link = `${siteUrl}/verify-email.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;


    // send email
    const mailResult = await sendMail({
      to: email,
      subject: 'Please verify your email address',
      text: `Hello ${user.name || ''},\n\nPlease verify your email by clicking the link:\n${link}\n\nThe link is valid for 1 hour.\n`,
      html: `<p>Hello ${user.name || ''},</p>
             <p>Please verify your email by clicking the link below:</p>
             <p><a href="${link}">Verify email</a></p>
             <p>The link is valid for 1 hour.</p>`
    });

    console.info(`[resend-verification] Email sent to ${email}. MailResult:`, mailResult);
    res.json({ message: 'Verification email sent. Please check your inbox.' });

  } catch (err) {
    console.error('[resend-verification] Error:', err);
    res.status(500).json({ error: 'Failed to send verification email.' });
  }
});

// Logout
router.post('/logout', async (_req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

// Me (current user)
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.json({ user: null });
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch { return res.json({ user: null }); }

    const user = await User.findById(payload.uid).select('name email role isBanned tokenVersion').lean();
    if (!user) return res.json({ user: null });
    if (user.isBanned) return res.json({ user: null });
    if ((user.tokenVersion ?? 0) !== (payload.tv ?? 0)) return res.json({ user: null });

    res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role || 'user' } });
  } catch {
    res.json({ user: null });
  }
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
      await User.updateOne({ _id: u._id }, {
        $set: { resetTokenHash: tokenHash, resetTokenExp: new Date(Date.now() + tokenExpMins * 60_000) }
      });
      try {
        const { sendMail } = require('../Services/mailer');
        const base = process.env.PUBLIC_ORIGIN || '';
        const link = `${base}/reset.html?token=${encodeURIComponent(token)}`;
        await sendMail({
          to: u.email,
          subject: 'Password reset',
          text: `Hello${u.name ? ' ' + u.name : ''},\n\nReset your password:\n${link}\n\nExpires in ${tokenExpMins} minutes.\n`
        });
      } catch {}
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// Reset password
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
    u.resetTokenExp = undefined;
    await u.save();

    const jwtToken = signToken(u);
    setAuthCookies(res, jwtToken);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Failed to reset password' });
  }
});

/* ==================== NEW PART: POST /refresh ==================== */
router.post('/refresh', async (req, res) => {
  try {
    const raw = req.cookies?.token;
    if (!raw) {
      return res.status(401).json({ error: 'Not logged in' });
    }
    let payload;
    try {
      payload = jwt.verify(raw, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const uid = payload.uid;
    if (!uid) return res.status(401).json({ error: 'Invalid token payload' });

    const user = await User.findById(uid).select('role isBanned tokenVersion name email').lean();
    if (!user) return res.status(401).json({ error: 'Account not found' });
    if (user.isBanned) return res.status(403).json({ error: 'Account is banned' });

    // reissue token with up-to-date role and tokenVersion
    const newPayload = {
      uid: String(uid),
      role: user.role || 'user',
      tv: user.tokenVersion ?? 0
    };
    const newToken = jwt.sign(newPayload, JWT_SECRET, { expiresIn: process.env.JWT_TTL || '7d' });
    setAuthCookies(res, newToken);

    res.json({ ok: true });
  } catch (e) {
    console.error('[auth:refresh] error:', e.message || e);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Email verification route (user clicked the link)
router.post('/verify-email', async (req, res) => {
  try {const { token, email } = req.body;
    console.log('[verify-email] start for token:', token, 'email:', email);

    if (!token) {
      return res.status(400).json({ error: 'Missing verification token' });
    }

    const now = new Date();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const query = {
      emailVerifyToken: tokenHash,
      emailVerifyExpires: { $gt: now }
    };
    console.log('[verify-email] Using query:', query);

    const user = await User.findOne(query);
    console.log('[verify-email] user found:', user ? user.email : null);

  } catch (err) {
    console.error('[verify-email] Error during verification:', err);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});


/* ==================== END refresh addition ==================== */

module.exports = router;
