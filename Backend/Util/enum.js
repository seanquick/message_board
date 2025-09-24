// Backend/Util/enum.js
function enumValues(model, path) {
  try { return model.schema.path(path).enumValues || []; } catch { return []; }
}
function coerceEnum(model, path, val, fallback) {
  const enums = enumValues(model, path);
  if (!enums.length) return val ?? fallback ?? undefined;

  // try exact (case-insensitive)
  if (val != null) {
    const hit = enums.find(e => String(e).toLowerCase() === String(val).toLowerCase());
    if (hit) return hit;
  }
  // try fallback token
  if (fallback != null) {
    const hit = enums.find(e => String(e).toLowerCase() === String(fallback).toLowerCase());
    if (hit) return hit;
  }
  // prefer "other"
  const other = enums.find(e => String(e).toLowerCase() === 'other');
  if (other) return other;

  // else first enum
  return enums[0];
}
module.exports = { enumValues, coerceEnum };
