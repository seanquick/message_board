// backend/routes/comments.js
const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');

const Comment = require('../Models/Comment'); // adjust path if different
const Thread  = require('../Models/Thread');
const { requireAuth, requireAdmin } = require('../middleware/auth'); // adjust your auth middleware names

// — Create a new comment under a thread
router.post('/threads/:threadId/comments', requireAuth, async (req, res) => {
  try {
    const threadId = req.params.threadId;
    if (!mongoose.isValidObjectId(threadId)) {
      return res.status(400).json({ error: 'Invalid thread ID' });
    }

    const thread = await Thread.findById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const body       = (req.body.body || '').trim();
    const parentId   = req.body.parentId?.trim() || null;
    const isAnonymous= !!req.body.isAnonymous;

    if (!body) {
      return res.status(400).json({ error: 'Comment body cannot be empty' });
    }

    const newCommentData = {
      thread: thread._id,
      body,
      author:   req.user.id,
      author_name: req.user.name || req.user.email || 'Unknown',
      isAnonymous,
    };

    if (parentId) {
      if (!mongoose.isValidObjectId(parentId)) {
        return res.status(400).json({ error: 'Invalid parent comment ID' });
      }
      newCommentData.parentId = parentId;
    }

    const comment = await Comment.create(newCommentData);
    res.status(201).json({ ok: true, comment });
  } catch (err) {
    console.error('[comments] create error', err);
    res.status(500).json({ error: 'Failed to create comment', detail: err.message });
  }
});

// — Edit a comment (body) — allowed for author or admin
router.put('/:commentId', requireAuth, async (req, res) => {
  try {
    const cid = req.params.commentId;
    if (!mongoose.isValidObjectId(cid)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }

    const comment = await Comment.findById(cid);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Only author or admin can edit
    if (String(comment.author) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to edit this comment' });
    }

    const body = (req.body.body || '').trim();
    if (!body) {
      return res.status(400).json({ error: 'Comment body cannot be empty' });
    }

    comment.body     = body;
    comment.editedBy = req.user.id;
    comment.editedAt = new Date();

    await comment.save();
    res.json({ ok: true, comment });
  } catch (err) {
    console.error('[comments] edit error', err);
    res.status(500).json({ error: 'Failed to edit comment', detail: err.message });
  }
});

// — Soft delete a comment (only admin)
router.post('/:commentId/delete', requireAdmin, async (req, res) => {
  try {
    const cid = req.params.commentId;
    if (!mongoose.isValidObjectId(cid)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }

    const comment = await Comment.findById(cid);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    await comment.softDelete(req.user.id, req.body.reason || '');
    res.json({ ok: true, comment });
  } catch (err) {
    console.error('[comments] delete error', err);
    res.status(500).json({ error: 'Failed to delete comment', detail: err.message });
  }
});

// — Restore a soft‑deleted comment (only admin)
router.post('/:commentId/restore', requireAdmin, async (req, res) => {
  try {
    const cid = req.params.commentId;
    if (!mongoose.isValidObjectId(cid)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }

    const comment = await Comment.findById(cid);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    await comment.restore();
    res.json({ ok: true, comment });
  } catch (err) {
    console.error('[comments] restore error', err);
    res.status(500).json({ error: 'Failed to restore comment', detail: err.message });
  }
});

// — Bulk actions (delete / restore) — only admin
router.post('/bulk', requireAdmin, async (req, res) => {
  try {
    const commentIds = Array.isArray(req.body.commentIds) ? req.body.commentIds : [];
    const action     = req.body.action;

    if (!commentIds.length) {
      return res.status(400).json({ error: 'No comment IDs provided' });
    }
    if (!['delete','restore'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const validIds = commentIds.filter(id => mongoose.isValidObjectId(id));
    if (!validIds.length) {
      return res.status(400).json({ error: 'No valid comment IDs provided' });
    }

    let result;
    if (action === 'delete') {
      result = await Comment.updateMany(
        { _id: { $in: validIds } },
        {
          $set: {
            isDeleted:    true,
            deletedAt:    new Date(),
            deletedBy:    req.user.id,
          }
        }
      );
    } else {
      // restore
      result = await Comment.updateMany(
        { _id: { $in: validIds } },
        {
          $set: {
            isDeleted:    false,
            deletedAt:    undefined,
            deletedBy:    undefined,
            deleteReason: ''
          }
        }
      );
    }

    res.json({ ok: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error('[comments] bulk action error', err);
    res.status(500).json({ error: 'Failed to perform bulk action', detail: err.message });
  }
});

module.exports = router;
