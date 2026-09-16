const Contest = require('../models/Contest');
const Question = require('../models/Question');
const httpError = require('../utils/httpError');

async function listContests(req, res) {
  const platform = (req.query.platform || 'CODEFORCES').toUpperCase();
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const category = req.query.category ? req.query.category.toUpperCase() : 'ALL';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const minRating = req.query.minRating ? parseInt(req.query.minRating, 10) : null;
  const maxRating = req.query.maxRating ? parseInt(req.query.maxRating, 10) : null;

  const query = { platform };

  if (category && category !== 'ALL') {
    query.category = category;
  }

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { contestId: { $regex: escaped, $options: 'i' } }
    ];
  }

  if (minRating !== null || maxRating !== null) {
    query['problems.rating'] = {};
    if (minRating !== null) query['problems.rating'].$gte = minRating;
    if (maxRating !== null) query['problems.rating'].$lte = maxRating;
  }

  const [total, contests] = await Promise.all([
    Contest.countDocuments(query),
    Contest.find(query)
      .sort({ startTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
  ]);

  const pages = Math.ceil(total / limit) || 1;

  res.json({
    contests,
    pagination: {
      page,
      limit,
      total,
      pages,
      totalPages: pages
    }
  });
}

async function getContest(req, res) {
  const { contestId } = req.params;
  const platform = (req.query.platform || 'CODEFORCES').toUpperCase();

  const contest = await Contest.findOne({
    platform,
    contestId: String(contestId)
  }).lean();

  if (!contest) {
    throw httpError(404, 'Contest not found');
  }

  res.json({ contest });
}

module.exports = {
  listContests,
  getContest
};
