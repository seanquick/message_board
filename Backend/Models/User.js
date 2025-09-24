// Backend/Models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name:        { type: String, trim: true, maxlength: 120 },
  email:       { type: String, trim: true, lowercase: true, maxlength: 200, unique: true, index: true },
  // modern password
  passwordHash:{ type: String, select: true },
  // legacy compatibility (may exist in old docs; we never set these in new code)
  password:    { type: String, select: false },
  hash:        { type: String, select: false },

  role:        { type: String, default: 'user' }, // 'user' | 'admin'
  isBanned:    { type: Boolean, default: false },
  tokenVersion:{ type: Number, default: 0 },

  // Admin notes & moderation
  notes:       { type: String, default: '', maxlength: 5000 },

  // Password reset (set by /forgot)
  resetTokenHash: { type: String, select: false },
  resetTokenExp:  { type: Date,   select: false },
}, { timestamps: true });

// Helpful indexes
UserSchema.index({ createdAt: -1 });
UserSchema.index({ role: 1, isBanned: 1 });

// Keep models hot-reload safe
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
