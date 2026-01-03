const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); 
require('dotenv').config();

// ==========================================
// 1. DEFINE SCHEMAS
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
  logs: [{
      sender: { type: String },
      message: { type: String }, 
      offer: { type: Number },   
      timestamp: { type: Date, default: Date.now }
  }]
}, { strict: false });

const Negotiation = mongoose.models.Negotiation || mongoose.model('Negotiation', NegotiationSchema);
const Resource = mongoose.models.Resource || mongoose.model('Resource', new mongoose.Schema({}, { strict: false }));
const Request = mongoose.models.Request || mongoose.model('Request', new mongoose.Schema({}, { strict: false }));

// ==========================================
// 2. DEBUG & EMAIL CONFIG (PORT 2525)
// ==========================================

// Debug: Check if Key is loaded (Prints to Render Logs)
const keyStatus = process.env.SMTP_PASS ? `Loaded (Starts with ${process.env.SMTP_PASS.substring(0,5)}...)` : "MISSING ❌";
console.log("🔑 SMTP_PASS STATUS:", keyStatus);

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 2525, // ⚡ MAGIC FIX: Port 2525 often bypasses Cloud Firewalls
  secure: false, 
  auth: {
    user: 'sanikadhumal149@gmail.com', 
    pass: process.env.SMTP_PASS 
  },
  tls: { rejectUnauthorized: false },
  connectionTimeout: 10000 
});

// ==========================================
// 3. THE SAFE ROUTE
// ==========================================
router.post('/send-approvals', async (req, res) => {
    console.log("➡️ ROUTE HIT: /send-approvals");

    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId);
        if (!negotiation) return res.status(404).json({ error: "Negotiation not found" });

        // Generate Links
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL'; 
        await negotiation.save();

        const baseUrl = 'https://omni-circulus-backend.onrender.com';
        const buyerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=buyer&token=${token}`;
        const sellerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=seller&token=${token}`;

        // ATTEMPT EMAIL
        try {
            console.log("📨 Sending via Port 2525...");
            
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

            negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Sent." });
            console.log("✅ Emails Sent!");

        } catch (emailErr) {
            console.error("⚠️ Email Error:", emailErr.message);
            // DO NOT CRASH. Just log it.
            negotiation.logs.push({ sender: 'SYSTEM', message: "Email Failed (See Console), but Deal Saved." });
        }

        await negotiation.save();
        res.status(200).json({ success: true, message: "Done" });

    } catch (err) {
        console.error("🔥 DB ERROR:", err);
        res.status(500).json({ error: "Server Error", message: err.message });
    }
});

// ==========================================
// 4. LOGIC (Unchanged)
// ==========================================
router.post('/start', async (req, res) => {
    try {
        const { resourceId, buyerEmail, buyerLocation } = req.body;
        const resource = await Resource.findById(resourceId);
        const negotiation = new Negotiation({
            resourceId, buyerEmail, sellerEmail: resource?.ownerEmail || 'sanikadhumal149@gmail.com',
            initialPrice: resource?.cost || 1000, 
            status: 'PRICE_NEGOTIATING',
            logs: [{ sender: 'SYSTEM', message: "STARTED." }]
        });
        await negotiation.save();
        res.json(negotiation);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/next-turn', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId);
        
        // Basic Logic Flow fallback
        if(negotiation.status === 'PRICE_NEGOTIATING') {
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