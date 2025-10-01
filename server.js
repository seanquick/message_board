// server.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const path = require('path');
const jwt = require('jsonwebtoken');

// --- tiny color helpers (no extra deps) ---
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};
const ok   = (msg) => console.log(`${c.green}✅ ${msg}${c.reset}`);
const info = (msg) => console.log(`${c.cyan}ℹ️  ${msg}${c.reset}`);
const warn = (msg) => console.warn(`${c.yellow}⚠️  ${msg}${c.reset}`);
const err  = (msg) => console.error(`${c.red}❌ ${msg}${c.reset}`);

// --- Routes (Backend/Routes) ---
const authRoutes    = require('./Backend/Routes/auth');
const threadRoutes  = require('./Backend/Routes/thread');
const commentRoutes = require('./Backend/Routes/comments');
const reportRoutes  = require('./Backend/Routes/report'); // legacy/compat
const adminRoutes   = require('./Backend/Routes/admin');   // updated admin
const searchRoutes  = require('./Backend/Routes/search');  // public search
const notifRouter   = require('./Backend/Routes/notifications'); // in-app notifications

const app  = express();

// Use PORT from env (Koyeb: set this to the Exposed Port you configured)
const PORT = Number(process.env.PORT) || 8000;
const MONGO = process.env.MONGO_URI;

// Disable ETag so dynamic endpoints (/me, admin) don’t 304 with empty bodies
app.set('etag', false);
app.disable('etag');

// Friendly .env checks
if (!MONGO) {
  err('MONGO_URI is missing. Please set it in your .env / platform env vars.');
  console.error(`${c.dim}Example:${c.reset} MONGO_URI=mongodb+srv://user:pass@cluster/dbname?retryWrites=true&w=majority`);
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  warn('JWT_SECRET is missing — using a weak fallback for dev. Set it in .env for production.');
}

// --- Security & core middleware ---
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"], // no remote JS
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"], // only your API
      "frame-ancestors": ["'none'"],
      "form-action": ["'self'"],
      "base-uri": ["'self'"]
    }
  },
  referrerPolicy: { policy: "no-referrer" },
  hsts: process.env.NODE_ENV === 'production' ? undefined : false
}));

// Prevent indexing (until you want it indexed)
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

app.use(morgan('dev'));
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// Mild no-cache for HTML/CSS/JS delivered directly (helps during dev)
app.use((req, res, next) => {
  if (/\.(js|css|html)$/.test(req.path)) res.set('Cache-Control', 'no-store');
  next();
});

// --- Helpers for gated pages ---
function noStore(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  });
}

function sessionGate(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/login.html');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-change-me');

    // 🔎 check DB for ban
    const User = require('./Backend/Models/User');
    User.findById(payload.uid).select('isBanned').then(u => {
      if (!u || u.isBanned) {
        const _isProd = (process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1');
        res.clearCookie('token', { path: '/', sameSite: 'lax', httpOnly: true, secure: _isProd });
        return res.redirect('/login.html?banned=1');
      }
      noStore(res);
      return next();
    }).catch(() => res.redirect('/login.html'));
  } catch {
    return res.redirect('/login.html');
  }
}

// --- Static frontend directory ---
const pubDir = path.join(__dirname, 'Frontend', 'public');
info(`Serving static files from ${c.bold}${pubDir}${c.reset}`);

// --- Protected HTML pages (must be before express.static) ---
app.get('/threads.html', sessionGate, (_req, res) => res.sendFile(path.join(pubDir, 'threads.html')));
app.get('/thread.html',  sessionGate, (_req, res) => res.sendFile(path.join(pubDir, 'thread.html')));
app.get('/admin.html',   sessionGate, (_req, res) => res.sendFile(path.join(pubDir, 'admin.html')));
app.get('/account.html', sessionGate, (_req, res) => res.sendFile(path.join(pubDir, 'account.html')));

