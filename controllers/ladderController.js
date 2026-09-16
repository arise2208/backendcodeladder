const mongoose = require('mongoose');
const Ladder = require('../models/Ladder');
const LadderQuestion = require('../models/LadderQuestion');
const LadderMember = require('../models/LadderMember');
const Question = require('../models/Question');
const UserQuestionState = require('../models/UserQuestionState');
const UserLadderQuestionPractice = require('../models/UserLadderQuestionPractice');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const defaultLadders = require('../services/defaultLadders');
const questionCatalog = require('../services/questionCatalog');

async function createLadder(req, res) {
  const { title } = req.body;

  if (typeof title !== 'string' || !title.trim()) {
    throw httpError(400, 'title is required');
  }

  const ladderCount = await Ladder.countDocuments({ ownerId: req.user.id });
  if (ladderCount >= 10 && req.user.role !== 'ADMIN') {
    throw httpError(400, 'You have reached the maximum limit of 10 ladders per account.');
  }

  const ladder = await Ladder.create({
    title: title.trim(),
    ownerId: req.user.id
  });

  res.status(201).json({
    ladder: {
      ...ladder.toObject(),
      role: 'OWNER'
    }
  });
}

async function listLadders(req, res) {
  if (!req.user) {
    return res.json({ ladders: [] });
  }

  try {
    const memberships = await LadderMember.find({
      userId: req.user.id
    }).select('ladderId role').lean().catch(() => []);

    const owned = await Ladder.find({
      ownerId: req.user.id
    }).select('_id title ownerId mode isPublic publishedAt description revisionStartedAt createdAt updatedAt likes dislikes').lean().catch(() => []);

    const ownedIds = new Set(owned.map(ladder => String(ladder._id)));

    const memberIds = memberships
      .map(item => item.ladderId)
      .filter(id => !ownedIds.has(String(id)));

    const memberLadders = await Ladder.find({
      _id: { $in: memberIds }
    }).select('_id title ownerId mode isPublic publishedAt description revisionStartedAt createdAt updatedAt likes dislikes').lean().catch(() => []);

    const memberRole = new Map(
      memberships.map(item => [String(item.ladderId), item.role])
    );

    const allLadders = [
      ...owned.map(ladder => ({ ...ladder, role: 'OWNER' })),
      ...memberLadders.map(ladder => ({
        ...ladder,
        role: memberRole.get(String(ladder._id))
      }))
    ];
    const allLadderIds = allLadders.map(l => l._id);

    const [questionCounts, memberCounts, solvedCounts] = await Promise.all([
      LadderQuestion.aggregate([
        { $match: { ladderId: { $in: allLadderIds } } },
        { $group: { _id: '$ladderId', count: { $sum: 1 } } }
      ]).catch(() => []),
      LadderMember.aggregate([
        { $match: { ladderId: { $in: allLadderIds } } },
        { $group: { _id: '$ladderId', count: { $sum: 1 } } }
      ]).catch(() => []),
      (async () => {
        try {
          const allLadderQuestions = await LadderQuestion.find({
            ladderId: { $in: allLadderIds }
          }).select('ladderId questionId').lean();

          const questionIds = [...new Set(allLadderQuestions.map(lq => lq.questionId))];

          const solvedStates = await UserQuestionState.find({
            userId: req.user.id,
            questionId: { $in: questionIds },
            solved: true
          }).select('questionId').lean();

          const solvedSet = new Set(solvedStates.map(s => String(s.questionId)));

          const counts = {};
          for (const lq of allLadderQuestions) {
            const lid = String(lq.ladderId);
            if (!counts[lid]) counts[lid] = 0;
            if (solvedSet.has(String(lq.questionId))) counts[lid]++;
          }
          return Object.entries(counts).map(([id, count]) => ({ _id: new mongoose.Types.ObjectId(id), count }));
        } catch {
          return [];
        }
      })()
    ]);

    const qCountMap = new Map(questionCounts.map(c => [String(c._id), c.count]));
    const mCountMap = new Map(memberCounts.map(c => [String(c._id), c.count]));
    const sCountMap = new Map(solvedCounts.map(c => [String(c._id), c.count]));

    let containsQuestionSet = new Set();
    if (req.query.questionId && mongoose.isValidObjectId(req.query.questionId)) {
      const existing = await LadderQuestion.find({
        ladderId: { $in: allLadderIds },
        questionId: req.query.questionId
      }).select('ladderId').lean().catch(() => []);
      containsQuestionSet = new Set(existing.map(item => String(item.ladderId)));
    }

    const userId = req.user ? String(req.user.id) : null;

    res.json({
      ladders: allLadders.map(ladder => {
        const isLiked = userId && (ladder.likes || []).some(id => String(id) === userId);
        const isDisliked = userId && (ladder.dislikes || []).some(id => String(id) === userId);
        const upvotesCount = (ladder.likes || []).length;
        const downvotesCount = (ladder.dislikes || []).length;
        const normalizedVote = isLiked ? 'UPVOTE' : isDisliked ? 'DOWNVOTE' : null;

        return {
          ...ladder,
          questionCount: qCountMap.get(String(ladder._id)) || 0,
          memberCount: (mCountMap.get(String(ladder._id)) || 0) + 1, // +1 for owner
          solvedCount: sCountMap.get(String(ladder._id)) || 0,
          hasQuestion: containsQuestionSet.has(String(ladder._id)),
          likesCount: upvotesCount,
          dislikesCount: downvotesCount,
          upvotesCount,
          downvotesCount,
          score: upvotesCount - downvotesCount,
          userVote: normalizedVote,
          userVoteLegacy: isLiked ? 'LIKE' : isDisliked ? 'DISLIKE' : null
        };
      })
    });
  } catch (err) {
    console.error('Error in listLadders:', err);
    res.json({ ladders: [] });
  }
}

