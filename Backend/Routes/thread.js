// backend/routes/thread.js
/**
 * Threads API (complete, backwards‑compatible)
 * Sorting policy:
 *   0) Pinned first (isPinned|pinned)
 *   1) Newest first (createdAt desc)
 *   2) Then highest upvotes
 *
 * Legacy‑safe fields:
 *  - body ≈ content
 *  - author ≈ userId
 *  - upvoteCount ≈ thumbsUp ≈ upvotes ≈ score
 */

const express = require('express');
const router  = express.Router();

const mongoose = require('mongoose');
const Thread  = require('../Models/Thread');
const Comment = require('../Models/Comment');
const User    = require('../Models/User');
const Report  = require('../Models/Report');

const { requireAuth, requireAdmin, tryAuth } = require('../Middleware/auth');

// ✅ lightweight validation helpers (B‑021)
const { s, body: validate } = require('../Util/validate');

// Helpers
const toBool = (v) => v === true || v === 'true' || v === '1';

const getThreadAuthorId  = (t) => t.author || t.userId || t.user || null;
const getCommentAuthorId = (c) => c.author || c.userId || c.user || null;
const getThreadBody  = (t) => t.body ?? t.content ?? '';
const getUpvoteCount = (o) => (o.upvoteCount ?? o.thumbsUp ?? o.upvotes ?? o.score ?? 0);

/** Filter: `isDeleted: false` OR field missing */
function notDeletedFilter(field = 'isDeleted') {
  return { $or: [ { [field]: { $exists: false } }, { [field]: false } ] };
}

/* Build a comment tree from a flat list (keeps input order for siblings) */
function buildTree(list) {
  const byId = new Map(list.map(c => [String(c._id), { ...c, children: [] }]));
  const root = [];
  for (const c of byId.values()) {
    if (c.parentId) {
      const p = byId.get(String(c.parentId));
      if (p) {
        p.children.push(c);
      } else {
        root.push(c);
      }
    } else {
      root.push(c);
    }
  }
  return root;
}

/* Sort a comment tree: newest first, then by upvotes at each level */
function sortTree(nodes = []) {
  nodes.sort((a, b) => {
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    if (db !== da) return db - da;
    const ua = Number(a.upvoteCount ?? a.score ?? 0);
    const ub = Number(b.upvoteCount ?? b.score ?? 0);
    return ub - ua;
  });
  for (const n of nodes) {
    if (Array.isArray(n.children)) sortTree(n.children);
  }
}

/* =============================== DETAIL =============================== */
/**
 * GET /api/threads/:id
 * Public detail (admins may view deleted with ?includeDeleted=1).
 * Returns: { thread, comments (tree) }
 */
router.get('/:id', tryAuth, async (req, res) => {
  try {
    const t = await Thread.findById(req.params.id).lean();
    if (!t) return res.status(404).json({ error: 'Thread not found' });

    const isAdmin = !!(req.user && req.user.role === 'admin');
    const includeDeleted = isAdmin && toBool(req.query.includeDeleted);

    if (t.isDeleted && !includeDeleted) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Thread author enrichment
    const tAuthorId  = getThreadAuthorId(t);
    const tAuthorDoc = tAuthorId
      ? await User.findById(tAuthorId).select('name email').lean()
      : null;
    const tAuthorName = t.author_name || tAuthorDoc?.name || 'Unknown';

    // Load comments (hide deleted for public)
    const commentFilter = {
      thread: t._id,
      ...(isAdmin ? {} : notDeletedFilter('isDeleted'))
    };

    const commentsRaw = await Comment.find(commentFilter)
      .sort({ createdAt: -1, upvoteCount: -1 })
      .lean();

    // Prefetch comment authors
    const commentAuthorIds = [...new Set(
      commentsRaw.map(getCommentAuthorId).filter(Boolean).map(String)
    )];
    const cUsers = commentAuthorIds.length
      ? await User.find({ _id: { $in: commentAuthorIds } }).select('name email').lean()
      : [];
    const cUserMap = new Map(cUsers.map(u => [String(u._id), u]));

    // Shape comments for client
    const commentsShaped = commentsRaw.map(c => {
      const isAnon  = !!c.isAnonymous;
      const aId     = getCommentAuthorId(c);
      const aDoc    = aId ? cUserMap.get(String(aId)) : null;
      const display = c.author_display || c.author_name || aDoc?.name || 'Unknown';
      return {
        ...c,
        author_display: isAnon ? 'Anonymous' : display,
        ...(isAdmin && aId ? { adminAuthor: { id: aId, name: aDoc?.name || display, email: aDoc?.email } } : {})
      };
    });

    // Build + sort tree
    const tree = buildTree(commentsShaped);
    sortTree(tree);

    // Shape thread for client
    const shapedThread = {
      ...t,
      body: getThreadBody(t),
      author_display: t.isAnonymous ? 'Anonymous' : tAuthorName,
      flags: {
        pinned:  !!(t.isPinned || t.pinned),
        locked:  !!(t.isLocked || t.locked),
        deleted: !!t.isDeleted
      },
      ...(isAdmin && tAuthorId ? { adminAuthor: { id: tAuthorId, name: tAuthorDoc?.name || tAuthorName, email: tAuthorDoc?.email } } : {})
    };

    return res.json({ thread: shapedThread, comments: tree });
  } catch (e) {
    console.error('[threads] detail error:', e);
    return res.status(500).json({ error: 'Failed to load thread' });
  }
});

