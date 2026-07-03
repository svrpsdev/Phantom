'use client';

import { useEffect, useState } from 'react';
import { getVisits } from '@/lib/api';

export function VictimMap() {
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVisits()
      .then((res) => {
        setVisits(res.data.visits || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="glass p-8 text-center text-white/30">Loading map...</div>;
  }

  return (
    <div className="glass p-6">
      <h3 className="text-lg font-medium text-white/70 mb-4">🗺️ Victim Locations</h3>
      <div className="bg-black/30 rounded-lg p-8 text-center text-white/40">
        <p>🌍 {visits.length} visits recorded</p>
        <p className="text-sm mt-2">Interactive map with pins coming soon</p>
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {visits.slice(0, 20).map((v, i) => (
            <span key={i} className="text-xs bg-white/5 px-2 py-1 rounded">
              {v.countryCode || 'UN'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
