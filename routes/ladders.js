const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const optionalAuth = auth.optionalAuth || require('../middleware/auth').optionalAuth;
const validateObjectId = require('../middleware/validateObjectId');
const { ladderWriteLimiter } = require('../middleware/rateLimit');
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
  transferOwnership,
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

router.get('/marketplace', optionalAuth, asyncHandler(listMarketplaceLadders));
router.get('/', auth, asyncHandler(listLadders));
router.post('/', auth, ladderWriteLimiter, asyncHandler(createLadder));

router.post('/:ladderId/publish', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderOwner, asyncHandler(publishLadder));
router.post('/:ladderId/vote', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderAccess, asyncHandler(voteLadder));
router.get('/:ladderId', optionalAuth, validateObjectId('ladderId'), loadLadderAccess, requireLadderAccess, asyncHandler(getLadder));
router.put('/:ladderId', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderWrite, asyncHandler(updateLadder));
router.post('/:ladderId/transfer-ownership', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderOwner, asyncHandler(transferOwnership));
router.delete('/:ladderId', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderOwner, asyncHandler(deleteLadder));

router.post('/:ladderId/questions', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderWrite, asyncHandler(addQuestion));
router.put('/:ladderId/questions/reorder', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderWrite, asyncHandler(reorderQuestions));
router.delete('/:ladderId/questions/:questionId', auth, ladderWriteLimiter, validateObjectId('ladderId'), validateObjectId('questionId'), loadLadderAccess, requireLadderWrite, asyncHandler(removeQuestion));

router.get('/:ladderId/questions/:questionId/practice', auth, validateObjectId('ladderId'), validateObjectId('questionId'), loadLadderAccess, requireLadderAccess, asyncHandler(getPractice));
router.post('/:ladderId/questions/:questionId/practise', auth, ladderWriteLimiter, validateObjectId('ladderId'), validateObjectId('questionId'), loadLadderAccess, requireLadderAccess, asyncHandler(practise));
router.delete('/:ladderId/questions/:questionId/practise', auth, ladderWriteLimiter, validateObjectId('ladderId'), validateObjectId('questionId'), loadLadderAccess, requireLadderAccess, asyncHandler(unpractise));
router.post('/:ladderId/practise/clear', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderAccess, asyncHandler(clearPractice));

router.put('/:ladderId/mode', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderAccess, asyncHandler(setMode));
router.get('/:ladderId/revision', auth, validateObjectId('ladderId'), loadLadderAccess, requireLadderAccess, asyncHandler(getRevision));

router.get('/:ladderId/members', auth, validateObjectId('ladderId'), loadLadderAccess, requireLadderAccess, asyncHandler(listMembers));
router.post('/:ladderId/members', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderOwner, asyncHandler(addMember));
router.put('/:ladderId/members/:username', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderOwner, asyncHandler(updateMember));
router.delete('/:ladderId/members/:username', auth, ladderWriteLimiter, validateObjectId('ladderId'), loadLadderAccess, requireLadderOwner, asyncHandler(removeMember));

module.exports = router;
