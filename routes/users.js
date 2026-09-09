const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const {
  getPublicProfile,
  getStats
} = require('../controllers/userController');

const router = express.Router();

router.get('/:username/stats', asyncHandler(getStats));
router.get('/:username', asyncHandler(getPublicProfile));

module.exports = router;
