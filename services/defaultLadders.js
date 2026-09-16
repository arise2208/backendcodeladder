const questionCatalog = require('./questionCatalog');

const DEFAULT_LADDERS_DATA = {
  'default-blind-75': {
    _id: 'default-blind-75',
    title: 'Blind 75 Essentials',
    description: 'The classic curated collection of 75 high-frequency LeetCode questions for coding interviews.',
    isPublic: true,
    ownerUsername: 'CodeLadder',
    votes: 94,
    questions: [
      { title: 'Two Sum', platform: 'LEETCODE', difficulty: 'EASY', tags: ['arrays', 'hashing'] },
      { title: 'Best Time to Buy and Sell Stock', platform: 'LEETCODE', difficulty: 'EASY', tags: ['arrays', 'dp'] },
      { title: 'Contains Duplicate', platform: 'LEETCODE', difficulty: 'EASY', tags: ['arrays', 'hashing'] },
      { title: 'Product of Array Except Self', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['arrays', 'prefix sum'] },
      { title: 'Maximum Subarray', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['arrays', 'dp'] },
      { title: 'Maximum Product Subarray', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['arrays', 'dp'] },
      { title: 'Find Minimum in Rotated Sorted Array', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['binary search'] },
      { title: 'Search in Rotated Sorted Array', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['binary search'] },
      { title: '3Sum', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['arrays', 'two pointers'] },
      { title: 'Container With Most Water', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['arrays', 'two pointers'] },
      { title: 'Valid Anagram', platform: 'LEETCODE', difficulty: 'EASY', tags: ['strings', 'hashing'] },
      { title: 'Group Anagrams', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['strings', 'hashing'] },
      { title: 'Valid Parentheses', platform: 'LEETCODE', difficulty: 'EASY', tags: ['strings', 'stack'] },
      { title: 'Valid Palindrome', platform: 'LEETCODE', difficulty: 'EASY', tags: ['strings', 'two pointers'] },
      { title: 'Longest Substring Without Repeating Characters', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['strings', 'sliding window'] },
      { title: 'Longest Palindromic Substring', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['strings', 'dp'] },
      { title: 'Reverse Linked List', platform: 'LEETCODE', difficulty: 'EASY', tags: ['linked list'] },
      { title: 'Merge Two Sorted Lists', platform: 'LEETCODE', difficulty: 'EASY', tags: ['linked list'] },
      { title: 'Linked List Cycle', platform: 'LEETCODE', difficulty: 'EASY', tags: ['linked list', 'two pointers'] },
      { title: 'Invert Binary Tree', platform: 'LEETCODE', difficulty: 'EASY', tags: ['trees'] },
      { title: 'Maximum Depth of Binary Tree', platform: 'LEETCODE', difficulty: 'EASY', tags: ['trees', 'dfs and similar'] },
      { title: 'Same Tree', platform: 'LEETCODE', difficulty: 'EASY', tags: ['trees', 'dfs and similar'] },
      { title: 'Binary Tree Level Order Traversal', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['trees', 'graphs'] },
      { title: 'Validate Binary Search Tree', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['trees', 'dfs and similar'] },
      { title: 'Climbing Stairs', platform: 'LEETCODE', difficulty: 'EASY', tags: ['dp'] },
      { title: 'Coin Change', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['dp'] },
      { title: 'Longest Increasing Subsequence', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['dp', 'binary search'] },
      { title: 'Number of Islands', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['graphs', 'dfs and similar'] }
    ]
  },
  'default-cp-31': {
    _id: 'default-cp-31',
    title: 'CP-31 Sheet (Rating 800 - 1200)',
    description: 'Essential Codeforces practice sheet covering implementation, math, and greedy algorithms.',
    isPublic: true,
    ownerUsername: 'CodeLadder',
    votes: 76,
    questions: [
      { title: 'Watermelon', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['math', 'brute force'] },
      { title: 'Way Too Long Words', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['strings'] },
      { title: 'Team', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['brute force', 'greedy'] },
      { title: 'Next Round', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['implementation'] },
      { title: 'Domino piling', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['math', 'greedy'] },
      { title: 'Bit++', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['implementation'] },
      { title: 'Beautiful Matrix', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['implementation'] }
    ]
  },
  'default-neetcode-150': {
    _id: 'default-neetcode-150',
    title: 'NeetCode 150 Master Track',
    description: 'Comprehensive 150-question roadmap across all major interview patterns and algorithmic paradigms.',
    isPublic: true,
    ownerUsername: 'NeetCode',
    votes: 182,
    questions: [
      { title: 'Contains Duplicate', platform: 'LEETCODE', difficulty: 'EASY', tags: ['arrays', 'hashing'] },
      { title: 'Valid Anagram', platform: 'LEETCODE', difficulty: 'EASY', tags: ['strings', 'hashing'] },
      { title: 'Two Sum', platform: 'LEETCODE', difficulty: 'EASY', tags: ['arrays', 'hashing'] },
      { title: 'Group Anagrams', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['strings', 'hashing'] },
      { title: 'Top K Frequent Elements', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['arrays', 'heap'] },
      { title: 'Product of Array Except Self', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['arrays', 'prefix sum'] },
      { title: 'Valid Sudoku', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['arrays', 'hashing'] },
      { title: 'Longest Consecutive Sequence', platform: 'LEETCODE', difficulty: 'MEDIUM', tags: ['arrays', 'hashing'] }
    ]
  },
  'default-cf-div2': {
    _id: 'default-cf-div2',
    title: 'Codeforces Div 2 Upsolve Grinder',
    description: 'Hand-picked problems C, D, and E from recent Div 2 rounds with in-depth learning value.',
    isPublic: true,
    ownerUsername: 'tourist',
    votes: 128,
    questions: [
      { title: 'Watermelon', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['math', 'brute force'] },
      { title: 'Theatre Square', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['math'] },
      { title: 'String Task', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['strings'] },
      { title: 'Football', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['strings'] },
      { title: 'Boy or Girl', platform: 'CODEFORCES', difficulty: 'EASY', tags: ['strings', 'brute force'] }
    ]
  }
};

