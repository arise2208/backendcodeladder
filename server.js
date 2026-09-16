
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

async function startServer() {
  try {
    // -----------------------------------------------
    // Validate required environment variables
    // -----------------------------------------------

    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not configured');
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    // -----------------------------------------------
    // Connect to MongoDB
    // -----------------------------------------------

    await mongoose.connect(MONGODB_URI);

    const conn = mongoose.connection;
    console.log(`[DB] Connected successfully to database: "${conn.name}" on ${conn.host}:${conn.port}`);

    conn.on('disconnected', () => {
      console.warn('[DB] MongoDB disconnected!');
    });
    conn.on('reconnected', () => {
      console.log(`[DB] MongoDB reconnected to: "${conn.name}" on ${conn.host}:${conn.port}`);
    });

    try {
      const questionCatalog = require('./services/questionCatalog');
      await questionCatalog.syncFromDatabase();
    } catch (catErr) {
      console.warn('Question catalog DB sync notice:', catErr.message);
    }

    // -----------------------------------------------
    // Start Express server
    // -----------------------------------------------

    const server = app.listen(PORT, () => {
      console.log(`CodeLadder API running on port ${PORT}`);
      console.log(`http://localhost:${PORT}`);
    });

    // -----------------------------------------------
    // Graceful shutdown
    // -----------------------------------------------

    const shutdown = async (signal) => {
      console.log(`${signal} received. Shutting down...`);

      server.close(async () => {
        try {
          await mongoose.connection.close();
          console.log('MongoDB connection closed');
          process.exit(0);
        } catch (error) {
          console.error('Error while closing MongoDB:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    console.error('Failed to start CodeLadder server:', error);
    process.exit(1);
  }
}

startServer();
