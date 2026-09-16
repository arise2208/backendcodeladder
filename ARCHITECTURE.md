# CodeLadder Backend Architecture Reference (`ARCHITECTURE.md`)

> **CRITICAL RULE**: This document and its companion `architecture.json` are the authoritative source of truth for the CodeLadder backend architecture. Before making any edits, consult these files. If any change alters modules, dependencies, routes, or workflows, update both files in the same changeset.

---

## 1. System Overview

CodeLadder Backend is a high-performance RESTful API and competitive programming intelligence service powering the CodeLadder platform. It manages user authentication, in-memory problem catalog indexing (~22,000+ problems across LeetCode, Codeforces, CodeChef, and AtCoder), contest upsolving catalogs, personal/community problem ladders, practice revision scheduling, team collaboration, Codeforces-style community blogs with commenting and upvoting, platform profile syncing, and administrative operations. The service is built with **JavaScript (CommonJS / Node.js 18+)** on the **Express 5.2.1** framework with **MongoDB 6+ / Mongoose 9.9.5** as the primary datastore, supplemented by an in-memory indexing catalog (`services/questionCatalog.js`) for sub-millisecond query execution.

---

## 2. Feature Inventory

### 2.1 Authentication & Identity Management
- **Purpose**: Issues and verifies JSON Web Tokens (JWT) for secure session management with dual-header validation.
- **Entry Points / Routes**:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - `POST /api/auth/logout-all`
- **Key Functions / Classes**:
  - `controllers/authController.js`: `register()`, `login()`, `me()`, `signToken()`
  - `middleware/auth.js`: `auth()`, `optionalAuth()`
- **External Dependencies**: `bcrypt` (^6.0.0), `jsonwebtoken` (^9.0.3), `express` (^5.2.1)
- **Internal Modules**: `models/User.js`, `utils/httpError.js`, `utils/asyncHandler.js`
- **Data Read/Written**: MongoDB `users` collection.
- **Known Edge Cases / Fragile Spots**:
  - **JWT-only auth**: `Authorization: Bearer <token>` is the sole credential. `X-Username` header is no longer required or validated.
  - **Token revocation**: Each user has a `tokenVersion: Number` field (default 0). Every `auth()` call DB-checks that `payload.tokenVersion === user.tokenVersion`. Call `POST /api/auth/logout-all` to increment `tokenVersion` and invalidate all prior tokens.
  - **JWT TTL**: `JWT_EXPIRES_IN` defaults to `1d` (reduced from `7d`). `JWT_SECRET` must be ≥ 32 characters (enforced at startup).
  - **Account lockout**: After `MAX_LOGIN_ATTEMPTS` (default 10) consecutive failures the account is locked for `LOCK_DURATION_MINUTES` (default 15 min). Responds with HTTP 429 + `Retry-After` header. Counters reset on successful login.
  - **Password strength**: New registrations require ≥ 8 chars, at least one uppercase, one lowercase, one digit. Existing password hashes are unaffected.
  - **Timing-safe login**: If the username doesn't exist, a dummy bcrypt compare is performed to prevent username enumeration via response timing.
  - **Admin seeding**: Admin promotion is never automatic. Use `npm run seed:admin` (reads `ADMIN_SEED_USERNAME`, `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` env vars).

### 2.2 In-Memory Question Catalog & Problem Search
- **Purpose**: Fast multi-filter searching, pagination, and tag taxonomy normalization across 22,000+ competitive programming questions.
- **Entry Points / Routes**:
  - `GET /api/questions`
  - `GET /api/questions/tags`
  - `GET /api/questions/:questionId`
  - `POST /api/questions` (Admin)
  - `POST /api/questions/bulk` (Admin)
  - `PUT /api/questions/:questionId` (Admin)
  - `DELETE /api/questions/:questionId` (Admin)
- **Key Functions / Classes**:
  - `services/questionCatalog.js`: `QuestionCatalog` class (`init()`, `syncFromDatabase()`, `getPaginatedQuestions()`, `getTags()`, `getQuestionById()`, `getQuestionByPlatformAndExternalId()`)
  - `controllers/questionController.js`: `listQuestions()`, `getTags()`, `getQuestion()`, `createQuestion()`, `updateQuestion()`, `deleteQuestion()`, `importBulkQuestions()`
  - `middleware/validateObjectId.js`: Resolves platform strings/custom IDs to valid ObjectIds via catalog lookup.
- **External Dependencies**: `mongoose` (^9.9.5)
- **Internal Modules**: `models/Question.js`, `services/questionCatalog.js`, `utils/httpError.js`
- **Data Read/Written**: Initial load from `data/questions.json`; MongoDB `questions` collection; in-memory `Map` indices (`byId`, `byPlatformAndExternalId`, `tagsByPlatform`, `allTags`).
- **Known Edge Cases / Fragile Spots**:
  - Tag normalization filters junk tags via `isJunkTag()` regex and collapses aliases (e.g., `dynamic programming` -> `dp`, `sorting` -> `sortings`).
  - Supports non-ObjectId identifiers in routes via fallback mapping in `validateObjectId`.

### 2.3 User Progress & Global Question State
- **Purpose**: Tracks global solve history and starred bookmarks for each user.
- **Entry Points / Routes**:
  - `GET /api/questions/:questionId/state`
  - `POST /api/questions/:questionId/solve`
  - `POST /api/questions/:questionId/unsolve`
  - `PUT /api/questions/:questionId/star`
  - `DELETE /api/questions/:questionId/star`
  - `GET /api/me/questions/solved`
  - `GET /api/me/questions/starred`
