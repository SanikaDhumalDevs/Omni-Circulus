const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const nodemailer = require('nodemailer'); // ✅ 1. Import Nodemailer directly
const crypto = require('crypto');
require('dotenv').config();

// --- IMPORT MODELS ---
const Negotiation = mongoose.model('Negotiation');
const Resource = mongoose.model('Resource');
const Request = mongoose.model('Request');

// --- 📧 2. EMAIL CONFIGURATION (Embedded) ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'sanikadhumal149@gmail.com', 
    pass: 'kavg woqd ovdt srmz' // App Password
  }
});

// --- 📧 3. EMAIL SENDER FUNCTION ---
const sendConfirmationEmails = async (negotiation, buyerLink, sellerLink) => {
  try {
    const itemTitle = negotiation.resourceId?.title || "Industrial Resource";
    const totalCost = negotiation.totalValue;

    // Buyer HTML
    const buyerHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
        <h2 style="color: #0891b2;">Action Required: Purchase Confirmation</h2>
        <p>The agent has negotiated a deal for <strong>${itemTitle}</strong>.</p>
        <div style="background: #f4f4f5; padding: 15px; margin: 15px 0;">
          <p><strong>Total Payable:</strong> ₹${totalCost}</p>
          <p><strong>Location:</strong> ${negotiation.buyerLocation}</p>
        </div>
        <p>Click below to finalize:</p>
        <a href="${buyerLink}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">✅ CONFIRM PURCHASE</a>
      </div>
    `;

    // Seller HTML
    const sellerHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
        <h2 style="color: #9333ea;">Action Required: Approve Sale</h2>
        <p>A buyer has been found for <strong>${itemTitle}</strong>.</p>
        <div style="background: #f4f4f5; padding: 15px; margin: 15px 0;">
          <p><strong>Net Payout:</strong> ₹${negotiation.finalPrice}</p>
        </div>
        <p>Click below to release stock:</p>
        <a href="${sellerLink}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">✅ APPROVE SALE</a>
      </div>
    `;

    // Send to Buyer
    await transporter.sendMail({
      from: '"Omni Agent" <sanikadhumal149@gmail.com>',
      to: negotiation.buyerEmail,
      subject: `Action Required: Confirm Purchase for ${itemTitle}`,
      html: buyerHtml
    });

    // Send to Seller
    await transporter.sendMail({
      from: '"Omni Agent" <sanikadhumal149@gmail.com>',
      to: negotiation.sellerEmail,
      subject: `Action Required: Approve Sale for ${itemTitle}`,
      html: sellerHtml
    });

    console.log(`✅ Emails sent to ${negotiation.buyerEmail} & ${negotiation.sellerEmail}`);
    return true;

  } catch (error) {
    console.error("❌ Email Service Error:", error);
    return false;
  }
};

// --- 4. SAFE AI LOADER ---
let GoogleGenerativeAI;
try {
    const lib = require("@google/generative-ai");
    GoogleGenerativeAI = lib.GoogleGenerativeAI;
} catch (err) {
    console.warn("⚠️ Google AI Lib missing. Using Simulation Mode.");
}

// --- 5. HELPER: LOGISTICS ---
function calculateLogistics(loc1, loc2) {
    const distance = Math.floor(Math.random() * 30) + 5; 
    const transportCost = distance * 25; 
    return { distance, transportCost };
}

// --- 6. START NEGOTIATION ---
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

// --- 7. NEXT TURN (THE BRAIN) ---
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

        // LOGISTICS CHECK
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

        // DETERMINE ACTOR
        const lastRelevantLog = negotiation.logs.slice().reverse().find(l => l.sender === 'BUYER_AGENT' || l.sender === 'SELLER_AGENT');
        const currentAgent = (!lastRelevantLog || lastRelevantLog.sender === 'SELLER_AGENT') ? 'BUYER_AGENT' : 'SELLER_AGENT';
        const isTransportPhase = negotiation.status === 'TRANSPORT_NEGOTIATING';

        // AI DECISION
        let decision = null;

        try {
            if (!process.env.GEMINI_API_KEY || !GoogleGenerativeAI) throw new Error("No AI Config");
            
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const systemPrompt = `
                Act as ${currentAgent}.
                Phase: ${isTransportPhase ? 'Logistics' : 'Price Negotiation'}.
                Cost: ${isTransportPhase ? negotiation.transportCost : negotiation.currentSellerAsk}.
                RULES: Respond ONLY in JSON: { "action": "OFFER" | "ACCEPT" | "DECLINE", "price": number, "message": "string" }
                History: ${JSON.stringify(negotiation.logs.slice(-3))}
            `;

            const result = await model.generateContent(systemPrompt);
            const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            decision = JSON.parse(text);

        } catch (aiError) {
            // FALLBACK LOGIC
            const stdCost = negotiation.transportCost || 0;
            if (isTransportPhase) {
                decision = { action: "ACCEPT", price: stdCost, message: "Agreed to logistics cost." };
            } else {
                const currentAsk = negotiation.currentSellerAsk || negotiation.initialPrice;
                if (currentAgent === 'BUYER_AGENT') {
                    decision = { action: "OFFER", price: Math.floor(currentAsk * 0.95), message: `I offer ₹${Math.floor(currentAsk * 0.95)}` };
                } else {
                    decision = { action: "OFFER", price: currentAsk, message: `My price is ₹${currentAsk}` };
                }
            }
        }

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
        }

        await negotiation.save();
        res.json(negotiation);

    } catch (err) {
        console.error("SERVER ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- 8. SEND APPROVALS (UPDATED FOR DEPLOYMENT) ---
router.post('/send-approvals', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId).populate('resourceId');
        
        if (!negotiation) return res.status(404).json({ error: "Negotiation not found" });

        // Generate Token
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL';
        
        // ✅ FIXED: Points to Render Backend API (Gate)
        // This ensures the link works even if frontend URL changes
        const BACKEND_URL = "https://omni-circulus-backend.onrender.com";
        const buyerLink = `${BACKEND_URL}/api/gate/approve?id=${negotiation._id}&role=buyer`;
        const sellerLink = `${BACKEND_URL}/api/gate/approve?id=${negotiation._id}&role=seller`;

        // Send Emails (Internal Function)
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

// --- 9. VERIFY TRANSACTION ---
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

// --- 10. HISTORY ---
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