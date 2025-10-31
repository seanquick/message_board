// backend/scripts/backfillRealAuthor.js

const mongoose = require('mongoose');
const Thread = require('../Models/Thread');
const Comment = require('../Models/Comment');
const User = require('../Models/User');
const MONGO_URI = 'mongodb+srv://USERNAME:PASSWORD@cluster0.mongodb.net/message-board';


(async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected\n');

  // ----------------------------------------
  // 🧵 THREADS
  // ----------------------------------------
  console.log('Fixing threads author_name & realAuthor...');
  const threads = await Thread.find({
    $or: [
      { author_name: { $in: [null, '', 'Unknown'] } },
      { realAuthor: { $exists: false } },
      { realAuthor: null },
      { author: { $exists: false } },
      { author: null }
    ]
  });

  let updatedThreads = 0;

  for (const thread of threads) {
    const userId = thread.author || thread.userId;
    if (!userId) continue;

    const user = await User.findById(userId);
    if (!user) continue;

    let changed = false;

    if (!thread.author) {
      thread.author = user._id;
      changed = true;
    }

    if (!thread.realAuthor) {
      thread.realAuthor = user._id;
      changed = true;
    }

    if (!thread.author_name || thread.author_name === 'Unknown' || thread.author_name === '') {
      thread.author_name = user.name || user.email || 'Anonymous';
      changed = true;
    }

    if (changed) {
      await thread.save();
      updatedThreads++;
    }
  }

  console.log(`Updated ${updatedThreads} thread(s)\n`);

  // ----------------------------------------
  // 💬 COMMENTS
  // ----------------------------------------
  console.log('Fixing comments author_name & realAuthor...');
  const comments = await Comment.find({
    $or: [
      { author_name: { $in: [null, '', 'Unknown'] } },
      { realAuthor: { $exists: false } },
      { realAuthor: null },
      { author: { $exists: false } },
      { author: null }
    ]
  });

  let updatedComments = 0;

  for (const comment of comments) {
    const userId = comment.author || comment.userId;
    if (!userId) continue;

    const user = await User.findById(userId);
    if (!user) continue;

    let changed = false;

    if (!comment.author) {
      comment.author = user._id;
      changed = true;
    }

    if (!comment.realAuthor) {
      comment.realAuthor = user._id;
      changed = true;
    }

    if (!comment.author_name || comment.author_name === 'Unknown' || comment.author_name === '') {
      comment.author_name = user.name || user.email || 'Anonymous';
      changed = true;
    }

    if (changed) {
      await comment.save();
      updatedComments++;
    }
  }

  console.log(`Updated ${updatedComments} comment(s)\n`);

  // ----------------------------------------
  console.log('✅ Backfill complete');
  mongoose.disconnect();
})();