async function getLadder(req, res) {
  const ladderId = req.params.ladderId;

  // Handle curated/default ladders (e.g. default-blind-75)
  if (req.isDefaultLadder || (typeof ladderId === 'string' && ladderId.startsWith('default-'))) {
    const curated = defaultLadders.getDefaultLadder(ladderId);
    if (curated) {
      // If user is authenticated, check solved/starred state
      if (req.user && req.user.id) {
        try {
          const qIds = curated.questions.map(q => q._id);
          const states = await UserQuestionState.find({
            userId: req.user.id,
            questionId: { $in: qIds }
          }).lean().catch(() => []);

          const stateMap = new Map(states.map(s => [String(s.questionId), s]));
          curated.questions = curated.questions.map(q => ({
            ...q,
            state: {
              solved: stateMap.get(String(q._id))?.solved || false,
              starred: stateMap.get(String(q._id))?.starred || false
            }
          }));
        } catch {
        }
      }

      return res.json({
        ladder: curated.ladder,
        role: req.ladderAccess?.role || 'READ',
        questions: curated.questions
      });
    }
  }

  const ladderQuestions = await LadderQuestion.find({
    ladderId: req.ladder._id
  }).sort({ order: 1 }).lean().catch(() => []);

  const questionIds = ladderQuestions.map(item => item.questionId);
  const userId = req.user ? req.user.id : null;

  const [dbQuestions, states, practices] = await Promise.all([
    Question.find({ _id: { $in: questionIds } }).lean().catch(() => []),
    userId ? UserQuestionState.find({
      userId,
      questionId: { $in: questionIds }
    }).lean().catch(() => []) : [],
    userId ? UserLadderQuestionPractice.find({
      userId,
      ladderId: req.ladder._id,
      questionId: { $in: questionIds }
    }).lean().catch(() => []) : []
  ]);

  const questionById = new Map(
    dbQuestions.map(question => [String(question._id), question])
  );

  // Fallback to in-memory questionCatalog for questions not found in DB collection
  for (const qId of questionIds) {
    const sId = String(qId);
    if (!questionById.has(sId)) {
      const catQ = questionCatalog.getQuestionById(sId);
      if (catQ) questionById.set(sId, catQ);
    }
  }

  const stateByQuestion = new Map(
    states.map(state => [String(state.questionId), state])
  );
  const practiceByQuestion = new Map(
    practices.map(state => [String(state.questionId), state])
  );

  const result = ladderQuestions
    .map((lq, idx) => {
      const question = questionById.get(String(lq.questionId));
      if (!question) return null;

      return {
        ...question,
        order: lq.order !== undefined ? lq.order : idx + 1,
        state: {
          solved: stateByQuestion.get(String(lq.questionId))?.solved || false,
          starred: stateByQuestion.get(String(lq.questionId))?.starred || false
        },
        practice: {
          practised: practiceByQuestion.get(String(lq.questionId))?.practised || false,
          practisedAt: practiceByQuestion.get(String(lq.questionId))?.practisedAt || null
        }
      };
    })
    .filter(Boolean);

  const isLiked = userId && (req.ladder.likes || []).some(id => String(id) === String(userId));
  const isDisliked = userId && (req.ladder.dislikes || []).some(id => String(id) === String(userId));
  const upvotesCount = (req.ladder.likes || []).length;
  const downvotesCount = (req.ladder.dislikes || []).length;
  const normalizedVote = isLiked ? 'UPVOTE' : isDisliked ? 'DOWNVOTE' : null;

  let owner = null;
  if (req.ladder.ownerId && mongoose.isValidObjectId(req.ladder.ownerId)) {
    owner = await User.findById(req.ladder.ownerId).select('username').lean().catch(() => null);
  }
  const ladderObj = req.ladder.toObject ? req.ladder.toObject() : { ...req.ladder };

  res.json({
    ladder: {
      ...ladderObj,
      ownerUsername: owner?.username || ladderObj.ownerUsername || 'Anonymous',
      likesCount: upvotesCount,
      dislikesCount: downvotesCount,
      upvotesCount,
      downvotesCount,
      score: upvotesCount - downvotesCount,
      userVote: normalizedVote,
      userVoteLegacy: isLiked ? 'LIKE' : isDisliked ? 'DISLIKE' : null
    },
    role: req.ladderAccess?.role || 'READ',
    questions: result
  });
}

