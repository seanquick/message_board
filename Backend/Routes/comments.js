// Backend/Routes/comments.js
/**
 * Comments API (complete, backwards‑compatible + pagination support)
 *
 * Endpoints:
 *  - GET    /api/comments/:threadId            → List comments for a thread (pagination support)
 *  - POST   /api/comments/:threadId            → Create a top‑level comment or a reply (auth; banned users blocked; thread must be unlocked)
 *      Body: { body|content, parentId?, isAnonymous? }
 *  - POST   /api/comments/:id/upvote           → Toggle thumbs‑up (auth)
 *  - POST   /api/comments/vote/:id             → LEGACY (kept)
 *  - POST   /api/comments/:id/report           → Report a comment (auth)
 *  - POST   /api/comments/:id/soft-delete      → Admin
 *  - POST   /api/comments/:id/restore          → Admin
 */

const router = require('express').Router();
const mongoose = require('mongoose');

const Comment = require('../Models/Comment');
const Thread  = require('../Models/Thread');
const User    = require('../Models/User');
const Report  = require('../Models/Report');

const { requireAuth, requireAdmin } = require('../Middleware/auth');
const ensureThreadUnlocked = require('../Middleware/ensureThreadUnlocked');

// Optional anti‑abuse guards (if missing, everything still works)
let rateLimitByUserAndIP, contentRules;
try {
  ({ rateLimitByUserAndIP, contentRules } = require('../Middleware/abuseGuards'));
} catch { /* optional */ }

// Validation helpers (B‑021)
const { s, body: validate } = require('../Util/validate');

/** Normalize Strings and basic checks */
function normStr(v) { return (v ?? '').toString().trim(); }

/** Validate ObjectId‑looking strings safely */
function toId(maybeId) {
  if (!maybeId) return null;
  try { return new mongoose.Types.ObjectId(String(maybeId)); }
  catch { return null; }
}

/** Guard: parent comment must belong to the same thread */
async function assertParentInThread(parentId, threadId) {
  if (!parentId) return true;
  const p = await Comment.findById(parentId).select('thread').lean();
  return !!(p && String(p.thread) === String(threadId));
}

/** Standard error helper */
function bad(res, code, msg) { return res.status(code).json({ error: msg }); }

/** Filter comments not deleted (for non‑admin) */
function notDeletedFilter(field = 'isDeleted') {
  return { $or: [{ [field]: { $exists: false } }, { [field]: false }] };
}

// ===================================================================
// GET /api/comments/:threadId — list comments for a thread (pagination)
// ===================================================================
router.get('/:threadId', async (req, res) => {
  try {
    const rawThreadId = req.params.threadId;
    if (!mongoose.isValidObjectId(rawThreadId)) {
      return bad(res, 400, 'Invalid thread id.');
    }
    const threadId = mongoose.Types.ObjectId(rawThreadId);

    const thread = await Thread.findById(threadId).select('_id isDeleted isLocked').lean();
    if (!thread || thread.isDeleted) {
      return bad(res, 404, 'Thread not found');
    }

    const isAdmin = !!(req.user && req.user.role === 'admin');
    const includeDeleted = isAdmin && (req.query.includeDeleted === '1' || req.query.includeDeleted === 'true');

    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    let filter = { thread: threadId };
    if (!includeDeleted) {
      Object.assign(filter, notDeletedFilter('isDeleted'));
    }

    // Cursor‑based pagination: if after is provided, load comments created before that comment
    if (req.query.after && mongoose.isValidObjectId(req.query.after)) {
      // load items **before** the given id (so older than that)
      filter._id = { $lt: mongoose.Types.ObjectId(req.query.after) };
    }

    // Sort newest first (descending by _id or createdAt)
    const docs = await Comment.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)  // fetch one extra to detect hasMore
      .lean();

    const hasMore = docs.length > limit;
    if (hasMore) {
      docs.pop();  // remove extra item
    }

    const nextCursor = hasMore ? String(docs[docs.length - 1]._id) : null;

    res.json({
      comments: docs,
      hasMore,
      nextCursor
    });

  } catch (e) {
    console.error('[comments] list error:', e);
    return bad(res, 500, 'Failed to list comments');
  }
});

// ===================================================================
// POST /api/comments/:threadId — create comment or reply (auth)
// ===================================================================
const createValidators = validate({
  body:       s.optional(s.string({ min: 1, max: 10000 })),
  content:    s.optional(s.string({ min: 1, max: 10000 })),
  parentId:   s.optional(s.string({ max: 64 })),
  isAnonymous: s.optional(s.boolean()),
});

const creationMiddleware = [
  requireAuth,
  ensureThreadUnlocked, // checks the thread lock state by :threadId
  ...(rateLimitByUserAndIP ? [rateLimitByUserAndIP({ key: 'comment', windowMs: 60_000, max: 20 })] : []),
  ...(contentRules ? [contentRules({ kind: 'comment', minChars: 1, maxLinks: 8 })] : []),
  createValidators,
];