- **Key Functions / Classes**:
  - `controllers/progressController.js`: `getState()`, `solve()`, `unsolve()`, `setStar()`, `removeStar()`, `listSolved()`, `listStarred()`
- **External Dependencies**: `mongoose` (^9.9.5)
- **Internal Modules**: `models/UserQuestionState.js`, `models/Question.js`, `services/questionCatalog.js`, `utils/httpError.js`
- **Data Read/Written**: MongoDB `userquestionstates` collection.
- **Known Edge Cases / Fragile Spots**:
  - `solve()` and `unsolve()` at `POST /api/questions/:id/solve` and `POST /api/questions/:id/unsolve` now return **HTTP 501 Not Implemented**. Manual solve marking is retired; use `POST /api/platform-accounts/sync-solved` instead.
  - `UserQuestionState` model now includes `verified: Boolean (default: false)` and `verificationMethod: enum ['LEETCODE_CHALLENGE', 'CODEFORCES_API', 'SCRAPE', 'MANUAL_UNVERIFIED', 'UNVERIFIED'] (default: 'UNVERIFIED')` fields.
  - Compound index `{ userId: 1, verified: 1 }` added to `UserQuestionState`.

### 2.4 Ladders & Curated Practice Sheets
- **Purpose**: Create, reorder, manage, publish, and search practice problem ladders, with built-in support for default templates (Blind 75, NeetCode 150, CP-31, CF Div 2).
- **Entry Points / Routes**:
  - `GET /api/ladders`
  - `POST /api/ladders`
  - `GET /api/ladders/marketplace`
  - `GET /api/ladders/:ladderId`
  - `PUT /api/ladders/:ladderId`
  - `DELETE /api/ladders/:ladderId`
  - `POST /api/ladders/:ladderId/questions`
  - `PUT /api/ladders/:ladderId/questions/reorder`
  - `DELETE /api/ladders/:ladderId/questions/:questionId`
  - `POST /api/ladders/:ladderId/publish`
  - `POST /api/ladders/:ladderId/vote`
  - `POST /api/ladders/:ladderId/transfer-ownership` *(new)*
- **Key Functions / Classes**:
  - `controllers/ladderController.js`: `createLadder()`, `listLadders()`, `getLadder()`, `updateLadder()`, `deleteLadder()`, `addQuestion()`, `removeQuestion()`, `reorderQuestions()`, `publishLadder()`, `listMarketplaceLadders()`, `voteLadder()`, `transferOwnership()` *(new)*
  - `services/defaultLadders.js`: `getDefaultLadder()`, `getDefaultMarketplaceLadders()`
  - `middleware/ladderAccess.js`: `loadLadderAccess()`, `requireLadderAccess()`, `requireLadderWrite()`, `requireLadderOwner()`
- **External Dependencies**: `mongoose` (^9.9.5)
- **Internal Modules**: `models/Ladder.js`, `models/LadderQuestion.js`, `models/LadderMember.js`, `services/questionCatalog.js`, `services/defaultLadders.js`
- **Data Read/Written**: MongoDB `ladders`, `ladderquestions`, `laddermembers` collections.
- **Known Edge Cases / Fragile Spots**:
  - User quota: maximum 10 personal ladders per user (`MAX_LADDERS = 10`).
  - Public quota: maximum 10 published ladders per user. Publishing is irreversible (`isPublic: true`).
  - IDs starting with `default-` (e.g., `default-blind-75`) bypass MongoDB and resolve dynamically via `services/defaultLadders.js`.

### 2.5 Ladder Practice & Revision Mode
- **Purpose**: Track blind practice completions per problem within a ladder, and calculate revision queues.
- **Entry Points / Routes**:
  - `GET /api/ladders/:ladderId/questions/:questionId/practice`
  - `POST /api/ladders/:ladderId/questions/:questionId/practise`
  - `DELETE /api/ladders/:ladderId/questions/:questionId/practise`
  - `POST /api/ladders/:ladderId/practise/clear`
  - `PUT /api/ladders/:ladderId/mode`
  - `GET /api/ladders/:ladderId/revision`
- **Key Functions / Classes**:
  - `controllers/ladderController.js`: `getPractice()`, `practise()`, `unpractise()`, `clearPractice()`, `setMode()`, `getRevision()`
- **External Dependencies**: `mongoose` (^9.9.5)
- **Internal Modules**: `models/UserLadderQuestionPractice.js`, `models/Ladder.js`
- **Data Read/Written**: MongoDB `userladderquestionpractices` collection.
- **Known Edge Cases / Fragile Spots**:
  - `setMode` accepts enum `['NORMAL', 'REVISION']`. Revision questions are computed by finding questions where `practised: true` and order was preserved.

### 2.6 Ladder Collaboration & Access Control
- **Purpose**: Manage shared ownership and collaborator access (`READ` vs `WRITE`) on personal ladders.
- **Entry Points / Routes**:
  - `GET /api/ladders/:ladderId/members`
  - `POST /api/ladders/:ladderId/members`
  - `PUT /api/ladders/:ladderId/members/:username`
  - `DELETE /api/ladders/:ladderId/members/:username`
- **Key Functions / Classes**:
  - `controllers/ladderController.js`: `listMembers()`, `addMember()`, `updateMember()`, `removeMember()`
  - `middleware/ladderAccess.js`: Checks roles (`OWNER`, `WRITE`, `READ`, `isPublicViewer`).
- **External Dependencies**: `mongoose` (^9.9.5)
- **Internal Modules**: `models/LadderMember.js`, `models/Ladder.js`, `models/User.js`
- **Data Read/Written**: MongoDB `laddermembers` collection.
- **Known Edge Cases / Fragile Spots**:
  - Ladder owners cannot add themselves as members.
  - Member role is strictly `READ` or `WRITE`. Only owners can add/modify/remove members.

