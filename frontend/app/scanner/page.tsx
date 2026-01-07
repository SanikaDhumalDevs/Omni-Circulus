'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import Link from 'next/link';

export default function SecurityScanner() {
    const [scanResult, setScanResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    
    // Define your backend URL here
    const API_BASE_URL = 'https://omni-circulus-backend.onrender.com';
    
    // A ref lock is still good practice to prevent multiple scans from processing
    const isProcessing = useRef(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const verifyTicket = async (text) => {
        setLoading(true);
        try {
            // Updated to use the live backend URL
            const res = await fetch(`${API_BASE_URL}/api/gate/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qrData: text })
            });
            const data = await res.json();
            setScanResult(data);
        } catch (err) {
            console.error("Verification Error:", err);
            setScanResult({ valid: false, message: "Verification failed. Check network." });
        } finally {
            setLoading(false);
        }
    };

    // This handler will now be much simpler and safer
    const handleScan = useCallback((detectedCodes) => {
        if (isProcessing.current || !detectedCodes || detectedCodes.length === 0) {
            return;
        }
        
        const text = detectedCodes[0].rawValue;
        if (text) {
            isProcessing.current = true; // Lock processing
            verifyTicket(text);
        }
    }, []);

    const handleReset = () => {
        setScanResult(null);
        isProcessing.current = false; // Unlock for the next scan
    };

    const handleError = useCallback((error) => {
        // This can be noisy, so only log significant errors if needed
        // console.error("Scanner Error:", error?.message);
    }, []);

    if (!isMounted) {
        return <div className="min-h-screen bg-black text-white flex items-center justify-center">Initializing...</div>;
    }

    return (
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
                <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
                    <h1 className="font-bold text-lg tracking-widest text-cyan-400">GATE SECURITY</h1>
                    <Link href="/" className="text-xs text-slate-400 hover:text-white">EXIT</Link>
                </div>

                {/* --- KEY CHANGE: WE RENDER BOTH VIEWS AND HIDE ONE --- */}
                
                {/* 1. SCANNER VIEW WRAPPER */}
                {/* This div is hidden when there's a result, but its contents (the Scanner) remain mounted. */}
                <div style={{ display: scanResult ? 'none' : 'block' }}>
                    <div className="relative h-80 bg-black">
                        <Scanner 
                            onScan={handleScan} 
                            onError={handleError}
                            // The scanner is paused/unpaused based on the scanResult state.
                            // This is much safer than unmounting.
                            paused={!!scanResult || loading}
                            scanDelay={300}
                            formats={['qr_code']}
                            components={{
                                audio: false,
                                torch: false,
                                count: false,
                                onOff: false,
                                tracker: false
                            }}
                            styles={{
                                container: { height: '100%' }
                            }}
                        />
                        
                        <div className="absolute inset-0 border-2 border-cyan-500/30 pointer-events-none flex items-center justify-center">
                            <div className="w-48 h-48 border-2 border-cyan-400 rounded-lg animate-pulse shadow-[0_0_20px_rgba(34,211,238,0.4)]"></div>
                        </div>
                        
                        <div className="absolute bottom-4 left-0 w-full text-center text-xs text-cyan-500 font-mono">
                            {loading ? "VERIFYING PASS..." : "ALIGN QR CODE"}
                        </div>
                    </div>
                </div>

                {/* 2. RESULT VIEW */}
                {/* This div is only rendered when there is a scanResult. */}
                {scanResult && (
                    <div className={`p-8 text-center flex flex-col items-center gap-4 ${scanResult.valid ? 'bg-green-900/20' : 'bg-red-900/20'}`}>
                        <div className={`w-24 h-24 rounded-full flex items-center justify-center text-5xl border-4 shadow-xl ${scanResult.valid ? 'border-green-500 bg-green-600 text-white' : 'border-red-500 bg-red-600 text-white'}`}>
                            {scanResult.valid ? '✓' : '✕'}
                        </div>
                        
                        <div>
                            <h2 className={`text-3xl font-black uppercase tracking-tighter ${scanResult.valid ? 'text-green-400' : 'text-red-500'}`}>
                                {scanResult.valid ? 'AUTHORIZED' : 'DENIED'}
                            </h2>
                            <p className="text-sm text-slate-300 mt-2 font-mono uppercase tracking-wide">{scanResult.message}</p>
                        </div>

                        {scanResult.valid && (
                            <div className="bg-black/40 p-5 rounded-xl w-full text-left border border-white/10 mt-2 shadow-inner">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Driver</div>
                                        <div className="text-sm font-bold text-white mt-1">{scanResult.details?.driver}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Vehicle</div>
                                        <div className="text-sm font-bold text-yellow-400 font-mono mt-1 px-2 py-0.5 bg-yellow-900/30 rounded inline-block border border-yellow-500/30">
                                            {scanResult.details?.truck}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button 
                            onClick={handleReset}
                            className="mt-6 w-full py-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold tracking-[0.2em] transition-all border border-white/5 hover:border-white/20"
                        >
                            SCAN NEXT TRUCK
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}