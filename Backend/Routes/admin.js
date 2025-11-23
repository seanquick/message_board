// backend/routes/admin.js

const router = require('express').Router();
const mongoose = require('mongoose');

const User    = require('../Models/User');
const Thread  = require('../Models/Thread');
const Comment = require('../Models/Comment');
const Report  = require('../Models/Report');

const Notification = (() => { try { return require('../Models/Notification'); } catch { return null; } })();
const ModLog       = (() => { try { return require('../Models/ModLog'); } catch { return null; } })();

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
  $or: [
    { [field]: false },
    { [field]: { $exists: false } }
  ]
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
    'Cache-Control':       'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma':              'no-cache',
    'Expires':             '0',
    'Surrogate-Control':   'no-store'
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
    'Content-Type':  'text/event-stream',
    'Connection':     'keep-alive'
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
        users:    usersCount,
        threads:  threadsCount,
        comments: commentsCount,
        reports:  reportsCount
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
    const type = (req.query.type || '').toLowerCase();      // "threads", "comments", or "all"
    const q = (req.query.q || '').trim();                   // search term
    const includeDeleted = toBool(req.query.includeDeleted);
    let results = [];

    // --- Validation ---
    if (!q) {
      return res.status(400).json({ error: 'Missing search term (q).' });
    }

    if (!['threads', 'comments', 'all'].includes(type)) {
      return res.status(400).json({ error: 'Invalid search type. Must be "threads", "comments", or "all".' });
    }

    // --- Build filters ---
    const threadFilter = {
      $text: { $search: q },
      ...(includeDeleted ? {} : notDeleted('isDeleted')),
    };

    const commentFilter = {
      $text: { $search: q },
      ...(includeDeleted ? {} : notDeleted('isDeleted')),
    };
// --- Search Threads ---
async function searchThreads() {
  const docs = await Thread.find(threadFilter, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(100)
    .select(
      '_id title body author author_name isAnonymous realAuthor createdAt ' +
      'isDeleted isPinned pinned isLocked locked upvoteCount commentCount status score'
    )
    .populate('author', 'name email')
    .populate('realAuthor', 'name email')
    .lean();

  return docs.map(t => ({
    type: 'thread',
    _id: t._id,
    title: t.title,
    author: t.author || null,
    realAuthor: t.realAuthor || null,
    isAnonymous: !!t.isAnonymous,
    createdAt: t.createdAt,
    score: t.score,
    snippet: (t.body || t.title || '').slice(0, 120),
    upvoteCount: t.upvoteCount ?? 0,
    isDeleted: t.isDeleted,
  }));
}

// --- Search Comments ---
async function searchComments() {
  const docs = await Comment.find(commentFilter, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(100)
    .select('_id thread body author author_name isAnonymous realAuthor createdAt isDeleted upvoteCount score')
    .populate('author', 'name email')
    .populate('realAuthor', 'name email')
    .lean();

  return docs.map(c => ({
    type: 'comment',
    _id: c._id,
    thread: c.thread,
    author: c.author || null,
    realAuthor: c.realAuthor || null,
    isAnonymous: !!c.isAnonymous,
    createdAt: c.createdAt,
    score: c.score,
    snippet: (c.body || '').slice(0, 120),
    upvoteCount: c.upvoteCount ?? 0,
    isDeleted: c.isDeleted,
  }));
}

    // --- Execute Search ---
    if (type === 'threads') {
      results = await searchThreads();
    } else if (type === 'comments') {
      results = await searchComments();
    } else if (type === 'all') {
      const [threads, comments] = await Promise.all([
        searchThreads(),
        searchComments()
      ]);
      results = [...threads, ...comments]
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 150);
    }

    res.json({ results });
  } catch (e) {
    console.error('[admin] search error:', e);
    res.status(500).json({ error: 'Search failed', detail: String(e) });
  }
});




