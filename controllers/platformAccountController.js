const PlatformAccount = require('../models/PlatformAccount');
const Question = require('../models/Question');
const UserQuestionState = require('../models/UserQuestionState');
const httpError = require('../utils/httpError');

const PLATFORMS = ['CODEFORCES', 'LEETCODE', 'CODECHEF', 'ATCODER'];

async function listAccounts(req, res) {
  const accounts = await PlatformAccount.find({
    userId: req.user.id
  }).select('platform handle verified lastSyncedAt createdAt updatedAt').lean();

  res.json({ accounts });
}

async function upsertAccount(req, res) {
  const platform = req.params.platform.toUpperCase();

  if (!PLATFORMS.includes(platform)) {
    throw httpError(400, 'Unsupported platform');
  }

  if (typeof req.body.handle !== 'string' || !req.body.handle.trim()) {
    throw httpError(400, 'handle is required');
  }

  const account = await PlatformAccount.findOneAndUpdate(
    {
      userId: req.user.id,
      platform
    },
    {
      $set: {
        handle: req.body.handle.trim(),
        verified: false,
        lastSyncedAt: null
      }
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true
    }
  );

  res.json({ account });
}

async function deleteAccount(req, res) {
  const platform = req.params.platform.toUpperCase();

  if (!PLATFORMS.includes(platform)) {
    throw httpError(400, 'Unsupported platform');
  }

  await PlatformAccount.deleteOne({
    userId: req.user.id,
    platform
  });

  res.json({ message: 'Platform account removed' });
}

const { execFile } = require('child_process');
const util = require('util');
const crypto = require('crypto');
const execFileAsync = util.promisify(execFile);

// Curated pool of 100% free classic Hard LeetCode problems with guaranteed working Python 3 solutions
const HARD_CHALLENGE_POOL = [
  {
    slug: 'trapping-rain-water',
    title: 'Trapping Rain Water',
    url: 'https://leetcode.com/problems/trapping-rain-water/',
    language: 'python3',
    code: `class Solution:
    def trap(self, height: List[int]) -> int:
        if not height:
            return 0
        l, r = 0, len(height) - 1
        l_max, r_max = height[l], height[r]
        ans = 0
        while l < r:
            if l_max < r_max:
                l += 1
                l_max = max(l_max, height[l])
                ans += max(0, l_max - height[l])
            else:
                r -= 1
                r_max = max(r_max, height[r])
                ans += max(0, r_max - height[r])
        return ans`
  },
  {
    slug: 'merge-k-sorted-lists',
    title: 'Merge k Sorted Lists',
    url: 'https://leetcode.com/problems/merge-k-sorted-lists/',
    language: 'python3',
    code: `class Solution:
    def mergeKLists(self, lists: List[Optional[ListNode]]) -> Optional[ListNode]:
        import heapq
        heap = []
        for i, node in enumerate(lists):
            if node:
                heapq.heappush(heap, (node.val, i, node))
        dummy = ListNode(0)
        curr = dummy
        while heap:
            val, i, node = heapq.heappop(heap)
            curr.next = node
            curr = curr.next
            if node.next:
                heapq.heappush(heap, (node.next.val, i, node.next))
        return dummy.next`
  },
  {
    slug: 'binary-tree-maximum-path-sum',
    title: 'Binary Tree Maximum Path Sum',
    url: 'https://leetcode.com/problems/binary-tree-maximum-path-sum/',
    language: 'python3',
    code: `class Solution:
    def maxPathSum(self, root: Optional[TreeNode]) -> int:
        max_sum = float('-inf')
        def dfs(node):
            nonlocal max_sum
            if not node:
                return 0
            left = max(0, dfs(node.left))
            right = max(0, dfs(node.right))
            max_sum = max(max_sum, node.val + left + right)
            return node.val + max(left, right)
        dfs(root)
        return max_sum`
  },
  {
    slug: 'largest-rectangle-in-histogram',
    title: 'Largest Rectangle in Histogram',
    url: 'https://leetcode.com/problems/largest-rectangle-in-histogram/',
    language: 'python3',
    code: `class Solution:
    def largestRectangleArea(self, heights: List[int]) -> int:
        stack = [-1]
        max_area = 0
        for i, h in enumerate(heights):
            while stack[-1] != -1 and heights[stack[-1]] >= h:
                curr_h = heights[stack.pop()]
                curr_w = i - stack[-1] - 1
                max_area = max(max_area, curr_h * curr_w)
            stack.append(i)
        while stack[-1] != -1:
            curr_h = heights[stack.pop()]
            curr_w = len(heights) - stack[-1] - 1
            max_area = max(max_area, curr_h * curr_w)
        return max_area`
  },
  {
    slug: 'longest-valid-parentheses',
    title: 'Longest Valid Parentheses',
    url: 'https://leetcode.com/problems/longest-valid-parentheses/',
    language: 'python3',
    code: `class Solution:
    def longestValidParentheses(self, s: str) -> int:
        stack = [-1]
        max_len = 0
        for i, ch in enumerate(s):
            if ch == '(':
                stack.append(i)
            else:
                stack.pop()
                if not stack:
                    stack.append(i)
                else:
                    max_len = max(max_len, i - stack[-1])
        return max_len`
  }
];

