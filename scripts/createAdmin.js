require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const email = process.argv[2];
const password = process.argv[3];
const name = process.argv[4] || 'Express Cargo Super Admin';

if (!email || !password) {
  console.error('\n❌ Error: Missing credentials!');
  console.error('Usage: node createAdmin.js <email> <password> [name]\n');
  process.exit(1);
}

async function createOrUpdateAdmin() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('Error: MONGODB_URI not found in .env');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully.');

    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      user.name = name;
      user.password = password; // Will be hashed automatically by User pre-save hook
      user.role = 'super_admin';
      user.status = 'active';
      user.isEmailVerified = true;
      await user.save();
      console.log(`\n✅ Admin account updated successfully!`);
    } else {
      user = await User.create({
        name,
        email: email.toLowerCase(),
        password,
        role: 'super_admin',
        status: 'active',
        isEmailVerified: true
      });
      console.log(`\n✅ Admin account created successfully!`);
    }

    console.log(`--------------------------------------------------`);
    console.log(`Email:    ${user.email}`);
    console.log(`Password: ${password}`);
    console.log(`Role:     ${user.role}`);
    console.log(`--------------------------------------------------`);
    console.log(`\nYou can now log in via POST /api/auth/login or your admin portal.\n`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin account:', error.message);
    process.exit(1);
  }
}

createOrUpdateAdmin();

