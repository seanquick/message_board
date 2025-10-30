/**
 * backfillRealAuthor.js
 *
 * Populates missing `realAuthor` fields in Threads and Comments
 * by copying the existing `author` value.
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

async function backfillThreads() {
  console.log('\n🔍 Checking threads missing realAuthor...');

  const missing = await Thread.countDocuments({
    $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }]
  });

  if (missing === 0) {
    console.log('✅ All threads already have realAuthor set.');
    return;
  }

  console.log(`⚙️  Found ${missing} threads missing realAuthor. Updating...`);
  const updated = await Thread.updateMany(
    {
      $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }],
      author: { $ne: null }
    },
    [
      {
        $set: { realAuthor: '$author' }
      }
    ]
  );

  console.log(`✅ Updated ${updated.modifiedCount || 0} thread documents.`);
}

async function backfillComments() {
  console.log('\n🔍 Checking comments missing realAuthor...');

  const missing = await Comment.countDocuments({
    $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }]
  });

  if (missing === 0) {
    console.log('✅ All comments already have realAuthor set.');
    return;
  }

  console.log(`⚙️  Found ${missing} comments missing realAuthor. Updating...`);
  const updated = await Comment.updateMany(
    {
      $or: [{ realAuthor: { $exists: false } }, { realAuthor: null }],
      author: { $ne: null }
    },
    [
      {
        $set: { realAuthor: '$author' }
      }
    ]
  );

  console.log(`✅ Updated ${updated.modifiedCount || 0} comment documents.`);
}

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
