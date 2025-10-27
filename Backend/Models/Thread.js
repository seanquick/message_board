// Backend/Models/Thread.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ThreadSchema = new Schema({
  title:        { type: String, required: true, trim: true, maxlength: 300 },
  body:         { type: String, default: '' },
  content:      { type: String, default: '' },

  // 👤 Public-facing author fields
  author:       { type: Schema.Types.ObjectId, ref: 'User', index: true },
  userId:       { type: Schema.Types.ObjectId, ref: 'User' },
  author_name:  { type: String, default: '' },
  isAnonymous:  { type: Boolean, default: false },

  // 🔒 Private/internal identity (only for admins)
  realAuthor:   { type: Schema.Types.ObjectId, ref: 'User', index: true },

  // 👍 Voting
  upvoters:     [{ type: Schema.Types.ObjectId, ref: 'User' }],
  upvoteCount:  { type: Number, default: 0 },
  thumbsUp:     { type: Number, default: 0 },
  upvotes:      { type: Number, default: 0 },

  // 🗑️ Deletion metadata
  isDeleted:    { type: Boolean, default: false },
  deletedAt:    { type: Date },
  deletedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
  deleteReason: { type: String, default: '', maxlength: 2000 },

  // 📌 Pinning / Locking
  isPinned:     { type: Boolean, default: false },
  pinned:       { type: Boolean, default: false },

  isLocked:     { type: Boolean, default: false },
  locked:       { type: Boolean, default: false },

  // 🔧 Lock metadata
  lockedAt:     { type: Date },
  lockedBy:     { type: Schema.Types.ObjectId, ref: 'User' },

  // 🕵️ Admin tracking fields
  createdByIP:  { type: String, default: '' }, // optional: useful for audit logging
  createdByUA:  { type: String, default: '' }, // optional: store user-agent if desired

}, { timestamps: true, minimize: false });

/* ------------------------------------------------
 * Instance Methods
 * ------------------------------------------------ */

/**
 * Toggle upvote for a given user.
 * Returns updated count and whether user upvoted or removed.
 */
ThreadSchema.methods.toggleUpvote = async function (userId) {
  const idStr = String(userId);
  const set = new Set((this.upvoters || []).map(v => String(v)));
  let upvoted;

  if (set.has(idStr)) {
    set.delete(idStr);
    upvoted = false;
  } else {
    set.add(idStr);
    upvoted = true;
  }

  this.upvoters = [...set];
  const n = this.upvoters.length;
  this.upvoteCount = n;
  this.thumbsUp = n;
  this.upvotes = n;

  await this.save();
  return { upvoted, upvoteCount: n };
};

/**
 * Soft delete a thread (does not permanently remove it).
 */
ThreadSchema.methods.softDelete = async function (actorId, reason = '') {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = actorId || this.deletedBy;
  this.deleteReason = reason || this.deleteReason || '';
  await this.save();
  return { ok: true };
};

/**
 * Restore a soft-deleted thread.
 */
ThreadSchema.methods.restore = async function () {
  this.isDeleted = false;
  this.deletedAt = undefined;
  this.deleteReason = '';
  await this.save();
  return { ok: true };
};

/* ------------------------------------------------
 * Indexes
 * ------------------------------------------------ */
ThreadSchema.index({ isPinned: -1, createdAt: -1 });
ThreadSchema.index({ createdAt: -1 });
ThreadSchema.index({ isDeleted: 1, createdAt: -1 });
ThreadSchema.index({ author: 1, createdAt: -1 });
ThreadSchema.index({ realAuthor: 1, createdAt: -1 }); // ✅ admin tracking
ThreadSchema.index({ title: 'text', body: 'text' });  // ✅ full-text search

/* ------------------------------------------------
 * Middleware (optional enhancement)
 * ------------------------------------------------ */
// Automatically mirror author into realAuthor if missing
ThreadSchema.pre('save', function (next) {
  if (!this.realAuthor && this.author) {
    this.realAuthor = this.author;
  }
  next();
});

module.exports = mongoose.models.Thread || mongoose.model('Thread', ThreadSchema);
