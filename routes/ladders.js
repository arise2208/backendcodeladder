const express = require('express');

const asyncHandler = require('../utils/asyncHandler');

const auth = require('../middleware/auth');
const validateObjectId = require('../middleware/validateObjectId');

const {
  ladderWriteLimiter
} = require('../middleware/rateLimit');

const {
  loadLadderAccess,
  requireLadderAccess,
  requireLadderWrite,
  requireLadderOwner
} = require('../middleware/ladderAccess');

const {
  createLadder,
  listLadders,
  getLadder,
  updateLadder,
  deleteLadder,
  addQuestion,
  removeQuestion,
  reorderQuestions,
  getPractice,
  practise,
  unpractise,
  clearPractice,
  setMode,
  getRevision,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  publishLadder,
  listMarketplaceLadders,
  voteLadder
} = require('../controllers/ladderController');

const router = express.Router();


// --------------------------------------------------
// Authentication
// --------------------------------------------------

router.use(auth);


// --------------------------------------------------
// Ladders
// --------------------------------------------------

router.get(
  '/marketplace',
  asyncHandler(listMarketplaceLadders)
);

router.get(
  '/',
  asyncHandler(listLadders)
);

router.post(
  '/',
  ladderWriteLimiter,
  asyncHandler(createLadder)
);

router.post(
  '/:ladderId/publish',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderOwner,
  asyncHandler(publishLadder)
);

router.post(
  '/:ladderId/vote',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderAccess,
  asyncHandler(voteLadder)
);

router.get(
  '/:ladderId',
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderAccess,
  asyncHandler(getLadder)
);

router.put(
  '/:ladderId',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderWrite,
  asyncHandler(updateLadder)
);

router.delete(
  '/:ladderId',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderOwner,
  asyncHandler(deleteLadder)
);


// --------------------------------------------------
// Ladder questions
// --------------------------------------------------

router.post(
  '/:ladderId/questions',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderWrite,
  asyncHandler(addQuestion)
);

router.put(
  '/:ladderId/questions/reorder',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderWrite,
  asyncHandler(reorderQuestions)
);

router.delete(
  '/:ladderId/questions/:questionId',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  validateObjectId('questionId'),
  loadLadderAccess,
  requireLadderWrite,
  asyncHandler(removeQuestion)
);


// --------------------------------------------------
// Practice
// --------------------------------------------------

router.get(
  '/:ladderId/questions/:questionId/practice',
  validateObjectId('ladderId'),
  validateObjectId('questionId'),
  loadLadderAccess,
  requireLadderAccess,
  asyncHandler(getPractice)
);

router.post(
  '/:ladderId/questions/:questionId/practise',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  validateObjectId('questionId'),
  loadLadderAccess,
  requireLadderAccess,
  asyncHandler(practise)
);

router.delete(
  '/:ladderId/questions/:questionId/practise',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  validateObjectId('questionId'),
  loadLadderAccess,
  requireLadderAccess,
  asyncHandler(unpractise)
);

router.post(
  '/:ladderId/practise/clear',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderAccess,
  asyncHandler(clearPractice)
);


// --------------------------------------------------
// Revision mode
// --------------------------------------------------

router.put(
  '/:ladderId/mode',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderOwner,
  asyncHandler(setMode)
);

router.get(
  '/:ladderId/revision',
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderAccess,
  asyncHandler(getRevision)
);


// --------------------------------------------------
// Members
// --------------------------------------------------

router.get(
  '/:ladderId/members',
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderAccess,
  asyncHandler(listMembers)
);

router.post(
  '/:ladderId/members',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderOwner,
  asyncHandler(addMember)
);

router.put(
  '/:ladderId/members/:username',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderOwner,
  asyncHandler(updateMember)
);

router.delete(
  '/:ladderId/members/:username',
  ladderWriteLimiter,
  validateObjectId('ladderId'),
  loadLadderAccess,
  requireLadderOwner,
  asyncHandler(removeMember)
);

module.exports = router;