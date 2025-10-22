// Backend/Models/Report.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Report schema – supports threads, comments, users.
 * 
 * Notes:
 * - We tolerate flexible values for `status` and `category`
 *   for backward compatibility and client flexibility.
 * - Admin panel logic handles grouping and filtering.
 */

const ReportSchema = new Schema({
  // Required target info
  targetType: { type: String, required: true, enum: ['thread', 'comment', 'user'] },
  targetId:   { type: Schema.Types.Mixed, required: true }, // ObjectId or string for flexibility
  reporterId: { type: Schema.Types.ObjectId, ref: 'User' },

  // Optional user-provided reason and details
  category:   { type: String, default: '', maxlength: 100 },
  reason:     { type: String, default: '', maxlength: 2000 },
  details:    { type: String, default: '', maxlength: 4000 },

  // Moderation workflow
  status:     { type: String, default: 'open' }, // flexible: open, resolved, etc.
  resolutionNote:   { type: String, default: '', maxlength: 10000 },
  resolvedAt:       { type: Date },
  resolvedBy:       { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedByName:   { type: String, default: '' },
  resolvedByEmail:  { type: String, default: '' },
}, {
  timestamps: true,
  minimize: false,
  versionKey: false,
});

// Helpful indexes for admin filtering
ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
ReportSchema.index({ reporterId: 1, createdAt: -1 });
ReportSchema.index({ category: 1, createdAt: -1 });
ReportSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Report || mongoose.model('Report', ReportSchema);
