const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Question = require('../models/Question');
const Ladder = require('../models/Ladder');
const LadderQuestion = require('../models/LadderQuestion');
const LadderMember = require('../models/LadderMember');
const UserLadderQuestionPractice = require('../models/UserLadderQuestionPractice');
const UserQuestionState = require('../models/UserQuestionState');

async function clearData() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeladder';
  console.log('Connecting to MongoDB at:', uri);
  await mongoose.connect(uri);

  const [qRes, lRes, lqRes, lmRes, ulpRes, uqsRes] = await Promise.all([
    Question.deleteMany({}),
    Ladder.deleteMany({}),
    LadderQuestion.deleteMany({}),
    LadderMember.deleteMany({}),
    UserLadderQuestionPractice.deleteMany({}),
    UserQuestionState.deleteMany({})
  ]);

  console.log('Successfully cleared from MongoDB:');
  console.log(`- Questions deleted: ${qRes.deletedCount}`);
  console.log(`- Ladders deleted: ${lRes.deletedCount}`);
  console.log(`- Ladder Questions deleted: ${lqRes.deletedCount}`);
  console.log(`- Ladder Members deleted: ${lmRes.deletedCount}`);
  console.log(`- User Ladder Practice deleted: ${ulpRes.deletedCount}`);
  console.log(`- User Question States deleted: ${uqsRes.deletedCount}`);

  await mongoose.connection.close();
  console.log('MongoDB connection closed cleanly.');
}

clearData().catch((err) => {
  console.error('Error clearing data:', err);
  process.exit(1);
});
