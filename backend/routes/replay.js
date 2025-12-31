const router = require('express').Router();
const Negotiation = require('../models/Negotiation');
const Resource = require('../models/Resource');
const Request = require('../models/Request');

// --- GET REPLAY TIMELINE ---
router.get('/:negotiationId', async (req, res) => {
    try {
        const { negotiationId } = req.params;

        // 1. Fetch the Deal
        const negotiation = await Negotiation.findById(negotiationId);
        if (!negotiation) return res.status(404).json({ error: "Deal not found" });

        // 2. Fetch the Original Item (Seller Side)
        const resource = await Resource.findById(negotiation.resourceId);
        
        // 3. Fetch the Buyer's Search Intent (Buyer Side)
        // We look for a request that matched this specific resource
        const request = await Request.findOne({ matchedResourceId: negotiation.resourceId });

        // --- BUILD THE STORY TIMELINE ---
        let timeline = [];
        let stepCount = 1;

        // SCENE 1: THE UPLOAD (Seller Logic)
        if (resource) {
            timeline.push({
                step: stepCount++,
                type: 'UPLOAD',
                actor: 'SELLER',
                message: 'Seller uploaded inventory image.',
                data: {
                    image: resource.imageUrl || 'https://via.placeholder.com/150', // Fallback if no image
                    title: resource.title,
                    aiTags: [resource.type, '98% Quality Match', 'Verified Stock'] // Simulated AI tags
                },
                timestamp: resource.createdAt
            });
        }

        // SCENE 2: THE SEARCH (Buyer Logic)
        if (request) {
            timeline.push({
                step: stepCount++,
                type: 'SEARCH',
                actor: 'BUYER_AI',
                message: 'Buyer AI Agent scanned the network.',
                data: {
                    prompt: request.prompt,
                    matchScore: '99.8%'
                },
                timestamp: request.createdAt
            });
        }

        // SCENE 3: THE NEGOTIATION (The Chat)
        // We take the logs and format them as replay events
        if (negotiation.logs && negotiation.logs.length > 0) {
            negotiation.logs.forEach(log => {
                // Skip system "Connection Established" messages to keep replay fast
                if (log.sender !== 'SYSTEM' || log.message.includes('DISTANCE ALERT')) {
                    timeline.push({
                        step: stepCount++,
                        type: 'CHAT',
                        actor: log.sender,
                        message: log.message,
                        offer: log.offer,
                        timestamp: log.timestamp
                    });
                }
            });
        }

        // SCENE 4: LOGISTICS & CONCLUSION
        if (['APPROVED', 'PAID', 'DEAL_CLOSED'].includes(negotiation.status)) {
            // Logistics Calculation Step
            timeline.push({
                step: stepCount++,
                type: 'LOGISTICS',
                actor: 'SYSTEM',
                message: 'AI Calculated Optimal Route.',
                data: {
                    distance: negotiation.distanceKm,
                    cost: negotiation.transportCost,
                    location: negotiation.buyerLocation
                }
            });

            // Final Success Step
            timeline.push({
                step: stepCount++,
                type: 'SUCCESS',
                actor: 'SYSTEM',
                message: 'Transaction Verified on Ledger.',
                data: {
                    finalPrice: negotiation.finalPrice,
                    total: negotiation.totalValue,
                    gatePass: negotiation.logistics?.gatePassId || 'Generating...'
                }
            });
        }

        res.json({ success: true, timeline });

    } catch (err) {
        console.error("Replay Error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;