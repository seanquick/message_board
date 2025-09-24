// Backend/Routes/thread.js
/**
 * Threads API (complete, backwards-compatible)
 * Sorting policy:
 *   0) Pinned first (isPinned|pinned)
 *   1) Newest first (createdAt desc)
 *   2) Then highest upvotes
 *
 * Legacy-safe fields:
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

// ✅ lightweight validation helpers (B-021)
const { s, body: validate } = require('../Util/validate');

// Mailer (fail-soft)
const { sendMail } = (() => {
  try { return require('../Services/mailer'); }
  catch { return { sendMail: async () => ({ ok: true, skipped: true }) }; }
})();

/* --------------------------- Helpers --------------------------- */
const toBool = (v) => v === true || v === 'true' || v === '1';

const getThreadAuthorId  = (t) => t.author || t.userId || t.user || null;
const getCommentAuthorId = (c) => c.author || c.userId || c.user || null;

const getThreadBody  = (t) => t.body ?? t.content ?? '';
const getUpvoteCount = (o) => (o.upvoteCount ?? o.thumbsUp ?? o.upvotes ?? o.score ?? 0);

/** Filter: `isDeleted: false` OR field missing */
function notDeletedFilter(field = 'isDeleted') {
  return { $or: [{ [field]: { $exists: false } }, { [field]: false }] };
}

/* Build a comment tree from a flat list (keeps input order for siblings) */
function buildTree(list) {
  const byId = new Map(list.map(c => [String(c._id), { ...c, children: [] }]));
  const root = [];
  for (const c of byId.values()) {
    if (c.parentId) {
      const p = byId.get(String(c.parentId));
      if (p) p.children.push(c); else root.push(c); // orphan → root
    } else root.push(c);
  }
  return root;
}

