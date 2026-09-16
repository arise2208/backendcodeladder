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
  syncSolvedProblems,
  recordCodeChefSubmission,
  syncCodeChefHistory,
  fetchLeetCodeUserData,
  fetchCodeChefUserData
} = require('../controllers/platformAccountController');

const router = express.Router();

router.use(auth);

router.get('/', asyncHandler(listAccounts));
router.post('/sync-solved', asyncHandler(syncSolvedProblems));
router.post('/leetcode/fetch-user', asyncHandler(fetchLeetCodeUserData));
router.get('/leetcode/user/:handle', asyncHandler(fetchLeetCodeUserData));
router.post('/leetcode/challenge/start', asyncHandler(startLeetCodeChallenge));
router.post('/leetcode/challenge/verify', asyncHandler(verifyLeetCodeChallenge));
router.post('/leetcode/submission', asyncHandler(recordSingleSubmission));
router.post('/leetcode/sync', asyncHandler(syncLeetCodeHistory));

router.post('/codechef/fetch-user', asyncHandler(fetchCodeChefUserData));
router.get('/codechef/user/:handle', asyncHandler(fetchCodeChefUserData));
router.post('/codechef/submission', asyncHandler(recordCodeChefSubmission));
router.post('/codechef/sync', asyncHandler(syncCodeChefHistory));

router.put('/:platform', asyncHandler(upsertAccount));
router.delete('/:platform', asyncHandler(deleteAccount));

module.exports = router;
