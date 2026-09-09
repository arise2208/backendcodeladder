const Blog = require('../models/Blog');
const httpError = require('../utils/httpError');
const mongoose = require('mongoose');

// Helper to strip markdown symbols for summary
function generateSnippet(content, maxLength = 240) {
  if (!content) return '';
  const clean = content
    .replace(/#+\s+/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/>\s+/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  return clean.length > maxLength ? clean.slice(0, maxLength).trim() + '...' : clean;
}

// 1. List Blogs (with Trending / Recent sorting, tag filter, search, pagination)
async function listBlogs(req, res) {
  const { sort = 'trending', search, tag, author, page = 1, limit = 15 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 15));

  const filter = {};

  if (tag && tag.trim()) {
    filter.tags = tag.trim().toLowerCase();
  }

  if (author && author.trim()) {
    filter.authorUsername = new RegExp(`^${author.trim()}$`, 'i');
  }

  if (search && search.trim()) {
    const q = search.trim();
    const regex = new RegExp(q, 'i');
    filter.$or = [
      { title: regex },
      { content: regex },
      { tags: regex },
      { authorUsername: regex }
    ];
  }

  const userId = req.user ? String(req.user.id || req.user._id) : null;

  // We fetch blogs
  const blogs = await Blog.find(filter)
    .select('-comments -content') // Omit heavy content in list for speed
    .sort({ createdAt: -1 })
    .lean();

  // Compute scores and user votes
  const enriched = blogs.map(blog => {
    const upvotesCount = (blog.upvotes || []).length;
    const downvotesCount = (blog.downvotes || []).length;
    const score = upvotesCount - downvotesCount;

    let userVote = null;
    if (userId) {
      const isUpvoted = (blog.upvotes || []).some(id => String(id) === userId);
      const isDownvoted = (blog.downvotes || []).some(id => String(id) === userId);
      if (isUpvoted) userVote = 'UPVOTE';
      else if (isDownvoted) userVote = 'DOWNVOTE';
    }

    return {
      _id: blog._id,
      title: blog.title,
      summary: blog.summary || generateSnippet(blog.summary, 220),
      tags: blog.tags || [],
      authorId: blog.authorId,
      authorUsername: blog.authorUsername,
      createdAt: blog.createdAt,
      updatedAt: blog.updatedAt,
      viewsCount: blog.viewsCount || 0,
      commentsCount: blog.commentsCount || (blog.comments || []).length || 0,
      upvotesCount,
      downvotesCount,
      score,
      userVote
    };
  });

  // Sort
  if (sort === 'trending') {
    enriched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  } else {
    // Recent
    enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const total = enriched.length;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = enriched.slice(startIndex, startIndex + limitNum);

  res.json({
    blogs: paginated,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
  });
}

// 2. Codeforces-style "Recent actions" feed
async function getRecentActions(req, res) {
  // Recent 10 blogs
  const recentBlogs = await Blog.find()
    .select('_id title authorUsername createdAt upvotes downvotes')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const blogActions = recentBlogs.map(b => ({
    id: `blog-${b._id}`,
    type: 'BLOG',
    blogId: b._id,
    blogTitle: b.title,
    authorUsername: b.authorUsername,
    createdAt: b.createdAt,
    score: (b.upvotes || []).length - (b.downvotes || []).length
  }));

  // Recent 10 comments across all blogs
  const blogsWithRecentComments = await Blog.find({ 'comments.0': { $exists: true } })
    .select('_id title comments')
    .sort({ 'comments.createdAt': -1 })
    .limit(10)
    .lean();

  const commentActions = [];
  for (const b of blogsWithRecentComments) {
    for (const c of (b.comments || [])) {
      commentActions.push({
        id: `comment-${c._id}`,
        type: 'COMMENT',
        blogId: b._id,
        blogTitle: b.title,
        commentId: c._id,
        authorUsername: c.authorUsername,
        snippet: generateSnippet(c.content, 60),
        createdAt: c.createdAt
      });
    }
  }

  // Merge and take top 15
  const allActions = [...blogActions, ...commentActions]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 15);

  res.json({ actions: allActions });
}

