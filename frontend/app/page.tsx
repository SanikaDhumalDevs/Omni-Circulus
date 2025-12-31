'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toPng } from 'html-to-image'; 
import jsPDF from 'jspdf';
import ReplayModal from './components/ReplayModal'; 

// --- CONFIGURATION: LOCALHOST ---
const API_BASE_URL = 'http://localhost:5000'; 

// --- MODALS ---

// 1. PAYMENT MODAL
const PaymentModal = ({ order, onClose, onConfirm, processing }: any) => (
  <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in-95">
    <div className="bg-slate-900 border border-cyan-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/20 rounded-full blur-3xl"></div>
      
      <h3 className="text-xl font-bold text-white mb-1 tracking-wider">SECURE PAYMENT</h3>
      <p className="text-xs text-slate-400 mb-6 uppercase tracking-widest">Escrow Protection Enabled</p>
      
      <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400">Item Cost</span>
          <span className="text-white font-mono">₹{order.itemCost || 0}</span>
        </div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400">Logistics Fee</span>
          <span className="text-white font-mono">₹{order.transportCost || 0}</span>
        </div>
        <div className="h-px bg-white/10 my-2"></div>
        <div className="flex justify-between text-lg font-bold">
          <span className="text-cyan-400">TOTAL</span>
          <span className="text-white font-mono">₹{order.price}</span>
        </div>
      </div>

      <div className="space-y-4">
        <div>
           <label className="text-[10px] uppercase text-slate-500 font-bold">Card Number</label>
           <input type="text" placeholder="4242 4242 4242 4242" className="w-full bg-black/50 border border-slate-700 rounded-lg px-4 py-2 text-white font-mono focus:border-cyan-500 outline-none" />
        </div>
        <div className="flex gap-4">
           <div className="flex-1">
             <label className="text-[10px] uppercase text-slate-500 font-bold">Expiry</label>
             <input type="text" placeholder="MM/YY" className="w-full bg-black/50 border border-slate-700 rounded-lg px-4 py-2 text-white font-mono focus:border-cyan-500 outline-none" />
           </div>
           <div className="flex-1">
             <label className="text-[10px] uppercase text-slate-500 font-bold">CVV</label>
             <input type="text" placeholder="123" className="w-full bg-black/50 border border-slate-700 rounded-lg px-4 py-2 text-white font-mono focus:border-cyan-500 outline-none" />
           </div>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 text-xs font-bold text-slate-400 hover:text-white transition">CANCEL</button>
        <button 
          onClick={onConfirm} 
          disabled={processing}
          className="flex-1 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-bold rounded-lg tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] transition-all disabled:opacity-50 flex justify-center items-center gap-2"
        >
          {processing ? <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></span> : "PAY NOW"}
        </button>
      </div>
    </div>
  </div>
);

