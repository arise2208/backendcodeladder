const fs = require('fs');
const path = require('path');
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

async function runLeetCodeGraphQLServer(query, variables = {}) {
  const payload = JSON.stringify({ query, variables });
  try {
    const { stdout } = await execFileAsync('curl', [
      '-s',
      '--max-time', '10',
      'https://leetcode.com/graphql',
      '-H', 'Content-Type: application/json',
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      '-H', 'Referer: https://leetcode.com/',
      '-d', payload
    ]);
    const json = JSON.parse(stdout);
    if (json && !json.errors) {
      return json.data;
    }
  } catch (_) {
    try {
      const res = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        body: payload,
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const json = await res.json();
        if (json && !json.errors) return json.data;
      }
    } catch (e) {}
  }
  return null;
}

async function fetchLeetCodeUserData(req, res) {
  const rawHandle = req.body?.handle || req.query?.handle || req.params?.handle || '';
  const cleanHandle = String(rawHandle).trim().replace(/^@/, '');
  if (!cleanHandle) {
    throw httpError(400, 'LeetCode handle is required');
  }

  const contestQuery = `
    query userContestInfo($username: String!) {
      userContestRanking(username: $username) {
        attendedContestsCount
        rating
        globalRanking
        totalParticipants
        topPercentage
        badge {
          name
        }
      }
      userContestRankingHistory(username: $username) {
        attended
        rating
        ranking
        problemsSolved
        contest {
          title
          startTime
        }
      }
    }
  `;

  const recentAcQuery = `
    query recentAcSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        id
        title
        titleSlug
        timestamp
      }
    }
  `;

  const calendarAndStatsQuery = `
    query userProfileCalendarAndStats($username: String!) {
      allQuestionsCount {
        difficulty
        count
      }
      matchedUser(username: $username) {
        submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
        userCalendar {
          streak
          totalActiveDays
          submissionCalendar
        }
      }
    }
  `;

  let userRating = 1500;
  let globalRanking = null;
  let attendedContests = 0;
  let topPercentage = null;
  let badgeName = null;
  let contestHistory = [];
  let rawRecentAc = [];
  let totalSolved = 0;
  let easySolved = 0;
  let mediumSolved = 0;
  let hardSolved = 0;
  let totalQuestions = 4047;
  let streak = 0;
  let totalActiveDays = 0;
  let submissionCalendar = {};
  const solvedSlugs = new Set();

  const [contestData, acData, statsData] = await Promise.all([
    runLeetCodeGraphQLServer(contestQuery, { username: cleanHandle }).catch(() => null),
    runLeetCodeGraphQLServer(recentAcQuery, { username: cleanHandle, limit: 50 }).catch(() => null),
    runLeetCodeGraphQLServer(calendarAndStatsQuery, { username: cleanHandle }).catch(() => null)
  ]);

  if (contestData?.userContestRanking) {
    const r = contestData.userContestRanking;
    userRating = Math.round(r.rating || 1500);
    globalRanking = r.globalRanking || null;
    attendedContests = r.attendedContestsCount || 0;
    topPercentage = r.topPercentage || null;
    badgeName = r.badge?.name || null;
  }
  if (Array.isArray(contestData?.userContestRankingHistory)) {
    contestHistory = contestData.userContestRankingHistory;
  }

  if (Array.isArray(acData?.recentAcSubmissionList)) {
    rawRecentAc = acData.recentAcSubmissionList;
    rawRecentAc.forEach((s) => {
      if (s.titleSlug) solvedSlugs.add(s.titleSlug.toLowerCase());
    });
  }

  if (statsData?.matchedUser) {
    const mu = statsData.matchedUser;
    if (mu.submitStatsGlobal?.acSubmissionNum) {
      mu.submitStatsGlobal.acSubmissionNum.forEach((item) => {
        if (item.difficulty === 'All') totalSolved = item.count;
        else if (item.difficulty === 'Easy') easySolved = item.count;
        else if (item.difficulty === 'Medium') mediumSolved = item.count;
        else if (item.difficulty === 'Hard') hardSolved = item.count;
      });
    }
    if (mu.userCalendar) {
      streak = mu.userCalendar.streak || 0;
      totalActiveDays = mu.userCalendar.totalActiveDays || 0;
      try {
        submissionCalendar = typeof mu.userCalendar.submissionCalendar === 'string'
          ? JSON.parse(mu.userCalendar.submissionCalendar)
          : (mu.userCalendar.submissionCalendar || {});
      } catch (_) {
        submissionCalendar = {};
      }
    }
  }

  if (statsData?.allQuestionsCount && Array.isArray(statsData.allQuestionsCount)) {
    const all = statsData.allQuestionsCount.find((i) => i.difficulty === 'All');
    if (all?.count) totalQuestions = all.count;
  }

  // Server-side fallback to Alfa API if LeetCode GraphQL was blocked/empty
  if (contestHistory.length === 0 && rawRecentAc.length === 0) {
    try {
      const alfaRes = await fetch(`https://alfa-leetcode-api.onrender.com/userContestRankingInfo/${encodeURIComponent(cleanHandle)}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (alfaRes.ok) {
        const alfaJson = await alfaRes.json();
        if (alfaJson.userContestRanking) {
          userRating = Math.round(alfaJson.userContestRanking.rating || userRating);
          globalRanking = alfaJson.userContestRanking.globalRanking || globalRanking;
          attendedContests = alfaJson.userContestRanking.attendedContestsCount || attendedContests;
          badgeName = alfaJson.userContestRanking.badge?.name || badgeName;
          topPercentage = alfaJson.userContestRanking.topPercentage || topPercentage;
        }
        if (Array.isArray(alfaJson.userContestRankingHistory)) {
          contestHistory = alfaJson.userContestRankingHistory;
        }
      }
    } catch (_) {}

    try {
      const alfaAcRes = await fetch(`https://alfa-leetcode-api.onrender.com/${encodeURIComponent(cleanHandle)}/acSubmission`, {
        signal: AbortSignal.timeout(6000)
      });
      if (alfaAcRes.ok) {
        const alfaAcJson = await alfaAcRes.json();
        if (Array.isArray(alfaAcJson.submission)) {
          rawRecentAc = alfaAcJson.submission;
          rawRecentAc.forEach((s) => {
            if (s.titleSlug) solvedSlugs.add(s.titleSlug.toLowerCase());
          });
        }
      }
    } catch (_) {}
  }

  // Fallback for stats & calendar
  if (totalSolved === 0 || Object.keys(submissionCalendar).length === 0) {
    try {
      const statsRes = await fetch(`https://leetcode-stats-api.herokuapp.com/${encodeURIComponent(cleanHandle)}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (statsRes.ok) {
        const s = await statsRes.json();
        if (s.totalSolved && totalSolved === 0) {
          totalSolved = s.totalSolved;
          easySolved = s.easySolved || 0;
          mediumSolved = s.mediumSolved || 0;
          hardSolved = s.hardSolved || 0;
        }
        if (s.ranking && !globalRanking) globalRanking = s.ranking;
      }
    } catch (_) {}
  }

  // Check verification state of this handle for the authenticated user
  const lcAccount = await PlatformAccount.findOne({
    userId: req.user.id,
    platform: 'LEETCODE'
  }).lean();
  const isVerified = Boolean(
    lcAccount &&
    lcAccount.verified &&
    lcAccount.handle?.toLowerCase() === cleanHandle.toLowerCase()
  );

  // Auto-upsert and record any recent AC submissions to MongoDB Question and UserQuestionState ONLY IF VERIFIED
  let autoSyncedCount = 0;
  if (isVerified && rawRecentAc.length > 0) {
    for (const sub of rawRecentAc) {
      if (!sub.titleSlug) continue;
      const slug = sub.titleSlug.toLowerCase();
      try {
        const question = await Question.findOneAndUpdate(
          { platform: 'LEETCODE', externalId: slug },
          {
            $setOnInsert: {
              platform: 'LEETCODE',
              externalId: slug,
              title: sub.title || slug,
              url: `https://leetcode.com/problems/${slug}/`,
              difficulty: 'MEDIUM',
              tags: [],
              metadata: { frontendQuestionId: sub.id || null }
            }
          },
          { upsert: true, returnDocument: 'after' }
        );

        const solvedAt = sub.timestamp ? new Date(Number(sub.timestamp) * 1000) : new Date();
        await UserQuestionState.findOneAndUpdate(
          { userId: req.user.id, questionId: question._id },
          {
            $set: {
              solved: true,
              solvedAt,
              verified: isVerified,
              verificationMethod: isVerified ? 'LEETCODE_CHALLENGE' : 'UNVERIFIED'
            },
            $setOnInsert: {
              firstSolvedAt: solvedAt,
              starred: false
            }
          },
          { upsert: true }
        );
        autoSyncedCount++;
      } catch (_) {}
    }
  }

  res.json({
    success: true,
    userSolved: {
      handle: cleanHandle,
      userRating,
      globalRanking,
      attendedContests,
      topPercentage,
      badgeName,
      totalSolved: totalSolved || solvedSlugs.size,
      easySolved,
      mediumSolved,
      hardSolved,
      totalQuestions,
      streak,
      totalActiveDays,
      submissionCalendar,
      contestHistory,
      recentAcSubmissions: rawRecentAc,
      solvedSlugs: Array.from(solvedSlugs),
      autoSyncedCount,
      isVerified
    }
  });
}

