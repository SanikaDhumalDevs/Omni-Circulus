'use client';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for missing default Leaflet icons in Next.js
const iconUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png';

const defaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// A different color icon for the Seller (Red-ish filter)
const sellerIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function LogisticsMap({ buyerLat, buyerLng, distanceKm }) {
  // 1. Setup Buyer Position
  const buyerPos = [parseFloat(buyerLat), parseFloat(buyerLng)];

  // 2. Simulate Seller Position based on Distance (for demo visualization)
  // (In a real app, you would pass sellerLat/Lng from the DB)
  // Roughly: 1 deg lat is ~111km. So we shift latitude slightly based on distance.
  const offset = distanceKm / 111; 
  const sellerPos = [buyerPos[0] + offset, buyerPos[1] + (offset * 0.5)];

  const center = [
    (buyerPos[0] + sellerPos[0]) / 2,
    (buyerPos[1] + sellerPos[1]) / 2
  ];

  return (
    <div className="h-48 w-full rounded-xl overflow-hidden border-2 border-slate-700 shadow-lg relative z-0">
      <MapContainer center={center} zoom={10} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Buyer Marker */}
        <Marker position={buyerPos} icon={defaultIcon}>
          <Popup>📍 YOU (Buyer)</Popup>
        </Marker>

        {/* Seller Marker */}
        <Marker position={sellerPos} icon={sellerIcon}>
          <Popup>🏭 WAREHOUSE (Seller)</Popup>
        </Marker>

        {/* Route Line */}
        <Polyline positions={[buyerPos, sellerPos]} color="#06b6d4" dashArray="5, 10" />
      </MapContainer>
    </div>
  );
}