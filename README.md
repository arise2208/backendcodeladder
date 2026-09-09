# CodeLadder Backend

Backend API for **CodeLadder**, a coding-practice platform for
organizing programming problems into personal and collaborative ladders,
tracking global question progress, starring questions, practising
questions inside ladders, and revising previously solved problems.

The backend is built with **Node.js, Express, MongoDB, and Mongoose**
and exposes a REST API under `/api`.

------------------------------------------------------------------------

## Features

-   JWT-based authentication with `X-Username` validation
-   User registration and login
-   User roles: `USER` and `ADMIN` with route and data guarding
-   Global question catalog across 4 major platforms:
    -   LeetCode
    -   Codeforces
    -   CodeChef
    -   AtCoder
-   Per-user question state:
    -   solved
    -   first solved timestamp
    -   latest solved timestamp
    -   starred
-   **Universal Two-Minute Freeze Rule**:
    -   Question unsolve window locked after 2 minutes
    -   Ladder upvote/downvote locked after 2 minutes
    -   Blog upvote/downvote locked after 2 minutes
    -   Comment upvote/downvote locked after 2 minutes
-   Personal and collaborative ladders
-   Ladder quotas:
    -   Up to 10 ladders created per regular user
    -   Up to 10 publicly listed community ladders
-   **Community Ladders**:
    -   Publicly discoverable ladder showcase with curator claims/descriptions
    -   Community Upvoting & Downvoting (`score = upvotes - downvotes`)
    -   Non-reversibility (public ladders cannot be changed back to private; can only be deleted)
