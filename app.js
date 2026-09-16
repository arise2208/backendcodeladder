const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Routes
const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/questions');
const meRoutes = require('./routes/me');
const userRoutes = require('./routes/users');
const ladderRoutes = require('./routes/ladders');
const blogRoutes = require('./routes/blogs');
const platformAccountRoutes = require('./routes/platformAccounts');
const adminRoutes = require('./routes/admin');
const contestRoutes = require('./routes/contests');

// Middleware
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const {
  generalLimiter,
  loginLimiter,
  registerLimiter,
  adminLimiter,
  catalogLimiter
} = require('./middleware/rateLimit');

const app = express();

app.set('trust proxy', 1);

/*
 * --------------------------------------------------
 * Global middleware
 * --------------------------------------------------
 */

// CORS
app.use(cors());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});


// Parse JSON request bodies (increased limit for batch sync payloads)
app.use(express.json({ limit: '10mb' }));

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
  const conn = mongoose.connection;
  const isConnected = conn.readyState === 1;
  res.status(isConnected ? 200 : 503).json({
    ok: isConnected,
    service: 'codeladder-api',
    database: {
      connected: isConnected,
      host: conn.host || null,
      port: conn.port || null,
      name: conn.name || null
    }
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

app.use('/api/questions', catalogLimiter, questionRoutes);

app.use('/api/me', meRoutes);

app.use('/api/users', userRoutes);

app.use('/api/ladders', ladderRoutes);

app.use('/api/blogs', blogRoutes);

app.use('/api/platform-accounts', platformAccountRoutes);
app.use('/api/contests', contestRoutes);

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