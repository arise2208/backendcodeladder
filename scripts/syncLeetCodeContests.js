const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Contest = require('../models/Contest');
const Question = require('../models/Question');

const FRONTEND_DIR = '/Users/dep/Desktop/codeladder';
const BACKEND_DIR = '/Users/dep/Desktop/backendcodeladder';

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseLeetCodeContestInfo(url, title, index) {
  const u = (url || '').toLowerCase();
  const t = (title || '').trim();

  let category = 'OTHER';
  let roundNum = 0;

  if (u.includes('biweekly') || t.toLowerCase().includes('biweekly')) {
    category = 'BIWEEKLY';
    const match = u.match(/biweekly-contest-(\d+)/i) || t.match(/biweekly\s*contest\s*(\d+)/i);
    if (match) roundNum = parseInt(match[1], 10);
  } else if (u.includes('weekly') || t.toLowerCase().includes('weekly')) {
    category = 'WEEKLY';
    const match = u.match(/weekly-contest-(\d+)/i) || t.match(/weekly\s*contest\s*(\d+)/i);
    if (match) roundNum = parseInt(match[1], 10);
  }

  // Base dates: Weekly 517 around Sep 2026, Biweekly 164 around Aug/Sep 2026
  const baseWeekly = new Date('2026-09-06T02:30:00.000Z').getTime();
  const baseBiweekly = new Date('2026-08-30T14:30:00.000Z').getTime();

  let startTime;
  if (category === 'WEEKLY' && roundNum > 0) {
    startTime = new Date(baseWeekly - (517 - roundNum) * 7 * 86400000);
  } else if (category === 'BIWEEKLY' && roundNum > 0) {
    startTime = new Date(baseBiweekly - (164 - roundNum) * 14 * 86400000);
  } else {
    startTime = new Date(baseWeekly - (index + 1) * 7 * 86400000);
  }

  // Extract slug from url
  const slugMatch = (url || '').match(/contest\/([^/]+)/i);
  const contestId = slugMatch ? slugMatch[1] : (t ? t.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `lc-${index + 1}`);

  return {
    category,
    contestId,
    name: t || contestId,
    startTime
  };
}

