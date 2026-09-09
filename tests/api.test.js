const request = require('supertest');
const mongoose = require('mongoose');

jest.setTimeout(30000);



require('dotenv').config();


const app = require('../app');

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeladder';



const User = require('../models/User');
const Question = require('../models/Question');
const Ladder = require('../models/Ladder');
const LadderQuestion = require('../models/LadderQuestion');
const LadderMember = require('../models/LadderMember');
const UserQuestionState = require('../models/UserQuestionState');
const UserLadderQuestionPractice = require('../models/UserLadderQuestionPractice');
const PlatformAccount = require('../models/PlatformAccount');

const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

const users = {
  owner: {
    username: `test_owner_${suffix}`,
    email: `test_owner_${suffix}@example.com`,
    password: 'TestPassword123!'
  },

  read: {
    username: `test_read_${suffix}`,
    email: `test_read_${suffix}@example.com`,
    password: 'TestPassword123!'
  },

  write: {
    username: `test_write_${suffix}`,
    email: `test_write_${suffix}@example.com`,
    password: 'TestPassword123!'
  },

  admin: {
    username: `test_admin_${suffix}`,
    email: `test_admin_${suffix}@example.com`,
    password: 'TestPassword123!'
  }
};

let ownerToken;
let readToken;
let writeToken;
let adminToken;

let question1;
let question2;
let ladderId;


/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */

function auth(token, username) {
  return {
    Authorization: `Bearer ${token}`,
    'X-Username': username
  };
}


async function registerAndLogin(user) {
  const register = await request(app)
    .post('/api/auth/register')
    .send(user);

  expect(register.statusCode).toBe(201);
  expect(register.body.token).toBeTruthy();

  const login = await request(app)
    .post('/api/auth/login')
    .send({
      username: user.username,
      password: user.password
    });

  expect(login.statusCode).toBe(200);
  expect(login.body.token).toBeTruthy();

  return login.body.token;
}


/* ---------------------------------------------------------
   Setup
--------------------------------------------------------- */

beforeAll(async () => {
     await mongoose.connect(MONGODB_URI);
  ownerToken = await registerAndLogin(users.owner);

  readToken = await registerAndLogin(users.read);

  writeToken = await registerAndLogin(users.write);

  adminToken = await registerAndLogin(users.admin);

  /*
   * Promote test admin to ADMIN.
   */
  await User.updateOne(
    { username: users.admin.username },
    {
      $set: {
        role: 'ADMIN'
      }
    }
  );

  /*
   * Login again after role change.
   */
  const login = await request(app)
    .post('/api/auth/login')
    .send({
      username: users.admin.username,
      password: users.admin.password
    });

  expect(login.statusCode).toBe(200);

  adminToken = login.body.token;
});

/* ---------------------------------------------------------
   Cleanup
--------------------------------------------------------- */

afterAll(async () => {
  try {
    const usernames = Object.values(users).map(
      user => user.username
    );

    const testUsers = await User.find({
      username: {
        $in: usernames
      }
    }).select('_id');

    const userIds = testUsers.map(
      user => user._id
    );

    const ladders = await Ladder.find({
      ownerId: {
        $in: userIds
      }
    }).select('_id');

    const ladderIds = ladders.map(
      ladder => ladder._id
    );

    await Promise.all([
      UserQuestionState.deleteMany({
        userId: {
          $in: userIds
        }
      }),

      UserLadderQuestionPractice.deleteMany({
        $or: [
          {
            userId: {
              $in: userIds
            }
          },
          {
            ladderId: {
              $in: ladderIds
            }
          }
        ]
      }),

      PlatformAccount.deleteMany({
        userId: {
          $in: userIds
        }
      }),

      LadderMember.deleteMany({
        $or: [
          {
            userId: {
              $in: userIds
            }
          },
          {
            ladderId: {
              $in: ladderIds
            }
          }
        ]
      }),

      LadderQuestion.deleteMany({
        ladderId: {
          $in: ladderIds
        }
      }),

      Ladder.deleteMany({
        _id: {
          $in: ladderIds
        }
      }),

      Question.deleteMany({
        externalId: {
          $in: [
            `TEST_${suffix}_1`,
            `TEST_${suffix}_2`
          ]
        }
      }),

      User.deleteMany({
        _id: {
          $in: userIds
        }
      })
    ]);
  } finally {
    await mongoose.disconnect();
  }
});
/* =========================================================
   TESTS
========================================================= */