async function updateLadder(req, res) {
  const update = {};

  if (req.body.title !== undefined) {
    if (typeof req.body.title !== 'string' || !req.body.title.trim()) {
      throw httpError(400, 'title must be a non-empty string');
    }
    update.title = req.body.title.trim();
  }

  if (req.ladder.isPublic && req.body.isPublic === false) {
    throw httpError(400, 'A publicly listed ladder cannot be reverted to private. It can only be deleted.');
  }

  if (req.body.description !== undefined) {
    update.description = String(req.body.description || '').trim();
  }

  const ladder = await Ladder.findByIdAndUpdate(
    req.ladder._id,
    { $set: update },
    { returnDocument: 'after', runValidators: true }
  );

  res.json({ ladder });
}

async function deleteLadder(req, res) {
  const ladderId = req.ladder._id;

  await Ladder.findByIdAndDelete(ladderId);

  await Promise.all([
    LadderQuestion.deleteMany({ ladderId }),
    LadderMember.deleteMany({ ladderId }),
    UserLadderQuestionPractice.deleteMany({ ladderId })
  ]);

  res.json({ message: 'Ladder deleted' });
}

async function addQuestion(req, res) {
  const { questionId, questionIds } = req.body;

  if (Array.isArray(questionIds)) {
    if (questionIds.length === 0) {
      throw httpError(400, 'questionIds must not be empty');
    }

    for (const qId of questionIds) {
      if (!mongoose.isValidObjectId(qId)) {
        throw httpError(400, `Invalid questionId: ${qId}`);
      }
    }

    const uniqueRequested = Array.from(new Set(questionIds.map(String)));
    const validQuestions = await Question.find({ _id: { $in: uniqueRequested } }).select('_id');
    const validSet = new Set(validQuestions.map(q => String(q._id)));
    for (const id of uniqueRequested) {
      if (questionCatalog.getQuestionById(id)) validSet.add(id);
    }

    const existingInLadder = await LadderQuestion.find({
      ladderId: req.ladder._id,
      questionId: { $in: uniqueRequested }
    }).select('questionId');
    const existingSet = new Set(existingInLadder.map(item => String(item.questionId)));

    const toInsert = uniqueRequested.filter(id => validSet.has(id) && !existingSet.has(id));

    const last = await LadderQuestion.findOne({
      ladderId: req.ladder._id
    }).sort({ order: -1 }).select('order');

    let currentOrder = last ? last.order : 0;
    const docs = toInsert.map(id => ({
      ladderId: req.ladder._id,
      questionId: id,
      order: ++currentOrder
    }));

    let created = [];
    if (docs.length > 0) {
      created = await LadderQuestion.insertMany(docs);
    }

    return res.status(201).json({
      message: `Added ${created.length} question(s) to ladder`,
      addedCount: created.length,
      skippedCount: questionIds.length - created.length,
      ladderQuestions: created
    });
  }

  if (!mongoose.isValidObjectId(questionId)) {
    throw httpError(400, 'Invalid questionId');
  }

  let question = await Question.findById(questionId).select('_id');
  if (!question) {
    question = questionCatalog.getQuestionById(questionId);
  }

  if (!question) {
    throw httpError(404, 'Question not found');
  }

  const last = await LadderQuestion.findOne({
    ladderId: req.ladder._id
  }).sort({ order: -1 }).select('order');

  const order = last ? last.order + 1 : 1;

  const ladderQuestion = await LadderQuestion.create({
    ladderId: req.ladder._id,
    questionId,
    order
  });

  res.status(201).json({ ladderQuestion });
}

