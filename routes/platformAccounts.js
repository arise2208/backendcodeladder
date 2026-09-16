const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const {
  listAccounts,
  upsertAccount,
  deleteAccount,
  syncLeetCodeHistory,
  startLeetCodeChallenge,
  verifyLeetCodeChallenge,
  recordSingleSubmission,
  syncSolvedProblems
} = require('../controllers/platformAccountController');

const router = express.Router();

router.use(auth);

router.get('/', asyncHandler(listAccounts));
router.post('/sync-solved', asyncHandler(syncSolvedProblems));
router.post('/leetcode/challenge/start', asyncHandler(startLeetCodeChallenge));
router.post('/leetcode/challenge/verify', asyncHandler(verifyLeetCodeChallenge));
router.post('/leetcode/submission', asyncHandler(recordSingleSubmission));
router.post('/leetcode/sync', asyncHandler(syncLeetCodeHistory));
router.put('/:platform', asyncHandler(upsertAccount));
router.delete('/:platform', asyncHandler(deleteAccount));

module.exports = router;
