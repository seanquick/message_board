// Backend/Middleware/ensureThreadUnlocked.js
/**
 * Middleware: Prevents posting to locked threads.
 * 
 * Accepts thread id from:
 *   - req.params.threadId (e.g., /api/comments/:threadId)
 *   - req.body.threadId or req.body.thread (fallbacks)
 * 
 * Responds with:
 *   - 400: Missing thread ID
 *   - 404: Thread not found
 *   - 423: Thread is locked
 *   - 500: Unexpected DB error
 */

const mongoose = require('mongoose');
const Thread = require('../Models/Thread');

module.exports = async function ensureThreadUnlocked(req, res, next) {
  try {
    const tid = req.params.threadId || req.body?.threadId || req.body?.thread;

    if (!tid || !mongoose.isValidObjectId(tid)) {
      return res.status(400).json({ error: 'Missing or invalid thread id' });
    }

    const thread = await Thread.findById(tid).select('isLocked locked').lean();
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (thread.isLocked || thread.locked) {
      return res.status(423).json({ error: 'Thread is locked' });
    }

    next();
  } catch (err) {
    console.error('[ensureThreadUnlocked] error:', err);
    res.status(500).json({ error: 'Lock check failed' });
  }
};