### 2.7 Codeforces-Style Community Blogs & Comments
- **Purpose**: Rich markdown blogging platform with LaTeX formulas, syntax highlighting, upvotes/downvotes, 5-blog quotas, comments, and a real-time recent actions stream.
- **Entry Points / Routes**:
  - `GET /api/blogs`
  - `GET /api/blogs/recent-actions`
  - `GET /api/blogs/me/quota`
  - `GET /api/blogs/:id`
  - `POST /api/blogs`
  - `PUT /api/blogs/:id`
  - `DELETE /api/blogs/:id`
  - `POST /api/blogs/:id/vote`
  - `POST /api/blogs/:id/comments`
  - `DELETE /api/blogs/:id/comments/:commentId`
  - `POST /api/blogs/:id/comments/:commentId/vote`
- **Key Functions / Classes**:
  - `controllers/blogController.js`: `listBlogs()`, `getRecentActions()`, `getBlog()`, `createBlog()`, `updateBlog()`, `deleteBlog()`, `voteBlog()`, `addComment()`, `deleteComment()`, `voteComment()`, `getUserBlogQuota()`, `generateSnippet()`
- **External Dependencies**: `mongoose` (^9.9.5)
- **Internal Modules**: `models/Blog.js`, `models/User.js`
- **Data Read/Written**: MongoDB `blogs` collection (stores embedded `comments` schema).
- **Known Edge Cases / Fragile Spots**:
  - Strict quota: max 5 blogs per user (`MAX_BLOGS_PER_USER = 5`). Max 500 comments per blog (`MAX_COMMENTS_PER_BLOG = 500`).
  - Character limits: max 50,000 characters per blog body; 5,000 per comment.
  - **XSS sanitization**: `sanitizeInput()` helper strips `<script>` blocks, `on*=` event attributes, and `javascript:` URIs from blog titles, content, and comment content on create and update.
  - Votes support `UPVOTE` and `DOWNVOTE` (or legacy `LIKE`/`DISLIKE`). Repeated click toggles/clears the vote.
  - `createBlog` response now includes `content` field alongside `title`, `summary`, etc.

### 2.8 Platform Account Integration & Verification
- **Purpose**: Link external competitive programming handles (LeetCode, Codeforces, CodeChef, AtCoder), verify ownership via submission challenges, and batch sync solved problems.
- **Entry Points / Routes**:
  - `GET /api/platform-accounts`
  - `PUT /api/platform-accounts/:platform`
  - `DELETE /api/platform-accounts/:platform`
  - `POST /api/platform-accounts/sync-solved`
  - `POST /api/platform-accounts/leetcode/challenge/start`
  - `POST /api/platform-accounts/leetcode/challenge/verify`
  - `POST /api/platform-accounts/leetcode/submission`
  - `POST /api/platform-accounts/leetcode/sync`
- **Key Functions / Classes**:
  - `controllers/platformAccountController.js`: `listAccounts()`, `upsertAccount()`, `deleteAccount()`, `syncSolvedProblems()`, `startLeetCodeChallenge()`, `verifyLeetCodeChallenge()`, `recordSingleSubmission()`, `syncLeetCodeHistory()`
- **External Dependencies**: `mongoose` (^9.9.5)
- **Internal Modules**: `models/PlatformAccount.js`, `models/UserQuestionState.js`, `models/Question.js`
- **Data Read/Written**: MongoDB `platformaccounts`, `userquestionstates` collections.
- **Known Edge Cases / Fragile Spots**:
  - `syncSolvedProblems` enforces a per-platform cap of **2,000 problems** and a total cap of **5,000 problems** per request. Exceeding either returns HTTP 400.
  - **Verification logic per platform**:
    - *Codeforces*: if CF handle is linked, attempts live `codeforces.com/api/user.status` lookup; marks `CODEFORCES_API` if verified, else `UNVERIFIED`.
    - *LeetCode*: marks `LEETCODE_CHALLENGE` if account `verified=true`, else `UNVERIFIED`.
    - *CodeChef / AtCoder*: always marks `UNVERIFIED`.
  - Response now includes `verifiedCount` and `unverifiedCount` alongside `matchedCount`.
  - LC slug lookup searches both lowercased slugs and original-case externalIds to handle case mismatches.
  - LeetCode challenge verification requires user to submit specific code containing an auth token.

### 2.9 Multi-Platform Contest Upsolving
- **Purpose**: Browse contests from Codeforces, LeetCode, and CodeChef, categorized by division/type, with attached problem ratings and URLs.
- **Entry Points / Routes**:
  - `GET /api/contests`
  - `GET /api/contests/:contestId`
- **Key Functions / Classes**:
  - `controllers/contestController.js`: `listContests()`, `getContest()`
- **External Dependencies**: `mongoose` (^9.9.5)
- **Internal Modules**: `models/Contest.js`, `models/Question.js`
- **Data Read/Written**: MongoDB `contests` collection.
- **Known Edge Cases / Fragile Spots**:
  - Platform field now has `enum: ['CODEFORCES', 'LEETCODE', 'CODECHEF', 'ATCODER']` constraint on `models/Contest.js`.
  - Categories are dynamic strings (`DIV1`, `DIV2`, `EDU`, `STARTERS`, `WEEKLY`, etc.).

### 2.10 Public User Profiles & Heatmap Statistics
- **Purpose**: Displays public statistics, annual submission/solve calendar heatmaps, contributed ladders, and published blogs for any username.
- **Entry Points / Routes**:
  - `GET /api/users/:username`
  - `GET /api/users/:username/stats`
