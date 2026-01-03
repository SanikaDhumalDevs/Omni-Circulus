const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); 
require('dotenv').config();

// ==========================================
// 1. SAFE MODEL DEFINITIONS (Logic Intact)
// ==========================================
const ResourceSchema = new mongoose.Schema({}, { strict: false });
const Resource = mongoose.models.Resource || mongoose.model('Resource', ResourceSchema);

const RequestSchema = new mongoose.Schema({}, { strict: false });
const Request = mongoose.models.Request || mongoose.model('Request', RequestSchema);

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


// ==========================================
// 2. GMAIL CONFIGURATION (THE FIX IS HERE)
// ==========================================
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,              // Using SSL Port
  secure: true,           // True for 465
  auth: {
    user: 'sanikadhumal149@gmail.com',
    pass: 'kavgwoqdovdtsrmz' 
  },
  tls: {
    // Helps with "Self Signed" certificate errors on cloud
    rejectUnauthorized: false
  },
  // ⚠️ CRITICAL FIX: This prevents the ETIMEDOUT error
  // It forces the system to use IPv4 instead of IPv6
  family: 4 
});

// Test the email connection immediately when server starts
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ EMAIL CONNECTION FAILED:", error);
  } else {
    console.log("✅ EMAIL CONNECTION SUCCESSFUL (IPv4 Forced)");
  }
});


// ==========================================
// 3. THE EMAIL ROUTE (Logic Intact)
// ==========================================
router.post('/send-approvals', async (req, res) => {
    console.log("➡️ EMAIL ROUTE HIT. Step 1: Parsing Body");

    try {
        const { negotiationId } = req.body;
        
        console.log("Step 2: Finding Negotiation...");
        const negotiation = await Negotiation.findById(negotiationId);
        
        if (!negotiation) {
            console.error("❌ Negotiation ID invalid");
            return res.status(404).json({ error: "Negotiation ID not found" });
        }

        console.log("Step 3: Checking Emails...");
        if (!negotiation.sellerEmail) negotiation.sellerEmail = 'sanikadhumal149@gmail.com';
        if (!negotiation.buyerEmail) negotiation.buyerEmail = 'sanikadhumal149@gmail.com';
        
        await negotiation.save();

        console.log("Step 4: Generating Tokens...");
        const token = crypto.randomBytes(20).toString('hex');
        negotiation.confirmationToken = token;
        negotiation.status = 'WAITING_FOR_APPROVAL';

        const baseUrl = 'https://omni-circulus-backend.onrender.com';
        const buyerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=buyer&token=${token}`;
        const sellerLink = `${baseUrl}/api/gate/approve?id=${negotiation._id}&role=seller&token=${token}`;

        console.log(`Step 5: Attempting to send emails to ${negotiation.buyerEmail}...`);

        const mailOptionsBuyer = {
            from: '"Omni Agent" <sanikadhumal149@gmail.com>',
            to: negotiation.buyerEmail,
            subject: "Action Required: Confirm Purchase",
            html: `
                <div style="padding: 20px; background-color: #f0fdf4; border: 1px solid #22c55e;">
                    <h2>Purchase Confirmation</h2>
                    <p>Total Payable: <strong>₹${negotiation.totalValue}</strong></p>
                    <a href="${buyerLink}" style="background-color:#16a34a;color:white;padding:10px 20px;text-decoration:none;font-weight:bold;">CONFIRM NOW</a>
                </div>
            `
        };

        const mailOptionsSeller = {
            from: '"Omni Agent" <sanikadhumal149@gmail.com>',
            to: negotiation.sellerEmail,
            subject: "Action Required: Approve Sale",
            html: `
                <div style="padding: 20px; background-color: #f0fdf4; border: 1px solid #22c55e;">
                    <h2>Sale Approval</h2>
                    <p>Net Payout: <strong>₹${negotiation.finalPrice}</strong></p>
                    <a href="${sellerLink}" style="background-color:#16a34a;color:white;padding:10px 20px;text-decoration:none;font-weight:bold;">APPROVE NOW</a>
                </div>
            `
        };

        // Sending with explicit await to catch timeouts per-email
        await transporter.sendMail(mailOptionsBuyer);
        console.log("✅ Buyer Email Sent");
        
        await transporter.sendMail(mailOptionsSeller);
        console.log("✅ Seller Email Sent");

        negotiation.logs.push({ sender: 'SYSTEM', message: "Approval Emails Dispatched." });
        await negotiation.save();

        console.log("✅ PROCESS COMPLETE");
        res.status(200).json({ success: true, message: "Emails Sent" });

    } catch (err) {
        console.error("🔥 CRITICAL FAILURE AT STEP:", err);
        res.status(500).json({ 
            error: "SERVER_ERROR", 
            message: err.message, 
            stack: err.stack 
        });
    }
});


// ==========================================
// 4. REST OF YOUR LOGIC (Unchanged)
// ==========================================

let GoogleGenerativeAI;
try {
    const lib = require("@google/generative-ai");
    GoogleGenerativeAI = lib.GoogleGenerativeAI;
} catch (err) { console.warn("No AI Lib"); }

function calculateLogistics(loc1, loc2) {
    const distance = Math.floor(Math.random() * 30) + 5; 
    const transportCost = distance * 25; 
    return { distance, transportCost };
}

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

            const systemPrompt = `Act as ${currentAgent}. Phase: ${isTransportPhase ? 'Logistics' : 'Price'}. Respond ONLY in JSON: { "action": "OFFER" | "ACCEPT" | "DECLINE", "price": number, "message": "string" }. History: ${JSON.stringify(negotiation.logs.slice(-3))}`;
            
            const result = await model.generateContent(systemPrompt);
            const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            decision = JSON.parse(text);
        } catch (aiError) {
             const stdCost = negotiation.transportCost || 0;
             decision = { action: "OFFER", price: stdCost, message: "Proceeding with standard rates." };
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
        } 
        await negotiation.save();
        res.json(negotiation);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/verify-transaction', async (req, res) => {
    try {
        const { token, action, role } = req.body; 
        const negotiation = await Negotiation.findOne({ confirmationToken: token });
        if (!negotiation) return res.status(404).json({ error: "Invalid Token" });
        
        if (role === 'buyer') negotiation.buyerApproval = 'APPROVED';
        if (role === 'seller') negotiation.sellerApproval = 'APPROVED';

        if (negotiation.buyerApproval === 'APPROVED' && negotiation.sellerApproval === 'APPROVED') {
            negotiation.status = 'APPROVED'; 
        }
        await negotiation.save();
        res.json({ success: true, status: negotiation.status });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/confirm', async (req, res) => {
    try {
        const { negotiationId } = req.body;
        const negotiation = await Negotiation.findById(negotiationId);
        if (negotiation) {
            negotiation.status = 'DEAL_CLOSED';
            await negotiation.save();
            await Resource.findByIdAndUpdate(negotiation.resourceId, { status: 'Claimed' });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/history/:email', async (req, res) => {
    try {
        const history = await Negotiation.find({ buyerEmail: req.params.email, status: 'DEAL_CLOSED' });
        res.json(history);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;