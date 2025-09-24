// Backend/Models/ModLog.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Small normalizers
const toStr = (v) => (v == null ? '' : String(v));
const toLower = (v) => toStr(v).toLowerCase();

// Flexible ID type: allow ObjectId or string (for legacy data)
const IdMixed = Schema.Types.Mixed;

/**
 * ModLog — generic moderation / audit log
 *
 * Examples:
 *  - Thread pin:   { type: 'thread_pinned',   targetType: 'thread', targetId, actorId, note, meta:{before,after} }
 *  - Thread lock:  { type: 'thread_locked',   targetType: 'thread', targetId, actorId, note, meta:{before,after} }
 *  - Soft delete:  { type: 'thread_deleted',  targetType: 'thread', targetId, actorId, note, meta:{before,after} }
 *  - Report done:  { type: 'report_resolved', targetType: 'report', targetId:<reportId>, actorId, note, meta:{link,targetType,targetId} }
 *  - Comment del:  { type: 'comment_deleted', targetType: 'comment', targetId, actorId, note, meta:{before,after} }
 *  - User ban:     { type: 'user_banned',     targetType: 'user',   targetId:<userId>, actorId, note }
 */
const ModLogSchema = new Schema(
  {
    type:       { type: String, required: true },  // e.g., 'thread_locked', 'report_resolved'
    targetType: { type: String, required: true },  // 'report' | 'thread' | 'comment' | 'user'
    targetId:   { type: IdMixed, required: true }, // ObjectId or string
    actorId:    { type: IdMixed, required: true }, // admin/mod user id (ObjectId or string)
    note:       { type: String, default: '' },
    meta:       { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    minimize: true,
    versionKey: false,
  }
);

/* ------------------------------- Indexes ------------------------------- */
ModLogSchema.index({ createdAt: -1 });
ModLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
ModLogSchema.index({ type: 1, createdAt: -1 });
// helpful when filtering by moderator
ModLogSchema.index({ actorId: 1, createdAt: -1 });

/* ------------------------------- Setters ------------------------------- */
ModLogSchema.path('type').set(toLower);
ModLogSchema.path('targetType').set(toLower);

/* ------------------------------ Statics -------------------------------- */
/**
 * Log a thread moderation action with before/after flags.
 * action: 'pin'|'unpin'|'lock'|'unlock'|'delete'|'restore'
 * meta.before/after: { pinned?:bool, locked?:bool, deleted?:bool }
 */
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
  const safeBefore = {
    pinned:  bool(!!(before.isPinned || before.pinned)),
    locked:  bool(!!(before.isLocked || before.locked)),
    deleted: bool(!!before.isDeleted),
  };
  const safeAfter = {
    pinned:  bool(!!(after.isPinned || after.pinned)),
    locked:  bool(!!(after.isLocked || after.locked)),
    deleted: bool(!!after.isDeleted),
  };

  return this.create({
    type,
    targetType: 'thread',
    targetId: threadId,
    actorId: adminId,
    note: toStr(note).slice(0, 2000),
    meta: { before: safeBefore, after: safeAfter },
  });
};

/**
 * Log a report resolution event.
 * Example meta: { link, targetType:'thread'|'comment', targetId:<contentId> }
 */
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
      targetType: toLower(targetType || ''),
      targetId: targetId || '',
      bulk: !!bulk,
    },
  });
};

/**
 * OPTIONAL helper: log multiple reports resolved in one action (single log entry).
 * Stores just counts and a few ids to keep meta small.
 */
ModLogSchema.statics.logReportsBulkResolved = async function ({
  reportIds = [],
  adminId,
  note = '',
}) {
  if (!adminId || !Array.isArray(reportIds) || reportIds.length === 0) return null;
  const ids = reportIds.map(String);
  return this.create({
    type: 'reports_bulk_resolved',
    targetType: 'report',
    targetId: 'bulk',
    actorId: adminId,
    note: toStr(note).slice(0, 2000),
    meta: { idsSample: ids.slice(0, 10), idsCount: ids.length, bulk: true },
  });
};

/**
 * OPTIONAL helper: log a comment moderation action (delete/restore)
 * action: 'delete'|'restore'
 */
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
  const safeBefore = { deleted: bool(!!before.isDeleted) };
  const safeAfter  = { deleted: bool(!!after.isDeleted) };

  return this.create({
    type,
    targetType: 'comment',
    targetId: commentId,
    actorId: adminId,
    note: toStr(note).slice(0, 2000),
    meta: { before: safeBefore, after: safeAfter },
  });
};

/**
 * OPTIONAL helper: log user ban toggles.
 */
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