function getDefaultLadder(id) {
  const ladder = DEFAULT_LADDERS_DATA[id];
  if (!ladder) return null;

  const resolvedQuestions = ladder.questions.map((qTemplate, idx) => {
    // Try finding full question object from catalog
    let found = null;
    if (questionCatalog.isLoaded) {
      const searchRes = questionCatalog.getPaginatedQuestions({
        search: qTemplate.title,
        platform: qTemplate.platform
      }, 1, 5);

      if (searchRes && searchRes.questions && searchRes.questions.length > 0) {
        found = searchRes.questions.find(
          q => q.title.toLowerCase() === qTemplate.title.toLowerCase()
        ) || searchRes.questions[0];
      }
    }

    if (found) {
      return {
        ...found,
        order: idx + 1,
        state: { solved: false, starred: false },
        practice: { practised: false, practisedAt: null }
      };
    }

    return {
      _id: `curated-${id}-${idx + 1}`,
      title: qTemplate.title,
      platform: qTemplate.platform,
      difficulty: qTemplate.difficulty,
      tags: qTemplate.tags,
      url: qTemplate.platform === 'LEETCODE'
        ? `https://leetcode.com/problems/${qTemplate.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`
        : 'https://codeforces.com/problemset',
      order: idx + 1,
      state: { solved: false, starred: false },
      practice: { practised: false, practisedAt: null }
    };
  });

  return {
    ladder: {
      _id: ladder._id,
      title: ladder.title,
      description: ladder.description,
      mode: 'STANDARD',
      isPublic: true,
      ownerUsername: ladder.ownerUsername,
      likesCount: ladder.votes,
      dislikesCount: 0,
      upvotesCount: ladder.votes,
      downvotesCount: 0,
      score: ladder.votes,
      userVote: null,
      userVoteLegacy: null,
      questionCount: resolvedQuestions.length,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    },
    role: 'READ',
    questions: resolvedQuestions
  };
}

function getDefaultMarketplaceLadders() {
  return Object.values(DEFAULT_LADDERS_DATA).map(item => ({
    _id: item._id,
    title: item.title,
    description: item.description,
    mode: 'STANDARD',
    isPublic: true,
    ownerUsername: item.ownerUsername,
    questionCount: item.questions.length,
    solvedCount: 0,
    likesCount: item.votes,
    dislikesCount: 0,
    upvotesCount: item.votes,
    downvotesCount: 0,
    score: item.votes,
    userVote: null,
    userVoteLegacy: null,
    isOwner: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  }));
}

module.exports = {
  DEFAULT_LADDERS_DATA,
  getDefaultLadder,
  getDefaultMarketplaceLadders
};
