require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '1h';
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
router.use(express.json());


router.post('/signup', async (req, res) => {
  try {
    const { username, email, password, phone } = req.body;

    // Check if username or email already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: "❌ Username or email already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      phone,
    });

    await newUser.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser._id, username: newUser.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Send token + user info in response
    res.status(201).json({
      message: "✅ User created successfully",
      token,
      user: {
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
      },
    });
  } catch (err) {
    console.error("❌ Error during signup:", err);
    res.status(500).json({ error: "❌ Internal server error" });
  }
});


router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(req.body);

        // Find user by username
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: "❌ Invalid username or password" });
        }
        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: "❌ Invalid username or password" });
        }
        // Generate JWT token
        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
        res.status(200).json({ message: "✅ Login successful", token, user: { username: user.username, email: user.email, phone: user.phone } });
    } catch (err) {
        console.error("❌ Error during login:", err);
        res.status(500).json({ error: "❌ Internal server error" });
    }
}
);  


module.exports = router ;