/* =============================== LIST (with Pagination) =============================== */
/**
 * GET /api/threads
 * Public list (admins can include deleted with ?includeDeleted=1).
 * Pagination support: accepts ?limit=# & ?after=<timestamp or id>
 */
router.get('/', tryAuth, async (req, res) => {
  try {
    const isAdmin = !!(req.user && req.user.role === 'admin');
    const includeDeleted = isAdmin && toBool(req.query.includeDeleted);

    const baseFilter = includeDeleted ? {} : { isDeleted: false };
    const filter = { ...baseFilter };

    const qLimit = Number(req.query.limit) || 50;
    const limit  = Math.min(qLimit, 100);

    if (req.query.after) {
      const afterVal = req.query.after;
      const dateAfter = new Date(afterVal);
      if (!isNaN(dateAfter.getTime())) {
        filter.createdAt = { $lt: dateAfter };
      } else if (mongoose.isValidObjectId(afterVal)) {
        filter._id = { $lt: mongoose.Types.ObjectId(afterVal) };
      }
    }

    const raw = await Thread.find(filter)
      .sort({ createdAt: -1, upvoteCount: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = raw.length > limit;
    const items  = hasMore ? raw.slice(0, limit) : raw;

    const ids = items.map(t => t._id);
    const cAgg = await Comment.aggregate([
      { $match: { thread: { $in: ids }, ...(includeDeleted ? {} : notDeletedFilter('isDeleted')) } },
      { $group: { _id: '$thread', n: { $sum: 1 } } }
    ]);
    const countMap = new Map(cAgg.map(c => [String(c._id), c.n]));

    const authorIds = [...new Set(items.map(getThreadAuthorId).filter(Boolean))];
    const users     = authorIds.length
      ? await User.find({ _id: { $in: authorIds } }).select('name email').lean()
      : [];
    const uMap = new Map(users.map(u => [String(u._id), u]));

    const threads = items.map(t => {
      const isAnon   = !!t.isAnonymous;
      const authorId = getThreadAuthorId(t);
      const u        = authorId ? uMap.get(String(authorId)) : null;
      const display  = t.author_name || u?.name || 'Unknown';

      return {
        ...t,
        body:          getThreadBody(t),
        author_display: isAnon ? 'Anonymous' : display,
        commentCount:  countMap.get(String(t._id)) || 0,
        isPinned:      !!(t.isPinned || t.pinned),
        isLocked:      !!(t.isLocked || t.locked),
        upvoteCount:   Number(getUpvoteCount(t)) || 0,
      };
    });

    threads.sort((a, b) => {
      const ap = a.isPinned ? 1 : 0;
      const bp = b.isPinned ? 1 : 0;
      if (ap !== bp) return bp - ap;

      const ad = new Date(a.createdAt).getTime();
      const bd = new Date(b.createdAt).getTime();
      if (ad !== bd) return bd - ad;

      return (b.upvoteCount || 0) - (a.upvoteCount || 0);
    });

    let nextCursor = null;
    if (hasMore && threads.length) {
      const last = threads[threads.length - 1];
      nextCursor = last.createdAt.toISOString();
    }

    return res.json({
      threads,
      hasMore,
      nextCursor
    });
  } catch (e) {
    console.error('[threads:list] error:', e);
    return res.status(500).json({ error: 'Failed to load threads' });
  }
});

/* ============================== CREATE ============================== */
router.post(
  '/',
  requireAuth,
  validate({
    title:        s.string({ min: 3, max: 200 }),
    body:         s.optional(s.string({ min: 0, max: 10000 })),
    content:      s.optional(s.string({ min: 0, max: 10000 })),
    isAnonymous:  s.optional(s.boolean()),
  }),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.uid).select('name isBanned').lean();
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.isBanned) return res.status(403).json({ error: 'Account is banned from posting.' });

      const { title, body, content, isAnonymous } = req.body || {};
      console.log('[threads] Received req.body:', { title, body, isAnonymous });

      const finalTitle = String(title || '').trim();
      const finalBody  = String(body ?? content ?? '').trim();

      if (finalTitle.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
      if (finalBody.length  < 10) return res.status(400).json({ error: 'Content must be at least 10 characters.' });

      // Determine whether user requested anonymity
      const isAnon = isAnonymous === true || isAnonymous === 'true' || isAnonymous === 'on';
      console.log('[threads] Interpreted isAnon:', isAnon);

      const threadData = {
        title:       finalTitle,
        body:        finalBody,
        content:     finalBody,
        isAnonymous: isAnon,
        upvoters:    [],
        upvoteCount: 0,
        thumbsUp:    0,
        realAuthor:  req.user.uid,   // hidden field for admin
      };

      if (isAnon) {
        threadData.author      = null;
        threadData.userId      = null;
        threadData.author_name = 'Anonymous';
      } else {
        threadData.author      = req.user.uid;
        threadData.userId      = req.user.uid;
        threadData.author_name = user.name;
      }

      console.log('[threads] Final threadData to create:', threadData);

      const t = await Thread.create(threadData);

      return res.status(201).json({ thread: { id: t._id } });
    } catch (e) {
      console.error('[threads] create error:', e);
      return res.status(500).json({ error: 'Failed to create thread' });
    }
  }
);




