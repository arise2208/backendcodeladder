const mongoose = require('mongoose');
const Counter = require('./Counter');

const questionSchema = new mongoose.Schema({
  question_id: { type: Number,   unique: true },
  title: { type: String, required: true },
  link: { type: String , required : true , unique : [true , "question with same link already exists "] },
  tags: [{ type: String }],
  solved_by: [{ type: String }]
});

questionSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findOneAndUpdate(
      { id: 'question_id' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.question_id = counter.seq;
  }
  next();
});

module.exports = mongoose.model('Question', questionSchema);