// 2. GATE PASS MODAL
const GatePassModal = ({ order, onClose }: any) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const element = document.getElementById('gate-pass-card'); 
    if (!element) {
        console.error("Element not found");
        setDownloading(false);
        return;
    }

    try {
      const dataUrl = await toPng(element, { cacheBust: true, backgroundColor: '#ffffff' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`OMNI-PASS-${order.logistics?.gatePassId || '001'}.pdf`);
    } catch (err) {
      console.error("PDF Error:", err);
      alert("Could not generate PDF.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in zoom-in-95">
      <div id="gate-pass-card" className="bg-white text-black w-full max-w-sm rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(255,255,255,0.2)] relative">
         <div className="bg-slate-900 text-white p-6 text-center">
            <h2 className="text-xl font-black tracking-widest">OMNI PASS</h2>
            <p className="text-[10px] text-cyan-400 uppercase tracking-[0.3em]">Gate Access Control</p>
         </div>

         <div className="p-8 flex flex-col items-center border-b border-dashed border-slate-300 relative">
            <div className="absolute -left-3 bottom-0 w-6 h-6 bg-slate-900 rounded-full"></div>
            <div className="absolute -right-3 bottom-0 w-6 h-6 bg-slate-900 rounded-full"></div>
            
            <div className="w-48 h-48 bg-slate-900 rounded-xl flex items-center justify-center mb-4">
               <div className="w-40 h-40 bg-white p-2">
                  <div className="w-full h-full bg-cover" style={{ backgroundImage: `url('https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${order.logistics?.gatePassId || "ERROR"}')` }}></div>
               </div>
            </div>
            <div className="text-center">
               <div className="text-2xl font-bold font-mono tracking-tighter">{order.logistics?.gatePassId || "GP-PENDING"}</div>
               <div className="text-[10px] text-slate-500 uppercase font-bold mt-1">Scan at Factory Gate</div>
            </div>
         </div>

         <div className="p-6 bg-slate-50">
            <div className="grid grid-cols-2 gap-4 mb-4">
               <div><div className="text-[9px] text-slate-400 uppercase font-bold">Driver</div><div className="font-bold text-sm">{order.logistics?.driverName}</div></div>
               <div className="text-right"><div className="text-[9px] text-slate-400 uppercase font-bold">Truck Plate</div><div className="font-bold text-sm bg-yellow-300 inline-block px-1 rounded border border-black">{order.logistics?.licensePlate}</div></div>
               <div><div className="text-[9px] text-slate-400 uppercase font-bold">Vehicle</div><div className="font-bold text-sm text-slate-700">{order.logistics?.truckNumber}</div></div>
               <div className="text-right"><div className="text-[9px] text-slate-400 uppercase font-bold">ETA</div><div className="font-bold text-sm text-green-600">{order.logistics?.estimatedArrival}</div></div>
            </div>
            
            <div className="no-print"> 
              <button onClick={handleDownloadPdf} disabled={downloading} className="w-full py-3 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-black transition-colors flex justify-center items-center gap-2">
                 {downloading ? "GENERATING PDF..." : "DOWNLOAD PDF"}
              </button>
              <button onClick={onClose} className="w-full mt-2 py-2 text-xs font-bold text-slate-400 hover:text-black transition">CLOSE</button>
            </div>
         </div>
      </div>
      <style jsx global>{` @media print { .no-print { display: none; } } `}</style>
    </div>
  );
};

// --- EXISTING COMPONENTS ---
const StatusBadge = () => (
  <div className="hidden md:flex px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] md:text-xs font-mono tracking-widest items-center gap-2 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
    </span>
    SYSTEM ONLINE
  </div>
);

const GlassCard = ({ title, subtitle, icon, accent, type }: any) => (
  <div className="group relative overflow-hidden flex flex-col justify-between p-8 h-72 w-full rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-2xl transition-all duration-500 hover:bg-slate-800/60 hover:-translate-y-2 hover:shadow-[0_0_40px_-10px_rgba(0,0,0,0.7)] cursor-pointer text-left">
    <div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-700 bg-gradient-to-br ${accent === 'orange' ? 'from-orange-500 via-amber-500 to-transparent' : 'from-cyan-500 via-blue-500 to-transparent'}`} />
    <div className="relative z-10 w-full flex justify-between items-start">
      <div className={`p-4 rounded-2xl bg-white/5 border border-white/10 shadow-inner ${accent === 'orange' ? 'text-orange-400 group-hover:text-orange-300' : 'text-cyan-400 group-hover:text-cyan-300'} transition-colors duration-300`}>
        {icon}
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded-lg border backdrop-blur-md ${accent === 'orange' ? 'border-orange-500/20 bg-orange-500/5 text-orange-200' : 'border-cyan-500/20 bg-cyan-500/5 text-cyan-200'}`}>
        {type}
      </span>
    </div>
    <div className="relative z-10 text-left mt-auto">
      <h3 className="text-3xl font-bold text-white mb-3 group-hover:tracking-wide transition-all duration-300">{title}</h3>
      <p className="text-slate-400 text-sm font-light leading-relaxed border-l-2 border-white/10 pl-3">{subtitle}</p>
    </div>
  </div>
);

const StatCard = ({ label, value, sub, color }: any) => (
  <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col justify-between">
    <div className="text-slate-400 text-[10px] font-mono uppercase tracking-widest">{label}</div>
    <div className="text-2xl font-black text-white tracking-tight my-1">{value}</div>
    <div className={`text-[9px] font-bold ${color} uppercase tracking-wider`}>{sub}</div>
  </div>
);