- **Key Functions / Classes**:
  - `controllers/userController.js`: `getPublicProfile()`, `getStats()`
- **External Dependencies**: `mongoose` (^9.9.5)
- **Internal Modules**: `models/User.js`, `models/UserQuestionState.js`, `models/Ladder.js`, `models/Blog.js`, `models/PlatformAccount.js`
- **Data Read/Written**: Aggregations across `users`, `userquestionstates`, `ladders`, `blogs`, and `platformaccounts`.

### 2.11 Administrative Operations
- **Purpose**: Moderation console restricted to `ADMIN` role for managing users, ladders, and question imports.
- **Entry Points / Routes**:
  - `GET /api/admin/stats`
  - `GET /api/admin/users`
  - `GET /api/admin/users/:username`
  - `PATCH /api/admin/users/:username/role`
  - `POST /api/admin/users/:username/reset-password`
  - `DELETE /api/admin/users/:username`
  - `GET /api/admin/ladders`
  - `DELETE /api/admin/ladders/:ladderId`
- **Key Functions / Classes**:
  - `controllers/adminController.js`: `listUsers()`, `getUser()`, `updateUserRole()`, `resetUserPassword()`, `deleteUser()`, `listLadders()`, `deleteLadder()`, `getAdminStats()`
  - `middleware/admin.js`: Checks `req.user.role === 'ADMIN'`.
- **External Dependencies**: `bcrypt` (^6.0.0), `mongoose` (^9.9.5)
- **Internal Modules**: All models.
- **Data Read/Written**: Cascading updates and deletions across user data. Audit log entries written to `auditlogs` collection before `deleteUser()` and `deleteLadder()` (fields: `action`, `adminId`, `adminUsername`, `targetType`, `targetId`, `details`, `ip`, `createdAt`).

### 2.12 Diagnostics & Health Check
- **Purpose**: Ping endpoint reporting server availability and MongoDB connection state.
- **Entry Points / Routes**:
  - `GET /api/health`
- **Key Functions / Classes**:
  - Inline handler in `app.js`
- **External Dependencies**: `mongoose` (^9.9.5)
- **Data Read/Written**: Inspects `mongoose.connection.readyState`.
- **Known Edge Cases / Fragile Spots**:
  - Returns HTTP **200** with `{ ok: true, service: 'codeladder-api', database: { connected: true, ... } }` when MongoDB `readyState === 1`.
  - Returns HTTP **503** with `{ ok: false, database: { connected: false } }` when disconnected.

---

## 3. Directory Structure

