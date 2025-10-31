// backend/scripts/backfillRealAuthor.js

require('dotenv').config();
const mongoose = require('mongoose');
const Thread = require('../Models/Thread');
const Comment = require('../Models/Comment');
const User = require('../Models/User');

// Use .env or fallback
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/message-board';

(async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected\n');

    // -------------------------------
    // 🧵 THREADS
    // -------------------------------
    console.log('Fixing threads...');

    const threads = await Thread.find({
      $or: [
        { author_name: { $in: [null, '', 'Unknown'] } },
        { realAuthor: { $exists: false } },
        { realAuthor: null },
        { author: null }
      ]
    });

    let updatedThreads = 0;

    for (const thread of threads) {
      const userId = thread.author || thread.userId || thread.realAuthor;
      if (!userId || thread.isAnonymous) continue;

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

      const displayName = user.name || user.email || 'Anonymous';
      if (!thread.author_name || thread.author_name === 'Unknown' || thread.author_name === '') {
        thread.author_name = displayName;
        changed = true;
      }

      if (changed) {
        await thread.save();
        updatedThreads++;
      }
    }

    console.log(`Updated ${updatedThreads} thread(s)`);

    // -------------------------------
    // 💬 COMMENTS
    // -------------------------------
    console.log('\nFixing comments...');

    const comments = await Comment.find({
      $or: [
        { author_name: { $in: [null, '', 'Unknown'] } },
        { realAuthor: { $exists: false } },
        { realAuthor: null },
        { author: null }
      ]
    });

    let updatedComments = 0;

    for (const comment of comments) {
      const userId = comment.author || comment.userId || comment.realAuthor;
      if (!userId || comment.isAnonymous) continue;

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

      const displayName = user.name || user.email || 'Anonymous';
      if (!comment.author_name || comment.author_name === 'Unknown' || comment.author_name === '') {
        comment.author_name = displayName;
        changed = true;
      }

      if (changed) {
        await comment.save();
        updatedComments++;
      }
    }

    console.log(`Updated ${updatedComments} comment(s)\n`);

    console.log('✅ Backfill complete');
    await mongoose.disconnect();
    console.log('Disconnected');
  } catch (err) {
    console.error('❌ Backfill failed:', err);
    process.exit(1);
  }
})();
