'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GivePage() {
  const router = useRouter();
  
  // --- ✅ BACKEND CONNECTION ---
  // This is used for submitting the final form to your Database on Render
  const API_BASE_URL = 'https://omni-circulus-backend.onrender.com';

  // User State for Authentication
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(false); // For form submission
  const [analyzing, setAnalyzing] = useState(false); // For AI Agent
  const [locating, setLocating] = useState(false); // For GPS Location
  
  // State for the image preview
  const [imagePreview, setImagePreview] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    type: 'Wood',
    quantity: 1,
    cost: '', 
    location: '', 
    description: ''
  });

  // Auth Check on Page Load
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      alert("⚠️ Access Denied. Please Login first.");
      router.push('/auth');
    } else {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // --- GPS LOCATION HANDLER ---
  const handleLocationClick = () => {
    if (!navigator.geolocation) {
      alert("⚠️ Geolocation is not supported by your browser");
      return;
    }

    setLocating(true);

    const options = {
      enableHighAccuracy: true, 
      timeout: 10000,           
      maximumAge: 0             
    };

    const success = async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Reverse Geocoding
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
          );
          const data = await response.json();
          
          if (data.address) {
            const { road, house_number, suburb, city, town, village, county, state, postcode } = data.address;
            const mainLocality = city || town || village || county || '';
            
            const parts = [
              house_number, road, suburb, mainLocality, state, postcode
            ].filter(Boolean); 
            
            const formattedAddress = parts.join(', ');
            setFormData((prev) => ({ ...prev, location: formattedAddress }));
          } else {
            setFormData((prev) => ({ ...prev, location: `${latitude}, ${longitude}` }));
          }

        } catch (error) {
          console.error("Geocoding failed", error);
          setFormData((prev) => ({ ...prev, location: `${latitude}, ${longitude}` }));
        } finally {
          setLocating(false);
        }
    };

    const error = (err) => {
        setLocating(false);
        console.warn(`GPS Error (${err.code}): ${err.message}`);
        
        let errorMessage = "Unable to retrieve location.";
        switch(err.code) {
            case 1: errorMessage = "⚠️ Location permission denied."; break;
            case 2: errorMessage = "⚠️ Location unavailable."; break;
            case 3: errorMessage = "⚠️ Request timed out."; break;
        }
        alert(errorMessage);
    };

    navigator.geolocation.getCurrentPosition(success, error, options);
  };

  // Handle Image Selection & Trigger AI
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("⚠️ Image is too large! Please upload a photo under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result;
      setImagePreview(base64String);
      await analyzeImageWithAI(base64String);
    };
    reader.readAsDataURL(file);
  };

  // --- 🔥 UPDATED AI AGENT FUNCTION ---
  // ✅ FIX: Points to your Internal Next.js API (Vercel) instead of Render Backend
  const analyzeImageWithAI = async (base64Image) => {
    setAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Agent failed to respond');
      }

      if (data.valid === false) {
          alert(`🚫 INVALID RESOURCE DETECTED\n\nSystem Analysis: ${data.reason}\n\nProtocol Violation: This platform is for Industrial/Construction resources only.`);
          setImagePreview(null);
          setFormData(prev => ({...prev, title: '', type: 'Wood', description: ''}));
          setAnalyzing(false);
          return;
      }
      
      setFormData(prev => ({
        ...prev,
        title: data.title || '',
        type: data.type || 'Other',
        description: data.description || ''
      }));
      
    } catch (error) {
      console.error("AI Error:", error);
      alert(`⚠️ AI Analysis failed. Please enter details manually.`);
      setFormData(prev => ({...prev, title: "Scanned Item", description: " AI Analysis Failed. Please describe manually."}));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- SUBMIT FUNCTION ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!user) {
        alert("Session Expired. Please Login.");
        router.push('/auth');
        return;
    }

    if (!formData.cost || formData.cost <= 0) {
        alert("Please enter a valid estimated price.");
        setLoading(false);
        return;
    }

    const resourceData = { 
        ...formData,
        cost: Number(formData.cost), 
        ownerEmail: user.email 
    };

    if (imagePreview) {
        resourceData.imageUrl = imagePreview;
    }

    try {
      // ✅ This correctly points to Render to save the data
      const response = await fetch(`${API_BASE_URL}/api/resources/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resourceData),
      });

      if (response.ok) {
        alert('✅ Resource Successfully Logged into Network');
        router.push('/'); 
      } else {
        alert('❌ Error logging resource to database.');
      }
    } catch (error) {
      console.error('Network Error:', error);
      alert('❌ System Offline. Check Backend Connection.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="min-h-screen bg-[#020617] text-white flex items-center justify-center">Verifying Identity...</div>;

  return (
    <main className="min-h-screen w-full bg-[#020617] text-white flex items-center justify-center p-4">
      <div className="fixed inset-0 z-0 opacity-20 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      <div className="relative z-10 w-full max-w-lg bg-slate-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-wider text-white">UPLOAD RESOURCE</h2>
          <p className="text-slate-400 text-xs uppercase tracking-[0.2em] mt-2">
             User: {user.email}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* AI IMAGE UPLOADER */}
          <div className="border-2 border-dashed border-slate-700 rounded-xl p-4 text-center hover:border-cyan-500 transition-colors relative group">
            <input 
              type="file" 
              accept="image/*"
              onChange={handleImageUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            
            {analyzing ? (
              <div className="text-cyan-400 animate-pulse font-mono text-sm">
                SCANNING OBJECT STRUCTURE...
              </div>
            ) : imagePreview ? (
              <img src={imagePreview} alt="Preview" className="h-32 mx-auto rounded-lg object-cover shadow-[0_0_15px_rgba(6,182,212,0.3)]" />
            ) : (
              <div className="text-slate-400 text-sm">
                <span className="text-cyan-400 font-bold block text-lg mb-1">+ SCAN ITEM</span>
                Drop image to Auto-Detect
              </div>
            )}
          </div>

          {/* Title Input */}
          <div>
            <label className="block text-xs text-cyan-400 font-mono mb-2 uppercase">Resource Name</label>
            <input 
              name="title" 
              value={formData.title}
              required
              placeholder="e.g. Oak Wood Planks" 
              onChange={handleChange}
              className={`w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors ${analyzing ? 'animate-pulse bg-slate-800' : ''}`}
            />
          </div>

          {/* Type & Quantity Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-cyan-400 font-mono mb-2 uppercase">Material Type</label>
              <select 
                name="type" 
                value={formData.type}
                onChange={handleChange}
                className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="Wood">Wood</option>
                <option value="Metal">Metal</option>
                <option value="Plastic">Plastic</option>
                <option value="Brick">Brick</option>
                <option value="Electronics">Electronics</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-cyan-400 font-mono mb-2 uppercase">Quantity</label>
              <input 
                name="quantity" 
                type="number" 
                min="1"
                value={formData.quantity}
                onChange={handleChange}
                className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* PRICE INPUT */}
          <div>
            <label className="block text-xs text-green-400 font-mono mb-2 uppercase">Asking Price ($)</label>
            <input 
              name="cost" 
              type="number" 
              min="0"
              required
              placeholder="0.00"
              value={formData.cost}
              onChange={handleChange}
              className="w-full bg-slate-950/50 border border-green-700/50 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-green-500 transition-colors"
            />
          </div>

          {/* Location Input (GPS Enabled) */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs text-cyan-400 font-mono uppercase">Location</label>
              
              <button 
                type="button" 
                onClick={handleLocationClick}
                disabled={locating}
                className="text-xs flex items-center gap-1 text-cyan-500 hover:text-cyan-300 transition-colors disabled:opacity-50"
              >
                {locating ? (
                  <span className="animate-pulse">LOCATING...</span>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                    USE GPS
                  </>
                )}
              </button>
            </div>

            <input 
              name="location" 
              required
              value={formData.location}
              placeholder="Click 'USE GPS' or type manually" 
              onChange={handleChange}
              className={`w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors ${locating ? 'animate-pulse border-cyan-500' : ''}`}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-slate-500 font-mono mb-2 uppercase">Details (AI Generated)</label>
            <textarea 
              name="description" 
              rows="3"
              value={formData.description}
              placeholder="Condition, dimensions..."
              onChange={handleChange}
              className={`w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors ${analyzing ? 'animate-pulse bg-slate-800' : ''}`}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading || analyzing}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 font-bold text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'PROCESSING...' : 'INITIALIZE AGENT'}
          </button>
        </form>
      </div>
    </main>
  );
}