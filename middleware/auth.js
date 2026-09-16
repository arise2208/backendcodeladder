const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      }
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (!payload.username || typeof payload.username !== 'string') {
      return res.status(401).json({ message: 'Invalid authentication token' });
    }

    let user;
    try {
      user = await User.findOne({ username: payload.username }).select('_id username role tokenVersion');
    } catch (dbError) {
      console.warn('Database error in auth middleware:', dbError.message);
      return res.status(503).json({ message: 'Authentication service temporarily unavailable' });
    }

    if (!user) {
      return res.status(401).json({ message: 'User associated with token no longer exists' });
    }

    if (payload.tokenVersion !== undefined && user.tokenVersion !== undefined) {
      if (payload.tokenVersion !== user.tokenVersion) {
        return res.status(401).json({ message: 'Token has been revoked. Please log in again.' });
      }
    }

    req.user = {
      id: user._id,
      username: user.username,
      role: user.role
    };

    next();
  } catch (error) {
    next(error);
  }
}

async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.slice(7).trim();
    if (!token || !process.env.JWT_SECRET) {
      return next();
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return next();
    }

    if (!payload || !payload.username) {
      return next();
    }

    try {
      const user = await User.findOne({ username: payload.username })
        .select('_id username role tokenVersion')
        .lean();

      if (user && (payload.tokenVersion === undefined || user.tokenVersion === undefined || payload.tokenVersion === user.tokenVersion)) {
        req.user = {
          id: user._id,
          username: user.username,
          role: user.role
        };
      }
    } catch {
      // Ignored for optional authentication
    }
  } catch {
    // Ignored for optional authentication
  }
  next();
}

module.exports = auth;
module.exports.auth = auth;
module.exports.optionalAuth = optionalAuth;
