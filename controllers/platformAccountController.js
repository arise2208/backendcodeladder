const PlatformAccount = require('../models/PlatformAccount');
const httpError = require('../utils/httpError');

const PLATFORMS = ['CODEFORCES', 'LEETCODE', 'CODECHEF', 'ATCODER'];

async function listAccounts(req, res) {
  const accounts = await PlatformAccount.find({
    userId: req.user.id
  }).select('platform handle verified lastSyncedAt createdAt updatedAt').lean();

  res.json({ accounts });
}

async function upsertAccount(req, res) {
  const platform = req.params.platform.toUpperCase();

  if (!PLATFORMS.includes(platform)) {
    throw httpError(400, 'Unsupported platform');
  }

  if (typeof req.body.handle !== 'string' || !req.body.handle.trim()) {
    throw httpError(400, 'handle is required');
  }

  const account = await PlatformAccount.findOneAndUpdate(
    {
      userId: req.user.id,
      platform
    },
    {
      $set: {
        handle: req.body.handle.trim(),
        verified: false,
        lastSyncedAt: null
      }
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true
    }
  );

  res.json({ account });
}

async function deleteAccount(req, res) {
  const platform = req.params.platform.toUpperCase();

  if (!PLATFORMS.includes(platform)) {
    throw httpError(400, 'Unsupported platform');
  }

  await PlatformAccount.deleteOne({
    userId: req.user.id,
    platform
  });

  res.json({ message: 'Platform account removed' });
}

module.exports = {
  listAccounts,
  upsertAccount,
  deleteAccount
};
