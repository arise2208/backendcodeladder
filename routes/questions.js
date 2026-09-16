const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const validateObjectId = require('../middleware/validateObjectId');
const { progressLimiter } = require('../middleware/rateLimit');
const {
  listQuestions,
  getTags,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  importBulkQuestions
} = require('../controllers/questionController');
const {
  getState,
  solve,
  unsolve,
  setStar,
  removeStar
} = require('../controllers/progressController');

const router = express.Router();

router.get('/', asyncHandler(listQuestions));
router.get('/tags', asyncHandler(getTags));

router.get('/:questionId/state', auth, validateObjectId('questionId'), asyncHandler(getState));
router.post('/:questionId/solve', auth, progressLimiter, validateObjectId('questionId'), asyncHandler(solve));
router.post('/:questionId/unsolve', auth, progressLimiter, validateObjectId('questionId'), asyncHandler(unsolve));
router.put('/:questionId/star', auth, progressLimiter, validateObjectId('questionId'), asyncHandler(setStar));
router.delete('/:questionId/star', auth, progressLimiter, validateObjectId('questionId'), asyncHandler(removeStar));

router.get('/:questionId', validateObjectId('questionId'), asyncHandler(getQuestion));

router.post('/', auth, admin, asyncHandler(createQuestion));
router.post('/bulk', auth, admin, asyncHandler(importBulkQuestions));
router.put('/:questionId', auth, admin, validateObjectId('questionId'), asyncHandler(updateQuestion));
router.delete('/:questionId', auth, admin, validateObjectId('questionId'), asyncHandler(deleteQuestion));

module.exports = router;