function generateVerificationCode() {
  return `CL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Helper: Query LeetCode Public GraphQL recent AC submissions
 */
async function fetchLeetCodeRecentAcSubmissions(username) {
  const query = `
    query recentAcSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        id
        title
        titleSlug
        timestamp
      }
    }
  `;

  const payload = JSON.stringify({
    query,
    variables: { username, limit: 15 }
  });

  try {
    const { stdout } = await execFileAsync('curl', [
      '-s',
      '--max-time', '6',
      'https://leetcode.com/graphql',
      '-H', 'Content-Type: application/json',
      '-d', payload
    ]);
    const json = JSON.parse(stdout);
    return json?.data?.recentAcSubmissionList || [];
  } catch (curlErr) {
    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: payload
    });
    if (!res.ok) {
      throw httpError(502, `LeetCode GraphQL error HTTP ${res.status}`);
    }
    const json = await res.json();
    return json?.data?.recentAcSubmissionList || [];
  }
}

/**
 * Helper: Query LeetCode User Profile (Summary / About Me)
 */
async function fetchLeetCodeProfile(username) {
  const query = `
    query userProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile {
          aboutMe
          realName
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query,
    variables: { username }
  });

  try {
    const { stdout } = await execFileAsync('curl', [
      '-s',
      '--max-time', '6',
      'https://leetcode.com/graphql',
      '-H', 'Content-Type: application/json',
      '-d', payload
    ]);
    const json = JSON.parse(stdout);
    return json?.data?.matchedUser?.profile || null;
  } catch (curlErr) {
    try {
      const res = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        body: payload
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data?.matchedUser?.profile || null;
    } catch (_) {
      return null;
    }
  }
}

/**
 * Start LeetCode Ownership Verification Challenge
 * Issues a 60-second challenge with a random Hard problem + solution,
 * as well as a Profile Summary verification code.
 */
