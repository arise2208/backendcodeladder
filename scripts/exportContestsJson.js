const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Contest = require('../models/Contest');

const FRONTEND_DIR = '/Users/dep/Desktop/codeladder';
const BACKEND_DIR = '/Users/dep/Desktop/backendcodeladder';

async function exportContests() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeladder';
  await mongoose.connect(uri);

  console.log('Fetching all Codeforces contests from MongoDB...');
  const contests = await Contest.find({ platform: 'CODEFORCES' })
    .sort({ startTime: -1 })
    .lean();

  console.log(`Found ${contests.length} Codeforces contests.`);

  const backendPath = path.join(BACKEND_DIR, 'data/codeforces-contests.json');
  const frontendPath = path.join(FRONTEND_DIR, 'public/codeforces-contests.json');

  const jsonStr = JSON.stringify(contests, null, 2);
  fs.writeFileSync(backendPath, jsonStr, 'utf8');
  fs.writeFileSync(frontendPath, jsonStr, 'utf8');

  console.log(`Saved to ${backendPath}`);
  console.log(`Copied to ${frontendPath}`);

  await mongoose.connection.close();
}

exportContests().catch(err => {
  console.error(err);
  process.exit(1);
});
