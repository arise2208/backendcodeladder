const mongoose = require('mongoose');

const userLadderQuestionPracticeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    ladderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ladder',
      required: true,
      index: true
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
      index: true
    },
    practised: {
      type: Boolean,
      default: false
    },
    practisedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

userLadderQuestionPracticeSchema.index(
  { userId: 1, ladderId: 1, questionId: 1 },
  { unique: true }
);

userLadderQuestionPracticeSchema.index({
  userId: 1,
  ladderId: 1,
  practised: 1
});

module.exports = mongoose.model(
  'UserLadderQuestionPractice',
  userLadderQuestionPracticeSchema
);
