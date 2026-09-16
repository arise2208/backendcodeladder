const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function promoteUser() {
  const targetUsername = (process.argv[2] || process.env.PROMOTE_USERNAME || 'deepanshu_soni').trim();
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeladder';

  console.log('Connecting to MongoDB at:', uri.replace(/:([^:@]+)@/, ':****@'));
  await mongoose.connect(uri);

  try {
    const user = await User.findOne({ username: new RegExp(`^${targetUsername}$`, 'i') });
    if (!user) {
      console.error(`❌ User "${targetUsername}" not found. Please register this user account first on CodeLadder.`);
      process.exit(1);
    }

    user.role = 'ADMIN';
    await user.save();
    console.log(`✅ Successfully promoted user "${user.username}" (${user.email}) to ADMIN!`);
  } catch (err) {
    console.error('Failed to promote user:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

promoteUser();
