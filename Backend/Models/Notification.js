// Backend/Models/Notification.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Notification schema
 * - Used to alert users (especially admins) about events
 * - Supports read tracking, rich metadata, and frontend links
 */

const NotificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  type:    { type: String, default: '' }, // e.g., 'report_created', 'report_resolved'
  title:   { type: String, default: '', maxlength: 200 },
  body:    { type: String, default: '', maxlength: 5000 },
  link:    { type: String, default: '' }, // URL to frontend page
  meta:    { type: Schema.Types.Mixed, default: {} },

  readAt:  { type: Date, default: null }, // null = unread
}, {
  timestamps: true,
  minimize: false,
  versionKey: false,
});

// Efficient querying
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 }); // unread first
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
