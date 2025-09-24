// Backend/scripts/make-admin.js
// Usage: node Backend/scripts/make-admin.js you@example.com
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Load your User model
const User = require(path.join(__dirname, '..', 'Models', 'User'));

async function main() {
  const emailArg = process.argv[2];
  if (!emailArg) {
    console.error('❌ Please provide an email.\n   Example: node Backend/scripts/make-admin.js you@example.com');
    process.exit(1);
  }
  const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/board';

  await mongoose.connect(MONGO);
  console.log('✅ Connected to Mongo');

  // find (case-insensitive)
  const emailLC = String(emailArg).toLowerCase();
  const user = await User.findOne({ email: emailLC });

  if (!user) {
    console.error(`❌ No user found with email: ${emailLC}`);
    process.exit(2);
  }

  if (user.role === 'admin') {
    console.log(`ℹ️ User ${user.email} is already an admin.`);
  } else {
    user.role = 'admin';
    await user.save();
    console.log(`🎉 Promoted ${user.email} to admin.`);
  }

  await mongoose.disconnect();
  console.log('🔌 Disconnected. Done.');
  process.exit(0);
}

main().catch(async (err) => {
  console.error('💥 Error:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(3);
});


//  use to create ADMIN node Backend/scripts/make-admin.js email_address