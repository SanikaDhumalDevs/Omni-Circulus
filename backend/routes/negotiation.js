const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); 
require('dotenv').config();

// ---------------------------------------------------------
// 1. IMPORT MODELS DIRECTLY (CRITICAL FIX)
// Check your folder structure. If models are in a 'models' folder:
// ---------------------------------------------------------
// NOTE: Ensure these paths match exactly where your files are located
const Negotiation = require('../models/Negotiation'); 
// You also use 'Resource' and 'Request' in your code, import them too!
// const Resource = require('../models/Resource'); 
// const Request = require('../models/Request');

// If you don't have a separate file for Resource/Request yet, 
// you must define them or import them here, otherwise the code will crash 
// when you try to access them in /start or /confirm.

// ---------------------------------------------------------
// 2. EMAIL CONFIGURATION (RENDER COMPATIBLE)
// ---------------------------------------------------------
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // Explicit host
  port: 465,              // Secure port for Cloud Servers
  secure: true,           // Use SSL
  auth: {
    user: 'sanikadhumal149@gmail.com', 
    pass: 'kavgwoqdovdtsrmz' // Ensure this App Password is correct
  }
});

// Verify connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ NODEMAILER ERROR:", error);
  } else {
    console.log("✅ NODEMAILER READY");
  }
});

// ---------------------------------------------------------
// 3. SEND EMAILS FUNCTION
// ---------------------------------------------------------
const sendConfirmationEmails = async (negotiation, buyerLink, sellerLink) => {
  console.log(`📨 Sending emails for Negotiation ID: ${negotiation._id}`);
  
  // Safely get title
  const itemTitle = negotiation.resourceId?.title || "Resource";
  
  // Send to Buyer
  await transporter.sendMail({
    from: '"Omni Supply Agent" <sanikadhumal149@gmail.com>',
    to: negotiation.buyerEmail,
    subject: `Action Required: Confirm Purchase for ${itemTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
        <h2 style="color: #0891b2;">Purchase Confirmation</h2>
        <p>Your agent has negotiated a deal for <strong>${itemTitle}</strong>.</p>
        <p><strong>Total Payable:</strong> ₹${negotiation.totalValue}</p>
        <p><strong>Destination:</strong> ${negotiation.buyerLocation}</p>
        <br/>
        <a href="${buyerLink}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">✅ CONFIRM PURCHASE</a>
        <p style="font-size: 12px; color: #666; margin-top: 20px;">Link valid for 24 hours.</p>
      </div>
    `
  });

  // Send to Seller
  await transporter.sendMail({
    from: '"Omni Supply Agent" <sanikadhumal149@gmail.com>',
    to: negotiation.sellerEmail,
    subject: `Action Required: Approve Sale for ${itemTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
        <h2 style="color: #7c3aed;">Sale Approval</h2>
        <p>An agent has found a buyer for <strong>${itemTitle}</strong>.</p>
        <p><strong>Net Payout:</strong> ₹${negotiation.finalPrice}</p>
        <br/>
        <a href="${sellerLink}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">✅ APPROVE SALE</a>
      </div>
    `
  });

  return true;
};

// ---------------------------------------------------------
// 4. THE ROUTE CAUSING ERROR 500
// ---------------------------------------------------------
router.post('/send-approvals', async (req, res) => {
    console.log("➡️ ROUTE HIT: /send-approvals");

    try {
        const { negotiationId } = req.body;
        
        // Use the explicitly imported model
        const negotiation = await Negotiation.findById(negotiationId).populate('resourceId');
        
        if (!negotiation) {
            console.error("❌ Negotiation not found in DB");
            return res.status(404).json({ error: "Negotiation ID not found" });
        }

        // Fallback for missing emails to prevent crash
        if (!negotiation.sellerEmail) negotiation.sellerEmail = 'sanikadhumal149@gmail.com';
        if (!negotiation.buyerEmail) negotiation.buyerEmail = 'sanikadhumal149@gmail.com';

        // Generate Token
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL';

        const baseUrl = 'https://omni-circulus-backend.onrender.com';
        const buyerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=buyer&token=${token}`; // Added token for security
        const sellerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=seller&token=${token}`;

        // Send Emails
        await sendConfirmationEmails(negotiation, buyerLink, sellerLink);

        // Save
        negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Dispatched. Waiting for parties..." });
        await negotiation.save();

        console.log("✅ Success: Emails sent.");
        res.status(200).json({ success: true, message: "Emails Sent" });

    } catch (err) {
        console.error("🔥 CRITICAL SERVER ERROR:", err);
        res.status(500).json({ 
            error: "SERVER_ERROR", 
            details: err.message 
        });
    }
});


// ---------------------------------------------------------
// REST OF YOUR ROUTES (Simplified for Context)
// ---------------------------------------------------------

// Start Negotiation
router.post('/start', async (req, res) => {
    try {
        // Ensure Resource model is imported at the top!
        // const Resource = require('../models/Resource'); 
        
        const { resourceId, buyerEmail, buyerLocation } = req.body;
        
        // USE mongoose.model IF you are sure it's loaded, otherwise use require()
        const Resource = mongoose.models.Resource || require('../models/Resource');

        const resource = await Resource.findById(resourceId);
        if (!resource) throw new Error("Item not found");

        // ... rest of your start logic ...
        // Just make sure you use 'Negotiation' (the variable imported at top)
        // NOT getModel('Negotiation')

        res.json({ status: 'INITIATED', /* ... data ... */ });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ... Keep your next-turn, verify-transaction, and history routes ...
// Just ensure you replace `const Negotiation = getModel('Negotiation')` 
// with the `Negotiation` variable imported at the top of the file.

module.exports = router;