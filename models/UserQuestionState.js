const mongoose = require('mongoose');

const userQuestionStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true
    },
    solved: {
      type: Boolean,
      default: false
    },
    firstSolvedAt: {
      type: Date,
      default: null
    },
    solvedAt: {
      type: Date,
      default: null
    },
    starred: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

userQuestionStateSchema.index(
  { userId: 1, questionId: 1 },
  { unique: true }
);
userQuestionStateSchema.index({ userId: 1, solved: 1 });
userQuestionStateSchema.index({ userId: 1, starred: 1 });

module.exports = mongoose.model(
  'UserQuestionState',
  userQuestionStateSchema
);