/* ============================== UPVOTE ============================== */
// Example: backend/routes/threads.js
router.post('/:id/upvote', requireAuth, async (req, res) => {
  const threadId = req.params.id;
  const userId   = req.user.id;          // or however you identify user
  const undo     = req.body.undo === true;

  try {
    const thread = await Thread.findById(threadId);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const already = thread.upvoters.includes(userId);

    if (undo && already) {
      // Remove the upvote
      thread.upvoters = thread.upvoters.filter(u => String(u) !== String(userId));
      thread.upvoteCount = thread.upvoters.length;
    } else if (!undo && !already) {
      // Add the upvote
      thread.upvoters.push(userId);
      thread.upvoteCount = thread.upvoters.length;
    }

    await thread.save();
    return res.json({ ok: true, upvoteCount: thread.upvoteCount });
  } catch (err) {
    console.error('Upvote error', err);
    return res.status(500).json({ error: 'Failed to upvote' });
  }
});


/* ============================== REPORT (enum‑safe‑ish) ============================== */
/**
 * POST /api/threads/:id/report
 */
router.post(
  '/:id/report',
  requireAuth,
  validate({
    category: s.optional(s.string({ min: 0, max: 40 })),
    details : s.optional(s.string({ min: 0, max: 1000 })),
    reason  : s.optional(s.string({ min: 0, max: 1000 })),
  }),
  async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id || !mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: 'Invalid thread id' });
      }

      const t = await Thread.findById(id).select('_id title body content author').lean();
      if (!t) return res.status(404).json({ error: 'Thread not found' });

      const rawCategory = (req.body?.category || req.body?.type || 'other').toString().slice(0,40);
      const details     = (req.body?.details || '').toString().slice(0,1000);
      const reason      = (req.body?.reason  || details || rawCategory).toString().slice(0,1000);

      const doc = {
        targetType:  'thread',
        targetId:    t._id,
        reporterId:  req.user.uid,
        reason,
        details
      };
      if (rawCategory) doc.category = rawCategory;

      const r = await Report.create(doc);

      (async () => {
        try {
          let Notification = null;
          try { Notification = require('../Models/Notification'); } catch {}
          if (Notification) {
            const admins = await User.find({ role: 'admin', isBanned: { $ne: true } }).select('_id').lean();
            const link   = `thread.html?id=${encodeURIComponent(String(t._id))}`;
            await Promise.all(admins.map(a => Notification.create({
              userId: a._id,
              type:   'report_created',
              title:  'New report: thread',
              body:   reason || '',
              link,
              meta:   { targetType: 'thread', targetId: t._id, reportId: r._id }
            })));
          }
          if (process.env.SEND_REPORT_EMAILS === '1' && process.env.ADMIN_EMAILS) {
            const to      = process.env.ADMIN_EMAILS.split(',').map(s => s.trim()).filter(Boolean);
            if (to.length) {
              const snippet = `${t.title || '(untitled)'} — ${(t.body ?? t.content ?? '').slice(0,180)}`;
              const link    = `thread.html?id=${encodeURIComponent(String(t._id))}`;
              await sendMail({ to, subject: 'New report (thread)', text: `${snippet}\n\nReason: ${reason}\n${link}` });
            }
          }
          try { req.app?.emit?.('admin:event', { type: 'report:created', id: r._id }); } catch {}
        } catch (e) {
          console.warn('[report notify] non‑fatal:', e?.message || e);
        }
      })();

      return res.json({ ok: true });
    } catch (e) {
      console.error('[threads] report error:', e);
      return res.status(500).json({ error: 'Failed to report thread' });
    }
  }
);

