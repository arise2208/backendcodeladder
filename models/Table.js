const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Counter = require('./Counter');

const tableSchema = new Schema({
  table_id: { type: Number, unique: true },
  table_title: { type: String, required: true },
  questions: [{ type: Number, required: true }],
  user: [{ type: String, required: true }],
});


tableSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findOneAndUpdate(
      { id: 'table_id' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.table_id = counter.seq;
  }
  next();
});

module.exports = mongoose.model('Table', tableSchema);
