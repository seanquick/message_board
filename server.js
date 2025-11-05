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

const { requireAdmin } = require('./Backend/Middleware/auth');

// Route modules
const authRoutes    = require('./Backend/Routes/auth');
const threadRoutes  = require('./Backend/Routes/thread');
const commentRoutes = require('./Backend/Routes/comments');
const reportRoutes  = require('./Backend/Routes/report');
const adminRoutes   = require('./Backend/Routes/admin');
const searchRoutes  = require('./Backend/Routes/search');
const notifRouter   = require('./Backend/Routes/notifications');
const userRoutes    = require('./Backend/Routes/user'); // ✅ NEW
const profileRoutes = require('./Backend/Routes/profile');


const app = express();
app.set('trust proxy', 1);
app.set('etag', false);
app.disable('etag');

const MONGO = process.env.MONGO_URI;
if (!MONGO) {
  console.error('MONGO_URI missing');
  process.exit(1);
}

// Security & Middleware
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "frame-ancestors": ["'none'"],
      "form-action": ["'self'"],
      "base-uri": ["'self'"]
    }
  },
  referrerPolicy: { policy: "no-referrer" },
  hsts: process.env.NODE_ENV === 'production' ? undefined : false
}));
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(morgan('dev'));
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
app.use((req, res, next) => {
  if (/\.(js|css|html)$/.test(req.path)) res.set('Cache-Control', 'no-store');
  next();
});

function noStore(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
}

// sessionGate
function sessionGate(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/login.html');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-change-me');
    const User = require('./Backend/Models/User');
    User.findById(payload.uid).select('isBanned').then(u => {
      if (!u || u.isBanned) {
        const isProd = (process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1');
        res.clearCookie('token', { path: '/', sameSite: 'lax', httpOnly: true, secure: isProd });
        return res.redirect('/login.html?banned=1');
      }
      noStore(res);
      next();
    }).catch(() => res.redirect('/login.html'));
  } catch {
    return res.redirect('/login.html');
  }
}

// Static and page routes
const pubDir = path.join(__dirname, 'Frontend', 'public');
app.use(express.static(pubDir));

// ✅ Serve user-uploaded profile images (publicly accessible)
const uploadsDir = path.join(__dirname, 'Backend', 'public', 'uploads');
app.use('/uploads', express.static(uploadsDir));


// Guard admin.html so non‑admins cannot view it
app.get('/admin.html', sessionGate, requireAdmin, (_req, res) => {
  res.sendFile(path.join(pubDir, 'admin.html'));
});

// Other gated pages
app.get('/threads.html', sessionGate, (_req, res) => res.sendFile(path.join(pubDir, 'threads.html')));
app.get('/thread.html',  sessionGate, (_req, res) => res.sendFile(path.join(pubDir, 'thread.html')));
app.get('/account.html', sessionGate, (_req, res) => res.sendFile(path.join(pubDir, 'account.html')));

// Public pages
app.get('/login.html',    (_req, res) => res.sendFile(path.join(pubDir, 'login.html')));
app.get('/register.html', (_req, res) => res.sendFile(path.join(pubDir, 'register.html')));
app.get('/forgot.html',   (_req, res) => res.sendFile(path.join(pubDir, 'forgot.html')));
app.get('/reset.html',    (_req, res) => res.sendFile(path.join(pubDir, 'reset.html')));
app.get('/guidelines.html', (_req, res) => res.sendFile(path.join(pubDir, 'guidelines.html')));
app.get('/', (req, res) => sessionGate(req, res, () => res.redirect('/threads.html')));

// Mount APIs
const pickRouter = (mod) => {
  if (mod && typeof mod === 'object') {
    if (typeof mod.router === 'function') return mod.router;
    if (typeof mod.default === 'function') return mod.default;
  }
  return mod;
};

app.use('/api/auth',          pickRouter(authRoutes));
app.use('/api/threads',       pickRouter(threadRoutes));
app.use('/api/comments',      pickRouter(commentRoutes));
app.use('/api/report',        pickRouter(reportRoutes));
app.use('/api/search',        pickRouter(searchRoutes));
app.use('/api/admin',         pickRouter(adminRoutes));
app.use('/api/notifications', notifRouter);
app.use('/api/users',         pickRouter(userRoutes)); // ✅ NEW
app.set('notifyUser', notifRouter.notifyUser);
app.use('/api/profile', pickRouter(profileRoutes));


// Health
app.get('/api/health',  (_req, res) => res.json({ ok: true }));
app.get('/api/healthz', (_req, res) => res.json({ ok: true, uptime: process.uptime(), ts: Date.now() }));

// Fallback for SPA
app.get('*', (_req, res) => res.sendFile(path.join(pubDir, 'login.html')));

// Startup and DB
let server = null;
let started = false;
async function start() {
  if (started) return;
  started = true;
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 10000, family: 4 });
    console.log('✅ Mongo connected');
  } catch (e) {
    console.error('Mongo connect failed:', e.message);
    process.exit(1);
  }
  server = app.listen(process.env.PORT || 8000, '0.0.0.0', () => {
    console.log('Server listening');
  });
  server.on('error', (e) => {
    console.error('HTTP server error:', e);
    process.exit(1);
  });
  mongoose.connection.on('error', (e) => console.error('Mongo error:', e.message));
  mongoose.connection.on('disconnected', () => console.warn('Mongo disconnected'));
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM, shutting down...');
  try { await mongoose.disconnect(); } catch {} 
  try { if (server) await new Promise(r => server.close(r)); } catch {} 
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('SIGINT, shutting down...');
  try { await mongoose.disconnect(); } catch {}
  try { if (server) await new Promise(r => server.close(r)); } catch {}
  process.exit(0);
});

start();
