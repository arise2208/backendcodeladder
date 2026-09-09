const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const {
  listBlogs,
  getRecentActions,
  getBlog,
  createBlog,
  updateBlog,
  deleteBlog,
  voteBlog,
  addComment,
  deleteComment,
  voteComment,
  getUserBlogQuota
} = require('../controllers/blogController');

const router = express.Router();

// Optional auth helper: attaches req.user if token is present and valid
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const headerUsername = req.headers['x-username'];

    if (authHeader && authHeader.startsWith('Bearer ') && headerUsername) {
      const token = authHeader.slice(7).trim();
      if (token && process.env.JWT_SECRET) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.username === headerUsername) {
          const user = await User.findOne({ username: payload.username }).select('_id username role').lean();
          if (user) {
            req.user = user;
          }
        }
      }
    }
  } catch (err) {
    // Non-blocking for optional auth
  }
  next();
}

// Public / optionally authenticated
router.get('/', optionalAuth, asyncHandler(listBlogs));
router.get('/recent-actions', asyncHandler(getRecentActions));
router.get('/actions/recent', asyncHandler(getRecentActions));
router.get('/me/quota', auth, asyncHandler(getUserBlogQuota));
router.get('/:id', optionalAuth, asyncHandler(getBlog));

// Authenticated write operations
router.post('/', auth, asyncHandler(createBlog));
router.put('/:id', auth, asyncHandler(updateBlog));
router.delete('/:id', auth, asyncHandler(deleteBlog));
router.post('/:id/vote', auth, asyncHandler(voteBlog));
router.post('/:id/comments', auth, asyncHandler(addComment));
router.delete('/:id/comments/:commentId', auth, asyncHandler(deleteComment));
router.post('/:id/comments/:commentId/vote', auth, asyncHandler(voteComment));

module.exports = router;
