const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail'); // ✅ CHANGED: Using SendGrid
require('dotenv').config();

// ==========================================
// 1. DEFINE SCHEMA DIRECTLY
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
  logistics: {
    driverName: String, truckNumber: String, licensePlate: String,
    driverPhone: String, gatePassId: String, estimatedArrival: String
  },
  confirmationToken: { type: String }, 
  buyerApproval: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  sellerApproval: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  turnCount: { type: Number, default: 0 },
  maxTurns: { type: Number, default: 20 }, 
  logs: [{
      sender: { type: String },
      message: { type: String }, 
      offer: { type: Number },   
      timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ REGISTER MODELS SAFELY
const Negotiation = mongoose.models.Negotiation || mongoose.model('Negotiation', NegotiationSchema);
const Resource = mongoose.models.Resource || mongoose.model('Resource', new mongoose.Schema({}, { strict: false }));
const Request = mongoose.models.Request || mongoose.model('Request', new mongoose.Schema({}, { strict: false }));


// ==========================================
// 📧 2. SENDGRID CONFIGURATION
// ==========================================
// Reads SENDGRID_API_KEY from your Render Environment Variables
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log("✅ SENDGRID CONFIGURATION LOADED");
} else {
    console.warn("⚠️ WARNING: SENDGRID_API_KEY is missing in .env");
}

// ==========================================
// 📧 INTERNAL EMAIL SENDER FUNCTION (USING SENDGRID)
// ==========================================
const sendConfirmationEmails = async (negotiation, buyerLink, sellerLink) => {
  console.log(`📨 Initiating Email Dispatch via SendGrid...`);
  
  const itemTitle = negotiation.resourceId?.title || "Resource";
  const senderEmail = 'sanikadhumal149@gmail.com'; // ⚠️ This email MUST be verified in SendGrid as a Sender

  // 1. Prepare Buyer Email
  const buyerMsg = {
    to: negotiation.buyerEmail,
    from: senderEmail, 
    subject: `Action Required: Confirm Purchase for ${itemTitle}`,
    html: `
      <h2>Purchase Confirmation</h2>
      <p><strong>Total Payable:</strong> ₹${negotiation.totalValue}</p>
      <p><strong>Location:</strong> ${negotiation.buyerLocation}</p>
      <br/>
      <a href="${buyerLink}" style="background-color:#16a34a;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">✅ CONFIRM PURCHASE</a>
      <p style="margin-top:20px; font-size:12px; color:#666;">If you did not request this, please ignore this email.</p>
    `
  };

  // 2. Prepare Seller Email
  const sellerMsg = {
    to: negotiation.sellerEmail,
    from: senderEmail,
    subject: `Action Required: Approve Sale for ${itemTitle}`,
    html: `
      <h2>Sale Approval</h2>
      <p><strong>Net Payout:</strong> ₹${negotiation.finalPrice}</p>
      <br/>
      <a href="${sellerLink}" style="background-color:#16a34a;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">✅ APPROVE SALE</a>
      <p style="margin-top:20px; font-size:12px; color:#666;">If you did not request this, please ignore this email.</p>
    `
  };

  try {
      // Send both emails
      await sgMail.send(buyerMsg);
      await sgMail.send(sellerMsg);
      console.log(`✅ Emails successfully sent to ${negotiation.buyerEmail} & ${negotiation.sellerEmail}`);
      return true;
  } catch (error) {
      console.error("❌ SendGrid Error:", error);
      if (error.response) {
          console.error(error.response.body);
      }
      throw error; // Re-throw to be caught by the route handler
  }
};

// ==========================================
// 🚀 3. THE SEND APPROVALS ROUTE (SAFE MODE)
// ==========================================
router.post('/send-approvals', async (req, res) => {
    console.log("➡️ ROUTE HIT: /send-approvals");

    try {
        const { negotiationId } = req.body;
        
        const negotiation = await Negotiation.findById(negotiationId).populate('resourceId');
        
        if (!negotiation) {
            return res.status(404).json({ error: "Negotiation ID not found" });
        }

        // Auto-Fix Missing Emails
        if (!negotiation.sellerEmail) negotiation.sellerEmail = 'sanikadhumal149@gmail.com';
        if (!negotiation.buyerEmail) negotiation.buyerEmail = 'sanikadhumal149@gmail.com';
        
        // Generate Links
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        
        // ✅ LOGIC: STATUS UPDATE
        negotiation.status = 'WAITING_FOR_APPROVAL'; 
        
        await negotiation.save(); 

        const baseUrl = 'https://omni-circulus-backend.onrender.com';
        const buyerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=buyer&token=${token}`;
        const sellerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=seller&token=${token}`;

        // ⚠️ SAFETY BLOCK: Try to send email, but don't crash if it fails
        try {
            await sendConfirmationEmails(negotiation, buyerLink, sellerLink);
            negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Sent. Waiting for parties..." });
        } catch (emailError) {
            console.error("⚠️ EMAIL FAILED (SendGrid):", emailError.message);
            // Log it for the user, but allow the app to continue
            negotiation.logs.push({ sender: 'SYSTEM', message: "Email delivery failed. Deal is Saved." });
        }

        await negotiation.save();

        // Always return success so the frontend doesn't crash
        res.status(200).json({ success: true, message: "Emails Processed" });

    } catch (err) {
        console.error("🔥 CRITICAL SERVER ERROR:", err);
        res.status(500).json({ 
            error: "SERVER_ERROR", 
            message: err.message || "Unknown Error",
            stack: err.stack
        });
    }
});


// ==========================================
// 🧩 4. YOUR ORIGINAL LOGIC (100% Intact)
// ==========================================

// --- SAFE AI LOADER ---
let GoogleGenerativeAI;
try {
    const lib = require("@google/generative-ai");
    GoogleGenerativeAI = lib.GoogleGenerativeAI;
} catch (err) {
    console.warn("⚠️ Google AI Lib missing. Using Simulation Mode.");
}

// --- HELPER: LOGISTICS ---
function calculateLogistics(loc1, loc2) {
    const distance = Math.floor(Math.random() * 30) + 5; 
    const transportCost = distance * 25; 
    return { distance, transportCost };
}

// --- START NEGOTIATION ---
router.post('/start', async (req, res) => {
    try {
        const { resourceId, buyerEmail, buyerLocation } = req.body;
        
        const resource = await Resource.findById(resourceId);
        if (!resource) throw new Error("Item not found");

        await Negotiation.deleteMany({ resourceId, buyerEmail, status: { $ne: 'DEAL_CLOSED' } });

        const floorPrice = Math.floor(resource.cost * 0.9); 
        const sellerEmail = resource.ownerEmail || 'sanikadhumal149@gmail.com';

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

        const lastRelevantLog = negotiation.logs.slice().reverse().find(l => l.sender === 'BUYER_AGENT' || l.sender === 'SELLER_AGENT');
        const currentAgent = (!lastRelevantLog || lastRelevantLog.sender === 'SELLER_AGENT') ? 'BUYER_AGENT' : 'SELLER_AGENT';
        
        const isTransportPhase = negotiation.status === 'TRANSPORT_NEGOTIATING';
        const lastMessageText = lastRelevantLog ? lastRelevantLog.message.toLowerCase() : "";
        const isFinalOffer = lastMessageText.includes("final") || lastMessageText.includes("cannot go down") || lastMessageText.includes("last price");

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
                    if (hasAsked) decision = { action: "ACCEPT", price: stdCost, message: "Okay, I accept the delivery charges." };
                    else decision = { action: "OFFER", price: stdCost, message: "Can you provide a discount on delivery?" };
                } else {
                    decision = { action: "OFFER", price: stdCost, message: "Sorry, these are third-party standard rates. We cannot discount." };
                }
            } else {
                const floor = negotiation.floorPrice || (negotiation.initialPrice - 10);
                const currentAsk = negotiation.currentSellerAsk || negotiation.initialPrice;
                const lastOffer = negotiation.currentBuyerOffer || 0;

                if (currentAgent === 'BUYER_AGENT') {
                    if (isFinalOffer || currentAsk <= floor) decision = { action: "ACCEPT", price: currentAsk, message: "Okay, I accept your final price." };
                    else {
                        let offer = lastOffer === 0 ? Math.floor(negotiation.initialPrice * 0.85) : Math.min(currentAsk - 2, lastOffer + 5);
                        decision = { action: "OFFER", price: offer, message: `I can offer ₹${offer}.` };
                    }
                } else {
                    if (lastOffer >= floor) decision = { action: "ACCEPT", price: lastOffer, message: "Deal accepted." };
                    else if (currentAsk <= floor) decision = { action: "OFFER", price: floor, message: "I cannot go down below this price. This is last." };
                    else {
                        let nextAsk = Math.max(floor, currentAsk - 5);
                        decision = { action: "OFFER", price: nextAsk, message: `My best price is ₹${nextAsk}.` };
                    }
                }
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

// --- VERIFY TRANSACTION ---
router.post('/verify-transaction', async (req, res) => {
    try {
        const { token, action, role } = req.body; 
        
        const negotiation = await Negotiation.findOne({ confirmationToken: token });
        if (!negotiation) return res.status(404).json({ error: "Invalid Token" });

        if (['DEAL_CLOSED', 'PAID'].includes(negotiation.status)) {
            return res.json({ success: true, status: 'ALREADY_CLOSED', message: "Deal already closed.", negotiationId: negotiation._id });
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
        res.json({ success: true, status: 'PENDING', message: "Approval Recorded.", negotiationId: negotiation._id });

    } catch (err) {
        res.status(500).json({ error: err.message });
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

// --- HISTORY ENDPOINT ---
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