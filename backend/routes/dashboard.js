const router = require('express').Router();
const Negotiation = require('../models/Negotiation');
const Resource = require('../models/Resource');

// GET: /api/dashboard/stats?email=user@example.com
router.get('/stats', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: "Email required" });

        // --- 1. CASE-INSENSITIVE EMAIL MATCHING ---
        // This fixes the issue where "User@gmail.com" doesn't match "user@gmail.com"
        const emailRegex = new RegExp(`^${email}$`, 'i');

        // 1. FETCH RAW DATA
        const myInventory = await Resource.find({ ownerEmail: { $regex: emailRegex } });
        
        const sellingHistory = await Negotiation.find({ sellerEmail: { $regex: emailRegex } }).populate('resourceId');
        const buyingHistory = await Negotiation.find({ buyerEmail: { $regex: emailRegex } }).populate('resourceId');

        // 2. CALCULATE STATS
        let totalRevenue = 0;
        let totalSpent = 0;
        let activeMissions = 0;

        sellingHistory.forEach(deal => {
            if (deal.status === 'PAID_ESCROW' || deal.status === 'DEAL_CLOSED') {
                totalRevenue += (deal.finalPrice || 0);
            } else if (deal.status !== 'FAILED') {
                activeMissions++;
            }
        });

        buyingHistory.forEach(deal => {
            if (deal.status === 'PAID_ESCROW' || deal.status === 'DEAL_CLOSED') {
                totalSpent += (deal.totalValue || deal.finalPrice || 0);
            } else if (deal.status !== 'FAILED') {
                activeMissions++;
            }
        });

        // 3. FORMAT INVENTORY (Seller View)
        const inventoryData = myInventory.map(item => {
            const activeNeg = sellingHistory.find(n => 
                n.resourceId && 
                n.resourceId._id.toString() === item._id.toString() && 
                n.status !== 'DEAL_CLOSED' && 
                n.status !== 'FAILED' &&
                n.status !== 'PAID_ESCROW'
            );

            let status = 'AVAILABLE';
            if (item.status === 'Claimed') status = 'SOLD';
            else if (activeNeg) status = 'NEGOTIATING';

            return {
                id: item._id.toString(), // Ensure String for comparison
                title: item.title,
                quantity: item.quantity,
                price: item.cost,
                status: status
            };
        });

        // 4. FORMAT INCOMING SHIPMENTS (Buyer View)
        // This list determines which deals show up in the "Shipments" tab
        const validStatuses = ['DEAL_CLOSED', 'PAID_ESCROW', 'APPROVED', 'TRANSPORT_AGREED', 'WAITING_FOR_PAYMENT'];

        const incomingShipments = buyingHistory
            .filter(n => validStatuses.includes(n.status))
            .map(n => {
                // LOGIC MAP: Convert DB Status to UI Status
                let uiStatus = n.status;
                
                // Map older statuses if necessary
                if (n.status === 'DEAL_CLOSED') {
                    uiStatus = 'WAITING_PAYMENT'; 
                }

                return {
                    id: n._id.toString(), // <--- CRITICAL FIX: Ensure ID is a string for the Payment Modal match
                    title: n.resourceId ? n.resourceId.title : "Unknown Item", 
                    price: n.totalValue || n.finalPrice,
                    distance: n.distanceKm || "Local",
                    status: uiStatus,
                    // --- ADDED COST DETAILS FOR PAYMENT MODAL ---
                    itemCost: n.finalPrice,
                    transportCost: n.transportCost,
                    // Pass details if they exist (for Gate Pass)
                    truck: n.truck,
                    driver: n.driver
                };
            });

        res.json({
            stats: {
                revenue: totalRevenue,
                spend: totalSpent,
                active: activeMissions
            },
            inventory: inventoryData,
            shipments: incomingShipments
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;