const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <token>
  const usernameFromHeader = req.headers['x-username']; // Get username from custom header

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  if (!usernameFromHeader) {
    return res.status(400).json({ error: 'Username header missing.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token.' });

    // Check if username in token matches the one sent from frontend
    if (!user.username || user.username !== usernameFromHeader) {
      return res.status(403).json({ error: 'Username does not match token.' });
    }

    req.user = user; // Attach user info to the request
    next(); // Proceed to the next middleware/route
  });
}

module.exports = authenticateToken;