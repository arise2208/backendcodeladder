const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { register, login, me, logoutAll } = require('../controllers/authController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.get('/me', auth, asyncHandler(me));
router.post('/logout-all', auth, asyncHandler(logoutAll));

module.exports = router;
