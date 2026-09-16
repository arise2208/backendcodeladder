const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

async function connectWithRetry(uri, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(uri);
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.warn(`[DB] Connect attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function startServer() {
  try {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not configured');
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    if (process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters for security');
    }

    await connectWithRetry(MONGODB_URI);

    const connection = mongoose.connection;
    console.log(`[DB] Connected to "${connection.name}" on ${connection.host}:${connection.port}`);

    connection.on('disconnected', () => console.warn('[DB] MongoDB disconnected!'));
    connection.on('reconnected', () => console.log(`[DB] MongoDB reconnected to "${connection.name}" on ${connection.host}:${connection.port}`));

    try {
      const questionCatalog = require('./services/questionCatalog');
      await questionCatalog.syncFromDatabase();
    } catch (catalogError) {
      console.warn('[Catalog] DB sync notice:', catalogError.message);
    }

    const server = app.listen(PORT, () => {
      console.log(`CodeLadder API running on port ${PORT}`);
    });

    const shutdown = (signal) => {
      console.log(`${signal} received. Shutting down...`);
      server.close(async () => {
        try {
          await mongoose.connection.close();
          console.log('[DB] Connection closed.');
          process.exit(0);
        } catch (error) {
          console.error('[DB] Error closing connection:', error);
          process.exit(1);
        }
      });

      const SHUTDOWN_TIMEOUT_MS = 10000;
      setTimeout(() => {
        console.error('[Shutdown] Force exit after timeout.');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Failed to start CodeLadder server:', error.message);
    process.exit(1);
  }
}

startServer();
