'use client';

import { useState } from 'react';
import { aiAnalyzeEmail, aiGenerateReply } from '@/lib/api';
import toast from 'react-hot-toast';

export function AIAnalyzer() {
  const [emailContent, setEmailContent] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [strategy, setStrategy] = useState('professional');
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!emailContent.trim()) {
      toast.error('Please enter email content');
      return;
    }
    setLoading(true);
    try {
      const res = await aiAnalyzeEmail(emailContent);
      setAnalysis(res.data.analysis);
      toast.success('Analysis complete');
    } catch (error) {
      toast.error('Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReply = async () => {
    if (!emailContent.trim()) {
      toast.error('Please enter email content');
      return;
    }
    setLoading(true);
    try {
      const res = await aiGenerateReply(emailContent, strategy);
      setReply(res.data.reply.reply || res.data.reply);
      toast.success('Reply generated');
    } catch (error) {
      toast.error('Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-4">
      <div className="glass p-6">
        <h3 className="text-lg font-medium text-white/70 mb-4">🤖 AI Email Analyzer</h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm text-white/40 block mb-1">Email Content</label>
            <textarea
              value={emailContent}
              onChange={(e) => setEmailContent(e.target.value)}
              placeholder="Paste email content here..."
              className="w-full h-40 bg-black/30 border border-white/10 rounded-lg p-3 text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <button onClick={handleAnalyze} disabled={loading} className="btn btn-primary">
              {loading ? '⏳ Analyzing...' : '🔍 Analyze'}
            </button>
            <button onClick={handleGenerateReply} disabled={loading} className="btn btn-success">
              {loading ? '⏳ Generating...' : '✍️ Generate Reply'}
            </button>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="professional">Professional</option>
              <option value="urgent">Urgent</option>
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
            </select>
          </div>
        </div>
      </div>

      {analysis && (
        <div className="glass p-6">
          <h4 className="text-sm font-medium text-white/60 mb-3">📊 Analysis Results</h4>
          <pre className="bg-black/30 p-4 rounded-lg text-xs text-white/70 overflow-x-auto">
            {JSON.stringify(analysis, null, 2)}
          </pre>
        </div>
      )}

      {reply && (
        <div className="glass p-6">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-medium text-white/60">✍️ Generated Reply</h4>
            <button onClick={() => copyToClipboard(reply)} className="btn btn-sm">
              📋 Copy
            </button>
          </div>
          <div className="bg-black/30 p-4 rounded-lg text-white/80 whitespace-pre-wrap">
            {reply}
          </div>
        </div>
      )}
    </div>
  );
}
