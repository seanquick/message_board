// Backend/routes/report.js

/**
 * Report endpoint.
 * POST /api/report
 * Body: { threadId?, commentId?, reason?, category? }
 */

const router = require('express').Router();
const mongoose = require('mongoose');

const Report  = require('../Models/Report');
const Thread  = require('../Models/Thread');
const Comment = require('../Models/Comment');

const { requireAuth } = require('../Middleware/auth');
const { s: normStr, body: validate } = require('../Util/validate');

// Helpers
function toId(maybeId) {
  if (!maybeId) return null;
  try { return new mongoose.Types.ObjectId(String(maybeId)); }
  catch { return null; }
}

router.post(
  '/',
  requireAuth,
  validate({
    threadId:  normStr.optional,
    commentId: normStr.optional,
    reason:    normStr.optional,
    category:  normStr.optional
  }),
  async (req, res) => {
    try {
      const rawThreadId  = req.body?.threadId;
      const rawCommentId = req.body?.commentId;

      const threadId  = toId(rawThreadId);
      const commentId = toId(rawCommentId);

      if (!threadId && !commentId) {
        return res.status(400).json({ error: 'Provide threadId or commentId.' });
      }

      let targetType = null;
      let targetId   = null;

      if (threadId) {
        const t = await Thread.findById(threadId).select('_id').lean();
        if (!t) return res.status(404).json({ error: 'Thread not found' });
        targetType = 'thread';
        targetId = t._id;
      } else {
        const c = await Comment.findById(commentId).select('_id').lean();
        if (!c) return res.status(404).json({ error: 'Comment not found' });
        targetType = 'comment';
        targetId = c._id;
      }

      const reason   = normStr(req.body?.reason || '').slice(0, 1000);
      const category = normStr(req.body?.category || '').slice(0, 40);

      const doc = {
        targetType,
        targetId,
        reporterId: req.user.uid,
        reason
      };
      if (category) doc.category = category;

      const newReport = await Report.create(doc);
      return res.json({ ok: true, reportId: newReport._id });
    } catch (e) {
      console.error('[report] error:', e);
      return res.status(500).json({ error: 'Failed to submit report' });
    }
  }
);

module.exports = router;
