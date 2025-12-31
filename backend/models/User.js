const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  // We can track if they are a 'Donor' or 'Receiver' primarily, 
  // or just let them do both. Let's keep it flexible for now.
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);