```text
/Users/dep/Desktop/backendcodeladder/
├── app.js                          # Express application factory: mounts global security, CORS, body parsers, rate limiters, route groups, and error handlers.
├── server.js                       # HTTP server entry point: connects to MongoDB, auto-syncs catalog, runs admin promotion, binds port, handles graceful shutdown.
├── package.json                    # Project metadata, NPM dependencies, and script aliases (start, dev, test, import).
├── package-lock.json               # Deterministic dependency lockfile.
├── .env.template                   # Environment variable template with documentation for local & Atlas URIs.
├── .env                            # Active environment configuration (PORT, MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN).
├── .gitignore                      # Git ignore rules for node_modules, env files, and OS artifacts.
├── README.md                       # High-level architecture and API specification document.
├── ARCHITECTURE.md                 # Primary architecture reference and source of truth (this document).
├── architecture.json               # Machine-readable architecture specification for automated tools.
├── revert-proxy.js                 # Helper script to clear npm and git proxy configurations.
├── setup-proxy.js                  # Helper script to route npm and git through college proxy (172.31.2.4:8080).
│
├── controllers/                    # Business logic implementations decoupled from HTTP routing.
│   ├── adminController.js          # Admin-only user management, password reset, ladder deletion, platform stats.
│   ├── authController.js           # User registration, bcrypt hashing, JWT generation, /me identity payload.
│   ├── blogController.js           # Notion/CF-style blogs, quota enforcement, snippets, voting, comments.
│   ├── contestController.js        # Multi-platform contest catalog browsing and division filtering.
│   ├── ladderController.js         # Ladder CRUD, reordering, publishing, marketplace, upvoting, collaboration.
│   ├── platformAccountController.js# Linked CP handle management, LeetCode verification, bulk solve state sync.
│   ├── progressController.js       # Global problem state (solve/unsolve 2-min freeze rule, star, list solved/starred).
│   ├── questionController.js       # Problemset query coordination, catalog delegation, tag listing, bulk admin import.
│   └── userController.js           # Public profiles, solve heatmap aggregation, activity statistics.
│
├── data/                           # Pre-packaged dataset seed files for bootstrap and offline catalog operations.
│   ├── codechef-contest.json       # Extracted CodeChef Starters and contest problem definitions.
│   ├── contest.json                # Normalized contest metadata cache.
│   ├── leetcode.json               # LeetCode contest problems and slug mappings.
│   ├── problemset.json             # Codeforces problemset dump.
│   └── questions.json              # Consolidated 22,000+ question catalog seed for in-memory catalog loading.
│
├── middleware/                     # Express request pipeline filters and guards.
│   ├── admin.js                    # Guard requiring req.user.role === 'ADMIN'.
│   ├── auth.js                     # JWT Bearer verification + tokenVersion revocation check + optionalAuth non-blocking parser.
│   ├── errorHandler.js             # Centralized JSON error serializer; omits stack traces in production.
│   ├── ladderAccess.js             # Multi-tier ladder permissions loader (public reader, member READ, member WRITE, OWNER).
│   ├── mongoSanitize.js            # Strips Mongo operator keys ($, .) from req.body and req.params (Express 5 compatible).
│   ├── notFound.js                 # 404 JSON fallback for unmatched routes.
│   ├── rateLimit.js                # Tiered IP-based rate limiters (login, register, general, progress, admin, catalog, syncSolved).
│   ├── requestId.js                # Attaches X-Request-Id UUID to every request for log traceability.
│   └── validateObjectId.js         # Validates MongoDB ObjectIds or maps catalog identifiers before hitting controllers.
│
├── models/                         # Mongoose schemas, validation rules, and collection indices.
│   ├── Blog.js                     # Blog posts with tags, embedded comments, and upvote/downvote arrays.
│   ├── Contest.js                  # Contest rounds across Codeforces, LeetCode, CodeChef with embedded problem specs.
│   ├── Ladder.js                   # Ladders with metadata, public flag, likes/dislikes, mode (NORMAL/REVISION).
│   ├── LadderMember.js             # Collaborator associations with READ/WRITE roles.
│   ├── LadderQuestion.js           # Junction collection linking Ladder to Question with explicit integer ordering.
│   ├── PlatformAccount.js          # Connected CP profiles (LeetCode, CF, CC, AtCoder) with verification state.
│   ├── Question.js                 # Core question model with platform, externalId, rating, difficulty, and tags.
│   ├── User.js                     # User account credentials, email, passwordHash, and role (USER/ADMIN).
│   ├── UserLadderQuestionPractice.js# Per-user, per-ladder problem blind practice status.
│   └── UserQuestionState.js        # Global per-user problem solve date and star flag.
│
├── routes/                         # Express route definitions mapping HTTP paths to controllers and middlewares.
│   ├── admin.js                    # /api/admin endpoints guarded by auth and admin middleware.
│   ├── auth.js                     # /api/auth registration, login, and token validation endpoints.
│   ├── blogs.js                    # /api/blogs blogging, voting, comment, and recent-actions endpoints.
│   ├── contests.js                 # /api/contests contest catalog query endpoints.
│   ├── ladders.js                  # /api/ladders personal, public, practice, and member management endpoints.
│   ├── me.js                       # /api/me personal solved and starred question shortcuts.
│   ├── platformAccounts.js         # /api/platform-accounts profile linking and solve synchronization endpoints.
│   ├── questions.js                # /api/questions problemset discovery and question state mutation endpoints.
│   └── users.js                    # /api/users public profile and heatmap endpoints.
│
├── scripts/                        # Database maintenance, synchronization, and ETL utilities.
│   ├── buildCatalog.js             # Aggregates raw JSON files from frontend/backend into normalized questions.json.
│   ├── clearDatabase.js            # Deletes all question and ladder records (destructive reset).
│   ├── exportContestsJson.js       # Exports Codeforces contests from MongoDB to static JSON files.
│   ├── importAllToMongo.js         # Bulk inserts questions and contests from data/ directory into MongoDB.
│   ├── patchControllers.js         # Code generator / patcher updating controllers with catalog bindings.
│   ├── syncCodeChefContests.js     # Scrapes and synchronizes CodeChef contest archives into Contest collection.
│   ├── syncCodeforcesContests.js   # Fetches contest and problem data from Codeforces official API into MongoDB.
│   └── syncLeetCodeContests.js     # Parses LeetCode contest ranking CSV dumps into Contest collection.
│
├── services/                       # Application-wide domain services and caching layers.
│   ├── defaultLadders.js           # In-memory definitions for Blind 75, NeetCode 150, CP-31, and CF Div 2 ladders.
│   └── questionCatalog.js          # In-memory 22k question index with tag normalizer, rating filters, and search.
│
├── tests/                          # Automated integration tests.
│   └── api.test.js                 # Supertest suite covering 72 assertions across all primary API endpoints.
│
└── utils/                          # Cross-cutting helper functions.
    ├── asyncHandler.js             # Wraps async route handlers to catch unhandled rejections into next(err).
    └── httpError.js                # Factory generating Error objects with HTTP statusCode properties.
```

---

## 4. Dependency Graph

### 4.1 External Packages (`package.json`)

| Package | Version | Category | Purpose |
|---|---|---|---|
| `express` | `^5.2.1` | Web Framework | Core HTTP routing, middleware pipeline, and JSON parsing. |
| `mongoose` | `^9.9.5` | ODM / Database Driver | Schema modeling, connection management, and MongoDB query execution. |
| `jsonwebtoken` | `^9.0.3` | Authentication | Cryptographic signing and verification of Bearer JWT session tokens. |
| `bcrypt` | `^6.0.0` | Security | Salted hashing and verification of user passwords. |
| `cors` | `^2.8.6` | Security / Middleware | Enables Cross-Origin Resource Sharing for frontend web clients. |
| `dotenv` | `^17.4.2` | Configuration | Loads environment variables from `.env` file into `process.env`. |
| `express-rate-limit` | `^8.7.0` | Reliability / Security | IP-based request throttling across global and sensitive route groups. |
| `jest` | `^29.7.0` | Testing (Dev) | Test runner and assertion library for integration test suites. |
| `supertest` | `^7.2.2` | Testing (Dev) | Programmatic HTTP client for Express endpoint testing. |
| `nodemon` | `^3.1.14` | Development (Dev) | File watcher automatically restarting server on source modifications. |

### 4.2 Internal Module Dependency Graph

