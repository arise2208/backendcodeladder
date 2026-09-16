const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/questions');
const meRoutes = require('./routes/me');
const userRoutes = require('./routes/users');
const ladderRoutes = require('./routes/ladders');
const blogRoutes = require('./routes/blogs');
const platformAccountRoutes = require('./routes/platformAccounts');
const adminRoutes = require('./routes/admin');
const contestRoutes = require('./routes/contests');

const requestId = require('./middleware/requestId');
const mongoSanitize = require('./middleware/mongoSanitize');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const {
  generalLimiter,
  loginLimiter,
  registerLimiter,
  adminLimiter,
  catalogLimiter,
  syncSolvedLimiter
} = require('./middleware/rateLimit');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(requestId);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
}));

app.use(hpp());

const bulkSyncPaths = [
  '/api/platform-accounts/sync-solved',
  '/api/platform-accounts/leetcode/sync',
  '/api/platform-accounts/codechef/sync'
];

app.use(bulkSyncPaths, express.json({ limit: '10mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(mongoSanitize);

app.use('/api', generalLimiter);

const sendHealth = (req, res) => {
  const connection = mongoose.connection;
  const isConnected = connection.readyState === 1;
  const isProd = process.env.NODE_ENV === 'production';

  res.status(isConnected ? 200 : 503).json({
    ok: isConnected,
    service: 'codeladder-api',
    database: {
      connected: isConnected,
      ...(isProd ? {} : {
        host: connection.host || null,
        port: connection.port || null,
        name: connection.name || null
      })
    }
  });
};

app.get('/', sendHealth);
app.get('/health', sendHealth);
app.get('/api/health', sendHealth);


app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth', authRoutes);

app.use('/api/questions', catalogLimiter, questionRoutes);
app.use('/api/me', meRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ladders', ladderRoutes);
app.use('/api/blogs', blogRoutes);

app.use(bulkSyncPaths, syncSolvedLimiter);
app.use('/api/platform-accounts', platformAccountRoutes);
app.use('/api/contests', contestRoutes);

app.use('/api/admin', adminLimiter, adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