async function startLeetCodeChallenge(req, res) {
  const handle = (req.body.handle || '').trim();
  if (!handle) {
    throw httpError(400, 'LeetCode handle is required');
  }
  const existingVerified = await PlatformAccount.findOne({
    platform: 'LEETCODE',
    handle: { $regex: new RegExp(`^${handle}$`, 'i') },
    verified: true,
    userId: { $ne: req.user.id }
  });

  if (existingVerified) {
    throw httpError(409, `The LeetCode handle @${handle} is already verified by another CodeLadder user.`);
  }
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

async function recordSingleSubmission(req, res) {
  const { handle, claimedUserId, submission } = req.body;

  if (!submission || !submission.slug) {
    throw httpError(400, 'submission object with slug is required');
  }
  if (claimedUserId && String(claimedUserId) !== String(req.user.id)) {
    throw httpError(
      403,
      `User ID mismatch: Extension sent data for User ID "${claimedUserId}", but active authenticated session is User ID "${req.user.id}". Please re-authenticate your extension.`
    );
  }
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

async function syncLeetCodeHistory(req, res) {
  const { handle, claimedUserId, problems } = req.body;

  if (!Array.isArray(problems) || problems.length === 0) {
    throw httpError(400, 'problems array is required and must not be empty');
  }
  if (claimedUserId && String(claimedUserId) !== String(req.user.id)) {
    throw httpError(
      403,
      `User ID mismatch: Extension claimed User ID "${claimedUserId}", but session is User ID "${req.user.id}".`
    );
  }
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
  const slugs = problems.map((p) => p.slug).filter(Boolean);
  const matchedQuestions = await Question.find({
    platform: 'LEETCODE',
    externalId: { $in: slugs }
  }).select('_id externalId').lean();

  const qMap = new Map(matchedQuestions.map((q) => [q.externalId, q._id]));
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
  if (Array.isArray(leetcode) && leetcode.length > 0) {
    const lcSlugs = leetcode.map(s => String(s).toLowerCase().trim()).filter(Boolean);
    // Also keep original-case IDs so uppercase externalIds stored in DB are matched.
    const lcOriginal = leetcode.map(s => String(s).trim()).filter(Boolean);
    if (lcSlugs.length > 0) {
      const lcUrls = lcSlugs.flatMap(s => [
        `https://leetcode.com/problems/${s}/`,
        `https://leetcode.com/problems/${s}`
      ]);
      // Combine lowercase slugs with original-case IDs for the $in lists
      const lcExternalIds = [...new Set([...lcSlugs, ...lcOriginal])];
      const lcQuestions = await Question.find({
        platform: "LEETCODE",
        $or: [
          { slug: { $in: lcExternalIds } },
          { externalId: { $in: lcExternalIds } },
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
  if (Array.isArray(codechef) && codechef.length > 0) {
    const ccCodes = codechef.map(s => String(s).toUpperCase().trim()).filter(Boolean);
    if (ccCodes.length > 0) {
      const { codeMap } = getCodeChefContestCatalog();
      let ccQuestions = await Question.find({
        platform: "CODECHEF",
        externalId: { $in: ccCodes }
      }).select("_id externalId").lean().catch(() => []);

      const existingCodes = new Set((ccQuestions || []).map(q => String(q.externalId).toUpperCase()));
      const toUpsert = [];

      for (const code of ccCodes) {
        if (!existingCodes.has(code)) {
          const info = codeMap.get(code);
          const title = info?.name || code;
          const url = info?.url || `https://www.codechef.com/problems/${code}`;
          const rating = info?.rating || null;
          const tags = info?.tags || [];

          toUpsert.push({
            updateOne: {
              filter: { platform: "CODECHEF", externalId: code },
              update: {
                $setOnInsert: {
                  platform: "CODECHEF",
                  externalId: code,
                  title,
                  url,
                  rating,
                  tags,
                  difficulty: rating ? String(rating) : "N/A"
                }
              },
              upsert: true
            }
          });
        }
      }

      if (toUpsert.length > 0) {
        await Question.bulkWrite(toUpsert, { ordered: false }).catch(() => {});
        ccQuestions = await Question.find({
          platform: "CODECHEF",
          externalId: { $in: ccCodes }
        }).select("_id externalId").lean().catch(() => []);
      }

      for (const q of ccQuestions) {
        opsMap.set(String(q._id), {
          verified: false,
          verificationMethod: "PUBLIC_PROFILE"
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


async function recordCodeChefSubmission(req, res) {
  const { handle, claimedUserId, submission } = req.body;

  if (!submission || (!submission.problemCode && !submission.slug)) {
    throw httpError(400, "submission object with problemCode is required");
  }

  const problemCode = String(submission.problemCode || submission.slug).trim().toUpperCase();

  if (claimedUserId && String(claimedUserId) !== String(req.user.id)) {
    throw httpError(
      403,
      `User ID mismatch: Extension sent data for User ID "${claimedUserId}", but active authenticated session is User ID "${req.user.id}". Please re-authenticate your extension.`
    );
  }

  const targetHandle = (handle || "").trim();
  const account = await PlatformAccount.findOne({
    userId: req.user.id,
    platform: "CODECHEF"
  });

  if (!account) {
    throw httpError(403, "No CodeChef account linked. Please link your CodeChef handle in Settings first.");
  }

  if (targetHandle && account.handle.toLowerCase() !== targetHandle.toLowerCase()) {
    throw httpError(
      403,
      `Handle mismatch: Your linked CodeChef handle is @${account.handle}, but the extension submitted data for @${targetHandle}.`
    );
  }

  if (!account.verified) {
    account.verified = true;
    account.verifiedAt = new Date();
  }
  account.lastSyncedAt = new Date();
  await account.save();

  const diffUpper = (submission.difficulty || "MEDIUM").toUpperCase();
  const difficulty = ["EASY", "MEDIUM", "HARD"].includes(diffUpper) ? diffUpper : "MEDIUM";

  const question = await Question.findOneAndUpdate(
    { platform: "CODECHEF", externalId: problemCode },
    {
      $setOnInsert: {
        platform: "CODECHEF",
        externalId: problemCode,
        title: submission.title || problemCode,
        url: `https://www.codechef.com/problems/${problemCode}`,
        tags: Array.isArray(submission.tags) ? submission.tags : [],
        difficulty
      }
    },
    { upsert: true, returnDocument: "after" }
  );

  const solvedAt = submission.solvedAt ? new Date(submission.solvedAt) : new Date();

  await UserQuestionState.findOneAndUpdate(
    { userId: req.user.id, questionId: question._id },
    {
      $set: {
        solved: true,
        solvedAt,
        verified: true,
        verificationMethod: "CODECHEF_EXTENSION"
      },
      $setOnInsert: {
        firstSolvedAt: solvedAt,
        starred: false
      }
    },
    { upsert: true }
  );

  res.json({
    success: true,
    acknowledged: true,
    message: `Problem "${problemCode}" successfully verified and recorded via CodeChef extension.`,
    problemCode,
    questionId: question._id
  });
}

let ccContestNameMap = null;
let ccContestCodeMap = null;

function getCodeChefContestCatalog() {
  if (ccContestNameMap && ccContestCodeMap) {
    return { nameMap: ccContestNameMap, codeMap: ccContestCodeMap };
  }
  const nameMap = new Map();
  const codeMap = new Map();
  try {
    const filePath = path.join(__dirname, '../data/codechef-contest.json');
    if (fs.existsSync(filePath)) {
      const contestList = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const c of contestList) {
        for (const p of (c.problems || [])) {
          if (p.code) {
            const codeUpper = String(p.code).trim().toUpperCase();
            codeMap.set(codeUpper, {
              code: codeUpper,
              name: p.name || codeUpper,
              rating: p.rating && p.rating > 0 && p.rating !== 9999 ? Number(p.rating) : null,
              tags: Array.isArray(p.tags) ? p.tags : [],
              url: p.url || `https://www.codechef.com/problems/${codeUpper}`
            });
            if (p.name) {
              nameMap.set(String(p.name).trim().toLowerCase(), codeUpper);
            }
            nameMap.set(codeUpper.toLowerCase(), codeUpper);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[CodeChef] Could not load codechef-contest.json:', err.message);
  }
  ccContestNameMap = nameMap;
  ccContestCodeMap = codeMap;
  return { nameMap, codeMap };
}

async function syncCodeChefHistory(req, res) {
  const { handle, claimedUserId, problems } = req.body;

  if (!Array.isArray(problems) || problems.length === 0) {
    throw httpError(400, "problems array is required and must not be empty");
  }

  if (claimedUserId && String(claimedUserId) !== String(req.user.id)) {
    throw httpError(
      403,
      `User ID mismatch: Extension claimed User ID "${claimedUserId}", but session is User ID "${req.user.id}".`
    );
  }

  const targetHandle = (handle || "").trim();
  let account = await PlatformAccount.findOne({
    userId: req.user.id,
    platform: "CODECHEF"
  });

  if (!account) {
    if (targetHandle) {
      account = await PlatformAccount.create({
        userId: req.user.id,
        platform: "CODECHEF",
        handle: targetHandle,
        verified: true,
        verifiedAt: new Date(),
        lastSyncedAt: new Date()
      });
    } else {
      throw httpError(403, "No CodeChef account linked on CodeLadder. Please link your handle in Settings first.");
    }
  } else {
    if (targetHandle && account.handle.toLowerCase() !== targetHandle.toLowerCase()) {
      throw httpError(
        403,
        `Handle mismatch: Your linked CodeChef handle is @${account.handle}, but the extension attempted to sync history for @${targetHandle}.`
      );
    }
    account.verified = true;
    account.lastSyncedAt = new Date();
    await account.save();
  }

  const { nameMap, codeMap } = getCodeChefContestCatalog();

  const normalizedProblems = [];
  const searchCodes = new Set();
  const searchTitles = new Set();

  for (const item of problems) {
    let rawCode = "";
    let rawName = "";
    let solvedAt = null;

    if (typeof item === "string") {
      const trimmed = item.trim();
      rawName = trimmed;
      if (/^[A-Z0-9_]{2,20}$/i.test(trimmed)) {
        rawCode = trimmed.toUpperCase();
      }
    } else if (item && typeof item === "object") {
      rawCode = String(item.code || item.externalId || item.problemCode || item.slug || "").trim().toUpperCase();
      rawName = String(item.name || item.title || "").trim();
      if (item.solvedAt) {
        const parsedDate = new Date(item.solvedAt);
        if (!isNaN(parsedDate.getTime())) solvedAt = parsedDate;
      }
    }

    let resolvedCode = rawCode;
    let resolvedTitle = rawName;

    if (!resolvedCode && rawName) {
      const mapped = nameMap.get(rawName.toLowerCase());
      if (mapped) resolvedCode = mapped;
    }

    if (!resolvedCode && rawName) {
      const cleaned = rawName.replace(/[^A-Za-z0-9_]/g, "").toUpperCase();
      if (cleaned.length >= 2 && cleaned.length <= 20) {
        resolvedCode = cleaned;
      }
    }

    if (!resolvedCode && !resolvedTitle) continue;

    if (resolvedCode) searchCodes.add(resolvedCode);
    if (resolvedTitle) searchTitles.add(resolvedTitle.toLowerCase());

    normalizedProblems.push({
      code: resolvedCode || null,
      title: resolvedTitle || resolvedCode,
      solvedAt
    });
  }

  const queryConditions = [];
  if (searchCodes.size > 0) {
    queryConditions.push({ externalId: { $in: Array.from(searchCodes) } });
  }
  if (searchTitles.size > 0) {
    const titleRegexes = Array.from(searchTitles).map(
      (t) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
    );
    queryConditions.push({ title: { $in: titleRegexes } });
  }

  let existingQuestions = [];
  if (queryConditions.length > 0) {
    existingQuestions = await Question.find({
      platform: "CODECHEF",
      $or: queryConditions
    }).select("_id externalId title").lean();
  }

  const existingByCode = new Map();
  const existingByTitle = new Map();
  for (const q of existingQuestions) {
    if (q.externalId) existingByCode.set(q.externalId.toUpperCase(), q);
    if (q.title) existingByTitle.set(q.title.trim().toLowerCase(), q);
  }

  const questionUpsertOps = [];
  const resolvedQuestionMap = new Map();

  for (const p of normalizedProblems) {
    const codeKey = p.code ? p.code.toUpperCase() : null;
    const titleKey = p.title ? p.title.trim().toLowerCase() : null;

    const matchedQ = (codeKey && existingByCode.get(codeKey)) || (titleKey && existingByTitle.get(titleKey));
    if (matchedQ) {
      resolvedQuestionMap.set(codeKey || titleKey, matchedQ);
      continue;
    }

    const fallbackCode = codeKey || (p.title ? p.title.replace(/[^A-Za-z0-9_]/g, "").toUpperCase() : "CODECHEF_PROB");
    const catalogInfo = (codeKey && codeMap.get(codeKey)) || null;
    const finalTitle = catalogInfo?.name || p.title || fallbackCode;
    const finalUrl = catalogInfo?.url || `https://www.codechef.com/problems/${fallbackCode}`;
    const finalRating = catalogInfo?.rating || null;
    const finalTags = catalogInfo?.tags || [];

    questionUpsertOps.push({
      updateOne: {
        filter: { platform: "CODECHEF", externalId: fallbackCode },
        update: {
          $setOnInsert: {
            platform: "CODECHEF",
            externalId: fallbackCode,
            title: finalTitle,
            url: finalUrl,
            rating: finalRating,
            tags: finalTags,
            difficulty: "N/A"
          }
        },
        upsert: true
      }
    });
  }

  if (questionUpsertOps.length > 0) {
    await Question.bulkWrite(questionUpsertOps, { ordered: false });
    const refetched = await Question.find({
      platform: "CODECHEF",
      $or: queryConditions
    }).select("_id externalId title").lean();

    for (const q of refetched) {
      if (q.externalId) {
        existingByCode.set(q.externalId.toUpperCase(), q);
        resolvedQuestionMap.set(q.externalId.toUpperCase(), q);
      }
      if (q.title) {
        existingByTitle.set(q.title.trim().toLowerCase(), q);
        resolvedQuestionMap.set(q.title.trim().toLowerCase(), q);
      }
    }
  }

  const now = new Date();
  const stateBulkOps = [];
  const processedQuestionIds = new Set();

  for (const p of normalizedProblems) {
    const codeKey = p.code ? p.code.toUpperCase() : null;
    const titleKey = p.title ? p.title.trim().toLowerCase() : null;

    const matchedQ =
      (codeKey && resolvedQuestionMap.get(codeKey)) ||
      (titleKey && resolvedQuestionMap.get(titleKey)) ||
      (codeKey && existingByCode.get(codeKey)) ||
      (titleKey && existingByTitle.get(titleKey));

    if (!matchedQ || !matchedQ._id) continue;
    const qIdStr = String(matchedQ._id);
    if (processedQuestionIds.has(qIdStr)) continue;
    processedQuestionIds.add(qIdStr);

    const solvedAt = p.solvedAt || now;

    stateBulkOps.push({
      updateOne: {
        filter: { userId: req.user.id, questionId: matchedQ._id },
        update: {
          $set: {
            solved: true,
            solvedAt,
            verified: true,
            verificationMethod: "CODECHEF_EXTENSION"
          },
          $setOnInsert: {
            firstSolvedAt: solvedAt,
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
    message: `Successfully verified and synced ${stateBulkOps.length} CodeChef problems to your account via extension.`,
    syncedCount: stateBulkOps.length,
    matchedCount: processedQuestionIds.size,
    account
  });
}

async function fetchCodeChefUserData(req, res) {
  const rawHandle = req.body?.handle || req.query?.handle || req.params?.handle || '';
  const cleanHandle = String(rawHandle).trim().replace(/^@/, '');
  if (!cleanHandle) {
    throw httpError(400, 'CodeChef handle is required');
  }

  const ccAccount = await PlatformAccount.findOne({
    userId: req.user.id,
    platform: 'CODECHEF'
  }).lean();
  const isVerified = Boolean(
    ccAccount &&
    ccAccount.verified &&
    ccAccount.handle?.toLowerCase() === cleanHandle.toLowerCase()
  );

  let profileHtml = '';
  try {
    const { stdout } = await execFileAsync('curl', [
      '-s',
      '-L',
      '--max-time', '12',
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      '-H', 'Referer: https://www.codechef.com/',
      `https://www.codechef.com/users/${encodeURIComponent(cleanHandle)}`
    ]);
    profileHtml = stdout;
  } catch (_) {
    try {
      const resp = await fetch(`https://www.codechef.com/users/${encodeURIComponent(cleanHandle)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://www.codechef.com/'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (resp.ok) profileHtml = await resp.text();
    } catch (e) {}
  }

  let userRating = 1500;
  let highestRating = null;
  let stars = '1★';
  let globalRank = null;
  let countryRank = null;
  let totalProblemsSolved = 0;
  let contestsCount = 0;
  const solvedCodes = new Set();
  let dailySubmissions = [];

  if (profileHtml && typeof profileHtml === 'string') {
    const ratingMatch = profileHtml.match(/rating-number">\s*(\d+)/i) || profileHtml.match(/class="rating-number">(\d+)</);
    if (ratingMatch) userRating = parseInt(ratingMatch[1], 10);

    const highestMatch = profileHtml.match(/Highest Rating\s*(\d+)/i) || profileHtml.match(/\(Highest Rating\s*(\d+)\)/i);
    if (highestMatch) highestRating = parseInt(highestMatch[1], 10);

    const starContainer = profileHtml.match(/class="rating-star">([\s\S]*?)<\/div>/i);
    if (starContainer) {
      const starEntityCount = (starContainer[1].match(/&#9733;|\★/gi) || []).length;
      const spanCount = (starContainer[1].match(/<span/gi) || []).length;
      const count = starEntityCount || spanCount;
      if (count > 0) stars = `${count}★`;
    }

    const globalRankMatch = profileHtml.match(/<a[^>]*href="\/ratings\/all"[^>]*>\s*<strong>\s*(\d+)\s*<\/strong>\s*<\/a>\s*Global Rank/i)
      || profileHtml.match(/class="rating-ranks">[\s\S]*?<strong>(\d+)<\/strong>\s*<\/a>\s*Global Rank/i)
      || profileHtml.match(/<strong>(\d+)<\/strong>\s*<\/a>\s*Global Rank/i);
    if (globalRankMatch) globalRank = parseInt(globalRankMatch[1], 10);

    const countryRankMatch = profileHtml.match(/<a[^>]*href="\/ratings\/all\?filterBy=Country[^"]*"[^>]*>\s*<strong>\s*(\d+)\s*<\/strong>\s*<\/a>\s*Country Rank/i)
      || profileHtml.match(/<strong>(\d+)<\/strong>\s*<\/a>\s*Country Rank/i);
    if (countryRankMatch) countryRank = parseInt(countryRankMatch[1], 10);

    const totalSolvedMatch = profileHtml.match(/Total Problems Solved:\s*(\d+)/i)
      || profileHtml.match(/<h3>Total Problems Solved:\s*(\d+)<\/h3>/i);
    if (totalSolvedMatch) totalProblemsSolved = parseInt(totalSolvedMatch[1], 10);

    const contestsMatch = profileHtml.match(/Contests\s*\((\d+)\)/i) || profileHtml.match(/No\.\s*of Contests Participated:\s*(\d+)/i);
    if (contestsMatch) contestsCount = parseInt(contestsMatch[1], 10);

    const idx = profileHtml.indexOf('problems-solved');
    if (idx !== -1) {
      const end = profileHtml.indexOf('</section>', idx);
      const section = profileHtml.slice(idx, end !== -1 ? end : idx + 60000);
      const spans = Array.from(section.matchAll(/<span[^>]*style="font-size:\s*12px[^>]*>([^<]+)<\/span>/gi)).map(m => m[1].trim());
      spans.forEach(s => {
        const rawCode = s.replace(/&nbsp;/g, ' ').replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
        if (rawCode.length >= 2 && rawCode.length <= 15) {
          solvedCodes.add(rawCode);
        }
      });
      const statusLinks = Array.from(section.matchAll(/\/status\/([A-Za-z0-9_]+),/gi)).map(m => m[1].toUpperCase());
      statusLinks.forEach(c => solvedCodes.add(c));
    }

    const dailyStatsMatch = profileHtml.match(/var\s+userDailySubmissionsStats\s*=\s*(\[[\s\S]*?\]);/);
    if (dailyStatsMatch) {
      try {
        const rawDaily = JSON.parse(dailyStatsMatch[1]);
        dailySubmissions = rawDaily.map((item) => {
          const parts = String(item.date).split('-');
          let formattedDate = item.date;
          if (parts.length === 3) {
            formattedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          }
          return { date: formattedDate, value: Number(item.value) || 0 };
        });
      } catch (_) {}
    }
  }

  try {
    const { stdout: recentJsonStr } = await execFileAsync('curl', [
      '-s',
      '-L',
      '--max-time', '6',
      '-H', 'User-Agent: Mozilla/5.0',
      `https://www.codechef.com/recent/user?page=0&user_handle=${encodeURIComponent(cleanHandle)}`
    ]);
    const recentData = JSON.parse(recentJsonStr);
    if (recentData?.content) {
      const acMatches = Array.from(recentData.content.matchAll(/href="\/problems\/([A-Za-z0-9_]+)"/gi)).map(m => m[1].toUpperCase());
      acMatches.forEach(c => solvedCodes.add(c));
    }
  } catch (_) {}

  res.json({
    success: true,
    userSolved: {
      handle: cleanHandle,
      userRating,
      highestRating,
      stars,
      globalRank,
      countryRank,
      totalProblemsSolved: totalProblemsSolved || solvedCodes.size,
      contestsCount,
      solvedCodes: Array.from(solvedCodes),
      dailySubmissions,
      isVerified
    }
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
  syncSolvedProblems,
  recordCodeChefSubmission,
  syncCodeChefHistory,
  fetchLeetCodeUserData,
  fetchCodeChefUserData
};