-   **Codeforces-Style Community Blogging Platform**:
    -   Notion-like rich markdown editor & reader
    -   LaTeX / KaTeX math formulas ($O(N \log N)$ and $$\sum$$)
    -   Preformatted code blocks with copy action
    -   Callout boxes (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`)
    -   Auto-generated Table of Contents with jump anchors
    -   Strict 5-blog quota per user enforced at the backend
    -   Maximum 50,000 characters per blog
    -   Live Codeforces-style **Recent Actions** stream (`author → blog title / comment`)
    -   Nested discussion thread with comment upvoting/downvoting
-   Ladder collaboration roles:
    -   owner
    -   `READ`
    -   `WRITE`
-   Ladder question ordering and reordering
-   Ladder-specific practice tracking
-   Persistent ladder revision mode
-   Revision candidates based on globally solved but not ladder-practised questions
-   Connected competitive-programming platform accounts (LeetCode, Codeforces, CodeChef, AtCoder)
-   Public user profiles showcasing:
    -   Activity streak and calendar heatmap data
    -   Connected platform accounts
    -   Community ladders curated
    -   Published blogs & editorials
    -   Grand total upvotes received
-   Admin management (users, ladders, questions)
-   API-wide and endpoint-specific rate limiting
-   Centralized error handling with standardized JSON responses
-   MongoDB transactions for multi-document operations
-   Comprehensive integration test suite (72/72 tests passing)

------------------------------------------------------------------------

## Architecture

CodeLadder separates **global question state** from **ladder-specific
state**.

### Global question state

A question exists once in the global `Question` collection.

A user's progress is stored separately in `UserQuestionState`.

This means:

``` text
Question
    |
    +---- UserQuestionState (User A)
    |
    +---- UserQuestionState (User B)
    |
    +---- UserQuestionState (User C)
```

A question being solved is therefore a property of a **user-question
relationship**, not a property of the question itself.

### Ladder state

A ladder is a collection of global questions.

``` text
Ladder
  |
  +-- LadderQuestion
  |      |
  |      +-- Question
  |      +-- order
  |
  +-- LadderMember
  |
  +-- UserLadderQuestionPractice
```

This keeps ladder organization independent from global solving history.

------------------------------------------------------------------------

## Data Model

The main MongoDB collections are:

### `User`

Stores application users.

Important fields:

-   `username`
-   `email`
-   `passwordHash`
-   `role`

Roles:

``` text
USER
ADMIN
```

Passwords are stored as bcrypt hashes, never as plaintext.

------------------------------------------------------------------------

### `Question`

Global coding-question catalog.

Important fields:

-   `platform`
-   `externalId`
-   `title`
-   `url`
-   `tags`
-   `difficulty`
-   `metadata`

Supported platforms:

``` text
LEETCODE
CODEFORCES
CODECHEF
ATCODER
```

Questions are uniquely identified by:

``` text
(platform, externalId)
```

This prevents the same external question from being inserted twice for a
platform.

------------------------------------------------------------------------

### `UserQuestionState`

Stores a user's state for a global question.

Important fields:

-   `userId`
-   `questionId`
-   `solved`
-   `firstSolvedAt`
-   `solvedAt`
-   `starred`

The pair:

``` text
(userId, questionId)
```

is unique.

### Solve semantics

On the first solve:

``` text
firstSolvedAt = now
solvedAt      = now
solved        = true
```

If the user solves the question again later:

``` text
firstSolvedAt = unchanged
solvedAt      = updated
solved        = true
```

`firstSolvedAt` therefore represents the user's first-ever recorded
solve.

### Unsolve semantics

A solved question can only be unsolved within **two minutes of the
current `solvedAt`**.

Unsolving does not erase `firstSolvedAt`.

------------------------------------------------------------------------

### `Ladder`

Represents a coding ladder.

Important fields:

-   `title`
-   `ownerId`
-   `mode` (`NORMAL` | `REVISION`)
-   `revisionStartedAt`
-   `isPublic` (boolean - whether listed in Community Ladders)
-   `publishedAt` (Date - when published to the community)
-   `description` (string - creator's pitch / purpose of this ladder)
-   `likes` (array of user ObjectIds who upvoted)
-   `dislikes` (array of user ObjectIds who downvoted)
-   `votes` (array of `{ userId, vote, votedAt }` tracking 2-minute freeze timestamp)

Modes:

``` text
NORMAL
REVISION
```

Revision mode is persistent on the ladder.

Quotas & Rules:
- A user can create at most **10 ladders**.
- A user can list at most **10 public ladders** in Community Ladders.
- Once a ladder is marked public, it **cannot be reverted to private** (it can only be permanently deleted by its owner or an admin).

------------------------------------------------------------------------

### `LadderQuestion`

Connects a ladder with global questions.

Important fields:

-   `ladderId`
-   `questionId`
-   `order`

The pair:

``` text
(ladderId, questionId)
```

is unique.

------------------------------------------------------------------------

### `LadderMember`

Controls collaboration on a ladder.

Roles:

``` text
READ
WRITE
```

The ladder owner has full control.

`READ` members can access the ladder but cannot modify it.

`WRITE` members can modify ladder content.

------------------------------------------------------------------------

### `UserLadderQuestionPractice`

Tracks whether a user has practised a particular question inside a
particular ladder.

Unique relationship:

``` text
(userId, ladderId, questionId)
```

This is intentionally separate from global solving.

A user can therefore:

``` text
solve a question globally
        ↓
add it to a ladder
        ↓
practise it in that ladder
```

without changing their global solved history.

------------------------------------------------------------------------

### `PlatformAccount`

Stores a user's external competitive-programming account.

Important fields:

-   `userId`
-   `platform`
-   `handle`
-   `verified`
-   `lastSyncedAt`

Supported platforms:

``` text
CODEFORCES
LEETCODE
CODECHEF
ATCODER
```

One account per user/platform is allowed.

> Platform account storage is currently implemented. Automatic external
> submission synchronization is not part of this backend version yet.

------------------------------------------------------------------------

### `Blog`

Represents a Codeforces-style community blog, editorial, or algorithm tutorial.

Important fields:

-   `title` (string, max 200 characters)
-   `content` (string, max 50,000 characters)
-   `summary` (string, auto-generated excerpt)
-   `tags` (array of strings, max 10 normalized lowercase tags)
-   `authorId` (User ObjectId reference)
-   `authorUsername` (string)
-   `viewsCount` (number, automatically incremented upon view)
-   `commentsCount` (number, automatically synchronized counter)
-   `upvotes` (array of user ObjectIds who upvoted)
-   `downvotes` (array of user ObjectIds who downvoted)
-   `votes` (array of `{ userId, vote, votedAt }` tracking 2-minute freeze timestamp)
-   `comments` (array of comment subdocuments):
    -   `_id`
    -   `authorId`
    -   `authorUsername`
    -   `content` (string)
    -   `createdAt`
    -   `upvotes` (array of user ObjectIds)
    -   `downvotes` (array of user ObjectIds)
    -   `votes` (array of `{ userId, vote, votedAt }`)

Quotas & Rules:
- A user can publish at most **5 active blogs**. This limit is strictly enforced in the backend.
- Maximum content size is **50,000 characters** (~10,000 words).
- Universal **2-minute vote freeze** protects against vote manipulation on both blogs and individual comments.
- Deleting a blog removes all its comments, votes, and activity references, freeing up 1 slot in the user's quota.

------------------------------------------------------------------------

# API

Base URL:

``` text
http://localhost:3000/api
```

For production, replace the host with the deployed API URL.

------------------------------------------------------------------------

## Authentication

Protected endpoints require both:

``` http
Authorization: Bearer <JWT>
X-Username: <username>
```

The username supplied in `X-Username` must match the username
represented by the JWT.

------------------------------------------------------------------------

# Public Endpoints

## Health

### `GET /api/health`

Checks whether the API is running.

Example:

``` bash
curl http://localhost:3000/api/health
```

Response:

``` json
{
  "ok": true,
  "service": "codeladder-api"
}
```

------------------------------------------------------------------------

# Authentication Endpoints

## Register

### `POST /api/auth/register`

Creates a new user.

Example:

``` json
{
  "username": "deepanshu",
  "email": "deepanshu@example.com",
  "password": "strongpassword123"
}
```

Username requirements:

-   3--30 characters
-   letters, numbers, and `_`

Password requirement:

-   minimum 8 characters

------------------------------------------------------------------------

## Login

### `POST /api/auth/login`

Authenticates a user and returns a JWT.

Example:

``` json
{
  "username": "deepanshu",
  "password": "strongpassword123"
}
```

Store the returned token on the frontend and send it with protected
requests.

------------------------------------------------------------------------

## Current User

### `GET /api/auth/me`

**Authentication required.**

Returns the authenticated user's basic information.

------------------------------------------------------------------------

# Questions

## List Questions

### `GET /api/questions`

Public endpoint for retrieving questions.

The endpoint supports question listing, filtering, and pagination.

Typical query parameters can include the supported question filters and
pagination parameters implemented by the controller.

Example:

``` bash
curl "http://localhost:3000/api/questions?page=1&limit=20"
```

------------------------------------------------------------------------

## Get Question

### `GET /api/questions/:questionId`

Returns a single question.

Example:

``` bash
curl http://localhost:3000/api/questions/<questionId>
```

------------------------------------------------------------------------

## Create Question

### `POST /api/questions`

**Authentication required. ADMIN only.**

Creates a global question.

Example:

``` json
{
  "platform": "LEETCODE",
  "externalId": "1",
  "title": "Two Sum",
  "url": "https://leetcode.com/problems/two-sum/",
  "tags": ["array", "hash-table"],
  "difficulty": "EASY"
}
```

------------------------------------------------------------------------

## Update Question

### `PUT /api/questions/:questionId`

**Authentication required. ADMIN only.**

Updates a question.

------------------------------------------------------------------------

## Delete Question

### `DELETE /api/questions/:questionId`

**Authentication required. ADMIN only.**

Deletes a global question and cleans up related application state.

------------------------------------------------------------------------

# Question Progress

These endpoints operate on the authenticated user's state.

## Get Question State

### `GET /api/questions/:questionId/state`

**Authentication required.**

Returns the current user's state for the question.

------------------------------------------------------------------------

## Solve

### `POST /api/questions/:questionId/solve`

**Authentication required.**

Marks the question as solved.

The first solve creates:

``` text
firstSolvedAt
solvedAt
```

Subsequent solves update only:

``` text
solvedAt
```

------------------------------------------------------------------------

## Unsolve

### `POST /api/questions/:questionId/unsolve`

**Authentication required.**

Removes the current solved state.

The operation is only allowed within the two-minute unsolve window.

------------------------------------------------------------------------

## Star

### `PUT /api/questions/:questionId/star`

**Authentication required.**

Sets the question's starred state.

Request:

``` json
{
  "starred": true
}
```

------------------------------------------------------------------------

## Remove Star

### `DELETE /api/questions/:questionId/star`

**Authentication required.**

Removes the star from the question.

------------------------------------------------------------------------

# Personal Question Lists

## Solved Questions

### `GET /api/me/questions/solved`

**Authentication required.**

Returns questions currently marked as solved by the authenticated user.

------------------------------------------------------------------------

## Starred Questions

### `GET /api/me/questions/starred`

**Authentication required.**

Returns questions currently starred by the authenticated user.

------------------------------------------------------------------------

# Public User Profiles

## User Profile

### `GET /api/users/:username`

**Publicly accessible.**

Returns the comprehensive public profile of a user, aggregating their global solved history, activity heatmap data, connected platform accounts, curated community ladders, and published blogs.

Response includes:

``` json
{
  "user": {
    "_id": "6aa0b51a7b01de978a15eaaf",
    "username": "deepanshu",
    "role": "ADMIN",
    "createdAt": "2026-09-09T01:23:38.327Z",
    "platformAccounts": {
      "leetcode": "arise22",
      "codechef": "esira",
      "atcoder": "arise2208",
      "codeforces": "arise"
    },
    "accounts": [ ... ]
  },
  "stats": {
    "solved": 5,
    "starred": 1,
    "publicLaddersCount": 1,
    "blogsCount": 5,
    "ladderUpvotesReceived": 2,
    "blogUpvotesReceived": 28,
    "totalLikesReceived": 30,
    "totalUpvotesReceived": 30
  },
  "contributedLadders": [
    {
      "_id": "6aa0b60e7b01de978a15eab0",
      "title": "DP Mastery",
      "description": "Comprehensive Dynamic Programming collection...",
      "questionCount": 12,
      "upvotesCount": 15,
      "downvotesCount": 1,
      "score": 14,
      "publishedAt": "2026-09-09T22:54:19.564Z"
    }
  ],
  "blogs": [
    {
      "_id": "6aa1edc072b0c275a36127a6",
      "title": "Mastering DP on Trees",
      "summary": "Step-by-step tutorial on tree DP...",
      "tags": ["editorial", "dynamic-programming"],
      "viewsCount": 142,
      "commentsCount": 12,
      "upvotesCount": 28,
      "downvotesCount": 2,
      "score": 26,
      "createdAt": "2026-09-09T23:37:36.886Z"
    }
  ],
  "solvedQuestions": [
    {
      "_id": "6aa1b242a14e6eeb78f70568",
      "platform": "CODEFORCES",
      "externalId": "4A",
      "title": "Watermelon",
      "url": "https://codeforces.com/problemset/problem/4/A",
      "difficulty": "EASY",
      "tags": ["brute force", "math"],
      "state": {
        "solved": true,
        "solvedAt": "2026-09-09T23:02:10.586Z",
        "firstSolvedAt": "2026-09-09T19:29:39.399Z",
        "starred": true
      }
    }
  ]
}
```

------------------------------------------------------------------------

## User Statistics

### `GET /api/users/:username/stats`

**Publicly accessible.**

Returns condensed public statistics for quick preview cards:

``` json
{
  "username": "deepanshu",
  "stats": {
    "solved": 5,
    "starred": 1,
    "practised": 3,
    "publicLaddersCount": 1,
    "totalLikesReceived": 30,
    "totalUpvotesReceived": 30
  }
}
```

------------------------------------------------------------------------

# Ladders

All ladder endpoints require authentication.

## List Ladders

### `GET /api/ladders`

Returns ladders available to the authenticated user according to the
ladder access rules.

------------------------------------------------------------------------

## Create Ladder

### `POST /api/ladders`

Creates a ladder owned by the authenticated user.

Example:

``` json
{
  "title": "My DSA Ladder"
}
```

------------------------------------------------------------------------

## Get Ladder

### `GET /api/ladders/:ladderId`

Returns ladder details and its questions.

------------------------------------------------------------------------

## Update Ladder

### `PUT /api/ladders/:ladderId`

Updates ladder information.

Write permission is required.

------------------------------------------------------------------------

## Delete Ladder

### `DELETE /api/ladders/:ladderId`

Deletes the ladder and its associated ladder-specific data.

The operation is restricted to the ladder owner.

------------------------------------------------------------------------

# Ladder Questions

## Add Question

### `POST /api/ladders/:ladderId/questions`

Adds a global question to a ladder.

The question receives the next ladder order.

Write permission is required.

------------------------------------------------------------------------

## Reorder Questions

### `PUT /api/ladders/:ladderId/questions/reorder`

Reorders all questions in a ladder.

The submitted ordering must contain unique question IDs and unique order
values.

Write permission is required.

------------------------------------------------------------------------

## Remove Question

### `DELETE /api/ladders/:ladderId/questions/:questionId`

Removes a question from a ladder.

This does not delete the global question.

Write permission is required.

------------------------------------------------------------------------

# Ladder Practice

Practice state is specific to a ladder.

## Get Practice State

### `GET /api/ladders/:ladderId/practice`

Returns practice information for the authenticated user.

------------------------------------------------------------------------

## Mark Practised

### `POST /api/ladders/:ladderId/questions/:questionId/practise`

Marks a ladder question as practised by the current user.

------------------------------------------------------------------------

## Unpractise

### `DELETE /api/ladders/:ladderId/questions/:questionId/practise`

Removes the current user's practice state for the ladder question.

------------------------------------------------------------------------

# Revision Mode

Revision is a ladder-level mode.

## Change Mode

### `PUT /api/ladders/:ladderId/mode`

Changes the ladder mode.

Supported modes:

``` text
NORMAL
REVISION
```

Example:

``` json
{
  "mode": "REVISION"
}
```

Only the ladder owner can change the mode.

------------------------------------------------------------------------

## Get Revision Questions

### `GET /api/ladders/:ladderId/revision`

Returns revision candidates.

The revision set is based on:

``` text
Globally solved by the user
        AND
Not practised in this ladder
```

Revision mode does **not** globally unsolve questions.

------------------------------------------------------------------------

# Ladder Collaboration

## List Members

### `GET /api/ladders/:ladderId/members`

Returns the members of a ladder.

------------------------------------------------------------------------

## Add Member

### `POST /api/ladders/:ladderId/members`

Adds a user to a ladder.

Example:

``` json
{
  "username": "alice",
  "role": "READ"
}
```

Supported roles:

``` text
READ
WRITE
```

------------------------------------------------------------------------

## Update Member

### `PUT /api/ladders/:ladderId/members/:username`

Changes a member's role.

Example:

``` json
{
  "role": "WRITE"
}
```

------------------------------------------------------------------------

## Remove Member

### `DELETE /api/ladders/:ladderId/members/:username`

Removes a member from a ladder.

Member management is restricted to the ladder owner.

------------------------------------------------------------------------

# Community Ladders & Voting

Community Ladders is a public discovery showcase where users share curated problem collections and tutorials with the community.

## List Community Ladders

### `GET /api/ladders/marketplace`

**Publicly accessible (Optionally authenticated to include current user's vote state).**

Returns all publicly published community ladders ordered by publish date descending.

Response includes:
- `_id`: Ladder ID
- `title`: Ladder title
- `description`: Creator's claims/pitch for this ladder
- `ownerId`: Creator's user object (`_id`, `username`, `role`)
- `questionCount`: Total problems in this ladder
- `upvotesCount`: Total upvotes received
- `downvotesCount`: Total downvotes received
- `score`: Net score (`upvotesCount - downvotesCount`)
- `userVote`: `'UPVOTE'` | `'DOWNVOTE'` | `null` (if authenticated)
- `publishedAt`: Publication timestamp

------------------------------------------------------------------------

## Publish Ladder to Community Ladders

### `POST /api/ladders/:ladderId/publish`

**Authentication required (Owner only).**

Publishes a private ladder to the Community Ladders board.

**Quotas & Constraints:**
- Must have at least 1 problem added (`questionCount > 0`).
- User can have at most **10 publicly listed ladders**.
- Requires a non-empty `description` stating what the curator claims for this ladder.
- **Irreversible**: Once published, a ladder cannot be reverted back to private mode (it can only be permanently deleted by the owner).

Request body:

``` json
{
  "description": "Comprehensive Dynamic Programming collection from 1200 to 2100 rating on Codeforces."
}
```

Response:

``` json
{
  "ladder": {
    "_id": "6aa0b60e7b01de978a15eab0",
    "title": "DP Mastery",
    "isPublic": true,
    "publishedAt": "2026-09-09T22:54:19.564Z",
    "description": "Comprehensive Dynamic Programming collection..."
  },
  "message": "Ladder published to Community Ladders!"
}
```

------------------------------------------------------------------------

## Upvote / Downvote Ladder

### `POST /api/ladders/:ladderId/vote`

**Authentication required.**

Casts an upvote or downvote on a community ladder, or toggles an existing vote off.

Request body:

``` json
{
  "vote": "UPVOTE"
}
```

Supported values:
- `"UPVOTE"` (or legacy `"LIKE"`)
- `"DOWNVOTE"` (or legacy `"DISLIKE"`)

**Universal 2-Minute Freeze Rule:**
- Users can switch or remove their vote freely within **120 seconds (2 minutes)** of their initial vote timestamp.
- Once 2 minutes have elapsed, attempting to change or remove the vote throws `HTTP 403 Forbidden`: `"Vote is locked and cannot be changed after 2 minutes"`.

Response:

``` json
{
  "ladderId": "6aa0b60e7b01de978a15eab0",
  "upvotesCount": 15,
  "downvotesCount": 1,
  "score": 14,
  "userVote": "UPVOTE"
}
```

------------------------------------------------------------------------

# Community Blogs & Editorials Platform

CodeLadder includes a Codeforces-inspired community blogging platform equipped with a Notion-style markdown engine, LaTeX math formulas ($O(N)$ and $$\sum$$), syntax-highlighted code blocks, callout boxes, Table of Contents, and comment threads.

## List Blogs

### `GET /api/blogs`

**Publicly accessible (Optionally authenticated).**

Query parameters:
- `sort`: `'trending'` (default, orders by upvotes and recency) | `'recent'` (orders by publish date)
- `tag`: Filter by specific tag (case-insensitive, e.g., `dynamic-programming`, `editorial`)
- `search`: Search query matching against title, content, author, or tags
- `author`: Filter blogs authored by a specific username (used for My Blogs and profile feeds)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 15, max: 50)

Response:

``` json
{
  "blogs": [
    {
      "_id": "6aa1edc072b0c275a36127a6",
      "title": "Mastering DP on Trees & Rerooting Technique",
      "summary": "Step-by-step tutorial on tree DP with recurrences and C++ templates...",
      "tags": ["editorial", "dynamic-programming", "trees"],
      "authorId": "6aa0b51a7b01de978a15eaaf",
      "authorUsername": "deepanshu",
      "viewsCount": 142,
      "commentsCount": 12,
      "upvotesCount": 28,
      "downvotesCount": 2,
      "score": 26,
      "userVote": "UPVOTE",
      "createdAt": "2026-09-09T23:37:36.886Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 15,
  "totalPages": 1
}
```

------------------------------------------------------------------------

## Live Recent Actions Feed

### `GET /api/blogs/recent-actions` (Alias: `GET /api/blogs/actions/recent`)

**Publicly accessible.**

Returns a live Codeforces-style real-time feed of recent community actions across blogs and comments.

Response:

``` json
{
  "actions": [
    {
      "id": "comment-6aa1f1a272b0c275a36127b1",
      "type": "COMMENT",
      "blogId": "6aa1edc072b0c275a36127a6",
      "blogTitle": "Mastering DP on Trees",
      "commentId": "6aa1f1a272b0c275a36127b1",
      "authorUsername": "alice",
      "snippet": "Great explanation on the rerooting trick! Thanks for sharing.",
      "createdAt": "2026-09-10T02:15:00.000Z"
    },
    {
      "id": "blog-6aa1edc072b0c275a36127a6",
      "type": "BLOG",
      "blogId": "6aa1edc072b0c275a36127a6",
      "blogTitle": "Mastering DP on Trees",
      "authorUsername": "deepanshu",
      "createdAt": "2026-09-09T23:37:36.886Z",
      "score": 26
    }
  ]
}
```

------------------------------------------------------------------------

## Get User Blog Quota

### `GET /api/blogs/me/quota`

**Authentication required.**

Returns the authenticated user's current blog publishing quota.

Response:

``` json
{
  "count": 3,
  "max": 5,
  "remaining": 2
}
```

------------------------------------------------------------------------

## Get Single Blog

### `GET /api/blogs/:id`

**Publicly accessible (Optionally authenticated).**

Increments `viewsCount` by 1 and returns the complete blog article with formatted comments and user vote state.

Response includes:
- `blog`: Full article object with `content`, `tags`, `viewsCount`, `score`, and enriched `comments` list with comment scores and individual vote status.

------------------------------------------------------------------------

## Create Blog

### `POST /api/blogs`

**Authentication required.**

Creates a new community blog or editorial.

**Quotas & Constraints:**
- **Quota Limit**: Maximum **5 active blogs** per user account strictly enforced in backend. Attempting to create a 6th blog returns `HTTP 400 Bad Request`.
- **Character Limit**: Maximum **50,000 characters** (~10,000 words). Content exceeding 50,000 characters is rejected with `HTTP 400`.
- **Title**: Required, max 200 characters.
- **Tags**: Array of strings (up to 10 tags).

Request body:

``` json
{
  "title": "Codeforces Round 1119 Editorial",
  "content": "# Problem A: Watermelon Reborn\n\n### Intuition\nWe can greedily pick prefixes...",
  "tags": ["editorial", "codeforces", "greedy"]
}
```

Response: `HTTP 201 Created` with created blog object.

------------------------------------------------------------------------

## Update Blog

### `PUT /api/blogs/:id`

**Authentication required (Author or Admin only).**

Updates an existing blog's title, content, or tags.

Request body:

``` json
{
  "title": "Updated Title",
  "content": "Updated content up to 50,000 characters...",
  "tags": ["editorial", "update"]
}
```

------------------------------------------------------------------------

## Delete Blog

### `DELETE /api/blogs/:id`

**Authentication required (Author or Admin only).**

Permanently deletes a blog post and cleans up all attached comments and votes. Frees up 1 slot in the user's 5-blog quota.

------------------------------------------------------------------------

## Upvote / Downvote Blog

### `POST /api/blogs/:id/vote`

**Authentication required.**

Upvotes or downvotes a community blog article.

Request body:

``` json
{
  "vote": "UPVOTE"
}
```

Supported values: `"UPVOTE"` | `"DOWNVOTE"`

**2-Minute Lock Rule**: Once cast, votes lock permanently after 120 seconds. Modifying a vote after 2 minutes returns `HTTP 403 Forbidden`.

Response:

``` json
{
  "blogId": "6aa1edc072b0c275a36127a6",
  "upvotesCount": 29,
  "downvotesCount": 2,
  "score": 27,
  "userVote": "UPVOTE"
}
```

------------------------------------------------------------------------

## Add Comment to Blog

### `POST /api/blogs/:id/comments`

**Authentication required.**

Adds a discussion comment to a blog post. Automatically creates an action entry in the live Recent Actions stream.

Request body:

``` json
{
  "content": "Awesome explanation! Could you also detail the tree centroid decomposition variant?"
}
```

Response: `HTTP 201 Created` with comment object.

------------------------------------------------------------------------

## Delete Blog Comment

### `DELETE /api/blogs/:id/comments/:commentId`

**Authentication required (Comment author, Blog author, or Admin).**

Deletes a comment from the blog post.

------------------------------------------------------------------------

## Upvote / Downvote Comment

### `POST /api/blogs/:id/comments/:commentId/vote`

**Authentication required.**

Upvotes or downvotes an individual comment in a discussion thread.

Request body:

``` json
{
  "vote": "UPVOTE"
}
```

Supported values: `"UPVOTE"` | `"DOWNVOTE"`

**2-Minute Lock Rule**: Comment votes lock permanently after 120 seconds. Changing vote after 2 minutes returns `HTTP 403 Forbidden`.

Response:

``` json
{
  "commentId": "6aa1f1a272b0c275a36127b1",
  "upvotesCount": 5,
  "downvotesCount": 0,
  "score": 5,
  "userVote": "UPVOTE"
}
```

------------------------------------------------------------------------

# Platform Accounts

## List Accounts

### `GET /api/platform-accounts`

**Authentication required.**

Returns the authenticated user's connected platform accounts.

------------------------------------------------------------------------

## Add / Update Account

### `PUT /api/platform-accounts/:platform`

**Authentication required.**

Supported platforms:

``` text
CODEFORCES
LEETCODE
CODECHEF
ATCODER
```

Example:

``` json
{
  "handle": "deepanshu_soni"
}
```

Updating an account resets its verification state and synchronization
timestamp.

------------------------------------------------------------------------

## Delete Account

### `DELETE /api/platform-accounts/:platform`

**Authentication required.**

Removes the user's connected account for the specified platform.

------------------------------------------------------------------------

# Admin API

Admin endpoints require:

1.  Valid JWT
2.  Matching `X-Username`
3.  `ADMIN` role

## List Users

### `GET /api/admin/users`

Lists users.

------------------------------------------------------------------------

## Get User

### `GET /api/admin/users/:username`

Returns information about a specific user.

------------------------------------------------------------------------

## Delete User

### `DELETE /api/admin/users/:username`

Deletes a user and cleans up related application records.

------------------------------------------------------------------------

## List Ladders

### `GET /api/admin/ladders`

Lists ladders for administrative management.

------------------------------------------------------------------------

## Delete Ladder

### `DELETE /api/admin/ladders/:ladderId`

Deletes a ladder and its associated records.

------------------------------------------------------------------------

# Authorization Model

CodeLadder uses two levels of authorization.

## Application role

``` text
USER
ADMIN
```

`ADMIN` users can manage global application resources such as questions
and administrative users/ladders.

## Ladder role

``` text
OWNER
WRITE
READ
```

### Permissions

  Operation                Owner   WRITE   READ
  ---------------------- ------- ------- ------
  View ladder                Yes     Yes    Yes
  Update ladder              Yes     Yes     No
  Add/remove questions       Yes     Yes     No
  Reorder questions          Yes     Yes     No
  Practise questions         Yes     Yes    Yes
  View revision              Yes     Yes    Yes
  Manage members             Yes      No     No
  Change ladder mode         Yes      No     No
  Delete ladder              Yes      No     No

------------------------------------------------------------------------

# Rate Limiting

The API uses endpoint-specific rate limits.

  Limiter              Limit
  -------------------- --------------------------------
  General API          200 requests / 15 minutes / IP
  Login                10 requests / 15 minutes / IP
  Register             5 requests / hour / IP
  Progress mutations   60 requests / minute
  Ladder mutations     30 requests / minute
  Admin API            30 requests / 15 minutes / IP

The test environment skips rate limiting so integration tests can run
deterministically.

For a multi-instance production deployment, replace the default
in-memory rate-limit store with a shared store such as Redis.

------------------------------------------------------------------------

# Error Handling

The API returns JSON errors.

Example:

``` json
{
  "error": "Question not found"
}
```

Common status codes:

  Status   Meaning
  -------- ---------------------------------
  `200`    Successful request
  `201`    Resource created
  `400`    Invalid request
  `401`    Authentication required/invalid
  `403`    Insufficient permissions
  `404`    Resource not found
  `409`    Duplicate/conflicting resource
  `429`    Rate limit exceeded
  `500`    Unexpected server error

MongoDB duplicate-key errors and invalid MongoDB IDs are converted into
API-level errors instead of exposing raw database stack traces.

------------------------------------------------------------------------

# Project Structure

A typical backend structure is:

``` text
backendcodeladder/
│
├── controllers/
│   ├── adminController.js
│   ├── authController.js
│   ├── ladderController.js
│   ├── platformAccountController.js
│   ├── progressController.js
│   ├── questionController.js
│   └── userController.js
│
├── middleware/
│   ├── auth.js
│   ├── errorHandler.js
│   ├── notFound.js
│   └── rateLimit.js
│
├── models/
│   ├── User.js
│   ├── Question.js
│   ├── UserQuestionState.js
│   ├── Ladder.js
│   ├── LadderQuestion.js
│   ├── LadderMember.js
│   ├── UserLadderQuestionPractice.js
│   └── PlatformAccount.js
│
├── routes/
│   ├── admin.js
│   ├── auth.js
│   ├── ladders.js
│   ├── me.js
│   ├── platformAccounts.js
│   ├── questions.js
│   └── users.js
│
├── tests/
│   └── api.test.js
│
├── app.js
├── server.js
├── package.json
├── package-lock.json
└── .env
```

------------------------------------------------------------------------

# Requirements

Recommended environment:

-   Node.js 18+
-   npm
-   MongoDB

The dependency tree includes:

-   Express
-   Mongoose
-   CORS
-   dotenv
-   JSON Web Token
-   bcrypt
-   express-rate-limit
-   Jest
-   Supertest
-   Nodemon

------------------------------------------------------------------------

# Installation

Clone the repository and enter the backend directory:

``` bash
git clone <repository-url>
cd backendcodeladder
```

Install dependencies:

``` bash
npm install
```

------------------------------------------------------------------------

# Environment Variables

Create a `.env` file:

``` env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/codeladder
JWT_SECRET=your_long_random_secret
JWT_EXPIRES_IN=7d
```

### Variables

  Variable           Description
  ------------------ ---------------------------
  `PORT`             Port used by Express
  `MONGODB_URI`      MongoDB connection string
  `JWT_SECRET`       Secret used to sign JWTs
  `JWT_EXPIRES_IN`   JWT lifetime

### Production

Never commit real secrets to source control.

Use a long, randomly generated `JWT_SECRET`.

------------------------------------------------------------------------

# Running the Server

## Development

``` bash
npm run dev
```

This starts the backend using Nodemon.

------------------------------------------------------------------------

## Production-style start

``` bash
npm start
```

The server connects to MongoDB before starting the HTTP listener.

On successful startup:

``` text
MongoDB connected successfully
CodeLadder API running on port 3000
http://localhost:3000
```

------------------------------------------------------------------------

# Testing

The backend contains an API integration test suite covering
authentication, questions, progress state, ladders, practice, revision,
collaboration, platform accounts, admin authorization, protected
endpoints, validation, and error cases.

Run:

``` bash
npm test
```

The test command runs with:

``` text
NODE_ENV=test
```

Tests use Supertest directly against the Express application rather than
requiring an already-running HTTP server.

A successful run currently covers the full **72-test API suite**.

To check for open handles:

``` bash
npm test -- --detectOpenHandles
```

------------------------------------------------------------------------

# Authentication Example

After logging in, suppose the API returns:

``` json
{
  "token": "<JWT>"
}
```

A protected request should include:

``` http
Authorization: Bearer <JWT>
X-Username: deepanshu
```

Example:

``` bash
curl \
  -H "Authorization: Bearer <JWT>" \
  -H "X-Username: deepanshu" \
  http://localhost:3000/api/auth/me
```

------------------------------------------------------------------------

# Example Workflow

A typical CodeLadder workflow is:

### 1. Register

``` text
POST /api/auth/register
```

### 2. Login

``` text
POST /api/auth/login
```

Receive JWT.

### 3. Browse questions

``` text
GET /api/questions
```

### 4. Solve a question

``` text
POST /api/questions/:questionId/solve
```

### 5. Star a question

``` text
PUT /api/questions/:questionId/star
```

### 6. Create a ladder

``` text
POST /api/ladders
```

### 7. Add questions

``` text
POST /api/ladders/:ladderId/questions
```

### 8. Invite collaborators

``` text
POST /api/ladders/:ladderId/members
```

### 9. Practise ladder questions

``` text
POST /api/ladders/:ladderId/questions/:questionId/practise
```

### 10. Start revision

``` text
PUT /api/ladders/:ladderId/mode
```

with:

``` json
{
  "mode": "REVISION"
}
```

### 11. Fetch revision candidates

``` text
GET /api/ladders/:ladderId/revision
```

------------------------------------------------------------------------

# Design Principles

## 1. Global questions, local state

Questions are global resources.

User progress is stored separately.

This avoids duplicating questions for every user or ladder.

------------------------------------------------------------------------

## 2. Ladder membership does not imply ownership

A ladder has one owner and optional collaborators.

Permissions are explicit through ladder membership.

------------------------------------------------------------------------

## 3. Practice is not solving

Global solving:

``` text
UserQuestionState
```

Ladder practice:

``` text
UserLadderQuestionPractice
```

These represent different concepts and do not overwrite each other.

------------------------------------------------------------------------

## 4. Revision does not mutate global progress

Revision mode selects questions for review.

It does not mark questions as unsolved globally.

------------------------------------------------------------------------

## 5. External platform identity is separate

Competitive-programming handles are stored in `PlatformAccount`.

The question catalog remains independent of a user's external account.

------------------------------------------------------------------------

## 6. Database constraints enforce invariants

Important uniqueness constraints include:

``` text
Question:
(platform, externalId)

UserQuestionState:
(userId, questionId)

LadderQuestion:
(ladderId, questionId)

LadderMember:
(ladderId, userId)

UserLadderQuestionPractice:
(userId, ladderId, questionId)

PlatformAccount:
(userId, platform)
```

This prevents duplicate relationships even if the API receives
concurrent or repeated requests.

------------------------------------------------------------------------

# Security

The backend includes:

-   Password hashing with bcrypt
-   JWT authentication
-   Username/JWT consistency checking
-   Role-based admin authorization
-   Ladder-level authorization
-   Rate limiting
-   Request body size limits
-   Centralized error handling
-   No password fields returned through public user APIs
-   Duplicate-resource protection through database indexes
-   Transactional cleanup for destructive operations

------------------------------------------------------------------------

# Current Scope

The current backend provides the core CodeLadder application API:

``` text
Authentication
      ↓
Question Catalog
      ↓
User Progress
      ↓
Ladders
      ↓
Practice
      ↓
Revision
      ↓
Collaboration
      ↓
Platform Accounts
      ↓
Administration
```

## Not currently implemented

Automatic external submission synchronization is not currently part of
the API.

In particular, storing a LeetCode/Codeforces/CodeChef/AtCoder handle
does not yet automatically import submissions into CodeLadder.

A future synchronization layer can build on top of `PlatformAccount` and
the global question/state architecture without changing the core ladder
model.

------------------------------------------------------------------------

# API Endpoint Summary

  ---------------------------------------------------------------------------------------------------------------
  Area              Method            Endpoint                                                  Auth
  ----------------- ----------------- --------------------------------------------------------- -----------------
  Health            GET               `/api/health`                                             Public

  Auth              POST              `/api/auth/register`                                      Public

  Auth              POST              `/api/auth/login`                                         Public

  Auth              GET               `/api/auth/me`                                            User

  Questions         GET               `/api/questions`                                          Public

  Questions         GET               `/api/questions/:questionId`                              Public

  Questions         POST              `/api/questions`                                          Admin

  Questions         PUT               `/api/questions/:questionId`                              Admin

  Questions         DELETE            `/api/questions/:questionId`                              Admin

  Progress          GET               `/api/questions/:questionId/state`                        User

  Progress          POST              `/api/questions/:questionId/solve`                        User

  Progress          POST              `/api/questions/:questionId/unsolve`                      User

  Progress          PUT               `/api/questions/:questionId/star`                         User

  Progress          DELETE            `/api/questions/:questionId/star`                         User

  Progress          GET               `/api/me/questions/solved`                                User

  Progress          GET               `/api/me/questions/starred`                               User

  Users             GET               `/api/users/:username`                                    Public

  Users             GET               `/api/users/:username/stats`                              Public

  Ladders           GET               `/api/ladders`                                            User

  Ladders           POST              `/api/ladders`                                            User

  Ladders           GET               `/api/ladders/:ladderId`                                  Member

  Ladders           PUT               `/api/ladders/:ladderId`                                  Write

  Ladders           DELETE            `/api/ladders/:ladderId`                                  Owner

  Community Ladders GET               `/api/ladders/marketplace`                                Public

  Community Ladders POST              `/api/ladders/:ladderId/publish`                          Owner

  Community Ladders POST              `/api/ladders/:ladderId/vote`                             User

  Ladder Questions  POST              `/api/ladders/:ladderId/questions`                        Write

  Ladder Questions  PUT               `/api/ladders/:ladderId/questions/reorder`                Write

  Ladder Questions  DELETE            `/api/ladders/:ladderId/questions/:questionId`            Write

  Practice          GET               `/api/ladders/:ladderId/practice`                         Member

  Practice          POST              `/api/ladders/:ladderId/questions/:questionId/practise`   Member

  Practice          DELETE            `/api/ladders/:ladderId/questions/:questionId/practise`   Member

  Revision          PUT               `/api/ladders/:ladderId/mode`                             Owner

  Revision          GET               `/api/ladders/:ladderId/revision`                         Member

  Members           GET               `/api/ladders/:ladderId/members`                          Member

  Members           POST              `/api/ladders/:ladderId/members`                          Owner

  Members           PUT               `/api/ladders/:ladderId/members/:username`                Owner

  Members           DELETE            `/api/ladders/:ladderId/members/:username`                Owner

  Blogs             GET               `/api/blogs`                                              Public

  Blogs             GET               `/api/blogs/recent-actions`                               Public

  Blogs             GET               `/api/blogs/me/quota`                                     User

  Blogs             GET               `/api/blogs/:id`                                          Public

  Blogs             POST              `/api/blogs`                                              User

  Blogs             PUT               `/api/blogs/:id`                                          Author/Admin

  Blogs             DELETE            `/api/blogs/:id`                                          Author/Admin

  Blogs             POST              `/api/blogs/:id/vote`                                     User

  Blogs             POST              `/api/blogs/:id/comments`                                 User

  Blogs             DELETE            `/api/blogs/:id/comments/:commentId`                      Author/Admin

  Blogs             POST              `/api/blogs/:id/comments/:commentId/vote`                 User

  Platforms         GET               `/api/platform-accounts`                                  User

  Platforms         PUT               `/api/platform-accounts/:platform`                        User

  Platforms         DELETE            `/api/platform-accounts/:platform`                        User

  Admin             GET               `/api/admin/users`                                        Admin

  Admin             GET               `/api/admin/users/:username`                              Admin

  Admin             DELETE            `/api/admin/users/:username`                              Admin

  Admin             GET               `/api/admin/ladders`                                      Admin

  Admin             DELETE            `/api/admin/ladders/:ladderId`                            Admin
  ---------------------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

# Future Improvements

Potential next steps include:

-   External submission synchronization
-   Platform account verification
-   Background synchronization jobs
-   Redis-backed rate limiting
-   API documentation with OpenAPI/Swagger
-   Refresh-token based authentication
-   Email verification
-   Password reset
-   More granular question filtering
-   Search
-   Ladder analytics
-   User activity history
-   Deployment configuration
-   Observability and structured logging

------------------------------------------------------------------------

# License

MIT
