// scripts/ensure-indexes.js
require('dotenv').config();
const mongoose = require('mongoose');

const modelsToLoad = [
  '../Backend/Models/User',
  '../Backend/Models/Thread',
  '../Backend/Models/Comment',
  '../Backend/Models/Report',
  '../Backend/Models/Notification',
  '../Backend/Models/ModLog',
];

(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI missing in .env');
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, family: 4 });
    console.log('✅ Mongo connected');

    const loaded = [];
    for (const m of modelsToLoad) {
      try {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const Model = require(m);
        if (Model?.syncIndexes) {
          console.log(`→ syncing indexes for ${Model.modelName}`);
          await Model.syncIndexes(); // creates + drops extra (safe if your schemas are correct)
        } else if (Model?.createIndexes) {
          console.log(`→ creating indexes for ${Model.modelName}`);
          await Model.createIndexes();
        }
        loaded.push(Model?.modelName || m);
      } catch (e) {
        console.warn(`(skip) could not load ${m}: ${e.message}`);
      }
    }

    console.log(`✅ Done. Indexed models: ${loaded.join(', ')}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('❌ ensure-indexes failed:', e);
    process.exit(1);
  }
})();