const StatusPill = ({ status }: { status: string }) => {
  const styles: any = {
    AVAILABLE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    NEGOTIATING: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
    SOLD: "bg-red-500/10 text-red-400 border-red-500/20",
    PAID: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    APPROVED: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    WAITING_FOR_PAYMENT: "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse"
  };
  return <span className={`px-2 py-1 rounded-md text-[9px] font-mono border ${styles[status] || styles.AVAILABLE}`}>{status}</span>;
};

// --- MAIN PAGE COMPONENT ---

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [activeTab, setActiveTab] = useState('inventory');
  
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showGatePass, setShowGatePass] = useState(false);
  
  // --- REPLAY STATE ---
  const [showReplay, setShowReplay] = useState(false);
  const [replayId, setReplayId] = useState<string | null>(null);

  const [processing, setProcessing] = useState(false);
  const [isResolvingPayment, setIsResolvingPayment] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      fetchDashboardData(parsedUser.email);
    }
  }, []);

  // --- AUTOMATIC PAYMENT MODAL LOGIC ---
  useEffect(() => {
    const payId = searchParams.get('pay_id');
    if (payId) {
        if (!selectedOrder) setIsResolvingPayment(true);
        if (user && dashboardData) {
            console.log("Searching for deal:", payId);
            const dealToPay = dashboardData.shipments.find((s: any) => s.id === payId);
            
            if (dealToPay) {
                console.log("Deal Found:", dealToPay);
                setShowDashboard(true);
                setActiveTab('shipments');
                setSelectedOrder(dealToPay);
                setShowPayment(true);
                setIsResolvingPayment(false);
                router.replace('/'); 
            } else {
                console.log("Deal NOT found in shipments");
            }
        }
    }
  }, [user, dashboardData, searchParams, router]);

  const fetchDashboardData = async (email: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/stats?email=${email}`);
      const json = await res.json();
      setDashboardData(json);
    } catch (err) {
      console.error("Dashboard Error:", err);
      alert(`Connection Failed to ${API_BASE_URL}. Ensure Backend is running.`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setDashboardData(null);
    setShowDashboard(false);
    router.refresh();
  };

  const handlePayClick = (order: any) => { setSelectedOrder(order); setShowPayment(true); };
  const handleGatePassClick = (order: any) => { setSelectedOrder(order); setShowGatePass(true); };
  
  // --- REPLAY HANDLER ---
  const handleReplayClick = (id: string) => {
    setReplayId(id);
    setShowReplay(true);
  };

  const confirmPayment = async () => {
    setProcessing(true);
    try {
        const res = await fetch(`${API_BASE_URL}/api/transaction/pay`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ negotiationId: selectedOrder.id })
        });
        const data = await res.json();
        if (data.success) {
            setShowPayment(false);
            alert("✅ Payment Received. Driver Assigned.");
            fetchDashboardData(user.email);
            setSelectedOrder({ ...selectedOrder, logistics: data.deal.logistics });
            setShowGatePass(true);
        }
    } catch (e) { alert("Payment Failed. Check Server Connection."); } 
    finally { setProcessing(false); }
  };

  return (
    <main className="relative min-h-screen w-full bg-[#020617] text-white overflow-hidden font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      
      {isResolvingPayment && (
          <div className="fixed top-0 left-0 w-full h-1 bg-cyan-500/20 z-[200]"><div className="h-full bg-cyan-400 animate-loading-bar"></div></div>
      )}

      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#0f172a] to-[#020617]" />
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      </div>

      <nav className="relative z-50 w-full px-6 md:px-12 py-6 flex justify-between items-center border-b border-white/5 bg-[#020617]/50 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center shadow-[0_0_20px_rgba(8,145,178,0.4)] ring-1 ring-white/20">
             <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-widest text-white leading-none">OMNI<span className="text-cyan-500">CIRCULUS</span></span>
            <span className="text-[9px] text-slate-500 font-mono tracking-[0.3em] uppercase mt-1">Resource Intelligence</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <StatusBadge />
          {user ? (
            <div className="flex items-center gap-4 border-l border-white/10 pl-6">
              <button onClick={() => setShowDashboard(true)} className="hidden md:flex items-center gap-2 px-4 py-2 bg-cyan-900/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-bold tracking-widest hover:bg-cyan-500/20 hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all animate-pulse">
                COMMAND CENTER
              </button>
              <div className="text-right hidden sm:block">
                <div className="text-xs text-white font-bold uppercase tracking-wider">{user.username}</div>
              </div>
              <button onClick={handleLogout} className="text-xs text-red-400 hover:text-white border border-red-900/30 bg-red-900/10 px-4 py-2 rounded-lg hover:bg-red-600 transition-all">DISCONNECT</button>
            </div>
          ) : (
            <div className="flex items-center gap-4 border-l border-white/10 pl-6">
              <Link href="/auth"><button className="text-xs text-slate-400 hover:text-white font-mono tracking-wider transition-colors">LOGIN</button></Link>
              <Link href="/auth"><button className="text-xs bg-cyan-600 hover:bg-cyan-500 text-black font-bold px-5 py-2 rounded-lg tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all">JOIN NETWORK</button></Link>
            </div>
          )}
        </div>
      </nav>

      <div className="relative z-10 flex flex-col items-center justify-center pt-24 px-4 text-center">
        <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-[1.1] drop-shadow-2xl">
          <span className="block text-white">RESOURCE</span>
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 animate-gradient">INTELLIGENCE</span>
        </h1>
        <div className="grid md:grid-cols-2 gap-8 w-full max-w-5xl px-4 pb-12">
          <Link href={user ? "/give" : "/auth"} className="w-full">
            <GlassCard type="Supplier" accent="orange" title="I Have Stock" subtitle="Upload a photo of your leftovers. AI identifies and lists it." icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} />
          </Link>
          <Link href={user ? "/agent" : "/auth"} className="w-full">
            <GlassCard type="Maker" accent="cyan" title="I Need Stock" subtitle="Create a 'Seeker Agent'. It scans the city database 24/7." icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>} />
          </Link>
        </div>
      </div>

      {showPayment && selectedOrder && ( <PaymentModal order={selectedOrder} onClose={() => setShowPayment(false)} onConfirm={confirmPayment} processing={processing} /> )}
      {showGatePass && selectedOrder && ( <GatePassModal order={selectedOrder} onClose={() => setShowGatePass(false)} /> )}
      
      {/* REPLAY MODAL */}
      {showReplay && replayId && <ReplayModal dealId={replayId} onClose={() => setShowReplay(false)} />}

      {showDashboard && user && dashboardData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300" onClick={() => setShowDashboard(false)}></div>
          <div className="relative bg-[#0f172a] border border-cyan-500/30 w-full max-w-4xl rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            
            <div className="flex justify-between items-center p-6 border-b border-white/10 bg-slate-900/50">
                <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-cyan-500 animate-pulse"></div>
                    <h2 className="text-xl font-bold tracking-widest text-white">COMMAND CENTER</h2>
                </div>
                <button onClick={() => setShowDashboard(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>

            <div className="p-6 md:p-8 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <StatCard label="Total Revenue" value={`₹${dashboardData.stats.revenue.toLocaleString()}`} sub="Credits Earned" color="text-emerald-400" />
                    <StatCard label="Total Spend" value={`₹${dashboardData.stats.spend.toLocaleString()}`} sub="Credits Used" color="text-blue-400" />
                    <StatCard label="Active Missions" value={dashboardData.stats.active} sub="Ongoing Negotiations" color="text-amber-400" />
                </div>

                <div className="flex gap-6 border-b border-white/10 mb-6">
                    <button onClick={() => setActiveTab('inventory')} className={`pb-3 text-xs font-bold tracking-widest transition-all ${activeTab === 'inventory' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>MY INVENTORY</button>
                    <button onClick={() => setActiveTab('shipments')} className={`pb-3 text-xs font-bold tracking-widest transition-all ${activeTab === 'shipments' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>INCOMING SHIPMENTS</button>
                    <button onClick={() => setActiveTab('sales')} className={`pb-3 text-xs font-bold tracking-widest transition-all ${activeTab === 'sales' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>MY SALES</button>
                </div>

                <div className="min-h-[200px]">
                    {activeTab === 'inventory' && (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-white/5 text-[9px] uppercase text-slate-400 font-mono tracking-wider">
                                <tr>
                                    <th className="p-4 rounded-tl-lg">Item</th>
                                    <th className="p-4">Qty</th>
                                    <th className="p-4">Price</th>
                                    <th className="p-4 rounded-tr-lg">Status</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-white/5">
                                {dashboardData.inventory.length > 0 ? (
                                    dashboardData.inventory.map((item: any) => (
                                        // --- FIXED KEY PROP HERE (Use _id instead of id) ---
                                        <tr key={item._id} className="hover:bg-white/5">
                                            <td className="p-4 font-medium text-white">{item.title}</td>
                                            <td className="p-4 text-slate-400">{item.quantity}</td>
                                            <td className="p-4 text-slate-400">₹{item.cost || item.price}</td>
                                            <td className="p-4"><StatusPill status={item.status} /></td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan={4} className="p-8 text-center text-slate-500 font-mono text-xs">NO INVENTORY</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'shipments' && (
                        <div className="space-y-3">
                            {dashboardData.shipments.length > 0 ? (
                                dashboardData.shipments.map((shipment: any) => (
                                    <div key={shipment.id} className="flex items-center justify-between p-4 rounded-lg bg-blue-900/10 border border-blue-500/10">
                                        <div>
                                            <div className="text-white font-bold text-sm">{shipment.title}</div>
                                            <div className="text-blue-400/60 text-[10px] font-mono mt-1">
                                              {shipment.status === 'PAID' ? '✅ PAID • DRIVER ASSIGNED' : `STATUS: ${shipment.status}`}
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-2">
                                            <button onClick={() => handleReplayClick(shipment.id)} className="px-3 py-2 bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-500/30 text-[10px] font-bold tracking-widest rounded transition-all">
                                                🎥 REPLAY
                                            </button>

                                            {shipment.status === 'PAID' ? (
                                                <button onClick={() => handleGatePassClick(shipment)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold tracking-widest rounded shadow-lg transition-colors flex items-center gap-2 animate-pulse">
                                                    GATE PASS
                                                </button>
                                            ) : ['APPROVED', 'TRANSPORT_AGREED', 'WAITING_FOR_PAYMENT'].includes(shipment.status) ? (
                                                <button onClick={() => handlePayClick(shipment)} className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-[10px] font-bold tracking-widest rounded shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all flex items-center gap-2">
                                                    PAY NOW
                                                </button>
                                            ) : (
                                                <button className="px-4 py-1.5 bg-slate-700 text-slate-400 text-[10px] font-bold tracking-widest rounded cursor-not-allowed">
                                                    {shipment.status}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 text-center text-slate-500 font-mono text-xs">NO SHIPMENTS INCOMING</div>
                            )}
                        </div>
                    )}

                    {activeTab === 'sales' && (
                        <div className="space-y-3">
                            {dashboardData.sales && dashboardData.sales.length > 0 ? (
                                dashboardData.sales.map((sale: any) => (
                                    <div key={sale.id} className="flex items-center justify-between p-4 rounded-lg bg-emerald-900/10 border border-emerald-500/10">
                                        <div>
                                            <div className="text-white font-bold text-sm">{sale.title}</div>
                                            <div className="text-emerald-400/60 text-[10px] font-mono mt-1">
                                                {sale.status === 'PAID' 
                                                  ? `TOTAL: ₹${sale.price} • NET: ₹${sale.payout} (Excl. Transport)` 
                                                  : `STATUS: ${sale.status}`}
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-2">
                                            <button onClick={() => handleReplayClick(sale.id)} className="px-3 py-2 bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-500/30 text-[10px] font-bold tracking-widest rounded transition-all">
                                                🎥 REPLAY
                                            </button>

                                            {sale.status === 'PAID' ? (
                                                <button onClick={() => handleGatePassClick(sale)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold tracking-widest rounded shadow-lg transition-colors flex items-center gap-2 animate-pulse">
                                                    GATE PASS
                                                </button>
                                            ) : (
                                                <div className="px-3 py-1.5 bg-amber-900/20 text-amber-400 border border-amber-500/30 text-[9px] font-bold tracking-widest rounded">
                                                    PENDING
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 text-center text-slate-500 font-mono text-xs">NO ACTIVE SALES</div>
                            )}
                        </div>
                    )}

                </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}