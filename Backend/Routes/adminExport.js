// Backend/Routes/adminExport.js
const express = require('express');
const router = express.Router();
const { Thread } = require('../Models/Thread');
const { Comment } = require('../Models/Comment');
const { User } = require('../Models/User');
const { Report } = require('../Models/Report');
const { ModLog } = require('../Models/ModLog');
const { requireAdmin } = require('./_middleware');  // assuming you have middleware to assert admin
const JSONStream = require('JSONStream');  // streaming JSON
const { pipeline } = require('stream');
const csvStringify = require('csv-stringify');

function streamModel(req, res, Model, fields, format = 'json', rootName = null) {
  // format = 'json' or 'csv'
  const cursor = Model.find().lean().cursor();
  if (format === 'json') {
    // send as JSON array
    res.setHeader('Content-Type', 'application/json');
    // wrap with [ ... ]
    res.write('[');
    let first = true;
    cursor.on('data', doc => {
      const chunk = (first ? '' : ',') + JSON.stringify(doc, fields);
      first = false;
      res.write(chunk);
    });
    cursor.once('end', () => {
      res.write(']');
      res.end();
    });
    cursor.once('error', err => {
      console.error('Export JSON stream error:', err);
      res.status(500).end();
    });
  } else if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    const stringifier = csvStringify({
      header: true,
      columns: fields
    });
    // pipeline cursor → transform → stringifier → res
    pipeline(
      cursor,
      async function* (src) {
        for await (const doc of src) {
          // pick only needed fields
          const out = {};
          for (const f of fields) out[f] = doc[f];
          yield out;
        }
      },
      stringifier,
      res,
      (err) => {
        if (err) {
          console.error('CSV export pipeline failed', err);
        }
      }
    );
  }
}

// GET /api/admin/export/:model?format=csv|json
router.get('/export/:model', requireAdmin, async (req, res) => {
  const { model } = req.params;
  const { format = 'json' } = req.query;
  let Model, fields;
  switch (model) {
    case 'threads':
      Model = Thread;
      fields = ['_id','author','body','upvotes','createdAt','updatedAt','isDeleted','pin','lock'];
      break;
    case 'comments':
      Model = Comment;
      fields = ['_id','thread','parentId','author','body','upvotes','createdAt','updatedAt','isDeleted'];
      break;
    case 'users':
      Model = User;
      fields = ['_id','email','name','role','isBanned','tokenVersion','createdAt','updatedAt'];
      break;
    case 'reports':
      Model = Report;
      fields = ['_id','category','status','details','reason','createdAt','updatedAt'];
      break;
    case 'modlogs':
      Model = ModLog;
      fields = ['_id','action','targetType','targetId','adminUserId','note','createdAt'];
      break;
    default:
      return res.status(400).json({ error: 'Unknown model for export' });
  }
  // Set disposition so admin browser downloads
  const ext = format === 'csv' ? 'csv' : 'json';
  res.setHeader('Content-Disposition',
    `attachment; filename=${model}.${ext}`);
  streamModel(req, res, Model, fields, format);
});

module.exports = router;
