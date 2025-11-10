// ===== THREADS LIST (admin) =====
router.post('/threads', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.body.page) || 1);
    const limit = Math.max(1, Math.min(parseInt(req.body.limit) || 50, 200));
    const skip = (page - 1) * limit;

    const includeDeleted = req.body.includeDeleted === true || req.body.includeDeleted === '1';

    // Filter: exclude deleted unless requested
    const filter = includeDeleted ? {} : { isDeleted: { $ne: true } };

    const [threads, totalCount] = await Promise.all([
      Thread.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('realAuthor', 'name email')
        .lean(),
      Thread.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    // Normalize + map important flags and meta
    const processedThreads = threads.map(t => ({
      _id: t._id,
      title: t.title,
      createdAt: t.createdAt,
      upvoteCount: t.upvoteCount || t.upvotes || 0,
      commentCount: t.commentCount || 0,
      isAnonymous: !!t.isAnonymous,
      author_name: t.author_name || '',
      realAuthor: t.realAuthor ? {
        _id: t.realAuthor._id,
        name: t.realAuthor.name || '',
        email: t.realAuthor.email || ''
      } : null,
      isPinned: !!t.isPinned,
      isLocked: !!t.isLocked,
      isDeleted: !!t.isDeleted || !!t.deletedAt,
      deletedAt: t.deletedAt || null
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
