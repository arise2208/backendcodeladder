const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true,
    ref: 'User'
  },
  questions: [{
    questionId: { type: String, required: true },
    marked: { type: Boolean, default: true },
    date: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('Submission', SubmissionSchema);