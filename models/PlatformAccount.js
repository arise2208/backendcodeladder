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
