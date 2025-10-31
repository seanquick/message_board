/**
 * fullBackfillAll.js
 *
 * • Populates missing realAuthor fields for threads + comments  
 * • Fixes isAnonymous flags based on presence/author_name  
 * • Backfills author_name where blank or “Unknown”  
 * • Ensures legacy fields are mirrored where needed
 *
 * Usage:
 *   node backend/scripts/fullBackfillAll.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Thread  = require('../Models/Thread');
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
  console.log('\n🔍 THREADS: Backfilling...');

  // 1) realAuthor from author
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
      { $set: { realAuthor: '$author' } }
    );
    console.log(`✅ Updated realAuthor on threads: ${res.modifiedCount || res.nModified || 0}`);
  } else {
    console.log('✅ All threads already have realAuthor');
  }

  // 2) Fix isAnonymous flag
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
    console.log('✅ Threads have correct isAnonymous flag');
  }

  // 3) Backfill author_name from realAuthor if missing
  const missingAN = await Thread.countDocuments({
    $or: [{ author_name: { $exists: false } }, { author_name: '' }, { author_name: 'Unknown' }],
    author: { $ne: null }
  });
  if (missingAN > 0) {
    console.log(`⚙️  Threads missing author_name: ${missingAN}`);
    const res3 = await Thread.updateMany(
      {
        $or: [{ author_name: { $exists: false } }, { author_name: '' }, { author_name: 'Unknown' }],
        author: { $ne: null }
      },
      { $set: { author_name: '$realAuthor.name' } }
    );
    console.log(`✅ Updated author_name on threads: ${res3.modifiedCount || res3.nModified || 0}`);
  } else {
    console.log('✅ Threads have author_name set');
  }
}


/* ---------------------------------------------------------
 * COMMENTS BACKFILL
 * --------------------------------------------------------*/
async function backfillComments() {
  console.log('\n🔍 COMMENTS: Backfilling...');

  // 1) realAuthor from author
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
    console.log('✅ All comments already have realAuthor');
  }

  // 2) Fix isAnonymous flag
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
    console.log('✅ Comments have correct isAnonymous flag');
  }

  // 3) Backfill author_name from realAuthor if missing
  const missingAN = await Comment.countDocuments({
    $or: [{ author_name: { $exists: false } }, { author_name: '' }, { author_name: 'Unknown' }],
    author: { $ne: null }
  });
  if (missingAN > 0) {
    console.log(`⚙️  Comments missing author_name: ${missingAN}`);
    const res3 = await Comment.updateMany(
      {
        $or: [{ author_name: { $exists: false } }, { author_name: '' }, { author_name: 'Unknown' }],
        author: { $ne: null }
      },
      { $set: { author_name: '$realAuthor.name' } }
    );
    console.log(`✅ Updated author_name on comments: ${res3.modifiedCount || res3.nModified || 0}`);
  } else {
    console.log('✅ Comments have author_name set');
  }
}

async function runAll() {
  try {
    await connectDB();
    await backfillThreads();
    await backfillComments();
    console.log('\n🎉 FULL BACKFILL COMPLETE!');
  } catch (err) {
    console.error('❌ Backfill failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

runAll();
