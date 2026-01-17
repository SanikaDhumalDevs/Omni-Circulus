'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic'; 

// --- DYNAMIC MAP IMPORT (Client Side Only) ---
const LogisticsMap = dynamic(() => import('../components/LogisticsMap'), {
  ssr: false, 
  loading: () => <div className="h-48 w-full bg-slate-900 animate-pulse rounded-xl border border-slate-700 flex items-center justify-center text-slate-500 text-xs font-mono">INITIALIZING SATELLITE FEED...</div>
});

// --- TYPEWRITER COMPONENT ---
const Typewriter = ({ text, speed = 20 }: { text: string, speed?: number }) => {
  const [displayText, setDisplayText] = useState('');
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.substring(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return <span>{displayText}</span>;
};

export default function AgentPage() {
  const router = useRouter();
  
  // --- CONFIGURATION ---
  const API_BASE_URL = 'https://omni-circulus-backend.onrender.com';

  const [user, setUser] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  
  // --- LOCATION STATE ---
  const [buyerLocation, setBuyerLocation] = useState('');
  const [locating, setLocating] = useState(false);
  
  // Agent States
  const [isActive, setIsActive] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Results
  const [foundDeals, setFoundDeals] = useState<any[]>([]); 
  const [activeRequests, setActiveRequests] = useState<any[]>([]); 
  
  // --- NEGOTIATION STATE ---
  const [negotiation, setNegotiation] = useState<any>(null);
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [isTyping, setIsTyping] = useState(false); 
  
  // PHASE STATE
  const [uiPhase, setUiPhase] = useState('PRICE');
  const [rateLimited, setRateLimited] = useState(false);
  
  // --- HISTORY STATE ---
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // --- REDIRECT STATE ---
  const [isRedirecting, setIsRedirecting] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null); 
  const emailSentRef = useRef(false);

  // 1. Load User & Fetch History
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
       setTimeout(() => {
         if(!localStorage.getItem('user')) router.push('/auth');
       }, 500);
    } else {
      const u = JSON.parse(storedUser);
      setUser(u);
      fetchBackgroundAgents(u.email);
      fetchHistory(u.email);
    }
  }, []);

  // 2. Sync UI Phase
  useEffect(() => {
    if (!negotiation) { setUiPhase('PRICE'); return; }
    const { status, logs } = negotiation;
    const lastLog = logs && logs.length > 0 ? logs[logs.length - 1] : null;
    
    if (status === 'CANCELLED_DISTANCE' || status === 'FAILED') { 
        setUiPhase('CANCELLED'); 
    }
    else if (status === 'WAITING_FOR_APPROVAL') { 
        setUiPhase('PENDING_APPROVAL'); 
    }
    else if (status === 'TRANSPORT_AGREED' || lastLog?.message?.includes("Waiting for User Confirmation")) { 
        setUiPhase('BILL'); 
    } 
    else if (status === 'TRANSPORT_NEGOTIATING') { 
        setUiPhase('TRANSPORT'); 
    } 
    else { 
        setUiPhase('PRICE'); 
    }
    
    if (showNegotiation && logsEndRef.current) {
      setTimeout(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, 100);
    }
  }, [negotiation, showNegotiation, isTyping]);

  // 3. --- AUTO-ACTIONS (EMAIL & REDIRECT) ---
  useEffect(() => {
    // A. Auto-Send Emails when Transport Agreed
    if (negotiation?.status === 'TRANSPORT_AGREED' && !emailSentRef.current) {
        console.log("🤖 Agent Auto-Dispatching Emails...");
        emailSentRef.current = true; 
        setTimeout(() => { handleRequestApproval(); }, 1500);
    }

    // B. ✅ REDIRECT LOGIC: IF APPROVED, GO TO HOME PAGE FOR PAYMENT
    if (negotiation?.status === 'APPROVED' && !isRedirecting) {
        setIsRedirecting(true);
        console.log("Deal Approved! Redirecting to Payment...");
        
        setTimeout(() => {
            // Use window.location for hard redirect to ensure Home Page reloads and catches the ID
            window.location.href = `/?pay_id=${negotiation._id}`;
        }, 1500);
    }

  }, [negotiation?.status]);

  // --- NEW CODE (PASTE THIS) ---
