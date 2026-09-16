const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const httpError = require('../utils/httpError');

const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '10', 10);
const LOCK_DURATION_MS = parseInt(process.env.LOCK_DURATION_MINUTES || '15', 10) * 60 * 1000;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function signToken(user) {
  const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion || 0
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

async function register(req, res) {
  const { username, email, password } = req.body;

  if (
    typeof username !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    throw httpError(400, 'username, email and password are required');
  }

  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (!/^[A-Za-z0-9_]{3,30}$/.test(cleanUsername)) {
    throw httpError(400, 'Username must be 3-30 characters and contain only letters, numbers or underscore');
  }

  if (!PASSWORD_RE.test(password)) {
    throw httpError(400, 'Password must be at least 8 characters and contain uppercase, lowercase, and a number');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    username: cleanUsername,
    email: cleanEmail,
    passwordHash
  });

  const token = signToken(user);

  res.status(201).json({
    message: 'Registration successful',
    token,
    user: {
      id: user._id,
      username: user.username,
      role: user.role
    }
  });
}

async function login(req, res) {
  const { username, password } = req.body;

  if (typeof username !== 'string' || typeof password !== 'string') {
    throw httpError(400, 'username and password are required');
  }

  const cleanUsername = username.trim();
  const user = await User.findOne({ username: cleanUsername });

  if (!user) {
    // Constant-time execution prevents username enumeration via timing attacks
    await bcrypt.compare(password, '$2b$12$invalidhashfortimingconstancy000000000000000');
    throw httpError(401, 'Invalid username or password');
  }

  if (user.lockUntil && user.lockUntil > Date.now()) {
    const retryAfterSec = Math.ceil((user.lockUntil - Date.now()) / 1000);
    res.setHeader('Retry-After', String(retryAfterSec));
    throw httpError(429, `Account temporarily locked. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`);
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    const newAttempts = (user.loginAttempts || 0) + 1;
    const update = { loginAttempts: newAttempts };
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      update.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
      update.loginAttempts = 0;
    }
    await User.updateOne({ _id: user._id }, { $set: update });
    throw httpError(401, 'Invalid username or password');
  }

  if (user.loginAttempts > 0 || user.lockUntil) {
    await User.updateOne({ _id: user._id }, { $set: { loginAttempts: 0, lockUntil: null } });
  }

  const token = signToken(user);

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user._id,
      username: user.username,
      role: user.role
    }
  });
}

async function me(req, res) {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    }
  });
}

async function logoutAll(req, res) {
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' }
  );

  if (!user) {
    throw httpError(404, 'User not found');
  }

  res.json({
    message: 'All sessions successfully revoked',
    tokenVersion: user.tokenVersion
  });
}

module.exports = { register, login, me, logoutAll };
