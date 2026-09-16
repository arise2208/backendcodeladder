const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

async function seedAdmin() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeladder';
  console.log('Connecting to MongoDB at:', uri);
  await mongoose.connect(uri);

  try {
    const existingAdmin = await User.findOne({ role: 'ADMIN' });
    if (existingAdmin) {
      console.log(`[SeedAdmin] An ADMIN account ("${existingAdmin.username}") already exists. Seeding aborted.`);
      process.exit(0);
    }

    const username = process.env.ADMIN_SEED_USERNAME;
    const email = process.env.ADMIN_SEED_EMAIL || `${username || 'admin'}@example.com`;
    const password = process.env.ADMIN_SEED_PASSWORD || 'AdminSecurePass123!';

    if (!username) {
      console.error('[SeedAdmin] ERROR: ADMIN_SEED_USERNAME environment variable must be provided.');
      process.exit(1);
    }

    let user = await User.findOne({ username: username.trim() });
    if (user) {
      user.role = 'ADMIN';
      await user.save();
      console.log(`[SeedAdmin] Promoted existing user "${user.username}" to ADMIN.`);
    } else {
      const passwordHash = await bcrypt.hash(password, 12);
      user = await User.create({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: 'ADMIN'
      });
      console.log(`[SeedAdmin] Created new ADMIN account "${user.username}" (${user.email}).`);
    }

    console.log('[SeedAdmin] ✅ Admin seeding completed successfully.');
  } catch (err) {
    console.error('[SeedAdmin] Failed to seed admin:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

seedAdmin();