async function removeQuestion(req, res) {
  const deleted = await LadderQuestion.findOneAndDelete({
    ladderId: req.ladder._id,
    questionId: req.params.questionId
  });

  if (!deleted) {
    throw httpError(404, 'Question is not in this ladder');
  }

  res.json({ message: 'Question removed from ladder' });
}

async function reorderQuestions(req, res) {
  const items = req.body.questions;

  if (!Array.isArray(items) || items.length === 0) {
    throw httpError(400, 'questions must be a non-empty array');
  }

  const seen = new Set();

  for (const item of items) {
    if (!item || !mongoose.isValidObjectId(item.questionId) || !Number.isInteger(item.order)) {
      throw httpError(400, 'Each question must contain a valid questionId and integer order');
    }

    if (seen.has(String(item.questionId))) {
      throw httpError(400, 'Duplicate questionId in reorder request');
    }

    seen.add(String(item.questionId));
  }

  const existing = await LadderQuestion.find({
    ladderId: req.ladder._id
  }).select('questionId');

  if (existing.length !== items.length) {
    throw httpError(400, 'Reorder request must contain every question in the ladder exactly once');
  }

  const existingIds = new Set(existing.map(item => String(item.questionId)));

  for (const item of items) {
    if (!existingIds.has(String(item.questionId))) {
      throw httpError(400, 'Reorder request contains a question not in this ladder');
    }
  }

  const orders = items.map(item => item.order);
  if (new Set(orders).size !== orders.length) {
    throw httpError(400, 'Order values must be unique');
  }

  await LadderQuestion.bulkWrite(
    items.map(item => ({
      updateOne: {
        filter: {
          ladderId: req.ladder._id,
          questionId: item.questionId
        },
        update: { $set: { order: item.order } }
      }
    }))
  );

  res.json({ message: 'Ladder reordered' });
}

