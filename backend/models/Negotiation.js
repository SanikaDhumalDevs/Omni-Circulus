const mongoose = require('mongoose');

const NegotiationSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
  buyerEmail: { type: String, required: true },
  sellerEmail: { type: String, required: true },

  // --- STATE MANAGEMENT ---
  status: { 
    type: String, 
    enum: [
        'INITIATED',            
        'PRICE_NEGOTIATING',    
        'PRICE_AGREED',         
        'TRANSPORT_NEGOTIATING',
        'TRANSPORT_AGREED',
        'WAITING_FOR_APPROVAL',
        'APPROVED',             // <--- CRITICAL: Both approved, waiting for payment
        'PAID',                 // <--- CRITICAL: Paid, Gate Pass generated
        'DEAL_CLOSED',          // <--- Completed/Delivered
        'FAILED',               
        'CANCELLED',
        'CANCELLED_DISTANCE'
    ], 
    default: 'INITIATED' 
  },

  // --- PRICE DATA ---
  initialPrice: { type: Number, required: true }, 
  currentSellerAsk: { type: Number, default: 0 }, 
  currentBuyerOffer: { type: Number, default: 0 },       
  finalPrice: { type: Number, default: 0 }, 

  // --- LOGISTICS DATA ---
  buyerLocation: { type: String, default: "Unknown" }, 
  distanceKm: { type: Number, default: 0 },    
  transportCost: { type: Number, default: 0 }, 
  
  // The Grand Total (Item + Transport)
  totalValue: { type: Number, default: 0 },    

  // --- 💰 MONEY SPLIT (NEW) ---
  sellerPayout: { type: Number, default: 0 }, // 90%
  driverFee: { type: Number, default: 0 },    // 10%
  paymentStatus: { type: String, default: 'PENDING' },

  // --- VIRTUAL LOGISTICS FLEET ---
  logistics: {
    driverName: String,
    truckNumber: String,
    licensePlate: String,
    driverPhone: String,
    gatePassId: String,
    estimatedArrival: String
  },

  // --- APPROVAL DATA ---
  confirmationToken: { type: String }, 
  buyerApproval: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  sellerApproval: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },

  // --- SAFETY & HISTORY ---
  turnCount: { type: Number, default: 0 },
  maxTurns: { type: Number, default: 20 }, 
  logs: [
    {
      sender: { type: String, enum: ['BUYER_AGENT', 'SELLER_AGENT', 'SYSTEM'] },
      message: { type: String }, 
      offer: { type: Number },   
      timestamp: { type: Date, default: Date.now }
    }
  ],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Negotiation', NegotiationSchema);