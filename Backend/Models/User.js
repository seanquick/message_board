// Backend/Models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  /* ──────────────── CORE ACCOUNT INFO ──────────────── */
  name:         { type: String, trim: true, maxlength: 120 },
  email:        { type: String, trim: true, lowercase: true, maxlength: 200, unique: true, index: true },

  /* ──────────────── AUTH / SECURITY ──────────────── */
  passwordHash: { type: String, select: true },
  password:     { type: String, select: false },
  hash:         { type: String, select: false },

  role:         { type: String, enum: ['user', 'admin'], default: 'user', index: true },
  isBanned:     { type: Boolean, default: false, index: true },
  tokenVersion: { type: Number, default: 0 },

  /* ──────────────── ADMIN / MODERATION ──────────────── */
  notes:        { type: String, default: '', maxlength: 5000 },

  /* ──────────────── PASSWORD RESET ──────────────── */
  resetTokenHash: { type: String, select: false },
  resetTokenExp:  { type: Date,   select: false },

  /* ──────────────── EMAIL VERIFICATION ──────────────── */
  // ✅ Add these NEW fields:
  emailVerified:     { type: Boolean, default: false },
  emailVerifyToken:  { type: String, select: false },
  emailVerifyExpires:{ type: Date,   select: false },

  /* ──────────────── AUDIT INFO ──────────────── */
  lastActionAt:  { type: Date },
  lastActionBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  /* ──────────────── SOFT DELETE ──────────────── */
  deletedAt:     { type: Date },
  deletedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  /* ──────────────── PUBLIC PROFILE FIELDS ──────────────── */
  displayName:   { type: String, default: '', trim: true, maxlength: 100 },
  bio:           { type: String, default: '', maxlength: 1000 },
  favoriteQuote: { type: String, default: '', maxlength: 500 },

  // Privacy settings
  profilePublic: { type: Boolean, default: false },
  emailPublic:   { type: Boolean, default: false },
}, { timestamps: true });

/* ──────────────── INDEXES ──────────────── */
UserSchema.index({ createdAt: -1 });
UserSchema.index({ role: 1, isBanned: 1 });
UserSchema.index({ deletedAt: 1 });

/* ──────────────── EXPORT ──────────────── */
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
