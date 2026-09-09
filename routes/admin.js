const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const validateObjectId = require('../middleware/validateObjectId');
const {
  listUsers,
  getUser,
  updateUserRole,
  resetUserPassword,
  deleteUser,
  listLadders,
  deleteLadder,
  getAdminStats
} = require('../controllers/adminController');
const {
  listQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  importBulkQuestions
} = require('../controllers/questionController');

const router = express.Router();

router.use(auth, admin);

router.get('/stats', asyncHandler(getAdminStats));

router.get('/users', asyncHandler(listUsers));
router.get('/users/:username', asyncHandler(getUser));
router.patch('/users/:username/role', asyncHandler(updateUserRole));
router.post('/users/:username/reset-password', asyncHandler(resetUserPassword));
router.delete('/users/:username', asyncHandler(deleteUser));

router.get('/ladders', asyncHandler(listLadders));
router.delete(
  '/ladders/:ladderId',
  validateObjectId('ladderId'),
  asyncHandler(deleteLadder)
);

router.get('/questions', asyncHandler(listQuestions));
router.post('/questions', asyncHandler(createQuestion));
router.post('/questions/bulk', asyncHandler(importBulkQuestions));
router.get(
  '/questions/:questionId',
  validateObjectId('questionId'),
  asyncHandler(getQuestion)
);
router.put(
  '/questions/:questionId',
  validateObjectId('questionId'),
  asyncHandler(updateQuestion)
);
router.delete(
  '/questions/:questionId',
  validateObjectId('questionId'),
  asyncHandler(deleteQuestion)
);

module.exports = router;
