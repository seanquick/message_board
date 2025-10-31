/**
 * fixUnknownAuthors.js
 *
 * Fixes entries in Threads and Comments where author_name is blank or "Unknown"
 * – If isAnonymous is true: set author_name = "Anonymous"
 * – Else if realAuthor exists: set author_name = realAuthor.name
 *
 * Usage:
 *   node backend/scripts/fixUnknownAuthors.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Thread  = require('../Models/Thread');
const Comment = require('../Models/Comment');

async function connectDB() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/board';
  mongoose.set('strictQuery', false);
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

async function fixThreads() {
  console.log('\nFixing Threads author_name...');

  // Case 1: anonymous posts with missing / “Unknown” author_name
  const anonFix = await Thread.updateMany(
    {
      isAnonymous: true,
      $or: [
        { author_name: { $exists: false } },
        { author_name: '' },
        { author_name: 'Unknown' }
      ]
    },
    { $set: { author_name: 'Anonymous' } }
  );
  console.log(`✔ Anonymous author_name updated on threads: ${anonFix.modifiedCount || anonFix.nModified || 0}`);

  // Case 2: non‑anonymous posts missing author_name but have realAuthor
  const realFix = await Thread.updateMany(
    {
      isAnonymous: { $ne: true },
      $or: [
        { author_name: { $exists: false } },
        { author_name: '' },
        { author_name: 'Unknown' }
      ],
      realAuthor: { $exists: true, $ne: null }
    },
    [
      { $set: { author_name: '$realAuthor.name' } }
    ]
  );
  console.log(`✔ Author_name backfilled from realAuthor on threads: ${realFix.modifiedCount || realFix.nModified || 0}`);
}

async function fixComments() {
  console.log('\nFixing Comments author_name...');

  const anonFix = await Comment.updateMany(
    {
      isAnonymous: true,
      $or: [
        { author_name: { $exists: false } },
        { author_name: '' },
        { author_name: 'Unknown' }
      ]
    },
    { $set: { author_name: 'Anonymous' } }
  );
  console.log(`✔ Anonymous author_name updated on comments: ${anonFix.modifiedCount || anonFix.nModified || 0}`);

  const realFix = await Comment.updateMany(
    {
      isAnonymous: { $ne: true },
      $or: [
        { author_name: { $exists: false } },
        { author_name: '' },
        { author_name: 'Unknown' }
      ],
      realAuthor: { $exists: true, $ne: null }
    },
    [
      { $set: { author_name: '$realAuthor.name' } }
    ]
  );
  console.log(`✔ Author_name backfilled from realAuthor on comments: ${realFix.modifiedCount || realFix.nModified || 0}`);
}

async function run() {
  try {
    await connectDB();
    await fixThreads();
    await fixComments();
    console.log('\n✅ Fix‑UnknownAuthors is complete');
  } catch (err) {
    console.error('❌ Error in fixUnknownAuthors:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

run();
