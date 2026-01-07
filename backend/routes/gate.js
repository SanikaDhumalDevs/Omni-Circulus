const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Negotiation = mongoose.model('Negotiation');

// --- 🛡️ SECURITY GUARD SCANNER ENDPOINT ---
router.post('/verify', async (req, res) => {
    try {
        const { qrData } = req.body; // The scanner sends the text it read
        
        console.log("👮 Guard Scanned:", qrData);

        if (!qrData) {
            return res.json({ valid: false, message: "NO DATA DETECTED" });
        }

        // 1. Check Database
        // We look for a deal where:
        // A) The 'logistics.gatePassId' matches the scan (e.g. "GP-928312")
        // B) OR the Deal ID matches (if the QR contains the raw ID)
        
        let query = { 'logistics.gatePassId': qrData };

        // If the scanned code looks like a MongoDB ID, checks that too
        if (mongoose.isValidObjectId(qrData)) {
            query = { $or: [{ _id: qrData }, { 'logistics.gatePassId': qrData }] };
        }

        const deal = await Negotiation.findOne(query);

        if (!deal) {
            return res.json({ 
                valid: false, 
                message: "❌ INVALID PASS: ID not found in system." 
            });
        }

        // 2. Check if Payment is Confirm
        // We allow 'PAID', 'COMPLETED', or 'APPROVED' (depending on your flow)
        if (deal.status !== 'PAID' && deal.status !== 'COMPLETED' && deal.status !== 'APPROVED') {
             return res.json({ 
                valid: false, 
                message: "⚠️ PAYMENT PENDING: Goods not released." 
            });
        }

        // 3. Success! Return Driver Details
        res.json({
            valid: true,
            message: "✅ ACCESS GRANTED",
            details: {
                driver: deal.logistics?.driverName || "Unknown",
                truck: deal.logistics?.truckNumber || "Unknown",
                item: "Industrial Material" 
            }
        });

    } catch (err) {
        console.error("Gate Error:", err);
        res.status(500).json({ error: "Server Error" });
    }
});

module.exports = router;
