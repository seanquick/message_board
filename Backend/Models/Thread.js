// Backend/Models/Thread.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ThreadSchema = new Schema({
  title:        { type: String, required: true, trim: true, maxlength: 300 },
  body:         { type: String, default: '' },
  // legacy mirror (we keep it in sync when creating new docs)
  content:      { type: String, default: '' },

  // author (canonical) + legacy mirrors
  author:       { type: Schema.Types.ObjectId, ref: 'User', index: true },
  userId:       { type: Schema.Types.ObjectId, ref: 'User' }, // legacy alias
  author_name:  { type: String, default: '' },                // legacy display
  isAnonymous:  { type: Boolean, default: false },

  // votes
  upvoters:     [{ type: Schema.Types.ObjectId, ref: 'User' }],
  upvoteCount:  { type: Number, default: 0 },
  // legacy counters for old clients
  thumbsUp:     { type: Number, default: 0 },
  upvotes:      { type: Number, default: 0 },

  // moderation flags
  isDeleted:    { type: Boolean, default: false },
  deletedAt:    { type: Date },
  deletedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
  deleteReason: { type: String, default: '', maxlength: 2000 },

  // pin/lock (support both modern & legacy flags)
  isPinned:     { type: Boolean, default: false },
  pinned:       { type: Boolean, default: false }, // legacy
  isLocked:     { type: Boolean, default: false },
  locked:       { type: Boolean, default: false }, // legacy
}, { timestamps: true, minimize: false });

// ---------------- Methods ----------------
ThreadSchema.methods.toggleUpvote = async function(userId) {
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
  this.thumbsUp    = n; // keep legacy in sync
  this.upvotes     = n;

  await this.save();
  return { upvoted, upvoteCount: n };
};

ThreadSchema.methods.softDelete = async function(actorId, reason='') {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = actorId || this.deletedBy;
  this.deleteReason = reason || this.deleteReason || '';
  await this.save();
  return { ok: true };
};

ThreadSchema.methods.restore = async function() {
  this.isDeleted = false;
  this.deletedAt = undefined;
  this.deleteReason = '';
  await this.save();
  return { ok: true };
};

// ---------------- Indexes ----------------
ThreadSchema.index({ isPinned: -1, createdAt: -1 }); // pinned first, newest next
ThreadSchema.index({ createdAt: -1 });
ThreadSchema.index({ isDeleted: 1, createdAt: -1 });
ThreadSchema.index({ author: 1, createdAt: -1 });

module.exports = mongoose.models.Thread || mongoose.model('Thread', ThreadSchema);
