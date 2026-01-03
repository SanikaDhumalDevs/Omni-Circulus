const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); 
require('dotenv').config();

// --- 🛠️ 1. SAFE MODEL LOADER ---
const getModel = (modelName) => {
    try {
        if (!mongoose.models[modelName]) throw new Error(`Model ${modelName} not found.`);
        return mongoose.model(modelName);
    } catch (e) {
        console.error(`❌ CRITICAL: ${e.message}`);
        return null; // Handle nulls in logic
    }
};

// --- 📧 2. EMAIL CONFIGURATION (GMAIL SERVICE) ---
const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: 'sanikadhumal149@gmail.com', 
    pass: 'kavgwoqdovdtsrmz' // Spaces removed
  }
});

// --- 📧 3. INTERNAL EMAIL SENDER ---
const sendConfirmationEmails = async (negotiation, buyerLink, sellerLink) => {
    // Validation
    if (!negotiation.buyerEmail || !negotiation.sellerEmail) {
        throw new Error(`Missing Emails. Buyer: ${negotiation.buyerEmail}, Seller: ${negotiation.sellerEmail}`);
    }

    const itemTitle = negotiation.resourceId?.title || "Resource";
    
    // Send Buyer Email
    await transporter.sendMail({
      from: '"Omni Agent" <sanikadhumal149@gmail.com>',
      to: negotiation.buyerEmail,
      subject: `Confirm Purchase: ${itemTitle}`,
      html: `<h2>Confirm Purchase</h2><p>Price: ${negotiation.totalValue}</p><a href="${buyerLink}">CONFIRM</a>`
    });

    // Send Seller Email
    await transporter.sendMail({
      from: '"Omni Agent" <sanikadhumal149@gmail.com>',
      to: negotiation.sellerEmail,
      subject: `Approve Sale: ${itemTitle}`,
      html: `<h2>Approve Sale</h2><p>Payout: ${negotiation.finalPrice}</p><a href="${sellerLink}">APPROVE</a>`
    });
    
    return true;
};

// --- 🚀 4. THE PROBLEMATIC ROUTE (FIXED) ---
router.post('/send-approvals', async (req, res) => {
    try {
        console.log("➡️ ROUTE HIT: /send-approvals");
        const { negotiationId } = req.body;
        
        // Load Models
        const Negotiation = getModel('Negotiation');
        if (!Negotiation) throw new Error("Database Model 'Negotiation' is not loaded.");

        // Find Deal
        const negotiation = await Negotiation.findById(negotiationId).populate('resourceId');
        if (!negotiation) throw new Error("Negotiation ID not found in database.");

        // Auto-Repair Missing Seller Email
        if (!negotiation.sellerEmail) {
            console.log("⚠️ Patching missing Seller Email...");
            negotiation.sellerEmail = 'sanikadhumal149@gmail.com'; 
            await negotiation.save();
        }

        // Generate Links
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL';
        
        const baseUrl = 'https://omni-circulus-backend.onrender.com';
        const buyerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=buyer`;
        const sellerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=seller`;

        console.log("📨 Sending Emails...");
        await sendConfirmationEmails(negotiation, buyerLink, sellerLink);
        console.log("✅ Emails Sent.");

        // Save Success State
        negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Sent." });
        await negotiation.save();
        
        res.status(200).json({ success: true, message: "Emails Sent" });

    } catch (err) {
        console.error("🔥 CRITICAL FAILURE:", err);
        
        // Revert State so user can try again
        try {
            const Negotiation = mongoose.model('Negotiation');
            await Negotiation.findByIdAndUpdate(req.body.negotiationId, { status: 'TRANSPORT_AGREED' });
        } catch (e) {}

        // SEND PLAIN TEXT ERROR SO YOU CAN SEE IT IN BROWSER
        res.status(500).send(`SERVER ERROR: ${err.message}`);
    }
});

// --- 5. OTHER ROUTES (STANDARD) ---

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
    } catch (err) { res.status(500).send(err.message); }
});

router.post('/next-turn', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const Negotiation = getModel('Negotiation');
        const negotiation = await Negotiation.findById(negotiationId);
        if (!negotiation) return res.status(404).send("No Deal");

        if (negotiation.status === 'TRANSPORT_AGREED') return res.json(negotiation);
        
        // SIMPLE LOGIC FALLBACK
        negotiation.turnCount = (negotiation.turnCount || 0) + 1;
        if (negotiation.status === 'PRICE_NEGOTIATING') {
            if (negotiation.turnCount > 2) {
                negotiation.status = 'PRICE_AGREED';
                negotiation.finalPrice = negotiation.currentSellerAsk;
                negotiation.logs.push({ sender: 'SYSTEM', message: 'Price Agreed' });
            } else {
                 negotiation.currentSellerAsk = Math.max(negotiation.floorPrice, negotiation.currentSellerAsk - 10);
                 negotiation.logs.push({ sender: 'SELLER_AGENT', message: `My price is ${negotiation.currentSellerAsk}`, offer: negotiation.currentSellerAsk });
            }
        } else if (negotiation.status === 'PRICE_AGREED') {
            negotiation.status = 'TRANSPORT_NEGOTIATING';
            negotiation.transportCost = 500;
            negotiation.distanceKm = 25;
            negotiation.logs.push({ sender: 'SYSTEM', message: 'Logistics Phase' });
        } else if (negotiation.status === 'TRANSPORT_NEGOTIATING') {
            negotiation.status = 'TRANSPORT_AGREED';
            negotiation.totalValue = (negotiation.finalPrice || 0) + 500;
            negotiation.logs.push({ sender: 'SYSTEM', message: 'Waiting for User Confirmation' });
        }

        await negotiation.save();
        res.json(negotiation);
    } catch (err) { res.status(500).send(err.message); }
});

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
    } catch (err) { res.status(500).send(err.message); }
});

router.get('/history/:email', async (req, res) => {
    try {
        const Negotiation = getModel('Negotiation');
        const history = await Negotiation.find({ buyerEmail: req.params.email }).populate('resourceId');
        res.json(history);
    } catch (err) { res.status(500).send(err.message); }
});

module.exports = router;