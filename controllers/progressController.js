const UserQuestionState = require('../models/UserQuestionState');
const Question = require('../models/Question');
const httpError = require('../utils/httpError');

async function getState(req, res) {
  const question = await Question.findById(req.params.questionId).select('_id');

  if (!question) {
    throw httpError(404, 'Question not found');
  }

  const state = await UserQuestionState.findOne({
    userId: req.user.id,
    questionId: question._id
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
  const question = await Question.findById(req.params.questionId).select('_id');

  if (!question) {
    throw httpError(404, 'Question not found');
  }

  const now = new Date();

  const state = await UserQuestionState.findOneAndUpdate(
    {
      userId: req.user.id,
      questionId: question._id
    },
    {
      $set: {
        solved: true,
        solvedAt: now
      },
      $setOnInsert: {
        firstSolvedAt: now
      }
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  res.json({ state });
}

async function unsolve(req, res) {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);

  const state = await UserQuestionState.findOneAndUpdate(
    {
      userId: req.user.id,
      questionId: req.params.questionId,
      solved: true,
      solvedAt: { $gte: cutoff }
    },
    {
      $set: {
        solved: false,
        solvedAt: null
      }
    },
    { returnDocument: 'after' }
  );

  if (!state) {
    const current = await UserQuestionState.findOne({
      userId: req.user.id,
      questionId: req.params.questionId
    }).select('solved solvedAt');

    if (!current) {
      throw httpError(404, 'No solve state exists for this question');
    }

    if (!current.solved) {
      throw httpError(400, 'Question is not currently solved');
    }

    throw httpError(403, 'Solved status is locked and cannot be changed after 2 minutes');
  }

  res.json({ state });
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
  const states = await UserQuestionState.find({
    userId: req.user.id,
    solved: true
  }).select('questionId firstSolvedAt solvedAt').lean();

  const questionIds = states.map(item => item.questionId);
  const questions = await Question.find({
    _id: { $in: questionIds }
  }).lean();

  const stateByQuestion = new Map(
    states.map(state => [String(state.questionId), state])
  );

  res.json({
    questions: questions.map(question => ({
      ...question,
      state: stateByQuestion.get(String(question._id))
    }))
  });
}

async function listStarred(req, res) {
  const states = await UserQuestionState.find({
    userId: req.user.id,
    starred: true
  }).select('questionId solved firstSolvedAt solvedAt starred').lean();

  const questionIds = states.map(item => item.questionId);
  const questions = await Question.find({
    _id: { $in: questionIds }
  }).lean();

  const stateByQuestion = new Map(
    states.map(state => [String(state.questionId), state])
  );

  res.json({
    questions: questions.map(question => ({
      ...question,
      state: stateByQuestion.get(String(question._id))
    }))
  });
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
