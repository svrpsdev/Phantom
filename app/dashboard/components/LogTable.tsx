'use client';

import { useEffect, useState } from 'react';
import { getLogs } from '@/lib/api';
import toast from 'react-hot-toast';

export function LogTable() {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await getLogs();
      setLogs(res.data || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  const filtered = logs.filter((log) =>
    log.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="glass p-8 text-center text-white/30">Loading logs...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center">
        <input
          type="text"
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
        />
        <button onClick={fetchLogs} className="btn">🔄 Refresh</button>
      </div>

      <div className="glass overflow-x-auto p-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/40 border-b border-white/5">
              <th className="p-3">File</th>
              <th className="p-3">Size</th>
              <th className="p-3">Modified</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-white/30">No logs found</td></tr>
            ) : (
              filtered.map((log) => (
                <tr key={log.name} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="p-3 text-white/80">{log.name}</td>
                  <td className="p-3 text-white/40">{(log.size / 1024).toFixed(1)} KB</td>
                  <td className="p-3 text-white/40">{new Date(log.modified).toLocaleString()}</td>
                  <td className="p-3">
                    <button className="action-btn" onClick={() => toast.info('View: ' + log.name)}>View</button>
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
