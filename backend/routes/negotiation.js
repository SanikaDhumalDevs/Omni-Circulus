const router = require('express').Router();
const Negotiation = require('../models/Negotiation');
const Resource = require('../models/Resource');
const Request = require('../models/Request');
const crypto = require('crypto');
const { sendConfirmationEmails } = require('../utils/emailService');
require('dotenv').config();

// --- 1. SAFE AI LOADER ---
let GoogleGenerativeAI;
try {
    const lib = require("@google/generative-ai");
    GoogleGenerativeAI = lib.GoogleGenerativeAI;
} catch (err) {
    console.warn("⚠️ Google AI Lib missing. Using Simulation Mode.");
}

// --- 2. HELPER: LOGISTICS ---
function calculateLogistics(loc1, loc2) {
    const distance = Math.floor(Math.random() * 30) + 5; 
    const transportCost = distance * 25; 
    return { distance, transportCost };
}

// --- 3. START NEGOTIATION ---
router.post('/start', async (req, res) => {
    try {
        const { resourceId, buyerEmail, buyerLocation } = req.body;
        
        const resource = await Resource.findById(resourceId);
        if (!resource) throw new Error("Item not found");

        // Clear old negotiations
        await Negotiation.deleteMany({ resourceId, buyerEmail, status: { $ne: 'DEAL_CLOSED' } });

        const floorPrice = Math.floor(resource.cost * 0.9); 

        const negotiation = new Negotiation({
            resourceId,
            buyerEmail,
            sellerEmail: resource.ownerEmail,
            initialPrice: resource.cost,
            currentSellerAsk: resource.cost,
            floorPrice: floorPrice,
            buyerLocation: buyerLocation || "Unknown",
            status: 'PRICE_NEGOTIATING',
            turnCount: 0, 
            logs: [{
                sender: 'SYSTEM',
                message: `CONNECTION ESTABLISHED. Item: ${resource.title}. Asking Price: ₹${resource.cost}.`
            }]
        });

        await negotiation.save();
        res.json(negotiation);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 4. NEXT TURN (THE BRAIN) ---
router.post('/next-turn', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId);
        if (!negotiation) return res.status(404).json({ error: "Negotiation lost" });

        // A. STOP CONDITIONS
        // UPDATED: Added 'APPROVED' and 'PAID' so AI stops talking when it's time to pay
        if (['DEAL_CLOSED', 'FAILED', 'COMPLETED', 'CANCELLED_DISTANCE', 'TRANSPORT_AGREED', 'APPROVED', 'PAID'].includes(negotiation.status)) {
            
            // If just finished agreeing to transport, prompt for user confirmation
            if (negotiation.status === 'TRANSPORT_AGREED') {
                 // Only add the log if it's not already there
                 const lastLog = negotiation.logs[negotiation.logs.length - 1];
                 if (!lastLog.message.includes("Waiting for User Confirmation")) {
                    negotiation.logs.push({ sender: 'SYSTEM', message: "Waiting for User Confirmation" });
                    await negotiation.save();
                 }
            }
            return res.json(negotiation);
        }

        if (negotiation.status === 'WAITING_FOR_APPROVAL') {
             return res.json(negotiation);
        }

        const lastLog = negotiation.logs[negotiation.logs.length - 1];
        if (lastLog && lastLog.message.includes("Waiting for User")) {
             return res.json(negotiation);
        }

        // B. PHASE SWITCH: PRICE -> LOGISTICS
        if (negotiation.status === 'PRICE_AGREED') {
            const logistics = calculateLogistics(negotiation.buyerLocation, "SellerHQ");
            
            if (logistics.distance > 20) {
                negotiation.status = 'CANCELLED_DISTANCE';
                negotiation.distanceKm = logistics.distance;
                negotiation.logs.push({
                    sender: 'SYSTEM',
                    message: `DISTANCE ALERT: ${logistics.distance}km (>20km). Auto-Cancelling Deal.`
                });
                await negotiation.save();
                return res.json(negotiation);
            }

            negotiation.distanceKm = logistics.distance;
            negotiation.transportCost = logistics.transportCost;
            negotiation.status = 'TRANSPORT_NEGOTIATING';
            
            negotiation.logs.push({ 
                sender: 'SYSTEM', 
                message: `PHASE 2: LOGISTICS. Distance: ${logistics.distance}km. Standard Rate: ₹${logistics.transportCost}.` 
            });
            negotiation.logs.push({ 
                sender: 'SELLER_AGENT', 
                message: `The delivery cost is ₹${logistics.transportCost} for ${logistics.distance}km. Shall we proceed?` 
            });
            
            await negotiation.save();
            return res.json(negotiation);
        }

        // C. DETERMINE ACTOR & CONTEXT
        const lastRelevantLog = negotiation.logs.slice().reverse().find(l => l.sender === 'BUYER_AGENT' || l.sender === 'SELLER_AGENT');
        const currentAgent = (!lastRelevantLog || lastRelevantLog.sender === 'SELLER_AGENT') ? 'BUYER_AGENT' : 'SELLER_AGENT';
        
        const isTransportPhase = negotiation.status === 'TRANSPORT_NEGOTIATING';
        const lastMessageText = lastRelevantLog ? lastRelevantLog.message.toLowerCase() : "";
        const isFinalOffer = lastMessageText.includes("final") || lastMessageText.includes("cannot go down") || lastMessageText.includes("last price");

        // D. GENERATE DECISION
        let decision = null;

        try {
            if (!process.env.GEMINI_API_KEY || !GoogleGenerativeAI) throw new Error("No AI Config");
            
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            let phasePrompt;
            if (isTransportPhase) {
                phasePrompt = `
                CURRENT PHASE: Logistics Negotiation. 
                Standard Delivery Cost is ₹${negotiation.transportCost}.
                IMPORTANT: The 'price' field in JSON must be the TRANSPORT COST (approx ${negotiation.transportCost}), NOT the Item Price.
                
                IF BUYER: Ask for a discount on delivery. If the history shows you already asked or Seller refused, respond with {"action": "ACCEPT", "price": ${negotiation.transportCost}, "message": "Okay, I agree to the transport cost."}.
                IF SELLER: Refuse any discount. Maintain strict standard rate of ₹${negotiation.transportCost}.
                `;
            } else {
                phasePrompt = `PHASE: Item Price Negotiation. Current Ask: ₹${negotiation.currentSellerAsk || negotiation.initialPrice}. Floor: ₹${negotiation.floorPrice}.`;
            }

            const systemPrompt = `
                Act as ${currentAgent}.
                ${phasePrompt}
                RULES: 1. NO REPETITION. 2. Respond ONLY in JSON: { "action": "OFFER" | "ACCEPT" | "DECLINE", "price": number, "message": "string" }
                History: ${JSON.stringify(negotiation.logs.slice(-3))}
            `;

            const result = await model.generateContent(systemPrompt);
            const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            decision = JSON.parse(text);

        } catch (aiError) {
            console.log("Using Rule Engine Fallback");
            const stdCost = negotiation.transportCost || 0;
            
            if (isTransportPhase) {
                if (currentAgent === 'BUYER_AGENT') {
                    const hasAsked = negotiation.logs.some(l => l.sender === 'BUYER_AGENT' && (l.message.includes("discount") || l.message.includes("delivery")));
                    if (hasAsked) {
                        decision = { action: "ACCEPT", price: stdCost, message: "Okay, I accept the delivery charges." };
                    } else {
                        decision = { action: "OFFER", price: stdCost, message: "Can you provide a discount on delivery?" };
                    }
                } else {
                    decision = { action: "OFFER", price: stdCost, message: "Sorry, these are third-party standard rates. We cannot discount." };
                }
            } else {
                const floor = negotiation.floorPrice || (negotiation.initialPrice - 10);
                const currentAsk = negotiation.currentSellerAsk || negotiation.initialPrice;
                const lastOffer = negotiation.currentBuyerOffer || 0;

                if (currentAgent === 'BUYER_AGENT') {
                    if (isFinalOffer || currentAsk <= floor) {
                        decision = { action: "ACCEPT", price: currentAsk, message: "Okay, I accept your final price." };
                    } else {
                        let offer = lastOffer === 0 ? Math.floor(negotiation.initialPrice * 0.85) : Math.min(currentAsk - 2, lastOffer + 5);
                        decision = { action: "OFFER", price: offer, message: `I can offer ₹${offer}.` };
                    }
                } else {
                    if (lastOffer >= floor) {
                        decision = { action: "ACCEPT", price: lastOffer, message: "Deal accepted." };
                    } else if (currentAsk <= floor) {
                         decision = { action: "OFFER", price: floor, message: "I cannot go down below this price. This is last." };
                    } else {
                        let nextAsk = Math.max(floor, currentAsk - 5);
                        let msg = `My best price is ₹${nextAsk}.`;
                        if (nextAsk === floor) msg = `I cannot go down below ₹${nextAsk} rs this is last`;
                        decision = { action: "OFFER", price: nextAsk, message: msg };
                    }
                }
            }
        }

        if (!decision) decision = { action: "OFFER", price: negotiation.transportCost, message: "Please proceed." };

        negotiation.turnCount = (negotiation.turnCount || 0) + 1;
        negotiation.logs.push({ 
            sender: currentAgent, 
            message: decision.message, 
            offer: decision.price 
        });

        if (!isTransportPhase && decision.action === 'OFFER') {
             if (currentAgent === 'BUYER_AGENT') negotiation.currentBuyerOffer = decision.price;
             else negotiation.currentSellerAsk = decision.price;
        }

        if (decision.action === 'ACCEPT') {
            if (!isTransportPhase) {
                negotiation.status = 'PRICE_AGREED';
                negotiation.finalPrice = decision.price;
                negotiation.logs.push({ sender: 'SYSTEM', message: `PRICE LOCKED at ₹${decision.price}. Calculating Logistics...` });
            } else {
                negotiation.status = 'TRANSPORT_AGREED';
                const finalTransport = negotiation.transportCost; 
                negotiation.totalValue = (negotiation.finalPrice || 0) + finalTransport;
                negotiation.logs.push({ sender: 'SYSTEM', message: "Waiting for User Confirmation" });
            }
        } else if (decision.action === 'DECLINE' || negotiation.turnCount > 40) {
            negotiation.status = 'FAILED';
            negotiation.logs.push({ sender: 'SYSTEM', message: "Negotiation Failed." });
        }

        await negotiation.save();
        res.json(negotiation);

    } catch (err) {
        console.error("SERVER ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- 5. SEND CONFIRMATION EMAILS ---
router.post('/send-approvals', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId).populate('resourceId');
        
        if (!negotiation) return res.status(404).json({ error: "Negotiation not found" });

        // Generate Token
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL';

        // --- UPDATED BASE URL for Localhost ---
        const baseUrl = 'http://localhost:3000'; 
        
        const buyerLink = `${baseUrl}/confirm-deal?token=${token}&role=buyer`;
        const sellerLink = `${baseUrl}/confirm-deal?token=${token}&role=seller`;

        // Send Emails
        const emailSent = await sendConfirmationEmails(negotiation, buyerLink, sellerLink);

        if (emailSent) {
            negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Sent. Waiting for parties..." });
            await negotiation.save();
            res.json({ success: true, message: "Emails Sent" });
        } else {
            res.status(500).json({ error: "Failed to send emails" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 6. VERIFY TRANSACTION (UPDATED FOR PAYMENT) ---
router.post('/verify-transaction', async (req, res) => {
    try {
        const { token, action, role } = req.body; // action: 'approve'|'reject', role: 'buyer'|'seller'

        const negotiation = await Negotiation.findOne({ confirmationToken: token });
        if (!negotiation) return res.status(404).json({ error: "Invalid Token" });

        // If already paid or closed, don't change anything
        if (['DEAL_CLOSED', 'PAID'].includes(negotiation.status)) {
            return res.json({ 
                success: true, 
                status: 'ALREADY_CLOSED', 
                message: "Deal already closed.",
                negotiationId: negotiation._id // <--- IMPORTANT: Always return ID
            });
        }

        // Handle Rejection
        if (action === 'reject') {
            negotiation.status = 'FAILED';
            negotiation.logs.push({ sender: 'SYSTEM', message: `Deal REJECTED by ${role}.` });
            await negotiation.save();
            return res.json({ success: true, status: 'REJECTED' });
        }

        // Handle Approval
        if (role === 'buyer') negotiation.buyerApproval = 'APPROVED';
        if (role === 'seller') negotiation.sellerApproval = 'APPROVED';

        // Check if both approved
        if (negotiation.buyerApproval === 'APPROVED' && negotiation.sellerApproval === 'APPROVED') {
            negotiation.status = 'APPROVED'; // <--- Triggers frontend to show Pay Button
            negotiation.logs.push({ sender: 'SYSTEM', message: "Both parties APPROVED. Waiting for Payment." });
            
            await negotiation.save();
            return res.json({ 
                success: true, 
                status: 'APPROVED',
                negotiationId: negotiation._id // <--- CRITICAL UPDATE: Returns ID for frontend redirect
            });
        }

        await negotiation.save();
        res.json({ 
            success: true, 
            status: 'PENDING', 
            message: "Approval Recorded. Waiting for other party.",
            negotiationId: negotiation._id 
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 7. MANUAL CONFIRM (Legacy/Direct) ---
router.post('/confirm', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId);
        if (!negotiation) return res.status(404).json({ error: "Negotiation not found" });

        negotiation.status = 'DEAL_CLOSED';
        await negotiation.save();

        await Resource.findByIdAndUpdate(negotiation.resourceId, { status: 'Claimed' });
        await Request.findOneAndUpdate(
            { userEmail: negotiation.buyerEmail, matchedResourceId: negotiation.resourceId },
            { status: 'COMPLETED' }
        );

        res.json({ success: true });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// --- 8. HISTORY ENDPOINT ---
router.get('/history/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const history = await Negotiation.find({ 
            buyerEmail: email, 
            status: { $in: ['DEAL_CLOSED', 'PAID', 'COMPLETED'] } // Updated to show PAID items in history too
        })
        .sort({ updatedAt: -1 }) 
        .populate('resourceId', 'title cost location'); 

        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;