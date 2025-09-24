// Backend/Models/Report.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * We deliberately DO NOT enforce enums on `status` or `category`
 * to avoid validation errors from older clients. Admin code already
 * tolerates arbitrary values and groups “open-like” vs “resolved-like”.
 */
const ReportSchema = new Schema({
  targetType:   { type: String, required: true, enum: ['thread','comment','user'] },
  targetId:     { type: Schema.Types.Mixed, required: true }, // ObjectId or string
  reporterId:   { type: Schema.Types.ObjectId, ref: 'User' },

  // reason details (user-provided)
  category:     { type: String, default: '', maxlength: 100 }, // ex: 'spam','harassment','hate','other', etc.
  reason:       { type: String, default: '', maxlength: 2000 },
  details:      { type: String, default: '', maxlength: 4000 },

  // workflow
  status:       { type: String, default: 'open' }, // 'open' | 'resolved' | etc.
  resolutionNote:{ type: String, default: '', maxlength: 10000 },
  resolvedAt:   { type: Date },
  resolvedBy:   { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedByName:  { type: String, default: '' },
  resolvedByEmail: { type: String, default: '' },
}, { timestamps: true, minimize: false });

// helpful indexes
ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
ReportSchema.index({ reporterId: 1, createdAt: -1 });
ReportSchema.index({ category: 1, createdAt: -1 });
ReportSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Report || mongoose.model('Report', ReportSchema);
