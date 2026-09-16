const fs = require('fs');
const path = require('path');

// 1. Patch questionController.js
const qcPath = path.join(__dirname, '../controllers/questionController.js');
let qcContent = fs.readFileSync(qcPath, 'utf8');

if (!qcContent.includes("const questionCatalog = require('../services/questionCatalog');")) {
  qcContent = "const questionCatalog = require('../services/questionCatalog');\n" + qcContent;
}

const oldListRegex = /async function listQuestions\(req, res\) \{[\s\S]*?res\.json\(\{\s*questions,[\s\S]*?\}\);\s*\}/;
const newListQuestions = `async function listQuestions(req, res) {
  const filters = {
    platform: req.query.platform,
    difficulty: req.query.difficulty,
    tag: req.query.tag,
    minRating: req.query.minRating,
    maxRating: req.query.maxRating,
    search: req.query.search
  };

  const page = req.query.page || 1;
  const limit = req.query.limit || 20;

  const result = questionCatalog.getPaginatedQuestions(filters, page, limit);
  res.json(result);
}`;

qcContent = qcContent.replace(oldListRegex, newListQuestions);

const oldGetRegex = /async function getQuestion\(req, res\) \{[\s\S]*?res\.json\(\{ question \}\);\s*\}/;
const newGetQuestion = `async function getQuestion(req, res) {
  const catalogQuestion = questionCatalog.getQuestionById(req.params.questionId);
  if (catalogQuestion) {
    return res.json({ question: catalogQuestion });
  }

  const question = await Question.findById(req.params.questionId).lean();
  if (!question) {
    throw httpError(404, 'Question not found');
  }

  res.json({ question });
}`;

qcContent = qcContent.replace(oldGetRegex, newGetQuestion);

const oldTagsRegex = /async function getTags\(req, res\) \{[\s\S]*?res\.json\(\{ tags \}\);\s*\}/;
const newGetTags = `async function getTags(req, res) {
  const tags = questionCatalog.getTags(req.query.platform);
  res.json({ tags });
}`;

qcContent = qcContent.replace(oldTagsRegex, newGetTags);

fs.writeFileSync(qcPath, qcContent, 'utf8');
console.log('Successfully patched questionController.js');

// 2. Patch progressController.js
const pcPath = path.join(__dirname, '../controllers/progressController.js');
let pcContent = fs.readFileSync(pcPath, 'utf8');

if (!pcContent.includes("const questionCatalog = require('../services/questionCatalog');")) {
  pcContent = "const questionCatalog = require('../services/questionCatalog');\n" + pcContent;
}

// Update getState to check catalog first
const oldGetStateRegex = /async function getState\(req, res\) \{[\s\S]*?res\.json\(\{\s*state:[\s\S]*?\}\);\s*\}/;
const newGetState = `async function getState(req, res) {
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
}`;

pcContent = pcContent.replace(oldGetStateRegex, newGetState);

// Update listSolved and listStarred to resolve questions via catalog
const oldListSolvedRegex = /async function listSolved\(req, res\) \{[\s\S]*?res\.json\(\{\s*questions:[\s\S]*?\}\);\s*\}/;
const newListSolved = `async function listSolved(req, res) {
  const states = await UserQuestionState.find({
    userId: req.user.id,
    solved: true
  }).select('questionId firstSolvedAt solvedAt').lean();

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
    const mongoQuestions = await Question.find({ _id: { $in: missingFromCatalog } }).lean();
    mongoQuestions.forEach(q => resolvedMap.set(String(q._id), q));
  }

  const stateByQuestion = new Map(
    states.map(state => [String(state.questionId), state])
  );

  const questions = questionIds.map(qid => resolvedMap.get(String(qid))).filter(Boolean);

  res.json({
    questions: questions.map(question => ({
      ...question,
      state: stateByQuestion.get(String(question._id))
    }))
  });
}`;

pcContent = pcContent.replace(oldListSolvedRegex, newListSolved);

const oldListStarredRegex = /async function listStarred\(req, res\) \{[\s\S]*?res\.json\(\{\s*questions:[\s\S]*?\}\);\s*\}/;
const newListStarred = `async function listStarred(req, res) {
  const states = await UserQuestionState.find({
    userId: req.user.id,
    starred: true
  }).select('questionId solved firstSolvedAt solvedAt starred').lean();

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
    const mongoQuestions = await Question.find({ _id: { $in: missingFromCatalog } }).lean();
    mongoQuestions.forEach(q => resolvedMap.set(String(q._id), q));
  }

  const stateByQuestion = new Map(
    states.map(state => [String(state.questionId), state])
  );

  const questions = questionIds.map(qid => resolvedMap.get(String(qid))).filter(Boolean);

  res.json({
    questions: questions.map(question => ({
      ...question,
      state: stateByQuestion.get(String(question._id))
    }))
  });
}`;

pcContent = pcContent.replace(oldListStarredRegex, newListStarred);

fs.writeFileSync(pcPath, pcContent, 'utf8');
console.log('Successfully patched progressController.js');
