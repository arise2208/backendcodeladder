function errorHandler(err, req, res, next) {
  // -----------------------------------
  // MongoDB duplicate key
  // -----------------------------------
  if (err.code === 11000) {
    if (err.keyPattern?.ladderId && err.keyPattern?.questionId) {
      return res.status(409).json({
        error: 'Question is already in this ladder'
      });
    }

    if (err.keyPattern?.username) {
      return res.status(409).json({
        error: 'Username already exists'
      });
    }

    if (err.keyPattern?.email) {
      return res.status(409).json({
        error: 'Email already exists'
      });
    }

    return res.status(409).json({
      error: 'Resource already exists'
    });
  }

  // -----------------------------------
  // Invalid MongoDB ObjectId
  // -----------------------------------
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: `Invalid ${err.path || 'ID'}`
    });
  }

  // -----------------------------------
  // Mongoose validation error
  // -----------------------------------
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: Object.values(err.errors)
        .map(error => error.message)
        .join(', ')
    });
  }

  // -----------------------------------
  // Expected application errors
  // -----------------------------------
  if (err.statusCode) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        `${req.method} ${req.originalUrl} - ${err.statusCode}: ${err.message}`
      );
    }

    return res.status(err.statusCode).json({
      error: err.message
    });
  }

  // -----------------------------------
  // Unexpected errors
  // -----------------------------------
  console.error(err);

  return res.status(500).json({
    error: 'Internal server error'
  });
}

module.exports = errorHandler;