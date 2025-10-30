/**
 * backfillRealAuthor.js
 *
 * Populates missing `realAuthor` fields in Threads and Comments
 * and fixes `isAnonymous` flags where missing or incorrect.
 *
 * Usage:
 *   node backend/scripts/backfillRealAuthor.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Thread = require('../Models/Thread');
const Comment = require('../Models/Comment');

async function connectDB() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/board';
  mongoose.set('strictQuery', false);

  console.log('🟡 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');
}

/* ---------------------------------------------------------
 * THREADS BACKFILL
 * --------------------------------------------------------*/
async function backfillThreads() {
  console.log('\n🔍 Checking threads missing realAuthor or bad isAnonymous...');

  // 1️⃣ Populate missing realAuthor
  const missingRealAuthor = await Thread.countDocuments({
    $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }],
    author: { $ne: null }
  });

  if (missingRealAuthor > 0) {
    console.log(`⚙️  Found ${missingRealAuthor} threads missing realAuthor. Updating...`);
    const updated = await Thread.updateMany(
      {
        $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }],
        author: { $ne: null }
      },
      [
        { $set: { realAuthor: '$author' } }
      ]
    );
    console.log(`✅ Updated ${updated.modifiedCount || 0} threads with realAuthor.`);
  } else {
    console.log('✅ All threads already have realAuthor set.');
  }

  // 2️⃣ Fix missing or incorrect isAnonymous
  const anonCandidates = await Thread.countDocuments({
    $or: [
      { isAnonymous: { $exists: false } },
      { isAnonymous: null },
      { $and: [{ isAnonymous: false }, { author_name: /anonymous/i }] }
    ]
  });

  if (anonCandidates > 0) {
    console.log(`⚙️  Found ${anonCandidates} threads needing isAnonymous fix. Updating...`);
    const updatedAnon = await Thread.updateMany(
      {
        $or: [
          { isAnonymous: { $exists: false } },
          { isAnonymous: null },
          { $and: [{ isAnonymous: false }, { author_name: /anonymous/i }] }
        ]
      },
      { $set: { isAnonymous: true } }
    );
    console.log(`✅ Updated ${updatedAnon.modifiedCount || 0} threads marked as anonymous.`);
  } else {
    console.log('✅ All threads have correct isAnonymous flag.');
  }
}

/* ---------------------------------------------------------
 * COMMENTS BACKFILL
 * --------------------------------------------------------*/
async function backfillComments() {
  console.log('\n🔍 Checking comments missing realAuthor or bad isAnonymous...');

  // 1️⃣ Populate missing realAuthor
  const missingRealAuthor = await Comment.countDocuments({
    $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }],
    author: { $ne: null }
  });

  if (missingRealAuthor > 0) {
    console.log(`⚙️  Found ${missingRealAuthor} comments missing realAuthor. Updating...`);
    const updated = await Comment.updateMany(
      {
        $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }],
        author: { $ne: null }
      },
      [
        { $set: { realAuthor: '$author' } }
      ]
    );
    console.log(`✅ Updated ${updated.modifiedCount || 0} comments with realAuthor.`);
  } else {
    console.log('✅ All comments already have realAuthor set.');
  }

  // 2️⃣ Fix missing or incorrect isAnonymous
  const anonCandidates = await Comment.countDocuments({
    $or: [
      { isAnonymous: { $exists: false } },
      { isAnonymous: null },
      { $and: [{ isAnonymous: false }, { author_name: /anonymous/i }] }
    ]
  });

  if (anonCandidates > 0) {
    console.log(`⚙️  Found ${anonCandidates} comments needing isAnonymous fix. Updating...`);
    const updatedAnon = await Comment.updateMany(
      {
        $or: [
          { isAnonymous: { $exists: false } },
          { isAnonymous: null },
          { $and: [{ isAnonymous: false }, { author_name: /anonymous/i }] }
        ]
      },
      { $set: { isAnonymous: true } }
    );
    console.log(`✅ Updated ${updatedAnon.modifiedCount || 0} comments marked as anonymous.`);
  } else {
    console.log('✅ All comments have correct isAnonymous flag.');
  }
}

/* ---------------------------------------------------------
 * MAIN
 * --------------------------------------------------------*/
async function run() {
  try {
    await connectDB();
    await backfillThreads();
    await backfillComments();
    console.log('\n🎉 Backfill complete!');
  } catch (err) {
    console.error('❌ Backfill failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

run();
