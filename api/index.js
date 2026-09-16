const mongoose = require('mongoose');
const app = require('../app');

let isConnected = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not configured in environment variables');
  }
  await mongoose.connect(uri, {
    bufferCommands: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
  isConnected = true;
}

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    console.error('[Vercel Serverless] Database connection error:', err.message);
    return res.status(500).json({
      error: 'Database connection failed',
      details: err.message
    });
  }
  return app(req, res);
};