```text
server.js
  ├── app.js
  │     ├── routes/auth.js ─────────────► controllers/authController.js ──► models/User.js
  │     ├── routes/questions.js ────────► controllers/questionController.js ──► services/questionCatalog.js
  │     │                                                                 └──► models/Question.js
  │     │                       ────────► controllers/progressController.js ──► models/UserQuestionState.js
  │     ├── routes/ladders.js ──────────► controllers/ladderController.js ──► models/Ladder.js
  │     │                                                                 ├──► models/LadderQuestion.js
  │     │                                                                 ├──► models/LadderMember.js
  │     │                                                                 ├──► services/defaultLadders.js
  │     │                                                                 └──► services/questionCatalog.js
  │     ├── routes/blogs.js ────────────► controllers/blogController.js ────► models/Blog.js
  │     │                                                                 └──► models/User.js
  │     ├── routes/platformAccounts.js ─► controllers/platformAccountController.js ──► models/PlatformAccount.js
  │     │                                                                          └──► models/UserQuestionState.js
  │     ├── routes/contests.js ─────────► controllers/contestController.js ──► models/Contest.js
  │     ├── routes/users.js ────────────► controllers/userController.js ───► models/User.js, UserQuestionState.js
  │     ├── routes/admin.js ────────────► controllers/adminController.js ──► All Models
  │     ├── middleware/auth.js ─────────► models/User.js
  │     ├── middleware/ladderAccess.js ─► models/Ladder.js, models/LadderMember.js
  │     ├── middleware/rateLimit.js
  │     ├── middleware/errorHandler.js
  │     └── middleware/validateObjectId.js ─► services/questionCatalog.js
  ├── services/questionCatalog.js ──────► models/Question.js, data/questions.json
  └── services/defaultLadders.js ───────► services/questionCatalog.js
```

### 4.3 Coupling & Circular Dependencies
- **Catalog vs ObjectId Validation Coupling**: `middleware/validateObjectId.js` lazily requires `services/questionCatalog.js` to resolve non-ObjectId slugs into genuine database IDs.
- **Default Ladders vs Catalog**: `services/defaultLadders.js` calls `questionCatalog.getPaginatedQuestions()` to hydrate default ladder problem templates into full question objects.
- **No Circular Imports**: The codebase follows strict hierarchical layering (`Routes -> Controllers/Middleware -> Services/Models -> Database`).

---

## 5. Data & Infrastructure Layer

### 5.1 Databases & Data Stores
- **Primary Datastore**: **MongoDB** (Local `mongodb://127.0.0.1:27017/codeladder` or MongoDB Atlas replica set).
- **Collections**:
  - `users`: User identity, credential hashes, roles (`USER`, `ADMIN`), `tokenVersion: Number (default: 0)` for JWT revocation, `loginAttempts: Number` and `lockUntil: Date` for brute-force lockout.
  - `questions`: 22k+ question records with platform, rating, tags, difficulty, externalId.
  - `userquestionstates`: Per-user problem solve timestamps (`firstSolvedAt`, `solvedAt`), star bookmarks, `verified: Boolean`, `verificationMethod: enum`.
  - `ladders`: Practice ladder definitions, public status, owner reference, vote counters.
  - `ladderquestions`: Ordered association between a ladder and its questions.
  - `laddermembers`: Team collaboration access permissions (`READ`, `WRITE`).
  - `userladderquestionpractices`: User blind practice status flags within specific ladders.
  - `blogs`: Community blog posts, tags, markdown content, upvotes, views, comments.
  - `platformaccounts`: Connected LeetCode, Codeforces, CodeChef, and AtCoder handles with verification tokens.
  - `contests`: Historical contest records for Codeforces, LeetCode, and CodeChef. Platform field now has enum constraint.
  - `auditlogs` *(new)*: Admin action audit trail. Written before destructive admin operations (`deleteUser`, `deleteLadder`).
- **In-Memory Cache Layer**:
  - `services/questionCatalog.js`: In-memory index of all 22k+ problems indexed by `_id`, `platform:externalId`, and normalized tags. Bootstrapped from `data/questions.json` and synced from MongoDB at startup.

### 5.2 Environment Variables

| Variable Name | Required | Default / Example | Purpose |
|---|---|---|---|
| `PORT` | Optional | `5000` (or `3000`) | Network port on which the Express HTTP server listens. |
| `MONGODB_URI` | **Required** | `mongodb://127.0.0.1:27017/codeladder` | Connection string for MongoDB database instance. |
| `JWT_SECRET` | **Required** | `[random-secure-string]` | Symmetric secret key used to sign and verify JWT session tokens. |
| `JWT_EXPIRES_IN` | Optional | `7d` | Lifetime expiration string for signed JWT tokens. |
| `NODE_ENV` | Optional | `development` / `test` / `production` | Execution environment flag; disables rate limiting and silences logs in `test`. Rate limiting is ACTIVE when this var is unset (production-safe). |
| `ALLOWED_ORIGINS` | Optional (⚠️ set in prod) | — | Comma-separated CORS origin whitelist (e.g. `https://codeladder.in`). Empty = allow all (dev only). |
| `MAX_LOGIN_ATTEMPTS` | Optional | `10` | Failed login attempts before account lockout. |
| `LOCK_DURATION_MINUTES` | Optional | `15` | Minutes an account stays locked after hitting MAX_LOGIN_ATTEMPTS. |
| `ADMIN_SEED_USERNAME` | Optional | — | Username for the one-time admin seed script (`npm run seed:admin`). |
| `ADMIN_SEED_EMAIL` | Optional | — | Email for the admin seed user. |
| `ADMIN_SEED_PASSWORD` | Optional | — | Password for the admin seed user (min 8 chars). |
| `CAMPUS_PROXY_URL` | Optional | `http://172.31.2.4:8080` | HTTP proxy URL used by `setup-proxy.js` for campus network environments. |

