// Backend/Routes/admin.js

/**
 * Admin API — validation‑focused drop-in
 * Features:
 *  - metrics
 *  - reports list / grouped / resolve / history / CSV
 *  - threads moderation: pin/lock/delete + mod logs + notifications
 *  - comments moderation: delete / restore + mod logs
 *  - users: list / paginate / CSV / toggle-ban / role / note
 *  - admin search
 *  - SSE stream (/stream) for live updates
 *  - refresh endpoint
 *  - new: delete user, fetch user content
 */

const router   = require('express').Router();
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');

const User    = require('../Models/User');
const Thread  = require('../Models/Thread');
const Comment = require('../Models/Comment');
const Report  = require('../Models/Report');
const Notification = (() => { try { return require('../Models/Notification'); } catch { return null; } })();
const ModLog  = (() => { try { return require('../Models/ModLog'); } catch { return null; } })();

const { requireAdmin } = require('../Middleware/auth');
const { enumValues } = (() => { try { return require('../Util/enum'); } catch { return { enumValues: () => [] }; } })();

// --- Helpers ---
const toBool = (v) => v === true || v === 'true' || v === '1' || v === 1;
const notDeleted = (field = 'isDeleted') => ({ $or: [{ [field]: false }, { [field]: { $exists: false } }] });
const isId = (v) => mongoose.isValidObjectId(v);
const toId = (v) => (isId(v) ? new mongoose.Types.ObjectId(v) : null);
const s = (v, max = 1000) => String(v ?? '').trim().slice(0, max);
const iRange = (v, min, max, def) => {
  let n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) n = def;
  return Math.max(min, Math.min(max, n));
};

// No-cache for admin endpoints
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

// Ping
router.get('/ping', requireAdmin, (req, res) => {
  res.json({ ok: true, admin: true, uid: req.user?.uid });
});

// Metrics
router.get('/metrics', requireAdmin, async (_req, res) => {
  try {
    const sVals = enumValues(Report, 'status') || [];
    const openVals = sVals.filter(v => /open|new|pending|unresolved/i.test(String(v)));
    const openFilter = openVals.length
      ? { status: { $in: openVals } }
      : { $or: [{ status: { $exists: false } }, { status: null }, { status: 'open' }] };

    const [users, threads, comments, reports] = await Promise.all([
      User.countDocuments({}),
      Thread.countDocuments({}),
      Comment.countDocuments({}),
      Report.countDocuments(openFilter)
    ]);
    res.json({ metrics: { users, threads, comments, reports } });
  } catch (e) {
    console.error('[admin] metrics error:', e);
    res.status(500).json({ error: 'Failed to load metrics', detail: e?.message || String(e) });
  }
});

// Reports list
router.get('/reports', requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || 'open').toLowerCase();

    const sVals = enumValues(Report, 'status') || [];
    const openVals = sVals.filter(v => /open|new|pending|unresolved/i.test(String(v)));
    const resolvedVals = sVals.filter(v => /resol|clos|done/i.test(String(v)));

    let filter;
    if (status === 'all') filter = {};
    else if (status === 'resolved') filter = resolvedVals.length ? { status: { $in: resolvedVals } } : { status: 'resolved' };
    else filter = openVals.length ? { status: { $in: openVals } } : { $or: [{ status: 'open' }, { status: null }, { status: { $exists: false } }] };

    const reports = await Report.find(filter).sort({ createdAt: -1 }).limit(400).lean();

    const threadIds  = reports.filter(r => r.targetType === 'thread').map(r => r.targetId).filter(Boolean);
    const commentIds = reports.filter(r => r.targetType === 'comment').map(r => r.targetId).filter(Boolean);
    const reporterIds = reports.map(r => r.reporterId).filter(Boolean);

    const [threads, comments, users] = await Promise.all([
      Thread.find({ _id: { $in: threadIds } }).select('title body content author isDeleted isPinned pinned isLocked locked').lean(),
      Comment.find({ _id: { $in: commentIds } }).select('body author thread isDeleted').lean(),
      User.find({ _id: { $in: reporterIds } }).select('name email').lean(),
    ]);
    const tMap = new Map(threads.map(t => [String(t._id), t]));
    const cMap = new Map(comments.map(c => [String(c._id), c]));
    const uMap = new Map(users.map(u => [String(u._id), u]));

    const shaped = reports.map(r => {
      let snippet = '', threadId = null, targetOwnerId = null, threadFlags = {}, commentFlags = {};
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
    res.status(500).json({ error: 'Failed to load reports', detail: e?.message || String(e) });
  }
});

