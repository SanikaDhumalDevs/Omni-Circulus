const router = require('express').Router();
const Negotiation = require('../models/Negotiation');

// --- 🛡️ SECURITY GUARD SCANNER ENDPOINT ---
router.post('/verify', async (req, res) => {
    try {
        const { qrData } = req.body; // The scanner sends the text it read
        
        console.log("👮 Guard Scanned:", qrData);

        // 1. Check Database for this Gate Pass ID
        // We look for a deal where the 'logistics.gatePassId' matches the scan
        const deal = await Negotiation.findOne({ 
            'logistics.gatePassId': qrData 
        });

        if (!deal) {
            return res.json({ 
                valid: false, 
                message: "❌ INVALID PASS: ID not found in system." 
            });
        }

        // 2. Check if Payment is Confirm
        if (deal.status !== 'PAID' && deal.status !== 'COMPLETED') {
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
                driver: deal.logistics.driverName,
                truck: deal.logistics.truckNumber,
                item: "Industrial Material" // You can fetch item name if needed
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;