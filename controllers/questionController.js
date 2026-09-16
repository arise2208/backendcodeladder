const questionCatalog = require('../services/questionCatalog');
const mongoose = require('mongoose');
const Question = require('../models/Question');
const UserQuestionState = require('../models/UserQuestionState');
const LadderQuestion = require('../models/LadderQuestion');
const UserLadderQuestionPractice = require('../models/UserLadderQuestionPractice');
const httpError = require('../utils/httpError');

async function listQuestions(req, res) {
  try {
    const filters = {
      platform: typeof req.query.platform === 'string' ? req.query.platform : undefined,
      difficulty: typeof req.query.difficulty === 'string' ? req.query.difficulty : undefined,
      tag: typeof req.query.tag === 'string' ? req.query.tag : undefined,
      minRating: req.query.minRating,
      maxRating: req.query.maxRating,
      search: typeof req.query.search === 'string' ? req.query.search : undefined
    };

    const page = req.query.page || 1;
    const limit = req.query.limit || 20;

    let result = null;
    if (questionCatalog.isLoaded) {
      result = questionCatalog.getPaginatedQuestions(filters, page, limit);
    }

    if (result && Array.isArray(result.questions) && (result.questions.length > 0 || (result.pagination && result.pagination.total !== undefined))) {
      return res.json(result);
    }

    // Fallback if catalog is empty or not loaded
    const query = {};
    if (filters.platform && filters.platform !== 'ALL') query.platform = filters.platform.toUpperCase();
    if (filters.difficulty && filters.difficulty !== 'ALL') query.difficulty = filters.difficulty.toUpperCase();
    if (filters.tag && filters.tag !== 'ALL') query.tags = filters.tag;
    if (filters.minRating || filters.maxRating) {
      query.rating = {};
      if (filters.minRating) query.rating.$gte = Number(filters.minRating);
      if (filters.maxRating) query.rating.$lte = Number(filters.maxRating);
    }
    if (filters.search) {
      query.$or = [
        { title: { $regex: filters.search.slice(0, 100), $options: 'i' } },
        { externalId: { $regex: filters.search.slice(0, 100), $options: 'i' } }
      ];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

    const [total, questions] = await Promise.all([
      Question.countDocuments(query).catch(() => 0),
      Question.find(query).skip((pageNum - 1) * limitNum).limit(limitNum).lean().catch(() => [])
    ]);

    const pages = Math.ceil(total / limitNum) || 1;
    res.json({
      questions: questions || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total || (questions ? questions.length : 0),
        pages,
        totalPages: pages
      }
    });
  } catch (err) {
    console.error('Error in listQuestions:', err);
    res.json({
      questions: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        pages: 1,
        totalPages: 1
      }
    });
  }
}

async function getQuestion(req, res) {
  try {
    const catalogQuestion = questionCatalog.getQuestionById(req.params.questionId);
    if (catalogQuestion) {
      return res.json({ question: catalogQuestion });
    }

    if (mongoose.isValidObjectId(req.params.questionId)) {
      const question = await Question.findById(req.params.questionId).lean().catch(() => null);
      if (question) {
        return res.json({ question });
      }
    }

    throw httpError(404, 'Question not found');
  } catch (err) {
    if (err.statusCode) throw err;
    throw httpError(404, 'Question not found');
  }
}

async function createQuestion(req, res) {
  const question = await Question.create(req.body);
  res.status(201).json({ question });
}

async function updateQuestion(req, res) {
  const allowed = ['platform', 'externalId', 'title', 'url', 'tags', 'difficulty', 'rating', 'metadata'];
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
  const validDifficulties = ['EASY', 'MEDIUM', 'HARD', 'N/A'];

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

    let rating = undefined;
    if (item.rating !== undefined && item.rating !== '' && !isNaN(Number(item.rating))) {
      rating = Number(item.rating);
    }

    const questionDoc = {
      platform,
      externalId,
      title,
      url,
      tags,
      ...(difficulty ? { difficulty } : platform === 'LEETCODE' ? {} : { difficulty: 'N/A' }),
      ...(rating !== undefined ? { rating } : {})
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
  const tags = questionCatalog.getTags(req.query.platform);
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
