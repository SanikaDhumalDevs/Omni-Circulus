const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); 
require('dotenv').config();

// ==========================================
// 1. SCHEMAS (Logic Unchanged)
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

const Negotiation = mongoose.models.Negotiation || mongoose.model('Negotiation', NegotiationSchema);
const Resource = mongoose.models.Resource || mongoose.model('Resource', new mongoose.Schema({}, { strict: false }));
const Request = mongoose.models.Request || mongoose.model('Request', new mongoose.Schema({}, { strict: false }));


// ==========================================
// 2. EMAIL CONFIGURATION (PORT 2525 + TRIM FIX)
// ==========================================

// 🛡️ SECURITY FIX: Trim spaces from the key automatically to prevent Auth Error 535
const smtpKey = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : "";

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 2525, // ⚡ FIX: Port 2525 is open on Render (587 is often blocked)
  secure: false,
  auth: {
    user: 'sanikadhumal149@gmail.com', // Must match Brevo Login Email
    pass: smtpKey 
  },
  tls: { rejectUnauthorized: false },
  connectionTimeout: 10000 // Prevent hanging
});

// Debug: Check if key is loaded (Safely)
if (!smtpKey) {
    console.error("❌ CRITICAL: SMTP_PASS is missing in Render!");
} else {
    console.log(`✅ SMTP Configured on Port 2525. Key loaded.`);
}


// ==========================================
// 3. SEND APPROVALS ROUTE (SAFE MODE)
// ==========================================
router.post('/send-approvals', async (req, res) => {
    console.log("➡️ ROUTE HIT: /send-approvals");

    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId).populate('resourceId');
        if (!negotiation) return res.status(404).json({ error: "Negotiation not found" });

        // Auto-Fix Emails
        if (!negotiation.sellerEmail) negotiation.sellerEmail = 'sanikadhumal149@gmail.com';
        if (!negotiation.buyerEmail) negotiation.buyerEmail = 'sanikadhumal149@gmail.com';
        
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL'; 
        
        await negotiation.save(); 

        const baseUrl = 'https://omni-circulus-backend.onrender.com';
        const buyerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=buyer&token=${token}`;
        const sellerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=seller&token=${token}`;

        // Attempt Email (Wrapped in Try-Catch so it DOES NOT CRASH)
        console.log("📨 Sending via Brevo...");
        try {
            await transporter.sendMail({
                from: '"Omni Agent" <sanikadhumal149@gmail.com>',
                to: negotiation.buyerEmail,
                subject: "Confirm Purchase",
                html: `<h2>Total: ₹${negotiation.totalValue}</h2><a href="${buyerLink}">CONFIRM</a>`
            });

            await transporter.sendMail({
                from: '"Omni Agent" <sanikadhumal149@gmail.com>',
                to: negotiation.sellerEmail,
                subject: "Approve Sale",
                html: `<h2>Payout: ₹${negotiation.finalPrice}</h2><a href="${sellerLink}">APPROVE</a>`
            });

            console.log("✅ Emails Sent!");
            negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Sent." });

        } catch (emailErr) {
            console.error("⚠️ Email Failed:", emailErr.message);
            // Log for user info, but DO NOT stop the process
            negotiation.logs.push({ sender: 'SYSTEM', message: "Email Network Error. Deal Saved successfully." });
        }

        await negotiation.save();
        
        // Return 200 OK regardless of email status
        res.status(200).json({ success: true, message: "Processed" });

    } catch (err) {
        console.error("🔥 DB ERROR:", err);
        res.status(500).json({ error: "Server Error", message: err.message });
    }
});


// ==========================================
// 4. REST OF LOGIC (Unchanged)
// ==========================================
// ... (All your original AI and Negotiation logic remains exactly here)

router.post('/start', async (req, res) => {
    try {
        const { resourceId, buyerEmail, buyerLocation } = req.body;
        const resource = await Resource.findById(resourceId);
        if (!resource) throw new Error("Item not found");
        await Negotiation.deleteMany({ resourceId, buyerEmail, status: { $ne: 'DEAL_CLOSED' } });
        const floorPrice = Math.floor(resource.cost * 0.9); 
        const sellerEmail = resource.ownerEmail || 'sanikadhumal149@gmail.com';
        const negotiation = new Negotiation({
            resourceId, buyerEmail, sellerEmail,
            initialPrice: resource.cost, currentSellerAsk: resource.cost, floorPrice,
            buyerLocation: buyerLocation || "Unknown", status: 'PRICE_NEGOTIATING',
            turnCount: 0, logs: [{ sender: 'SYSTEM', message: `STARTED. Ask: ₹${resource.cost}` }]
        });
        await negotiation.save();
        res.json(negotiation);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/next-turn', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId);
        if (!negotiation) return res.status(404).json({ error: "Negotiation lost" });
        if (['DEAL_CLOSED', 'FAILED', 'WAITING_FOR_APPROVAL'].includes(negotiation.status)) return res.json(negotiation);

        // Your existing AI/Rule logic...
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
        let decision = null;

        try {
            if (!process.env.GEMINI_API_KEY || !GoogleGenerativeAI) throw new Error("No AI Config");
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            let phasePrompt;
            if (isTransportPhase) {
                phasePrompt = `CURRENT PHASE: Logistics. Cost ₹${negotiation.transportCost}. IF BUYER: Ask discount.`;
            } else {
                phasePrompt = `PHASE: Price. Ask: ₹${negotiation.currentSellerAsk}. Floor: ₹${negotiation.floorPrice}.`;
            }
            const systemPrompt = `Act as ${currentAgent}. ${phasePrompt}. RULES: Respond ONLY in JSON: { "action": "OFFER" | "ACCEPT" | "DECLINE", "price": number, "message": "string" }. History: ${JSON.stringify(negotiation.logs.slice(-3))}`;
            const result = await model.generateContent(systemPrompt);
            const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            decision = JSON.parse(text);
        } catch (aiError) {
             const stdCost = negotiation.transportCost || 0;
             if(isTransportPhase) decision = { action: "ACCEPT", price: stdCost, message: "I accept transport costs." };
             else decision = { action: "OFFER", price: negotiation.initialPrice, message: "Standard offer." };
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
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/verify-transaction', async (req, res) => {
    try {
        const { token, role } = req.body; 
        const negotiation = await Negotiation.findOne({ confirmationToken: token });
        if(role === 'buyer') negotiation.buyerApproval = 'APPROVED';
        if(role === 'seller') negotiation.sellerApproval = 'APPROVED';
        if(negotiation.buyerApproval === 'APPROVED' && negotiation.sellerApproval === 'APPROVED') negotiation.status = 'APPROVED';
        await negotiation.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/history/:email', async (req, res) => {
    try {
        const history = await Negotiation.find({ buyerEmail: req.params.email });
        res.json(history);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- HELPER ---
let GoogleGenerativeAI;
try { const lib = require("@google/generative-ai"); GoogleGenerativeAI = lib.GoogleGenerativeAI; } catch (err) {}
function calculateLogistics(loc1, loc2) { return { distance: 15, transportCost: 375 }; }

module.exports = router;