const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      enum: ['LEETCODE', 'CODEFORCES', 'CODECHEF', 'ATCODER'],
      index: true
    },
    externalId: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    url: {
      type: String,
      required: true,
      trim: true
    },
    tags: {
      type: [String],
      default: []
    },
    difficulty: {
      type: String,
      enum: ['EASY', 'MEDIUM', 'HARD'],
      default: undefined
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

questionSchema.index(
  { platform: 1, externalId: 1 },
  { unique: true }
);

module.exports = mongoose.model('Question', questionSchema);
