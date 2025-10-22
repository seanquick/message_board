// Backend/Models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name:         { type: String, trim: true, maxlength: 120 },
  email:        { type: String, trim: true, lowercase: true, maxlength: 200, unique: true, index: true },
  
  // Modern password field
  passwordHash: { type: String, select: true },
  
  // Legacy compatibility
  password:     { type: String, select: false },
  hash:         { type: String, select: false },

  role:         { type: String, enum: ['user','admin'], default: 'user', index: true },

  isBanned:     { type: Boolean, default: false, index: true },
  tokenVersion: { type: Number, default: 0 },

  // Admin/moderation notes
  notes:        { type: String, default: '', maxlength: 5000 },

  // Password reset
  resetTokenHash: { type: String, select: false },
  resetTokenExp:  { type: Date,   select: false },

  // Optional audit info (added)
  lastActionAt:  { type: Date },
  lastActionBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Optional soft delete
  deletedAt:     { type: Date },
  deletedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Indexes
UserSchema.index({ createdAt: -1 });
UserSchema.index({ role: 1, isBanned: 1 });
UserSchema.index({ deletedAt: 1 });

// Hot‑reload safe
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
