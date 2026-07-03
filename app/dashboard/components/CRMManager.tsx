'use client';

import { useEffect, useState } from 'react';
import { getCRMVictims, getCRMStats, addCRMVictim, aiScoreVictim } from '@/lib/api';
import toast from 'react-hot-toast';
import type { Victim } from '../types';

export function CRMManager() {
  const [victims, setVictims] = useState<Victim[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchData = async () => {
    try {
      const [victimsRes, statsRes] = await Promise.all([
        getCRMVictims(),
        getCRMStats(),
      ]);
      setVictims(victimsRes.data.victims || []);
      setStats(statsRes.data.stats || {});
    } catch (error) {
      console.error('Failed to fetch CRM data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleScore = async (victim: Victim) => {
    try {
      const res = await aiScoreVictim({
        industry: victim.industry,
        role: victim.role,
        emailHistory: victim.conversations,
        pastResponses: victim.status,
      });
      toast.success(`Score: ${res.data.result.score}/10`);
    } catch (error) {
      toast.error('AI scoring failed');
    }
  };

  const filteredVictims = victims.filter((v) =>
    v.email?.toLowerCase().includes(search.toLowerCase()) ||
    v.company?.toLowerCase().includes(search.toLowerCase()) ||
    v.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="glass p-8 text-center text-white/30">Loading CRM...</div>;
  }

  const statusColors: Record<string, string> = {
    new: 'badge-warning',
    active: 'badge-info',
    responded: 'badge-success',
    converted: 'badge-success',
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: stats.total || 0 },
          { label: 'New', value: stats.new || 0 },
          { label: 'Active', value: stats.active || 0 },
          { label: 'Responded', value: stats.responded || 0 },
          { label: 'Converted', value: stats.converted || 0 },
        ].map((s) => (
          <div key={s.label} className="glass p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{s.value}</div>
            <div className="text-xs text-white/40 uppercase tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-4 items-center glass p-4">
        <input
          type="text"
          placeholder="Search victims..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
        />
        <button onClick={fetchData} className="btn">🔄 Refresh</button>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">➕ Add Victim</button>
      </div>

      {/* Table */}
      <div className="glass overflow-x-auto p-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/40 border-b border-white/5">
              <th className="p-3">Email</th>
              <th className="p-3">Name</th>
              <th className="p-3">Company</th>
              <th className="p-3">Industry</th>
              <th className="p-3">Status</th>
              <th className="p-3">Score</th>
              <th className="p-3">Last Seen</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredVictims.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-white/30">No victims found</td>
              </tr>
            ) : (
              filteredVictims.map((victim) => (
                <tr key={victim.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="p-3 text-white/80">{victim.email || 'N/A'}</td>
                  <td className="p-3 text-white/60">{victim.name || 'N/A'}</td>
                  <td className="p-3 text-white/60">{victim.company || 'N/A'}</td>
                  <td className="p-3 text-white/40">{victim.industry || 'N/A'}</td>
                  <td className="p-3">
                    <span className={`badge ${statusColors[victim.status] || 'badge'}`}>
                      {victim.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`font-bold ${victim.score >= 7 ? 'text-red-400' : victim.score >= 4 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {victim.score}/10
                    </span>
                  </td>
                  <td className="p-3 text-white/40">
                    {new Date(victim.last_seen).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right space-x-1">
                    <button onClick={() => handleScore(victim)} className="action-btn">🎯 Score</button>
                    <button className="action-btn">📧 Email</button>
                    <button className="action-btn">👁️ View</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
