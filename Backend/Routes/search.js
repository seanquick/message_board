// Backend/Routes/search.js
const router = require('express').Router();
const Thread  = require('../Models/Thread');
const Comment = require('../Models/Comment');
const User    = require('../Models/User');
const { tryAuth } = require('../Middleware/auth');

// simple public search across threads + comments
router.get('/', tryAuth, async (req, res) => {
  try {
    const qstr = (req.query.q || '').toString().trim();
    if (!qstr) return res.json({ results: [] });

    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || '20', 10)));
    const [threads, comments] = await Promise.all([
      Thread.find({
        $or: [{ title: { $regex: qstr, $options: 'i' } }, { body: { $regex: qstr, $options: 'i' } }, { content: { $regex: qstr, $options: 'i' } }],
        $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }]
      }).sort({ createdAt: -1 }).limit(limit).lean(),
      Comment.find({
        $or: [{ body: { $regex: qstr, $options: 'i' } }, { content: { $regex: qstr, $options: 'i' } }],
        $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }]
      }).sort({ createdAt: -1 }).limit(limit).lean()
    ]);

    const results = [
      ...threads.map(t => ({
        type: 'thread',
        _id: t._id,
        title: t.title,
        snippet: (t.body ?? t.content ?? '').slice(0, 200),
        createdAt: t.createdAt,
        link: `thread.html?id=${encodeURIComponent(String(t._id))}`
      })),
      ...comments.map(c => ({
        type: 'comment',
        _id: c._id,
        title: 'Comment',
        snippet: (c.body || '').slice(0, 200),
        createdAt: c.createdAt,
        link: `thread.html?id=${encodeURIComponent(String(c.thread))}&highlight=${encodeURIComponent(String(c._id))}#c-${encodeURIComponent(String(c._id))}`
      }))
    ].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ results });
  } catch (e) {
    console.error('[search] error:', e);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
