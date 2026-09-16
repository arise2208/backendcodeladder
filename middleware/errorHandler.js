const isProd = process.env.NODE_ENV === 'production';

function errorHandler(err, req, res, next) {
  const reqId = req.requestId ? ` [${req.requestId}]` : '';

  if (err.code === 11000) {
    if (err.keyPattern?.ladderId && err.keyPattern?.questionId) {
      return res.status(409).json({ error: 'Question is already in this ladder' });
    }
    if (err.keyPattern?.username) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    if (err.keyPattern?.email) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    return res.status(409).json({ error: 'Resource already exists' });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid ${err.path || 'ID'}` });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: Object.values(err.errors).map(error => error.message).join(', ')
    });
  }

  if (err.statusCode) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`${reqId} ${req.method} ${req.originalUrl} - ${err.statusCode}: ${err.message}`);
    }
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (isProd) {
    console.error(`${reqId} [${new Date().toISOString()}] Unhandled error: ${err.message}`);
  } else {
    console.error(`${reqId} Unhandled error:`, err);
  }

  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
