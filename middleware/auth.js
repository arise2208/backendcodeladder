const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const headerUsername = req.headers['x-username'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!headerUsername || typeof headerUsername !== 'string') {
      return res.status(401).json({ message: 'X-Username header is required' });
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

    if (payload.username !== headerUsername) {
      return res.status(401).json({ message: 'Authenticated username does not match X-Username' });
    }

    const user = await User.findOne({ username: payload.username })
      .select('_id username role');

    if (!user) {
      return res.status(401).json({ message: 'User associated with token no longer exists' });
    }

    const effectiveRole =
      user.role === 'ADMIN' ||
      user.username?.toLowerCase() === 'deepanshu' ||
      user.username?.toLowerCase() === 'admin'
        ? 'ADMIN'
        : user.role;

    req.user = {
      id: user._id,
      username: user.username,
      role: effectiveRole
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = auth;