/* ============================== ADMIN (compat) ============================== */
/**
 * Soft-delete / Restore endpoints for backward compatibility
 */
router.post(
  '/:id/soft-delete',
  requireAdmin,
  validate({ reason: s.optional(s.string({ max: 2000 })) }),
  async (req, res) => {
    try {
      const t = await Thread.findById(req.params.id);
      if (!t) return res.status(404).json({ error: 'Thread not found' });
      await t.softDelete?.(req.user.uid, req.body?.reason || '');
      res.json({ ok: true });
    } catch (e) {
      console.error('[threads] soft-delete error:', e);
      res.status(500).json({ error: 'Failed to delete thread' });
    }
  }
);

router.post('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const t = await Thread.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Thread not found' });
      await t.restore?.();
      res.json({ ok: true });
  } catch (e) {
    console.error('[threads] restore error:', e);
    res.status(500).json({ error: 'Failed to restore thread' });
  }
});

/* ============================== ADMIN: Lock / Unlock Threads ============================== */
router.post('/:id/lock', requireAdmin, async (req, res) => {
  try {
    const tid = req.params.id;
    if (!mongoose.isValidObjectId(tid)) {
      return res.status(400).json({ error: 'Invalid thread id' });
    }
    const t = await Thread.findById(tid);
    if (!t) return res.status(404).json({ error: 'Thread not found' });

    t.isLocked = true;
    t.lockedAt  = new Date();
    t.lockedBy  = req.user.uid;
    await t.save();

    return res.json({ ok: true, locked: true });
  } catch (e) {
    console.error('[threads] lock error:', e);
    return res.status(500).json({ error: 'Failed to lock thread' });
  }
});

router.post('/:id/unlock', requireAdmin, async (req, res) => {
  try {
    const tid = req.params.id;
    if (!mongoose.isValidObjectId(tid)) {
      return res.status(400).json({ error: 'Invalid thread id' });
    }
    const t = await Thread.findById(tid);
    if (!t) return res.status(404).json({ error: 'Thread not found' });

    t.isLocked = false;
    t.lockedAt  = null;
    t.lockedBy  = null;
    await t.save();

    return res.json({ ok: true, locked: false });
  } catch (e) {
    console.error('[threads] unlock error:', e);
    return res.status(500).json({ error: 'Failed to unlock thread' });
  }
});

module.exports = router;
