const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const {
  listAccounts,
  upsertAccount,
  deleteAccount
} = require('../controllers/platformAccountController');

const router = express.Router();

router.use(auth);

router.get('/', asyncHandler(listAccounts));
router.put('/:platform', asyncHandler(upsertAccount));
router.delete('/:platform', asyncHandler(deleteAccount));

module.exports = router;
