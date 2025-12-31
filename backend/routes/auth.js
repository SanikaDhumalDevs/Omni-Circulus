const router = require('express').Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 1. REGISTER (Sign Up)
router.post('/register', async (req, res) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) return res.status(400).json("Email already exists");

    // Encrypt the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    // Create new user
    const newUser = new User({
      username: req.body.username,
      email: req.body.email,
      password: hashedPassword
    });

    const user = await newUser.save();
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. LOGIN
router.post('/login', async (req, res) => {
  try {
    // Find user
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(404).json("User not found");

    // Check password
    const validPassword = await bcrypt.compare(req.body.password, user.password);
    if (!validPassword) return res.status(400).json("Wrong password");

    // Create a Token (The "ID Card")
    // Note: In production, put "SecretKey" in a .env file
    const token = jwt.sign({ id: user._id }, "SecretKey123", { expiresIn: "5d" });

    // Send back the user info and the token
    const { password, ...others } = user._doc;
    res.status(200).json({ ...others, token }); // frontend needs this token
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;