// Backend/Routes/comments.js
/**
 * Comments API (complete, backwards‑compatible + pagination support + edit metadata)
 *
 * Endpoints:
 *  - GET    /api/comments/:threadId            → List comments for a thread (pagination support)
 *  - POST   /api/comments/:threadId            → Create a top‑level comment or a reply (auth; banned users blocked; thread must be unlocked)
 *      Body: { body|content, parentId?, isAnonymous? }
 *  - POST   /api/comments/:id/upvote           → Toggle thumbs‑up (auth)
 *  - POST   /api/comments/vote/:id             → LEGACY (kept)
 *  - POST   /api/comments/:id/report           → Report a comment (auth)
 *  - POST   /api/comments/:id/soft‑delete      → Admin
 *  - POST   /api/comments/:id/restore          → Admin
 *  - **PUT** /api/comments/:id                 → Edit a comment body (author or admin)
 */

const router   = require('express').Router();
const mongoose = require('mongoose');

const Comment = require('../Models/Comment');
const Thread  = require('../Models/Thread');
const User    = require('../Models/User');
const Report  = require('../Models/Report');
const notifyUser = require('../Util/notify');

const { requireAuth, requireAdmin }           = require('../Middleware/auth');
const ensureThreadUnlocked                   = require('../Middleware/ensureThreadUnlocked');

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
  try {
    return new mongoose.Types.ObjectId(String(maybeId));
  } catch {
    return null;
  }
}

/** Guard: parent comment must belong to the same thread */
async function assertParentInThread(parentId, threadId) {
  if (!parentId) return true;
  const p = await Comment.findById(parentId).select('thread').lean();
  return !!(p && String(p.thread) === String(threadId));
}

/** Standard error helper */
function bad(res, code, msg) {
  return res.status(code).json({ error: msg });
}

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
    const threadId = new mongoose.Types.ObjectId(rawThreadId);

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

    // Cursor‑based pagination: if after is provided, load comments _before_ that comment
    if (req.query.after && mongoose.isValidObjectId(req.query.after)) {
      filter._id = { $lt: new mongoose.Types.ObjectId(req.query.after) };
    }

    const docs = await Comment.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore   = docs.length > limit;
    if (hasMore) docs.pop();

    const nextCursor = hasMore ? String(docs[docs.length - 1]._id) : null;

    return res.json({ comments: docs, hasMore, nextCursor });
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
  ensureThreadUnlocked,
  ...(rateLimitByUserAndIP ? [rateLimitByUserAndIP({ key: 'comment', windowMs: 60000, max: 20 })] : []),
  ...(contentRules ? [contentRules({ kind: 'comment', minChars: 1, maxLinks: 8 })] : []),
  createValidators,
];

router.post('/:threadId', creationMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.user.uid).select('name email isBanned notificationPrefs').lean();
    if (!me) return bad(res, 401, 'Unauthorized');
    if (me.isBanned) return bad(res, 403, 'Account is banned from posting.');

    const threadId = toId(req.params.threadId);
    if (!threadId) return bad(res, 400, 'Invalid thread id.');
    const thread = await Thread.findById(threadId).select('_id title isDeleted userId').lean();
    if (!thread || thread.isDeleted) return bad(res, 404, 'Thread not found');

    const { body, content, parentId: rawParentId, isAnonymous } = req.body || {};
    const finalBody = normStr(body ?? content);
    const parentId = toId(rawParentId);

    if (!finalBody) return bad(res, 400, 'Comment cannot be empty.');
    if (finalBody.length > 10000) return bad(res, 400, 'Comment too long.');

    if (parentId && !(await assertParentInThread(parentId, threadId))) {
      return bad(res, 400, 'Parent comment does not belong to this thread.');
    }

    const isAnon = !!isAnonymous;
    const newCommentData = {
      thread: threadId,
      parentId: parentId || null,
      body: finalBody,
      content: finalBody,
      isAnonymous: isAnon,
      author: req.user.uid,
      userId: req.user.uid,
      author_name: me.name
    };

    if (isAnon) {
      newCommentData.author = null;
      newCommentData.userId = null;
      newCommentData.author_name = 'Anonymous';
    }

    const c = await Comment.create(newCommentData);

    // ✉️ Reply-to-comment email notification
    if (parentId) {
      const parent = await Comment.findById(parentId).select('userId isAnonymous').lean();
      if (parent?.userId && String(parent.userId) !== String(req.user.uid)) {
        const recipient = await User.findById(parent.userId).select('email notificationPrefs name').lean();

        if (recipient?.email) {
          // Optional: check user preferences
          const prefs = recipient.notificationPrefs || {};
          if (prefs.emailReplies !== false) {
            const notifyLink = `/thread.html?id=${threadId}#comment-${c._id}`;
            console.log(`[comments] Sending reply notification email to: ${recipient.email}`);
            await notifyUser({
              userId: recipient._id,
              type: 'reply',
              title: `New reply to your comment`,
              body: `${me.name} replied to your comment.`,
              link: notifyLink,
              email: {
                to: recipient.email,
                subject: `New reply to your comment from ${me.name}`,
                html: `
                  <p><strong>${me.name}</strong> replied to your comment on the thread "<strong>${thread.title}</strong>".</p>
                  <p><a href="https://board.quickclickswebsites.com${notifyLink}">View reply</a></p>
                  <hr>
                  <p style="font-size: 12px; color: #777;">
                    Don't want these emails? 
                    <a href="https://board.quickclickswebsites.com/settings.html#notifications">Manage your preferences</a>.
                  </p>
                `
              }
            });
          }
        }
      }
    }

    return res.status(201).json({ id: c._id });
  } catch (e) {
    console.error('[comments] create error:', e);
    return bad(res, 500, 'Failed to create comment');
  }
});



// ===================================================================
// PUT /api/comments/:id — edit comment body (author or admin)
// ===================================================================
router.put('/:id', requireAuth, validate({ body: s.string({ min: 1, max: 10000 }) }), async (req, res) => {
  try {
    const cid = toId(req.params.id);
    if (!cid) return bad(res, 400, 'Invalid comment id.');

    const comment = await Comment.findById(cid);
    if (!comment) return bad(res, 404, 'Comment not found');

    // Only comment author or admin can edit
    const isAuthor = String(comment.author) === String(req.user.uid);
    const isAdmin  = req.user.role === 'admin';
    if (!isAuthor && !isAdmin) {
      return bad(res, 403, 'Not authorized to edit this comment.');
    }

    const newBody = normStr(req.body.body);
    if (!newBody) return bad(res, 400, 'Comment body cannot be empty.');

    comment.body     = newBody;
    comment.editedBy = req.user.uid;
    comment.editedAt = new Date();

    await comment.save();
    return res.json({ ok: true, comment });
  } catch (e) {
    console.error('[comments] edit error:', e);
    return bad(res, 500, 'Failed to edit comment');
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
    return res.json(result);
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
      reason:     reason,
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
router.post('/:id/soft‑delete', requireAdmin, validate({ reason: s.optional(s.string({ max: 2000 })) }), async (req, res) => {
  try {
    const cid = toId(req.params.id);
    if (!cid) return bad(res, 400, 'Invalid comment id.');

    const c = await Comment.findById(cid);
    if (!c) return bad(res, 404, 'Comment not found');

    await c.softDelete(req.user.uid, normStr(req.body?.reason));
    return res.json({ ok: true });
  } catch (e) {
    console.error('[comments] soft‑delete error:', e);
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
