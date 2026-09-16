const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Question = require('../models/Question');
const Contest = require('../models/Contest');

const DATA_DIR = path.join(__dirname, '../data');

function parseCategory(platform, name, url) {
  const n = (name || '').toUpperCase();
  const u = (url || '').toUpperCase();

  if (platform === 'CODEFORCES') {
    if (n.includes('DIV. 1') && !n.includes('DIV. 2')) return 'DIV1';
    if (n.includes('DIV. 2')) return 'DIV2';
    if (n.includes('DIV. 3')) return 'DIV3';
    if (n.includes('DIV. 4')) return 'DIV4';
    if (n.includes('EDUCATIONAL')) return 'EDU';
    if (n.includes('GLOBAL')) return 'GLOBAL';
    return 'OTHER';
  }

  if (platform === 'LEETCODE') {
    if (u.includes('BIWEEKLY') || n.includes('BIWEEKLY')) return 'BIWEEKLY';
    if (u.includes('WEEKLY') || n.includes('WEEKLY')) return 'WEEKLY';
    return 'OTHER';
  }

  if (platform === 'CODECHEF') {
    if (n.includes('STARTERS') || u.includes('START')) return 'STARTERS';
    if (n.includes('COOK') || u.includes('COOK')) return 'COOKOFF';
    if (n.includes('LTIME') || n.includes('LUNCHTIME')) return 'LTIME';
    if (n.includes('LONG') || u.includes('LONG')) return 'LONG';
    return 'OTHER';
  }

  return 'OTHER';
}

async function importQuestions() {
  const filePath = path.join(DATA_DIR, 'questions.json');
  if (!fs.existsSync(filePath)) {
    console.warn(`[Questions] ${filePath} not found, skipping questions import.`);
    return 0;
  }

  console.log('\n========================================');
  console.log('1. IMPORTING QUESTIONS');
  console.log('========================================');
  console.log(`Reading questions from ${filePath}...`);

  const raw = fs.readFileSync(filePath, 'utf8');
  const questions = JSON.parse(raw);
  console.log(`Loaded ${questions.length} questions from JSON.`);

  const BATCH_SIZE = 1000;
  let processed = 0;
  let upserted = 0;
  let modified = 0;
  let matched = 0;

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const chunk = questions.slice(i, i + BATCH_SIZE);
    const bulkOps = chunk.map((q) => {
      const platform = String(q.platform || 'LEETCODE').trim().toUpperCase();
      const externalId = String(q.externalId || '').trim();
      const title = String(q.title || `${platform} ${externalId}`).trim();
      const url = String(q.url || '').trim() || (platform === 'LEETCODE' ? `https://leetcode.com/problems/${externalId}/` : 'https://codeforces.com');
      const difficulty = q.difficulty ? String(q.difficulty).trim().toUpperCase() : 'N/A';
      const rating = q.rating ? Number(q.rating) : (q.metadata?.rating ? Number(q.metadata.rating) : undefined);
      const tags = Array.isArray(q.tags) ? q.tags.map(t => String(t).trim().toLowerCase()).filter(Boolean) : [];
      const contestId = q.metadata?.contestId ? String(q.metadata.contestId).trim() : null;
      const problemIndex = q.metadata?.index ? String(q.metadata.index).trim() : null;

      const doc = {
        platform,
        externalId,
        title,
        url,
        difficulty,
        tags,
        ...(rating !== undefined && !isNaN(rating) ? { rating } : {}),
        ...(contestId ? { contestId } : {}),
        ...(problemIndex ? { problemIndex } : {}),
        metadata: q.metadata || {}
      };

      // If valid ObjectId exists in JSON, preserve it on insert
      const setOnInsert = {};
      if (q._id && mongoose.isValidObjectId(q._id)) {
        setOnInsert._id = new mongoose.Types.ObjectId(String(q._id));
      }

      return {
        updateOne: {
          filter: { platform, externalId },
          update: {
            $set: doc,
            ...(Object.keys(setOnInsert).length > 0 ? { $setOnInsert: setOnInsert } : {})
          },
          upsert: true
        }
      };
    });

    const result = await Question.bulkWrite(bulkOps, { ordered: false });
    upserted += (result.upsertedCount || 0);
    modified += (result.modifiedCount || 0);
    matched += (result.matchedCount || 0);
    processed += chunk.length;

    process.stdout.write(`  Processed ${processed}/${questions.length} questions... (inserted: ${upserted}, updated: ${modified})\r`);
  }

  console.log(`\nQuestions import complete! Total processed: ${processed} (Inserted: ${upserted}, Updated: ${modified}, Matched: ${matched})`);
  return processed;
}

