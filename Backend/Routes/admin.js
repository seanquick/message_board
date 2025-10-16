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

// Helpers
let enumValues = () => [];
try {
  const enumUtil = require('../Util/enum');
  if (typeof enumUtil.enumValues === 'function') {
    enumValues = enumUtil.enumValues;
  }
} catch {}

const toBool = v => v === true || v === 'true' || v === '1' || v === 1;
const notDeleted = (field = 'isDeleted') => ({
  $or: [{ [field]: false }, { [field]: { $exists: false } }]
});
const s = (v, max = 1000) => String(v ?? '').trim().slice(0, max);
const iRange = (v, min, max, def) => {
  let n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) n = def;
  return Math.max(min, Math.min(max, n));
};

// Disable caching globally for admin routes
router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

// SSE / Event‑stream for real‑time notifications
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
      : { status: 'open' };

    const [usersCount, threadsCount, commentsCount, reportsCount] = await Promise.all([
      User.countDocuments().catch(() => 0),
      Thread.countDocuments().catch(() => 0),
      Comment.countDocuments().catch(() => 0),
      Report.countDocuments(openFilter).catch(() => 0),
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
        .select('_id title author createdAt isDeleted isPinned pinned isLocked locked upvoteCount commentCount status')
        .populate('author', 'name email')
        .lean();
    } else if (type === 'comments') {
      const filter = includeDeleted ? {} : notDeleted('isDeleted');
      results = await Comment.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .select('_id thread author createdAt body isDeleted upvoteCount')
        .populate('author', 'name email')
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

// ===== EXPORT REPORTS (CSV with reporter + target owner info) =====
router.get('/reports/export.csv', requireAdmin, async (_req, res) => {
  try {
    const reports = await Report.find().lean();

    const reporterIds = reports.map(r => r.reporterId).filter(Boolean);
    const commentTargetIds = reports
      .filter(r => r.targetType === 'comment')
      .map(r => r.targetId)
      .filter(Boolean);
    const threadTargetIds = reports
      .filter(r => r.targetType === 'thread')
      .map(r => r.targetId)
      .filter(Boolean);

    const [reporters, comments, threads] = await Promise.all([
      User.find({ _id: { $in: reporterIds } }).select('_id name email').lean(),
      Comment.find({ _id: { $in: commentTargetIds } }).select('_id author').lean(),
      Thread.find({ _id: { $in: threadTargetIds } }).select('_id author').lean()
    ]);

    const authorIds = [...comments, ...threads].map(t => t.author).filter(Boolean);
    const users = await User.find({ _id: { $in: authorIds } }).select('_id name email').lean();

    const userMap = new Map(users.map(u => [String(u._id), u]));
    const reporterMap = new Map(reporters.map(u => [String(u._id), u]));
    const commentMap = new Map(comments.map(c => [String(c._id), c]));
    const threadMap = new Map(threads.map(t => [String(t._id), t]));

    const rows = reports.map(r => {
      const reporter = reporterMap.get(String(r.reporterId)) || {};
      let targetOwner = {};

      if (r.targetType === 'comment') {
        const comment = commentMap.get(String(r.targetId));
        if (comment) targetOwner = userMap.get(String(comment.author)) || {};
      } else if (r.targetType === 'thread') {
        const thread = threadMap.get(String(r.targetId));
        if (thread) targetOwner = userMap.get(String(thread.author)) || {};
      }

      return {
        id: String(r._id),
        reporterId: r.reporterId || '',
        reporterName: reporter.name || '',
        reporterEmail: reporter.email || '',
        targetType: r.targetType || '',
        targetId: r.targetId || '',
        targetOwnerId: targetOwner._id || '',
        targetOwnerName: targetOwner.name || '',
        targetOwnerEmail: targetOwner.email || '',
        category: r.category || '',
        details: r.details || '',
        status: r.status || '',
        createdAt: r.createdAt ? r.createdAt.toISOString() : '',
        resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : '',
        resolutionNote: r.resolutionNote || ''
      };
    });

    const header = Object.keys(rows[0] || {}).join(',');
    const lines = rows.map(r =>
      Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reports_export.csv"');
    res.send(csv);
  } catch (e) {
    console.error('[admin] export reports error:', e);
    res.status(500).json({ error: 'Failed to export reports', detail: String(e) });
  }
});

// ===== EXPORT COMMENTS (CSV with author info) =====
router.get('/comments/export.csv', requireAdmin, async (_req, res) => {
  try {
    const comments = await Comment.find()
      .populate('author', 'name email')
      .lean();

    const rows = comments.map(c => ({
      id: String(c._id),
      thread: String(c.thread || ''),
      authorId: c.author?._id || '',
      authorName: c.author?.name || '',
      authorEmail: c.author?.email || '',
      body: c.body || '',
      createdAt: c.createdAt ? c.createdAt.toISOString() : '',
      isDeleted: c.isDeleted ? 'true' : 'false'
    }));

    const header = Object.keys(rows[0] || {}).join(',');
    const lines = rows.map(r =>
      Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="comments_export.csv"');
    res.send(csv);
  } catch (e) {
    console.error('[admin] export comments error:', e);
    res.status(500).json({ error: 'Failed to export comments', detail: String(e) });
  }
});

// ===== EXPORT USERS (CSV) =====
router.get('/users/export.csv', requireAdmin, async (_req, res) => {
  try {
    const users = await User.find().lean();
    const rows = users.map(u => ({
      id: String(u._id),
      name: u.name || '',
      email: u.email || '',
      role: u.role || '',
      isBanned: u.isBanned ? 'true' : 'false',
      createdAt: u.createdAt ? u.createdAt.toISOString() : ''
    }));

    const header = Object.keys(rows[0] || {}).join(',');
    const lines = rows.map(r =>
      Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
    res.send(csv);
  } catch (e) {
    console.error('[admin] export users error:', e);
    res.status(500).json({ error: 'Failed to export users', detail: String(e) });
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
    else if (status === 'resolved')
      filter = resolvedVals.length ? { status: { $in: resolvedVals } } : { status: 'resolved' };
    else
      filter = openVals.length
        ? { status: { $in: openVals } }
        : { $or: [{ status: 'open' }, { status: null }, { status: { $exists: false } }] };

    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .limit(400)
      .lean();

    res.json({ reports });
  } catch (e) {
    console.error('[admin] reports error:', e);
    res.status(500).json({ error: 'Failed to load reports', detail: String(e) });
  }
});

// ===== SINGLE REPORT =====
router.get('/reports/:reportId', requireAdmin, async (req, res) => {
  try {
    const rid = req.params.reportId;
    if (!mongoose.isValidObjectId(rid)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    const report = await Report.findById(rid).lean();
    if (!report) return res.status(404).json({ error: 'Report not found' });

    let reporter = null;
    if (report.reporterId && mongoose.isValidObjectId(report.reporterId)) {
      reporter = await User.findById(report.reporterId).select('name email').lean();
    }

    let original = null;
    if (report.targetType === 'thread' && mongoose.isValidObjectId(report.targetId)) {
      original = await Thread.findById(report.targetId)
        .select('title body author')
        .populate('author', 'name email')
        .lean();
    } else if (report.targetType === 'comment' && mongoose.isValidObjectId(report.targetId)) {
      original = await Comment.findById(report.targetId)
        .select('body author thread')
        .populate('author', 'name email')
        .lean();
    }

    report.reporter = reporter;
    report.original = original;

    res.json({ report });
  } catch (e) {
    console.error('[admin] single report error:', e);
    res.status(500).json({ error: 'Failed to load report', detail: String(e) });
  }
});

// ===== RESOLVE SINGLE REPORT =====
router.post('/reports/:reportId/resolve', requireAdmin, async (req, res) => {
  try {
    const rid = req.params.reportId;
    if (!mongoose.isValidObjectId(rid)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    const report = await Report.findById(rid);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const { resolutionNote } = req.body;
    report.status = 'resolved';
    if (typeof resolutionNote === 'string') {
      report.resolutionNote = resolutionNote.trim();
    }
    report.resolvedAt = new Date();
    report.resolvedBy = req.user?.uid;

    await report.save();
    res.json({ ok: true, report: report.toObject() });
  } catch (e) {
    console.error('[admin] resolve report error:', e);
    res.status(500).json({ error: 'Failed to resolve report', detail: String(e) });
  }
});

// ===== BULK RESOLVE =====
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
    res.json({ ok: true, modified: result.nModified });
  } catch (e) {
    console.error('[admin] bulk resolve error:', e);
    res.status(500).json({ error: 'Failed to bulk resolve reports', detail: String(e) });
  }
});

// ===== USERS LIST =====
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

// Add this in backend/routes/admin.js, after your /users route(s)

router.get('/users/:userId/content', requireAdmin, async (req, res) => {
  try {
    const uid = req.params.userId;
    if (!mongoose.isValidObjectId(uid)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Fetch recent threads by this user
    const threads = await Thread.find({ author: uid })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('_id title createdAt status commentCount upvoteCount')
      .lean();

    // Fetch recent comments by this user
    const comments = await Comment.find({ author: uid })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('_id thread body createdAt upvoteCount')
      .lean();

    // Optionally, you can do a snippet for comments (body truncated)
    const commentsWithSnippet = comments.map(c => ({
      ...c,
      snippet: (c.body || '').slice(0, 200)
    }));

    return res.json({ threads, comments: commentsWithSnippet });
  } catch (e) {
    console.error('[admin] user content error:', e);
    return res.status(500).json({ error: 'Failed to load user content', detail: String(e) });
  }
});


// ===== EXPORT THREADS JSON =====
router.get('/export/threads', requireAdmin, async (_req, res) => {
  try {
    const threads = await Thread.find()
      .populate('author', 'name email')
      .lean();
    res.json(threads);
  } catch (e) {
    console.error('[admin] export threads json error:', e);
    res.status(500).json({ error: 'Failed to export threads JSON', detail: String(e) });
  }
});

module.exports = router;
