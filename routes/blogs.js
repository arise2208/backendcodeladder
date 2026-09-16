const express = require('express');
const { auth, optionalAuth } = require('../middleware/auth');
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

router.get('/', optionalAuth, asyncHandler(listBlogs));
router.get('/recent-actions', asyncHandler(getRecentActions));
router.get('/actions/recent', asyncHandler(getRecentActions));
router.get('/me/quota', auth, asyncHandler(getUserBlogQuota));
router.get('/:id', optionalAuth, asyncHandler(getBlog));

router.post('/', auth, asyncHandler(createBlog));
router.put('/:id', auth, asyncHandler(updateBlog));
router.delete('/:id', auth, asyncHandler(deleteBlog));
router.post('/:id/vote', auth, asyncHandler(voteBlog));
router.post('/:id/comments', auth, asyncHandler(addComment));
router.delete('/:id/comments/:commentId', auth, asyncHandler(deleteComment));
router.post('/:id/comments/:commentId/vote', auth, asyncHandler(voteComment));

module.exports = router;
