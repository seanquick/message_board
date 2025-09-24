// Backend/Middleware/abuseGuards.js
// Lightweight per-user+IP rate limiting + simple content sanity checks
// NOTE: In-memory store is fine for a single process. For production, replace
// maps with Redis/store for multi-instance deployments.

const crypto = require('crypto');

// sliding window buckets: key -> [timestamps...]
const rlBuckets = new Map();
// recent content hashes to prevent duplicates: key -> [{h, at}]
const dupStore  = new Map();

function rateLimitByUserAndIP({
  key = 'post',
  windowMs = 60_000, // 1 minute
  max = 20           // max actions per window
} = {}) {
  return (req, res, next) => {
    const uid = String(req.user?.uid || 'anon');
    const ip  = (req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress || 'ip').toString();
    const k = `${key}:${uid}:${ip}`;
    const now = Date.now();

    let arr = rlBuckets.get(k) || [];
    arr = arr.filter(t => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: 'You’re doing that too much. Please slow down.' });
    }
    arr.push(now);
    rlBuckets.set(k, arr);
    next();
  };
}

function contentRules({
  kind = 'comment',     // 'comment' | 'thread'
  minChars = 2,
  maxLinks = 3,
  dedupWindowMs = 10 * 60_000 // 10 minutes
} = {}) {
  return (req, res, next) => {
    // Honeypot (optional hidden field). If a bot fills it, reject.
    const honeypot = (req.body?.website || '').toString().trim();
    if (honeypot) {
      return res.status(400).json({ error: 'Invalid submission.' });
    }

    const textRaw = (req.body?.body ?? req.body?.content ?? '').toString();
    if (!textRaw || textRaw.trim().length < minChars) {
      return res.status(400).json({ error: kind === 'thread' ? 'Content is too short.' : 'Comment is too short.' });
    }

    // Link-count guard
    const linkHits = textRaw.match(/https?:\/\/|www\./gi);
    if (linkHits && linkHits.length > maxLinks) {
      return res.status(400).json({ error: `Too many links (${linkHits.length}). Maximum allowed is ${maxLinks}.` });
    }

    // Duplicate detection (per user, normalized content, within window)
    const normalized = textRaw.toLowerCase().replace(/\s+/g, ' ').trim();
    const h = crypto.createHash('sha1').update(normalized).digest('hex');
    const uid = String(req.user?.uid || 'anon');
    const key = `dup:${kind}:${uid}`;
    const now = Date.now();

    let list = dupStore.get(key) || [];
    list = list.filter(r => now - r.at < dedupWindowMs);
    if (list.find(r => r.h === h)) {
      return res.status(409).json({ error: 'Duplicate content detected (recent).' });
    }
    list.push({ h, at: now });
    dupStore.set(key, list);

    next();
  };
}

module.exports = { rateLimitByUserAndIP, contentRules };