// Reports grouped
router.get('/reports/grouped', requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || 'open').toLowerCase();

    const sVals = enumValues(Report, 'status') || [];
    const openVals = sVals.filter(v => /open|new|pending|unresolved/i.test(String(v)));
    const resolvedVals = sVals.filter(v => /resol|clos|done/i.test(String(v)));

    let filter;
    if (status === 'all') filter = {};
    else if (status === 'resolved') filter = resolvedVals.length ? { status: { $in: resolvedVals } } : { status: 'resolved' };
    else filter = openVals.length ? { status: { $in: openVals } } : { $or: [{ status: 'open' }, { status: null }, { status: { $exists: false } }] };

    const reports = await Report.find(filter).sort({ createdAt: -1 }).limit(1000).lean();

    const keyOf = (r) => `${r.targetType}:${r.targetId}:${r.category || 'other'}`;
    const groupsMap = new Map();
    for (const r of reports) {
      const k = keyOf(r);
      const g = groupsMap.get(k) || { ids: [], targetType: r.targetType, threadId: null, commentId: null, category: r.category || 'other', latestAt: 0, count: 0, openCount: 0, reporters: new Map(), reasons: new Map(), threadFlags: {}, commentFlags: {}, targetOwnerId: null, status: 'open', snippet: '' };
      g.ids.push(String(r._id));
      g.count++;
      if (!r.status || /open|new|pending|unresolved/i.test(String(r.status))) g.openCount++;
      const ts = new Date(r.createdAt).getTime(); if (ts > g.latestAt) g.latestAt = ts;
      if (r.details) g.reasons.set(r.details, (g.reasons.get(r.details) || 0) + 1);
      if (r.reporterId) g.reporters.set(String(r.reporterId), true);
      groupsMap.set(k, g);
    }

    const tIds = [...new Set(reports.filter(r => r.targetType === 'thread').map(r => String(r.targetId)))];
    const cIds = [...new Set(reports.filter(r => r.targetType === 'comment').map(r => String(r.targetId)))];
    const [threads, comments] = await Promise.all([
      Thread.find({ _id: { $in: tIds } }).select('title body content author isDeleted isPinned pinned isLocked locked').lean(),
      Comment.find({ _id: { $in: cIds } }).select('body author thread isDeleted').lean()
    ]);
    const tMap = new Map(threads.map(t => [String(t._id), t]));
    const cMap = new Map(comments.map(c => [String(c._id), c]));

    const groups = [];
    for (const [, g] of groupsMap) {
      const sampleId = g.ids[0];
      const r = reports.find(x => String(x._id) === sampleId);
      if (!r) continue;

      if (r.targetType === 'thread') {
        const t = tMap.get(String(r.targetId));
        if (t) {
          g.threadId = String(t._id);
          g.snippet = `${t.title || '(untitled)'} — ${(t.body ?? t.content ?? '').slice(0, 180)}`;
          g.targetOwnerId = t.author || null;
          g.threadFlags = { isDeleted: !!t.isDeleted, pinned: !!(t.isPinned || t.pinned), locked: !!(t.isLocked || t.locked) };
        }
      } else {
        const c = cMap.get(String(r.targetId));
        if (c) {
          g.commentId = String(c._id);
          g.threadId = String(c.thread);
          g.snippet = (c.body || '').slice(0, 200);
          g.targetOwnerId = c.author || null;
          g.commentFlags = { isDeleted: !!c.isDeleted };
        }
      }

      g.status = g.openCount === 0 ? 'resolved' : (g.openCount === g.count ? 'open' : 'mixed');
      g.reporterCount = g.reporters.size;
      g.reporters = [];
      g.reasons = [...g.reasons.keys()];
      groups.push(g);
    }

    groups.sort((a, b) => b.latestAt - a.latestAt);
    res.json({ groups });
  } catch (e) {
    console.error('[admin] reports grouped error:', e);
    res.status(500).json({ error: 'Failed to load grouped reports', detail: e?.message || String(e) });
  }
});

