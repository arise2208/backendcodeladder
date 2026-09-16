const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const httpError = require('../utils/httpError');

function signToken(user) {
  const expiresIn = process.env.JWT_EXPIRES_IN || "1d";
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

  if (cleanPassword(password).length < 8) {
    throw httpError(400, 'Password must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    console.log(`[Auth:Register] Creating user "${cleanUsername}" in database "${User.db.name}" (${User.db.host}:${User.db.port})`);
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
  } catch (error) {
    throw error;
  }
}

function cleanPassword(password) {
  return password;
}

async function login(req, res) {
  const { username, password } = req.body;

  if (typeof username !== 'string' || typeof password !== 'string') {
    throw httpError(400, 'username and password are required');
  }

  const cleanUsername = username.trim();
  console.log(`[Auth:Login] Querying user "${cleanUsername}" from database "${User.db.name}" (${User.db.host}:${User.db.port})`);
  const user = await User.findOne({ username: cleanUsername });

  if (!user) {
    throw httpError(401, 'Invalid username or password');
  }
  

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    throw httpError(401, 'Invalid username or password');
  }

  const token = signToken(user);
  const effectiveRole = user.role;

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user._id,
      username: user.username,
      role: effectiveRole
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
    { returnDocument: "after" }
  );

  if (!user) {
    throw httpError(404, "User not found");
  }

  res.json({
    message: "All sessions successfully revoked",
    tokenVersion: user.tokenVersion
  });
}

module.exports = { register, login, me, logoutAll };
