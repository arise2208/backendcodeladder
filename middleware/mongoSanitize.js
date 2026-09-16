const MONGO_OPERATOR_RE = /^\$|\./;

function stripOperators(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripOperators);

  const clean = {};
  for (const [key, val] of Object.entries(value)) {
    if (MONGO_OPERATOR_RE.test(key)) continue;
    clean[key] = stripOperators(val);
  }
  return clean;
}

module.exports = function mongoSanitize(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = stripOperators(req.body);
  if (req.params && typeof req.params === 'object') req.params = stripOperators(req.params);
  next();
};
