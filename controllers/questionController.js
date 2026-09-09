const mongoose = require('mongoose');
const Question = require('../models/Question');
const UserQuestionState = require('../models/UserQuestionState');
const LadderQuestion = require('../models/LadderQuestion');
const UserLadderQuestionPractice = require('../models/UserLadderQuestionPractice');
const httpError = require('../utils/httpError');

async function listQuestions(req, res) {
  const filter = {};

  if (req.query.platform && ['LEETCODE', 'CODEFORCES', 'CODECHEF', 'ATCODER'].includes(req.query.platform.toUpperCase())) {
    filter.platform = req.query.platform.toUpperCase();
  }
  if (req.query.difficulty && ['EASY', 'MEDIUM', 'HARD'].includes(req.query.difficulty.toUpperCase())) {
    filter.difficulty = req.query.difficulty.toUpperCase();
  }
  if (req.query.tag && typeof req.query.tag === 'string' && req.query.tag.trim() && req.query.tag.trim() !== 'ALL') {
    const rawTag = req.query.tag.trim();
    filter.tags = { $regex: new RegExp(`^${rawTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
  }

  if (req.query.minRating || req.query.maxRating) {
    filter['metadata.rating'] = {};
    if (req.query.minRating) {
      const min = Number.parseInt(req.query.minRating, 10);
      if (!Number.isNaN(min)) filter['metadata.rating'].$gte = min;
    }
    if (req.query.maxRating) {
      const max = Number.parseInt(req.query.maxRating, 10);
      if (!Number.isNaN(max)) filter['metadata.rating'].$lte = max;
    }
  }

  if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
    const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { externalId: { $regex: escaped, $options: 'i' } },
      { tags: { $regex: escaped, $options: 'i' } }
    ];
  }

  const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '50', 10), 1), 100);

  const [questions, total] = await Promise.all([
    Question.find(filter)
      .sort({ _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Question.countDocuments(filter)
  ]);

  res.json({
    questions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}

async function getQuestion(req, res) {
  const question = await Question.findById(req.params.questionId).lean();

  if (!question) {
    throw httpError(404, 'Question not found');
  }

  res.json({ question });
}

async function createQuestion(req, res) {
  const question = await Question.create(req.body);
  res.status(201).json({ question });
}

async function updateQuestion(req, res) {
  const allowed = ['platform', 'externalId', 'title', 'url', 'tags', 'difficulty', 'metadata'];
  const update = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }

  const question = await Question.findByIdAndUpdate(
    req.params.questionId,
    { $set: update },
    { returnDocument: 'after', runValidators: true }
  );

  if (!question) {
    throw httpError(404, 'Question not found');
  }

  res.json({ question });
}

async function deleteQuestion(req, res) {
  const session = await mongoose.startSession();

  try {
    let deleted;

    await session.withTransaction(async () => {
      deleted = await Question.findByIdAndDelete(req.params.questionId, { session });

      if (!deleted) {
        throw httpError(404, 'Question not found');
      }

      await Promise.all([
        UserQuestionState.deleteMany({ questionId: deleted._id }, { session }),
        LadderQuestion.deleteMany({ questionId: deleted._id }, { session }),
        UserLadderQuestionPractice.deleteMany({ questionId: deleted._id }, { session })
      ]);
    });

    res.json({ message: 'Question deleted' });
  } finally {
    await session.endSession();
  }
}

async function importBulkQuestions(req, res) {
  const rawQuestions = Array.isArray(req.body)
    ? req.body
    : Array.isArray(req.body.questions)
    ? req.body.questions
    : null;

  if (!rawQuestions || rawQuestions.length === 0) {
    throw httpError(400, 'Please provide an array of questions to import');
  }

  if (rawQuestions.length > 5000) {
    throw httpError(400, 'Bulk import limit is 5000 questions per request');
  }

  const validPlatforms = ['LEETCODE', 'CODEFORCES', 'CODECHEF', 'ATCODER'];
  const validDifficulties = ['EASY', 'MEDIUM', 'HARD'];

  const bulkOps = [];
  const errors = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const item = rawQuestions[i];
    const rowNum = i + 1;

    if (!item || typeof item !== 'object') {
      errors.push({ row: rowNum, error: 'Invalid row data' });
      continue;
    }

    const platform = (item.platform || '').trim().toUpperCase();
    const externalId = String(item.externalId || item.id || item.problemId || '').trim();
    const title = (item.title || item.name || '').trim();
    const url = (item.url || item.link || '').trim();

    if (!platform || !validPlatforms.includes(platform)) {
      errors.push({
        row: rowNum,
        externalId,
        error: `Invalid platform "${platform}". Must be LEETCODE, CODEFORCES, CODECHEF, or ATCODER.`
      });
      continue;
    }

    if (!externalId) {
      errors.push({ row: rowNum, error: 'Missing external ID' });
      continue;
    }

    if (!title) {
      errors.push({ row: rowNum, externalId, error: 'Missing title' });
      continue;
    }

    if (!url) {
      errors.push({ row: rowNum, externalId, error: 'Missing URL' });
      continue;
    }

    let tags = [];
    if (Array.isArray(item.tags)) {
      tags = item.tags.map(t => String(t).trim()).filter(Boolean);
    } else if (typeof item.tags === 'string' && item.tags.trim()) {
      tags = item.tags.split(/[,;|]/).map(t => t.trim()).filter(Boolean);
    }

    let difficulty = undefined;
    if (item.difficulty && typeof item.difficulty === 'string') {
      const diffUpper = item.difficulty.trim().toUpperCase();
      if (validDifficulties.includes(diffUpper)) {
        difficulty = diffUpper;
      }
    }

    const questionDoc = {
      platform,
      externalId,
      title,
      url,
      tags,
      ...(difficulty ? { difficulty } : {})
    };

    bulkOps.push({
      updateOne: {
        filter: { platform, externalId },
        update: { $set: questionDoc },
        upsert: true
      }
    });
  }

  if (bulkOps.length === 0) {
    return res.status(400).json({
      message: 'No valid questions could be extracted from input',
      errors
    });
  }

  const result = await Question.bulkWrite(bulkOps, { ordered: false });

  const upsertedCount = result.upsertedCount || 0;
  const modifiedCount = result.modifiedCount || 0;
  const matchedCount = result.matchedCount || 0;

  res.json({
    message: `Successfully processed ${bulkOps.length} questions (${upsertedCount} inserted, ${modifiedCount} updated)`,
    totalSubmitted: rawQuestions.length,
    validProcessed: bulkOps.length,
    inserted: upsertedCount,
    updated: modifiedCount,
    unchanged: matchedCount - modifiedCount,
    errors: errors.slice(0, 50)
  });
}

async function getTags(req, res) {
  const match = {};
  if (req.query.platform && ['LEETCODE', 'CODEFORCES', 'CODECHEF', 'ATCODER'].includes(req.query.platform.toUpperCase())) {
    match.platform = req.query.platform.toUpperCase();
  }
  const tagCounts = await Question.aggregate([
    ...(Object.keys(match).length > 0 ? [{ $match: match }] : []),
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const tags = tagCounts
    .filter(item => item._id && !String(item._id).startsWith('*'))
    .map(item => ({
      name: String(item._id).trim(),
      count: item.count
    }));

  res.json({ tags });
}

module.exports = {
  listQuestions,
  getTags,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  importBulkQuestions
};
