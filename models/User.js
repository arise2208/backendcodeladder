const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  username: { type: String, required: true, unique : [ true , "username already exists"] },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  tables: [{ type: Number }]
});

module.exports = mongoose.model('User', userSchema);
