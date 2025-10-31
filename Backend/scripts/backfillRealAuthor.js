/**
 * fixAuthorNameFromReal.js
 *
 * For Thread and Comment:
 * - Find docs where author_name is blank/'Unknown'
 * - realAuthor exists
 * - Load realAuthor, then set author_name = realAuthor.name
 *
 * Usage:
 *   node backend/scripts/fixAuthorNameFromReal.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Thread  = require('../Models/Thread');
const Comment = require('../Models/Comment');

async function connectDB() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/board';
  mongoose.set('strictQuery', false);
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected');
}

async function fixThreads() {
  console.log('\nFixing threads author_name...');
  const toFix = await Thread.find({
    author:   { $ne: null },
    realAuthor:{ $ne: null },
    $or: [
      { author_name: { $exists: false } },
      { author_name: '' },
      { author_name: 'Unknown' }
    ]
  }).populate('realAuthor', 'name email').lean();

  console.log(`Found ${toFix.length} threads needing update`);

  for (const t of toFix) {
    const name = t.realAuthor.name || t.realAuthor.email || '';
    if (!name) continue;
    await Thread.updateOne(
      { _id: t._id },
      { $set: { author_name: name } }
    );
    console.log(`Updated Thread ${t._id} => ${name}`);
  }
  console.log('Threads author_name fix done');
}

async function fixComments() {
  console.log('\nFixing comments author_name...');
  const toFix = await Comment.find({
    author: { $ne: null },
    realAuthor: { $ne: null },
    $or: [
      { author_name: { $exists: false } },
      { author_name: '' },
      { author_name: 'Unknown' }
    ]
  }).populate('realAuthor', 'name email').lean();

  console.log(`Found ${toFix.length} comments needing update`);

  for (const c of toFix) {
    const name = c.realAuthor.name || c.realAuthor.email || '';
    if (!name) continue;
    await Comment.updateOne(
      { _id: c._id },
      { $set: { author_name: name } }
    );
    console.log(`Updated Comment ${c._id} => ${name}`);
  }
  console.log('Comments author_name fix done');
}

async function run() {
  try {
    await connectDB();
    await fixThreads();
    await fixComments();
    console.log('\nAll done');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run();