async function importCodeforcesContests() {
  console.log('\n========================================');
  console.log('2. IMPORTING CODEFORCES CONTESTS');
  console.log('========================================');

  const contestsFile = path.join(DATA_DIR, 'contest.json');
  const problemsetFile = path.join(DATA_DIR, 'problemset.json');

  if (!fs.existsSync(contestsFile)) {
    console.warn(`[Codeforces] ${contestsFile} not found, skipping.`);
    return 0;
  }

  const rawContests = JSON.parse(fs.readFileSync(contestsFile, 'utf8'));
  const contestList = rawContests.result || (Array.isArray(rawContests) ? rawContests : []);
  console.log(`Found ${contestList.length} Codeforces contests in contest.json.`);

  // Group problems by contestId from problemset.json
  const problemsByContest = new Map();
  if (fs.existsSync(problemsetFile)) {
    const rawPS = JSON.parse(fs.readFileSync(problemsetFile, 'utf8'));
    const pList = rawPS.result?.problems || [];
    console.log(`Found ${pList.length} Codeforces problems to map to contests.`);

    for (const p of pList) {
      if (!p.contestId) continue;
      const cid = String(p.contestId);
      if (!problemsByContest.has(cid)) {
        problemsByContest.set(cid, []);
      }
      problemsByContest.get(cid).push({
        externalId: `${p.contestId}${p.index}`,
        index: String(p.index || '').toUpperCase(),
        title: String(p.name || `Problem ${p.index}`),
        url: `https://codeforces.com/contest/${p.contestId}/problem/${p.index}`,
        difficulty: p.rating ? (p.rating < 1400 ? 'EASY' : p.rating < 2000 ? 'MEDIUM' : 'HARD') : 'N/A',
        rating: p.rating || null,
        tags: Array.isArray(p.tags) ? p.tags.map(t => String(t).toLowerCase()) : [],
        points: p.points || 0
      });
    }
  }

  const BATCH_SIZE = 500;
  let processed = 0;
  let upserted = 0;
  let modified = 0;

  for (let i = 0; i < contestList.length; i += BATCH_SIZE) {
    const chunk = contestList.slice(i, i + BATCH_SIZE);
    const bulkOps = chunk.map((c) => {
      const contestId = String(c.id);
      const name = String(c.name || `Codeforces Round ${contestId}`);
      const category = parseCategory('CODEFORCES', name, '');
      const startTime = c.startTimeSeconds ? new Date(c.startTimeSeconds * 1000) : new Date();
      const durationSeconds = Number(c.durationSeconds) || 7200;
      const phase = c.phase || 'FINISHED';
      const url = `https://codeforces.com/contest/${contestId}`;
      const problems = problemsByContest.get(contestId) || [];

      return {
        updateOne: {
          filter: { platform: 'CODEFORCES', contestId },
          update: {
            $set: {
              platform: 'CODEFORCES',
              contestId,
              name,
              url,
              category,
              startTime,
              durationSeconds,
              phase,
              division: '',
              problems
            }
          },
          upsert: true
        }
      };
    });

    const result = await Contest.bulkWrite(bulkOps, { ordered: false });
    upserted += (result.upsertedCount || 0);
    modified += (result.modifiedCount || 0);
    processed += chunk.length;
    process.stdout.write(`  Processed ${processed}/${contestList.length} Codeforces contests...\r`);
  }

  console.log(`\nCodeforces contests complete: ${processed} (Inserted: ${upserted}, Updated: ${modified})`);
  return processed;
}

