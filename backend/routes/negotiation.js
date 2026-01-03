const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); 
require('dotenv').config();

// ==========================================
// 📧 1. EMAIL CONFIGURATION (Service: Gmail)
// ==========================================
const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: 'sanikadhumal149@gmail.com', 
    pass: 'kavgwoqdovdtsrmz' // ✅ Correct App Password (No Spaces)
  }
});

// --- CONNECTION TEST (Check Logs on Render) ---
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ EMAIL SERVICE ERROR:", error);
  } else {
    console.log("✅ EMAIL SERVICE READY");
  }
});

// ==========================================
// 🛠️ 2. SAFE MODEL LOADING
// ==========================================
// We access mongoose.models directly to avoid "MissingSchemaError"
const getNegotiationModel = () => {
    if (mongoose.models.Negotiation) {
        return mongoose.model('Negotiation');
    }
    throw new Error("Negotiation Model not loaded. Ensure server.js requires ./models/Negotiation");
};

// ==========================================
// 🚀 3. THE SEND APPROVALS ROUTE
// ==========================================
router.post('/send-approvals', async (req, res) => {
    console.log("➡️ ROUTE HIT: /send-approvals");

    try {
        const { negotiationId } = req.body;
        
        // 1. Load Model Safely
        const Negotiation = getNegotiationModel();

        // 2. Find Deal (populate to get item title)
        const negotiation = await Negotiation.findById(negotiationId).populate('resourceId');
        
        if (!negotiation) {
            return res.status(404).json({ error: "Negotiation ID not found" });
        }

        // 3. Auto-Fix Missing Emails (Prevents Crash)
        if (!negotiation.sellerEmail) {
            console.log("⚠️ Patching missing Seller Email");
            negotiation.sellerEmail = 'sanikadhumal149@gmail.com';
        }
        if (!negotiation.buyerEmail) {
            console.log("⚠️ Patching missing Buyer Email");
            negotiation.buyerEmail = 'sanikadhumal149@gmail.com';
        }
        
        // Save the patched emails first to ensure data integrity
        await negotiation.save();

        // 4. Generate Links
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL';

        const baseUrl = 'https://omni-circulus-backend.onrender.com';
        const buyerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=buyer`;
        const sellerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=seller`;

        const itemTitle = negotiation.resourceId?.title || "Resource";

        // 5. Send Emails
        console.log("📨 Dispatching Emails...");
        
        // Buyer Email
        await transporter.sendMail({
            from: '"Omni Agent" <sanikadhumal149@gmail.com>',
            to: negotiation.buyerEmail,
            subject: `Confirm Purchase: ${itemTitle}`,
            html: `<h2>Confirm Purchase</h2><p>Total: ₹${negotiation.totalValue}</p><a href="${buyerLink}">CONFIRM</a>`
        });

        // Seller Email
        await transporter.sendMail({
            from: '"Omni Agent" <sanikadhumal149@gmail.com>',
            to: negotiation.sellerEmail,
            subject: `Approve Sale: ${itemTitle}`,
            html: `<h2>Approve Sale</h2><p>Payout: ₹${negotiation.finalPrice}</p><a href="${sellerLink}">APPROVE</a>`
        });

        console.log("✅ Emails Sent Successfully");

        // 6. Update Logs & Save
        negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Sent." });
        await negotiation.save();

        res.status(200).json({ success: true, message: "Emails Sent" });

    } catch (err) {
        console.error("🔥 CRITICAL SERVER ERROR:", err);
        
        // If email failed, try to revert status
        try {
            const Negotiation = mongoose.models.Negotiation;
            if (Negotiation && req.body.negotiationId) {
                await Negotiation.findByIdAndUpdate(req.body.negotiationId, { status: 'TRANSPORT_AGREED' });
            }
        } catch (e) {}

        // RETURN THE ACTUAL ERROR MESSAGE SO YOU CAN SEE IT
        res.status(500).json({ 
            error: "SERVER_ERROR", 
            message: err.message || "Unknown Error",
            stack: err.stack
        });
    }
});