// 3. Get single Blog (increments views)
async function getBlog(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, 'Invalid blog ID');
  }

  const blog = await Blog.findByIdAndUpdate(
    id,
    { $inc: { viewsCount: 1 } },
    { new: true }
  ).lean();

  if (!blog) {
    throw httpError(404, 'Blog not found');
  }

  const userId = req.user ? String(req.user.id || req.user._id) : null;
  const upvotesCount = (blog.upvotes || []).length;
  const downvotesCount = (blog.downvotes || []).length;
  const score = upvotesCount - downvotesCount;

  let userVote = null;
  if (userId) {
    const isUpvoted = (blog.upvotes || []).some(uid => String(uid) === userId);
    const isDownvoted = (blog.downvotes || []).some(uid => String(uid) === userId);
    if (isUpvoted) userVote = 'UPVOTE';
    else if (isDownvoted) userVote = 'DOWNVOTE';
  }

  const enrichedComments = (blog.comments || []).map(c => {
    const cUpvotes = (c.upvotes || []).length;
    const cDownvotes = (c.downvotes || []).length;
    let cUserVote = null;
    if (userId) {
      if ((c.upvotes || []).some(uid => String(uid) === userId)) cUserVote = 'UPVOTE';
      else if ((c.downvotes || []).some(uid => String(uid) === userId)) cUserVote = 'DOWNVOTE';
    }
    return {
      _id: c._id,
      authorId: c.authorId,
      authorUsername: c.authorUsername,
      content: c.content,
      createdAt: c.createdAt,
      upvotesCount: cUpvotes,
      downvotesCount: cDownvotes,
      score: cUpvotes - cDownvotes,
      userVote: cUserVote
    };
  });

  res.json({
    blog: {
      ...blog,
      comments: enrichedComments,
      upvotesCount,
      downvotesCount,
      score,
      userVote,
      commentsCount: enrichedComments.length
    }
  });
}

// 4. Create Blog (Enforces Max 5 blogs per user and Max 50,000 chars size limit)
async function createBlog(req, res) {
  const userId = req.user.id || req.user._id;

  // Enforce Max 5 blogs quota
  const existingCount = await Blog.countDocuments({ authorId: userId });
  if (existingCount >= 5) {
    throw httpError(400, 'You have reached the maximum limit of 5 blogs per user. Please edit or delete an existing blog.');
  }

  const { title, content, tags = [] } = req.body;

  if (!title || !title.trim()) {
    throw httpError(400, 'Blog title is required');
  }
  if (title.trim().length > 200) {
    throw httpError(400, 'Blog title cannot exceed 200 characters');
  }

  if (!content || !content.trim()) {
    throw httpError(400, 'Blog content is required');
  }
  if (content.length > 50000) {
    throw httpError(400, 'Blog content exceeds maximum allowed size of 50,000 characters');
  }

  // Clean tags
  const cleanTags = Array.isArray(tags)
    ? tags.map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 10)
    : [];

  const summary = generateSnippet(content, 260);

  const blog = new Blog({
    title: title.trim(),
    content,
    summary,
    tags: cleanTags,
    authorId: userId,
    authorUsername: req.user.username,
    upvotes: [],
    downvotes: [],
    votes: [],
    comments: []
  });

  await blog.save();

  res.status(201).json({
    message: 'Blog created successfully',
    blog: {
      _id: blog._id,
      title: blog.title,
      summary: blog.summary,
      tags: blog.tags,
      authorUsername: blog.authorUsername,
      createdAt: blog.createdAt,
      upvotesCount: 0,
      downvotesCount: 0,
      score: 0
    }
  });
}

// 5. Update Blog
async function updateBlog(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, 'Invalid blog ID');
  }

  const blog = await Blog.findById(id);
  if (!blog) {
    throw httpError(404, 'Blog not found');
  }

  const userId = String(req.user.id || req.user._id);
  const isAuthor = String(blog.authorId) === userId;
  const isAdmin = req.user.role === 'ADMIN';

  if (!isAuthor && !isAdmin) {
    throw httpError(403, 'You do not have permission to edit this blog');
  }

  const { title, content, tags } = req.body;

  if (title !== undefined) {
    if (!title.trim()) throw httpError(400, 'Blog title cannot be empty');
    if (title.trim().length > 200) throw httpError(400, 'Blog title cannot exceed 200 characters');
    blog.title = title.trim();
  }

  if (content !== undefined) {
    if (!content.trim()) throw httpError(400, 'Blog content cannot be empty');
    if (content.length > 50000) throw httpError(400, 'Blog content exceeds maximum allowed size of 50,000 characters');
    blog.content = content;
    blog.summary = generateSnippet(content, 260);
  }

  if (tags !== undefined && Array.isArray(tags)) {
    blog.tags = tags.map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 10);
  }

  await blog.save();

  res.json({
    message: 'Blog updated successfully',
    blog: {
      _id: blog._id,
      title: blog.title,
      summary: blog.summary,
      tags: blog.tags,
      updatedAt: blog.updatedAt
    }
  });
}

