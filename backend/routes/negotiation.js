const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); // ✅ Imported here
require('dotenv').config();

// --- IMPORT MODELS ---
// We use mongoose.model to avoid circular dependency issues
const Negotiation = mongoose.model('Negotiation');
const Resource = mongoose.model('Resource');
const Request = mongoose.model('Request');

// --- 📧 EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'sanikadhumal149@gmail.com', 
    pass: 'kavg woqd ovdt srmz' // Your App Password
  }
});

// --- 📧 INTERNAL EMAIL FUNCTION ---
const sendConfirmationEmails = async (negotiation, buyerLink, sellerLink) => {
  try {
    console.log("📨 Attempting to send emails...");
    
    const itemTitle = negotiation.resourceId?.title || "Industrial Resource";
    const cost = negotiation.totalValue || 0;

    // 1. Send to Buyer
    await transporter.sendMail({
      from: '"Omni Agent" <sanikadhumal149@gmail.com>',
      to: negotiation.buyerEmail,
      subject: `Action Required: Purchase Confirmation`,
      html: `
        <h2>Purchase Confirmation</h2>
        <p><strong>Item:</strong> ${itemTitle}</p>
        <p><strong>Total Cost:</strong> ₹${cost}</p>
        <br/>
        <a href="${buyerLink}" style="background-color:#16a34a;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">✅ CONFIRM PURCHASE</a>
      `
    });

    // 2. Send to Seller
    await transporter.sendMail({
      from: '"Omni Agent" <sanikadhumal149@gmail.com>',
      to: negotiation.sellerEmail,
      subject: `Action Required: Approve Sale`,
      html: `
        <h2>Sale Approval</h2>
        <p><strong>Item:</strong> ${itemTitle}</p>
        <p><strong>Payout:</strong> ₹${negotiation.finalPrice}</p>
        <br/>
        <a href="${sellerLink}" style="background-color:#16a34a;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">✅ APPROVE SALE</a>
      `
    });

    console.log(`✅ Emails sent successfully to ${negotiation.buyerEmail} & ${negotiation.sellerEmail}`);
    return true;

  } catch (error) {
    console.error("❌ EMAIL SENDING FAILED:", error);
    return false;
  }
};

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
        if (!resource) return res.status(404).json({ error: "Item not found" });

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

// --- 4. NEXT TURN (AI LOGIC) ---
router.post('/next-turn', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId);
        if (!negotiation) return res.status(404).json({ error: "Negotiation lost" });

        // STOP CONDITIONS
        if (['DEAL_CLOSED', 'FAILED', 'COMPLETED', 'CANCELLED_DISTANCE', 'TRANSPORT_AGREED', 'APPROVED', 'PAID'].includes(negotiation.status)) {
            if (negotiation.status === 'TRANSPORT_AGREED') {
                 const lastLog = negotiation.logs[negotiation.logs.length - 1];
                 if (!lastLog.message.includes("Waiting for User Confirmation")) {
                    negotiation.logs.push({ sender: 'SYSTEM', message: "Waiting for User Confirmation" });
                    await negotiation.save();
                 }
            }
            return res.json(negotiation);
        }

        if (negotiation.status === 'WAITING_FOR_APPROVAL') return res.json(negotiation);

        // LOGISTICS PHASE
        if (negotiation.status === 'PRICE_AGREED') {
            const logistics = calculateLogistics(negotiation.buyerLocation, "SellerHQ");
            
            if (logistics.distance > 20) {
                negotiation.status = 'CANCELLED_DISTANCE';
                negotiation.distanceKm = logistics.distance;
                negotiation.logs.push({ sender: 'SYSTEM', message: `DISTANCE ALERT: ${logistics.distance}km (>20km). Auto-Cancelling Deal.` });
                await negotiation.save();
                return res.json(negotiation);
            }

            negotiation.distanceKm = logistics.distance;
            negotiation.transportCost = logistics.transportCost;
            negotiation.status = 'TRANSPORT_NEGOTIATING';
            
            negotiation.logs.push({ sender: 'SYSTEM', message: `PHASE 2: LOGISTICS. Distance: ${logistics.distance}km. Standard Rate: ₹${logistics.transportCost}.` });
            negotiation.logs.push({ sender: 'SELLER_AGENT', message: `Delivery cost is ₹${logistics.transportCost} for ${logistics.distance}km. Shall we proceed?` });
            
            await negotiation.save();
            return res.json(negotiation);
        }

        const lastRelevantLog = negotiation.logs.slice().reverse().find(l => l.sender === 'BUYER_AGENT' || l.sender === 'SELLER_AGENT');
        const currentAgent = (!lastRelevantLog || lastRelevantLog.sender === 'SELLER_AGENT') ? 'BUYER_AGENT' : 'SELLER_AGENT';
        const isTransportPhase = negotiation.status === 'TRANSPORT_NEGOTIATING';

        let decision = null;

        try {
            if (!process.env.GEMINI_API_KEY || !GoogleGenerativeAI) throw new Error("No AI Config");
            
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            let phasePrompt = isTransportPhase 
                ? `PHASE: Logistics. Cost: ${negotiation.transportCost}. If Buyer, ask for discount or accept. If Seller, stick to price.`
                : `PHASE: Price. Current Ask: ${negotiation.currentSellerAsk}. Floor: ${negotiation.floorPrice}.`;

            const systemPrompt = `
                Act as ${currentAgent}.
                ${phasePrompt}
                Respond ONLY in JSON: { "action": "OFFER" | "ACCEPT" | "DECLINE", "price": number, "message": "string" }
                History: ${JSON.stringify(negotiation.logs.slice(-3))}
            `;

            const result = await model.generateContent(systemPrompt);
            const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            decision = JSON.parse(text);

        } catch (aiError) {
            // FALLBACK RULE ENGINE
            const stdCost = negotiation.transportCost || 0;
            if (isTransportPhase) {
                if (currentAgent === 'BUYER_AGENT') {
                    // 50% chance to accept immediately in fallback
                    decision = Math.random() > 0.5 
                        ? { action: "ACCEPT", price: stdCost, message: "Okay, I accept logistics." }
                        : { action: "OFFER", price: stdCost, message: "Can we get free delivery?" };
                } else {
                    decision = { action: "OFFER", price: stdCost, message: "Standard rates apply. Cannot discount." };
                }
            } else {
                const currentAsk = negotiation.currentSellerAsk || negotiation.initialPrice;
                if (currentAgent === 'BUYER_AGENT') decision = { action: "OFFER", price: Math.floor(currentAsk * 0.95), message: `I offer ₹${Math.floor(currentAsk * 0.95)}` };
                else decision = { action: "OFFER", price: currentAsk, message: `Price is ₹${currentAsk}` };
            }
        }

        if (!decision) decision = { action: "OFFER", price: negotiation.transportCost, message: "Proceeding..." };

        // SAVE TURN
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
                negotiation.totalValue = (negotiation.finalPrice || 0) + negotiation.transportCost;
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