const handleGPS = () => {
  if (!navigator.geolocation) { 
    alert("Geolocation is not supported by your browser"); 
    return; 
  }
  
  setLocating(true);
  
  // Options for better accuracy
  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  };

  navigator.geolocation.getCurrentPosition(
    (pos) => { 
      setBuyerLocation(`${pos.coords.latitude}, ${pos.coords.longitude}`); 
      setLocating(false); 
    },
    (error) => { 
      console.error("GPS Error Details:", error);
      
      let msg = "⚠️ GPS Error.";
      
      // Check specific error codes
      if (error.code === 1) {
        msg = "❌ Permission Denied. Please allow location access in your browser settings or ensure you are using HTTPS.";
      } else if (error.code === 2) {
        msg = "❌ Location Unavailable. Your device cannot find a signal.";
      } else if (error.code === 3) {
        msg = "❌ Location Timeout. The request took too long.";
      }
      
      alert(msg); 
      setLocating(false); 
    },
    options
  );
};

  // --- MAIN NEGOTIATION LOOP ---
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const processNextTurn = async () => {
      if (!negotiation) return;
      
      // Stop polling if terminal state
      if (['COMPLETED', 'FAILED', 'DEAL_CLOSED', 'CANCELLED_DISTANCE', 'WAITING_FOR_APPROVAL', 'APPROVED'].includes(negotiation.status)) {
        setIsTyping(false);
        return;
      }
      
      const lastLog = negotiation.logs?.[negotiation.logs.length - 1];
      if (lastLog?.message?.includes("Waiting for User Confirmation")) {
        setIsTyping(false);
        return;
      }
      if (negotiation.status === 'TRANSPORT_AGREED') {
        setIsTyping(false);
        return;
      }
      
      setIsTyping(true);
      const delay = negotiation.logs?.length < 2 ? 1500 : 2500;

      timeoutId = setTimeout(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/negotiate/next-turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ negotiationId: negotiation._id })
          });
          
          if (res.status === 429) {
             setRateLimited(true);
             timeoutId = setTimeout(() => { setRateLimited(false); processNextTurn(); }, 8000);
             return;
          }
          if (!res.ok) throw new Error(`Server Error: ${res.status}`);
          const data = await res.json();
          setIsTyping(false);
          setNegotiation(data); 
        } catch (err: any) { 
          timeoutId = setTimeout(processNextTurn, 5000);
        }
      }, delay); 
    };

    const activeStatuses = ['PRICE_NEGOTIATING', 'PRICE_AGREED', 'TRANSPORT_NEGOTIATING'];
    if (activeStatuses.includes(negotiation?.status)) { 
        processNextTurn(); 
    } else if (negotiation?.status === 'WAITING_FOR_APPROVAL') {
         // Poll occasionally to check for approval (from email clicks)
         timeoutId = setTimeout(async () => {
             try {
                const res = await fetch(`${API_BASE_URL}/api/negotiate/next-turn`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ negotiationId: negotiation._id })
                });
                const data = await res.json();
                setNegotiation(data);
             } catch (e) {}
         }, 3000);
    } else {
        setIsTyping(false);
    }

    return () => clearTimeout(timeoutId);
  }, [negotiation]); 

  // --- API CALLS ---
  const fetchBackgroundAgents = async (email: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/agent/my-requests/${email}`);
      const data = await res.json();
      if (Array.isArray(data)) setActiveRequests(data.filter(r => r.status !== 'COMPLETED'));
    } catch (e) { console.error(e); }
  };

  const fetchHistory = async (email: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/negotiate/history/${email}`);
      const data = await res.json();
      setHistory(data);
    } catch (e) { console.error("History Error", e); }
  };

  const handleDeploy = async () => {
    if (!prompt || !user) return;
    setIsActive(true); setFoundDeals([]); setLogs([]); setNegotiation(null);
    setLogs(prev => [...prev, `> REQUEST: "${prompt}"`]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/agent/seek`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, userEmail: user.email }) 
      });
      const data = await res.json();
      if (data.status === 'FOUND') {
          const validDeals = data.foundItems.filter((item: any) => !history.some(h => h.resourceId?._id === item._id || h.resourceId === item._id));
          if (validDeals.length > 0) {
            setFoundDeals(validDeals);
            setLogs(prev => [...prev, `> MATCHES: ${validDeals.length} found.`]);
          } else {
             setLogs(prev => [...prev, `> MATCHES FOUND BUT ALREADY PURCHASED.`]);
          }
      } else {
          setLogs(prev => [...prev, `> NO MATCH. Agent Queued.`]);
          fetchBackgroundAgents(user.email);
      }
    } catch (e) { console.error(e); } 
    finally { setIsActive(false); setPrompt(''); }
  };

  const handleNegotiate = async (item: any) => {
    const rId = item._id || item; 
    if (!buyerLocation && !confirm("Start without GPS? (Logistics will use estimates)")) return;
    
    emailSentRef.current = false; 
    setIsRedirecting(false); // Reset redirect state

    setShowNegotiation(true); setNegotiation(null); setUiPhase('PRICE'); 
    try {
      const res = await fetch(`${API_BASE_URL}/api/negotiate/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceId: rId, buyerEmail: user.email, buyerLocation: buyerLocation || "Unknown" })
      });
      const data = await res.json();
      if (res.ok) setNegotiation(data);
      else throw new Error(data.error);
    } catch (e: any) { alert(e.message); setShowNegotiation(false); }
  };

  const handleRequestApproval = async () => {
    if (!negotiation) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/negotiate/send-approvals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ negotiationId: negotiation._id })
        });
        const data = await res.json();
        
        if (res.ok) {
           setNegotiation((prev: any) => ({ ...prev, status: 'WAITING_FOR_APPROVAL' }));
        } else {
            alert("❌ Agent Failed to dispatch emails: " + (data.error || "Unknown Error"));
            emailSentRef.current = false; 
        }
    } catch(e) { 
        alert("Network Error during Dispatch");
        emailSentRef.current = false;
    }
  };

  const isResourceBought = (resourceId: string) => {
      if (!resourceId) return false;
      return history.some(h => h.resourceId?._id === resourceId || h.resourceId === resourceId);
  };

  if (!user) return <div className="min-h-screen bg-black text-white flex items-center justify-center font-mono">ESTABLISHING UPLINK...</div>;

  const renderPhaseHeader = () => (
      <div className="flex gap-1 p-2 bg-slate-900 border-b border-slate-700">
          <div className={`flex-1 text-center py-2 text-[10px] uppercase font-bold tracking-widest rounded transition-colors duration-500 ${uiPhase === 'PRICE' ? 'bg-cyan-900 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'text-slate-600'}`}>1. Price</div>
          <div className={`flex-1 text-center py-2 text-[10px] uppercase font-bold tracking-widest rounded transition-colors duration-500 ${uiPhase === 'TRANSPORT' ? 'bg-purple-900 text-purple-400 shadow-[0_0_10px_rgba(192,132,252,0.2)]' : 'text-slate-600'}`}>2. Logistics</div>
          <div className={`flex-1 text-center py-2 text-[10px] uppercase font-bold tracking-widest rounded transition-colors duration-500 ${uiPhase === 'BILL' || uiPhase === 'PENDING_APPROVAL' || uiPhase === 'CANCELLED' ? (uiPhase === 'CANCELLED' ? 'bg-red-900 text-red-400' : 'bg-green-900 text-green-400') : 'text-slate-600'}`}>3. Billing</div>
      </div>
  );

  return (
    <main className="min-h-screen bg-[#030712] text-white font-mono p-4 flex flex-col items-center relative overflow-hidden">
       <div className="fixed inset-0 z-0 opacity-10 bg-[linear-gradient(to_right,#06b6d4_1px,transparent_1px),linear-gradient(to_bottom,#06b6d4_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      
      {/* HEADER */}
      <header className="relative z-10 w-full max-w-3xl flex justify-between items-end border-b border-slate-800 pb-4 mb-6">
        <div>
            <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">SUPPLY AGENT</h1>
            <p className="text-[10px] text-slate-500 tracking-[0.3em] uppercase">OPERATOR: {user.username}</p>
        </div>
        <div className="flex gap-4">
            {/* --- NEW BUTTON: MARKET --- */}
            <button onClick={() => router.push('/marketplace')} className="text-xs text-cyan-500 hover:text-cyan-300 transition">[ MARKET ]</button>
            <button onClick={() => setShowHistory(true)} className="text-xs text-green-500 hover:text-green-300 transition">[ HISTORY ]</button>
            <button onClick={() => router.push('/')} className="text-xs text-slate-500 hover:text-white transition">[ EXIT ]</button>
        </div>
      </header>

      {/* HISTORY MODAL (Keep as is) */}
      {showHistory && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in-up">
              <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl overflow-hidden max-h-[80vh] flex flex-col shadow-2xl">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                      <h3 className="text-green-400 font-bold tracking-widest uppercase">Mission History</h3>
                      <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-white">✕</button>
                  </div>
                  <div className="p-4 overflow-y-auto space-y-3 custom-scrollbar">
                      {history.length === 0 ? <p className="text-slate-600 text-center italic">No completed missions yet.</p> : history.map((h: any) => (
                          <div key={h._id} className="bg-black/40 border border-slate-800 p-3 rounded-lg flex justify-between items-center">
                              <div>
                                  <div className="text-sm font-bold text-white">{h.resourceId?.title || "Unknown Item"}</div>
                                  <div className="text-[10px] text-slate-500">
                                      Closed: {new Date(h.updatedAt).toLocaleDateString()} • Dist: {h.distanceKm}km
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="text-green-400 font-mono font-bold">₹{h.totalValue}</div>
                                  <div className="text-[9px] text-slate-600 uppercase">Paid & Closed</div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* MAIN INPUT */}
      {!showNegotiation && (
        <div className="relative z-10 w-full max-w-3xl space-y-6 animate-slideUp">
            <div className="bg-slate-900/50 backdrop-blur border border-slate-700 p-6 rounded-2xl shadow-xl relative">
                <label className="text-xs text-cyan-400 uppercase tracking-widest mb-2 block">New Mission</label>
                <textarea 
                    value={prompt} 
                    onChange={e => setPrompt(e.target.value)} 
                    placeholder="Describe requirement (e.g., 'Need 50 tons of steel in Mumbai')..." 
                    className="w-full h-24 bg-black/50 border border-slate-700 rounded-xl p-4 text-sm focus:border-cyan-500 outline-none text-slate-300 resize-none"
                />
                <div className="flex justify-between mt-4">
                    <div className="flex items-center gap-2">
                        <button onClick={handleGPS} disabled={locating} className="text-[10px] flex items-center gap-1 text-cyan-500 hover:text-white border border-cyan-500/30 px-3 py-1.5 rounded bg-cyan-950/30">
                            {locating ? <span className="animate-pulse">🛰️ LOCATING...</span> : (buyerLocation ? "✅ LOCATION SET" : "📍 SET LOCATION")}
                        </button>
                        {buyerLocation && <span className="text-[9px] text-green-500 font-mono">{buyerLocation}</span>}
                    </div>
                    <button onClick={handleDeploy} disabled={isActive} className="bg-cyan-600 hover:bg-cyan-500 text-black font-bold px-6 py-2 rounded-lg text-xs tracking-wider transition-all disabled:opacity-50">
                        {isActive ? 'SCANNING...' : 'DEPLOY AGENT'}
                    </button>
                </div>
                {logs.length > 0 && <div className="mt-4 bg-black border border-slate-800 rounded p-3 text-[10px] text-green-400 font-mono h-20 overflow-y-auto">{logs.map((log, i) => <div key={i}>{log}</div>)}</div>}
            </div>
            
            {/* RESULTS */}
            {foundDeals.length > 0 && (
                <div className="space-y-2 animate-fade-in-up">
                    <h3 className="text-xs text-green-400 uppercase tracking-widest border-b border-green-900/50 pb-2">⚡ Matches Found</h3>
                    {foundDeals.map(deal => (
                        <div key={deal._id} className="bg-slate-900 border border-green-500/30 p-4 rounded-xl flex justify-between items-center transition hover:border-green-500/60">
                            <div>
                                <div className="font-bold text-white">{deal.title}</div>
                                <div className="text-xs text-slate-400">{deal.location} • Ask: ₹{deal.cost}</div>
                            </div>
                            <button onClick={() => handleNegotiate(deal)} className="bg-green-600 hover:bg-green-500 text-black text-xs font-bold px-4 py-2 rounded shadow-lg animate-pulse">
                                NEGOTIATE
                            </button>
                        </div>
                    ))}
                </div>
            )}
            
             {/* BACKGROUND REQUESTS */}
             <div className="animate-slideUp">
                <div className="flex justify-between items-end border-b border-slate-800 pb-2 mb-4">
                     <h3 className="text-slate-500 text-sm tracking-widest uppercase">Active Agents</h3>
                     <button onClick={() => fetchBackgroundAgents(user.email)} className="text-[10px] text-cyan-500 hover:text-white">↻ REFRESH</button>
                </div>
                {activeRequests.length === 0 ? <p className="text-slate-600 text-xs italic">No active background missions.</p> : (
                    <div className="space-y-2">
                        {activeRequests.map(req => {
                            if (req.matchedResourceId && isResourceBought(req.matchedResourceId)) return null;
                            return (
                                <div key={req._id} className={`p-3 rounded border flex justify-between items-center ${req.status === 'FOUND' ? 'bg-green-900/10 border-green-500/50' : 'bg-slate-900/40 border-slate-800'}`}>
                                    <span className="text-xs text-slate-300"><span className="text-cyan-600 font-bold">MISSION:</span> "{req.prompt}"</span>
                                    {req.status === 'FOUND' && req.matchedResourceId ? (
                                        <button onClick={() => handleNegotiate(req.matchedResourceId)} className="text-[10px] bg-green-600 text-black font-bold px-3 py-1 rounded shadow hover:bg-green-500">MATCH FOUND</button>
                                    ) : (
                                        <span className="text-[9px] text-yellow-500 animate-pulse">SEARCHING...</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
      )}

      {/* --- NEGOTIATION PANEL --- */}
      {showNegotiation && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
           
           <div className="w-full max-w-lg bg-slate-950 border border-cyan-500/50 rounded-2xl overflow-hidden flex flex-col h-[85vh] shadow-[0_0_50px_rgba(8,145,178,0.2)] animate-fade-in-up relative">
              
              {/* SUCCESS OVERLAY - REDIRECTING */}
              {isRedirecting && (
                <div className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center animate-fade-in">
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full border-4 border-green-500 animate-ping absolute inset-0 opacity-50"></div>
                        <div className="w-32 h-32 rounded-full border-4 border-green-500 flex items-center justify-center bg-green-900/20 shadow-[0_0_30px_#22c55e]">
                             <span className="text-6xl animate-bounce">✅</span>
                        </div>
                    </div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 mt-8 tracking-[0.2em] uppercase">Deal Approved</h2>
                    <p className="text-green-400/70 font-mono mt-2 text-xs tracking-widest">REDIRECTING TO SECURE PAYMENT...</p>
                    <div className="mt-4 w-48 h-1 bg-green-900 rounded overflow-hidden">
                        <div className="h-full bg-green-400 animate-loading-bar"></div>
                    </div>
                </div>
              )}

              <div className="bg-slate-900 p-3 flex justify-between items-center border-b border-slate-800">
                  <span className="text-cyan-400 text-xs font-bold tracking-widest flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${rateLimited ? 'bg-yellow-500 animate-ping' : 'bg-green-500 animate-pulse'}`}></span> 
                      {rateLimited ? 'HIGH TRAFFIC - COOLING DOWN...' : 'LIVE AGENT LINK ESTABLISHED'}
                  </span>
                  <button onClick={() => setShowNegotiation(false)} className="text-slate-500 hover:text-white">✕</button>
              </div>
              
              {renderPhaseHeader()}

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black custom-scrollbar relative">
                  {!negotiation ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 opacity-50">
                          <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-xs tracking-widest">CONNECTING NEURAL LINK...</p>
                      </div>
                  ) : (
                      <>
                        {/* MAP (Only if location exists) */}
                        {(uiPhase === 'TRANSPORT' || uiPhase === 'BILL' || uiPhase === 'PENDING_APPROVAL') && negotiation?.buyerLocation?.includes(',') && (
                             <div className="mb-4 animate-fade-in-up">
                                 <LogisticsMap
                                    buyerLat={negotiation.buyerLocation.split(',')[0]}
                                    buyerLng={negotiation.buyerLocation.split(',')[1]}
                                    distanceKm={negotiation.distanceKm || 10}
                                 />
                             </div>
                        )}

                        {(negotiation.logs || []).map((log: any, i: number) => {
                            const isLast = i === negotiation.logs.length - 1;
                            if (log.sender === 'SYSTEM') {
                                return (
                                    <div key={i} className="flex justify-center my-4 animate-fadeIn">
                                        <div className={`text-[9px] px-3 py-1 rounded-full uppercase tracking-widest border ${log.message.includes("CANCELLED") || log.message.includes("Ended") ? 'text-red-400 bg-red-900/20 border-red-900' : 'text-cyan-400 bg-cyan-900/20 border-cyan-900'}`}>
                                            {log.message}
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <div key={i} className={`flex ${log.sender === 'BUYER_AGENT' ? 'justify-start' : log.sender === 'SELLER_AGENT' ? 'justify-end' : 'justify-center'}`}>
                                    <div className={`max-w-[85%] p-3 rounded-xl border text-xs shadow-md transform transition-all duration-300 ${
                                        log.sender === 'BUYER_AGENT' 
                                        ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-100 rounded-tl-none' 
                                        : 'bg-purple-950/40 border-purple-500/30 text-purple-100 rounded-tr-none'
                                    }`}>
                                        <div className="text-[9px] opacity-50 mb-1 font-bold flex justify-between">
                                            <span>{log.sender.replace('_', ' ')}</span>
                                            {log.offer && <span className="text-white">₹{log.offer}</span>}
                                        </div>
                                        <div className="leading-relaxed font-mono">
                                            {isLast && log.sender !== 'SYSTEM' && !isTyping ? <Typewriter text={log.message} speed={25} /> : log.message}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        
                        {isTyping && (
                             <div className="flex justify-start animate-fade-in-up">
                                <div className="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl rounded-tl-none flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-100"></div>
                                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-200"></div>
                                </div>
                             </div>
                        )}
                        <div ref={logsEndRef} />
                      </>
                  )}
              </div>

              {/* ACTION FOOTER */}
              <div className="p-5 bg-slate-900 border-t border-slate-800 z-20">
                  {uiPhase === 'BILL' ? (
                      <div className="space-y-3 animate-fade-in-up">
                          <div className="bg-slate-950 p-4 rounded-xl border border-slate-700 text-xs space-y-2 shadow-inner">
                              <div className="flex justify-between text-slate-400"><span>Agreed Price</span> <span className="text-white font-mono">₹{negotiation.finalPrice}</span></div>
                              <div className="flex justify-between text-slate-400"><span>Transport ({negotiation.distanceKm}km)</span> <span className="text-white font-mono">₹{negotiation.transportCost}</span></div>
                              <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between font-bold text-green-400 text-sm"><span>TOTAL DUE</span> <span>₹{negotiation.totalValue}</span></div>
                          </div>
                          <div className="w-full bg-gradient-to-r from-blue-900/50 to-cyan-900/50 text-cyan-400 font-bold py-3 rounded-xl text-xs tracking-widest border border-cyan-800 flex items-center justify-center gap-2 animate-pulse">
                              <span className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></span>
                              INITIALIZING CONTRACT PROTOCOLS...
                          </div>
                      </div>
                  ) : uiPhase === 'PENDING_APPROVAL' ? (
                       <div className="bg-cyan-950/30 p-4 rounded-xl border border-cyan-800 text-center animate-pulse">
                          <div className="text-cyan-400 font-bold text-sm mb-1">APPROVALS PENDING</div>
                          <p className="text-cyan-300/70 text-[10px] mb-2">Emails have been sent to Buyer & Seller.</p>
                          <p className="text-slate-500 text-[9px] uppercase tracking-widest">Please check your inbox</p>
                      </div>
                  ) : uiPhase === 'CANCELLED' ? (
                      <div className="bg-red-950/50 p-4 rounded-xl border border-red-900 text-center">
                          <div className="text-red-500 font-bold text-sm mb-1">DEAL CANCELLED</div>
                          <p className="text-red-400/70 text-[10px]">Negotiation Failed.</p>
                      </div>
                  ) : (
                      <div className="text-center text-[10px] text-slate-500 flex items-center justify-center gap-2 py-2">
                          <span className={`w-1.5 h-1.5 bg-cyan-500 rounded-full ${isTyping ? 'animate-bounce' : 'animate-ping'}`}></span>
                          <span className="uppercase tracking-widest">
                            {isTyping ? 'Connecting...' : (uiPhase === 'PRICE' ? 'Negotiating Price...' : 'Calculating Logistics...')}
                          </span>
                      </div>
                  )}
              </div>
           </div>
        </div>
      )}

    </main>
  );
}