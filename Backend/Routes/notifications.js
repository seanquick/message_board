// Backend/Routes/notifications.js
/**
 * In-app notifications (simple, self-contained)
 *
 * Endpoints (all require auth):
 *  - GET  /api/notifications?limit=20
 *      → { items: [...], unread: <number> }
 *  - POST /api/notifications/mark-read { ids?: string[], all?: boolean }
 *      → { ok: true, modified }
 *  - GET  /api/notifications/stream (SSE per-user)
 *      → event: "notif"  data: { unread }
 *
 * Also exports router.notifyUser(userId, extra?) to push live unread counts
 * to connected clients for that user.
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { requireAuth } = require('../Middleware/auth');
const Notification = (() => {
  try { return require('../Models/Notification'); }
  catch { return null; }
})();

// ---- tiny helpers ----
const isId = (v) => mongoose.isValidObjectId(v);
const toId = (v) => (isId(v) ? new mongoose.Types.ObjectId(v) : null);
const num = (v, def = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// ---- SSE connection registry (per user) ----
/** Map<userId string, Set<res>> */
const clients = new Map();

function writeSSE(res, type, data) {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data || {})}\n\n`);
}

async function unreadCount(uid) {
  if (!Notification) return 0;
  return Notification.countDocuments({ userId: uid, read: { $ne: true } });
}

/**
 * Push a live unread count to all open SSE clients for a user.
 * You can call this from elsewhere via `req.app.get('notifyUser')?.(uid)`.
 */
async function notifyUser(userId, extra = {}) {
  const set = clients.get(String(userId));
  if (!set || set.size === 0) return;
  const unread = await unreadCount(userId);
  for (const res of set) writeSSE(res, 'notif', { unread, ...extra });
}

// attach to the exported router so server.js can do app.set('notifyUser', router.notifyUser)
router.notifyUser = notifyUser;

/* ============================ GET / (list) ============================ */
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!Notification) return res.json({ items: [], unread: 0 });
    const uid = req.user.uid;

    const limit = clamp(num(req.query.limit, 20), 1, 100);
    const items = await Notification.find({ userId: uid })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unread = await unreadCount(uid);
    res.json({ items, unread });
  } catch (e) {
    console.error('[notifications] list error:', e);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

/* ======================== POST /mark-read ======================== */
router.post('/mark-read', requireAuth, async (req, res) => {
  try {
    if (!Notification) return res.json({ ok: true, modified: 0 });
    const uid = req.user.uid;

    const all = req.body?.all === true || req.body?.all === 'true' || req.body?.all === '1';
    let ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    ids = ids.filter(isId).map(String).slice(0, 200); // cap to 200 ids per call

    let q;
    if (all) q = { userId: uid, read: { $ne: true } };
    else if (ids.length) q = { _id: { $in: ids.map(toId) }, userId: uid, read: { $ne: true } };
    else return res.status(400).json({ error: 'Provide ids[] or all=true' });

    const result = await Notification.updateMany(q, { $set: { read: true, readAt: new Date() } });
    // push live unread count
    await notifyUser(uid);
    res.json({ ok: true, modified: result?.modifiedCount || 0 });
  } catch (e) {
    console.error('[notifications] mark-read error:', e);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// POST /api/notifications/clear — Clear all notifications for current user
router.post('/clear', requireAuth, async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.user.uid });
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications] clear error:', err);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});


/* =========================== GET /stream (SSE) =========================== */
router.get('/stream', requireAuth, async (req, res) => {
  try {
    // set headers
    res.set({
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive'
    });
    res.flushHeaders?.();

    const uid = String(req.user.uid);
    // register client
    let set = clients.get(uid);
    if (!set) { set = new Set(); clients.set(uid, set); }
    set.add(res);

    // initial hello + unread count
    writeSSE(res, 'hello', { ok: true });
    try {
      const unread = await unreadCount(uid);
      writeSSE(res, 'notif', { unread });
    } catch {}

    req.on('close', () => {
      try {
        set.delete(res);
        if (set.size === 0) clients.delete(uid);
      } catch {}
    });
  } catch (e) {
    console.error('[notifications] stream error:', e);
    try { res.end(); } catch {}
  }
});

module.exports = router;