// Resolve a single report
router.post('/reports/:id/resolve', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!isId(id)) return res.status(400).json({ error: 'Invalid report id' });

    const note = s(req.body?.note, 5000);
    const r = await Report.findById(id);
    if (!r) return res.status(404).json({ error: 'Report not found' });

    r.status = 'resolved';
    r.resolutionNote = note;
    r.resolvedAt = new Date();
    r.resolvedBy = req.user.uid;

    const adminDoc = await User.findById(req.user.uid).select('name email').lean();
    r.resolvedByName = adminDoc?.name || '';
    r.resolvedByEmail = adminDoc?.email || '';
    await r.save();

    if (ModLog) {
      await ModLog.create({
        type: 'report_resolved',
        targetType: 'report',
        targetId: r._id,
        actorId: req.user.uid,
        note,
        meta: { targetType: r.targetType, targetId: r.targetId }
      });
    }

    const link = r.targetType === 'thread'
      ? `thread.html?id=${encodeURIComponent(String(r.targetId))}`
      : `thread.html?id=${encodeURIComponent(String(r.thread || ''))}&highlight=${encodeURIComponent(String(r.targetId))}#c-${encodeURIComponent(String(r.targetId))}`;

    const notifTasks = [];
    if (Notification) {
      const contentOwnerId = await (async () => {
        if (r.targetType === 'thread') {
          const t = await Thread.findById(r.targetId).select('author').lean();
          return t?.author || null;
        } else {
          const c = await Comment.findById(r.targetId).select('author').lean();
          return c?.author || null;
        }
      })();

      const mk = async (uid, title) => uid && Notification.create({
        userId: uid,
        type: 'report_resolved',
        title,
        body: note ? `Moderator note: ${note}` : 'Report resolved by moderator.',
        link,
        meta: { reportId: r._id, targetType: r.targetType, targetId: r.targetId }
      });

      notifTasks.push(mk(r.reporterId, 'Your report has been resolved'));
      if (contentOwnerId) notifTasks.push(mk(contentOwnerId, 'Your content was moderated'));
    }
    await Promise.allSettled(notifTasks);

    broadcast('report:resolved', { id: r._id });
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin] resolve error:', e);
    res.status(500).json({ error: 'Failed to resolve report', detail: e?.message || String(e) });
  }
});

// Bulk resolve
router.post('/reports/bulk-resolve', requireAdmin, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isId) : [];
    const note = s(req.body?.note, 5000);
    if (!ids.length) return res.status(400).json({ error: 'No valid report ids.' });

    const adminDoc = await User.findById(req.user.uid).select('name email').lean();

    const updates = await Report.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          status: 'resolved',
          resolutionNote: note,
          resolvedAt: new Date(),
          resolvedBy: req.user.uid,
          resolvedByName: adminDoc?.name || '',
          resolvedByEmail: adminDoc?.email || ''
        }
      }
    );

    if (ModLog) {
      await ModLog.create({
        type: 'report_resolved_bulk',
        targetType: 'report',
        targetId: ids,
        actorId: req.user.uid,
        note,
        meta: { count: ids.length, bulk: true }
      });
    }

    broadcast('reports:bulk_resolved', { ids, modified: updates?.modifiedCount || 0 });
    res.json({ ok: true, modified: updates?.modifiedCount || 0 });
  } catch (e) {
    console.error('[admin] bulk resolve error:', e);
    res.status(500).json({ error: 'Failed to bulk resolve', detail: e?.message || String(e) });
  }
});