async function importLeetCodeContests() {
  console.log('\n========================================');
  console.log('3. IMPORTING LEETCODE CONTESTS');
  console.log('========================================');

  const lcFile = path.join(DATA_DIR, 'leetcode.json');
  if (!fs.existsSync(lcFile)) {
    console.warn(`[LeetCode] ${lcFile} not found, skipping.`);
    return 0;
  }

  const rawLC = JSON.parse(fs.readFileSync(lcFile, 'utf8'));
  const contestList = Array.isArray(rawLC) ? rawLC : [];
  console.log(`Found ${contestList.length} LeetCode contests in leetcode.json.`);

  const BATCH_SIZE = 200;
  let processed = 0;
  let upserted = 0;
  let modified = 0;

  for (let i = 0; i < contestList.length; i += BATCH_SIZE) {
    const chunk = contestList.slice(i, i + BATCH_SIZE);
    const bulkOps = chunk.map((c, idx) => {
      const title = String(c.title || `LeetCode Contest ${i + idx + 1}`);
      const url = String(c.url || `https://leetcode.com/contest/`);
      const category = parseCategory('LEETCODE', title, url);

      let contestId = '';
      const slugMatch = url.match(/contest\/([^/]+)/);
      if (slugMatch && slugMatch[1]) {
        contestId = slugMatch[1];
      } else {
        contestId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      }

      // Approximate start date based on round number
      const numMatch = title.match(/(\d+)/);
      const roundNum = numMatch ? parseInt(numMatch[1], 10) : 1;
      const baseWeekly = new Date('2026-09-06T02:30:00.000Z').getTime();
      const baseBiweekly = new Date('2026-08-30T14:30:00.000Z').getTime();
      let startTime;
      if (category === 'BIWEEKLY') {
        startTime = new Date(baseBiweekly - (164 - roundNum) * 14 * 86400000);
      } else {
        startTime = new Date(baseWeekly - (517 - roundNum) * 7 * 86400000);
      }

      const problems = (c.problems || []).map((p, pIdx) => ({
        questionId: p.questionId && mongoose.isValidObjectId(p.questionId) ? new mongoose.Types.ObjectId(String(p.questionId)) : null,
        externalId: String(p.externalId || ''),
        index: p.index || `Q${pIdx + 1}`,
        title: String(p.title || `Problem ${pIdx + 1}`),
        url: p.link || url,
        difficulty: p.difficulty ? String(p.difficulty).toUpperCase() : 'MEDIUM',
        rating: p.rating ? Number(p.rating) : null,
        tags: Array.isArray(p.tags) ? p.tags.map(t => String(t).toLowerCase()) : [],
        points: Number(p.points) || 0
      }));

      return {
        updateOne: {
          filter: { platform: 'LEETCODE', contestId },
          update: {
            $set: {
              platform: 'LEETCODE',
              contestId,
              name: title,
              url,
              category,
              startTime,
              durationSeconds: 5400, // 90 min
              phase: 'FINISHED',
              division: '',
              problems
            }
          },
          upsert: true
        }
      };
    });

    const result = await Contest.bulkWrite(bulkOps, { ordered: false });
    upserted += (result.upsertedCount || 0);
    modified += (result.modifiedCount || 0);
    processed += chunk.length;
    process.stdout.write(`  Processed ${processed}/${contestList.length} LeetCode contests...\r`);
  }

  console.log(`\nLeetCode contests complete: ${processed} (Inserted: ${upserted}, Updated: ${modified})`);
  return processed;
}

