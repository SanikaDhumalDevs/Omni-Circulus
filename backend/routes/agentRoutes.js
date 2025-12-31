const express = require('express');
const router = express.Router();
const Resource = require('../models/Resource');
const Request = require('../models/Request');

// POST: Seek and Match (Or Queue)
router.post('/seek', async (req, res) => {
  try {
    const { prompt, userEmail } = req.body;
    
    // 1. Prepare Keywords (Remove small words like 'the', 'and', 'for')
    const rawKeywords = prompt ? prompt.toLowerCase().split(' ') : [];
    const stopWords = ['the', 'and', 'for', 'with', 'want', 'need', 'looking'];
    const keywords = rawKeywords.filter(w => w.length > 2 && !stopWords.includes(w));

    // 2. Build a "Smart" Query
    // We look for resources where the User is NOT the owner
    let matchQuery = { 
        status: 'Available',
        ownerEmail: { $ne: userEmail } 
    };

    if (keywords.length > 0) {
        // Create a Regex pattern to match ANY of the keywords
        // Example: if keywords are ['wood', 'plank'], regex is /wood|plank/i
        const regex = new RegExp(keywords.join('|'), 'i');

        // Search in Title OR Description OR Type OR Tags
        matchQuery.$or = [
            { title: { $regex: regex } },
            { description: { $regex: regex } },
            { type: { $regex: regex } },
            { tags: { $in: keywords } }
        ];
    }

    // 3. EXECUTE SEARCH
    const matches = await Resource.find(matchQuery);

    // 4. DECISION ENGINE
    if (matches.length > 0) {
      // SCENARIO A: Found immediately
      console.log(`✅ MATCH FOUND: ${matches.length} items for "${prompt}"`);
      
      res.status(200).json({
        status: 'FOUND',
        message: 'MATCH FOUND',
        foundItems: matches // This includes the 'cost' field automatically
      });

    } else {
      // SCENARIO B: Not found -> Deploy Background Agent
      console.log(`⏳ NO MATCH: Queuing agent for "${prompt}"`);
      
      if (prompt) {
        // Save the request so it can be found later when someone adds an item
        const newRequest = new Request({
          userEmail,
          prompt,
          keywords,
          status: 'SEARCHING'
        });
        await newRequest.save();
        
        res.status(200).json({
          status: 'QUEUED',
          message: 'Agent deployed to background.',
          foundItems: []
        });
      } else {
        res.status(200).json({ status: 'NOT_FOUND', foundItems: [] });
      }
    }

  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(500).json(err);
  }
});

// GET: Fetch User's Active Requests
router.get('/my-requests/:email', async (req, res) => {
  try {
    const requests = await Request.find({ userEmail: req.params.email })
                                  .sort({ createdAt: -1 })
                                  .populate('matchedResourceId');
    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;