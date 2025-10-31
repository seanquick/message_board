/**
 * fullBackfill.js
 *
 * Backfills:
 *  - realAuthor from author (threads & comments)
 *  - isAnonymous flag based on author_name or missing
 *  - author_name where blank but author exists
 *
 * Usage:
 *   node backend/scripts/fullBackfill.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Thread  = require('../Models/Thread');
const Comment = require('../Models/Comment');

async function connectDB() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/yourdb';
  mongoose.set('strictQuery', false);
  console.log('🟡 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');
}

async function backfillThreads() {
  console.log('\n🔍 THREADS: Backfilling missing fields...');

  // realAuthor
  const missingRA = await Thread.countDocuments({
    $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }],
    author: { $ne: null }
  });
  if (missingRA > 0) {
    console.log(`⚙️  Threads missing realAuthor: ${missingRA}`);
    const res = await Thread.updateMany(
      {
        $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }],
        author: { $ne: null }
      },
      { $set: { realAuthor: '$author' } }  // Note: mongodb pipeline syntax may require using native collection; adjust if needed
    );
    console.log(`✅ Updated realAuthor on threads: ${res.modifiedCount || res.nModified || 0}`);
  } else {
    console.log('✅ No threads missing realAuthor');
  }

  // isAnonymous
  const anonCandidates = await Thread.countDocuments({
    $or: [
      { isAnonymous: { $exists: false } },
      { isAnonymous: null },
      { $and: [{ isAnonymous: false }, { author_name: /anonymous/i }] }
    ]
  });
  if (anonCandidates > 0) {
    console.log(`⚙️  Threads needing isAnonymous fix: ${anonCandidates}`);
    const res2 = await Thread.updateMany(
      {
        $or: [
          { isAnonymous: { $exists: false } },
          { isAnonymous: null },
          { $and: [{ isAnonymous: false }, { author_name: /anonymous/i }] }
        ]
      },
      { $set: { isAnonymous: true } }
    );
    console.log(`✅ Updated isAnonymous on threads: ${res2.modifiedCount || res2.nModified || 0}`);
  } else {
    console.log('✅ All threads have correct isAnonymous');
  }

  // author_name
  const missingAN = await Thread.countDocuments({
    $or: [{ author_name: { $exists: false } }, { author_name: '' }],
    author: { $ne: null }
  });
  if (missingAN > 0) {
    console.log(`⚙️  Threads missing author_name: ${missingAN}`);
    const res3 = await Thread.updateMany(
      {
        $or: [{ author_name: { $exists: false } }, { author_name: '' }],
        author: { $ne: null }
      },
      [
        { $set: { author_name: '$realAuthor.name' } }
      ]
    );
    console.log(`✅ Updated author_name on threads: ${res3.modifiedCount || res3.nModified || 0}`);
  } else {
    console.log('✅ All threads have author_name set');
  }
}

async function backfillComments() {
  console.log('\n🔍 COMMENTS: Backfilling missing fields...');

  // realAuthor
  const missingRA = await Comment.countDocuments({
    $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }],
    author: { $ne: null }
  });
  if (missingRA > 0) {
    console.log(`⚙️  Comments missing realAuthor: ${missingRA}`);
    const res = await Comment.updateMany(
      {
        $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }],
        author: { $ne: null }
      },
      { $set: { realAuthor: '$author' } }
    );
    console.log(`✅ Updated realAuthor on comments: ${res.modifiedCount || res.nModified || 0}`);
  } else {
    console.log('✅ No comments missing realAuthor');
  }

  // isAnonymous
  const anonCandidates = await Comment.countDocuments({
    $or: [
      { isAnonymous: { $exists: false } },
      { isAnonymous: null },
      { $and: [{ isAnonymous: false }, { author_name: /anonymous/i }] }
    ]
  });
  if (anonCandidates > 0) {
    console.log(`⚙️  Comments needing isAnonymous fix: ${anonCandidates}`);
    const res2 = await Comment.updateMany(
      {
        $or: [
          { isAnonymous: { $exists: false } },
          { isAnonymous: null },
          { $and: [{ isAnonymous: false }, { author_name: /anonymous/i }] }
        ]
      },
      { $set: { isAnonymous: true } }
    );
    console.log(`✅ Updated isAnonymous on comments: ${res2.modifiedCount || res2.nModified || 0}`);
  } else {
    console.log('✅ All comments have correct isAnonymous');
  }

  // author_name
  const missingAN = await Comment.countDocuments({
    $or: [{ author_name: { $exists: false } }, { author_name: '' }],
    author: { $ne: null }
  });
  if (missingAN > 0) {
    console.log(`⚙️  Comments missing author_name: ${missingAN}`);
    const res3 = await Comment.updateMany(
      {
        $or: [{ author_name: { $exists: false } }, { author_name: '' }],
        author: { $ne: null }
      },
      [
        { $set: { author_name: '$realAuthor.name' } }
      ]
    );
    console.log(`✅ Updated author_name on comments: ${res3.modifiedCount || res3.nModified || 0}`);
  } else {
    console.log('✅ All comments have author_name set');
  }
}

async function run() {
  try {
    await connectDB();
    await backfillThreads();
    await backfillComments();
    console.log('\n🎉 Full backfill complete!');
  } catch (err) {
    console.error('❌ Backfill error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

run();