async function getPractice(req, res) {
  const ladderQuestion = await LadderQuestion.findOne({
    ladderId: req.ladder._id,
    questionId: req.params.questionId
  }).select('_id');

  if (!ladderQuestion) {
    throw httpError(404, 'Question is not in this ladder');
  }

  const practice = await UserLadderQuestionPractice.findOne({
    userId: req.user.id,
    ladderId: req.ladder._id,
    questionId: req.params.questionId
  }).lean();

  res.json({
    practice: practice || {
      practised: false,
      practisedAt: null
    }
  });
}

async function practise(req, res) {
  const ladderQuestion = await LadderQuestion.findOne({
    ladderId: req.ladder._id,
    questionId: req.params.questionId
  }).select('questionId');

  if (!ladderQuestion) {
    throw httpError(404, 'Question is not in this ladder');
  }

  const now = new Date();

  const practice = await UserLadderQuestionPractice.findOneAndUpdate(
    {
      userId: req.user.id,
      ladderId: req.ladder._id,
      questionId: req.params.questionId
    },
    {
      $set: {
        practised: true,
        practisedAt: now
      }
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  res.json({ practice });
}

async function clearPractice(req, res) {
  await UserLadderQuestionPractice.deleteMany({
    userId: req.user.id,
    ladderId: req.ladder._id
  });

  res.json({ message: 'Ladder practice history cleared' });
}

async function unpractise(req, res) {
  const practice = await UserLadderQuestionPractice.findOneAndUpdate(
    {
      userId: req.user.id,
      ladderId: req.ladder._id,
      questionId: req.params.questionId
    },
    {
      $set: {
        practised: false,
        practisedAt: null
      }
    },
    { returnDocument: 'after' }
  );

  if (!practice) {
    return res.json({
      practice: {
        practised: false,
        practisedAt: null
      }
    });
  }

  res.json({ practice });
}

async function setMode(req, res) {
  const { mode } = req.body;

  if (!['NORMAL', 'REVISION'].includes(mode)) {
    throw httpError(400, 'mode must be NORMAL or REVISION');
  }

  const update = { mode };

  if (mode === 'REVISION') {
    update.revisionStartedAt = new Date();
  } else {
    update.revisionStartedAt = null;
  }

  const ladder = await Ladder.findByIdAndUpdate(
    req.ladder._id,
    { $set: update },
    { returnDocument: 'after', runValidators: true }
  );

  res.json({ ladder });
}

async function getRevision(req, res) {
  const ladderQuestions = await LadderQuestion.find({
    ladderId: req.ladder._id
  }).sort({ order: 1 }).lean();

  const ids = ladderQuestions.map(item => item.questionId);

  const [questions, solvedStates, practices] = await Promise.all([
    Question.find({ _id: { $in: ids } }).lean(),
    UserQuestionState.find({
      userId: req.user.id,
      questionId: { $in: ids },
      solved: true
    }).lean(),
    UserLadderQuestionPractice.find({
      userId: req.user.id,
      ladderId: req.ladder._id,
      questionId: { $in: ids },
      practised: true
    }).lean()
  ]);

  const solved = new Set(solvedStates.map(s => String(s.questionId)));
  const practised = new Set(practices.map(s => String(s.questionId)));
  const questionById = new Map(questions.map(q => [String(q._id), q]));

  const candidates = ladderQuestions
    .filter(lq => solved.has(String(lq.questionId)) && !practised.has(String(lq.questionId)))
    .map(lq => ({
      ...questionById.get(String(lq.questionId)),
      order: lq.order
    }));

  res.json({
    mode: req.ladder.mode,
    revisionStartedAt: req.ladder.revisionStartedAt,
    questions: candidates
  });
}

async function listMembers(req, res) {
  const members = await LadderMember.find({
    ladderId: req.ladder._id
  }).lean();

  const userIds = members.map(member => member.userId);
  const users = await User.find({
    _id: { $in: userIds }
  }).select('_id username').lean();

  const usernameById = new Map(users.map(user => [String(user._id), user.username]));

  res.json({
    members: members.map(member => ({
      username: usernameById.get(String(member.userId)),
      role: member.role,
      createdAt: member.createdAt
    }))
  });
}

async function addMember(req, res) {
  const { username, role } = req.body;

  if (typeof username !== 'string' || !username.trim()) {
    throw httpError(400, 'username is required');
  }

  if (!['READ', 'WRITE'].includes(role)) {
    throw httpError(400, 'role must be READ or WRITE');
  }

  const user = await User.findOne({
    username: username.trim()
  }).select('_id username');

  if (!user) {
    throw httpError(404, 'User not found');
  }

  if (String(user._id) === String(req.ladder.ownerId)) {
    throw httpError(400, 'The ladder owner cannot be added as a member');
  }

  const member = await LadderMember.findOneAndUpdate(
    {
      ladderId: req.ladder._id,
      userId: user._id
    },
    {
      $set: { role }
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  res.status(200).json({
    member: {
      username: user.username,
      role: member.role
    }
  });
}

async function updateMember(req, res) {
  const user = await User.findOne({
    username: req.params.username
  }).select('_id username');

  if (!user) {
    throw httpError(404, 'User not found');
  }

  if (!['READ', 'WRITE'].includes(req.body.role)) {
    throw httpError(400, 'role must be READ or WRITE');
  }

  const member = await LadderMember.findOneAndUpdate(
    {
      ladderId: req.ladder._id,
      userId: user._id
    },
    {
      $set: { role: req.body.role }
    },
    { returnDocument: 'after' }
  );

  if (!member) {
    throw httpError(404, 'Ladder member not found');
  }

  res.json({
    member: {
      username: user.username,
      role: member.role
    }
  });
}

async function removeMember(req, res) {
  const user = await User.findOne({
    username: req.params.username
  }).select('_id username');

  if (!user) {
    throw httpError(404, 'User not found');
  }

  const deleted = await LadderMember.findOneAndDelete({
    ladderId: req.ladder._id,
    userId: user._id
  });

  if (!deleted) {
    throw httpError(404, 'Ladder member not found');
  }

  res.json({ message: 'Member removed' });
}

async function publishLadder(req, res) {
  if (req.ladder.isPublic) {
    throw httpError(400, 'This ladder is already publicly listed.');
  }

  const { description } = req.body;
  if (!description || typeof description !== 'string' || !description.trim()) {
    throw httpError(400, 'Please state what you claim for this ladder (description / purpose)');
  }

  const publicCount = await Ladder.countDocuments({ ownerId: req.user.id, isPublic: true });
  if (publicCount >= 10 && req.user.role !== 'ADMIN') {
    throw httpError(400, 'You can have at most 10 publicly listed ladders.');
  }

  const questionCount = await LadderQuestion.countDocuments({ ladderId: req.ladder._id });
  if (questionCount === 0) {
    throw httpError(400, 'Cannot publish an empty ladder. Please add questions before publishing.');
  }

  const ladder = await Ladder.findByIdAndUpdate(
    req.ladder._id,
    {
      $set: {
        isPublic: true,
        publishedAt: new Date(),
        description: description.trim()
      }
    },
    { returnDocument: 'after', runValidators: true }
  );

  res.json({
    ladder,
    message: 'Ladder published to Community Ladders!'
  });
}

async function listMarketplaceLadders(req, res) {
  try {
    const publicLadders = await Ladder.find({ isPublic: true })
      .populate('ownerId', 'username role')
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean()
      .catch(() => []);

    const ladderIds = publicLadders.map(l => l._id);

    const [questionCounts, solvedCounts] = await Promise.all([
      LadderQuestion.aggregate([
        { $match: { ladderId: { $in: ladderIds } } },
        { $group: { _id: '$ladderId', count: { $sum: 1 } } }
      ]).catch(() => []),
      (async () => {
        if (!req.user) return [];
        try {
          const allLadderQuestions = await LadderQuestion.find({
            ladderId: { $in: ladderIds }
          }).select('ladderId questionId').lean();

          const questionIds = [...new Set(allLadderQuestions.map(lq => lq.questionId))];

          const solvedStates = await UserQuestionState.find({
            userId: req.user.id,
            questionId: { $in: questionIds },
            solved: true
          }).select('questionId').lean();

          const solvedSet = new Set(solvedStates.map(s => String(s.questionId)));

          const counts = {};
          for (const lq of allLadderQuestions) {
            const lid = String(lq.ladderId);
            if (!counts[lid]) counts[lid] = 0;
            if (solvedSet.has(String(lq.questionId))) counts[lid]++;
          }
          return Object.entries(counts).map(([id, count]) => ({ _id: new mongoose.Types.ObjectId(id), count }));
        } catch {
          return [];
        }
      })()
    ]);

    const qCountMap = new Map(questionCounts.map(c => [String(c._id), c.count]));
    const sCountMap = new Map(solvedCounts.map(c => [String(c._id), c.count]));

    const dbResults = publicLadders.map(ladder => {
      const isLiked = req.user && (ladder.likes || []).some(id => String(id) === String(req.user.id));
      const isDisliked = req.user && (ladder.dislikes || []).some(id => String(id) === String(req.user.id));
      const upvotesCount = (ladder.likes || []).length;
      const downvotesCount = (ladder.dislikes || []).length;
      const normalizedVote = isLiked ? 'UPVOTE' : isDisliked ? 'DOWNVOTE' : null;

      return {
        ...ladder,
        ownerUsername: ladder.ownerId?.username || ladder.ownerUsername || 'Anonymous',
        questionCount: qCountMap.get(String(ladder._id)) || 0,
        solvedCount: sCountMap.get(String(ladder._id)) || 0,
        likesCount: upvotesCount,
        dislikesCount: downvotesCount,
        upvotesCount,
        downvotesCount,
        score: upvotesCount - downvotesCount,
        userVote: normalizedVote,
        userVoteLegacy: isLiked ? 'LIKE' : isDisliked ? 'DISLIKE' : null,
        isOwner: req.user ? String(ladder.ownerId?._id || ladder.ownerId) === String(req.user.id) : false
      };
    });

    const curatedDefaults = defaultLadders.getDefaultMarketplaceLadders();
    const existingTitles = new Set(dbResults.map(l => l.title.toLowerCase()));
    const additionalCurated = curatedDefaults.filter(c => !existingTitles.has(c.title.toLowerCase()));

    res.json({
      ladders: [...dbResults, ...additionalCurated]
    });
  } catch (err) {
    console.error('Error in listMarketplaceLadders:', err);
    res.json({
      ladders: defaultLadders.getDefaultMarketplaceLadders()
    });
  }
}

async function voteLadder(req, res) {
  const { vote: rawVote } = req.body;
  let vote = null;
  if (['UPVOTE', 'LIKE'].includes(rawVote)) vote = 'LIKE';
  else if (['DOWNVOTE', 'DISLIKE'].includes(rawVote)) vote = 'DISLIKE';
  else {
    throw httpError(400, "vote must be 'UPVOTE' or 'DOWNVOTE'");
  }

  const ladder = await Ladder.findById(req.ladder._id);
  if (!ladder) {
    throw httpError(404, 'Ladder not found');
  }

  const userId = String(req.user.id);
  const isLiked = (ladder.likes || []).some(id => String(id) === userId);
  const isDisliked = (ladder.dislikes || []).some(id => String(id) === userId);

  // 2-minute lock rule: if already voted, vote cannot be changed after 2 minutes
  if (isLiked || isDisliked) {
    const existingVote = (ladder.votes || []).find(v => String(v.userId) === userId);
    const voteTimestamp = existingVote?.votedAt || ladder.updatedAt || ladder.createdAt;

    if (voteTimestamp) {
      const elapsedMs = Date.now() - new Date(voteTimestamp).getTime();
      if (elapsedMs > 2 * 60 * 1000) {
        throw httpError(403, 'Vote is locked and cannot be changed after 2 minutes');
      }
    }
  }

  let userVote = null;

  if (vote === 'LIKE') {
    if (isLiked) {
      // Toggle off within 2-minute window
      ladder.likes = (ladder.likes || []).filter(id => String(id) !== userId);
      ladder.votes = (ladder.votes || []).filter(v => String(v.userId) !== userId);
      userVote = null;
    } else {
      // Upvote (new or switch from downvote)
      ladder.likes = [...new Set([...(ladder.likes || []).map(String), userId])];
      ladder.dislikes = (ladder.dislikes || []).filter(id => String(id) !== userId);
      const remainingVotes = (ladder.votes || []).filter(v => String(v.userId) !== userId);
      remainingVotes.push({
        userId: req.user.id,
        vote: 'LIKE',
        votedAt: new Date()
      });
      ladder.votes = remainingVotes;
      userVote = 'LIKE';
    }
  } else if (vote === 'DISLIKE') {
    if (isDisliked) {
      // Toggle off within 2-minute window
      ladder.dislikes = (ladder.dislikes || []).filter(id => String(id) !== userId);
      ladder.votes = (ladder.votes || []).filter(v => String(v.userId) !== userId);
      userVote = null;
    } else {
      // Downvote (new or switch from upvote)
      ladder.dislikes = [...new Set([...(ladder.dislikes || []).map(String), userId])];
      ladder.likes = (ladder.likes || []).filter(id => String(id) !== userId);
      const remainingVotes = (ladder.votes || []).filter(v => String(v.userId) !== userId);
      remainingVotes.push({
        userId: req.user.id,
        vote: 'DISLIKE',
        votedAt: new Date()
      });
      ladder.votes = remainingVotes;
      userVote = 'DISLIKE';
    }
  }

  await ladder.save();

  const upvotesCount = (ladder.likes || []).length;
  const downvotesCount = (ladder.dislikes || []).length;

  res.json({
    likesCount: upvotesCount,
    dislikesCount: downvotesCount,
    upvotesCount,
    downvotesCount,
    score: upvotesCount - downvotesCount,
    userVote: userVote === 'LIKE' ? 'UPVOTE' : userVote === 'DISLIKE' ? 'DOWNVOTE' : null,
    userVoteLegacy: userVote
  });
}

async function transferOwnership(req, res) {
  const ladderId = req.ladder._id;
  const { newOwnerUsername } = req.body;

  if (!newOwnerUsername || typeof newOwnerUsername !== "string" || !newOwnerUsername.trim()) {
    throw httpError(400, "newOwnerUsername is required");
  }

  const cleanUsername = newOwnerUsername.trim();
  const newOwner = await User.findOne({ username: cleanUsername });
  if (!newOwner) {
    throw httpError(404, `User "${cleanUsername}" not found`);
  }

  if (String(newOwner._id) === String(req.ladder.ownerId)) {
    throw httpError(400, "User is already the owner of this ladder");
  }

  const oldOwnerId = req.ladder.ownerId;
  req.ladder.ownerId = newOwner._id;
  await req.ladder.save();
  await LadderMember.deleteOne({ ladderId, userId: newOwner._id });
  await LadderMember.findOneAndUpdate(
    { ladderId, userId: oldOwnerId },
    { $set: { role: "WRITE" } },
    { upsert: true }
  );

  res.json({
    message: `Ownership successfully transferred to ${newOwner.username}`,
    ladder: {
      _id: req.ladder._id,
      title: req.ladder.title,
      ownerId: newOwner._id,
      ownerUsername: newOwner.username
    }
  });
}

module.exports = {
  transferOwnership,
  createLadder,
  listLadders,
  getLadder,
  updateLadder,
  deleteLadder,
  addQuestion,
  removeQuestion,
  reorderQuestions,
  getPractice,
  practise,
  unpractise,
  clearPractice,
  setMode,
  getRevision,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  publishLadder,
  listMarketplaceLadders,
  voteLadder
};