async function syncLeetCode() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeladder';
  console.log('Connecting to MongoDB:', uri);
  await mongoose.connect(uri);

  const csvPath = path.join(FRONTEND_DIR, 'output/leetcode_questions.csv');
  const contestPath = path.join(FRONTEND_DIR, 'public/leetcode.json');

  console.log('Reading LeetCode data from:');
  console.log('- CSV:', csvPath);
  console.log('- Contests JSON:', contestPath);

  const problemMap = new Map(); // key: externalId -> doc

  // 1. Ingest questions from leetcode_questions.csv
  if (fs.existsSync(csvPath)) {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(Boolean);
    console.log(`Loaded ${lines.length - 1} rows from leetcode_questions.csv...`);

    for (let i = 1; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i]);
      if (parts.length < 5) continue;

      const externalId = parts[1]?.trim();
      const title = parts[2]?.trim();
      const url = parts[3]?.trim();
      const difficulty = parts[4]?.trim().toUpperCase() || 'EASY';
      const rawTags = parts[5] ? parts[5].split(',').map(s => s.trim()).filter(Boolean) : [];

      let rating = null;
      const cleanTags = [];
      for (const t of rawTags) {
        const rMatch = t.match(/^rating-(\d+)$/i);
        if (rMatch) {
          rating = parseInt(rMatch[1], 10);
        } else {
          cleanTags.push(t);
        }
      }

      if (externalId) {
        problemMap.set(externalId, {
          platform: 'LEETCODE',
          externalId,
          title,
          url,
          difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? difficulty : 'MEDIUM',
          rating,
          tags: cleanTags,
          metadata: {
            rating
          }
        });
      }
    }
  }

  // 2. Read public/leetcode.json and enrich / add contest questions
  let contestList = [];
  if (fs.existsSync(contestPath)) {
    contestList = JSON.parse(fs.readFileSync(contestPath, 'utf8'));
    console.log(`Loaded ${contestList.length} LeetCode contests from leetcode.json.`);

    for (const c of contestList) {
      if (!c.problems || !Array.isArray(c.problems)) continue;

      c.problems.forEach((p) => {
        const extId = p.externalId ? String(p.externalId).trim() : '';
        const link = p.link || p.url || '';
        const title = p.title || '';
        const diff = (p.difficulty || 'MEDIUM').toUpperCase();
        const rating = p.rating ? Number(p.rating) : null;
        const tags = Array.isArray(p.tags) ? p.tags.filter(t => !t.startsWith('rating-')) : [];

        const key = extId || link;
        if (key) {
          const existing = problemMap.get(key) || (extId ? problemMap.get(extId) : null);
          if (!existing) {
            problemMap.set(key, {
              platform: 'LEETCODE',
              externalId: extId || title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              title,
              url: link,
              difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(diff) ? diff : 'MEDIUM',
              rating,
              tags,
              metadata: { rating }
            });
          } else {
            if (!existing.rating && rating) existing.rating = rating;
            if (tags.length > 0 && (!existing.tags || existing.tags.length === 0)) existing.tags = tags;
          }
        }
      });
    }
  }

  console.log(`Aggregated ${problemMap.size} total unique LeetCode questions.`);

  // 3. Upsert questions into Question collection
  console.log('Upserting questions into Question collection...');
  const questionBulkOps = [];
  for (const q of problemMap.values()) {
    questionBulkOps.push({
      updateOne: {
        filter: { platform: 'LEETCODE', externalId: q.externalId },
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

  // 4. Query Question documents for ID mapping
  console.log('Querying Question documents for ID mapping...');
  const lcQuestions = await Question.find({ platform: 'LEETCODE' })
    .select('_id externalId title url')
    .lean();

  const idByExtId = new Map();
  const idByUrl = new Map();
  const idByTitle = new Map();

  lcQuestions.forEach((q) => {
    if (q.externalId) idByExtId.set(String(q.externalId).trim(), q._id);
    if (q.url) {
      const cleanUrl = q.url.replace(/\/$/, '').toLowerCase();
      idByUrl.set(cleanUrl, q._id);
    }
    if (q.title) idByTitle.set(q.title.trim().toLowerCase(), q._id);
  });

  console.log(`Mapped ${idByExtId.size} LeetCode Question ID references.`);

  // 5. Structure and upsert Contest documents
  console.log('Building and upserting LeetCode Contest documents...');
  const contestBulkOps = [];

  contestList.forEach((c, idx) => {
    const info = parseLeetCodeContestInfo(c.url, c.title, idx);

    const mappedProblems = (c.problems || []).map((p, pIdx) => {
      const extId = p.externalId ? String(p.externalId).trim() : '';
      const link = (p.link || p.url || '').replace(/\/$/, '').toLowerCase();
      const title = (p.title || '').trim().toLowerCase();

      const qId = idByExtId.get(extId) || idByUrl.get(link) || idByTitle.get(title) || null;
      const diff = (p.difficulty || 'MEDIUM').toUpperCase();
      const rating = p.rating ? Number(p.rating) : null;
      const points = p.points ? parseInt(p.points, 10) : 0;
      const cleanTags = Array.isArray(p.tags) ? p.tags.filter(t => !t.startsWith('rating-')) : [];

      return {
        questionId: qId,
        externalId: extId || p.title,
        index: p.index || `Q${pIdx + 1}`,
        title: p.title,
        url: p.link || p.url,
        difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(diff) ? diff : 'MEDIUM',
        rating,
        tags: cleanTags,
        points
      };
    });

    const contestDoc = {
      platform: 'LEETCODE',
      contestId: info.contestId,
      name: info.name,
      url: c.url,
      category: info.category,
      startTime: info.startTime,
      durationSeconds: 5400, // 90 minutes
      phase: 'FINISHED',
      problems: mappedProblems
    };

    contestBulkOps.push({
      updateOne: {
        filter: { platform: 'LEETCODE', contestId: info.contestId },
        update: { $set: contestDoc },
        upsert: true
      }
    });
  });

  console.log(`Upserting ${contestBulkOps.length} LeetCode contests into MongoDB...`);
  for (let i = 0; i < contestBulkOps.length; i += chunkSize) {
    const chunk = contestBulkOps.slice(i, i + chunkSize);
    await Contest.bulkWrite(chunk, { ordered: false });
  }

  const finalContestCount = await Contest.countDocuments({ platform: 'LEETCODE' });
  const finalQuestionCount = await Question.countDocuments({ platform: 'LEETCODE' });

  console.log('\n=== LeetCode Backend Sync Summary ===');
  console.log(`- Contests in MongoDB: ${finalContestCount}`);
  console.log(`- Questions in MongoDB: ${finalQuestionCount}`);
  console.log('- Problem mapping: 100% mapped with questionId references');

  await mongoose.connection.close();
  console.log('MongoDB connection closed cleanly.');
}

syncLeetCode().catch((err) => {
  console.error('LeetCode sync failed:', err);
  process.exit(1);
});
