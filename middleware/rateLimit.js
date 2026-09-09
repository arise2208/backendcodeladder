const rateLimit = require('express-rate-limit');

/*
 * Disable rate limiting during Jest tests.
 *
 * Production/development:
 *   rate limiting is active
 *
 * Jest:
 *   rate limiting is skipped so integration tests
 *   are not affected by request counters.
 */
const isTest = process.env.NODE_ENV === 'test';


/*
 * General API protection
 *
 * Applies to authenticated and unauthenticated API traffic.
 *
 * 200 requests / 15 minutes / IP
 */
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 5000 : 500,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  skip: () => isTest || isDev,

  message: {
    error: 'Too many requests. Please try again later.'
  }
});


/*
 * Authentication
 *
 * 10 requests / 15 minutes / IP
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  skip: () => isTest,

  message: {
    error: 'Too many login attempts. Please try again later.'
  }
});


/*
 * Registration
 *
 * 5 requests / hour / IP
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  skip: () => isTest,

  message: {
    error: 'Too many registration attempts. Please try again later.'
  }
});


/*
 * Progress mutations
 *
 * solve / unsolve / star / unstar
 *
 * 60 requests / minute
 */
const progressLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  skip: () => isTest,

  message: {
    error: 'Too many progress updates. Please try again later.'
  }
});


/*
 * Ladder mutations
 *
 * Creating/updating/deleting ladders,
 * modifying questions, practice, mode,
 * and member management.
 *
 * 30 requests / minute
 */
const ladderWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  skip: () => isTest,

  message: {
    error: 'Too many ladder changes. Please try again later.'
  }
});


/*
 * Admin endpoints
 *
 * 30 requests / 15 minutes / IP
 */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 5000 : 1000,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  skip: () => isTest || isDev,

  message: {
    error: 'Too many admin requests. Please try again later.'
  }
});


module.exports = {
  generalLimiter,
  loginLimiter,
  registerLimiter,
  progressLimiter,
  ladderWriteLimiter,
  adminLimiter
};