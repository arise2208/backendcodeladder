const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const FRONTEND_DIR = '/Users/dep/Desktop/codeladder';
const BACKEND_DIR = '/Users/dep/Desktop/backendcodeladder';
const DATA_DIR = path.join(BACKEND_DIR, 'data');

const months = ['jan', 'feb', 'march', 'mar', 'april', 'apr', 'may', 'june', 'jun', 'july', 'jul', 'aug', 'sept', 'sep', 'oct', 'nov', 'dec'];
const junkExact = new Set(['premium', '*special', 'schedules', 'startsql', 'algorithms']);

function isJunkTag(raw) {
  const t = raw.trim().toLowerCase();
  if (!t || t.length < 2) return true;
  if (t.startsWith('rating-') || t.startsWith('rating_')) return true;
  if (junkExact.has(t)) return true;
  if (/^(start|cook|ltime|weekly|biweekly|cdrv|alkh|inso|cmel|plit|spyb|four|exun|fzbz|csns|infi|rc12|pcj|uwcoi|dcod|dema|bytr|cdmn|dsamonday|snckel|cole|iopc|pelt|cens|ccrc|moscwj|expp|proc|sdelp|locapr|ioitc|quco|enco|cdnt|infy|icl|bit|sep|june|march)\d+/i.test(t)) return true;
  if (months.some(m => new RegExp(`^${m}\\d{2,4}[a-z]?$`, 'i').test(t))) return true;
  if (/^[a-z]{2,7}\d{1,4}[a-z\d]*$/i.test(t) && !['2-sat', 'k-d tree'].includes(t)) {
    if (/\d/.test(t) && !['2-sat', 'k-d tree'].includes(t)) return true;
  }
  return false;
}

const tagAliases = {
  'dynamic-programming': 'dp',
  'dynamic programming': 'dp',
  'binary-search': 'binary search',
  'two-pointers': 'two pointers',
  'number-theory': 'number theory',
  'bit-manipulation': 'bit manipulation',
  'bitmask': 'bitmasks',
  'data-structures': 'data structures',
  'sorting': 'sortings',
  'array': 'arrays',
  'string': 'strings',
  'tree': 'trees',
  'binary tree': 'trees',
  'game-theory': 'games',
  'game theory': 'games',
  'hash table': 'hashing',
  'hash-table': 'hashing',
  'depth-first search': 'dfs and similar',
  'breadth-first search': 'graphs',
  'dsu': 'disjoint set union',
  'union-find': 'disjoint set union',
  'segment-trees': 'segment tree',
  'shortest-paths': 'shortest paths',
  'shortest path': 'shortest paths',
  'heap (priority queue)': 'heap',
  'matrix': 'matrices',
  'basic-math': 'math',
  'brute-force search': 'brute force',
  'directed acyclic graph': 'graphs',
  'graph theory': 'graphs',
  'graph coloring': 'graphs',
  'bipartite graph': 'graphs',
  'bubble sort': 'sortings',
  'counting sort': 'sortings',
  'quicksort': 'sortings',
  'bucket sort': 'sortings',
  'binary search tree': 'trees',
  'doubly-linked list': 'linked list',
  'dp on trees': 'dp',
  '0-1 knapsack': 'dp',
  'complete knapsack': 'dp',
  'knapsack problem': 'dp',
  'longest common subsequence': 'dp',
  'longest increasing subsequence': 'dp',
  'zero-sum game': 'games',
  'minimax': 'games'
};

function cleanTagsList(rawList) {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set();
  const res = [];
  for (const t of rawList) {
    const raw = String(t).trim().toLowerCase();
    if (isJunkTag(raw)) continue;
    const canonical = tagAliases[raw] || raw;
    if (!seen.has(canonical)) {
      seen.add(canonical);
      res.push(canonical);
    }
  }
  return res;
}

function generateDeterministicId(platform, externalId) {
  return crypto
    .createHash('md5')
    .update(`${platform.toUpperCase()}:${String(externalId).trim()}`)
    .digest('hex')
    .slice(0, 24);
}

function normalizeDifficulty(rating, platform, explicitDiff) {
  if (platform === 'LEETCODE') {
    if (explicitDiff && ['EASY', 'MEDIUM', 'HARD'].includes(explicitDiff.toUpperCase())) {
      return explicitDiff.toUpperCase();
    }
    if (!rating || isNaN(rating)) return 'MEDIUM';
    const r = Number(rating);
    if (r < 1500) return 'EASY';
    if (r < 2000) return 'MEDIUM';
    return 'HARD';
  }
  return 'N/A';
}

