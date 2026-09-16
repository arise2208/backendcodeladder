const mongoose = require('mongoose');

const platformAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    platform: {
      type: String,
      enum: ['CODEFORCES', 'LEETCODE', 'CODECHEF', 'ATCODER'],
      required: true
    },
    handle: {
      type: String,
      required: true,
      trim: true
    },
    verified: {
      type: Boolean,
      default: false
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    verificationChallenge: {
      problemSlug: { type: String, default: null },
      problemTitle: { type: String, default: null },
      expectedStatus: { type: String, default: 'Accepted' },
      verificationCode: { type: String, default: null },
      language: { type: String, default: 'python3' },
      code: { type: String, default: null },
      startedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null }
    },
    lastSyncedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

platformAccountSchema.index(
  { userId: 1, platform: 1 },
  { unique: true }
);
platformAccountSchema.index({ platform: 1, handle: 1 });

module.exports = mongoose.model('PlatformAccount', platformAccountSchema);
