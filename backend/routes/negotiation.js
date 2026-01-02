const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); 
require('dotenv').config();

// ==========================================
// 📧 1. EMAIL CONFIGURATION (RENDER COMPATIBLE)
// ==========================================
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,              // ✅ Port 587 is required for Render/Cloud
  secure: false,          // ✅ Must be false for Port 587
  auth: {
    user: 'sanikadhumal149@gmail.com', 
    pass: 'kavgwoqdovdtsrmz' // ✅ SPACES REMOVED
  },
  tls: {
    rejectUnauthorized: false // ✅ Fixes "Self Signed Certificate" errors on Render
  }
});

// Helper: Send Email
const sendConfirmationEmails = async (negotiation, buyerLink, sellerLink) => {
  try {
    console.log("📨 Sending emails via Port 587...");
    
    // Buyer Email
    await transporter.sendMail({
      from: '"Omni Agent" <sanikadhumal149@gmail.com>',
      to: negotiation.buyerEmail,
      subject: `Confirm Purchase: ${negotiation.resourceId?.title || 'Item'}`,
      html: `<h2>Confirm Purchase</h2><p>Total: ₹${negotiation.totalValue}</p><a href="${buyerLink}">CONFIRM</a>`
    });

    // Seller Email
    await transporter.sendMail({
      from: '"Omni Agent" <sanikadhumal149@gmail.com>',
      to: negotiation.sellerEmail,
      subject: `Approve Sale: ${negotiation.resourceId?.title || 'Item'}`,
      html: `<h2>Approve Sale</h2><p>Payout: ₹${negotiation.finalPrice}</p><a href="${sellerLink}">APPROVE</a>`
    });

    return true;
  } catch (error) {
    console.error("❌ NODEMAILER ERROR:", error);
    throw error; // Throw up to the main route to see the error
  }
};

// ==========================================
// 🛠️ 2. SAFE MODEL LOADER
// ==========================================
const getModel = (name) => {
    if (mongoose.models[name]) return mongoose.model(name);
    throw new Error(`CRITICAL: Model '${name}' has not been compiled. Make sure you require the model file in app.js`);
};

// ==========================================
// 🚀 3. THE PROBLEMATIC ROUTE (FIXED)
// ==========================================
router.post('/send-approvals', async (req, res) => {
    try {
        console.log("🔄 /send-approvals triggered...");
        const { negotiationId } = req.body;

        // 1. Check Model Availability
        const Negotiation = getModel('Negotiation');
        
        // 2. Find Deal
        const negotiation = await Negotiation.findById(negotiationId).populate('resourceId');
        if (!negotiation) return res.status(404).json({ error: "Negotiation ID not found in DB" });

        // 3. Auto-Fix Missing Emails (The most common cause of 500s)
        if (!negotiation.sellerEmail) {
            console.warn("⚠️ Missing Seller Email. Patching...");
            negotiation.sellerEmail = 'sanikadhumal149@gmail.com';
            await negotiation.save();
        }

        // 4. Generate Links
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL';
        
        const baseUrl = 'https://omni-circulus-backend.onrender.com';
        const buyerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=buyer`;
        const sellerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=seller`;

        // 5. Send Emails (With explicit error catching)
        await sendConfirmationEmails(negotiation, buyerLink, sellerLink);

        // 6. Success
        negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Sent." });
        await negotiation.save();
        res.json({ success: true, message: "Emails Dispatched Successfully" });

    } catch (err) {
        console.error("🔥 CRITICAL SERVER ERROR:", err);
        
        // REVERT STATE ON ERROR
        try {
            const Negotiation = mongoose.models.Negotiation;
            if (Negotiation && req.body.negotiationId) {
                await Negotiation.findByIdAndUpdate(req.body.negotiationId, { status: 'TRANSPORT_AGREED' });
            }
        } catch (e) { /* Ignore revert error */ }

        // SEND EXACT ERROR TO FRONTEND
        res.status(500).json({ 
            error: "SERVER_CRASH", 
            details: err.message, 
            stack: err.stack 
        });
    }
});

// ==========================================
// 🧩 4. OTHER ROUTES (KEPT STANDARD)
// ==========================================

// START
router.post('/start', async (req, res) => {
    try {
        const { resourceId, buyerEmail, buyerLocation } = req.body;
        const Resource = getModel('Resource');
        const Negotiation = getModel('Negotiation');
        
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
        // Simple passthrough to keep file small - logic handled by AI usually
        // Using basic fallback here to prevent crashes if AI fails
        const { negotiationId } = req.body;
        const Negotiation = getModel('Negotiation');
        const negotiation = await Negotiation.findById(negotiationId);
        if (!negotiation) return res.status(404).json({ error: "No Deal" });

        // Logic check
        if (negotiation.status === 'TRANSPORT_AGREED') return res.json(negotiation);
        
        // Basic Logic
        if (negotiation.status === 'PRICE_NEGOTIATING') {
            negotiation.turnCount = (negotiation.turnCount || 0) + 1;
            // Auto accept for testing if turns > 2
            if (negotiation.turnCount > 2) {
                negotiation.status = 'PRICE_AGREED';
                negotiation.finalPrice = negotiation.currentSellerAsk;
                negotiation.logs.push({ sender: 'SYSTEM', message: 'Price Agreed (Auto)' });
            } else {
                 negotiation.currentSellerAsk = Math.max(negotiation.floorPrice, negotiation.currentSellerAsk - 5);
                 negotiation.logs.push({ sender: 'SELLER_AGENT', message: `My price is ${negotiation.currentSellerAsk}`, offer: negotiation.currentSellerAsk });
            }
        } else if (negotiation.status === 'PRICE_AGREED') {
            negotiation.status = 'TRANSPORT_NEGOTIATING';
            negotiation.transportCost = 500;
            negotiation.distanceKm = 20;
            negotiation.logs.push({ sender: 'SYSTEM', message: 'Transport Phase' });
        } else if (negotiation.status === 'TRANSPORT_NEGOTIATING') {
            negotiation.status = 'TRANSPORT_AGREED';
            negotiation.totalValue = negotiation.finalPrice + negotiation.transportCost;
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
        const Negotiation = getModel('Negotiation');
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
        const Negotiation = getModel('Negotiation');
        const history = await Negotiation.find({ buyerEmail: req.params.email }).populate('resourceId');
        res.json(history);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;