describe('CodeLadder API', () => {


  /* =======================================================
     HEALTH
  ======================================================= */

  describe('Health', () => {

    test('GET /api/health', async () => {
      const res = await request(app)
        .get('/api/health');

      expect(res.statusCode).toBe(200);

      expect(res.body).toEqual({
        ok: true,
        service: 'codeladder-api'
      });
    });

  });


  /* =======================================================
     AUTH
  ======================================================= */

  describe('Authentication', () => {

    test('POST /api/auth/register', async () => {

      const user = {
        username: `extra_${suffix}`,
        email: `extra_${suffix}@example.com`,
        password: 'TestPassword123!'
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(user);

      expect(res.statusCode).toBe(201);

      expect(res.body.message)
        .toBe('Registration successful');

      expect(res.body.token)
        .toBeTruthy();

      expect(res.body.user)
        .toEqual({
          username: user.username,
          role: 'USER'
        });

      await User.deleteOne({
        username: user.username
      });
    });


    test('POST /api/auth/register rejects invalid username', async () => {

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'ab',
          email: `bad_${suffix}@example.com`,
          password: 'TestPassword123!'
        });

      expect(res.statusCode).toBe(400);
    });


    test('POST /api/auth/register rejects short password', async () => {

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: `short_${suffix}`,
          email: `short_${suffix}@example.com`,
          password: '1234567'
        });

      expect(res.statusCode).toBe(400);
    });


    test('POST /api/auth/login', async () => {

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: users.owner.username,
          password: users.owner.password
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.message)
        .toBe('Login successful');

      expect(res.body.token)
        .toBeTruthy();
    });


    test('POST /api/auth/login rejects wrong password', async () => {

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: users.owner.username,
          password: 'WrongPassword123!'
        });

      expect(res.statusCode).toBe(401);
    });


    test('GET /api/auth/me', async () => {

      const res = await request(app)
        .get('/api/auth/me')
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.user)
        .toEqual({
          username: users.owner.username,
          role: 'USER'
        });
    });


    test('GET /api/auth/me rejects missing authentication', async () => {

      const res = await request(app)
        .get('/api/auth/me');

      expect(res.statusCode).toBe(401);
    });


    test('GET /api/auth/me rejects mismatched X-Username', async () => {

      const res = await request(app)
        .get('/api/auth/me')
        .set(
          auth(
            ownerToken,
            users.read.username
          )
        );

      expect(res.statusCode).toBe(401);
    });

  });


  /* =======================================================
     QUESTIONS
  ======================================================= */

  describe('Questions', () => {

    test('GET /api/questions', async () => {

      const res = await request(app)
        .get('/api/questions');

      expect(res.statusCode).toBe(200);

      expect(
        Array.isArray(res.body.questions)
      ).toBe(true);

      expect(res.body.pagination)
        .toBeDefined();
    });


    test('GET /api/questions supports filters and pagination', async () => {

      const res = await request(app)
        .get('/api/questions')
        .query({
          platform: 'leetcode',
          difficulty: 'easy',
          page: 1,
          limit: 10
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.pagination.page)
        .toBe(1);

      expect(res.body.pagination.limit)
        .toBe(10);
    });


    test('POST /api/questions requires admin', async () => {

      const res = await request(app)
        .post('/api/questions')
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          platform: 'LEETCODE',
          externalId: `NOT_ALLOWED_${suffix}`,
          title: 'Unauthorized Question',
          url: 'https://leetcode.com/problems/test/',
          tags: ['array'],
          difficulty: 'EASY'
        });

      expect(res.statusCode).toBe(403);
    });


    test('POST /api/questions creates first question', async () => {

      const res = await request(app)
        .post('/api/questions')
        .set(
          auth(
            adminToken,
            users.admin.username
          )
        )
        .send({
          platform: 'LEETCODE',
          externalId: `TEST_${suffix}_1`,
          title: 'Test Question One',
          url: 'https://leetcode.com/problems/test-question-one/',
          tags: ['array'],
          difficulty: 'EASY'
        });

      expect(res.statusCode).toBe(201);

      expect(res.body.question._id)
        .toBeTruthy();

      expect(res.body.question.title)
        .toBe('Test Question One');

      question1 = res.body.question;
    });


    test('POST /api/questions creates second question', async () => {

      const res = await request(app)
        .post('/api/questions')
        .set(
          auth(
            adminToken,
            users.admin.username
          )
        )
        .send({
          platform: 'CODEFORCES',
          externalId: `TEST_${suffix}_2`,
          title: 'Test Question Two',
          url: 'https://codeforces.com/problemset/problem/1/A',
          tags: ['math'],
          difficulty: 'MEDIUM'
        });

      expect(res.statusCode).toBe(201);

      question2 = res.body.question;
    });


    test('GET /api/questions/:questionId', async () => {

      const res = await request(app)
        .get(
          `/api/questions/${question1._id}`
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.question._id)
        .toBe(question1._id);
    });


    test('GET /api/questions/:questionId returns 404', async () => {

      const fakeId =
        new mongoose.Types.ObjectId();

      const res = await request(app)
        .get(
          `/api/questions/${fakeId}`
        );

      expect(res.statusCode).toBe(404);
    });


    test('GET /api/questions/:questionId rejects invalid ObjectId', async () => {

      const res = await request(app)
        .get(
          '/api/questions/not-an-object-id'
        );

      expect(res.statusCode).toBe(400);
    });


    test('PUT /api/questions/:questionId updates question', async () => {

      const res = await request(app)
        .put(
          `/api/questions/${question1._id}`
        )
        .set(
          auth(
            adminToken,
            users.admin.username
          )
        )
        .send({
          title: 'Updated Test Question One'
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.question.title)
        .toBe('Updated Test Question One');
    });


    test('PUT /api/questions/:questionId rejects normal user', async () => {

      const res = await request(app)
        .put(
          `/api/questions/${question1._id}`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          title: 'Should Not Update'
        });

      expect(res.statusCode).toBe(403);
    });

  });


  /* =======================================================
     GLOBAL QUESTION STATE
  ======================================================= */

  describe('Global Question State', () => {

    test('GET question state starts empty', async () => {

      const res = await request(app)
        .get(
          `/api/questions/${question1._id}/state`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.state.solved)
        .toBe(false);

      expect(res.body.state.starred)
        .toBe(false);
    });


    test('POST solve question', async () => {

      const res = await request(app)
        .post(
          `/api/questions/${question1._id}/solve`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.state.solved)
        .toBe(true);

      expect(res.body.state.firstSolvedAt)
        .toBeTruthy();

      expect(res.body.state.solvedAt)
        .toBeTruthy();
    });


    test('solve again preserves firstSolvedAt', async () => {

      const user = await User.findOne({
        username: users.owner.username
      });

      const before =
        await UserQuestionState.findOne({
          userId: user._id,
          questionId: question1._id
        }).lean();

      const res = await request(app)
        .post(
          `/api/questions/${question1._id}/solve`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(
        new Date(
          res.body.state.firstSolvedAt
        ).getTime()
      ).toBe(
        new Date(
          before.firstSolvedAt
        ).getTime()
      );
    });


    test('unsolve works within two minutes', async () => {

      const res = await request(app)
        .post(
          `/api/questions/${question1._id}/unsolve`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.state.solved)
        .toBe(false);

      expect(res.body.state.solvedAt)
        .toBeNull();

      expect(res.body.state.firstSolvedAt)
        .toBeTruthy();
    });


    test('unsolve rejects question that is not solved', async () => {

      const res = await request(app)
        .post(
          `/api/questions/${question1._id}/unsolve`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(400);
    });


    test('PUT star question', async () => {

      const res = await request(app)
        .put(
          `/api/questions/${question1._id}/star`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          starred: true
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.state.starred)
        .toBe(true);
    });


    test('PUT star rejects non-boolean', async () => {

      const res = await request(app)
        .put(
          `/api/questions/${question1._id}/star`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          starred: 'true'
        });

      expect(res.statusCode).toBe(400);
    });


    test('DELETE star question', async () => {

      const res = await request(app)
        .delete(
          `/api/questions/${question1._id}/star`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.state.starred)
        .toBe(false);
    });


    test('GET /api/me/questions/solved', async () => {

      await request(app)
        .post(
          `/api/questions/${question1._id}/solve`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      const res = await request(app)
        .get('/api/me/questions/solved')
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(
        Array.isArray(res.body.questions)
      ).toBe(true);

      expect(
        res.body.questions.some(
          q => q._id === question1._id
        )
      ).toBe(true);
    });


    test('GET /api/me/questions/starred', async () => {

      await request(app)
        .put(
          `/api/questions/${question1._id}/star`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          starred: true
        });

      const res = await request(app)
        .get('/api/me/questions/starred')
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(
        res.body.questions.some(
          q => q._id === question1._id
        )
      ).toBe(true);
    });

  });


  /* =======================================================
     PUBLIC USERS
  ======================================================= */

  describe('Public Users', () => {

    test('GET /api/users/:username', async () => {

      const res = await request(app)
        .get(
          `/api/users/${users.owner.username}`
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.user.username)
        .toBe(users.owner.username);
    });


    test('GET /api/users/:username/stats', async () => {

      const res = await request(app)
        .get(
          `/api/users/${users.owner.username}/stats`
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.username)
        .toBe(users.owner.username);

      expect(res.body.stats)
        .toEqual(
          expect.objectContaining({
            solved: expect.any(Number),
            starred: expect.any(Number),
            practised: expect.any(Number)
          })
        );
    });


    test('GET nonexistent user returns 404', async () => {

      const res = await request(app)
        .get(
          `/api/users/does_not_exist_${suffix}`
        );

      expect(res.statusCode).toBe(404);
    });

  });


  /* =======================================================
     LADDERS
  ======================================================= */

  describe('Ladders', () => {

    test('GET /api/ladders', async () => {

      const res = await request(app)
        .get('/api/ladders')
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(
        Array.isArray(res.body.ladders)
      ).toBe(true);
    });


    test('POST /api/ladders creates ladder', async () => {

      const res = await request(app)
        .post('/api/ladders')
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          title: 'Test Ladder'
        });

      expect(res.statusCode).toBe(201);

      expect(res.body.ladder._id)
        .toBeTruthy();

      expect(res.body.ladder.title)
        .toBe('Test Ladder');

      expect(res.body.ladder.role)
        .toBe('OWNER');

      ladderId =
        res.body.ladder._id;
    });


    test('POST /api/ladders rejects empty title', async () => {

      const res = await request(app)
        .post('/api/ladders')
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          title: '   '
        });

      expect(res.statusCode).toBe(400);
    });


    test('GET /api/ladders/:ladderId', async () => {

      const res = await request(app)
        .get(
          `/api/ladders/${ladderId}`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.role)
        .toBe('OWNER');

      expect(res.body.ladder._id)
        .toBe(ladderId);
    });


    test('PUT /api/ladders/:ladderId', async () => {

      const res = await request(app)
        .put(
          `/api/ladders/${ladderId}`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          title: 'Updated Test Ladder'
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.ladder.title)
        .toBe('Updated Test Ladder');
    });


    test('POST add first ladder question', async () => {

      const res = await request(app)
        .post(
          `/api/ladders/${ladderId}/questions`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          questionId: question1._id
        });

      expect(res.statusCode).toBe(201);

      expect(
        res.body.ladderQuestion.questionId
      ).toBe(question1._id);

      expect(
        res.body.ladderQuestion.order
      ).toBe(1);
    });


    test('POST add second ladder question', async () => {

      const res = await request(app)
        .post(
          `/api/ladders/${ladderId}/questions`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          questionId: question2._id
        });

      expect(res.statusCode).toBe(201);

      expect(
        res.body.ladderQuestion.order
      ).toBe(2);
    });


    test('GET ladder returns questions', async () => {

      const res = await request(app)
        .get(
          `/api/ladders/${ladderId}`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.questions)
        .toHaveLength(2);

      expect(res.body.questions[0].state)
        .toBeDefined();

      expect(res.body.questions[0].practice)
        .toBeDefined();
    });


    test('duplicate ladder question is rejected', async () => {

      const res = await request(app)
        .post(
          `/api/ladders/${ladderId}/questions`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          questionId: question1._id
        });

      expect(res.statusCode)
        .not.toBe(201);
    });


    test('PUT reorder ladder questions', async () => {

      const res = await request(app)
        .put(
          `/api/ladders/${ladderId}/questions/reorder`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          questions: [
            {
              questionId: question2._id,
              order: 1
            },
            {
              questionId: question1._id,
              order: 2
            }
          ]
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.message)
        .toBe('Ladder reordered');
    });


    test('reorder rejects duplicate orders', async () => {

      const res = await request(app)
        .put(
          `/api/ladders/${ladderId}/questions/reorder`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          questions: [
            {
              questionId: question1._id,
              order: 1
            },
            {
              questionId: question2._id,
              order: 1
            }
          ]
        });

      expect(res.statusCode).toBe(400);
    });

  });


  /* =======================================================
     LADDER PRACTICE
  ======================================================= */

  describe('Ladder Practice', () => {

    test('GET practice state', async () => {

      const res = await request(app)
        .get(
          `/api/ladders/${ladderId}/questions/${question1._id}/practice`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.practice.practised)
        .toBe(false);
    });


    test('POST practise question', async () => {

      const res = await request(app)
        .post(
          `/api/ladders/${ladderId}/questions/${question1._id}/practise`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.practice.practised)
        .toBe(true);

      expect(res.body.practice.practisedAt)
        .toBeTruthy();
    });


    test('DELETE unpractise question', async () => {

      const res = await request(app)
        .delete(
          `/api/ladders/${ladderId}/questions/${question1._id}/practise`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.practice.practised)
        .toBe(false);

      expect(res.body.practice.practisedAt)
        .toBeNull();
    });

  });


  /* =======================================================
     REVISION
  ======================================================= */

  describe('Revision', () => {

    test('PUT enable revision mode', async () => {

      const res = await request(app)
        .put(
          `/api/ladders/${ladderId}/mode`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          mode: 'REVISION'
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.ladder.mode)
        .toBe('REVISION');

      expect(
        res.body.ladder.revisionStartedAt
      ).toBeTruthy();
    });


    test('GET revision', async () => {

      const res = await request(app)
        .get(
          `/api/ladders/${ladderId}/revision`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.mode)
        .toBe('REVISION');

      expect(
        Array.isArray(res.body.questions)
      ).toBe(true);
    });


    test('PUT revision rejects invalid mode', async () => {

      const res = await request(app)
        .put(
          `/api/ladders/${ladderId}/mode`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          mode: 'INVALID'
        });

      expect(res.statusCode).toBe(400);
    });

  });


  /* =======================================================
     COLLABORATION
  ======================================================= */

  describe('Collaboration', () => {

    test('POST add READ member', async () => {

      const res = await request(app)
        .post(
          `/api/ladders/${ladderId}/members`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          username: users.read.username,
          role: 'READ'
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.member)
        .toEqual({
          username: users.read.username,
          role: 'READ'
        });
    });


    test('GET members', async () => {

      const res = await request(app)
        .get(
          `/api/ladders/${ladderId}/members`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(
        res.body.members.some(
          member =>
            member.username === users.read.username
        )
      ).toBe(true);
    });


    test('READ member can access ladder', async () => {

      const res = await request(app)
        .get(
          `/api/ladders/${ladderId}`
        )
        .set(
          auth(
            readToken,
            users.read.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.role)
        .toBe('READ');
    });


    test('READ member cannot update ladder', async () => {

      const res = await request(app)
        .put(
          `/api/ladders/${ladderId}`
        )
        .set(
          auth(
            readToken,
            users.read.username
          )
        )
        .send({
          title: 'Should Fail'
        });

      expect(res.statusCode).toBe(403);
    });


    test('Owner changes READ member to WRITE', async () => {

      const res = await request(app)
        .put(
          `/api/ladders/${ladderId}/members/${users.read.username}`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          role: 'WRITE'
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.member.role)
        .toBe('WRITE');
    });


    test('WRITE member can update ladder', async () => {

      const res = await request(app)
        .put(
          `/api/ladders/${ladderId}`
        )
        .set(
          auth(
            readToken,
            users.read.username
          )
        )
        .send({
          title: 'Updated By Write Member'
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.ladder.title)
        .toBe('Updated By Write Member');
    });


    test('Owner adds second WRITE member', async () => {

      const res = await request(app)
        .post(
          `/api/ladders/${ladderId}/members`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          username: users.write.username,
          role: 'WRITE'
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.member.role)
        .toBe('WRITE');
    });


    test('WRITE member reaches ladder question API', async () => {

      const res = await request(app)
        .post(
          `/api/ladders/${ladderId}/questions`
        )
        .set(
          auth(
            writeToken,
            users.write.username
          )
        )
        .send({
          questionId: question1._id
        });

      /*
       * The question is already in the ladder,
       * so this should fail at the duplicate constraint,
       * not because of permissions.
       */
      expect(res.statusCode)
        .not.toBe(403);
    });


    test('Owner removes member', async () => {

      const res = await request(app)
        .delete(
          `/api/ladders/${ladderId}/members/${users.read.username}`
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.message)
        .toBe('Member removed');
    });


    test('Removed member cannot access ladder', async () => {

      const res = await request(app)
        .get(
          `/api/ladders/${ladderId}`
        )
        .set(
          auth(
            readToken,
            users.read.username
          )
        );

      expect(res.statusCode).toBe(403);
    });

  });


  /* =======================================================
     PLATFORM ACCOUNTS
  ======================================================= */

  describe('Platform Accounts', () => {

    test('GET /api/platform-accounts', async () => {

      const res = await request(app)
        .get('/api/platform-accounts')
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(
        Array.isArray(res.body.accounts)
      ).toBe(true);
    });


    test('PUT /api/platform-accounts/:platform creates account', async () => {

      const res = await request(app)
        .put(
          '/api/platform-accounts/leetcode'
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          handle: 'test_handle'
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.account.platform)
        .toBe('LEETCODE');

      expect(res.body.account.handle)
        .toBe('test_handle');

      expect(res.body.account.verified)
        .toBe(false);
    });


    test('PUT platform account updates handle', async () => {

      const res = await request(app)
        .put(
          '/api/platform-accounts/leetcode'
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          handle: 'updated_test_handle'
        });

      expect(res.statusCode).toBe(200);

      expect(res.body.account.handle)
        .toBe('updated_test_handle');
    });


    test('PUT unsupported platform rejects request', async () => {

      const res = await request(app)
        .put(
          '/api/platform-accounts/unknown'
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        )
        .send({
          handle: 'test'
        });

      expect(res.statusCode).toBe(400);
    });


    test('DELETE platform account', async () => {

      const res = await request(app)
        .delete(
          '/api/platform-accounts/leetcode'
        )
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.message)
        .toBe('Platform account removed');
    });

  });


  /* =======================================================
     ADMIN
  ======================================================= */

  describe('Admin', () => {

    test('GET /api/admin/users rejects normal user', async () => {

      const res = await request(app)
        .get('/api/admin/users')
        .set(
          auth(
            ownerToken,
            users.owner.username
          )
        );

      expect(res.statusCode).toBe(403);
    });


    test('GET /api/admin/users', async () => {

      const res = await request(app)
        .get('/api/admin/users')
        .set(
          auth(
            adminToken,
            users.admin.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(
        Array.isArray(res.body.users)
      ).toBe(true);

      expect(res.body.pagination)
        .toBeDefined();
    });


    test('GET /api/admin/users/:username', async () => {

      const res = await request(app)
        .get(
          `/api/admin/users/${users.owner.username}`
        )
        .set(
          auth(
            adminToken,
            users.admin.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(res.body.user.username)
        .toBe(users.owner.username);

      expect(res.body.user.email)
        .toBe(users.owner.email);
    });


    test('GET /api/admin/ladders', async () => {

      const res = await request(app)
        .get('/api/admin/ladders')
        .set(
          auth(
            adminToken,
            users.admin.username
          )
        );

      expect(res.statusCode).toBe(200);

      expect(
        Array.isArray(res.body.ladders)
      ).toBe(true);
    });

  });


  /* =======================================================
     AUTHENTICATION COVERAGE
  ======================================================= */

  describe('Protected API authentication', () => {

    test('GET /api/ladders rejects unauthenticated request', async () => {

      const res = await request(app)
        .get('/api/ladders');

      expect(res.statusCode).toBe(401);
    });


    test('GET /api/me/questions/solved rejects unauthenticated request', async () => {

      const res = await request(app)
        .get('/api/me/questions/solved');

      expect(res.statusCode).toBe(401);
    });


    test('GET /api/platform-accounts rejects unauthenticated request', async () => {

      const res = await request(app)
        .get('/api/platform-accounts');

      expect(res.statusCode).toBe(401);
    });


    test('POST /api/questions rejects unauthenticated request', async () => {

      const res = await request(app)
        .post('/api/questions')
        .send({
          platform: 'LEETCODE',
          externalId: `UNAUTH_${suffix}`,
          title: 'Unauthorized',
          url: 'https://example.com'
        });

      expect(res.statusCode).toBe(401);
    });

  });

});