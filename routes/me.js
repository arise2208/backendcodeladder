const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const {
  listSolved,
  listStarred
} = require('../controllers/progressController');

const router = express.Router();

router.use(auth);

router.get('/questions/solved', asyncHandler(listSolved));
router.get('/questions/starred', asyncHandler(listStarred));

module.exports = router;
