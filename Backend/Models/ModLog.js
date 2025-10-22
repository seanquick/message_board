// Backend/Models/ModLog.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Helpers
const toStr   = (v) => (v == null ? '' : String(v));
const toLower = (v) => toStr(v).toLowerCase();
const IdMixed = Schema.Types.Mixed;

/**
 * ModLog — generic moderation & admin audit logs.
 *
 * Supports all moderation types: thread, comment, report, user.
 * Allows rich metadata (before/after snapshots, links, actions).
 */
const ModLogSchema = new Schema({
  type:       { type: String, required: true },  // e.g. 'thread_locked'
  targetType: { type: String, required: true },  // 'thread' | 'comment' | 'report' | 'user'
  targetId:   { type: IdMixed, required: true }, // ObjectId or string
  actorId:    { type: IdMixed, required: true }, // Admin/mod ID
  note:       { type: String, default: '' },
  meta:       { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  minimize: true,
  versionKey: false,
});

// Indexes for fast admin queries
ModLogSchema.index({ createdAt: -1 });
ModLogSchema.index({ type: 1, createdAt: -1 });
ModLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
ModLogSchema.index({ actorId: 1, createdAt: -1 });

// Normalize fields
ModLogSchema.path('type').set(toLower);
ModLogSchema.path('targetType').set(toLower);

/* ===================== STATIC HELPERS ===================== */

/** Thread action log (e.g., pin, lock, delete) */
ModLogSchema.statics.logThreadAction = async function ({
  threadId,
  action,
  adminId,
  note = '',
  before = {},
  after = {},
}) {
  if (!threadId || !action || !adminId) return null;

  const typeMap = {
    pin:     'thread_pinned',
    unpin:   'thread_unpinned',
    lock:    'thread_locked',
    unlock:  'thread_unlocked',
    delete:  'thread_deleted',
    restore: 'thread_restored',
  };
  const type = typeMap[action] || `thread_${toLower(action)}`;
  const bool = (v) => v === true;

  return this.create({
    type,
    targetType: 'thread',
    targetId: threadId,
    actorId: adminId,
    note: toStr(note).slice(0, 2000),
    meta: {
      before: {
        pinned:  bool(before.isPinned || before.pinned),
        locked:  bool(before.isLocked || before.locked),
        deleted: bool(before.isDeleted),
      },
      after: {
        pinned:  bool(after.isPinned || after.pinned),
        locked:  bool(after.isLocked || after.locked),
        deleted: bool(after.isDeleted),
      },
    },
  });
};

/** Report resolution log */
ModLogSchema.statics.logReportResolved = async function ({
  reportId,
  adminId,
  note = '',
  link = '',
  targetType = '',
  targetId = '',
  bulk = false,
}) {
  if (!reportId || !adminId) return null;

  return this.create({
    type: 'report_resolved',
    targetType: 'report',
    targetId: reportId,
    actorId: adminId,
    note: toStr(note).slice(0, 2000),
    meta: {
      link: toStr(link),
      targetType: toLower(targetType),
      targetId,
      bulk: !!bulk,
    },
  });
};

/** Bulk report resolution log */
ModLogSchema.statics.logReportsBulkResolved = async function ({
  reportIds = [],
  adminId,
  note = '',
}) {
  if (!adminId || !Array.isArray(reportIds) || reportIds.length === 0) return null;

  return this.create({
    type: 'reports_bulk_resolved',
    targetType: 'report',
    targetId: 'bulk',
    actorId: adminId,
    note: toStr(note).slice(0, 2000),
    meta: {
      idsSample: reportIds.map(String).slice(0, 10),
      idsCount: reportIds.length,
      bulk: true,
    },
  });
};

/** Comment moderation log */
ModLogSchema.statics.logCommentAction = async function ({
  commentId,
  action,
  adminId,
  note = '',
  before = {},
  after = {},
}) {
  if (!commentId || !action || !adminId) return null;

  const typeMap = {
    delete:  'comment_deleted',
    restore: 'comment_restored',
  };
  const type = typeMap[action] || `comment_${toLower(action)}`;
  const bool = (v) => v === true;

  return this.create({
    type,
    targetType: 'comment',
    targetId: commentId,
    actorId: adminId,
    note: toStr(note).slice(0, 2000),
    meta: {
      before: { deleted: bool(before.isDeleted) },
      after:  { deleted: bool(after.isDeleted) },
    },
  });
};

/** User ban/unban log */
ModLogSchema.statics.logUserBanToggle = async function ({
  userId,
  adminId,
  isBanned,
  note = '',
}) {
  if (!userId || !adminId) return null;

  return this.create({
    type: isBanned ? 'user_banned' : 'user_unbanned',
    targetType: 'user',
    targetId: userId,
    actorId: adminId,
    note: toStr(note).slice(0, 2000),
    meta: { isBanned: !!isBanned },
  });
};

module.exports = mongoose.models.ModLog || mongoose.model('ModLog', ModLogSchema);
