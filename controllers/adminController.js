const mongoose = require('mongoose');
const User = require('../models/User');
const Ladder = require('../models/Ladder');
const LadderMember = require('../models/LadderMember');
const LadderQuestion = require('../models/LadderQuestion');
const UserQuestionState = require('../models/UserQuestionState');
const UserLadderQuestionPractice = require('../models/UserLadderQuestionPractice');
const PlatformAccount = require('../models/PlatformAccount');
const bcrypt = require('bcrypt');
const Question = require('../models/Question');
const httpError = require('../utils/httpError');

async function listUsers(req, res) {
  const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '50', 10), 1), 100);

  const filter = {};
  if (req.query.role && ['USER', 'ADMIN'].includes(req.query.role.toUpperCase())) {
    filter.role = req.query.role.toUpperCase();
  }

  if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
    const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { username: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } }
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('_id username email role createdAt updatedAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter)
  ]);

  res.json({
    users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}

async function getUser(req, res) {
  const user = await User.findOne({
    username: req.params.username
  }).select('_id username email role createdAt updatedAt').lean();

  if (!user) {
    throw httpError(404, 'User not found');
  }

  const [solvedCount, starredCount, laddersCount, accounts] = await Promise.all([
    UserQuestionState.countDocuments({ userId: user._id, solved: true }),
    UserQuestionState.countDocuments({ userId: user._id, starred: true }),
    Ladder.countDocuments({ ownerId: user._id }),
    PlatformAccount.find({ userId: user._id }).select('platform handle -_id').lean()
  ]);

  res.json({
    user: {
      ...user,
      stats: {
        solvedCount,
        starredCount,
        laddersCount
      },
      platformAccounts: accounts
    }
  });
}

async function updateUserRole(req, res) {
  const { role } = req.body;
  if (!role || !['USER', 'ADMIN'].includes(role.toUpperCase())) {
    throw httpError(400, 'Role must be either USER or ADMIN');
  }

  const targetUser = await User.findOne({ username: req.params.username });
  if (!targetUser) {
    throw httpError(404, 'User not found');
  }

  const normalizedRole = role.toUpperCase();

  // Prevent self-demotion
  if (String(targetUser._id) === String(req.user.id) && normalizedRole !== 'ADMIN') {
    throw httpError(400, 'You cannot demote your own admin account');
  }

  // Protect designated primary admin accounts
  if (['deepanshu', 'admin'].includes(targetUser.username.toLowerCase()) && normalizedRole !== 'ADMIN') {
    throw httpError(400, `Account @${targetUser.username} is protected and cannot be demoted`);
  }

  targetUser.role = normalizedRole;
  await targetUser.save();

  res.json({
    message: `Role updated to ${normalizedRole} for @${targetUser.username}`,
    user: {
      _id: targetUser._id,
      username: targetUser.username,
      email: targetUser.email,
      role: targetUser.role,
      updatedAt: targetUser.updatedAt
    }
  });
}

async function resetUserPassword(req, res) {
  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw httpError(400, 'Password must be at least 8 characters long');
  }

  const targetUser = await User.findOne({ username: req.params.username });
  if (!targetUser) {
    throw httpError(404, 'User not found');
  }

  targetUser.passwordHash = await bcrypt.hash(newPassword, 10);
  await targetUser.save();

  res.json({ message: `Password for @${targetUser.username} has been reset successfully` });
}

async function getAdminStats(req, res) {
  const [
    totalUsers,
    adminUsers,
    totalLadders,
    totalQuestions,
    leetcodeCount,
    codeforcesCount,
    codechefCount,
    atcoderCount,
    totalSolves
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'ADMIN' }),
    Ladder.countDocuments(),
    Question.countDocuments(),
    Question.countDocuments({ platform: 'LEETCODE' }),
    Question.countDocuments({ platform: 'CODEFORCES' }),
    Question.countDocuments({ platform: 'CODECHEF' }),
    Question.countDocuments({ platform: 'ATCODER' }),
    UserQuestionState.countDocuments({ solved: true })
  ]);

  res.json({
    users: {
      total: totalUsers,
      admins: adminUsers,
      standard: totalUsers - adminUsers
    },
    ladders: {
      total: totalLadders
    },
    questions: {
      total: totalQuestions,
      byPlatform: {
        LEETCODE: leetcodeCount,
        CODEFORCES: codeforcesCount,
        CODECHEF: codechefCount,
        ATCODER: atcoderCount
      }
    },
    solves: {
      total: totalSolves
    }
  });
}

async function deleteUser(req, res) {
  const user = await User.findOne({
    username: req.params.username
  }).select('_id username');

  if (!user) {
    throw httpError(404, 'User not found');
  }

  if (String(user._id) === String(req.user.id)) {
    throw httpError(400, 'An admin cannot delete their own account through this endpoint');
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const ownedLadders = await Ladder.find({
        ownerId: user._id
      }).select('_id').session(session);

      const ladderIds = ownedLadders.map(ladder => ladder._id);

      await User.findByIdAndDelete(user._id, { session });

      await Promise.all([
        UserQuestionState.deleteMany({ userId: user._id }, { session }),
        UserLadderQuestionPractice.deleteMany({ userId: user._id }, { session }),
        PlatformAccount.deleteMany({ userId: user._id }, { session }),
        LadderMember.deleteMany({ userId: user._id }, { session }),
        Ladder.deleteMany({ ownerId: user._id }, { session }),
        LadderQuestion.deleteMany({ ladderId: { $in: ladderIds } }, { session }),
        LadderMember.deleteMany({ ladderId: { $in: ladderIds } }, { session }),
        UserLadderQuestionPractice.deleteMany({ ladderId: { $in: ladderIds } }, { session })
      ]);
    });

    res.json({ message: 'User deleted' });
  } finally {
    await session.endSession();
  }
}

async function listLadders(req, res) {
  const ladders = await Ladder.find({})
    .populate('ownerId', 'username')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ ladders });
}

async function deleteLadder(req, res) {
  const ladder = await Ladder.findById(req.params.ladderId).select('_id');

  if (!ladder) {
    throw httpError(404, 'Ladder not found');
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await Ladder.findByIdAndDelete(ladder._id, { session });

      await Promise.all([
        LadderQuestion.deleteMany({ ladderId: ladder._id }, { session }),
        LadderMember.deleteMany({ ladderId: ladder._id }, { session }),
        UserLadderQuestionPractice.deleteMany({ ladderId: ladder._id }, { session })
      ]);
    });

    res.json({ message: 'Ladder deleted' });
  } finally {
    await session.endSession();
  }
}

module.exports = {
  listUsers,
  getUser,
  updateUserRole,
  resetUserPassword,
  deleteUser,
  listLadders,
  deleteLadder,
  getAdminStats
};
