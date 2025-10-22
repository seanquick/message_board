// Backend/Middleware/abuseGuards.js
// Lightweight per‑user+IP rate limiting + simple content sanity checks
// NOTE: In-memory store is fine for single‑instance; for production use a distributed store (Redis, etc).

const crypto = require('crypto');

// sliding window buckets: key → [timestamps…]
const rlBuckets = new Map();
// duplicate content detection: key → [{ h, at }]
const dupStore  = new Map();

// Periodic cleanup to prevent memory leak (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const rlWindow = 60 * 1000;         // default window for rate limit
  const dupWindow = 10 * 60 * 1000;   // default dedup window

  for (const [k, arr] of rlBuckets) {
    const filtered = arr.filter(t => now - t < rlWindow);
    if (filtered.length) rlBuckets.set(k, filtered); else rlBuckets.delete(k);
  }
  for (const [k, list] of dupStore) {
    const filtered = list.filter(r => now - r.at < dupWindow);
    if (filtered.length) dupStore.set(k, filtered); else dupStore.delete(k);
  }
}, 5 * 60 * 1000);

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function rateLimitByUserAndIP({
  key      = 'post',
  windowMs = 60_000,
  max      = 20
} = {}) {
  return (req, res, next) => {
    const uid   = String(req.user?.uid || 'anon');
    const ip    = getClientIP(req);
    const bucketKey = `${key}:${uid}:${ip}`;
    const now = Date.now();

    const arr = (rlBuckets.get(bucketKey) || []).filter(t => now - t < windowMs);

    if (arr.length >= max) {
      return res.status(429).json({ error: 'You’re doing that too much. Please slow down.' });
    }

    arr.push(now);
    rlBuckets.set(bucketKey, arr);
    next();
  };
}

function contentRules({
  kind        = 'comment',
  minChars    = 2,
  maxLinks    = 3,
  dedupWindowMs = 10 * 60_000
} = {}) {
  return (req, res, next) => {
    // Honeypot field (e.g., hidden field in form)
    const honeypot = (req.body?.website || '').toString().trim();
    if (honeypot) {
      return res.status(400).json({ error: 'Invalid submission.' });
    }

    const rawText = (req.body?.body ?? req.body?.content ?? '').toString();
    const trimmed = rawText.trim();
    if (trimmed.length < minChars) {
      const msg = kind === 'thread' ? 'Content is too short.' : 'Comment is too short.';
      return res.status(400).json({ error: msg });
    }

    const linkMatches = rawText.match(/https?:\/\/|www\./gi);
    if (linkMatches && linkMatches.length > maxLinks) {
      return res.status(400).json({ error: `Too many links (${linkMatches.length}). Maximum allowed is ${maxLinks}.` });
    }

    // Duplicate detection: per user + kind, within window
    const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
    const hash = crypto.createHash('sha1').update(normalized).digest('hex');
    const uid  = String(req.user?.uid || 'anon');
    const dupKey = `dup:${kind}:${uid}`;
    const now   = Date.now();

    const list = (dupStore.get(dupKey) || []).filter(r => now - r.at < dedupWindowMs);
    if (list.find(r => r.h === hash)) {
      return res.status(409).json({ error: 'Duplicate content detected (recent).' });
    }

    list.push({ h: hash, at: now });
    dupStore.set(dupKey, list);

    next();
  };
}

module.exports = {
  rateLimitByUserAndIP,
  contentRules
};