// --- 5. SEND APPROVALS (The Endpoint Causing 500 Error) ---
router.post('/send-approvals', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        console.log(`📡 Request received to send emails for ID: ${negotiationId}`);

        const negotiation = await Negotiation.findById(negotiationId).populate('resourceId');
        
        if (!negotiation) {
            console.error("❌ Negotiation not found in DB");
            return res.status(404).json({ error: "Negotiation not found" });
        }

        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL';

        // ✅ URL Points to RENDER Backend
        const BACKEND_URL = "https://omni-circulus-backend.onrender.com";
        const buyerLink = `${BACKEND_URL}/api/gate/approve?id=${negotiation._id}&role=buyer`;
        const sellerLink = `${BACKEND_URL}/api/gate/approve?id=${negotiation._id}&role=seller`;

        // CALL THE INTERNAL FUNCTION
        const emailSuccess = await sendConfirmationEmails(negotiation, buyerLink, sellerLink);

        if (emailSuccess) {
            negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Sent. Waiting for parties..." });
            await negotiation.save();
            res.json({ success: true, message: "Emails Sent" });
        } else {
            console.error("❌ Email sending function returned false");
            res.status(500).json({ error: "Failed to send emails (Check server logs)" });
        }
    } catch (err) {
        console.error("❌ CRITICAL ERROR in /send-approvals:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- 6. VERIFY TRANSACTION ---
router.post('/verify-transaction', async (req, res) => {
    try {
        const { token, action, role } = req.body; 
        const negotiation = await Negotiation.findOne({ confirmationToken: token });
        if (!negotiation) return res.status(404).json({ error: "Invalid Token" });

        if (['DEAL_CLOSED', 'PAID'].includes(negotiation.status)) {
            return res.json({ success: true, status: 'ALREADY_CLOSED', negotiationId: negotiation._id });
        }

        if (action === 'reject') {
            negotiation.status = 'FAILED';
            negotiation.logs.push({ sender: 'SYSTEM', message: `Deal REJECTED by ${role}.` });
            await negotiation.save();
            return res.json({ success: true, status: 'REJECTED' });
        }

        if (role === 'buyer') negotiation.buyerApproval = 'APPROVED';
        if (role === 'seller') negotiation.sellerApproval = 'APPROVED';

        if (negotiation.buyerApproval === 'APPROVED' && negotiation.sellerApproval === 'APPROVED') {
            negotiation.status = 'APPROVED'; 
            negotiation.logs.push({ sender: 'SYSTEM', message: "Both parties APPROVED. Waiting for Payment." });
            await negotiation.save();
            return res.json({ success: true, status: 'APPROVED', negotiationId: negotiation._id });
        }

        await negotiation.save();
        res.json({ success: true, status: 'PENDING', negotiationId: negotiation._id });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 7. HISTORY ENDPOINT ---
router.get('/history/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const history = await Negotiation.find({ 
            buyerEmail: email, 
            status: { $in: ['DEAL_CLOSED', 'PAID', 'COMPLETED'] }
        })
        .sort({ updatedAt: -1 }) 
        .populate('resourceId'); 

        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;