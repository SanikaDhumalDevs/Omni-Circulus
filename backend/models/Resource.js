const mongoose = require('mongoose');

const ResourceSchema = new mongoose.Schema({
  title: { type: String, required: true }, 
  
  // Update: Removed strict 'enum' so AI can add any material type (Glass, Fabric, etc.)
  type: { type: String, required: true }, 
  
  description: { type: String }, 
  quantity: { type: Number, default: 1 },
  location: { type: String, required: true }, 
  status: { type: String, default: 'Available' }, // Available, Claimed
  imageUrl: { type: String },
  
  // IDENTITY
  ownerEmail: { type: String, required: true }, 

  // PRICE (Crucial for Negotiation)
  cost: { type: Number, required: true, default: 0 }, 
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Resource', ResourceSchema);