// ==========================================
// 🧩 4. OTHER ROUTES (Preserved Logic)
// ==========================================

// START
router.post('/start', async (req, res) => {
    try {
        const { resourceId, buyerEmail, buyerLocation } = req.body;
        const Resource = mongoose.model('Resource');
        const Negotiation = getNegotiationModel();
        
        const resource = await Resource.findById(resourceId);
        if (!resource) throw new Error("Item not found");

        await Negotiation.deleteMany({ resourceId, buyerEmail, status: { $ne: 'DEAL_CLOSED' } });

        const negotiation = new Negotiation({
            resourceId,
            buyerEmail,
            sellerEmail: resource.ownerEmail || 'sanikadhumal149@gmail.com',
            initialPrice: resource.cost,
            currentSellerAsk: resource.cost,
            floorPrice: Math.floor(resource.cost * 0.9),
            buyerLocation: buyerLocation || "Unknown",
            status: 'PRICE_NEGOTIATING',
            logs: [{ sender: 'SYSTEM', message: `Start: ${resource.title}` }]
        });
        await negotiation.save();
        res.json(negotiation);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEXT TURN
router.post('/next-turn', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const Negotiation = getNegotiationModel();
        const negotiation = await Negotiation.findById(negotiationId);
        if (!negotiation) return res.status(404).json({ error: "No Deal" });

        if (negotiation.status === 'TRANSPORT_AGREED') return res.json(negotiation);
        
        negotiation.turnCount = (negotiation.turnCount || 0) + 1;
        
        // LOGIC PRESERVED
        if (negotiation.status === 'PRICE_NEGOTIATING') {
            if (negotiation.turnCount > 2) {
                negotiation.status = 'PRICE_AGREED';
                negotiation.finalPrice = negotiation.currentSellerAsk;
                negotiation.logs.push({ sender: 'SYSTEM', message: 'Price Agreed' });
            } else {
                 negotiation.currentSellerAsk = Math.max(negotiation.floorPrice, negotiation.currentSellerAsk - 5);
                 negotiation.logs.push({ sender: 'SELLER_AGENT', message: `My price is ${negotiation.currentSellerAsk}`, offer: negotiation.currentSellerAsk });
            }
        } else if (negotiation.status === 'PRICE_AGREED') {
            negotiation.status = 'TRANSPORT_NEGOTIATING';
            negotiation.transportCost = 500;
            negotiation.distanceKm = 20;
            negotiation.logs.push({ sender: 'SYSTEM', message: 'Logistics Phase' });
        } else if (negotiation.status === 'TRANSPORT_NEGOTIATING') {
            negotiation.status = 'TRANSPORT_AGREED';
            negotiation.totalValue = (negotiation.finalPrice || 0) + 500;
            negotiation.logs.push({ sender: 'SYSTEM', message: 'Waiting for User Confirmation' });
        }

        await negotiation.save();
        res.json(negotiation);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// VERIFY
router.post('/verify-transaction', async (req, res) => {
    try {
        const { token, role } = req.body;
        const Negotiation = getNegotiationModel();
        const negotiation = await Negotiation.findOne({ confirmationToken: token });
        
        if (!negotiation) return res.status(404).json({ error: "Invalid" });
        
        if (role === 'buyer') negotiation.buyerApproval = 'APPROVED';
        if (role === 'seller') negotiation.sellerApproval = 'APPROVED';
        
        if (negotiation.buyerApproval === 'APPROVED' && negotiation.sellerApproval === 'APPROVED') {
            negotiation.status = 'APPROVED';
        }
        await negotiation.save();
        res.json({ success: true, status: negotiation.status });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// HISTORY
router.get('/history/:email', async (req, res) => {
    try {
        const Negotiation = getNegotiationModel();
        const history = await Negotiation.find({ buyerEmail: req.params.email }).populate('resourceId');
        res.json(history);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;