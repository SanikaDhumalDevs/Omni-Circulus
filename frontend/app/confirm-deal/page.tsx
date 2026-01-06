'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation'; 

// ==========================================
// 1. CONFIGURATION
// ==========================================
const API_BASE_URL = 'https://omni-circulus-backend.onrender.com';
const FRONTEND_URL = 'https://omni-circulus.vercel.app'; // ✅ Hardcoded for stability

function ConfirmContent() {
  const searchParams = useSearchParams();
  
  const token = searchParams.get('token');
  const role = searchParams.get('role');
  const rejectAction = searchParams.get('reject'); 

  const [status, setStatus] = useState('VERIFYING'); 
  const [message, setMessage] = useState('Verifying your identity...');

  useEffect(() => {
    if (!token || !role) {
      setStatus('ERROR');
      setMessage('Invalid Link: Missing token or role.');
      return;
    }

    if (rejectAction) {
      handleDecision('reject');
    }
  }, [token, role, rejectAction]);

  const handleDecision = async (action) => {
    setStatus('PROCESSING');
    try {
      console.log(`Connecting to: ${API_BASE_URL}/api/negotiate/verify-transaction`);
      
      const res = await fetch(`${API_BASE_URL}/api/negotiate/verify-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, role, action })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({})); 
        throw new Error(errorData.error || `Server Error: ${res.status}`);
      }

      const data = await res.json();
      
      // ============================================
      // 2. REDIRECT LOGIC
      // ============================================
      if (data.status === 'APPROVED') {
        setStatus('CLOSED'); 
        setMessage('Deal Approved! Redirecting to Payment Gateway...');
        
        // Case-insensitive check for buyer role
        if (role && role.toLowerCase().includes('buyer')) {
            setTimeout(() => {
                // ✅ Redirect to Production Payment URL with negotiationId
                window.location.href = `${FRONTEND_URL}/?pay_id=${data.negotiationId}`;
            }, 1500); 
        } else {
            // Seller -> Dashboard
            setTimeout(() => {
                window.location.href = `${FRONTEND_URL}/`;
            }, 2000);
        }
      } 
      else if (['ALREADY_CLOSED', 'CLOSED', 'PAID'].includes(data.status)) {
        setStatus('CLOSED');
        setMessage('Transaction already completed.');
         
         if (role && role.toLowerCase().includes('buyer') && data.negotiationId) {
             setTimeout(() => {
                 window.location.href = `${FRONTEND_URL}/?pay_id=${data.negotiationId}`;
             }, 1500);
         } else {
             setTimeout(() => {
                 window.location.href = `${FRONTEND_URL}/`;
             }, 2000);
         }
      } 
      else if (data.status === 'REJECTED') {
        setStatus('REJECTED');
        setMessage('You have rejected this deal.');
      } 
      else if (data.status === 'PENDING') {
        setStatus('APPROVED');
        setMessage('Approval Recorded. Waiting for partner...');
      } 
      else {
        setStatus('ERROR');
        setMessage(data.message || 'Unknown Status received from server.');
      }

    } catch (err) {
      console.error("Confirmation Error:", err);
      setStatus('ERROR');
      setMessage(err.message || 'Connection Failed');
    }
  };

  if (status === 'VERIFYING' && !rejectAction) {
    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold text-cyan-400 tracking-widest uppercase">Security Check</h1>
        <p className="text-slate-400">Please confirm your decision for this transaction.</p>
        
        <div className="flex gap-4 mt-4">
            <button 
                onClick={() => handleDecision('approve')}
                className="bg-green-600 hover:bg-green-500 text-black px-8 py-3 rounded-xl font-bold shadow-[0_0_20px_rgba(22,163,74,0.4)] transition-all"
            >
                CONFIRM DEAL
            </button>
            <button 
                onClick={() => handleDecision('reject')}
                className="bg-red-900/50 hover:bg-red-900 border border-red-600 text-red-400 px-8 py-3 rounded-xl font-bold transition-all"
            >
                REJECT
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center animate-fade-in-up">
        
        {status === 'CLOSED' && (
            <>
                <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500 shadow-[0_0_40px_rgba(34,197,94,0.4)]">
                    <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h1 className="text-3xl font-bold text-white tracking-widest">DEAL DONE</h1>
                <p className="text-green-400 font-mono text-sm animate-pulse">{message}</p>
                <div className="mt-4 h-1 w-32 bg-green-900 rounded overflow-hidden">
                    <div className="h-full bg-green-400 animate-loading-bar"></div>
                </div>
            </>
        )}

        {status === 'APPROVED' && (
            <>
                 <div className="w-24 h-24 rounded-full bg-cyan-500/20 flex items-center justify-center border-2 border-cyan-500 shadow-[0_0_40px_rgba(6,182,212,0.4)]">
                    <span className="text-4xl">⏳</span>
                </div>
                <h1 className="text-2xl font-bold text-cyan-400 tracking-widest">AWAITING PARTNER</h1>
                <p className="text-slate-300 font-mono text-sm max-w-md">{message}</p>
            </>
        )}

        {status === 'REJECTED' && (
            <>
                <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center border-2 border-red-500">
                    <span className="text-4xl">✖</span>
                </div>
                <h1 className="text-2xl font-bold text-red-500 tracking-widest">DEAL CANCELLED</h1>
                <p className="text-slate-400 font-mono text-sm">{message}</p>
            </>
        )}

        {status === 'PROCESSING' && (
             <div className="text-cyan-400 animate-pulse font-mono tracking-widest">CONNECTING TO SECURE LEDGER...</div>
        )}
        
        {status === 'ERROR' && (
             <div className="flex flex-col items-center gap-2">
                 <div className="w-16 h-16 rounded-full bg-red-900/20 border border-red-500 flex items-center justify-center text-red-500 text-2xl">!</div>
                 <div className="text-red-400 font-mono bg-red-950/50 p-4 rounded border border-red-800 text-sm max-w-xs">
                    {message}
                 </div>
                 <button onClick={() => window.location.reload()} className="mt-4 text-xs text-slate-500 hover:text-white underline">Retry</button>
             </div>
        )}
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <main className="min-h-screen bg-[#020617] text-white flex items-center justify-center p-4 relative overflow-hidden">
       <div className="fixed inset-0 z-0 opacity-20 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
       
       <div className="relative z-10 w-full max-w-lg bg-slate-900/50 backdrop-blur-xl border border-white/10 p-10 rounded-3xl shadow-2xl">
         <Suspense fallback={<div className="text-center text-cyan-400">Loading Secure Link...</div>}>
            <ConfirmContent />
         </Suspense>
       </div>
    </main>
  );
}