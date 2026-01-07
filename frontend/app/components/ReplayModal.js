'use client';
import React, { useState, useEffect, useRef } from 'react';

const ReplayModal = ({ dealId, onClose }) => {
  const [timeline, setTimeline] = useState([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  // 1. Fetch the Story
  useEffect(() => {
    const fetchReplay = async () => {
      try {
      // NEW
const res = await fetch(`https://omni-circulus-backend.onrender.com/api/replay/${dealId}`);
        const data = await res.json();
        if (data.success) {
          setTimeline(data.timeline);
          setLoading(false);
          // Start playback automatically
          playMovie(data.timeline.length);
        }
      } catch (err) {
        console.error("Replay fetch failed", err);
      }
    };
    fetchReplay();
  }, [dealId]);

  // 2. Play the Movie (Timer Logic)
  const playMovie = (totalSteps) => {
    let step = -1;
    const interval = setInterval(() => {
      step++;
      setCurrentStep(step);
      
      // Auto-scroll chat
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }

      if (step >= totalSteps - 1) {
        clearInterval(interval);
      }
    }, 1500); // Speed: 1.5 seconds per step
  };

  if (loading) return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center text-cyan-400 font-mono">
      <div className="animate-spin h-10 w-10 border-4 border-cyan-500 border-t-transparent rounded-full mb-4"></div>
      <div>INITIALIZING NEURAL REPLAY...</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-cyan-500/30 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col h-[80vh]">
        
        {/* HEADER */}
        <div className="p-4 border-b border-white/10 bg-slate-950 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse"></div>
            <h2 className="text-sm font-bold text-white tracking-widest uppercase">AI REASONING REPLAY</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
        </div>

        {/* MAIN DISPLAY SCREEN */}
        <div className="flex-1 bg-slate-900 p-6 overflow-y-auto font-mono text-sm relative" ref={scrollRef}>
          
          {/* Render past steps */}
          {timeline.map((event, index) => {
            if (index > currentStep) return null; // Don't show future steps yet

            return (
              <div key={index} className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* TIMESTAMP LABEL */}
                <div className="text-[10px] text-slate-600 mb-1 flex items-center gap-2">
                  <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                  <span className="h-px bg-slate-800 flex-1"></span>
                  <span className="text-cyan-600 font-bold">{event.type}</span>
                </div>

                {/* CONTENT CARD */}
                <div className={`p-4 rounded-xl border ${event.actor === 'BUYER_AI' ? 'bg-blue-900/10 border-blue-500/30 ml-12' : event.actor === 'SELLER' ? 'bg-orange-900/10 border-orange-500/30 mr-12' : 'bg-slate-800/50 border-white/10'}`}>
                  
                  {/* Actor Name */}
                  <div className={`text-[10px] font-bold mb-2 uppercase ${event.actor === 'BUYER_AI' ? 'text-blue-400' : event.actor === 'SELLER' ? 'text-orange-400' : 'text-green-400'}`}>
                    {event.actor}
                  </div>

                  {/* Message */}
                  <div className="text-slate-200 mb-2">{event.message}</div>

                  {/* Dynamic Data Visualization */}
                  {event.type === 'UPLOAD' && (
                    <div className="flex gap-4 mt-3 bg-black/20 p-2 rounded-lg">
                      <img src={event.data.image} className="h-16 w-16 rounded object-cover border border-white/10" />
                      <div>
                        <div className="text-[10px] text-slate-500">AI ANALYSIS:</div>
                        <div className="flex gap-2 mt-1">
                          {event.data.aiTags.map(tag => (
                            <span key={tag} className="text-[10px] bg-green-900/30 text-green-400 px-2 py-0.5 rounded border border-green-500/30">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {event.type === 'SEARCH' && (
                    <div className="bg-black/30 p-3 rounded border-l-2 border-blue-500 mt-2">
                      <div className="text-[10px] text-slate-500">USER PROMPT:</div>
                      <div className="italic text-blue-200">"{event.data.prompt}"</div>
                      <div className="text-[10px] text-green-400 mt-1 text-right">MATCH SCORE: {event.data.matchScore}</div>
                    </div>
                  )}

                  {event.type === 'LOGISTICS' && (
                    <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                      <div className="bg-slate-950 p-2 rounded"><div className="text-[9px] text-slate-500">DIST</div><div>{event.data.distance}km</div></div>
                      <div className="bg-slate-950 p-2 rounded"><div className="text-[9px] text-slate-500">COST</div><div>₹{event.data.cost}</div></div>
                      <div className="bg-slate-950 p-2 rounded"><div className="text-[9px] text-slate-500">DEST</div><div className="truncate">{event.data.location}</div></div>
                    </div>
                  )}

                  {event.type === 'SUCCESS' && (
                    <div className="mt-2 bg-green-900/20 border border-green-500/50 p-3 rounded text-center">
                      <div className="text-green-400 font-bold text-lg">₹{event.data.total} PAID</div>
                      <div className="text-[10px] text-green-600 mt-1 tracking-widest">GATE PASS: {event.data.gatePass}</div>
                    </div>
                  )}

                </div>
              </div>
            );
          })}

          {/* Typing Indicator if playing */}
          {currentStep < timeline.length - 1 && (
            <div className="text-cyan-500/50 text-xs animate-pulse mt-4">
              AI Processing Next Event...
            </div>
          )}
          
          {currentStep >= timeline.length - 1 && (
             <div className="text-center py-8 text-slate-500 text-xs">--- END OF REASONING CHAIN ---</div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ReplayModal;