// ===== EXPORT REPORTS (CSV) =====
router.get('/reports/export.csv', requireAdmin, async (_req, res) => {
  try {
    const reports = await Report.find().lean();

    const reporterIds      = reports.map(r => r.reporterId).filter(Boolean);
    const commentTargetIds = reports
      .filter(r => r.targetType === 'comment')
      .map(r => r.targetId)
      .filter(Boolean);
    const threadTargetIds  = reports
      .filter(r => r.targetType === 'thread')
      .map(r => r.targetId)
      .filter(Boolean);

    const [reporters, comments, threads] = await Promise.all([
      User.find({ _id: { $in: reporterIds } }).select('_id name email').lean(),
      Comment.find({ _id: { $in: commentTargetIds } }).select('_id author').lean(),
      Thread.find({ _id: { $in: threadTargetIds } }).select('_id author').lean()
    ]);

    const authorIds   = [...comments, ...threads].map(t => t.author).filter(Boolean);
    const users       = await User.find({ _id: { $in: authorIds } }).select('_id name email').lean();

    const userMap     = new Map(users.map(u => [String(u._id), u]));
    const reporterMap = new Map(reporters.map(u => [String(u._id), u]));
    const commentMap  = new Map(comments.map(c => [String(c._id), c]));
    const threadMap   = new Map(threads.map(t => [String(t._id), t]));

    const rows = reports.map(r => {
      const reporter    = reporterMap.get(String(r.reporterId)) || {};
      let targetOwner   = {};

      if (r.targetType === 'comment') {
        const comment = commentMap.get(String(r.targetId));
        if (comment) targetOwner = userMap.get(String(comment.author)) || {};
      } else if (r.targetType === 'thread') {
        const thread = threadMap.get(String(r.targetId));
        if (thread) targetOwner = userMap.get(String(thread.author)) || {};
      }

      return {
        id:              String(r._id),
        reporterId:      r.reporterId || '',
        reporterName:    reporter.name || '',
        reporterEmail:   reporter.email || '',
        targetType:      r.targetType || '',
        targetId:        r.targetId || '',
        targetOwnerId:   targetOwner._id || '',
        targetOwnerName: targetOwner.name || '',
        targetOwnerEmail:targetOwner.email || '',
        category:        r.category || '',
        details:         r.details || '',
        status:          r.status || '',
        createdAt:       r.createdAt ? r.createdAt.toISOString() : '',
        resolvedAt:      r.resolvedAt ? r.resolvedAt.toISOString() : '',
        resolutionNote:  r.resolutionNote || ''
      };
    });

    const header = Object.keys(rows[0] || {}).join(',');
    const lines  = rows.map(r =>
      Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const csv    = [header, ...lines].join('\n');

    res.setHeader('Content-Type',        'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reports_export.csv"');
    res.send(csv);

  } catch (e) {
    console.error('[admin] export reports error:', e);
    res.status(500).json({ error: 'Failed to export reports', detail: String(e) });
  }
});

// ===== EXPORT COMMENTS (CSV) =====
router.get('/comments/export.csv', requireAdmin, async (_req, res) => {
  try {
    const comments = await Comment.find()
      .populate('author', 'name email')
      .lean();

    const rows = comments.map(c => ({
      id:          String(c._id),
      thread:      String(c.thread || ''),
      authorId:    c.author?._id || '',
      authorName:  c.author?.name || '',
      authorEmail: c.author?.email || '',
      body:        c.body || '',
      createdAt:   c.createdAt ? c.createdAt.toISOString() : '',
      isDeleted:   c.isDeleted ? 'true' : 'false'
    }));

    const header = Object.keys(rows[0] || {}).join(',');
    const lines  = rows.map(r =>
      Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const csv    = [header, ...lines].join('\n');

    res.setHeader('Content-Type',        'text/csv');
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
    const rows  = users.map(u => ({
      id:         String(u._id),
      name:       u.name || '',
      email:      u.email || '',
      role:       u.role || '',
      isBanned:   u.isBanned ? 'true' : 'false',
      createdAt:  u.createdAt ? u.createdAt.toISOString() : ''
    }));

    const header = Object.keys(rows[0] || {}).join(',');
    const lines  = rows.map(r =>
      Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const csv    = [header, ...lines].join('\n');

    res.setHeader('Content-Type',        'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
    res.send(csv);

  } catch (e) {
    console.error('[admin] export users error:', e);
    res.status(500).json({ error: 'Failed to export users', detail: String(e) });
  }
});

// ===== REPORTS LIST (with pagination) =====
router.get('/reports', requireAdmin, async (req, res) => {
  try {
    const status       = String(req.query.status || 'open').toLowerCase();
    const pageParam    = iRange(req.query.page, 1, 1e6, 1);
    const limitParam   = iRange(req.query.limit, 1, 500, 100);
    const skipCount    = (pageParam - 1) * limitParam;

    const sVals        = enumValues(Report, 'status') || [];
    const openVals     = sVals.filter(v => /open|new|pending|unresolved/i.test(String(v)));
    const resolvedVals = sVals.filter(v => /resol|clos|done/i.test(String(v)));

    let filter;
    if (status === 'all') {
      filter = {};
    } else if (status === 'resolved') {
      filter = resolvedVals.length ? { status: { $in: resolvedVals } } : { status: 'resolved' };
    } else {
      filter = openVals.length
        ? { status: { $in: openVals } }
        : { $or: [{ status: 'open' }, { status: null }, { status: { $exists: false } }] };
    }

    const totalCount = await Report.countDocuments(filter);
    const reports    = await Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skipCount)
      .limit(limitParam)
      .lean();

    res.json({
      reports,
      pagination: {
        page:       pageParam,
        limit:      limitParam,
        total:      totalCount,
        totalPages: Math.ceil(totalCount / limitParam)
      }
    });
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

    let reporter  = null;
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
    report.status         = 'resolved';
    if (typeof resolutionNote === 'string') {
      report.resolutionNote = resolutionNote.trim();
    }
    report.resolvedAt     = new Date();
    report.resolvedBy     = req.user?.uid;

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
    const update   = {
      status:     'resolved',
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

// Reply to a comment (admin posting new comment)
router.post('/comments/:commentId/reply', requireAdmin, async (req, res) => {
  try {
    const cid = req.params.commentId;
    if (!mongoose.isValidObjectId(cid)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }
    const parent = await Comment.findById(cid);
    if (!parent) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    const threadId = parent.thread;
    const { body } = req.body;
    if (!body || typeof body !== 'string' || body.trim().length < 1) {
      return res.status(400).json({ error: 'Reply body required' });
    }
    const comment = await Comment.create({
      body:        body.trim(),
      thread:      threadId,
      parent:      cid,
      author:      req.user.uid,
      isFromAdmin: true
    });
    return res.json({ comment });
  } catch (e) {
    console.error('[admin] reply comment error:', e);
    return res.status(500).json({ error: 'Failed to reply to comment', detail: String(e) });
  }
});

// in admin.js, after your existing comment routes

// Edit a comment body
router.post('/comments/:commentId/edit', requireAdmin, async (req, res) => {
  try {
    const cid = req.params.commentId;
    if (!mongoose.isValidObjectId(cid)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }
    const { body } = req.body;
    if (typeof body !== 'string' || body.trim().length < 1) {
      return res.status(400).json({ error: 'New body required' });
    }
    const comment = await Comment.findById(cid);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    comment.body     = body.trim();
    comment.editedAt = new Date();
    comment.editedBy = req.user.uid;
    await comment.save();

    res.json({ ok: true, comment: comment.toObject() });
  } catch (e) {
    console.error('[admin] edit comment error:', e);
    res.status(500).json({ error: 'Failed to edit comment', detail: String(e) });
  }
});

// Soft‑delete a comment
router.post('/comments/:commentId/delete', requireAdmin, async (req, res) => {
  try {
    const cid = req.params.commentId;
    if (!mongoose.isValidObjectId(cid)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }
    const comment = await Comment.findById(cid);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    await comment.softDelete(req.user.uid, req.body.reason || '');
    res.json({ ok: true, comment: comment.toObject() });
  } catch (e) {
    console.error('[admin] delete comment error:', e);
    res.status(500).json({ error: 'Failed to delete comment', detail: String(e) });
  }
});

// Restore a soft‑deleted comment
router.post('/comments/:commentId/restore', requireAdmin, async (req, res) => {
  try {
    const cid = req.params.commentId;
    if (!mongoose.isValidObjectId(cid)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }
    const comment = await Comment.findById(cid);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    await comment.restore();
    res.json({ ok: true, comment: comment.toObject() });
  } catch (e) {
    console.error('[admin] restore comment error:', e);
    res.status(500).json({ error: 'Failed to restore comment', detail: String(e) });
  }
});

// Bulk action
router.post('/comments/bulk', requireAdmin, async (req, res) => {
  try {
    const { commentIds, action } = req.body;
    if (!Array.isArray(commentIds) || commentIds.length === 0) {
      return res.status(400).json({ error: 'No comment IDs provided' });
    }
    const validIds = commentIds.filter(id => mongoose.isValidObjectId(id));
    let result;
    if (action === 'delete') {
      result = await Comment.updateMany(
        { _id: { $in: validIds } },
        { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user.uid } }
      );
    } else if (action === 'restore') {
      result = await Comment.updateMany(
        { _id: { $in: validIds } },
        { $set: { isDeleted: false, deletedAt: undefined, deletedBy: undefined, deleteReason: '' } }
      );
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
    res.json({ ok: true, modified: result.nModified });
  } catch (e) {
    console.error('[admin] bulk comments action error:', e);
    res.status(500).json({ error: 'Failed bulk comment action', detail: String(e) });
  }
});

// ===== USERS LIST (with pagination) =====
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const qstr      = s(req.query.q, 200);
    const page      = iRange(req.query.page, 1, 1e6, 1);
    const limit     = iRange(req.query.limit, 1, 200, 50);
    const skipCount = (page - 1) * limit;

    let filter = {};
    if (qstr) {
      filter = {
        $or: [
          { name:  { $regex: qstr, $options: 'i' } },
          { email: { $regex: qstr, $options: 'i' } }
        ]
      };
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('name email role isBanned createdAt notes')
        .sort({ createdAt: -1 })
        .skip(skipCount)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (e) {
    console.error('[admin] users error:', e);
    res.status(500).json({ error: 'Failed to load users', detail: String(e) });
  }
});

// DELETE a user
router.delete('/users/:userId', requireAdmin, async (req, res) => {
  try {
    const uid = req.params.userId;
    if (!mongoose.isValidObjectId(uid)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const deleted = await User.deleteOne({ _id: uid });
    if (deleted.deletedCount === 0) {
      return res.status(404).json({ error: 'User not found or already deleted' });
    }

    // Optionally: clean up related data
    // e.g. await Thread.deleteMany({ author: uid });
    //      await Comment.deleteMany({ author: uid });

    res.json({ ok: true, deletedCount: deleted.deletedCount });

  } catch (e) {
    console.error('[admin] delete user error:', e);
    res.status(500).json({ error: 'Failed to delete user', detail: String(e) });
  }
});

// Fetch user content (recent threads/comments) – consider adding pagination if needed
router.get('/users/:userId/content', requireAdmin, async (req, res) => {
  try {
    const uid = req.params.userId;
    if (!mongoose.isValidObjectId(uid)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const userDoc = await User.findById(uid).select('name email').lean();
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }

    const threads  = await Thread.find({ author: uid })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('_id title createdAt status commentCount upvoteCount')
      .lean();

    const comments = await Comment.find({ author: uid })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('_id thread body createdAt upvoteCount')
      .lean();

    const commentsWithSnippet = comments.map(c => ({
      ...c,
      snippet: (c.body || '').slice(0, 200)
    }));

    return res.json({
      user:     userDoc,
      threads,
      comments: commentsWithSnippet
    });

  } catch (e) {
    console.error('[admin] user content error:', e);
    return res.status(500).json({ error: 'Failed to load user content', detail: String(e) });
  }
});

// UPDATE user role
router.post('/users/:userId/role', requireAdmin, async (req, res) => {
  try {
    const uid = req.params.userId;
    const { role } = req.body;

    if (!mongoose.isValidObjectId(uid)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(uid, { role }, { new: true }).select('email role');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ ok: true, message: `Role updated to ${role}`, user });

  } catch (e) {
    console.error('[admin] role update error:', e);
    res.status(500).json({ error: 'Failed to update role', detail: String(e) });
  }
});


// ===== BULK THREADS DELETE/RESTORE (admin) =====
router.post('/threads/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { ids, restore = false } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No thread IDs provided' });
    }
    const update = { isDeleted: !restore };
    if (restore) {
      update.deletedAt  = null;
      update.deletedBy  = null;
      update.deleteReason = '';
    } else {
      update.deletedAt     = new Date();
      update.deletedBy     = req.user._id;    // assuming req.user is the admin
      update.deleteReason  = req.body.reason || '';
    }

    const result = await Thread.updateMany(
      { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id))} },
      { $set: update }
    );

    res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    console.error('[admin] bulk threads delete error:', err);
    res.status(500).json({ error: 'Bulk threads delete failed', detail: String(err) });
  }
});