// --- Public HTML pages ---
app.get('/login.html',      (_req, res) => res.sendFile(path.join(pubDir, 'login.html')));
app.get('/register.html',   (_req, res) => res.sendFile(path.join(pubDir, 'register.html')));
app.get('/forgot.html',     (_req, res) => res.sendFile(path.join(pubDir, 'forgot.html')));
app.get('/reset.html',      (_req, res) => res.sendFile(path.join(pubDir, 'reset.html')));
app.get('/guidelines.html', (_req, res) => res.sendFile(path.join(pubDir, 'guidelines.html')));

// Guarded home → threads
app.get('/', (req, res) => sessionGate(req, res, () => res.redirect('/threads.html')));

// --- Static files (must come AFTER the HTML routes above) ---
app.use(express.static(pubDir));

// --- Route module type guard (works with default export or router export) ---
function pickRouter(mod) {
  if (mod && typeof mod === 'object') {
    if (typeof mod.router === 'function') return mod.router;
    if (typeof mod.default === 'function') return mod.default;
  }
  return mod; // assume it’s already a router fn
}

// Probe
console.log('[route types]', {
  auth:          typeof authRoutes,
  thread:        typeof threadRoutes,
  comment:       typeof commentRoutes,
  report:        typeof reportRoutes,
  admin:         typeof adminRoutes,
  search:        typeof searchRoutes,
  notifications: typeof notifRouter,
});

// --- API routes ---
app.use('/api/auth',          pickRouter(authRoutes));
app.use('/api/threads',       pickRouter(threadRoutes));
app.use('/api/comments',      pickRouter(commentRoutes));
app.use('/api/report',        pickRouter(reportRoutes));    // optional legacy
app.use('/api/search',        pickRouter(searchRoutes));    // public search
app.use('/api/admin',         pickRouter(adminRoutes));     // admin
app.use('/api/notifications', notifRouter);                 // in-app notifications
app.set('notifyUser',         notifRouter.notifyUser);      // helper available to other modules

// Health endpoints
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/healthz', (_req, res) => res.json({ ok: true, uptime: process.uptime(), ts: Date.now() }));

// --- SPA-style fallback: unauthenticated landing is login ---
app.get('*', (_req, res) => res.sendFile(path.join(pubDir, 'login.html')));

// -------------------- STARTUP (guarded) --------------------
let server = null;
let started = false;

async function start() {
  if (started) { info('Server already started; skipping listen'); return; }
  started = true;

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(MONGO, {
      serverSelectionTimeoutMS: 10000,
      family: 4, // prefer IPv4 on Windows / some DNS setups
    });
    ok(`Mongo connected: ${MONGO.includes('mongodb+srv') ? 'Atlas Cluster' : 'Local MongoDB'}`);
    info(`DB URI: ${c.dim}${MONGO}${c.reset}`);
  } catch (e) {
    err(`Mongo connection failed: ${e.message}`);
    warn('Check MONGO_URI, credentials, IP allowlist (Atlas), and network connectivity.');
    process.exit(1);
  }

  // Bind only once
  server = app.listen(PORT, '0.0.0.0', () => {
    ok(`Server listening on 0.0.0.0:${PORT}`);
  });
  server.on('error', (e) => {
    err(`HTTP server error: ${e.code || e.message}`);
    process.exit(1);
  });

  mongoose.connection.on('error', (e) => err(`Mongo error: ${e.message}`));
  mongoose.connection.on('disconnected', () => warn('Mongo disconnected'));
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  info('SIGTERM received, shutting down...');
  try { await mongoose.disconnect(); } catch {}
  try { if (server) await new Promise(r => server.close(r)); } catch {}
  process.exit(0);
});
process.on('SIGINT', async () => {
  info('SIGINT received, shutting down...');
  try { await mongoose.disconnect(); } catch {}
  try { if (server) await new Promise(r => server.close(r)); } catch {}
  process.exit(0);
});

start();
