const { randomUUID } = require('crypto');

module.exports = function requestId(req, res, next) {
  const id = (req.headers['x-request-id'] || '').slice(0, 64).trim() || randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
