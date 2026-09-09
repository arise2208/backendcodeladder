const mongoose = require('mongoose');

const ladderSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    mode: {
      type: String,
      enum: ['NORMAL', 'REVISION'],
      default: 'NORMAL'
    },
    revisionStartedAt: {
      type: Date,
      default: null
    },
    isPublic: {
      type: Boolean,
      default: false,
      index: true
    },
    publishedAt: {
      type: Date,
      default: null
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    votes: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      vote: {
        type: String,
        enum: ['LIKE', 'DISLIKE'],
        required: true
      },
      votedAt: {
        type: Date,
        default: Date.now
      }
    }],
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    dislikes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ladder', ladderSchema);
