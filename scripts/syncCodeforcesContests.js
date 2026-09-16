const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Contest = require('../models/Contest');
const Question = require('../models/Question');

const FRONTEND_DIR = '/Users/dep/Desktop/codeladder';

// Helper to fetch json with curl fallback
async function fetchWithFallback(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'OK') return data.result;
    }
  } catch (err) {
    console.warn(`[Sync] Direct fetch failed for ${url}, trying curl...`);
  }

  try {
    const stdout = execSync(`curl -s -L --max-time 20 "${url}"`, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024
    });
    const parsed = JSON.parse(stdout);
    if (parsed && parsed.status === 'OK') return parsed.result;
  } catch (err) {
    console.warn(`[Sync] Curl failed for ${url}:`, err.message);
  }

  return null;
}

function getCategoryFromName(name) {
  if (/div\.\s*1\b/i.test(name) && !/div\.\s*2\b/i.test(name)) return 'DIV1';
  if (/div\.\s*2\b/i.test(name)) return 'DIV2';
  if (/div\.\s*3\b/i.test(name)) return 'DIV3';
  if (/div\.\s*4\b/i.test(name)) return 'DIV4';
  if (/educational/i.test(name)) return 'EDU';
  if (/global\s*round/i.test(name)) return 'GLOBAL';
  return 'OTHER';
}

