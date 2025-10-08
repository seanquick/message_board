// backend/routes/admin.js

const router = require('express').Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const User = require('../Models/User');
const Thread = require('../Models/Thread');
const Comment = require('../Models/Comment');
const Report = require('../Models/Report');
const Notification = (() => { try { return require('../Models/Notification'); } catch { return null; } })();
const ModLog = (() => { try { return require('../Models/ModLog'); } catch { return null; } })();

const { requireAdmin } = require('../Middleware/auth');
const { enumValues } = (() => {
  try { return require('../Util/enum').enumValues; }
  catch { return () => []; }
})();

// Helper functions
const toBool = v => v === true || v === 'true' || v === '1' || v === 1;
const notDeleted = (field = 'isDeleted') => ({
  $or: [{ [field]: false }, { [field]: { $exists: false } }]
});
const isId = v => mongoose.isValidObjectId(v);
const toId = v => isId(v) ? new mongoose.Types.ObjectId(v) : null;
const s = (v, max = 1000) => String(v ?? '').trim().slice(0, max);
const iRange = (v, min, max, def) => {
  let n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) n = def;
  return Math.max(min, Math.min(max, n));
};

// No-cache headers
router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

// SSE stream
const _clients = new Set();
function sseWrite(res, type, data) {
  try {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data || {})}\n\n`);
  } catch (e) { }
}
function broadcast(type, data) {
  for (const res of _clients) sseWrite(res, type, data);
}

router.get('/stream', requireAdmin, (req, res) => {
  res.set({
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive'
  });
  res.flushHeaders?.();
  sseWrite(res, 'hello', { ok: true });
  _clients.add(res);
  req.on('close', () => _clients.delete(res));
});

router.get('/ping', requireAdmin, (req, res) => {
  res.json({ ok: true, admin: true, uid: req.user?.uid });
});

// METRICS
router.get('/metrics', requireAdmin, async (_req, res) => {
  try {
    const sVals = enumValues(Report, 'status') || [];
    const openVals = sVals.filter(v => /open|new|pending|unresolved/i.test(String(v)));
    const openFilter = openVals.length
      ? { status: { $in: openVals } }
      : { $or: [{ status: { $exists: false } }, { status: null }, { status: 'open' }] };

    const [usersCount, threadsCount, commentsCount, reportsCount] = await Promise.all([
      User.countDocuments({}),
      Thread.countDocuments({}),
      Comment.countDocuments({}),
      Report.countDocuments(openFilter)
    ]);

    res.json({
      metrics: {
        users: usersCount,
        threads: threadsCount,
        comments: commentsCount,
        reports: reportsCount
      }
    });
  } catch (e) {
    console.error('[admin] metrics error:', e);
    res.status(500).json({ error: 'Failed to load metrics', detail: String(e) });
  }
});

// SEARCH (threads / comments)
router.get('/search', requireAdmin, async (req, res) => {
  try {
    const type = (req.query.type || '').toLowerCase();
    const includeDeleted = toBool(req.query.includeDeleted);

    let results = [];

    if (type === 'threads') {
      const filter = includeDeleted ? {} : notDeleted('isDeleted');
      results = await Thread.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .select('_id title author createdAt isDeleted isPinned pinned isLocked locked upvoteCount commentCount')
        .lean();
    } else if (type === 'comments') {
      const filter = includeDeleted ? {} : notDeleted('isDeleted');
      results = await Comment.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .select('_id thread author createdAt body isDeleted upvoteCount')
        .lean();
      results = results.map(c => ({
        ...c,
        snippet: (c.body || '').slice(0, 120)
      }));
    }

    res.json({ results });
  } catch (e) {
    console.error('[admin] search error:', e);
    res.status(500).json({ error: 'Search failed', detail: String(e) });
  }
});

// REPORTS list
router.get('/reports', requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || 'open').toLowerCase();

    const sVals = enumValues(Report, 'status') || [];
    const openVals = sVals.filter(v => /open|new|pending|unresolved/i.test(String(v)));
    const resolvedVals = sVals.filter(v => /resol|clos|done/i.test(String(v)));

    let filter;
    if (status === 'all') filter = {};
    else if (status === 'resolved') {
      filter = resolvedVals.length ? { status: { $in: resolvedVals } } : { status: 'resolved' };
    } else {
      filter = openVals.length
        ? { status: { $in: openVals } }
        : { $or: [{ status: 'open' }, { status: null }, { status: { $exists: false } }] };
    }

    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .limit(400)
      .lean();

    const threadIds = reports.filter(r => r.targetType === 'thread').map(r => r.targetId).filter(Boolean);
    const commentIds = reports.filter(r => r.targetType === 'comment').map(r => r.targetId).filter(Boolean);
    const reporterIds = reports.map(r => r.reporterId).filter(Boolean);

    const [threads, comments, users] = await Promise.all([
      Thread.find({ _id: { $in: threadIds } }).select('title body content author isDeleted isPinned pinned isLocked locked').lean(),
      Comment.find({ _id: { $in: commentIds } }).select('body author thread isDeleted').lean(),
      User.find({ _id: { $in: reporterIds } }).select('name email').lean()
    ]);

    const tMap = new Map(threads.map(t => [String(t._id), t]));
    const cMap = new Map(comments.map(c => [String(c._id), c]));
    const uMap = new Map(users.map(u => [String(u._id), u]));

    const shaped = reports.map(r => {
      let snippet = '', threadId = null, targetOwnerId = null;
      let threadFlags = {}, commentFlags = {};

      if (r.targetType === 'thread') {
        const t = tMap.get(String(r.targetId));
        if (t) {
          snippet = `${t.title || '(untitled)'} — ${(t.body ?? t.content ?? '').slice(0, 180)}`;
          threadId = t._id;
          targetOwnerId = t.author || null;
          threadFlags = {
            isDeleted: !!t.isDeleted,
            pinned: !!(t.isPinned || t.pinned),
            locked: !!(t.isLocked || t.locked)
          };
        }
      } else if (r.targetType === 'comment') {
        const c = cMap.get(String(r.targetId));
        if (c) {
          snippet = (c.body || '').slice(0, 200);
          threadId = c.thread;
          targetOwnerId = c.author || null;
          commentFlags = { isDeleted: !!c.isDeleted };
        }
      }

      return {
        _id: r._id,
        targetType: r.targetType,
        targetId: r.targetId,
        threadId,
        status: r.status || 'open',
        category: r.category || 'other',
        details: r.details || r.reason || '',
        createdAt: r.createdAt,
        reporter: uMap.get(String(r.reporterId)) || null,
        snippet,
        resolutionNote: r.resolutionNote || '',
        resolvedAt: r.resolvedAt || '',
        resolvedBy: r.resolvedBy || '',
        resolvedByName: r.resolvedByName || '',
        resolvedByEmail: r.resolvedByEmail || '',
        targetOwnerId,
        threadFlags,
        commentFlags
      };
    });

    res.json({ reports: shaped });
  } catch (e) {
    console.error('[admin] reports error:', e);
    res.status(500).json({ error: 'Failed to load reports', detail: String(e) });
  }
});

// Resolve, bulk resolve, logs, exports, comments delete/restore etc.
// (You can reuse your previous implementations for those here.)

// USERS list + user actions
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const qstr = s(req.query.q, 200);
    const page = iRange(req.query.page, 1, 1e6, 1);
    const limit = iRange(req.query.limit, 1, 200, 50);

    let filter = {};
    if (qstr) {
      filter = {
        $or: [
          { name: { $regex: qstr, $options: 'i' } },
          { email: { $regex: qstr, $options: 'i' } }
        ]
      };
    }

    const [users, total] = await Promise.all([
      User.find(filter).select('name email role isBanned createdAt notes').sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter)
    ]);

    res.json({ users, total });
  } catch (e) {
    console.error('[admin] users error:', e);
    res.status(500).json({ error: 'Failed to load users', detail: String(e) });
  }
});

// Export users CSV, toggle-ban, set role, note, delete user, fetch user content
// — you would include your existing code here, wrapped under requireAdmin similarly.

router.get('/users/export.csv', requireAdmin, async (req, res) => {
  try {
    const qstr = s(req.query.q, 200);
    const limit = iRange(req.query.limit, 1, 10000, 1000);
    let filter = {};
    if (qstr) {
      filter = {
        $or: [
          { name: { $regex: qstr, $options: 'i' } },
          { email: { $regex: qstr, $options: 'i' } }
        ]
      };
    }
    const list = await User.find(filter).select('name email role isBanned createdAt notes').sort({ createdAt: -1 }).limit(limit).lean();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.write('id,createdAt,name,email,role,isBanned,notes\n');
    for (const u of list) {
      const line = [
        u._id,
        u.createdAt?.toISOString?.() || '',
        u.name || '',
        u.email || '',
        u.role || 'user',
        !!u.isBanned,
        (u.notes || '').replace(/\n/g, ' ').replace(/"/g, '""')
      ].map(v => `"${String(v)}"`).join(',');
      res.write(line + '\n');
    }
    res.end();
  } catch (e) {
    console.error('[admin] users export error:', e);
    res.status(500).json({ error: 'Failed to export users', detail: String(e) });
  }
});

// Add your other user actions (toggle-ban, role, note, delete, content) here with requireAdmin

// Finally, refresh / auth / delete / content etc.

function setAuthCookie(res, payload) {
  const isProdEnv = (process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1');
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-change-me', { expiresIn: '7d' });
  res.cookie('token', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isProdEnv,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not logged in' });

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-change-me');
    const user = await User.findById(payload.uid).select('role isBanned tokenVersion name email').lean();
    if (!user) return res.status(401).json({ error: 'Account not found' });
    if (user.isBanned) return res.status(403).json({ error: 'Account is banned' });

    setAuthCookie(res, {
      uid: String(payload.uid),
      role: user.role || 'user',
      tv: Number(user.tokenVersion || 0)
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin:refresh] error:', e);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Delete user
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'Invalid user id' });
    await User.findByIdAndDelete(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin] delete user error:', e);
    res.status(500).json({ error: 'Failed to delete user', detail: String(e) });
  }
});

// Fetch user content
router.get('/users/:id/content', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'Invalid user id' });
    const threads = await Thread.find({ author: id }).select('_id title createdAt').lean();
    const comments = await Comment.find({ author: id }).select('_id body thread createdAt').lean();
    res.json({ ok: true, threads, comments });
  } catch (e) {
    console.error('[admin] fetch user content error:', e);
    res.status(500).json({ error: 'Failed to fetch user content', detail: String(e) });
  }
});

module.exports = router;
