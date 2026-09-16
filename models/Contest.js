const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
      index: true
    },
    externalId: {
      type: String,
      trim: true,
      default: ''
    },
    index: {
      type: String,
      required: true,
      trim: true
    }, // 'A', 'B' (CF), 'P1', 'P2' (CC), or 'Q1', 'Q2' (LC)
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
    difficulty: {
      type: String,
      default: 'Unknown',
      trim: true
    }, // String only (e.g. 'Easy', 'Medium', 'Hard', 'N/A') - NO ENUM
    rating: {
      type: Number,
      default: null
    }, // Codeforces Elo rating (e.g. 800, 1400)
    tags: {
      type: [String],
      default: []
    },
    points: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const contestSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      enum: ['CODEFORCES', 'LEETCODE', 'CODECHEF', 'ATCODER'],
      index: true
    }, // String only (e.g. 'CODEFORCES', 'LEETCODE', 'CODECHEF') - NO ENUM
    contestId: {
      type: String, // String handles LC slugs/IDs & CF integer IDs uniformly
      required: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    url: {
      type: String,
      required: true,
      trim: true
    },
    // LeetCode: 'WEEKLY' | 'BIWEEKLY'
    // Codeforces: 'DIV1' | 'DIV2' | 'DIV3' | 'DIV4' | 'EDU' | 'GLOBAL' | 'OTHER'
    // CodeChef: 'STARTERS' | 'LONG' | 'COOKOFF'
    category: {
      type: String,
      required: true,
      index: true,
      uppercase: true,
      trim: true
    },
    startTime: {
      type: Date,
      required: true,
      index: true
    },
    durationSeconds: {
      type: Number,
      default: 0
    },
    phase: {
      type: String,
      default: 'FINISHED',
      trim: true
    }, // String only, NO ENUM
    division: {
      type: String,
      default: '',
      trim: true
    },
    problems: [problemSchema]
  },
  { timestamps: true }
);

// Compound indexes for fast grid filtering
contestSchema.index({ platform: 1, contestId: 1 }, { unique: true });
contestSchema.index({ platform: 1, category: 1, startTime: -1 });
contestSchema.index({ platform: 1, startTime: -1 });

const Contest = mongoose.model('Contest', contestSchema);

module.exports = Contest;
module.exports.Contest = Contest;
module.exports.default = Contest;