// 6. Delete Blog
async function deleteBlog(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, 'Invalid blog ID');
  }

  const blog = await Blog.findById(id);
  if (!blog) {
    throw httpError(404, 'Blog not found');
  }

  const userId = String(req.user.id || req.user._id);
  const isAuthor = String(blog.authorId) === userId;
  const isAdmin = req.user.role === 'ADMIN';

  if (!isAuthor && !isAdmin) {
    throw httpError(403, 'You do not have permission to delete this blog');
  }

  await Blog.findByIdAndDelete(id);

  res.json({ message: 'Blog deleted successfully' });
}

// 7. Vote Blog (Upvote / Downvote with 2-minute lock rule)
async function voteBlog(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, 'Invalid blog ID');
  }

  const { vote: rawVote } = req.body;
  let vote = null;
  if (['UPVOTE', 'LIKE'].includes(rawVote)) vote = 'UPVOTE';
  else if (['DOWNVOTE', 'DISLIKE'].includes(rawVote)) vote = 'DOWNVOTE';
  else {
    throw httpError(400, "vote must be 'UPVOTE' or 'DOWNVOTE'");
  }

  const blog = await Blog.findById(id);
  if (!blog) {
    throw httpError(404, 'Blog not found');
  }

  const userId = String(req.user.id || req.user._id);
  const isUpvoted = (blog.upvotes || []).some(uid => String(uid) === userId);
  const isDownvoted = (blog.downvotes || []).some(uid => String(uid) === userId);

  // 2-minute lock rule: if already voted, vote cannot be changed after 2 minutes
  if (isUpvoted || isDownvoted) {
    const existingVote = (blog.votes || []).find(v => String(v.userId) === userId);
    const voteTimestamp = existingVote?.votedAt || blog.updatedAt || blog.createdAt;

    if (voteTimestamp) {
      const elapsedMs = Date.now() - new Date(voteTimestamp).getTime();
      if (elapsedMs > 2 * 60 * 1000) {
        throw httpError(403, 'Vote is locked and cannot be changed after 2 minutes');
      }
    }
  }

  let userVote = null;

  if (vote === 'UPVOTE') {
    if (isUpvoted) {
      // Toggle off within 2-minute window
      blog.upvotes = (blog.upvotes || []).filter(uid => String(uid) !== userId);
      blog.votes = (blog.votes || []).filter(v => String(v.userId) !== userId);
      userVote = null;
    } else {
      // Upvote (new or switch from downvote)
      blog.upvotes = [...new Set([...(blog.upvotes || []).map(String), userId])];
      blog.downvotes = (blog.downvotes || []).filter(uid => String(uid) !== userId);
      const remaining = (blog.votes || []).filter(v => String(v.userId) !== userId);
      remaining.push({
        userId: req.user.id || req.user._id,
        vote: 'UPVOTE',
        votedAt: new Date()
      });
      blog.votes = remaining;
      userVote = 'UPVOTE';
    }
  } else if (vote === 'DOWNVOTE') {
    if (isDownvoted) {
      // Toggle off within 2-minute window
      blog.downvotes = (blog.downvotes || []).filter(uid => String(uid) !== userId);
      blog.votes = (blog.votes || []).filter(v => String(v.userId) !== userId);
      userVote = null;
    } else {
      // Downvote (new or switch from upvote)
      blog.downvotes = [...new Set([...(blog.downvotes || []).map(String), userId])];
      blog.upvotes = (blog.upvotes || []).filter(uid => String(uid) !== userId);
      const remaining = (blog.votes || []).filter(v => String(v.userId) !== userId);
      remaining.push({
        userId: req.user.id || req.user._id,
        vote: 'DOWNVOTE',
        votedAt: new Date()
      });
      blog.votes = remaining;
      userVote = 'DOWNVOTE';
    }
  }

  await blog.save();

  const upvotesCount = (blog.upvotes || []).length;
  const downvotesCount = (blog.downvotes || []).length;

  res.json({
    upvotesCount,
    downvotesCount,
    score: upvotesCount - downvotesCount,
    userVote
  });
}

// 8. Add Comment
async function addComment(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, 'Invalid blog ID');
  }

  const { content } = req.body;
  if (!content || !content.trim()) {
    throw httpError(400, 'Comment content cannot be empty');
  }
  if (content.trim().length > 5000) {
    throw httpError(400, 'Comment content cannot exceed 5,000 characters');
  }

  const blog = await Blog.findById(id);
  if (!blog) {
    throw httpError(404, 'Blog not found');
  }

  const newComment = {
    authorId: req.user.id || req.user._id,
    authorUsername: req.user.username,
    content: content.trim(),
    createdAt: new Date()
  };

  blog.comments.push(newComment);
  blog.commentsCount = (blog.comments || []).length;
  await blog.save();

  const savedComment = blog.comments[blog.comments.length - 1];

  res.status(201).json({
    message: 'Comment added',
    comment: savedComment
  });
}