// ===== BULK COMMENTS DELETE/RESTORE (admin) =====
router.post('/comments/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { ids, restore = false } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No comment IDs provided' });
    }
    const update = { isDeleted: !restore };
    if (restore) {
      update.deletedAt     = null;
      update.deletedBy     = null;
      update.deleteReason  = '';
    } else {
      update.deletedAt     = new Date();
      update.deletedBy     = req.user._id;
      update.deleteReason  = req.body.reason || '';
    }

    const result = await Comment.updateMany(
      { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } },
      { $set: update }
    );

    res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    console.error('[admin] bulk comments delete error:', err);
    res.status(500).json({ error: 'Bulk comments delete failed', detail: String(err) });
  }
});
// ===== THREADS LIST (admin) =====
router.post('/threads', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.body.page) || 1);
    const limit = Math.max(1, Math.min(parseInt(req.body.limit) || 50, 200));
    const skip = (page - 1) * limit;

    const includeDeleted = req.body.includeDeleted === true || req.body.includeDeleted === '1';

    // Filter out deleted threads unless explicitly included
    const filter = includeDeleted ? {} : { isDeleted: { $ne: true } };

    const [threads, totalCount] = await Promise.all([
      Thread.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('realAuthor', 'name email') // Optional: For internal display
        .lean(),
      Thread.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    // Normalize thread data (ensure all required flags exist)
    const processedThreads = threads.map(t => ({
      _id: t._id,
      title: t.title,
      createdAt: t.createdAt,
      upvoteCount: t.upvoteCount || 0,
      commentCount: t.commentCount || 0,
      isPinned: !!t.isPinned,
      isLocked: !!t.isLocked,
      isDeleted: !!t.isDeleted || !!t.deletedAt,
      deletedAt: t.deletedAt || null,
      isAnonymous: !!t.isAnonymous,
      author_name: t.author_name || '',
      realAuthor: t.realAuthor ? {
        _id: t.realAuthor._id,
        name: t.realAuthor.name || '',
        email: t.realAuthor.email || ''
      } : null
    }));

    res.json({
      threads: processedThreads,
      pagination: {
        totalCount,
        totalPages,
        currentPage: page
      }
    });

  } catch (err) {
    console.error('[admin] thread list error:', err);
    res.status(500).json({ error: 'Failed to load threads', detail: err.message });
  }
});



