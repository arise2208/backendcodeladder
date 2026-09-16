const fs = require('fs');
const path = require('path');

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

class QuestionCatalog {
  constructor() {
    this.questions = [];
    this.byId = new Map();
    this.byPlatformAndExternalId = new Map();
    this.tagsByPlatform = new Map(); // platform -> Map(tag -> count)
    this.allTags = new Map(); // tag -> count
    this.isLoaded = false;
    this.init();
  }

  _indexQuestions(questions) {
    this.questions = questions;
    this.byId.clear();
    this.byPlatformAndExternalId.clear();
    this.tagsByPlatform.clear();
    this.allTags.clear();

    for (let i = 0; i < this.questions.length; i++) {
      const q = this.questions[i];
      const id = String(q._id);
      this.byId.set(id, q);

      const plat = String(q.platform || '').toUpperCase();
      const extId = String(q.externalId || '').trim().toUpperCase();
      if (plat && extId) {
        this.byPlatformAndExternalId.set(`${plat}:${extId}`, q);
      }
      if (Array.isArray(q.tags)) {
        const cleanTags = [];
        const seen = new Set();
        for (let j = 0; j < q.tags.length; j++) {
          const rawTag = String(q.tags[j]).trim().toLowerCase();
          if (isJunkTag(rawTag)) continue;
          const canonical = tagAliases[rawTag] || rawTag;
          if (!seen.has(canonical)) {
            seen.add(canonical);
            cleanTags.push(canonical);
          }
        }
        q.tags = cleanTags;
      } else {
        q.tags = [];
      }
      if (!this.tagsByPlatform.has(plat)) {
        this.tagsByPlatform.set(plat, new Map());
      }
      const platTagMap = this.tagsByPlatform.get(plat);

      for (let j = 0; j < q.tags.length; j++) {
        const normTag = q.tags[j];
        platTagMap.set(normTag, (platTagMap.get(normTag) || 0) + 1);
        this.allTags.set(normTag, (this.allTags.get(normTag) || 0) + 1);
      }
    }

    this.isLoaded = true;
  }

  init() {
    const dataPath = path.join(__dirname, '../data/questions.json');
    if (!fs.existsSync(dataPath)) {
      console.warn(`[QuestionCatalog] Data file not found at ${dataPath}.`);
      return;
    }

    try {
      const raw = fs.readFileSync(dataPath, 'utf8');
      const parsed = JSON.parse(raw);
      this._indexQuestions(parsed);
      console.log(`[QuestionCatalog] Loaded ${this.questions.length} questions into in-memory catalog.`);
    } catch (err) {
      console.error('[QuestionCatalog] Error initializing catalog:', err);
    }
  }

  async syncFromDatabase() {
    try {
      const Question = require('../models/Question');
      const questions = await Question.find({}).lean();
      if (questions && questions.length > 0) {
        this._indexQuestions(questions);
        console.log(`[QuestionCatalog] Synced ${questions.length} questions from MongoDB.`);
      }
    } catch (err) {
      console.warn('[QuestionCatalog] syncFromDatabase failed:', err.message);
    }
  }

  getPaginatedQuestions(filters = {}, pageParam = 1, limitParam = 20) {
    let list = this.questions;
    const platform = filters.platform ? String(filters.platform).trim().toUpperCase() : '';
    if (platform && platform !== 'ALL') {
      list = list.filter((q) => q.platform === platform);
    }
    const difficulty = filters.difficulty ? String(filters.difficulty).trim().toUpperCase() : '';
    if (difficulty && difficulty !== 'ALL') {
      list = list.filter((q) => q.difficulty === difficulty);
    }
    const rawTag = filters.tag ? String(filters.tag).trim().toLowerCase() : '';
    const tag = tagAliases[rawTag] || rawTag;
    if (tag && tag !== 'all') {
      list = list.filter((q) =>
        Array.isArray(q.tags) && q.tags.some((t) => {
          const norm = String(t).trim().toLowerCase();
          return norm === tag || (tagAliases[norm] || norm) === tag;
        })
      );
    }
    const minRating = filters.minRating !== undefined && filters.minRating !== '' ? Number(filters.minRating) : null;
    const maxRating = filters.maxRating !== undefined && filters.maxRating !== '' ? Number(filters.maxRating) : null;

    if (minRating !== null && !isNaN(minRating)) {
      list = list.filter((q) => {
        const r = q.rating !== undefined && q.rating !== null ? q.rating : q.metadata?.rating;
        return r !== undefined && r !== null && Number(r) >= minRating;
      });
    }

    if (maxRating !== null && !isNaN(maxRating)) {
      list = list.filter((q) => {
        const r = q.rating !== undefined && q.rating !== null ? q.rating : q.metadata?.rating;
        return r !== undefined && r !== null && Number(r) <= maxRating;
      });
    }
    if (filters.search && typeof filters.search === 'string') {
      const rawSearch = filters.search.trim().slice(0, 100);
      if (rawSearch.length > 0) {
        const searchLower = rawSearch.toLowerCase();
        list = list.filter((q) => {
          if (q.title && q.title.toLowerCase().includes(searchLower)) return true;
          if (q.externalId && String(q.externalId).toLowerCase().includes(searchLower)) return true;
          if (Array.isArray(q.tags) && q.tags.some((t) => String(t).toLowerCase().includes(searchLower))) return true;
          return false;
        });
      }
    }
    const total = list.length;
    const page = Math.max(Number.parseInt(pageParam || '1', 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(limitParam || '20', 10), 1), 50);
    const pages = Math.ceil(total / limit) || 1;

    const start = (page - 1) * limit;
    const slice = list.slice(start, start + limit);

    return {
      questions: slice,
      pagination: {
        page,
        limit,
        total,
        pages
      }
    };
  }

  getTags(platform) {
    const plat = platform ? String(platform).trim().toUpperCase() : '';
    let tagMap = this.allTags;
    if (plat && plat !== 'ALL' && this.tagsByPlatform.has(plat)) {
      tagMap = this.tagsByPlatform.get(plat);
    }
    const sorted = Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    return sorted;
  }

  getQuestionById(id) {
    if (!id) return null;
    return this.byId.get(String(id)) || null;
  }

  getQuestionByPlatformAndExternalId(platform, externalId) {
    if (!platform || !externalId) return null;
    const key = `${String(platform).trim().toUpperCase()}:${String(externalId).trim().toUpperCase()}`;
    return this.byPlatformAndExternalId.get(key) || null;
  }

  resolveQuestions(ids) {
    if (!Array.isArray(ids)) return [];
    return ids
      .map((id) => this.byId.get(String(id)))
      .filter(Boolean);
  }

  getTotalCount() {
    return this.questions.length;
  }
}

const instance = new QuestionCatalog();
module.exports = instance;