async function startLeetCodeChallenge(req, res) {
  const handle = (req.body.handle || '').trim();
  if (!handle) {
    throw httpError(400, 'LeetCode handle is required');
  }

  // Check if another user has already verified this handle
  const existingVerified = await PlatformAccount.findOne({
    platform: 'LEETCODE',
    handle: { $regex: new RegExp(`^${handle}$`, 'i') },
    verified: true,
    userId: { $ne: req.user.id }
  });

  if (existingVerified) {
    throw httpError(409, `The LeetCode handle @${handle} is already verified by another CodeLadder user.`);
  }

  // Select a random Hard problem from pool
  const randomIndex = Math.floor(Math.random() * HARD_CHALLENGE_POOL.length);
  const selectedProblem = HARD_CHALLENGE_POOL[randomIndex];
  const verificationCode = generateVerificationCode();

  const challenge = {
    problemSlug: selectedProblem.slug,
    problemTitle: selectedProblem.title,
    expectedStatus: 'Accepted',
    verificationCode,
    language: selectedProblem.language,
    code: selectedProblem.code,
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 1000) // 60 seconds strict window
  };

  const account = await PlatformAccount.findOneAndUpdate(
    {
      userId: req.user.id,
      platform: 'LEETCODE'
    },
    {
      $set: {
        handle,
        verified: false,
        verificationChallenge: challenge
      }
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  res.json({
    success: true,
    message: `Challenge started for @${handle}. Submit the provided solution on "${selectedProblem.title}" within 60 seconds, or add code "${verificationCode}" to your profile summary.`,
    handle,
    challenge: {
      problemSlug: challenge.problemSlug,
      problemTitle: challenge.problemTitle,
      problemUrl: selectedProblem.url,
      expectedStatus: 'Accepted',
      language: challenge.language,
      code: challenge.code,
      verificationCode: challenge.verificationCode,
      startedAt: challenge.startedAt,
      expiresAt: challenge.expiresAt,
      durationSeconds: 60
    }
  });
}

/**
 * Check & Verify LeetCode Ownership Challenge
 * Checks recentAcSubmissionList on LeetCode for a matching Accepted submission,
 * or verifies that aboutMe contains verificationCode.
 */
async function verifyLeetCodeChallenge(req, res) {
  const handle = (req.body.handle || '').trim();

  const account = await PlatformAccount.findOne({
    userId: req.user.id,
    platform: 'LEETCODE'
  });

  if (!account || !account.verificationChallenge?.expiresAt) {
    throw httpError(400, 'No active verification challenge found. Please start a challenge first.');
  }

  const challenge = account.verificationChallenge;
  const now = new Date();

  // Allow a 10s grace period for verification network round-trip if submitted just in time
  const maxExpiry = new Date(new Date(challenge.expiresAt).getTime() + 10 * 1000);
  if (now > maxExpiry) {
    throw httpError(400, 'Verification challenge has expired (1-minute limit). Please start a new challenge.');
  }

  const targetHandle = handle || account.handle;

  // 1. Check Profile Bio / Summary code first (zero stat impact)
  if (challenge.verificationCode) {
    try {
      const profile = await fetchLeetCodeProfile(targetHandle);
      if (profile?.aboutMe && profile.aboutMe.includes(challenge.verificationCode)) {
        account.verified = true;
        account.verifiedAt = new Date();
        account.handle = targetHandle;
        account.verificationChallenge = null;
        await account.save();

        return res.json({
          success: true,
          verified: true,
          verificationMethod: 'PROFILE_SUMMARY',
          message: `Congratulations! Verification code confirmed in your LeetCode profile summary. @${targetHandle} is now verified!`,
          handle: targetHandle,
          account: {
            platform: 'LEETCODE',
            handle: targetHandle,
            verified: true,
            verifiedAt: account.verifiedAt
          }
        });
      }
    } catch (_) {}
  }

  // 2. Check Recent Accepted Submissions on LeetCode
  let recentAcSubs = [];
  try {
    recentAcSubs = await fetchLeetCodeRecentAcSubmissions(targetHandle);
  } catch (err) {
    throw httpError(502, `Failed to query LeetCode: ${err.message}`);
  }

  // Minimum timestamp: challenge start minus 10 seconds for clock skew
  const minTimestampSec = Math.floor(new Date(challenge.startedAt).getTime() / 1000) - 10;

  const match = recentAcSubs.find((s) => {
    const isSameProblem =
      s.titleSlug === challenge.problemSlug ||
      (s.title && s.title.toLowerCase() === challenge.problemTitle.toLowerCase());
    const isWithinTime = Number(s.timestamp) >= minTimestampSec;

    return isSameProblem && isWithinTime;
  });

  if (!match) {
    return res.status(200).json({
      success: false,
      verified: false,
      message: `No Accepted submission detected yet for "${challenge.problemTitle}" on @${targetHandle} within the 1-minute window. Click "Copy Solution", submit on LeetCode, and check again!`,
      secondsRemaining: Math.max(0, Math.round((new Date(challenge.expiresAt) - now) / 1000))
    });
  }

  account.verified = true;
  account.verifiedAt = new Date();
  account.handle = targetHandle;
  account.verificationChallenge = null;
  await account.save();

  res.json({
    success: true,
    verified: true,
    verificationMethod: 'ACCEPTED_SUBMISSION',
    message: `Congratulations! Accepted submission on "${challenge.problemTitle}" confirmed. LeetCode account @${targetHandle} has been verified and successfully linked to your CodeLadder profile!`,
    handle: targetHandle,
    account: {
      platform: 'LEETCODE',
      handle: targetHandle,
      verified: true,
      verifiedAt: account.verifiedAt
    }
  });
}

/**
 * Record Live Single Submission from Extension
 * Validates claimedUserId and verified handle before persisting.
 */
async function recordSingleSubmission(req, res) {
  const { handle, claimedUserId, submission } = req.body;

  if (!submission || !submission.slug) {
    throw httpError(400, 'submission object with slug is required');
  }

  // 1. Claimed User ID Validation (anti-spoofing warning)
  if (claimedUserId && String(claimedUserId) !== String(req.user.id)) {
    throw httpError(
      403,
      `User ID mismatch: Extension sent data for User ID "${claimedUserId}", but active authenticated session is User ID "${req.user.id}". Please re-authenticate your extension.`
    );
  }

  // 2. Handle & Verification Guard
  const targetHandle = (handle || '').trim();
  const account = await PlatformAccount.findOne({
    userId: req.user.id,
    platform: 'LEETCODE'
  });

  if (!account || !account.verified) {
    throw httpError(
      403,
      `Your LeetCode account (@${targetHandle || 'unknown'}) has not been verified yet on CodeLadder. Please complete the 2-minute verification challenge first.`
    );
  }

  if (targetHandle && account.handle.toLowerCase() !== targetHandle.toLowerCase()) {
    throw httpError(
      403,
      `Handle mismatch: Your verified CodeLadder LeetCode handle is @${account.handle}, but the extension attempted to submit data for @${targetHandle}. Sending data for an unverified account is not permitted.`
    );
  }

  // 3. Upsert Question in catalog
  const diffUpper = (submission.difficulty || 'MEDIUM').toUpperCase();
  const difficulty = ['EASY', 'MEDIUM', 'HARD'].includes(diffUpper) ? diffUpper : 'MEDIUM';

  const question = await Question.findOneAndUpdate(
    { platform: 'LEETCODE', externalId: submission.slug },
    {
      $setOnInsert: {
        platform: 'LEETCODE',
        externalId: submission.slug,
        title: submission.title || submission.slug,
        url: `https://leetcode.com/problems/${submission.slug}/`,
        tags: Array.isArray(submission.tags) ? submission.tags : [],
        difficulty,
        metadata: {
          frontendQuestionId: submission.id || submission.problem_id
        }
      }
    },
    { upsert: true, returnDocument: 'after' }
  );

  // 4. Update UserQuestionState
  const solvedAt = submission.solvedAt ? new Date(submission.solvedAt) : new Date();

  await UserQuestionState.findOneAndUpdate(
    { userId: req.user.id, questionId: question._id },
    {
      $set: {
        solved: true,
        solvedAt
      },
      $setOnInsert: {
        firstSolvedAt: solvedAt,
        starred: false
      }
    },
    { upsert: true }
  );

  account.lastSyncedAt = new Date();
  await account.save();

  res.json({
    success: true,
    acknowledged: true,
    message: `Problem "${submission.title || submission.slug}" successfully recorded and marked as solved.`,
    slug: submission.slug,
    questionId: question._id
  });
}

/**
 * Verified LeetCode Submission History Sync
 * Receives normalized LeetCode problems from the authenticated extension.
 * Atomically updates Questions, UserQuestionState, and PlatformAccount.
 */
async function syncLeetCodeHistory(req, res) {
  const { handle, claimedUserId, problems } = req.body;

  if (!Array.isArray(problems) || problems.length === 0) {
    throw httpError(400, 'problems array is required and must not be empty');
  }

  // Anti-spoofing check
  if (claimedUserId && String(claimedUserId) !== String(req.user.id)) {
    throw httpError(
      403,
      `User ID mismatch: Extension claimed User ID "${claimedUserId}", but session is User ID "${req.user.id}".`
    );
  }

  // Check if handle is claimed/verified by another user
  const targetHandle = (handle || req.user.username || 'leetcode_user').trim();
  const existingVerifiedOther = await PlatformAccount.findOne({
    platform: 'LEETCODE',
    handle: { $regex: new RegExp(`^${targetHandle}$`, 'i') },
    verified: true,
    userId: { $ne: req.user.id }
  });

  if (existingVerifiedOther) {
    throw httpError(409, `The LeetCode handle @${targetHandle} is already verified by another CodeLadder user.`);
  }

  // 1. Enforce Verification Guard
  const account = await PlatformAccount.findOne({
    userId: req.user.id,
    platform: 'LEETCODE'
  });

  if (!account || !account.verified) {
    throw httpError(
      403,
      `Your LeetCode account (@${targetHandle}) has not been verified yet on CodeLadder. Please complete the 2-minute verification challenge on your CodeLadder profile first.`
    );
  }

  if (targetHandle && account.handle.toLowerCase() !== targetHandle.toLowerCase()) {
    throw httpError(
      403,
      `Handle mismatch: Your verified CodeLadder LeetCode handle is @${account.handle}, but the extension attempted to sync history for @${targetHandle}.`
    );
  }

  account.lastSyncedAt = new Date();
  await account.save();

  // 2. Prepare bulk upserts for the canonical Question catalog
  const questionBulkOps = [];
  for (const p of problems) {
    if (!p.slug) continue;
    const diffUpper = (p.difficulty || 'MEDIUM').toUpperCase();
    const difficulty = ['EASY', 'MEDIUM', 'HARD'].includes(diffUpper) ? diffUpper : 'MEDIUM';

    questionBulkOps.push({
      updateOne: {
        filter: { platform: 'LEETCODE', externalId: p.slug },
        update: {
          $setOnInsert: {
            platform: 'LEETCODE',
            externalId: p.slug,
            title: p.title || p.slug,
            url: `https://leetcode.com/problems/${p.slug}/`,
            tags: Array.isArray(p.tags) ? p.tags : [],
            difficulty,
            metadata: {
              frontendQuestionId: p.id || p.problem_id
            }
          }
        },
        upsert: true
      }
    });
  }

  if (questionBulkOps.length > 0) {
    await Question.bulkWrite(questionBulkOps, { ordered: false });
  }

  // 3. Find MongoDB _id references for all synced problems
  const slugs = problems.map((p) => p.slug).filter(Boolean);
  const matchedQuestions = await Question.find({
    platform: 'LEETCODE',
    externalId: { $in: slugs }
  }).select('_id externalId').lean();

  const qMap = new Map(matchedQuestions.map((q) => [q.externalId, q._id]));

  // 4. Prepare UserQuestionState bulk operations
  const stateBulkOps = [];
  for (const p of problems) {
    const qId = qMap.get(p.slug);
    if (!qId) continue;

    const firstSolved = p.firstSolvedAt ? new Date(p.firstSolvedAt) : (p.solvedAt ? new Date(p.solvedAt) : new Date());
    const latestSolved = p.solvedAt ? new Date(p.solvedAt) : firstSolved;

    stateBulkOps.push({
      updateOne: {
        filter: { userId: req.user.id, questionId: qId },
        update: {
          $set: {
            solved: true,
            solvedAt: latestSolved
          },
          $setOnInsert: {
            firstSolvedAt: firstSolved,
            starred: false
          }
        },
        upsert: true
      }
    });
  }

  if (stateBulkOps.length > 0) {
    await UserQuestionState.bulkWrite(stateBulkOps, { ordered: false });
  }

  res.json({
    success: true,
    message: `Successfully verified and synced ${stateBulkOps.length} LeetCode problems to your account.`,
    syncedCount: stateBulkOps.length,
    account
  });
}

/**
 * Bulk Sync Solved Problems across platforms
 * Updates UserQuestionState for verified solved problems from Codeforces, LeetCode, CodeChef, and AtCoder
 */
async function syncSolvedProblems(req, res) {
  const { codeforces = [], leetcode = [], codechef = [], atcoder = [] } = req.body;
  const userId = req.user.id;

  const MAX_PER_PLATFORM = 2000;
  const MAX_TOTAL = 5000;

  if (
    codeforces.length > MAX_PER_PLATFORM ||
    leetcode.length > MAX_PER_PLATFORM ||
    codechef.length > MAX_PER_PLATFORM ||
    atcoder.length > MAX_PER_PLATFORM ||
    (codeforces.length + leetcode.length + codechef.length + atcoder.length) > MAX_TOTAL
  ) {
    throw httpError(400, `Payload exceeds allowed cap of ${MAX_PER_PLATFORM} problems per platform or ${MAX_TOTAL} total.`);
  }

  // Check user linked platform accounts
  const userAccounts = await PlatformAccount.find({ userId }).lean();
  const cfAccount = userAccounts.find(a => a.platform === "CODEFORCES");
  const lcAccount = userAccounts.find(a => a.platform === "LEETCODE");

  // Fetch verified Codeforces problems from CF API if handle linked
  const verifiedCfProblems = new Set();
  if (cfAccount && cfAccount.handle) {
    try {
      const cfRes = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(cfAccount.handle)}&from=1&count=5000`, {
        signal: AbortSignal.timeout(4000)
      });
      if (cfRes.ok) {
        const cfData = await cfRes.json();
        if (cfData.status === "OK" && Array.isArray(cfData.result)) {
          for (const sub of cfData.result) {
            if (sub.verdict === "OK" && sub.problem) {
              const p = sub.problem;
              if (p.contestId && p.index) {
                verifiedCfProblems.add(`${p.contestId}-${p.index}`.toUpperCase());
                verifiedCfProblems.add(`${p.contestId}${p.index}`.toUpperCase());
              }
            }
          }
        }
      }
    } catch (_) {
      // Non-blocking: if CF API fails or times out, solves will be flagged unverified
    }
  }

  const opsMap = new Map(); // questionId -> { verified, method }

  // 1. Codeforces
  if (Array.isArray(codeforces) && codeforces.length > 0) {
    const cfPatterns = [];
    for (const item of codeforces) {
      if (!item || typeof item !== "string") continue;
      cfPatterns.push(item);
      if (item.includes("-")) cfPatterns.push(item.replace("-", ""));
    }
    if (cfPatterns.length > 0) {
      const cfQuestions = await Question.find({
        platform: "CODEFORCES",
        externalId: { $in: cfPatterns }
      }).select("_id externalId").lean().catch(() => []);

      for (const q of cfQuestions) {
        const isVerified = verifiedCfProblems.has(String(q.externalId).toUpperCase());
        opsMap.set(String(q._id), {
          verified: isVerified,
          verificationMethod: isVerified ? "CODEFORCES_API" : "UNVERIFIED"
        });
      }
    }
  }

  // 2. LeetCode
  if (Array.isArray(leetcode) && leetcode.length > 0) {
    const lcSlugs = leetcode.map(s => String(s).toLowerCase().trim()).filter(Boolean);
    if (lcSlugs.length > 0) {
      const lcUrls = lcSlugs.flatMap(s => [
        `https://leetcode.com/problems/${s}/`,
        `https://leetcode.com/problems/${s}`
      ]);
      const lcQuestions = await Question.find({
        platform: "LEETCODE",
        $or: [
          { slug: { $in: lcSlugs } },
          { externalId: { $in: lcSlugs } },
          { url: { $in: lcUrls } }
        ]
      }).select("_id externalId").lean().catch(() => []);

      const isLcVerified = Boolean(lcAccount && lcAccount.verified);
      for (const q of lcQuestions) {
        opsMap.set(String(q._id), {
          verified: isLcVerified,
          verificationMethod: isLcVerified ? "LEETCODE_CHALLENGE" : "UNVERIFIED"
        });
      }
    }
  }

  // 3. CodeChef & AtCoder (marked UNVERIFIED)
  if (Array.isArray(codechef) && codechef.length > 0) {
    const ccCodes = codechef.map(s => String(s).toUpperCase().trim()).filter(Boolean);
    if (ccCodes.length > 0) {
      const ccQuestions = await Question.find({
        platform: "CODECHEF",
        externalId: { $in: ccCodes }
      }).select("_id").lean().catch(() => []);
      for (const q of ccQuestions) {
        opsMap.set(String(q._id), {
          verified: false,
          verificationMethod: "UNVERIFIED"
        });
      }
    }
  }

  if (Array.isArray(atcoder) && atcoder.length > 0) {
    const acCodes = atcoder.map(s => String(s).trim()).filter(Boolean);
    if (acCodes.length > 0) {
      const acQuestions = await Question.find({
        platform: "ATCODER",
        externalId: { $in: acCodes }
      }).select("_id").lean().catch(() => []);
      for (const q of acQuestions) {
        opsMap.set(String(q._id), {
          verified: false,
          verificationMethod: "UNVERIFIED"
        });
      }
    }
  }

  // 4. Bulk upsert UserQuestionState
  const now = new Date();
  let verifiedCount = 0;
  let unverifiedCount = 0;

  const bulkOps = Array.from(opsMap.entries()).map(([qId, meta]) => {
    if (meta.verified) verifiedCount++;
    else unverifiedCount++;

    return {
      updateOne: {
        filter: { userId, questionId: qId },
        update: {
          $set: {
            solved: true,
            solvedAt: now,
            verified: meta.verified,
            verificationMethod: meta.verificationMethod
          },
          $setOnInsert: { firstSolvedAt: now, starred: false }
        },
        upsert: true
      }
    };
  });

  if (bulkOps.length > 0) {
    await UserQuestionState.bulkWrite(bulkOps, { ordered: false });
  }

  await PlatformAccount.updateMany(
    { userId },
    { $set: { lastSyncedAt: now } }
  ).catch(() => {});

  res.json({
    success: true,
    matchedCount: bulkOps.length,
    verifiedCount,
    unverifiedCount,
    message: `Successfully synchronized ${bulkOps.length} solved questions (${verifiedCount} verified, ${unverifiedCount} unverified).`
  });
}

module.exports = {
  listAccounts,
  upsertAccount,
  deleteAccount,
  syncLeetCodeHistory,
  startLeetCodeChallenge,
  verifyLeetCodeChallenge,
  recordSingleSubmission,
  syncSolvedProblems
};