async function buildCatalog() {
  console.log('--- Starting Question & Contest Catalog Builder ---');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. Fetch existing questions from MongoDB to preserve exact ObjectIds
  const existingMongoMap = new Map();
  try {
    if (process.env.MONGODB_URI) {
      console.log('Connecting to MongoDB to preserve existing question IDs...');
      await mongoose.connect(process.env.MONGODB_URI);
      const Question = require('../models/Question');
      const existingDocs = await Question.find({}).lean();
      existingDocs.forEach((doc) => {
        const key = `${doc.platform.toUpperCase()}:${String(doc.externalId).trim()}`;
        existingMongoMap.set(key, doc);
      });
      console.log(`Found ${existingMongoMap.size} existing MongoDB questions.`);
      await mongoose.disconnect();
    }
  } catch (err) {
    console.warn('Could not connect to MongoDB, will use deterministic IDs:', err.message);
  }

  const catalogMap = new Map();

  // 2. Load existing Mongo questions first
  for (const [key, doc] of existingMongoMap.entries()) {
    catalogMap.set(key, {
      _id: String(doc._id),
      platform: doc.platform,
      externalId: String(doc.externalId).trim(),
      title: doc.title,
      url: doc.url,
      difficulty: doc.difficulty || normalizeDifficulty(doc.metadata?.rating, doc.platform),
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      metadata: doc.metadata || {}
    });
  }

  // 3. Load LeetCode & CodeChef questions from output/questions_bulk_payload.json
  const bulkPayloadPath = path.join(FRONTEND_DIR, 'output/questions_bulk_payload.json');
  if (fs.existsSync(bulkPayloadPath)) {
    console.log('Loading LeetCode & CodeChef questions from questions_bulk_payload.json...');
    const bulkData = JSON.parse(fs.readFileSync(bulkPayloadPath, 'utf8'));
    const questionsList = bulkData.questions || (Array.isArray(bulkData) ? bulkData : []);
    
    questionsList.forEach((q) => {
      const plat = (q.platform || 'LEETCODE').toUpperCase();
      const extId = String(q.externalId || '').trim();
      if (!extId) return;

      const key = `${plat}:${extId}`;
      const existing = catalogMap.get(key);

      const rating = q.rating ? Number(q.rating) : (q.metadata?.rating ? Number(q.metadata.rating) : null);
      const difficulty = normalizeDifficulty(rating, plat, q.difficulty);
      const tags = cleanTagsList(q.tags);

      if (!existing) {
        catalogMap.set(key, {
          _id: generateDeterministicId(plat, extId),
          platform: plat,
          externalId: extId,
          title: q.title || `${plat} Problem ${extId}`,
          url: q.url || (plat === 'LEETCODE' ? `https://leetcode.com/problems/${extId}/` : `https://www.codechef.com/problems/${extId}`),
          difficulty,
          rating: plat !== 'LEETCODE' && rating ? rating : undefined,
          tags,
          metadata: {
            rating: rating || null
          }
        });
      } else {
        if ((!existing.tags || existing.tags.length === 0) && tags.length > 0) existing.tags = tags;
        if (!existing.rating && rating && plat !== 'LEETCODE') existing.rating = rating;
        if (!existing.metadata?.rating && rating) existing.metadata = { ...existing.metadata, rating };
      }
    });
  }

  // 4. Load Codeforces questions from public/problemset.json
  const cfProblemsetPath = path.join(FRONTEND_DIR, 'public/problemset.json');
  if (fs.existsSync(cfProblemsetPath)) {
    console.log('Loading Codeforces questions from problemset.json...');
    const cfData = JSON.parse(fs.readFileSync(cfProblemsetPath, 'utf8'));
    const cfList = cfData?.result?.problems || [];

    cfList.forEach((p) => {
      if (!p.contestId || !p.index) return;
      const extId = `${p.contestId}${p.index}`;
      const key = `CODEFORCES:${extId}`;
      const existing = catalogMap.get(key);

      const rating = p.rating ? Number(p.rating) : null;
      const difficulty = 'N/A';
      const tags = cleanTagsList(p.tags);

      if (!existing) {
        catalogMap.set(key, {
          _id: generateDeterministicId('CODEFORCES', extId),
          platform: 'CODEFORCES',
          externalId: extId,
          title: p.name || `Problem ${extId}`,
          url: `https://codeforces.com/contest/${p.contestId}/problem/${p.index}`,
          difficulty,
          rating: rating || undefined,
          tags,
          metadata: {
            rating,
            contestId: p.contestId,
            index: p.index
          }
        });
      } else {
        if ((!existing.tags || existing.tags.length === 0) && tags.length > 0) existing.tags = tags;
        if (!existing.rating && rating) existing.rating = rating;
        if (!existing.metadata?.rating && rating) {
          existing.metadata = { ...existing.metadata, rating, contestId: p.contestId, index: p.index };
        }
      }
    });
  }

  const allQuestions = Array.from(catalogMap.values());
  const outputPath = path.join(DATA_DIR, 'questions.json');
  console.log(`Writing ${allQuestions.length} questions to ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(allQuestions, null, 2), 'utf8');

  // 5. Copy contest files
  const contestFiles = [
    'codechef-contest.json',
    'contest.json',
    'leetcode.json',
    'problemset.json'
  ];

  contestFiles.forEach((file) => {
    const src = path.join(FRONTEND_DIR, 'public', file);
    const dest = path.join(DATA_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied ${file} -> data/${file}`);
    }
  });

  const countsByPlat = {};
  allQuestions.forEach((q) => {
    countsByPlat[q.platform] = (countsByPlat[q.platform] || 0) + 1;
  });

  console.log('--- Catalog Build Complete ---');
  console.log('Total Questions:', allQuestions.length);
  console.log('Counts by Platform:', countsByPlat);
  console.log(`Preserved ${existingMongoMap.size} existing MongoDB IDs.`);
}

buildCatalog().catch((err) => {
  console.error('Build catalog failed:', err);
  process.exit(1);
});
