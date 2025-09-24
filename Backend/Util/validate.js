// Backend/Util/validate.js
// Lightweight schema validator for Express request bodies (no deps).

const mongoose = require('mongoose');

function stripControl(str) {
  return String(str).replace(/[\u0000-\u001F\u007F]/g, ' ');
}

const s = {
  string(opts = {}) {
    const { min = 0, max = 10000, trim = true, lower = false, emptyToNull = false } = opts;
    return {
      parse(v, key = 'string') {
        if (v == null) {
          if (min > 0) throw new Error(`${key} is required`);
          return '';
        }
        let out = stripControl(v);
        if (trim) out = out.trim();
        if (lower) out = out.toLowerCase();
        if (emptyToNull && out === '') return null;
        if (out.length < min) throw new Error(`${key} too short (min ${min})`);
        if (out.length > max) throw new Error(`${key} too long (max ${max})`);
        return out;
      }
    };
  },
  boolean() {
    return {
      parse(v, key = 'boolean') {
        if (typeof v === 'boolean') return v;
        if (v === 1 || v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
        if (v === 0 || v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
        if (v == null || v === '') return false;
        throw new Error(`${key} must be boolean`);
      }
    };
  },
  number(opts = {}) {
    const { min = -Infinity, max = Infinity, integer = false } = opts;
    return {
      parse(v, key = 'number') {
        const n = (typeof v === 'number') ? v : Number(v);
        if (!Number.isFinite(n)) throw new Error(`${key} must be a number`);
        if (integer && !Number.isInteger(n)) throw new Error(`${key} must be an integer`);
        if (n < min) throw new Error(`${key} must be >= ${min}`);
        if (n > max) throw new Error(`${key} must be <= ${max}`);
        return n;
      }
    };
  },
  objectId(opts = {}) {
    const { allowNull = false } = opts;
    return {
      parse(v, key = 'id') {
        if (v == null || v === '') {
          if (allowNull) return null;
          throw new Error(`${key} is required`);
        }
        const s = String(v);
        if (!mongoose.isValidObjectId(s)) throw new Error(`${key} is not a valid id`);
        return s; // keep as string
      }
    };
  },
  enum(allowed = [], opts = {}) {
    const { insensitive = true } = opts;
    const norm = (x) => insensitive ? String(x).toLowerCase() : String(x);
    const set = new Set(allowed.map(norm));
    return {
      parse(v, key = 'value') {
        if (v == null) throw new Error(`${key} is required`);
        const val = String(v);
        if (!set.has(norm(val))) throw new Error(`${key} must be one of: ${allowed.join(', ')}`);
        if (insensitive) {
          const hit = allowed.find(a => norm(a) === norm(val));
          return hit ?? val;
        }
        return val;
      }
    };
  },
  array(inner, opts = {}) {
    const { min = 0, max = Infinity, unique = false } = opts;
    return {
      parse(v, key = 'array') {
        let arr = Array.isArray(v) ? v : (typeof v === 'string' ? [v] : []);
        if (arr.length < min) throw new Error(`${key} needs at least ${min} item(s)`);
        if (arr.length > max) throw new Error(`${key} has too many items (max ${max})`);
        const out = arr.map((x, i) => inner.parse(x, `${key}[${i}]`));
        return unique ? Array.from(new Set(out)) : out;
      }
    };
  },
  optional(inner) {
    return {
      parse(v, key) {
        if (v == null || v === '') return undefined;
        return inner.parse(v, key);
      }
    };
  }
};

// Express middleware: validates req.body against a schema object { key: validator }
function body(schema) {
  return function validateBody(req, res, next) {
    try {
      const input = req.body || {};
      const out = {};
      for (const [k, validator] of Object.entries(schema || {})) {
        out[k] = validator.parse(input[k], k);
      }
      req.body = { ...input, ...out }; // merge validated values
      next();
    } catch (e) {
      res.status(400).json({ error: e.message || 'Invalid request body' });
    }
  };
}

module.exports = { s, body };
