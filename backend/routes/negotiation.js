const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail'); 
require('dotenv').config();

// ==========================================
// 1. DEFINE SCHEMA (Safe for Localhost & Deployment)
// ==========================================
const NegotiationSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
  buyerEmail: { type: String, required: true },
  sellerEmail: { type: String, required: true },
  status: { 
    type: String, 
    enum: [
        'INITIATED', 'PRICE_NEGOTIATING', 'PRICE_AGREED', 'TRANSPORT_NEGOTIATING',
        'TRANSPORT_AGREED', 'WAITING_FOR_APPROVAL', 'APPROVED', 'PAID', 
        'DEAL_CLOSED', 'FAILED', 'CANCELLED', 'CANCELLED_DISTANCE'
    ], 
    default: 'INITIATED' 
  },
  initialPrice: { type: Number, required: true }, 
  currentSellerAsk: { type: Number, default: 0 }, 
  currentBuyerOffer: { type: Number, default: 0 },       
  finalPrice: { type: Number, default: 0 }, 
  buyerLocation: { type: String, default: "Unknown" }, 
  distanceKm: { type: Number, default: 0 },    
  transportCost: { type: Number, default: 0 }, 
  totalValue: { type: Number, default: 0 },    
  sellerPayout: { type: Number, default: 0 },
  driverFee: { type: Number, default: 0 },
  paymentStatus: { type: String, default: 'PENDING' },
  confirmationToken: { type: String }, 
  buyerApproval: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  sellerApproval: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  turnCount: { type: Number, default: 0 },
  logs: [{
      sender: { type: String },
      message: { type: String }, 
      offer: { type: Number },   
      timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Use existing model if available to prevent overwrite errors
const Negotiation = mongoose.models.Negotiation || mongoose.model('Negotiation', NegotiationSchema);
const Resource = mongoose.models.Resource || mongoose.model('Resource', new mongoose.Schema({}, { strict: false }));
const Request = mongoose.models.Request || mongoose.model('Request', new mongoose.Schema({}, { strict: false }));

// ==========================================
// 2. SENDGRID CONFIGURATION
// ==========================================
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log("✅ SENDGRID CONFIGURATION LOADED");
}

const VERIFIED_SENDER = 'sanikadhumal149@gmail.com'; 

// ==========================================
// 3. EMAIL HELPER FUNCTION
// ==========================================
const sendConfirmationEmails = async (negotiation, buyerLink, sellerLink) => {
  console.log(`📨 Sending emails via SendGrid...`);
  
  const itemTitle = negotiation.resourceId?.title || "Resource";

  const buyerMsg = {
    to: negotiation.buyerEmail,
    from: VERIFIED_SENDER, 
    subject: `Action Required: Confirm Purchase for ${itemTitle}`,
    html: `
      <h2>Purchase Confirmation</h2>
      <p><strong>Total Payable:</strong> ₹${negotiation.totalValue}</p>
      <p><strong>Location:</strong> ${negotiation.buyerLocation}</p>
      <br/>
      <a href="${buyerLink}" style="background-color:#16a34a;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">✅ CONFIRM PURCHASE</a>
    `
  };

  const sellerMsg = {
    to: negotiation.sellerEmail,
    from: VERIFIED_SENDER,
    subject: `Action Required: Approve Sale for ${itemTitle}`,
    html: `
      <h2>Sale Approval</h2>
      <p><strong>Net Payout:</strong> ₹${negotiation.finalPrice}</p>
      <br/>
      <a href="${sellerLink}" style="background-color:#16a34a;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">✅ APPROVE SALE</a>
    `
  };

  try {
      await sgMail.send(buyerMsg);
      await sgMail.send(sellerMsg);
      console.log(`✅ Emails sent successfully`);
      return true;
  } catch (error) {
      console.error("❌ SENDGRID ERROR:", error.response ? error.response.body : error.message);
      return false;
  }
};

// ==========================================
// 4. AI & LOGIC SETUP
// ==========================================
let GoogleGenerativeAI;
try {
    const lib = require("@google/generative-ai");
    GoogleGenerativeAI = lib.GoogleGenerativeAI;
} catch (err) { console.warn("⚠️ Google AI Lib missing."); }

function calculateLogistics(loc1, loc2) {
    const distance = Math.floor(Math.random() * 30) + 5; 
    const transportCost = distance * 25; 
    return { distance, transportCost };
}

// ==========================================
// 5. ROUTES
// ==========================================

// --- START ---
router.post('/start', async (req, res) => {
    try {
        const { resourceId, buyerEmail, buyerLocation } = req.body;
        
        const resource = await Resource.findById(resourceId);
        if (!resource) throw new Error("Item not found");

        await Negotiation.deleteMany({ resourceId, buyerEmail, status: { $ne: 'DEAL_CLOSED' } });

        const floorPrice = Math.floor(resource.cost * 0.9); 
        const sellerEmail = resource.ownerEmail || VERIFIED_SENDER;

        const negotiation = new Negotiation({
            resourceId,
            buyerEmail,
            sellerEmail: sellerEmail,
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

// --- NEXT TURN ---
router.post('/next-turn', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId);
        if (!negotiation) return res.status(404).json({ error: "Negotiation lost" });

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

        const lastLog = negotiation.logs[negotiation.logs.length - 1];
        if (lastLog && lastLog.message.includes("Waiting for User")) return res.json(negotiation);

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
            negotiation.logs.push({ sender: 'SELLER_AGENT', message: `The delivery cost is ₹${logistics.transportCost} for ${logistics.distance}km. Shall we proceed?` });
            
            await negotiation.save();
            return res.json(negotiation);
        }

        // AI LOGIC
        const lastRelevantLog = negotiation.logs.slice().reverse().find(l => l.sender === 'BUYER_AGENT' || l.sender === 'SELLER_AGENT');
        const currentAgent = (!lastRelevantLog || lastRelevantLog.sender === 'SELLER_AGENT') ? 'BUYER_AGENT' : 'SELLER_AGENT';
        const isTransportPhase = negotiation.status === 'TRANSPORT_NEGOTIATING';
        let decision = null;

        try {
            if (!process.env.GEMINI_API_KEY || !GoogleGenerativeAI) throw new Error("No AI Config");
            
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            let phasePrompt;
            if (isTransportPhase) {
                phasePrompt = `PHASE: Logistics. Standard Cost: ₹${negotiation.transportCost}. JSON 'price' must be TRANSPORT COST. IF BUYER: Accept if asked before. IF SELLER: No discounts.`;
            } else {
                phasePrompt = `PHASE: Price. Ask: ₹${negotiation.currentSellerAsk}. Floor: ₹${negotiation.floorPrice}.`;
            }

            const systemPrompt = `
                Act as ${currentAgent}. ${phasePrompt}
                Respond ONLY in JSON: { "action": "OFFER" | "ACCEPT" | "DECLINE", "price": number, "message": "string" }
                History: ${JSON.stringify(negotiation.logs.slice(-3))}
            `;

            const result = await model.generateContent(systemPrompt);
            const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            decision = JSON.parse(text);
        } catch (aiError) {
            const stdCost = negotiation.transportCost || 0;
            if (isTransportPhase) {
                if (currentAgent === 'BUYER_AGENT') decision = { action: "ACCEPT", price: stdCost, message: "Okay, I accept the delivery charges." };
                else decision = { action: "OFFER", price: stdCost, message: "Standard rates apply." };
            } else {
                 decision = { action: "OFFER", price: negotiation.currentSellerAsk, message: "Let's continue." };
            }
        }

        if (!decision) decision = { action: "OFFER", price: negotiation.transportCost, message: "Please proceed." };

        negotiation.turnCount = (negotiation.turnCount || 0) + 1;
        negotiation.logs.push({ sender: currentAgent, message: decision.message, offer: decision.price });

        if (!isTransportPhase && decision.action === 'OFFER') {
             if (currentAgent === 'BUYER_AGENT') negotiation.currentBuyerOffer = decision.price;
             else negotiation.currentSellerAsk = decision.price;
        }

        if (decision.action === 'ACCEPT') {
            if (!isTransportPhase) {
                negotiation.status = 'PRICE_AGREED';
                negotiation.finalPrice = decision.price;
                negotiation.logs.push({ sender: 'SYSTEM', message: `PRICE LOCKED at ₹${decision.price}.` });
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

// --- SEND APPROVALS (Updated for Localhost Testing) ---
router.post('/send-approvals', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        
        const negotiation = await Negotiation.findById(negotiationId).populate('resourceId');
        if (!negotiation) return res.status(404).json({ error: "Negotiation ID not found" });

        if (!negotiation.sellerEmail) negotiation.sellerEmail = VERIFIED_SENDER;
        if (!negotiation.buyerEmail) negotiation.buyerEmail = VERIFIED_SENDER;
        
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL'; 
        
        await negotiation.save(); 

        // ⚠️ CHANGE THIS: If testing locally, point to your React localhost port (usually 3000)
        // If deploying, change this to your Vercel URL
        const baseUrl = process.env.NODE_ENV === 'production' 
            ? 'https://omni-circulus.vercel.app' 
            : 'http://localhost:3000'; 
        
        const buyerLink = `${baseUrl}/confirm-deal?token=${token}&role=buyer`;
        const sellerLink = `${baseUrl}/confirm-deal?token=${token}&role=seller`;

        const success = await sendConfirmationEmails(negotiation, buyerLink, sellerLink);
        
        if (success) {
            negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Sent. Waiting for parties..." });
        } else {
            negotiation.logs.push({ sender: 'SYSTEM', message: "Email delivery failed." });
        }

        await negotiation.save();
        res.status(200).json({ success: true, message: "Emails Processed" });
    } catch (err) {
        console.error("🔥 SERVER ERROR:", err);
        res.status(500).json({ error: "SERVER_ERROR", message: err.message });
    }
});

// --- VERIFY TRANSACTION (FIXED: Network Error / CORS) ---
router.post('/verify-transaction', async (req, res) => {
    // 1. FORCE CORS HEADERS (Fixes "Network Error" across ports 3000 -> 5000)
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    try {
        const { token, action, role } = req.body; 
        
        // 2. Lookup Negotiation
        const negotiation = await Negotiation.findOne({ confirmationToken: token });
        if (!negotiation) {
            console.error("❌ Invalid Token");
            return res.status(404).json({ error: "Invalid Token" });
        }

        // 3. Handle 'Already Closed' (Prevents React crashes)
        if (['DEAL_CLOSED', 'PAID'].includes(negotiation.status)) {
            return res.json({ 
                success: true, 
                status: 'ALREADY_CLOSED', 
                message: "Deal already closed.", 
                negotiationId: negotiation._id 
            });
        }

        // 4. Handle Rejection
        if (action === 'reject') {
            negotiation.status = 'FAILED';
            negotiation.logs.push({ sender: 'SYSTEM', message: `Deal REJECTED by ${role}.` });
            await negotiation.save();
            return res.json({ success: true, status: 'REJECTED', negotiationId: negotiation._id });
        }

        // 5. Update Approvals
        if (role === 'buyer') negotiation.buyerApproval = 'APPROVED';
        if (role === 'seller') negotiation.sellerApproval = 'APPROVED';

        // 6. Check if BOTH have approved
        if (negotiation.buyerApproval === 'APPROVED' && negotiation.sellerApproval === 'APPROVED') {
            negotiation.status = 'APPROVED'; 
            negotiation.logs.push({ sender: 'SYSTEM', message: "Both parties APPROVED. Waiting for Payment." });
            await negotiation.save();

            console.log("✅ Deal fully APPROVED. Redirecting...");
            return res.json({ 
                success: true, 
                status: 'APPROVED', 
                negotiationId: negotiation._id // ID needed for Frontend Redirect
            });
        }

        await negotiation.save();
        console.log(`⏳ ${role} approved. Waiting for partner.`);

        // 7. Return PENDING Status
        res.json({ 
            success: true, 
            status: 'PENDING', 
            message: "Approval Recorded. Waiting for other party.", 
            negotiationId: negotiation._id 
        });

    } catch (err) {
        console.error("🔥 VERIFY ERROR:", err);
        // Return JSON error instead of crashing to prevent generic network error
        res.status(500).json({ error: err.message, message: "Database or Server Error" });
    }
});

// --- MANUAL CONFIRM ---
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

// --- HISTORY ---
router.get('/history/:email', async (req, res) => {
    try {
        const { email } = req.params;

        const history = await Negotiation.find({ 
            buyerEmail: email, 
            status: { $in: ['DEAL_CLOSED', 'PAID', 'COMPLETED'] }
        })
        .sort({ updatedAt: -1 }) 
        .populate('resourceId', 'title cost location'); 

        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
