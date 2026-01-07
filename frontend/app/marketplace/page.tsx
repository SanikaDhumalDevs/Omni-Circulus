'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Marketplace() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  // Define your backend URL here
  const API_BASE_URL = 'https://omni-circulus-backend.onrender.com';

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/resources/all`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setResources(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load market:', err);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen w-full bg-[#020617] text-white p-6 md:p-12 font-sans">
      
      {/* Header */}
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
            GLOBAL STOCKPILE
          </h1>
          <p className="text-slate-400 mt-2 font-mono text-xs tracking-widest uppercase">
            Live Industrial Feed • Region: GLOBAL
          </p>
        </div>
        <Link href="/" className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-mono transition">
          ← RETURN TO HUB
        </Link>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center text-cyan-500 font-mono animate-pulse mt-20">
          SCANNING NETWORK...
        </div>
      )}

      {/* THE GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {resources.map((item) => (
          // WRAPPED IN LINK FOR NAVIGATION
          <Link href={`/resource/${item._id}`} key={item._id} className="block group">
            <div className="relative bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden hover:border-cyan-500/50 transition-all duration-300 hover:-translate-y-1 h-full flex flex-col">
              
              {/* Hover Glow */}
              <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

              {/* --- IMAGE SECTION --- */}
              <div className="h-48 w-full bg-slate-950 border-b border-white/5 relative">
                {item.imageUrl ? (
                  <img 
                    src={item.imageUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  // PLACEHOLDER IF NO IMAGE
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 bg-slate-950/50">
                    <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[10px] font-mono tracking-widest uppercase">Image Data Corrupted</span>
                  </div>
                )}
                
                {/* Price Badge Overlay */}
                <div className="absolute top-4 right-4 bg-black/80 backdrop-blur border border-green-500/30 text-green-400 px-3 py-1 rounded text-sm font-mono font-bold">
                   ₹{item.cost ? item.cost.toLocaleString() : 'NEGOTIABLE'}
                </div>
              </div>

              {/* --- CONTENT SECTION --- */}
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                    {item.type}
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">
                  {item.title}
                </h3>
                
                <p className="text-slate-400 text-sm mb-4 line-clamp-2 flex-1">
                  {item.description || "No technical specifications provided."}
                </p>
                
                {/* Footer Data */}
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 border-t border-white/5 pt-4 mt-auto">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="truncate max-w-[120px]">{item.location}</span>
                  </div>
                  <div className="text-slate-300">QTY: <span className="text-white font-bold">{item.quantity}</span></div>
                </div>
              </div>

            </div>
          </Link>
        ))}
      </div>
      
      {/* Empty State */}
      {!loading && resources.length === 0 && (
        <div className="text-center text-slate-500 mt-20">
          <p>NO RESOURCES DETECTED.</p>
          <Link href="/give" className="text-cyan-400 underline mt-2 inline-block">Upload something?</Link>
        </div>
      )}

    </main>
  );
}