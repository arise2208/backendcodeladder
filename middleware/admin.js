module.exports = function admin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const isAdmin =
    req.user.role === 'ADMIN' ||
    req.user.username?.toLowerCase() === 'deepanshu' ||
    req.user.username?.toLowerCase() === 'admin';

  if (!isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
};
