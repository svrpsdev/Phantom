'use client';

import { useState } from 'react';
import { sendEmail, getEmailConfig, rotateEmailDomain } from '@/lib/api';
import toast from 'react-hot-toast';

export function EmailSender() {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [from, setFrom] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchConfig = async () => {
    try {
      const res = await getEmailConfig();
      setConfig(res.data);
    } catch (error) {
      console.error('Failed to fetch config');
    }
  };

  const handleSend = async () => {
    if (!to || !subject || !body) {
      toast.error('Please fill all fields');
      return;
    }
    setLoading(true);
    try {
      const res = await sendEmail(to, subject, body, from || undefined);
      if (res.data.success) {
        toast.success('Email sent successfully');
        setTo('');
        setSubject('');
        setBody('');
      } else {
        toast.error(res.data.error || 'Send failed');
      }
    } catch (error) {
      toast.error('Send failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRotateDomain = async () => {
    try {
      const res = await rotateEmailDomain();
      toast.success(`Domain rotated: ${res.data.domain}`);
      fetchConfig();
    } catch (error) {
      toast.error('Rotation failed');
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  return (
    <div className="glass p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white/70">📧 Send Email</h3>
        <div className="flex gap-2">
          <button onClick={handleRotateDomain} className="btn btn-sm">🔄 Rotate Domain</button>
          <button onClick={fetchConfig} className="btn btn-sm">ℹ️ Config</button>
        </div>
      </div>

      {config && (
        <div className="text-xs text-white/40 bg-black/30 p-3 rounded-lg">
          Domains: {config.domains?.join(', ') || 'None'} | 
          SMTP Servers: {config.transporterCount || 0}
        </div>
      )}

      <div className="space-y-3">
        <input
          type="text"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="From (optional)"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
        />
        <input
          type="text"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="To (email)"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
        />
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Email body (HTML supported)"
          className="w-full h-32 bg-black/30 border border-white/10 rounded-lg p-3 text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
        />
        <button onClick={handleSend} disabled={loading} className="btn btn-primary w-full">
          {loading ? '⏳ Sending...' : '📤 Send Email'}
        </button>
      </div>
    </div>
  );
}