// Logs for report
router.get('/reports/:id/logs', requireAdmin, async (req, res) => {
  try {
    if (!ModLog) return res.json({ logs: [] });
    const id = String(req.params.id || '');
    if (!isId(id)) return res.status(400).json({ error: 'Invalid report id' });

    const logs = await ModLog.find({ targetType: 'report', $or: [{ targetId: toId(id) }, { targetId: id }] })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const actorIds = [...new Set(logs.map(l => String(l.actorId)).filter(isId))];
    const actors = await User.find({ _id: { $in: actorIds } }).select('name email').lean();
    const aMap = new Map(actors.map(a => [String(a._id), a]));
    const shaped = logs.map(l => ({ ...l, actor: aMap.get(String(l.actorId)) || {} }));

    res.json({ logs: shaped });
  } catch (e) {
    console.error('[admin] logs error:', e);
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

// Reports CSV export
router.get('/reports/export.csv', requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || 'all').toLowerCase();
    const sVals = enumValues(Report, 'status') || [];
    const openVals = sVals.filter(v => /open|new|pending|unresolved/i.test(String(v)));
    const resolvedVals = sVals.filter(v => /resol|clos|done/i.test(String(v)));
    let filter;
    if (status === 'all') filter = {};
    else if (status === 'resolved') filter = resolvedVals.length ? { status: { $in: resolvedVals } } : { status: 'resolved' };
    else filter = openVals.length ? { status: { $in: openVals } } : { $or: [{ status: 'open' }, { status: null }, { status: { $exists: false } }] };

    const list = await Report.find(filter).sort({ createdAt: -1 }).limit(5000).lean();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reports.csv"');
    res.write('id,createdAt,targetType,targetId,status,category,reporterId,details\n');
    for (const r of list) {
      const line = [
        r._id,
        r.createdAt?.toISOString?.() || '',
        r.targetType || '',
        r.targetId || '',
        r.status || '',
        r.category || '',
        r.reporterId || '',
        (r.details || r.reason || '').replace(/\n/g, ' ').replace(/"/g, '""')
      ].map(v => `"${String(v)}"`).join(',');
      res.write(line + '\n');
    }
    res.end();
  } catch (e) {
    console.error('[admin] reports csv error:', e);
    res.status(500).end('error');
  }
});

// Comments list
router.get('/comments', requireAdmin, async (req, res) => {
  try {
    const includeDeleted = toBool(req.query.includeDeleted);
    const page = iRange(req.query.page, 1, 1e6, 1);
    const limit = iRange(req.query.limit, 1, 200, 50);
    const filter = includeDeleted ? {} : notDeleted('isDeleted');

    const [items, total] = await Promise.all([
      Comment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Comment.countDocuments(filter)
    ]);

    res.json({ comments: items, total });
  } catch (e) {
    console.error('[admin] comments error:', e);
    res.status(500).json({ error: 'Failed to load comments', detail: e?.message || String(e) });
  }
});

// Comments CSV export
router.get('/comments/export.csv', requireAdmin, async (req, res) => {
  try {
    const includeDeleted = toBool(req.query.includeDeleted);
    const limit = iRange(req.query.limit, 1, 10000, 1000);
    const filter = includeDeleted ? {} : notDeleted('isDeleted');

    const list = await Comment.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="comments.csv"');
    res.write('id,createdAt,thread,author,isDeleted,upvotes,body\n');
    for (const c of list) {
      const body = (c.body || '').replace(/\n/g, ' ').replace(/"/g, '""');
      const line = [
        c._id,
        c.createdAt?.toISOString?.() || '',
        c.thread || '',
        c.author || '',
        !!c.isDeleted,
        (c.upvoteCount ?? c.score ?? 0),
        body
      ].map(v => `"${String(v)}"`).join(',');
      res.write(line + '\n');
    }
    res.end();
  } catch (e) {
    console.error('[admin] comments csv error:', e);
    res.status(500).end('error');
  }
});

// Comments delete / restore
router.post('/comments/:id/delete', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!isId(id)) return res.status(400).json({ error: 'Invalid comment id' });
    const deleted = toBool(req.body?.deleted);
    const reason = s(req.body?.reason, 2000);

    const c = await Comment.findById(id);
    if (!c) return res.status(404).json({ error: 'Comment not found' });
    c.isDeleted = deleted;
    if (deleted) c.deletedAt = new Date();
    else c.deletedAt = null;
    await c.save();

    if (ModLog) {
      await ModLog.create({
        type: deleted ? 'comment_deleted' : 'comment_restored',
        targetType: 'comment',
        targetId: c._id,
        actorId: req.user.uid,
        note: reason || '',
        meta: {}
      });
    }

    broadcast('comment:updated', { id: c._id, deleted });
    res.json({ ok: true, deleted });
  } catch (e) {
    console.error('[admin] comment delete error:', e);
    res.status(500).json({ error: 'Failed to update comment', detail: e?.message || String(e) });
  }
});

