// backend/Util/enum.js

/**
 * Returns all possible values of an enum-like field on a Mongoose model.
 * For example: enumValues(Model, 'status') will return all distinct string values
 * defined in the schema's enum for field `status`.
 *
 * If no schema enum is found, returns empty array.
 */
function enumValues(model, field) {
  if (!model || !model.schema || !model.schema.paths) return [];
  const path = model.schema.paths[field];
  if (!path || !path.options || !path.options.enum) return [];
  return Array.isArray(path.options.enum) ? path.options.enum : [];
}

module.exports = { enumValues };
