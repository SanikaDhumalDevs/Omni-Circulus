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
  status: { type: String, default: 'INITIATED' },
  initialPrice: { type: Number, required: true }, 
  currentSellerAsk: { type: Number, default: 0 }, 
  currentBuyerOffer: { type: Number, default: 0 },       
  finalPrice: { type: Number, default: 0 }, 
  buyerLocation: { type: String, default: "Unknown" }, 
  distanceKm: { type: Number, default: 0 },    
  transportCost: { type: Number, default: 0 }, 
  totalValue: { type: Number, default: 0 },    
  confirmationToken: { type: String }, 
  buyerApproval: { type: String, default: 'PENDING' },
  sellerApproval: { type: String, default: 'PENDING' },
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
}, { strict: false });

const Negotiation = mongoose.models.Negotiation || mongoose.model('Negotiation', NegotiationSchema);
const Resource = mongoose.models.Resource || mongoose.model('Resource', new mongoose.Schema({}, { strict: false }));
const Request = mongoose.models.Request || mongoose.model('Request', new mongoose.Schema({}, { strict: false }));

// ==========================================
// 2. EMAIL CONFIG (WITH AUTO-FIX)
// ==========================================

// 🛡️ SECURITY FIX: Trim spaces from the key automatically
const smtpKey = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : "";

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587, // Standard Port
  secure: false,
  auth: {
    user: 'sanikadhumal149@gmail.com', // Must match Brevo Login Email
    pass: smtpKey // Using the trimmed key
  },
  tls: { rejectUnauthorized: false }
});

// Debug: Check if key is loaded (Safely)
if (!smtpKey) {
    console.error("❌ CRITICAL: SMTP_PASS is missing in Render!");
} else {
    console.log(`✅ SMTP Configured. Key length: ${smtpKey.length} chars.`);
}

// ==========================================
// 3. SEND APPROVALS ROUTE
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

        // Attempt Email
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
            // Detailed Logging for you
            if (emailErr.message.includes('535')) {
                console.error("❌ AUTH ERROR: The Key in Render is wrong or Brevo account is locked.");
                negotiation.logs.push({ sender: 'SYSTEM', message: "Email Auth Failed. Check Brevo Dashboard." });
            } else {
                negotiation.logs.push({ sender: 'SYSTEM', message: "Email Network Error. Deal Saved." });
            }
        }

        await negotiation.save();
        res.status(200).json({ success: true, message: "Processed" });

    } catch (err) {
        console.error("🔥 DB ERROR:", err);
        res.status(500).json({ error: "Server Error", message: err.message });
    }
});

// ==========================================
// 4. REST OF LOGIC (Unchanged)
// ==========================================
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

        // Simple Fallback Logic
        if (negotiation.status === 'PRICE_NEGOTIATING') {
            negotiation.status = 'PRICE_AGREED'; 
            negotiation.finalPrice = negotiation.initialPrice;
            negotiation.logs.push({sender:'SYSTEM', message:"Price Agreed."});
        } else if (negotiation.status === 'PRICE_AGREED') {
            negotiation.status = 'TRANSPORT_NEGOTIATING';
            negotiation.transportCost = 500;
            negotiation.totalValue = negotiation.finalPrice + 500;
            negotiation.logs.push({sender:'SYSTEM', message:"Transport Calculated."});
        } else if (negotiation.status === 'TRANSPORT_NEGOTIATING') {
            negotiation.status = 'TRANSPORT_AGREED';
            negotiation.logs.push({sender:'SYSTEM', message:"Waiting for User Confirmation"});
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

module.exports = router;