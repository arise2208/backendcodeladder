const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
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
      default: 'N/A',
      trim: true
    },
    // Codeforces, CodeChef, and AtCoder use numeric Elo ratings
    rating: {
      type: Number,
      min: 0,
      index: true,
      default: undefined
    },
    contestId: {
      type: String,
      trim: true,
      default: null,
      index: true
    },
    problemIndex: {
      type: String,
      trim: true,
      default: null
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
questionSchema.index({ platform: 1, rating: 1 });
questionSchema.pre('validate', function () {
  if (this.platform) {
    this.platform = this.platform.toUpperCase();
  }
  if (this.platform !== 'LEETCODE' && !this.difficulty) {
    this.difficulty = 'N/A';
  }
});

module.exports = mongoose.model('Question', questionSchema);
