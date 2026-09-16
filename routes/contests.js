const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { listContests, getContest } = require('../controllers/contestController');

const router = express.Router();

router.get('/', asyncHandler(listContests));
router.get('/:contestId', asyncHandler(getContest));

module.exports = router;
