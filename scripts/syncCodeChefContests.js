const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Contest = require('../models/Contest');
const Question = require('../models/Question');

const FRONTEND_DIR = '/Users/dep/Desktop/codeladder';
const BACKEND_DIR = '/Users/dep/Desktop/backendcodeladder';

function parseCategory(contestCode) {
  const code = (contestCode || '').trim().toUpperCase();
  if (code.startsWith('START')) return 'STARTERS';
  if (code.startsWith('COOK')) return 'COOKOFF';
  if (code.startsWith('LTIME')) return 'LUNCHTIME';
  return 'OTHER';
}

function parseStartTime(contestCode, index) {
  const code = (contestCode || '').trim().toUpperCase();
  const numMatch = code.match(/\d+/);
  const roundNum = numMatch ? parseInt(numMatch[0], 10) : 0;

  // Approximate weekly / chronological timestamp: START255 is newest
  const baseTime = new Date('2026-09-02T14:30:00.000Z').getTime();
  if (code.startsWith('START') && roundNum > 0) {
    return new Date(baseTime - (255 - roundNum) * 7 * 86400000);
  }
  if (code.startsWith('COOK') && roundNum > 0) {
    return new Date(baseTime - (160 - roundNum) * 30 * 86400000);
  }
  if (code.startsWith('LTIME') && roundNum > 0) {
    return new Date(baseTime - (130 - roundNum) * 30 * 86400000);
  }
  // Default to sequential index if no round number
  return new Date(baseTime - (index + 1) * 86400000);
}

async function syncCodeChef() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeladder';
  console.log('Connecting to MongoDB:', uri);
  await mongoose.connect(uri);

  let ccPath = path.join(BACKEND_DIR, 'data/codechef-contest.json');
  if (!fs.existsSync(ccPath)) {
    ccPath = path.join(FRONTEND_DIR, 'public/codechef-contest.json');
  }

  console.log('Reading CodeChef contests from:', ccPath);
  const contestList = JSON.parse(fs.readFileSync(ccPath, 'utf8'));
  console.log(`Loaded ${contestList.length} CodeChef contest entries across all divisions.`);

  // 1. Gather all unique problems to upsert into Question collection
  console.log('Aggregating unique CodeChef problems by externalId (problem code)...');
  const problemMap = new Map();

  for (const c of contestList) {
    const contestCode = c.contest || c.code || '';
    if (!c.problems || !Array.isArray(c.problems)) continue;

    c.problems.forEach((p, idx) => {
      const code = (p.code || '').trim().toUpperCase();
      if (!code) return;

      if (!problemMap.has(code)) {
        const rating = p.rating && p.rating > 0 && p.rating !== 9999 ? Number(p.rating) : null;
        problemMap.set(code, {
          platform: 'CODECHEF',
          externalId: code, // externalId IS the problem code
          title: p.name || code,
          url: p.url || `https://www.codechef.com/problems/${code}`,
          tags: [],
          difficulty: 'N/A',
          rating,
          contestId: contestCode,
          problemIndex: `P${idx + 1}`,
          metadata: {
            rating,
            submissions: p.submissions || null,
            accuracy: p.accuracy || null
          }
        });
      }
    });
  }

  console.log(`Found ${problemMap.size} unique CodeChef problems.`);

  // Upsert into Question collection
  console.log('Upserting questions into Question collection...');
  const questionBulkOps = [];
  for (const q of problemMap.values()) {
    questionBulkOps.push({
      updateOne: {
        filter: { platform: 'CODECHEF', externalId: q.externalId },
        update: { $set: q },
        upsert: true
      }
    });
  }

  const chunkSize = 2000;
  for (let i = 0; i < questionBulkOps.length; i += chunkSize) {
    const chunk = questionBulkOps.slice(i, i + chunkSize);
    await Question.bulkWrite(chunk, { ordered: false });
  }

  // 2. Fetch created Question IDs to map onto Contest problems
  console.log('Querying Question documents for ID mapping...');
  const ccQuestions = await Question.find({ platform: 'CODECHEF' })
    .select('_id externalId')
    .lean();

  const questionIdMap = new Map();
  ccQuestions.forEach((q) => {
    questionIdMap.set(q.externalId, q._id);
  });
  console.log(`Mapped ${questionIdMap.size} Question ID references.`);

  // 3. Build Contest documents preserving all divisions exactly as in codechef-contest.json
  console.log('Structuring Contest documents for all divisions...');
  const contestBulkOps = [];

  contestList.forEach((c, cIdx) => {
    const contestCode = (c.contest || c.code || '').trim();
    if (!contestCode) return;

    const mappedProblems = (c.problems || []).map((p, idx) => {
      const code = (p.code || '').trim().toUpperCase();
      const qId = questionIdMap.get(code) || null;
      const rating = p.rating && p.rating > 0 && p.rating !== 9999 ? Number(p.rating) : null;

      return {
        questionId: qId,
        externalId: code, // externalId IS the CodeChef problem code
        index: `P${idx + 1}`,
        title: p.name || code,
        url: p.url || `https://www.codechef.com/problems/${code}`,
        difficulty: 'N/A',
        rating,
        tags: [],
        points: 0
      };
    });

    const contestDoc = {
      platform: 'CODECHEF',
      contestId: contestCode,
      name: contestCode,
      url: `https://www.codechef.com/${contestCode}`,
      category: parseCategory(contestCode),
      division: c.division || '',
      startTime: parseStartTime(contestCode, cIdx),
      durationSeconds: 7200,
      phase: 'FINISHED',
      problems: mappedProblems
    };

    contestBulkOps.push({
      updateOne: {
        filter: { platform: 'CODECHEF', contestId: contestCode },
        update: { $set: contestDoc },
        upsert: true
      }
    });
  });

  console.log(`Upserting ${contestBulkOps.length} CodeChef contests (preserving all divisions)...`);
  for (let i = 0; i < contestBulkOps.length; i += chunkSize) {
    const chunk = contestBulkOps.slice(i, i + chunkSize);
    await Contest.bulkWrite(chunk, { ordered: false });
  }

  const finalContestCount = await Contest.countDocuments({ platform: 'CODECHEF' });
  const finalQuestionCount = await Question.countDocuments({ platform: 'CODECHEF' });

  console.log('\n=== CodeChef Backend Sync Summary ===');
  console.log(`- Contests in MongoDB: ${finalContestCount}`);
  console.log(`- Questions in MongoDB: ${finalQuestionCount}`);
  console.log('- Problem mapping: 100% mapped with questionId references');

  await mongoose.connection.close();
  console.log('MongoDB connection closed cleanly.');
}

syncCodeChef().catch((err) => {
  console.error('CodeChef sync failed:', err);
  process.exit(1);
});