// ===== COMMENTS LIST (admin) =====
router.get('/comments', requireAdmin, async (req, res) => {
  try {
    // --- Pagination setup ---
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 20, 1);
    const skip  = (page - 1) * limit;

    // --- Filtering: include deleted? ---
    const includeDeleted = toBool(req.query.includeDeleted);
    const filter = includeDeleted ? {} : notDeleted('isDeleted');

    // --- Fetch comments + total count in parallel ---
    const [comments, totalCount] = await Promise.all([
      Comment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id thread body author author_name isAnonymous realAuthor createdAt isDeleted upvoteCount')
        .populate('author', 'name email')
        .populate('realAuthor', 'name email')
        .lean(),

      Comment.countDocuments(filter)
    ]);

    // --- Normalize fields for frontend ---
    const formatted = comments.map(c => ({
      _id:         c._id,
      thread:      c.thread,
      snippet:     (c.body || '').slice(0, 120),
      author:      c.author,
      author_name: c.author_name,
      realAuthor:  c.realAuthor,
      createdAt:   c.createdAt,
      upvoteCount: c.upvoteCount,
      isDeleted:   c.isDeleted,
      isAnonymous: c.isAnonymous
    }));

    // --- Return paginated result ---
    res.json({
      comments: formatted,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page
      }
    });

  } catch (e) {
    console.error('[admin] comments list error:', e);
    res.status(500).json({ error: 'Failed to load comments', detail: String(e) });
  }
});


// ===== ADMIN: Get Comments List with Pagination =====
router.post('/comments', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.body.page) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit) || 50, 1);
    const skip = (page - 1) * limit;

    const includeDeleted = req.body.includeDeleted === true || req.body.includeDeleted === '1';
    const filter = includeDeleted ? {} : { isDeleted: { $ne: true } };

    const [comments, totalCount] = await Promise.all([
      Comment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id thread body author author_name isAnonymous realAuthor createdAt isDeleted upvoteCount')
        .populate('author', 'name email')
        .populate('realAuthor', 'name email')
        .lean(),

      Comment.countDocuments(filter)
    ]);

    const formatted = comments.map(c => ({
      _id:         c._id,
      thread:      c.thread,
      snippet:     (c.body || '').slice(0, 120),
      author:      c.author,
      author_name: c.author_name,
      realAuthor:  c.realAuthor,
      createdAt:   c.createdAt,
      upvoteCount: c.upvoteCount,
      isDeleted:   c.isDeleted,
      isAnonymous: c.isAnonymous
    }));

    res.json({
      comments: formatted,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page
      }
    });

  } catch (e) {
    console.error('[admin] comments list error:', e);
    res.status(500).json({ error: 'Failed to load comments', detail: String(e) });
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