router.post('/:threadId', creationMiddleware, async (req, res) => {
  try {
    // 1) Block banned users
    const me = await User.findById(req.user.uid).select('name isBanned').lean();
    if (!me) return bad(res, 401, 'Unauthorized');
    if (me.isBanned) return bad(res, 403, 'Account is banned from posting.');

    // 2) Validate thread
    const threadId = toId(req.params.threadId);
    if (!threadId) return bad(res, 400, 'Invalid thread id.');
    const thread = await Thread.findById(threadId).select('_id isDeleted').lean();
    if (!thread || thread.isDeleted) return bad(res, 404, 'Thread not found');

    // 3) Validate payload
    const { body, content, parentId: rawParentId, isAnonymous } = req.body || {};
    const finalBody = normStr(body ?? content);
    const parentId  = toId(rawParentId);

    if (!finalBody) return bad(res, 400, 'Comment cannot be empty.');
    if (finalBody.length > 10000) return bad(res, 400, 'Comment too long.');

    // Parent must belong to same thread
    if (parentId && !(await assertParentInThread(parentId, threadId))) {
      return bad(res, 400, 'Parent comment does not belong to this thread.');
    }

    // 4) Create comment
    const c = await Comment.create({
      thread:       threadId,
      parentId:     parentId || null,
      body:         finalBody,
      content:      finalBody,
      isAnonymous:  !!isAnonymous,
      author:       req.user.uid,
      userId:       req.user.uid,
      author_name:  me.name
    });

    return res.status(201).json({ id: c._id });

  } catch (e) {
    console.error('[comments] create error:', e);
    return bad(res, 500, 'Failed to create comment');
  }
});

// ===================================================================
// POST /api/comments/:id/upvote — toggle thumbs‑up on comment (auth)
// ===================================================================
router.post('/:id/upvote', requireAuth, async (req, res) => {
  try {
    const cid = toId(req.params.id);
    if (!cid) return bad(res, 400, 'Invalid comment id.');

    const c = await Comment.findById(cid);
    if (!c || c.isDeleted) return bad(res, 404, 'Comment not found');

    const result = await c.toggleUpvote(req.user.uid);
    return res.json(result); // { upvoted, upvoteCount }

  } catch (e) {
    console.error('[comments] upvote error:', e);
    return bad(res, 500, 'Failed to upvote comment');
  }
});

// ===================================================================
// POST /api/comments/vote/:id — LEGACY toggle thumbs‑up (auth)
// ===================================================================
router.post('/vote/:id', requireAuth, async (req, res) => {
  try {
    const cid = toId(req.params.id);
    if (!cid) return bad(res, 400, 'Invalid comment id.');

    const c = await Comment.findById(cid);
    if (!c || c.isDeleted) return bad(res, 404, 'Comment not found');

    const result = await c.toggleUpvote(req.user.uid);
    return res.json(result);

  } catch (e) {
    console.error('[comments] legacy vote error:', e);
    return bad(res, 500, 'Failed to vote comment');
  }
});

// ===================================================================
// POST /api/comments/:id/report — report a comment (auth)
// ===================================================================
router.post('/:id/report', requireAuth, validate({ reason: s.optional(s.string({ min: 0, max: 1000 })) }), async (req, res) => {
  try {
    const cid = toId(req.params.id);
    if (!cid) return bad(res, 400, 'Invalid comment id.');

    const c = await Comment.findById(cid).select('_id').lean();
    if (!c) return bad(res, 404, 'Comment not found');

    const reason = normStr(req.body?.reason).slice(0, 1000);

    await Report.create({
      targetType: 'comment',
      targetId:   c._id,
      reason,
      reporterId: req.user.uid
    });

    return res.json({ ok: true });

  } catch (e) {
    console.error('[comments] report error:', e);
    return bad(res, 500, 'Failed to report comment');
  }
});

// ===================================================================
// POST /api/comments/:id/soft‑delete — admin only
// ===================================================================
router.post('/:id/soft-delete', requireAdmin, validate({ reason: s.optional(s.string({ max: 2000 })) }), async (req, res) => {
  try {
    const cid = toId(req.params.id);
    if (!cid) return bad(res, 400, 'Invalid comment id.');

    const c = await Comment.findById(cid);
    if (!c) return bad(res, 404, 'Comment not found');

    await c.softDelete(req.user.uid, normStr(req.body?.reason));
    return res.json({ ok: true });

  } catch (e) {
    console.error('[comments] soft-delete error:', e);
    return bad(res, 500, 'Failed to delete comment');
  }
});

// ===================================================================
// POST /api/comments/:id/restore — admin only
// ===================================================================
router.post('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const cid = toId(req.params.id);
    if (!cid) return bad(res, 400, 'Invalid comment id.');

    const c = await Comment.findById(cid);
    if (!c) return bad(res, 404, 'Comment not found');

    await c.restore();
    return res.json({ ok: true });

  } catch (e) {
    console.error('[comments] restore error:', e);
    return bad(res, 500, 'Failed to restore comment');
  }
});

module.exports = router;
