// scripts/seed-admin.js
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../Backend/Models/User');

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI missing in .env');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, family: 4 });

    // CLI overrides env:
    const email = getArg('--email') || process.env.SEED_ADMIN_EMAIL;
    const name = getArg('--name') || process.env.SEED_ADMIN_NAME || 'Admin';
    const password = getArg('--password') || process.env.SEED_ADMIN_PASSWORD;

    if (!email) throw new Error('Provide --email or SEED_ADMIN_EMAIL');
    const createIfMissing = process.argv.includes('--create');

    let user = await User.findOne({ email });
    if (!user && createIfMissing) {
      if (!password) throw new Error('Provide --password or SEED_ADMIN_PASSWORD to create a new admin');
      user = new User({ name, email, role: 'admin', isBanned: false });
      // try to set password in a compatible way
      if (typeof user.setPassword === 'function') {
        await user.setPassword(password);
      } else if ('passwordHash' in user) {
        const bcrypt = require('bcryptjs');
        user.passwordHash = await bcrypt.hash(password, 12);
      } else if ('password' in user) {
        user.password = password; // rely on schema pre-save hook if any
      } else {
        console.warn('⚠️ Could not find password field; creating admin without password');
      }
      await user.save();
      console.log(`✅ Created admin ${email}`);
    } else if (!user) {
      throw new Error(`User ${email} not found. Re-run with --create to create.`);
    } else {
      console.log(`ℹ️ Found existing user ${email}`);
    }

    // Promote + unban + rotate tokenVersion
    user.role = 'admin';
    user.isBanned = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    console.log(`✅ ${email} is now admin (tokenVersion bumped)`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('❌ seed-admin failed:', e.message);
    process.exit(1);
  }
})();
