const express = require('express');
const cors = require('cors');

// Routes
const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/questions');
const meRoutes = require('./routes/me');
const userRoutes = require('./routes/users');
const ladderRoutes = require('./routes/ladders');
const blogRoutes = require('./routes/blogs');
const platformAccountRoutes = require('./routes/platformAccounts');
const adminRoutes = require('./routes/admin');

// Middleware
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const {
  generalLimiter,
  loginLimiter,
  registerLimiter,
  adminLimiter
} = require('./middleware/rateLimit');

const app = express();

/*
 * --------------------------------------------------
 * Global middleware
 * --------------------------------------------------
 */

// CORS
app.use(cors());

// Parse JSON request bodies
app.use(express.json({ limit: '1mb' }));

/*
 * --------------------------------------------------
 * General API rate limit
 * --------------------------------------------------
 *
 * Applies to all /api endpoints.
 *
 * 200 requests per 15 minutes per IP.
 *
 * More specific limiters below provide stricter
 * protection for sensitive endpoints.
 */

app.use('/api', generalLimiter);

/*
 * --------------------------------------------------
 * Health check
 * --------------------------------------------------
 */

app.get('/api/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'codeladder-api'
  });
});

/*
 * --------------------------------------------------
 * Authentication routes
 * --------------------------------------------------
 *
 * Login and registration have stricter limits
 * than the general API.
 */

app.use('/api/auth/login', loginLimiter);

app.use('/api/auth/register', registerLimiter);

app.use('/api/auth', authRoutes);

/*
 * --------------------------------------------------
 * API routes
 * --------------------------------------------------
 */

app.use('/api/questions', questionRoutes);

app.use('/api/me', meRoutes);

app.use('/api/users', userRoutes);

app.use('/api/ladders', ladderRoutes);

app.use('/api/blogs', blogRoutes);

app.use('/api/platform-accounts', platformAccountRoutes);

/*
 * --------------------------------------------------
 * Admin routes
 * --------------------------------------------------
 *
 * Admin routes get their own stricter limiter.
 *
 * The admin router itself is responsible for:
 * - authentication
 * - checking ADMIN role
 */

app.use('/api/admin', adminLimiter, adminRoutes);

/*
 * --------------------------------------------------
 * 404 handler
 * --------------------------------------------------
 *
 * Must come AFTER all routes.
 */

app.use(notFound);

/*
 * --------------------------------------------------
 * Global error handler
 * --------------------------------------------------
 *
 * Must be the LAST middleware.
 */

app.use(errorHandler);

module.exports = app;