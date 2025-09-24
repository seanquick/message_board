// Backend/Models/Comment.js
/**
 * Comment model (backwards-compatible + upvotes + soft-delete)
 *
 * Legacy fields:
 *  - content (String)    ← legacy body
 *  - userId  (ObjectId)  ← legacy author
 *  - parentId (ObjectId) ← parent comment for replies
 *  - thread  (ObjectId)  ← owning thread
 *
 * Canonical:
 *  - body (String)       ← mirrored to/from `content`
 *  - author (ObjectId)   ← mirrored to/from `userId`
 *  - author_name (String)
 *  - isAnonymous (Boolean)
 *
 * Features:
 *  - Upvotes: upvoters[], upvoteCount; toggleUpvote(userId)
 *  - Soft delete: isDeleted, deletedAt, deletedBy, deleteReason; softDelete()/restore()
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const CommentSchema = new Schema(
  {
    // ----- Ownership / hierarchy -----
    thread:   { type: Schema.Types.ObjectId, ref: 'Thread', required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },

    // ----- Content -----
    body:     { type: String, trim: true, default: '' }, // canonical
    content:  { type: String, trim: true, default: '' }, // legacy mirror

    // ----- Author -----
    author:       { type: Schema.Types.ObjectId, ref: 'User' },  // canonical
    userId:       { type: Schema.Types.ObjectId, ref: 'User' },  // legacy
    author_name:  { type: String, trim: true, default: '' },
    isAnonymous:  { type: Boolean, default: false },

    // ----- Upvotes (thumbs up) -----
    upvoters:    [{ type: Schema.Types.ObjectId, ref: 'User' }],
    upvoteCount: { type: Number, default: 0 },
    // legacy aggregate for older code
    score:       { type: Number, default: 0 },

    // ----- Soft delete (visible to admins) -----
    isDeleted:    { type: Boolean, default: false, index: true },
    deletedAt:    { type: Date },
    deletedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
    deleteReason: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true, minimize: false }
);

/* =====================================================================
 * HOOKS: keep mirrors and denormalized counters consistent
 * =================================================================== */

// Mirror legacy/new fields & basic validation before validate
CommentSchema.pre('validate', function (next) {
  // Mirror body/content
  if (!this.body && this.content) this.body = this.content;
  if (!this.content && this.body) this.content = this.body;

  // Mirror author/userId
  if (!this.author && this.userId) this.author = this.userId;
  if (!this.userId && this.author) this.userId = this.author;

  // Content length rule (allow very short, just not empty)
  const text = (this.body || this.content || '').trim();
  if (text.length < 1) {
    return next(new Error('Comment cannot be empty.'));
  }

  if (!this.author_name) this.author_name = 'Unknown';
  next();
});

// Maintain upvoteCount/score + mirrors before save
CommentSchema.pre('save', function (next) {
  // De-duplicate upvoters and sync upvoteCount/score
  if (this.isModified('upvoters')) {
    const unique = Array.from(new Set((this.upvoters || []).map(String)))
      .map(id => new mongoose.Types.ObjectId(id));
    this.upvoters = unique;
    const n = unique.length;
    this.upvoteCount = n;
    this.score = n; // legacy mirror
  }

  // Mirror again for safety
  if (this.isModified('body') && typeof this.body === 'string' && this.body !== this.content) {
    this.content = this.body;
  }
  if (this.isModified('content') && typeof this.content === 'string' && this.content !== this.body) {
    this.body = this.content;
  }
  if (this.isModified('author') && this.author && String(this.author) !== String(this.userId || '')) {
    this.userId = this.author;
  }
  if (this.isModified('userId') && this.userId && String(this.userId) !== String(this.author || '')) {
    this.author = this.userId;
  }

  next();
});

/* =====================================================================
 * INSTANCE METHODS
 * =================================================================== */

/**
 * toggleUpvote(userId)
 * - Adds the user to upvoters if not present; removes if already present.
 * - Keeps upvoteCount + score in sync.
 * - Returns { upvoted: boolean, upvoteCount: number }.
 */
CommentSchema.methods.toggleUpvote = async function(userId) {
  const uid = String(userId);
  const set = new Set((this.upvoters || []).map(v => String(v)));

  let upvoted;
  if (set.has(uid)) {
    set.delete(uid);
    upvoted = false;
  } else {
    set.add(uid);
    upvoted = true;
  }

  this.upvoters = Array.from(set).map(id => new mongoose.Types.ObjectId(id));
  const n = this.upvoters.length;
  this.upvoteCount = n;
  this.score = n; // legacy

  await this.save();
  return { upvoted, upvoteCount: n };
};

/**
 * softDelete(byUserId, reason)
 * - Marks the comment as deleted but keeps it in DB for admins.
 */
CommentSchema.methods.softDelete = async function(byUserId, reason = '') {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = byUserId || this.deletedBy;
  this.deleteReason = String(reason || '').slice(0, 1000);
  await this.save();
  return this;
};

/**
 * restore()
 * - Restores a soft-deleted comment.
 */
CommentSchema.methods.restore = async function() {
  this.isDeleted = false;
  this.deletedAt = undefined;
  this.deletedBy = undefined;
  this.deleteReason = undefined;
  await this.save();
  return this;
};

/* =====================================================================
 * STATIC HELPERS (optional sugar)
 * =================================================================== */

/**
 * upvoteById(commentId, userId)
 * - Convenience wrapper to toggle upvote by ids.
 */
CommentSchema.statics.upvoteById = async function(commentId, userId) {
  const c = await this.findById(commentId);
  if (!c) return null;
  return c.toggleUpvote(userId);
};

/* =====================================================================
 * INDEXES
 * =================================================================== */

// Fast tree traversal & per-thread queries
CommentSchema.index({ thread: 1, parentId: 1, createdAt: 1 });

// Sorting newest then most upvotes within a thread
CommentSchema.index({ thread: 1, createdAt: -1, upvoteCount: -1 });

// Basic text search (body)
CommentSchema.index({ body: 'text' });

// Already have isDeleted index above; keep createdAt global too
CommentSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Comment || mongoose.model('Comment', CommentSchema);
