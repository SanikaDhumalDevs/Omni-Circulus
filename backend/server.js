const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// --- IMPORT MODELS TO ENSURE THEY ARE REGISTERED ---
require('./models/Resource'); 
require('./models/Negotiation');
require('./models/Request');

const resourceRoutes = require('./routes/resourceRoutes');
const agentRoutes = require('./routes/agentRoutes');
const authRoute = require('./routes/auth');
const negotiationRoute = require('./routes/negotiation');
const dashboardRoute = require('./routes/dashboard');
const gateRoute = require('./routes/gate');
const replayRoute = require('./routes/replay'); 

const app = express();

// --- ⚠️ CRITICAL FIX FOR IMAGES: INCREASE PAYLOAD LIMIT ---
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- ✅ FIX FOR MOBILE & VERCEL CONNECTION (CORS) ---
app.use(cors({
    origin: '*',  // This allows ALL devices (Mobile, Laptop, Vercel)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// --- 🚚 VIRTUAL LOGISTICS FLEET ---
const VIRTUAL_FLEET = [
  { name: "Rajesh Kumar", truck: "Tata Signa 4018", plate: "MH-12-AB-9988", phone: "+91-98765-43210" },
  { name: "Vikram Singh", truck: "Ashok Leyland Ecomet", plate: "DL-01-CA-4421", phone: "+91-99887-77665" },
  { name: "Suresh Patil", truck: "BharatBenz 1923C", plate: "KA-05-MJ-1002", phone: "+91-88776-65544" },
  { name: "Amit Verma", truck: "Mahindra Blazo X", plate: "UP-32-DN-5566", phone: "+91-77665-54433" }
];

// --- 💰 CUSTOM ESCROW ROUTES ---

// 1. PAYMENT & MONEY SPLIT ENDPOINT
app.post('/api/transaction/pay', async (req, res) => {
  try {
    const { negotiationId } = req.body;
    console.log(`💳 Processing Payment for Order: ${negotiationId}`);

    // Simulate Bank Delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // A. Pick a Random Driver
    const driver = VIRTUAL_FLEET[Math.floor(Math.random() * VIRTUAL_FLEET.length)];
    
    // B. Generate Gate Pass ID
    const gatePassId = "GP-" + Math.floor(100000 + Math.random() * 900000);

    const Negotiation = mongoose.model('Negotiation');
    const Resource = mongoose.model('Resource');

    // D. Fetch Current Deal
    const currentDeal = await Negotiation.findById(negotiationId);
    if (!currentDeal) return res.status(404).json({ error: "Deal not found" });

    // --- 💰 MONEY SPLIT LOGIC ---
    const sellerShare = currentDeal.finalPrice;       
    const driverShare = currentDeal.transportCost;    

    // E. Update Database
    const updatedDeal = await Negotiation.findByIdAndUpdate(negotiationId, {
      status: 'PAID', 
      paymentStatus: 'COMPLETED',
      sellerPayout: sellerShare, 
      driverFee: driverShare,    
      logistics: {
        driverName: driver.name,
        truckNumber: driver.truck,
        licensePlate: driver.plate,
        driverPhone: driver.phone,
        gatePassId: gatePassId,
        estimatedArrival: "4 Hours"
      }
    }, { new: true });

    // F. Mark Resource as SOLD
    if(updatedDeal && updatedDeal.resourceId) {
      await Resource.findByIdAndUpdate(updatedDeal.resourceId, { status: 'SOLD' });
    }

    res.json({ success: true, deal: updatedDeal });

  } catch (err) {
    console.error("Payment Error:", err);
    res.status(500).json({ error: "Payment Gateway Failed" });
  }
});

// 2. DASHBOARD OVERRIDE 
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const { email } = req.query;
    const Negotiation = mongoose.model('Negotiation');
    const Resource = mongoose.model('Resource');

    // 1. Inventory
    const inventory = await Resource.find({ ownerEmail: email }); 
    
    // 2. Buying (Incoming)
    const buying = await Negotiation.find({ 
      buyerEmail: email,
      status: { $in: ['APPROVED', 'PAID', 'COMPLETED'] } 
    }).populate('resourceId');

    const shipments = buying.map(n => ({
      id: n._id,
      title: n.resourceId?.title || "Unknown Item",
      price: n.totalValue,
      itemCost: n.finalPrice,
      transportCost: n.transportCost,
      distance: n.distanceKm,
      status: n.status, 
      logistics: n.logistics || {} 
    }));

    // 3. Selling (Outgoing)
    const selling = await Negotiation.find({ 
      sellerEmail: email,
      status: { $in: ['APPROVED', 'PAID', 'COMPLETED'] } 
    }).populate('resourceId');

    const sales = selling.map(n => ({
      id: n._id,
      title: n.resourceId?.title || "Unknown Item",
      price: n.totalValue, 
      payout: n.finalPrice, 
      status: n.status,
      itemCost: n.finalPrice,     
      transportCost: n.transportCost, 
      logistics: n.logistics || {}
    }));

    // Stats
    const soldItems = await Negotiation.find({ sellerEmail: email, status: { $in: ['PAID', 'COMPLETED'] } });
    const revenue = soldItems.reduce((acc, item) => acc + (item.finalPrice || 0), 0);
    const spend = buying.reduce((acc, item) => acc + (item.totalValue || 0), 0);

    res.json({
      stats: { revenue, spend, active: buying.length + selling.length },
      inventory,
      shipments, 
      sales      
    });
  } catch (err) {
    console.error("Dashboard Logic Error:", err);
    res.json({ stats: { revenue: 0, spend: 0, active: 0 }, inventory: [], shipments: [], sales: [] });
  }
});

// --- EXISTING ROUTES ---
app.use('/api/gate', gateRoute);
app.use('/api/resources', resourceRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/negotiate', negotiationRoute);
app.use('/api/dashboard', dashboardRoute); 
app.use('/api/auth', authRoute);
app.use('/api/replay', replayRoute); 

// --- CONNECT TO DATABASE ---
const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/omni-circulus';

mongoose.connect(mongoURI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});