### 5.3 Background Jobs & Long-Running Tasks
- **Catalog Database Synchronization**: Run synchronously once during `server.js` startup via `questionCatalog.syncFromDatabase()`.
- **ETL Sync Scripts** (`scripts/*.js`): Manual CLI tasks run on demand to scrape contest and problem archives from Codeforces, CodeChef, and LeetCode.

---

## 6. Request & Data Flow Traces

### Flow 1: User Authentication (JWT-Only)
1. **Client Request**: `GET /api/me/questions/solved` sent with header `Authorization: Bearer <jwt>`. No `X-Username` required.
2. **Global Limiter**: Intercepted by `generalLimiter` in `app.js` (passed if below 500 requests / 15 min).
3. **Route Matching**: Routed to `meRoutes` in `routes/me.js`.
4. **Auth Middleware**: `middleware/auth.js`:
   - Extracts Bearer token from `Authorization` header.
   - Verifies JWT signature using `process.env.JWT_SECRET`.
   - Decodes `{ id, username, role, tokenVersion }` from payload.
   - Queries `User.findById(id)` to verify account existence.
   - Checks `payload.tokenVersion === user.tokenVersion` — returns 401 if mismatch (revoked token).
   - Injects `req.user = { id: user._id, username: user.username, role: user.role }`.
5. **Controller Execution**: `controllers/progressController.js` `listSolved()`:
   - Queries `UserQuestionState.find({ userId: req.user.id, solved: true })`.
   - Resolves full question metadata from `questionCatalog` in-memory map.
   - Returns `{ questions: [...] }`.

### Flow 2: Problemset Search & In-Memory Pagination
1. **Client Request**: `GET /api/questions?platform=CODEFORCES&tag=dp&minRating=1200&maxRating=1600&page=1&limit=25`.
2. **Catalog Rate Limiter**: Checked by `catalogLimiter` in `app.js`.
3. **Route Dispatch**: `routes/questions.js` dispatches to `listQuestions()` in `controllers/questionController.js`.
4. **Catalog Query**: Calls `questionCatalog.getPaginatedQuestions(filters, page, limit)`:
   - Filters memory array by platform and rating range.
   - Normalizes and checks tag aliases (`dynamic programming` -> `dp`).
   - Slices array for pagination: `(page - 1) * limit` to `page * limit`.
5. **Response**: Emits `{ questions, pagination: { page, limit, total, totalPages } }` in < 2ms without touching MongoDB.

### Flow 3: Platform Solve State Synchronization
1. **Client Request**: `POST /api/platform-accounts/sync-solved` with body `{ leetcode: ["two-sum"], codeforces: ["1234A"], codechef: [...], atcoder: [...] }`.
2. **Auth Verification**: Validated by `auth` middleware; attaches authenticated `req.user`.
3. **Controller Execution**: `controllers/platformAccountController.js` `syncSolvedProblems()`:
   - Validates per-platform cap (≤ 2,000) and total cap (≤ 5,000). Returns 400 if exceeded.
   - Codeforces: attempts live `codeforces.com/api/user.status` verification if handle linked.
   - LeetCode: marks `LEETCODE_CHALLENGE` if verified account, else `UNVERIFIED`.
   - CodeChef/AtCoder: always `UNVERIFIED`.
   - Queries `Question.find({ platform, externalId: { $in: [...] } })` for each platform (MongoDB, not catalog).
   - Bulk upserts `UserQuestionState` with `verified`, `verificationMethod`, `solved: true`, `solvedAt`.
4. **Response**: Returns `{ success: true, matchedCount, verifiedCount, unverifiedCount, message }`.

---

## 7. Build, Run, and Test Commands

### 7.1 Setup & Installation
```bash
# Navigate to backend directory
cd /Users/dep/Desktop/backendcodeladder

# Install npm dependencies
npm install
```

### 7.2 Running Development & Production Servers
```bash
# Run in development mode with nodemon (auto-reload on save)
npm run dev

# Run in standard production mode
npm start

# Explicit server launch
node server.js
```

### 7.3 Automated Testing
```bash
# Run integration test suite with Jest (runs in-band with rate limiting skipped)
npm test

# Run a specific test suite or test pattern
npx jest tests/api.test.js -t "Health"
```

### 7.4 Data Seed & ETL Scripts
```bash
# Rebuild in-memory catalog data/questions.json from raw source files
node scripts/buildCatalog.js

# Bulk import all questions and contests from data/*.json into MongoDB
npm run import
# (or: node scripts/importAllToMongo.js)

# Sync latest Codeforces contests & problems from official API
node scripts/syncCodeforcesContests.js

# Sync CodeChef contests
node scripts/syncCodeChefContests.js

# Sync LeetCode contests
node scripts/syncLeetCodeContests.js

# Export Codeforces contests from MongoDB to static JSON
node scripts/exportContestsJson.js
```

### 7.5 Network Proxy Tools (Campus vs Personal)
```bash
# Route npm and git through campus proxy (172.31.2.4:8080)
node setup-proxy.js

# Revert npm and git back to direct personal connection
node revert-proxy.js
```

---

## 8. Changelog

### Remediation Pass — 2026-09-16

#### Critical Fixes
- **1.1 Admin backdoor removed**: Deleted `User.updateMany` auto-promotion in `server.js`; removed username-based `effectiveRole` override from `middleware/auth.js` and `controllers/authController.js`. Admin seeding now only via `npm run seed:admin` (`scripts/seedAdmin.js`).
- **1.2 X-Username requirement removed**: `auth()` and `optionalAuth()` rewritten. Only `Authorization: Bearer <jwt>` is required.
- **1.3 JWT revocation (tokenVersion)**: Added `tokenVersion` to `models/User.js`. `signToken()` embeds it; `auth()` checks it. `POST /api/auth/logout-all` invalidates all prior tokens. `JWT_EXPIRES_IN` reduced to `1d`.
- **1.4 Unverified solve tracking**: `UserQuestionState` gains `verified` and `verificationMethod` fields. `syncSolvedProblems` performs live CF API verification; response includes `verifiedCount`/`unverifiedCount`.

