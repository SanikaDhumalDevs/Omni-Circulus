'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const router = useRouter();
  
  // State to switch between Login and Sign Up
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form Data
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // 1. Decide which endpoint to hit (Login or Register)
    const endpoint = isLogin ? 'login' : 'register';
    const url = `https://omni-circulus-backend.onrender.com/api/auth/${endpoint}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data); // Show backend error message
      }

      // 2. SUCCESS!
      // If we just registered, switch to login view automatically
      if (!isLogin) {
        alert("✅ Account Created! Please Login.");
        setIsLogin(true);
        setLoading(false);
        return;
      }

      // 3. LOGGING IN
      // Save the user data & token to LocalStorage (Browser Memory)
      localStorage.setItem('user', JSON.stringify(data));
      
      alert("✅ Welcome back, Agent.");
      router.push('/'); // Redirect to Home Page

    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-[#030712] text-white flex items-center justify-center p-4 font-mono relative">
      
      {/* Background Grid */}
      <div className="fixed inset-0 z-0 opacity-20 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      <div className="relative z-10 w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-wider">
            {isLogin ? 'ACCESS TERMINAL' : 'NEW AGENT REGISTRY'}
          </h1>
          <p className="text-xs text-slate-500 mt-2 tracking-[0.2em]">SECURE CONNECTION</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-400 text-xs text-center rounded">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Username (Only show if Signing Up) */}
          {!isLogin && (
            <div>
              <label className="text-xs text-cyan-500 block mb-1">CODENAME (USERNAME)</label>
              <input 
                name="username" 
                type="text" 
                placeholder="Agent_007"
                required={!isLogin}
                onChange={handleChange}
                className="w-full bg-black/50 border border-slate-700 rounded-lg p-3 text-sm focus:border-cyan-500 outline-none text-white transition"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label className="text-xs text-cyan-500 block mb-1">EMAIL FREQUENCY</label>
            <input 
              name="email" 
              type="email" 
              placeholder="agent@network.com"
              required
              onChange={handleChange}
              className="w-full bg-black/50 border border-slate-700 rounded-lg p-3 text-sm focus:border-cyan-500 outline-none text-white transition"
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-xs text-cyan-500 block mb-1">ACCESS KEY (PASSWORD)</label>
            <input 
              name="password" 
              type="password" 
              placeholder="••••••••"
              required
              onChange={handleChange}
              className="w-full bg-black/50 border border-slate-700 rounded-lg p-3 text-sm focus:border-cyan-500 outline-none text-white transition"
            />
          </div>

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 mt-6 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 font-bold text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] hover:scale-[1.02] transition-all"
          >
            {loading ? 'AUTHENTICATING...' : (isLogin ? 'ENTER NETWORK' : 'INITIATE REGISTRATION')}
          </button>
        </form>

        {/* Toggle Switch */}
        <div className="mt-6 text-center text-xs text-slate-400">
          {isLogin ? "Need a clearance code?" : "Already have access?"} 
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="ml-2 text-cyan-400 hover:text-cyan-300 font-bold underline decoration-cyan-500/50"
          >
            {isLogin ? "Register Here" : "Login Here"}
          </button>
        </div>

      </div>
    </main>
  );
}