// 9. Delete Comment
async function deleteComment(req, res) {
  const { id, commentId } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(commentId)) {
    throw httpError(400, 'Invalid ID format');
  }

  const blog = await Blog.findById(id);
  if (!blog) {
    throw httpError(404, 'Blog not found');
  }

  const comment = blog.comments.id(commentId);
  if (!comment) {
    throw httpError(404, 'Comment not found');
  }

  const userId = String(req.user.id || req.user._id);
  const isCommentAuthor = String(comment.authorId) === userId;
  const isBlogAuthor = String(blog.authorId) === userId;
  const isAdmin = req.user.role === 'ADMIN';

  if (!isCommentAuthor && !isBlogAuthor && !isAdmin) {
    throw httpError(403, 'You do not have permission to delete this comment');
  }

  blog.comments.pull(commentId);
  blog.commentsCount = (blog.comments || []).length;
  await blog.save();

  res.json({ message: 'Comment deleted successfully' });
}

// 10. Get User's Blog Quota
async function getUserBlogQuota(req, res) {
  const userId = req.user.id || req.user._id;
  const count = await Blog.countDocuments({ authorId: userId });
  res.json({
    count,
    max: 5,
    remaining: Math.max(0, 5 - count)
  });
}

// 11. Vote Comment (Upvote / Downvote with 2-minute lock rule)
async function voteComment(req, res) {
  const { id, commentId } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(commentId)) {
    throw httpError(400, 'Invalid ID format');
  }

  const { vote: rawVote } = req.body;
  let vote = null;
  if (['UPVOTE', 'LIKE'].includes(rawVote)) vote = 'UPVOTE';
  else if (['DOWNVOTE', 'DISLIKE'].includes(rawVote)) vote = 'DOWNVOTE';
  else {
    throw httpError(400, "vote must be 'UPVOTE' or 'DOWNVOTE'");
  }

  const blog = await Blog.findById(id);
  if (!blog) {
    throw httpError(404, 'Blog not found');
  }

  const comment = blog.comments.id(commentId);
  if (!comment) {
    throw httpError(404, 'Comment not found');
  }

  const userId = String(req.user.id || req.user._id);
  const isUpvoted = (comment.upvotes || []).some(uid => String(uid) === userId);
  const isDownvoted = (comment.downvotes || []).some(uid => String(uid) === userId);

  // 2-minute lock rule
  if (isUpvoted || isDownvoted) {
    const existingVote = (comment.votes || []).find(v => String(v.userId) === userId);
    const voteTimestamp = existingVote?.votedAt || comment.createdAt;
    if (voteTimestamp) {
      const elapsedMs = Date.now() - new Date(voteTimestamp).getTime();
      if (elapsedMs > 2 * 60 * 1000) {
        throw httpError(403, 'Vote is locked and cannot be changed after 2 minutes');
      }
    }
  }

  let userVote = null;

  if (vote === 'UPVOTE') {
    if (isUpvoted) {
      comment.upvotes = (comment.upvotes || []).filter(uid => String(uid) !== userId);
      comment.votes = (comment.votes || []).filter(v => String(v.userId) !== userId);
      userVote = null;
    } else {
      comment.upvotes = [...new Set([...(comment.upvotes || []).map(String), userId])];
      comment.downvotes = (comment.downvotes || []).filter(uid => String(uid) !== userId);
      const remaining = (comment.votes || []).filter(v => String(v.userId) !== userId);
      remaining.push({ userId: req.user.id || req.user._id, vote: 'UPVOTE', votedAt: new Date() });
      comment.votes = remaining;
      userVote = 'UPVOTE';
    }
  } else if (vote === 'DOWNVOTE') {
    if (isDownvoted) {
      comment.downvotes = (comment.downvotes || []).filter(uid => String(uid) !== userId);
      comment.votes = (comment.votes || []).filter(v => String(v.userId) !== userId);
      userVote = null;
    } else {
      comment.downvotes = [...new Set([...(comment.downvotes || []).map(String), userId])];
      comment.upvotes = (comment.upvotes || []).filter(uid => String(uid) !== userId);
      const remaining = (comment.votes || []).filter(v => String(v.userId) !== userId);
      remaining.push({ userId: req.user.id || req.user._id, vote: 'DOWNVOTE', votedAt: new Date() });
      comment.votes = remaining;
      userVote = 'DOWNVOTE';
    }
  }

  await blog.save();

  const upvotesCount = (comment.upvotes || []).length;
  const downvotesCount = (comment.downvotes || []).length;

  res.json({
    upvotesCount,
    downvotesCount,
    score: upvotesCount - downvotesCount,
    userVote
  });
}

module.exports = {
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
};
