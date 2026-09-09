const mongoose = require('mongoose');

const ladderQuestionSchema = new mongoose.Schema(
  {
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
    order: {
      type: Number,
      required: true
    }
  },
  { timestamps: true }
);

ladderQuestionSchema.index(
  { ladderId: 1, questionId: 1 },
  { unique: true }
);
ladderQuestionSchema.index({ ladderId: 1, order: 1 });

module.exports = mongoose.model('LadderQuestion', ladderQuestionSchema);
