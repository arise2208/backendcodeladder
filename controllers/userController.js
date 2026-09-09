const User = require('../models/User');
const UserQuestionState = require('../models/UserQuestionState');
const UserLadderQuestionPractice = require('../models/UserLadderQuestionPractice');
const PlatformAccount = require('../models/PlatformAccount');
const Ladder = require('../models/Ladder');
const LadderQuestion = require('../models/LadderQuestion');
const Question = require('../models/Question');
const Blog = require('../models/Blog');
const httpError = require('../utils/httpError');

async function getPublicProfile(req, res) {
  const user = await User.findOne({
    username: req.params.username
  }).select('_id username role createdAt').lean();

  if (!user) {
    throw httpError(404, 'User not found');
  }

  // 1. Fetch connected platform handles
  const platformAccounts = await PlatformAccount.find({ userId: user._id }).lean();
  const accountsMap = {};
  for (const acc of platformAccounts) {
    accountsMap[acc.platform.toLowerCase()] = acc.handle;
  }

  // 2. Fetch public ladders contributed to community
  const publicLadders = await Ladder.find({ ownerId: user._id, isPublic: true })
    .sort({ publishedAt: -1, createdAt: -1 })
    .lean();

  const publicLadderIds = publicLadders.map(l => l._id);
  const questionCounts = await LadderQuestion.aggregate([
    { $match: { ladderId: { $in: publicLadderIds } } },
    { $group: { _id: '$ladderId', count: { $sum: 1 } } }
  ]);
  const qCountMap = new Map(questionCounts.map(c => [String(c._id), c.count]));

  let totalLikesReceived = 0;
  const contributedLadders = publicLadders.map(l => {
    const likes = (l.likes || []).length;
    const dislikes = (l.dislikes || []).length;
    totalLikesReceived += likes;
    return {
      _id: l._id,
      title: l.title,
      description: l.description,
      questionCount: qCountMap.get(String(l._id)) || 0,
      likesCount: likes,
      dislikesCount: dislikes,
      upvotesCount: likes,
      downvotesCount: dislikes,
      score: likes - dislikes,
      publishedAt: l.publishedAt || l.createdAt,
      createdAt: l.createdAt
    };
  });

  // 3. Solved questions data for heatmap & stats
  const solvedQuestionStates = await UserQuestionState.find({
    userId: user._id,
    solved: true
  })
    .populate('questionId')
    .sort({ solvedAt: -1, firstSolvedAt: -1 })
    .lean();

  const solvedQuestions = solvedQuestionStates
    .filter(s => s.questionId)
    .map(s => ({
      _id: s.questionId._id,
      platform: s.questionId.platform,
      externalId: s.questionId.externalId,
      title: s.questionId.title,
      url: s.questionId.url,
      difficulty: s.questionId.difficulty,
      tags: s.questionId.tags || [],
      metadata: s.questionId.metadata || {},
      state: {
        solved: true,
        solvedAt: s.solvedAt || s.firstSolvedAt || s.createdAt,
        firstSolvedAt: s.firstSolvedAt || s.solvedAt || s.createdAt,
        starred: s.starred || false
      }
    }));

  const starredCount = await UserQuestionState.countDocuments({ userId: user._id, starred: true });

  // 4. Fetch user's blogs
  const userBlogs = await Blog.find({ authorId: user._id })
    .select('-comments -content')
    .sort({ createdAt: -1 })
    .lean();

  let totalBlogUpvotes = 0;
  const blogsFormatted = userBlogs.map(b => {
    const upvotesCount = (b.upvotes || []).length;
    const downvotesCount = (b.downvotes || []).length;
    totalBlogUpvotes += upvotesCount;
    return {
      _id: b._id,
      title: b.title,
      summary: b.summary,
      tags: b.tags || [],
      viewsCount: b.viewsCount || 0,
      commentsCount: b.commentsCount || 0,
      upvotesCount,
      downvotesCount,
      score: upvotesCount - downvotesCount,
      createdAt: b.createdAt
    };
  });

  const grandTotalUpvotes = totalLikesReceived + totalBlogUpvotes;

  res.json({
    user: {
      _id: user._id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      platformAccounts: accountsMap,
      accounts: platformAccounts
    },
    stats: {
      solved: solvedQuestions.length,
      starred: starredCount,
      publicLaddersCount: contributedLadders.length,
      blogsCount: blogsFormatted.length,
      ladderUpvotesReceived: totalLikesReceived,
      blogUpvotesReceived: totalBlogUpvotes,
      totalLikesReceived: grandTotalUpvotes,
      totalUpvotesReceived: grandTotalUpvotes
    },
    contributedLadders,
    blogs: blogsFormatted,
    solvedQuestions
  });
}

async function getStats(req, res) {
  const user = await User.findOne({
    username: req.params.username
  }).select('_id username');

  if (!user) {
    throw httpError(404, 'User not found');
  }

  const [solved, starred, practised, publicLadders] = await Promise.all([
    UserQuestionState.countDocuments({ userId: user._id, solved: true }),
    UserQuestionState.countDocuments({ userId: user._id, starred: true }),
    UserLadderQuestionPractice.countDocuments({ userId: user._id, practised: true }),
    Ladder.find({ ownerId: user._id, isPublic: true }).select('likes').lean()
  ]);

  const totalLikes = publicLadders.reduce((acc, l) => acc + ((l.likes || []).length), 0);

  res.json({
    username: user.username,
    stats: {
      solved,
      starred,
      practised,
      publicLaddersCount: publicLadders.length,
      totalLikesReceived: totalLikes,
      totalUpvotesReceived: totalLikes
    }
  });
}

module.exports = { getPublicProfile, getStats };