#### High Priority Fixes
- **2.1 Retired manual solve**: `solve()` and `unsolve()` now return HTTP 501.
- **2.3 Health check**: Returns 200 with database state when connected; 503 when disconnected.
- **2.5 Blog XSS sanitization**: `sanitizeInput()` applied to blog title, content (create/update), and comment content. 500-comment cap enforced.

#### Medium Priority Fixes
- **3.3 Sync payload caps**: Per-platform cap of 2,000; total cap of 5,000.
- **3.4 Ladder ownership transfer**: `transferOwnership()` added to `ladderController.js`; route `POST /:ladderId/transfer-ownership` added.

#### Low Priority Fixes
- **4.x Proxy URL**: `setup-proxy.js` reads `CAMPUS_PROXY_URL` env var with hardcoded fallback.
- **4.x Audit log**: `models/AuditLog.js` created; admin `deleteUser`/`deleteLadder` write audit entries.
- **4.x Contest platform enum**: `models/Contest.js` platform field restricted to `['CODEFORCES', 'LEETCODE', 'CODECHEF', 'ATCODER']`.

#### Bug Fixes (discovered during test remediation)
- **Blog sanitizer not called**: `sanitizeInput()` was defined but never invoked in `createBlog`, `updateBlog`, or `addComment`.
- **LC sync case mismatch**: Lowercase normalization of LC slugs prevented matching uppercase externalIds in DB. Fixed by including original-case IDs in the `$in` query.
- **Test nesting**: Transfer-ownership and blog XSS tests were accidentally nested inside an existing test. Fixed by restructuring the test file.

#### Test Suite (75/75 passing)
- New tests: logout-all revocation, deepanshu auto-elevate regression, sync-solved verification, Bearer-only auth, transfer-ownership, blog XSS sanitization.

- Extended browser extension (`leetcode_history_importer_v3`) to intercept CodeChef submissions (`/api/ide/submit`, `/api/ide/status/`) and scrape verified profile history (supporting both contest problem titles and practice problem streams).
- Added `POST /api/platform-accounts/codechef/submission` for real-time live solve tracking.
- Added `POST /api/platform-accounts/codechef/sync` for verified bulk history import with automatic title-to-code catalog resolution and auto-upserting missing questions.
- Added `CODECHEF_EXTENSION` to `UserQuestionState.verificationMethod` enum.
- Automated tests passing (77/77).

### Security Hardening Pass — 2026-09-16

#### S1 — CORS Hardening
- `cors()` replaced with origin whitelist. Set `ALLOWED_ORIGINS` env var. Empty = allow all (dev only).

#### S2 + S9 — Helmet (HTTP Security Headers)
- `helmet()` added to `app.js`. Sets HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. Removes `X-Powered-By`.

#### S3 — Account Lockout
- `loginAttempts` and `lockUntil` fields added to `models/User.js`.
- Login returns HTTP 429 + `Retry-After` header after `MAX_LOGIN_ATTEMPTS` (default 10) failures for `LOCK_DURATION_MINUTES` (default 15 min).
- Lockout state clears on successful login.

#### S4 — Scoped Body Size Limits
- Default JSON body limit reduced from `10mb` to `100kb` for all routes.
- `/api/platform-accounts/sync-solved` retains `10mb` limit via route-specific parser.

#### S5 — Sync-Solved Rate Limiter
- `syncSolvedLimiter` added: 5 requests / 10 minutes / IP.
- Applied to `/api/platform-accounts/sync-solved` before the platform-accounts router.

#### S6 — Safe Error Logging
- `middleware/errorHandler.js`: full stack trace only in non-production. In production, logs message + timestamp only.
- Includes `req.requestId` in log prefix.

#### S7 — JWT_SECRET Entropy Check
- `server.js` startup now enforces `JWT_SECRET.length >= 32`. Prints a `crypto.randomBytes` generation command if too short.

#### S8 — MongoDB Injection Guard
- `middleware/mongoSanitize.js` (NEW, custom): strips keys starting with `$` or containing `.` from `req.body` and `req.params`.
- Custom implementation required because `express-mongo-sanitize` is incompatible with Express 5 (`req.query` is read-only in Express 5).

#### S10 — Stronger Password Validation
- New password regex: `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/`
- Applies to new registrations only. Existing password hashes unaffected.
- Timing-safe login: dummy bcrypt compare performed when username doesn't exist to prevent enumeration.

#### S11 — HTTP Parameter Pollution Guard
- `hpp()` middleware added. Deduplicates repeated query params (`?role=ADMIN&role=USER` → last value wins).

#### S12 — Health Endpoint Infrastructure Redaction
- In `NODE_ENV=production`: DB host, port, name are omitted from `/api/health` response.

#### S13 — Request ID Middleware
- `middleware/requestId.js` (NEW): attaches UUID to `req.requestId` and echoes in `X-Request-Id` response header.
- Propagated through error logs for request-level traceability.

#### S14 — Rate Limiter Production Safety
- Removed `isDev` skip from `generalLimiter` and `adminLimiter`.
- Rate limiting is now active in ALL environments except `NODE_ENV=test`.
- Added `syncSolvedLimiter` and exported it.

#### New Files
- `middleware/requestId.js`
- `middleware/mongoSanitize.js`

#### New npm Packages
- `helmet` — HTTP security headers
- `hpp` — HTTP parameter pollution guard
