const mongoose = require('mongoose');
const questionCatalog = require('../services/questionCatalog');
const UserQuestionState = require('../models/UserQuestionState');
const Question = require('../models/Question');
const httpError = require('../utils/httpError');

async function getState(req, res) {
  const catalogQ = questionCatalog.getQuestionById(req.params.questionId);
  if (!catalogQ) {
    const question = await Question.findById(req.params.questionId).select('_id');
    if (!question) {
      throw httpError(404, 'Question not found');
    }
  }

  const state = await UserQuestionState.findOne({
    userId: req.user.id,
    questionId: req.params.questionId
  }).lean();

  res.json({
    state: state || {
      solved: false,
      firstSolvedAt: null,
      solvedAt: null,
      starred: false
    }
  });
}

async function solve(req, res) {
  throw httpError(
    501,
    "Manual solve marking has been retired. Problem solve states are verified and synchronized automatically from your connected platform accounts (LeetCode, Codeforces, CodeChef)."
  );
}

async function unsolve(req, res) {
  throw httpError(
    501,
    "Manual unsolve has been retired. Problem solve states are verified and synchronized automatically from your connected platform accounts (LeetCode, Codeforces, CodeChef)."
  );
}

async function setStar(req, res) {
  const starred = req.body.starred;

  if (typeof starred !== 'boolean') {
    throw httpError(400, 'starred must be a boolean');
  }

  const state = await UserQuestionState.findOneAndUpdate(
    {
      userId: req.user.id,
      questionId: req.params.questionId
    },
    {
      $set: { starred },
      $setOnInsert: { solved: false }
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  res.json({ state });
}

async function removeStar(req, res) {
  const state = await UserQuestionState.findOneAndUpdate(
    {
      userId: req.user.id,
      questionId: req.params.questionId
    },
    {
      $set: { starred: false },
      $setOnInsert: { solved: false }
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  res.json({ state });
}

async function listSolved(req, res) {
  try {
    const states = await UserQuestionState.find({
      userId: req.user.id,
      solved: true
    }).select('questionId firstSolvedAt solvedAt').lean().catch(() => []);

    const questionIds = states.map(item => item.questionId);
    const resolvedMap = new Map();
    const missingFromCatalog = [];

    for (const qid of questionIds) {
      const q = questionCatalog.getQuestionById(qid);
      if (q) {
        resolvedMap.set(String(qid), q);
      } else {
        missingFromCatalog.push(qid);
      }
    }

    if (missingFromCatalog.length > 0) {
      const validIds = missingFromCatalog.filter(id => mongoose.isValidObjectId(id));
      if (validIds.length > 0) {
        const mongoQuestions = await Question.find({ _id: { $in: validIds } }).lean().catch(() => []);
        mongoQuestions.forEach(q => resolvedMap.set(String(q._id), q));
      }
    }

    const stateByQuestion = new Map(
      states.map(state => [String(state.questionId), state])
    );

    const questions = questionIds.map(qid => resolvedMap.get(String(qid))).filter(Boolean);

    res.json({
      questions: questions.map(question => ({
        ...question,
        state: stateByQuestion.get(String(question._id)) || { solved: true }
      }))
    });
  } catch (err) {
    console.error('Error in listSolved:', err);
    res.json({ questions: [] });
  }
}

async function listStarred(req, res) {
  try {
    const states = await UserQuestionState.find({
      userId: req.user.id,
      starred: true
    }).select('questionId solved firstSolvedAt solvedAt starred').lean().catch(() => []);

    const questionIds = states.map(item => item.questionId);
    const resolvedMap = new Map();
    const missingFromCatalog = [];

    for (const qid of questionIds) {
      const q = questionCatalog.getQuestionById(qid);
      if (q) {
        resolvedMap.set(String(qid), q);
      } else {
        missingFromCatalog.push(qid);
      }
    }

    if (missingFromCatalog.length > 0) {
      const validIds = missingFromCatalog.filter(id => mongoose.isValidObjectId(id));
      if (validIds.length > 0) {
        const mongoQuestions = await Question.find({ _id: { $in: validIds } }).lean().catch(() => []);
        mongoQuestions.forEach(q => resolvedMap.set(String(q._id), q));
      }
    }

    const stateByQuestion = new Map(
      states.map(state => [String(state.questionId), state])
    );

    const questions = questionIds.map(qid => resolvedMap.get(String(qid))).filter(Boolean);

    res.json({
      questions: questions.map(question => ({
        ...question,
        state: stateByQuestion.get(String(question._id)) || { starred: true }
      }))
    });
  } catch (err) {
    console.error('Error in listStarred:', err);
    res.json({ questions: [] });
  }
}

module.exports = {
  getState,
  solve,
  unsolve,
  setStar,
  removeStar,
  listSolved,
  listStarred
};
