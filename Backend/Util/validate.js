// backend/util/validate.js
// Lightweight schema validator for Express request bodies (no dependencies)

const mongoose = require('mongoose');

// Sanitize input strings by removing control characters
function stripControl(str) {
  return String(str).replace(/[\u0000-\u001F\u007F]/g, ' ');
}

const s = {
  string({ min = 0, max = 10000, trim = true, lower = false, emptyToNull = false } = {}) {
    return {
      parse(value, key = 'string') {
        if (value == null) {
          if (min > 0) throw new Error(`${key} is required`);
          return '';
        }
        let str = stripControl(value);
        if (trim) str = str.trim();
        if (lower) str = str.toLowerCase();
        if (emptyToNull && str === '') return null;
        if (str.length < min) throw new Error(`${key} too short (min ${min})`);
        if (str.length > max) throw new Error(`${key} too long (max ${max})`);
        return str;
      }
    };
  },

  boolean() {
    return {
      parse(value, key = 'boolean') {
        if (typeof value === 'boolean') return value;
        const val = String(value).toLowerCase();
        if (['1', 'true', 'on', 'yes'].includes(val)) return true;
        if (['0', 'false', 'off', 'no'].includes(val)) return false;
        if (value == null || value === '') return false;
        throw new Error(`${key} must be boolean`);
      }
    };
  },

  number({ min = -Infinity, max = Infinity, integer = false } = {}) {
    return {
      parse(value, key = 'number') {
        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(num)) throw new Error(`${key} must be a number`);
        if (integer && !Number.isInteger(num)) throw new Error(`${key} must be an integer`);
        if (num < min) throw new Error(`${key} must be >= ${min}`);
        if (num > max) throw new Error(`${key} must be <= ${max}`);
        return num;
      }
    };
  },

  objectId({ allowNull = false } = {}) {
    return {
      parse(value, key = 'id') {
        if (value == null || value === '') {
          if (allowNull) return null;
          throw new Error(`${key} is required`);
        }
        const str = String(value);
        if (!mongoose.isValidObjectId(str)) throw new Error(`${key} is not a valid id`);
        return str;
      }
    };
  },

  enum(allowed = [], { insensitive = true } = {}) {
    const normalize = (x) => insensitive ? String(x).toLowerCase() : String(x);
    const allowedSet = new Set(allowed.map(normalize));
    return {
      parse(value, key = 'value') {
        if (value == null) throw new Error(`${key} is required`);
        const val = String(value);
        const norm = normalize(val);
        if (!allowedSet.has(norm)) {
          throw new Error(`${key} must be one of: ${allowed.join(', ')}`);
        }
        return insensitive
          ? allowed.find(a => normalize(a) === norm) ?? val
          : val;
      }
    };
  },

  array(inner, { min = 0, max = Infinity, unique = false } = {}) {
    return {
      parse(value, key = 'array') {
        const arr = Array.isArray(value)
          ? value
          : typeof value === 'string' ? [value] : [];

        if (arr.length < min) throw new Error(`${key} needs at least ${min} item(s)`);
        if (arr.length > max) throw new Error(`${key} has too many items (max ${max})`);

        const parsed = arr.map((item, i) => inner.parse(item, `${key}[${i}]`));
        return unique ? Array.from(new Set(parsed)) : parsed;
      }
    };
  },

  optional(inner) {
    return {
      parse(value, key) {
        if (value == null || value === '') return undefined;
        return inner.parse(value, key);
      }
    };
  }
};

// Express middleware: validates req.body against a schema
function body(schema) {
  return function validateBody(req, res, next) {
    try {
      const input = req.body || {};
      const parsed = {};

      for (const [key, validator] of Object.entries(schema)) {
        parsed[key] = validator.parse(input[key], key);
      }

      req.body = { ...input, ...parsed }; // merge validated values
      next();
    } catch (err) {
      res.status(400).json({ error: err.message || 'Invalid request body' });
    }
  };
}

module.exports = { s, body };
