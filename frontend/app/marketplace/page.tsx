'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Marketplace() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  // Define your backend URL here
  const API_BASE_URL = 'https://omni-circulus-backend.onrender.com';

  // 1. Fetch Data from Backend
  useEffect(() => {
    // Changed localhost to your live backend URL
    fetch(`${API_BASE_URL}/api/resources/all`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
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
          <div key={item._id} className="group relative bg-slate-900/40 border border-white/10 rounded-2xl p-6 hover:border-cyan-500/50 transition-all duration-300 hover:-translate-y-1">
            
            {/* Hover Glow */}
            <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />

            {/* Top Row */}
            <div className="relative z-10 flex justify-between items-start mb-4">
              <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                {item.type}
              </span>
              <span className="text-[10px] font-mono text-cyan-400">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>

            {/* Content */}
            <div className="relative z-10">
              <h3 className="text-xl font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors">
                {item.title}
              </h3>
              <p className="text-slate-400 text-sm mb-4 line-clamp-2">
                {item.description || "No description provided."}
              </p>
              
              {/* Footer Data */}
              <div className="flex items-center gap-4 text-xs font-mono text-slate-500 border-t border-white/5 pt-4">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  {item.location}
                </div>
                <div>QTY: {item.quantity}</div>
              </div>
            </div>

            {/* Claim Button (Fake for now) */}
            <button className="absolute bottom-6 right-6 p-2 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-black transition-all opacity-0 group-hover:opacity-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </button>

          </div>
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