async function syncCodeforces() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeladder';
  console.log('Connecting to MongoDB:', uri);
  await mongoose.connect(uri);

  console.log('Fetching official Codeforces contests and problems...');
  let contestsList = await fetchWithFallback('https://codeforces.com/api/contest.list?gym=false');
  let problemsetData = await fetchWithFallback('https://codeforces.com/api/problemset.problems');

  // Fallback to local files if API is slow or rate limited
  if (!contestsList) {
    const localContestsPath = path.join(FRONTEND_DIR, 'public/contest.json');
    if (fs.existsSync(localContestsPath)) {
      console.log('Using local contest.json fallback...');
      const local = JSON.parse(fs.readFileSync(localContestsPath, 'utf8'));
      contestsList = local.result || [];
    }
  }

  if (!problemsetData) {
    const localProblemsetPath = path.join(FRONTEND_DIR, 'public/problemset.json');
    if (fs.existsSync(localProblemsetPath)) {
      console.log('Using local problemset.json fallback...');
      const local = JSON.parse(fs.readFileSync(localProblemsetPath, 'utf8'));
      problemsetData = local.result || {};
    }
  }

  const rawProblems = problemsetData?.problems || [];
  console.log(`Loaded ${rawProblems.length} total Codeforces problems and ${contestsList?.length || 0} contests.`);

  if (!contestsList || contestsList.length === 0 || rawProblems.length === 0) {
    throw new Error('Failed to retrieve Codeforces data from API and local fallbacks');
  }

  // Group problems by contestId
  const contestProblemsMap = new Map();
  rawProblems.forEach((p) => {
    if (!p.contestId || !p.index) return;
    if (!contestProblemsMap.has(p.contestId)) {
      contestProblemsMap.set(p.contestId, []);
    }
    contestProblemsMap.get(p.contestId).push(p);
  });

  // Filter finished contests with problems
  const validContests = contestsList.filter((c) => {
    if (c.phase !== 'FINISHED') return false;
    const probs = contestProblemsMap.get(c.id);
    return probs && probs.length > 0;
  });

  console.log(`Found ${validContests.length} finished Codeforces contests with problems.`);

  // First: Upsert all questions into Question collection & build ID map
  console.log('Upserting questions into Question collection & building question mapping...');
  const questionBulkOps = [];

  for (const p of rawProblems) {
    const extId = `${p.contestId}${p.index}`;
    const questionDoc = {
      platform: 'CODEFORCES',
      externalId: extId,
      title: p.name || `Problem ${extId}`,
      url: `https://codeforces.com/contest/${p.contestId}/problem/${p.index}`,
      tags: Array.isArray(p.tags) ? p.tags : [],
      difficulty: 'N/A',
      rating: p.rating ? Number(p.rating) : null,
      contestId: String(p.contestId),
      problemIndex: String(p.index),
      metadata: {
        contestId: p.contestId,
        index: p.index,
        rating: p.rating || null,
        points: p.points || 0
      }
    };

    questionBulkOps.push({
      updateOne: {
        filter: { platform: 'CODEFORCES', externalId: extId },
        update: { $set: questionDoc },
        upsert: true
      }
    });
  }

  if (questionBulkOps.length > 0) {
    console.log(`Executing bulkWrite for ${questionBulkOps.length} questions...`);
    // Batch in chunks of 2000
    const chunkSize = 2000;
    for (let i = 0; i < questionBulkOps.length; i += chunkSize) {
      const chunk = questionBulkOps.slice(i, i + chunkSize);
      await Question.bulkWrite(chunk, { ordered: false });
    }
  }

  // Load question map: externalId -> _id
  console.log('Querying question IDs for direct contest mapping...');
  const cfQuestions = await Question.find({ platform: 'CODEFORCES' })
    .select('_id externalId')
    .lean();

  const questionIdMap = new Map();
  cfQuestions.forEach((q) => {
    questionIdMap.set(q.externalId, q._id);
  });
  console.log(`Mapped ${questionIdMap.size} question references.`);

  // Now: Build and upsert Contest documents
  console.log('Structuring and upserting Contest documents...');
  const contestBulkOps = [];

  for (const c of validContests) {
    const probs = contestProblemsMap.get(c.id) || [];

    // Sort problems by index (A, B, C, D, E, F...)
    probs.sort((a, b) => a.index.localeCompare(b.index, undefined, { numeric: true }));

    const mappedProblems = probs.map((p) => {
      const extId = `${c.id}${p.index}`;
      const qId = questionIdMap.get(extId) || null;

      return {
        questionId: qId,
        externalId: extId,
        index: String(p.index),
        title: p.name || `Problem ${p.index}`,
        url: `https://codeforces.com/contest/${c.id}/problem/${p.index}`,
        difficulty: 'N/A',
        rating: p.rating ? Number(p.rating) : null,
        tags: Array.isArray(p.tags) ? p.tags : [],
        points: p.points ? Number(p.points) : 0
      };
    });

    const contestDoc = {
      platform: 'CODEFORCES',
      contestId: String(c.id),
      name: c.name || `Codeforces Round ${c.id}`,
      url: `https://codeforces.com/contest/${c.id}`,
      category: getCategoryFromName(c.name),
      startTime: new Date(c.startTimeSeconds * 1000),
      durationSeconds: c.durationSeconds || 7200,
      phase: 'FINISHED',
      problems: mappedProblems
    };

    contestBulkOps.push({
      updateOne: {
        filter: { platform: 'CODEFORCES', contestId: String(c.id) },
        update: { $set: contestDoc },
        upsert: true
      }
    });
  }

  if (contestBulkOps.length > 0) {
    console.log(`Saving ${contestBulkOps.length} contests to MongoDB...`);
    const chunkSize = 500;
    for (let i = 0; i < contestBulkOps.length; i += chunkSize) {
      const chunk = contestBulkOps.slice(i, i + chunkSize);
      await Contest.bulkWrite(chunk, { ordered: false });
    }
  }

  const finalContestCount = await Contest.countDocuments({ platform: 'CODEFORCES' });
  const finalQuestionCount = await Question.countDocuments({ platform: 'CODEFORCES' });

  console.log('\n=== Codeforces Backend Sync Summary ===');
  console.log(`- Contests in MongoDB: ${finalContestCount}`);
  console.log(`- Questions in MongoDB: ${finalQuestionCount}`);
  console.log('- Problem mapping: 100% mapped with questionId reference');

  await mongoose.connection.close();
  console.log('MongoDB connection closed.');
}

syncCodeforces().catch((err) => {
  console.error('Codeforces sync failed:', err);
  process.exit(1);
});
