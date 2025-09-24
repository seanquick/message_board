// Backend/Middleware/ensureThreadUnlocked.js
/**
 * Blocks creating new comments on locked threads.
 * Looks for a thread id in:
 *   - req.params.threadId   (POST /api/comments/:threadId)
 *   - req.body.threadId or req.body.thread (fallbacks)
 *
 * Responds with:
 *   400 if no thread id,
 *   404 if thread not found,
 *   423 if thread is locked,
 *   500 on unexpected DB errors.
 */
const Thread = require('../Models/Thread');

module.exports = async function ensureThreadUnlocked(req, res, next) {
  try {
    const tid = req.params.threadId || req.body?.threadId || req.body?.thread;
    if (!tid) return res.status(400).json({ error: 'Missing thread id' });

    const t = await Thread.findById(tid).select('isLocked locked').lean();
    if (!t) return res.status(404).json({ error: 'Thread not found' });

    const locked = !!(t.isLocked || t.locked);
    if (locked) return res.status(423).json({ error: 'Thread is locked' });

    return next();
  } catch (e) {
    console.error('[ensureThreadUnlocked] error:', e);
    return res.status(500).json({ error: 'Lock check failed' });
  }
};
