const mongoose = require('mongoose');

const ladderMemberSchema = new mongoose.Schema(
  {
    ladderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ladder',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['READ', 'WRITE'],
      default: 'READ'
    }
  },
  { timestamps: true }
);

ladderMemberSchema.index(
  { ladderId: 1, userId: 1 },
  { unique: true }
);
ladderMemberSchema.index({ userId: 1, ladderId: 1 });

module.exports = mongoose.model('LadderMember', ladderMemberSchema);