// Users list
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
    res.status(500).json({ error: 'Failed to load users', detail: e?.message || String(e) });
  }
});

// Users CSV export
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
    console.error('[admin] users csv error:', e);
    res.status(500).end('error');
  }
});

// Toggle ban
router.post('/users/:id/toggle-ban', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!isId(id)) return res.status(400).json({ error: 'Invalid user id' });
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isBanned = !user.isBanned;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // force token invalidation
    await user.save();

    if (ModLog) {
      await ModLog.create({
        type: user.isBanned ? 'user_banned' : 'user_unbanned',
        targetType: 'user',
        targetId: user._id,
        actorId: req.user.uid,
        note: '',
        meta: {}
      });
    }

    broadcast('user:updated', { id: user._id, isBanned: user.isBanned });
    res.json({ ok: true, isBanned: user.isBanned });
  } catch (e) {
    console.error('[admin] toggle-ban error:', e);
    res.status(500).json({ error: 'Failed to toggle ban' });
  }
});

// Set role
router.post('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const role = s(req.body?.role, 10);
    if (!isId(id)) return res.status(400).json({ error: 'Invalid user id' });
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    await User.updateOne({ _id: id }, { $set: { role } }, { strict: false });
    if (ModLog) {
      await ModLog.create({
        type: role === 'admin' ? 'role_granted_admin' : 'role_revoked_admin',
        targetType: 'user',
        targetId: id,
        actorId: req.user.uid,
        note: '',
        meta: { role }
      });
    }
    res.json({ ok: true, role });
  } catch (e) {
    console.error('[admin] set role error:', e);
    res.status(500).json({ error: 'Failed to set role', detail: e?.message || String(e) });
  }
});

// Note
router.post('/users/:id/note', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!isId(id)) return res.status(400).json({ error: 'Invalid user id' });
    const note = s(req.body?.note, 2000);
    if (!note) return res.status(400).json({ error: 'Note cannot be empty' });

    await User.updateOne({ _id: id }, { $set: { notes: note } }, { strict: false, runValidators: false });
    if (ModLog) {
      await ModLog.create({
        type: 'user_noted',
        targetType: 'user',
        targetId: id,
        actorId: req.user.uid,
        note,
        meta: {}
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin] note error:', e);
    res.status(500).json({ error: 'Failed to save note', detail: e?.message || String(e) });
  }
});

// Refresh session / reissue token with correct fields
function setAuthCookie(res, payload) {
  const isProd = (process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1');
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-change-me', { expiresIn: '7d' });
  res.cookie('token', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
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
    console.error('[admin:refresh] error:', e?.message || e);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// New: Delete user
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'Invalid user id' });
    await User.findByIdAndDelete(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin] delete user error:', e);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// New: Fetch user content (threads + comments)
router.get('/users/:id/content', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'Invalid user id' });
    const threads = await Thread.find({ author: id }).select('_id title createdAt').lean();
    const comments = await Comment.find({ author: id }).select('_id body thread createdAt').lean();
    res.json({ ok: true, threads, comments });
  } catch (e) {
    console.error('[admin] fetch user content error:', e);
    res.status(500).json({ error: 'Failed to fetch user content' });
  }
});

module.exports = router;
