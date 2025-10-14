// backend/routes/admin.js

const router = require('express').Router();
const mongoose = require('mongoose');

const User = require('../Models/User');
const Thread = require('../Models/Thread');
const Comment = require('../Models/Comment');
const Report = require('../Models/Report');

const Notification = (() => { try { return require('../Models/Notification'); } catch { return null; } })();
const ModLog = (() => { try { return require('../Models/ModLog'); } catch { return null; } })();

const { requireAdmin } = require('../Middleware/auth');

// Proper fallback for enumValues
let enumValues = () => [];
try {
  const enumUtil = require('../Util/enum');
  if (typeof enumUtil.enumValues === 'function') {
    enumValues = enumUtil.enumValues;
  }
} catch {}

// Helpers
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

// Disable caching
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
  } catch {}
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

// ===== METRICS =====
router.get('/metrics', requireAdmin, async (_req, res) => {
  try {
    const sVals = enumValues(Report, 'status') || [];
    const openVals = sVals.filter(v => /open|new|pending|unresolved/i.test(String(v)));
    const openFilter = openVals.length
      ? { status: { $in: openVals } }
      : { $or: [{ status: { $exists: false } }, { status: null }, { status: 'open' }] };

    let usersCount = 0, threadsCount = 0, commentsCount = 0, reportsCount = 0;
    try { usersCount = await User.countDocuments(); } catch {}
    try { threadsCount = await Thread.countDocuments(); } catch {}
    try { commentsCount = await Comment.countDocuments(); } catch {}
    try { reportsCount = await Report.countDocuments(openFilter); } catch {}

    res.json({ metrics: { users: usersCount, threads: threadsCount, comments: commentsCount, reports: reportsCount } });
  } catch (e) {
    console.error('[admin] metrics error:', e);
    res.status(500).json({ error: 'Failed to load metrics', detail: String(e) });
  }
});

// ===== SEARCH =====
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

// ===== REPORTS LIST =====
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
      Thread.find({ _id: { $in: threadIds } })
        .select('title body content author isDeleted isPinned pinned isLocked locked')
        .populate('author', 'name email')
        .lean(),
      Comment.find({ _id: { $in: commentIds } })
        .select('body author thread isDeleted')
        .populate('author', 'name email')
        .lean(),
      User.find({ _id: { $in: reporterIds } })
        .select('name email')
        .lean()
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

// ===== GET SINGLE REPORT (robust version) =====
router.get('/reports/:reportId', requireAdmin, async (req, res) => {
  try {
    const rid = req.params.reportId;
    if (!mongoose.isValidObjectId(rid)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    const report = await Report.findById(rid).lean();
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Reporter
    let reporter = null;
    if (report.reporterId && mongoose.isValidObjectId(report.reporterId)) {
      reporter = await User.findById(report.reporterId).select('name email').lean();
    }

    // Original content (thread or comment)
    let original = null;
    if (report.targetType === 'thread' && report.targetId && mongoose.isValidObjectId(report.targetId)) {
      original = await Thread.findById(report.targetId)
        .select('title body author')
        .lean();
    } else if (report.targetType === 'comment' && report.targetId && mongoose.isValidObjectId(report.targetId)) {
      original = await Comment.findById(report.targetId)
        .select('body author thread')
        .lean();
    }

    // Populate author details for original if possible
    if (original) {
      const authId = original.author || original.authorId;
      if (authId && mongoose.isValidObjectId(authId)) {
        const authorDoc = await User.findById(authId).select('name email').lean();
        if (authorDoc) {
          original.author = authorDoc;
        }
      }
    }

    // Attach to report
    report.reporter = reporter;
    report.original = original;

    return res.json({ report });
  } catch (e) {
    console.error('[admin] get single report error:', e);
    return res.status(500).json({ error: 'Failed to load report', detail: String(e) });
  }
});


// ===== Resolve a report =====
router.post('/reports/:reportId/resolve', requireAdmin, async (req, res) => {
  try {
    const rid = req.params.reportId;
    const { resolutionNote } = req.body;

    if (!mongoose.isValidObjectId(rid)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    const report = await Report.findById(rid);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    report.status = 'resolved';
    if (typeof resolutionNote === 'string') {
      report.resolutionNote = resolutionNote.trim();
    }
    report.resolvedAt = new Date();
    report.resolvedBy = req.user?.uid;

    await report.save();

    return res.json({ ok: true, report: report.toObject() });
  } catch (e) {
    console.error('[admin] resolve report error:', e);
    return res.status(500).json({ error: 'Failed to resolve report', detail: String(e) });
  }
});

// ===== Bulk Resolve =====
router.post('/reports/resolve', requireAdmin, async (req, res) => {
  try {
    const { reportIds, resolutionNote } = req.body;
    if (!Array.isArray(reportIds) || reportIds.length === 0) {
      return res.status(400).json({ error: 'No report IDs provided' });
    }

    const validIds = reportIds.filter(id => mongoose.isValidObjectId(id));
    const update = {
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy: req.user?.uid
    };
    if (typeof resolutionNote === 'string') {
      update.resolutionNote = resolutionNote.trim();
    }

    const result = await Report.updateMany(
      { _id: { $in: validIds } },
      { $set: update }
    );

    return res.json({ ok: true, modified: result.nModified });
  } catch (e) {
    console.error('[admin] bulk resolve error:', e);
    return res.status(500).json({ error: 'Failed to bulk resolve reports', detail: String(e) });
  }
});

// ===== USERS =====
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
      User.find(filter)
        .select('name email role isBanned createdAt notes')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.json({ users, total });
  } catch (e) {
    console.error('[admin] users error:', e);
    res.status(500).json({ error: 'Failed to load users', detail: String(e) });
  }
});

// Export Reports (CSV or JSON)
router.get('/reports/export.csv', requireAdmin, async (req, res) => {
  try {
    const reports = await Report.find().lean();
    // transform to CSV
    const rows = reports.map(r => ({
      id: r._id,
      reporterId: r.reporterId,
      targetType: r.targetType,
      targetId: r.targetId,
      category: r.category,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      resolutionNote: r.resolutionNote
    }));
    // Build CSV string
    const header = Object.keys(rows[0] || {}).join(',');
    const lines = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reports_export.csv"');
    res.send(csv);
  } catch (e) {
    console.error('[admin] export reports error:', e);
    res.status(500).json({ error: 'Failed to export reports', detail: String(e) });
  }
});

// Similarly for comments
router.get('/comments/export.csv', requireAdmin, async (req, res) => {
  try {
    const comments = await Comment.find().lean();
    const rows = comments.map(c => ({
      id: c._id,
      thread: c.thread,
      author: c.author,
      body: c.body,
      createdAt: c.createdAt,
      isDeleted: c.isDeleted
    }));
    const header = Object.keys(rows[0] || {}).join(',');
    const lines = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="comments_export.csv"');
    res.send(csv);
  } catch (e) {
    console.error('[admin] export comments error:', e);
    res.status(500).json({ error: 'Failed to export comments', detail: String(e) });
  }
});

// Export Users
router.get('/users/export.csv', requireAdmin, async (req, res) => {
  try {
    const users = await User.find().lean();
    const rows = users.map(u => ({
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      isBanned: u.isBanned,
      createdAt: u.createdAt
    }));
    const header = Object.keys(rows[0] || {}).join(',');
    const lines = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
    res.send(csv);
  } catch (e) {
    console.error('[admin] export users error:', e);
    res.status(500).json({ error: 'Failed to export users', detail: String(e) });
  }
});

module.exports = router;
