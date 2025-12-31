const express = require('express');
const router = express.Router();
const Resource = require('../models/Resource');
const Request = require('../models/Request'); 

// POST: Add a new Resource (And check for waiting Agents)
router.post('/add', async (req, res) => {
  try {
    // 1. EXTRACT DATA - Added 'imageUrl' to destructuring
    const { 
      title, 
      description, 
      type, 
      quantity, 
      location, 
      ownerEmail, 
      cost, 
      imageUrl // <--- FIX 1: Read the image from the request
    } = req.body;

    // 2. Generate Tags
    const textToScan = `${title} ${description || ''} ${type}`;
    const generatedTags = textToScan.toLowerCase().split(/[\s,]+/); 

    // 3. Save the Resource
    const newResource = new Resource({
      title,
      type,
      description,
      quantity,
      location,
      tags: generatedTags,
      cost: cost || 0, 
      ownerEmail: ownerEmail,
      imageUrl: imageUrl // <--- FIX 2: Pass the image to the database model
    });

    const savedResource = await newResource.save();

    // --- AGENT LOGIC: Reverse Search ---
    const pendingRequests = await Request.find({ 
      status: 'SEARCHING',
      keywords: { $in: generatedTags }, 
      userEmail: { $ne: ownerEmail }    
    });

    if (pendingRequests.length > 0) {
      console.log(`🔔 Found ${pendingRequests.length} waiting agents for this item.`);
      for (const req of pendingRequests) {
        req.status = 'FOUND';
        req.matchedResourceId = savedResource._id;
        await req.save();
      }
    }
    // -----------------------------------

    res.status(201).json(savedResource);
  } catch (err) {
    console.error("Error adding resource:", err); // Added better error logging
    res.status(500).json(err);
  }
});

// GET: Get all Resources
router.get('/all', async (req, res) => {
  try {
    const resources = await Resource.find({ status: 'Available' });
    res.status(200).json(resources);
  } catch (err) {
    res.status(500).json(err);
  }
});

// PUT: Claim a Resource
router.put('/claim/:id', async (req, res) => {
  try {
    const updatedResource = await Resource.findByIdAndUpdate(
      req.params.id, 
      { status: 'Claimed' }, 
      { new: true }
    );
    res.status(200).json(updatedResource);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;