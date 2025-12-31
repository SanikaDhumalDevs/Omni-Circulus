const mongoose = require('mongoose');

const RequestSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  prompt: { type: String, required: true }, // e.g., "I need red bricks"
  keywords: [String], // e.g., ["red", "bricks"]
  status: { type: String, enum: ['SEARCHING', 'FOUND', 'COMPLETED'], default: 'SEARCHING' },
  
  // If a match is found later, we link the Resource ID here
  matchedResourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Request', RequestSchema);