async function importCodeChefContests() {
  console.log('\n========================================');
  console.log('4. IMPORTING CODECHEF CONTESTS');
  console.log('========================================');

  const ccFile = path.join(DATA_DIR, 'codechef-contest.json');
  if (!fs.existsSync(ccFile)) {
    console.warn(`[CodeChef] ${ccFile} not found, skipping.`);
    return 0;
  }

  const rawCC = JSON.parse(fs.readFileSync(ccFile, 'utf8'));
  const contestList = Array.isArray(rawCC) ? rawCC : [];
  console.log(`Found ${contestList.length} CodeChef contests in codechef-contest.json.`);

  const BATCH_SIZE = 300;
  let processed = 0;
  let upserted = 0;
  let modified = 0;

  for (let i = 0; i < contestList.length; i += BATCH_SIZE) {
    const chunk = contestList.slice(i, i + BATCH_SIZE);
    const bulkOps = chunk.map((c) => {
      const contestId = String(c.contest || '').trim().toUpperCase();
      const name = String(c.contest || 'CodeChef Contest');
      const category = parseCategory('CODECHEF', name, contestId);
      const division = String(c.division || '');
      const url = `https://www.codechef.com/${contestId}`;

      const numMatch = contestId.match(/(\d+)/);
      const roundNum = numMatch ? parseInt(numMatch[1], 10) : 1;
      const baseStarters = new Date('2026-09-02T14:30:00.000Z').getTime();
      const startTime = new Date(baseStarters - (255 - roundNum) * 7 * 86400000);

      const problems = (c.problems || []).map((p, pIdx) => ({
        questionId: p.questionId && mongoose.isValidObjectId(p.questionId) ? new mongoose.Types.ObjectId(String(p.questionId)) : null,
        externalId: String(p.code || ''),
        index: `P${pIdx + 1}`,
        title: String(p.name || p.code || `Problem ${pIdx + 1}`),
        url: p.url || `https://www.codechef.com/problems/${p.code}`,
        difficulty: p.rating ? (p.rating < 1400 ? 'EASY' : p.rating < 1800 ? 'MEDIUM' : 'HARD') : 'N/A',
        rating: p.rating ? Number(p.rating) : null,
        tags: Array.isArray(p.tags) ? p.tags.map(t => String(t).toLowerCase()) : [],
        points: 0
      }));

      return {
        updateOne: {
          filter: { platform: 'CODECHEF', contestId },
          update: {
            $set: {
              platform: 'CODECHEF',
              contestId,
              name,
              url,
              category,
              startTime,
              durationSeconds: 7200,
              phase: 'FINISHED',
              division,
              problems
            }
          },
          upsert: true
        }
      };
    });

    const result = await Contest.bulkWrite(bulkOps, { ordered: false });
    upserted += (result.upsertedCount || 0);
    modified += (result.modifiedCount || 0);
    processed += chunk.length;
    process.stdout.write(`  Processed ${processed}/${contestList.length} CodeChef contests...\r`);
  }

  console.log(`\nCodeChef contests complete: ${processed} (Inserted: ${upserted}, Updated: ${modified})`);
  return processed;
}

async function main() {
  const uri = process.argv[2] || process.env.MONGODB_URI;

  if (!uri) {
    console.error('ERROR: MONGODB_URI is not set in .env and not provided as an argument.');
    console.error('Usage: node scripts/importAllToMongo.js [MONGODB_URI]');
    process.exit(1);
  }

  const startTime = Date.now();
  console.log('====================================================');
  console.log('🚀 CODELADDER COMPLETE DATABASE IMPORTER');
  console.log('====================================================');
  console.log(`Target MongoDB URI: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000
    });
    console.log('Connected to MongoDB successfully!');

    // 1. Questions
    await importQuestions();

    // 2. Codeforces Contests
    await importCodeforcesContests();

    // 3. LeetCode Contests
    await importLeetCodeContests();

    // 4. CodeChef Contests
    await importCodeChefContests();

    // Final Counts
    console.log('\n====================================================');
    console.log('📊 DATABASE VERIFICATION & TOTALS');
    console.log('====================================================');
    const totalQuestions = await Question.countDocuments();
    const qByPlatform = await Question.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log(`Total Questions in MongoDB: ${totalQuestions}`);
    qByPlatform.forEach(p => console.log(`  - ${p._id}: ${p.count}`));

    const totalContests = await Contest.countDocuments();
    const cByPlatform = await Contest.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log(`\nTotal Contests in MongoDB: ${totalContests}`);
    cByPlatform.forEach(p => console.log(`  - ${p._id}: ${p.count}`));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n====================================================');
    console.log(`✅ All questions and contests imported in ${elapsed}s!`);
    console.log('====================================================');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Import failed with error:');
    console.error(err.message);

    if (err.name === 'MongooseServerSelectionError') {
      console.log('\n💡 Tip: If connecting to MongoDB Atlas, ensure your IP address is whitelisted in:');
      console.log('   MongoDB Atlas -> Network Access -> Add IP Address (0.0.0.0/0 for anywhere, or your current IP).');
    }

    process.exit(1);
  }
}

main();