/* Sort a comment tree: newest first, then by upvotes at each level */
function sortTree(nodes = []) {
  nodes.sort((a, b) => {
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    if (db !== da) return db - da; // newer first
    const ua = Number(a.upvoteCount ?? a.score ?? 0);
    const ub = Number(b.upvoteCount ?? b.score ?? 0);
    return ub - ua; // then by upvotes
  });
  for (const n of nodes) if (Array.isArray(n.children)) sortTree(n.children);
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

    // Shape thread
    const shapedThread = {
      ...t,
      body: getThreadBody(t),
      author_display: t.isAnonymous ? 'Anonymous' : tAuthorName,
      flags: {
        pinned: !!(t.isPinned || t.pinned),
        locked: !!(t.isLocked || t.locked),
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

/* =============================== LIST =============================== */
/**
 * GET /api/threads
 * Public list (admins can include deleted with ?includeDeleted=1).
 * We sort in DB by createdAt desc, then do a final in-memory sort to:
 *   1) put pinned threads first, then
 *   2) newest, then
 *   3) upvotes.
 */
router.get('/', tryAuth, async (req, res) => {
  try {
    const isAdmin = !!(req.user && req.user.role === 'admin');
    const includeDeleted = isAdmin && toBool(req.query.includeDeleted);

    const filter = includeDeleted ? {} : { isDeleted: false };

    // Pull a recent window to sort; DB sort stays createdAt/upvotes for efficiency
    const raw = await Thread.find(filter)
      .sort({ createdAt: -1, upvoteCount: -1 })
      .limit(50)
      .lean();

    // quick comment counts (hide deleted for non-admin)
    const ids = raw.map(t => t._id);
    const cAgg = await Comment.aggregate([
      { $match: { thread: { $in: ids }, ...(includeDeleted ? {} : notDeletedFilter('isDeleted')) } },
      { $group: { _id: '$thread', n: { $sum: 1 } } }
    ]);
    const countMap = new Map(cAgg.map(c => [String(c._id), c.n]));

    // Author enrichment (admin)
    const authorIds = [...new Set(raw.map(getThreadAuthorId).filter(Boolean))];
    const users = authorIds.length
      ? await User.find({ _id: { $in: authorIds } }).select('name email').lean()
      : [];
    const uMap = new Map(users.map(u => [String(u._id), u]));

    let threads = raw.map(t => {
      const isAnon = !!t.isAnonymous;
      const authorId = getThreadAuthorId(t);
      const u = authorId ? uMap.get(String(authorId)) : null;
      const displayName = t.author_name || u?.name || 'Unknown';
      return {
        ...t,
        body: getThreadBody(t),
        author_display: isAnon ? 'Anonymous' : displayName,
        commentCount: countMap.get(String(t._id)) || 0,
        isPinned: !!(t.isPinned || t.pinned),
        isLocked: !!(t.isLocked || t.locked),
        // ensure a numeric upvoteCount for consistent sorting
        upvoteCount: Number(getUpvoteCount(t)) || 0,
      };
    });

    // 🔽 pinned-first in-memory sort, then newest, then upvotes
    threads.sort((a, b) => {
      const ap = a.isPinned ? 1 : 0;
      const bp = b.isPinned ? 1 : 0;
      if (ap !== bp) return bp - ap; // pinned first
      const ad = new Date(a.createdAt).getTime();
      const bd = new Date(b.createdAt).getTime();
      if (ad !== bd) return bd - ad; // newer next
      return (b.upvoteCount || 0) - (a.upvoteCount || 0); // then upvotes
    });

    return res.json({ threads });
  } catch (e) {
    console.error('[threads:list] error:', e);
    return res.status(500).json({ error: 'Failed to load threads' });
  }
});

/* ============================== CREATE ============================== */
router.post(
  '/',
  requireAuth,
  // ✅ validation (B-021)
  validate({
    title: s.string({ min: 3, max: 200 }),
    body:    s.optional(s.string({ min: 0, max: 10000 })),
    content: s.optional(s.string({ min: 0, max: 10000 })),
    isAnonymous: s.optional(s.boolean()),
  }),
  async (req, res) => {
    try {
      // Block banned users
      const author = await User.findById(req.user.uid).select('name isBanned').lean();
      if (!author) return res.status(401).json({ error: 'Unauthorized' });
      if (author.isBanned) return res.status(403).json({ error: 'Account is banned from posting.' });

      const { title, body, content, isAnonymous } = req.body || {};
      const finalTitle = String(title || '').trim();
      const finalBody  = String(body ?? content ?? '').trim();

      if (finalTitle.length < 3)  return res.status(400).json({ error: 'Title must be at least 3 characters.' });
      if (finalBody.length  < 10) return res.status(400).json({ error: 'Content must be at least 10 characters.' });

      const t = await Thread.create({
        title: finalTitle,
        body: finalBody,
        content: finalBody,       // legacy mirror
        isAnonymous: !!isAnonymous,
        author: req.user.uid,
        userId: req.user.uid,     // legacy mirror
        author_name: req.user.name,
        upvoters: [],
        upvoteCount: 0,
        thumbsUp: 0               // legacy mirror init
      });

      res.status(201).json({ thread: { id: t._id } });
    } catch (e) {
      console.error('[threads] create error:', e);
      res.status(500).json({ error: 'Failed to create thread' });
    }
  }
);

/* ============================== UPVOTE ============================== */
router.post('/:id/upvote', requireAuth, async (req, res) => {
  try {
    const t = await Thread.findById(req.params.id);
    if (!t || t.isDeleted === true) return res.status(404).json({ error: 'Thread not found' });

    const result = await t.toggleUpvote(req.user.uid);
    return res.json(result); // { upvoted, upvoteCount }
  } catch (e) {
    console.error('[threads] upvote error:', e);
    res.status(500).json({ error: 'Failed to upvote thread' });
  }
});

/* ============================== REPORT (enum-safe-ish) ============================== */
/**
 * POST /api/threads/:id/report
 * Body: { category?, details?, reason? }
 * - Creates a Report for this thread
 * - Leaves status to schema default
 * - Notifications/emails are fire-and-forget
 */
router.post(
  '/:id/report',
  requireAuth,
  // ✅ basic bounds (B-021)
  validate({
    category: s.optional(s.string({ min: 0, max: 40 })),
    details:  s.optional(s.string({ min: 0, max: 1000 })),
    reason:   s.optional(s.string({ min: 0, max: 1000 })),
  }),
  async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id || !mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: 'Invalid thread id' });
      }

      const t = await Thread.findById(id).select('_id title body content author').lean();
      if (!t) return res.status(404).json({ error: 'Thread not found' });

      // Normalize incoming fields
      const rawCategory = (req.body?.category || req.body?.type || 'other').toString().slice(0, 40);
      const details     = (req.body?.details || '').toString().slice(0, 1000);
      const reason      = (req.body?.reason  || details || rawCategory).toString().slice(0, 1000);

      // Build doc. IMPORTANT: do NOT set 'status' here — let model default win.
      const doc = {
        targetType: 'thread',
        targetId: t._id,
        reporterId: req.user.uid,
        reason,
        details
      };
      // keep category if provided; if your Report schema has enum, it will enforce
      if (rawCategory) doc.category = rawCategory;

      const r = await Report.create(doc);

      // Fire & forget notifications/emails (non-blocking)
      (async () => {
        try {
          let Notification = null;
          try { Notification = require('../Models/Notification'); } catch {}
          if (Notification) {
            const admins = await User.find({ role: 'admin', isBanned: { $ne: true } }).select('_id').lean();
            const link = `thread.html?id=${encodeURIComponent(String(t._id))}`;
            await Promise.all(admins.map(a => Notification.create({
              userId: a._id,
              type: 'report_created',
              title: 'New report: thread',
              body: reason || '',
              link,
              meta: { targetType: 'thread', targetId: t._id, reportId: r._id }
            })));
          }

          if (process.env.SEND_REPORT_EMAILS === '1' && process.env.ADMIN_EMAILS) {
            const to = process.env.ADMIN_EMAILS.split(',').map(s => s.trim()).filter(Boolean);
            if (to.length) {
              const snippet = `${t.title || '(untitled)'} — ${(t.body ?? t.content ?? '').slice(0, 180)}`;
              const link = `thread.html?id=${encodeURIComponent(String(t._id))}`;
              await sendMail({ to, subject: 'New report (thread)', text: `${snippet}\n\nReason: ${reason}\n${link}` });
            }
          }

          // SSE signal to admin stream
          try { req.app?.emit?.('admin:event', { type: 'report:created', id: r._id }); } catch {}
        } catch (e) {
          console.warn('[report notify] non-fatal:', e?.message || e);
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
 * Keeping soft-delete/restore here for backward compatibility with older code.
 * You now also have admin endpoints in /api/admin/threads/:id/(pin|lock|delete).
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

module.exports = router;
